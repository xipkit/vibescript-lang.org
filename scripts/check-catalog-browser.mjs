import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Integers are compared exactly, so they are parsed as BigInt rather than through floats.
// Other integral numbers such as 2.0 compare by value, matching the static example verifier.
const parse = (text) => JSON.parse(text, (key, value, context) => {
  if (typeof value !== "number" || !Number.isInteger(value)) return value;
  return /^-?\d+$/.test(context.source) ? BigInt(context.source) : BigInt(value);
});
const expected = parse(await readFile(new URL("static-examples/expected.json", import.meta.url), "utf8")).examples;
const moduleName = process.env.PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(moduleName.startsWith("/") ? pathToFileURL(moduleName).href : moduleName);
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const base = process.env.SITE_URL || "http://127.0.0.1:8081";
const page = await browser.newPage();
const failures = [];
const results = [];
try {
  await page.goto(base + "/examples/");
  const links = await page.locator("[data-catalog-grid] a.example-card").evaluateAll((cards) => cards.map((card) => card.getAttribute("href")));
  assert.equal(links.length, 203);
  for (const link of links) {
    await page.goto(base + link);
    await page.locator("[data-run-button]").click();
    await page.waitForFunction(() => !document.querySelector("[data-run-button]").disabled, null, { timeout: 25000 });
    const output = await page.locator("[data-run-output]").innerText();
    const source = (await page.locator(".code-header span").innerText()).trim();
    results.push({ link, source, output });
    const [, result] = output.split("Result\n");
    if (!(source in expected)) failures.push({ link, source, output, reason: "no expected result" });
    else if (result === undefined) failures.push({ link, source, output, reason: "no result" });
    else {
      try {
        assert.deepStrictEqual(parse(result.replace(/\n\n[\d,]+ steps · [^\n]*\s*$/, "")), expected[source].value);
      } catch (error) {
        failures.push({ link, source, output, reason: error.message });
      }
    }
    if (results.length % 25 === 0) console.log(`${results.length}/${links.length} examples; ${failures.length} failures`);
  }
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/catalog-report.json", JSON.stringify({ count: results.length, failures, results }, null, 2) + "\n");
  assert.deepEqual(failures, [], "catalog examples failed in the real browser runner");
  console.log(`All ${results.length} catalog examples ran in the browser.`);
} finally {
  await browser.close();
}
