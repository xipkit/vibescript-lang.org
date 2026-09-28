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

## Integration inputs

The website branches are integrated **examples first**. No `.vibe` files were
changed on `mgomes/static-site`. Browser verification used a temporary Hugo config
identical to `hugo.toml` except for the example asset mount, which read
`/tmp/site-examples/internal/catalog/content` from the completed
`mgomes/static-examples` branch (`9d73818`). Ordinary `hugo` on this branch builds
cleanly, but its pre-migration examples still need that branch integrated before
Rust execution works across the catalog. Do not deploy this branch alone.

Runtime: clean `mgomes/playground` commit
`1875d45b0e6f3a55a304299de03b865ef1017d32`, with SHA-256 and build provenance recorded
in `data/playground.json` and `data/playground-build.json`. No runtime stub remains.
Reference: `187e0455c92cef44ed1cfd0bf6aa9d1a43e82e65`.

To repeat integration verification before merging branches, copy `hugo.toml` to
`/tmp/site-static-integration.toml`, replace only the `internal/catalog/content`
mount source with the migrated checkout's absolute path, then run:

```sh
hugo --config /tmp/site-static-integration.toml --gc --minify --cleanDestinationDir
python3 scripts/check-site.py
# With scripts/serve.py running, and Playwright configured per README:
node scripts/check-browser.mjs
```

After integration, use `just check` and the same browser test without an override.
The full browser report and screenshots are written to ignored `test-results/`.
Tests do not deploy or call any messaging service.

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
