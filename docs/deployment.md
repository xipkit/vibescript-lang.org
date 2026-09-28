# Cloudflare Pages

This repository builds a static site. Cloudflare Pages replaces the Go service
on Miren/Vultr; Vibescript executes only in the visitor's browser. No deployment
was performed as part of this migration.

## Build configuration

Set these in the Pages dashboard:

| Setting | Value |
| --- | --- |
| Framework | Hugo |
| Hugo version environment variable | `HUGO_VERSION=0.164.0` |
| Build command | `hugo --gc --minify` |
| Build output directory | `public` |
| Root directory | Repository root |

Use Hugo **0.164.0 extended** (the local verified version). Content, reference
snapshots, WASM, and dependencies are committed. The build requires no npm, Rust,
Go toolchain, server secrets, or network access to fetch runtime code.

Review a Pages preview before switching the production domain. Verify the home
page, `/examples`, an original example URL, `/reference`, `/reference#app-services`,
404 status, Run/Edit/Stop/Format, and the WASM response headers. Directory routes
may gain a trailing slash; their original URLs continue to resolve. `_redirects`
handles `/favicon.ico` and the retired `/healthz` URL. The old POST execution API
is retired, with no equivalent server endpoint.

## Host redirects

Attach `vibescript-lang.org` as the Pages custom domain. In the **Cloudflare
 dashboard**, create redirect rules for both:

- `www.vibescript-lang.org` → `https://vibescript-lang.org`
- `vibescript.mauriciogomes.com` → `https://vibescript-lang.org`

Use permanent redirects (301), preserve the path and query string, and ensure
both source hosts have proxied DNS and valid TLS. Configure the legacy hostname
in its own Cloudflare zone where needed. Pages `_redirects` cannot perform host
redirects; these rules belong in the dashboard, not that file.

After a successful cutover and the chosen rollback window, retire the Miren app
and Vultr server and remove their stale DNS records. Until then, keep rollback
available. Nothing in the build or preview scripts changes infrastructure.

## Security and caching

`static/_headers` supplies a CSP with no inline scripts, inline styles, external
origins, objects, frames, or form submissions. `script-src 'self' 'wasm-unsafe-eval'`
permits WebAssembly; `worker-src 'self'` permits the dedicated Worker. Responses
also deny framing and MIME sniffing and disable camera, microphone and location.

Hugo fingerprints CSS, JavaScript, and the bundled WASI shim beneath `/assets/`.
The WASM filename includes its full SHA-256 beneath `/wasm/`. These paths receive
`Cache-Control: public, max-age=31536000, immutable`. WASM responses explicitly use
`Content-Type: application/wasm`. HTML and unhashed static assets use Pages'
normal caching. Do not put mutable files under the immutable paths.

The preview server applies the same security headers for browser tests. Check
production headers again after deployment; a local test cannot verify dashboard
rules or CDN behavior. Pages headers and redirects are documented in
[Cloudflare headers](https://developers.cloudflare.com/pages/configuration/headers/)
and [serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/).
