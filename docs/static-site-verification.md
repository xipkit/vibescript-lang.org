# Static-site verification

Verified on 2026-09-28 with Hugo 0.164.0 extended and headless Chromium 145 on macOS.

- `just check`: clean minified Hugo build; 250 HTML pages; all 203 old example
  URLs; local page/asset links; all legacy reference anchors; no inline script,
  event handler, or style attributes; matching WASM hash and clean source manifest.
- Pinned reference regeneration produced byte-for-byte identical output.
- `scripts/check-browser.mjs`: home and example execution, SMS and email previews,
  debounced type errors and fix suggestions with positions, Format, Reset, exact
  integers above JavaScript's safe range, output escaped as text, Stop after WASI
  starts an infinite loop, step exhaustion, and successful runs after stopping.
- `scripts/check-catalog-browser.mjs`: all 203 migrated examples executed successfully
  in the real browser Worker, including money/duration display conversion and
  sample context/database/job/event services.
- The independent five-second deadline was tested with a deliberately stalled
  Worker. All language execution tests used the real WASI module.
- No runtime fetch before Run. WASM MIME type and immutable caching headers passed.
  No browser JavaScript errors or CSP violations. Catalog category/tag filters,
  reference, and HTTP 404 passed. Home, catalog, example/editor, reference, and 404
  fit a 390px phone viewport without horizontal overflow. Desktop screenshots use
  1440px width. The light-theme appearance was visually reviewed.

## Integration

The example migration (`mgomes/static-examples`) is integrated beneath these
commits, so `hugo` builds the migrated catalog directly. The runtime and the
reference are pinned to Rust `master` after the playground runner merged; see
`data/playground.json`, `data/playground-build.json` and `data/reference.json`.
After repinning, `just check`, `scripts/check-static-examples.py`,
`scripts/check-browser.mjs` and `scripts/check-catalog-browser.mjs` all passed
again.

## Page weights

Fresh browser contexts against the minified static build, served locally without
HTTP compression. Counts sum response bodies, including Worker requests; they
exclude HTTP headers. These are measured browser payloads, not a production CDN
transfer estimate.

| Page | Before Run | After first Run | Added on first Run |
| --- | ---: | ---: | ---: |
| Home | 158,440 bytes | 4,000,488 bytes | 3,842,048 bytes |
| SMS example/editor | 148,689 bytes | 3,990,737 bytes | 3,842,048 bytes |

The added bytes are the 20,729-byte Worker/shim bundle and 3,821,319-byte WASM.
The upstream manifest reports a 904,926-byte Brotli artifact; this site ships raw
WASM for Pages to negotiate compression. Actual compressed transfer size and
cross-navigation cache behavior still need checking on the deployed CDN.

## Owner follow-up

Integrate the migrated examples before the static-site commits, select the Pages
production branch, and configure both host redirects in the Cloudflare dashboard.
Choose the production cutover and rollback window before retiring Miren/Vultr.
No push, PR, deployment, DNS change, or infrastructure deletion was performed.
