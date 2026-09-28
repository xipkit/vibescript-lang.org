#!/usr/bin/env python3
"""Preview the built static site with its Cloudflare headers and redirects."""
import argparse
from fnmatch import fnmatch
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=Path('public'))
    parser.add_argument('--port', type=int, default=8081)
    args = parser.parse_args()
    root = args.directory.resolve()
    headers = []
    for line in (root / '_headers').read_text().splitlines():
        if not line or line.lstrip().startswith('#'):
            continue
        if not line.startswith(' '):
            headers.append((line, []))
        else:
            key, value = line.strip().split(':', 1)
            headers[-1][1].append((key, value.strip()))
    redirects = {}
    for line in (root / '_redirects').read_text().splitlines():
        if line and not line.startswith('#'):
            source, target, status = line.split()
            redirects[source] = (target, int(status))

    class Handler(SimpleHTTPRequestHandler):
        extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm'}

        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(root), **kw)

        def end_headers(self):
            for pattern, values in headers:
                if fnmatch(urlsplit(self.path).path, pattern):
                    for key, value in values:
                        if key.lower() != 'content-type':
                            self.send_header(key, value)
            super().end_headers()

        def do_GET(self):
            path = urlsplit(self.path).path
            if path in redirects:
                target, status = redirects[path]
                self.send_response(status)
                self.send_header('Location', target)
                self.end_headers()
            else:
                super().do_GET()

        def send_error(self, code, message=None, explain=None):
            if code == 404:
                content = (root / '404.html').read_bytes()
                self.send_response(404)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                if self.command != 'HEAD':
                    self.wfile.write(content)
            else:
                super().send_error(code, message, explain)

    print(f'Serving {root} at http://127.0.0.1:{args.port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
