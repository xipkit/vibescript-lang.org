# vibescript-lang.org

The Vibescript website, built with **Hugo 0.164.0 extended** and hosted as static
files on Cloudflare Pages. Examples run in a Web Worker using the Rust WASI
playground. Code never goes to a server. Visitors can edit, check, format, reset,
and stop programs; SMS and email capabilities return previews without sending messages.

```sh
just build       # hugo --gc --minify
just run         # preview the static output and Pages security headers on :8081
just check       # build, preserved URLs, links, fragments, CSP markup
```

The build needs only Hugo. The preview and maintenance scripts use Python 3.
There is no Go server, npm build, API endpoint, database, or runtime CDN dependency.

## Content and assets

- `content/examples/_content.gotmpl` reads `.vibe` files at their existing
  `internal/catalog/content/` paths through a Hugo asset mount. Metadata headers
  drive titles, categories, difficulty, tags, and featured ordering. The old
  path-based slugs are preserved. Add or change an example there; `hugo` picks it up.
- `layouts/` and `assets/` retain the site's design. Fonts, logos, icons, Open Graph
  images, and the optional sound module retain their `/static/` URLs.
- `content/reference/` is a committed snapshot of the Rust language guide, its
  supporting guides, and builtin signatures. See [reference updates](docs/reference.md).
- `assets/runner-worker.js` owns WASI instantiation. `assets/runner.js` owns the
  editor, debounce, cancellation, and wall-clock timers. The textarea requires no
  editor package. Static code snippets retain the small existing highlighter.
- `static/wasm/` contains the pinned playground module; `data/playground.json`
  records its source revision and SHA-256. See [the runner](docs/browser-runner.md).

## Browser verification

Use an installed Playwright package and Chromium, or install Playwright into an
external tools directory. This is test tooling only, not part of the site build.
With `just run` running:

```sh
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs \
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium \
node scripts/check-browser.mjs
```

The test runs real WASM, checks editing and diagnostics, Format and Reset,
Stop and deadline cancellation, preview capabilities, catalog filters, CSP,
phone layout, and lazy loading. It writes screenshots and measured page weights
to `test-results/`. After integrating the migrated examples, run
`node scripts/check-catalog-browser.mjs` with the same Playwright environment to
execute the entire catalog through the real browser runner and compare each
result with `scripts/static-examples/expected.json`.

See [deployment](docs/deployment.md) for Cloudflare Pages configuration and the
host redirects. Building or testing this repository does not deploy it.
