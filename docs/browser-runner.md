# Browser playground

A native textarea keeps the editor small and accessible. Run lazily starts a
module Worker, downloads the content-hashed WASI artifact, and compiles it. Each
operation gets a fresh WASI instance and in-memory stdin/stdout/stderr; the Worker
reuses the compiled module between operations. No filesystem directories or
network capabilities are exposed to Vibescript.

The site sends JSON using the pinned [playground protocol](playground-protocol.md).
Every request includes 10,000,000 steps, 16 MiB tracked memory, and 128 call frames.
The Worker enforces these values rather than accepting arbitrary caller limits.
Compilation and execution also have a five-second wall deadline; initial download
and instantiation have a 20-second deadline. Stop terminates the Worker immediately.
After Stop or timeout, Run starts a fresh Worker and reuses the browser's cached
WASM download. Source is limited to 512 KiB, requests to 1 MiB, and protocol output
to 2 MiB (the runner also enforces its own output limits).

The runtime is deliberately not fetched on page load or first keystroke. After
first Run, edits are checked after 400 ms without input. Diagnostics and their
fix suggestions are displayed as text, with one-based line and column positions.
Format uses the runner's format operation and is enabled after the runtime loads.
Reset restores the original source. Ctrl/Command+Enter runs; Tab inserts two spaces.
Output, results, errors, and diagnostics use `textContent`, never HTML.

Both preview capabilities are available for edited code:

- `sms.send(to: string, body: string)` returns `{ to, body, status: "preview" }`.
- `email.send(to: string, subject: string, body: string)` returns
  `{ to, subject, body, status: "preview" }`.

These are typed preview descriptors processed inside the WASI runner. They have
no credentials, service clients, or messaging side effects. Examples declaring
`# uses: ctx`, `db`, `jobs`, or `events` get the matching inert Vibescript fixtures
from `assets/previews/`, copied from the examples migration's verification fixtures.
They return sample data and preview records, never perform I/O. The page preserves
that metadata even though its editor omits the leading metadata comments.

For named `run` entries, an appended helper converts money, durations, timestamps,
and symbols to strings recursively, matching the old site's display export. It
preserves exact integer tokens. The helper uses names absent from the user's
source and is never inserted into the editor or formatter output. Top-level
programs can return JSON directly; convert non-JSON values with `to_s`.

## Updating the module

Build a clean, reviewed commit of `mgomes/playground` in the Rust repository using
its `scripts/build-playground` instructions, with large outputs on the external
drive. On a shared 16 GB Mac, use three Cargo jobs; the pinned upstream script
currently hardcodes four, so set that locally to three for a maintenance build
and commit that build-script change before producing a clean release manifest. Then import its artifact:

```sh
python3 scripts/sync-playground.py \
  --repo /path/to/clean/rust/checkout \
  --revision FULL_PLAYGROUND_COMMIT \
  --wasm /path/to/target/playground/playground.wasm
hugo --cleanDestinationDir
```

The importer verifies a clean, matching `manifest.json` beside the artifact,
validates the WASM header, records its SHA-256, vendors the protocol
from the exact source commit, and removes superseded modules. Build provenance
must match the supplied revision; do not label an artifact built from uncommitted
sources with a clean commit. Commit the WASM, manifest, and protocol together.
Run `scripts/check-browser.mjs` against the built site before updating production.

The shim is the MIT-or-Apache-2.0 `browser_wasi_shim` 0.4.2 distribution,
used under MIT, with only missing final newlines added. Its licenses, tarball integrity, and source are recorded in
[`assets/vendor/browser_wasi_shim/README.md`](../assets/vendor/browser_wasi_shim/README.md).
Hugo's built-in bundler resolves its local ES modules; no npm build is required.
