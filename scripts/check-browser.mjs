import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const moduleName = process.env.PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(moduleName.startsWith("/") ? pathToFileURL(moduleName).href : moduleName);
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const base = process.env.SITE_URL || "http://127.0.0.1:8081";
const artifacts = process.env.TEST_RESULTS || "test-results";
await mkdir(artifacts, { recursive: true });
const errors = [];
const report = { browser: browser.version(), base, weights: [], checks: [] };

async function setup() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    // The deliberate /missing-page visit logs a 404; HTTP/2 hosts omit the "Not Found" reason.
    if (message.type() === "error" && !message.location().url.endsWith("/missing-page")) errors.push(message.text());
  });
  return { context, page };
}

async function run(page) {
  await page.locator("[data-run-button]").click();
  await page.waitForFunction(() => !document.querySelector("[data-run-button]").disabled, null, { timeout: 25000 });
  return page.locator("[data-run-output]").innerText();
}

async function measured(path, name, expected) {
  const { context, page } = await setup();
  const responses = [];
  const pending = [];
  context.on("response", (response) => {
    pending.push((async () => {
      if (response.status() < 200 || response.status() >= 300) return;
      const body = await response.body();
      responses.push({ url: new URL(response.url()).pathname, bytes: body.length });
    })());
  });
  await page.goto(base + path);
  await page.waitForLoadState("networkidle");
  await Promise.all(pending);
  assert(!responses.some((r) => r.url.endsWith(".wasm")), "WASM fetched before Run");
  const before = responses.reduce((sum, r) => sum + r.bytes, 0);
  const output = await run(page);
  assert.match(output, /Result/, output);
  assert.match(output, expected, output);
  await page.waitForLoadState("networkidle");
  await Promise.all(pending);
  const after = responses.reduce((sum, r) => sum + r.bytes, 0);
  const wasm = responses.find((r) => r.url.endsWith(".wasm"));
  assert(wasm, "First Run must load real WASM");
  const wasmResponse = await context.request.get(base + wasm.url);
  assert.match(wasmResponse.headers()["content-type"], /application\/wasm/);
  assert.match(wasmResponse.headers()["cache-control"], /immutable/);
  report.weights.push({ page: path, initialBytes: before, afterFirstRunBytes: after, firstRunAddedBytes: after - before, wasmBytes: wasm.bytes, resources: responses });
  await page.screenshot({ path: `${artifacts}/${name}-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, path + " overflows phone viewport");
  await page.screenshot({ path: `${artifacts}/${name}-phone.png`, fullPage: true });
  await context.close();
}

try {
  await measured("/", "home", /Your trial ends in 2 days/);
  await measured("/examples/showcase-notifications-sms/", "example", /preview/);
  report.checks.push("home and example execution; no WASM before Run; hashed WASM MIME/cache headers; phone layouts");
  const { context, page } = await setup();
  await page.goto(base + "/examples/showcase-notifications-email/");
  const original = await page.locator("[data-source]").inputValue();
  assert.match(await run(page), /alex@example.com/, "email preview");
  const editor = page.locator("[data-source]");
  await editor.fill('value: int = "wrong"\n');
  await page.waitForFunction(() => /V0101/.test(document.querySelector("[data-diagnostics]").textContent));
  assert.match(await page.locator("[data-diagnostics]").innerText(), /1:\d+/, "diagnostic location");
  await editor.fill('items = [1, 2]\nitems.size\n');
  await page.waitForFunction(() => /Suggestion:/.test(document.querySelector("[data-diagnostics]").textContent));
  report.checks.push("debounced type errors, locations, and fix suggestions");
  await editor.fill('value= 41\nvalue+1');
  await page.waitForFunction(() => !document.querySelector("[data-format-button]").disabled);
  await page.locator("[data-format-button]").click();
  await page.waitForFunction(() => document.querySelector("[data-source]").value.endsWith("\n"));
  assert.match(await run(page), /Result\n42/);
  await editor.fill('2 ** 100');
  assert.match(await run(page), /1267650600228229401496703205376/, "large integers must be exact");
  await editor.fill('puts \'<img src=x onerror=alert(1)>\'\n"<script>alert(1)</script>"');
  const textOutput = await run(page);
  assert.match(textOutput, /<img src=x/);
  assert.equal(await page.locator("[data-run-output] img, [data-run-output] script").count(), 0);
  report.checks.push("Format, arbitrary code, exact large integers, output rendered only as text");
  await editor.fill('while true\n  1 + 1\nend');
  // Stop as soon as WASI starts, while the infinite loop executes off-thread.
  await page.evaluate(() => {
    const output = document.querySelector("[data-run-output]");
    const observer = new MutationObserver(() => {
      if (output.textContent === "Running…") {
        observer.disconnect();
        document.querySelector("[data-stop-button]").click();
      }
    });
    observer.observe(output, { childList: true });
  });
  await page.locator("[data-run-button]").click();
  await page.waitForFunction(() => document.querySelector("[data-run-output]").textContent === "Stopped.");
  assert.equal(await page.locator("[data-run-output]").innerText(), "Stopped.");
  await editor.fill('40 + 2');
  assert.match(await run(page), /Result\n42/);
  await editor.fill('while true\n  1 + 1\nend');
  assert.match(await run(page), /Steps|step quota|step limit/i, "infinite loop must exhaust steps");
  await page.locator("[data-reset-button]").click();
  assert.equal(await editor.inputValue(), original);
  assert.match(await run(page), /preview/);
  report.checks.push("infinite-loop Stop, quota exhaustion, recovery, and Reset");
  await context.close();

  // A nonresponsive Worker isolates the page's independent wall-clock guard.
  const deadline = await setup();
  await deadline.context.route(/runner-worker\.[a-f0-9]+\.js$/, (route) => route.fulfill({ contentType: "text/javascript", body: 'onmessage = ({data}) => { postMessage({id:data.id,started:true}); while(true) {} };' }));
  await deadline.page.goto(base + "/examples/showcase-notifications-sms/");
  const started = Date.now();
  assert.match(await run(deadline.page), /Stopped after 5 seconds/);
  assert(Date.now() - started < 8000, "wall-clock timeout did not terminate Worker promptly");
  await deadline.context.close();
  report.checks.push("independent five-second wall-clock timeout (deliberately stalled Worker)");

  const navigation = await setup();
  await navigation.page.setViewportSize({ width: 390, height: 844 });
  await navigation.page.goto(base + "/examples/?tag=sms");
  assert.equal(await navigation.page.locator("[data-catalog-grid] .example-card:visible").count(), 1);
  const total = await navigation.page.locator("[data-catalog-grid] .example-card").count();
  await navigation.page.getByRole("button", { name: /tag: sms/ }).click();
  assert.equal(await navigation.page.locator("[data-catalog-grid] .example-card:visible").count(), total);
  await navigation.page.getByRole("button", { name: /Vibescript Showcase/ }).click();
  assert(await navigation.page.locator("[data-catalog-grid] .example-card:visible").count() < total);
  for (const [path, name] of [["/examples/", "catalog"], ["/reference/", "reference"], ["/missing-page", "404"]]) {
    const response = await navigation.page.goto(base + path);
    assert.equal(response.status(), name === "404" ? 404 : 200);
    assert.equal(await navigation.page.evaluate(() => document.documentElement.scrollWidth), 390, path + " overflows");
    await navigation.page.screenshot({ path: `${artifacts}/${name}-phone.png`, fullPage: true });
  }
  await navigation.context.close();
  report.checks.push("catalog category/tag filters, reference and 404 at phone width");
  assert.deepEqual(errors, [], "browser errors or CSP violations");
  await writeFile(`${artifacts}/browser-report.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ weights: report.weights.map(({ resources, ...rest }) => rest), checks: report.checks }, null, 2));
} finally {
  await browser.close();
}
