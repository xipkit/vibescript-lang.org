import { WASI, File, OpenFile, ConsoleStdout } from "./vendor/browser_wasi_shim/dist/index.js";

const limits = Object.freeze({ steps: 10000000, memory_bytes: 16777216, recursion: 128 });
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let compiled;

async function module() {
  if (!compiled) {
    compiled = (async () => {
      const response = await fetch(WASM_URL);
      if (!response.ok) throw new Error(`Runtime download failed (${response.status}). Try Run again.`);
      return WebAssembly.compileStreaming(response);
    })().catch((error) => { compiled = null; throw error; });
  }
  return compiled;
}

function capture(maximum) {
  const chunks = [];
  let length = 0;
  return {
    fd: new ConsoleStdout((bytes) => {
      length += bytes.length;
      if (length > maximum) throw new Error("Runtime response exceeds its output limit.");
      chunks.push(bytes.slice());
    }),
    text() {
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return decoder.decode(bytes);
    },
  };
}

// Keep the result's original JSON tokens so large Vibescript integers stay exact.
function resultJSON(text) {
  let depth = 0;
  let key = false;
  let start = -1;
  for (const match of text.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]/g)) {
    const token = match[0];
    if (start >= 0 && depth === 1 && (token === "," || token === "}")) return text.slice(start, match.index).trim();
    if (key && token === ":") { start = match.index + 1; key = false; }
    if (start < 0 && depth === 1 && token === '"result"') key = true;
    if (token === "{" || token === "[") depth++;
    if (token === "}" || token === "]") depth--;
  }
  throw new Error("Runtime response is missing its result.");
}

self.onmessage = async ({ data }) => {
  const { id, op, source, entry, previews } = data;
  try {
    if (!["run", "check", "format"].includes(op)) throw new Error("Unknown playground operation.");
    if (typeof source !== "string" || encoder.encode(source).length > 524288) throw new Error("Source exceeds 512 KiB.");
    const capability = (name, fields) => ({
      name,
      members: [{ name: "send", behavior: "preview", signature: {
        params: fields.map((name) => ({ name, type: "string" })),
        result: `{ ${[...fields, "status"].map((name) => `${name}: string`).join(", ")} }`,
      } }],
    });
    let program = source;
    if (op !== "format") {
      for (const name of new Set((previews || "").split(",").map((name) => name.trim()))) {
        if (["ctx", "db", "jobs", "events"].includes(name)) program += "\n" + PREVIEW_SOURCES[name];
      }
    }
    const request = { op, source: program, limits, args: [], capabilities: [capability("sms", ["to", "body"]), capability("email", ["to", "subject", "body"])] };
    if (op === "run" && entry === "run") {
      let prefix = "__site";
      while (program.includes(prefix)) prefix += "_";
      request.source += "\n" + PREVIEW_SOURCES.export.replaceAll("__site", prefix);
      request.source += `\ndef ${prefix}_run -> any\n  ${prefix}_export(run)\nend\n`;
      request.entry = `${prefix}_run`;
    }
    const input = encoder.encode(JSON.stringify(request));
    if (input.length > 1048576) throw new Error("Request exceeds 1 MiB.");
    const stdout = capture(2097152);
    const stderr = capture(65536);
    const wasi = new WASI(["playground"], [], [new OpenFile(new File(input)), stdout.fd, stderr.fd]);
    const instance = await WebAssembly.instantiate(await module(), { wasi_snapshot_preview1: wasi.wasiImport });
    self.postMessage({ id, started: true });
    const exit = wasi.start(instance);
    if (exit !== 0) throw new Error(stderr.text() || `Runtime exited with status ${exit}.`);
    const text = stdout.text();
    const response = JSON.parse(text);
    response.result_text = resultJSON(text);
    self.postMessage({ id, response });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
