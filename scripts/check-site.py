#!/usr/bin/env python3
"""Check generated routes, local links, fragments, assets, and executable markup."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


class Page(HTMLParser):
    def __init__(self, content):
        super().__init__()
        self.links = []
        self.ids = set()
        self.issues = []
        self.feed(content)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            if attrs['id'] in self.ids:
                self.issues.append('duplicate ID: ' + attrs['id'])
            self.ids.add(attrs['id'])
        if tag == 'script' and 'src' not in attrs:
            self.issues.append('inline script')
        if any(name.startswith('on') or name == 'style' for name in attrs):
            self.issues.append('inline event or style attribute')
        for name in ('href', 'src'):
            if name in attrs:
                self.links.append(attrs[name])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', nargs='?', type=Path, default=ROOT / 'public')
    args = parser.parse_args()
    public = args.directory.resolve()
    pages = {p.relative_to(public).as_posix(): Page(p.read_text()) for p in public.rglob('*.html')}
    errors = []
    manifest = json.loads((ROOT / 'data/playground.json').read_text())
    wasm = public / manifest['url'].lstrip('/')
    if not wasm.exists() or hashlib.sha256(wasm.read_bytes()).hexdigest() != manifest['sha256']:
        errors.append('missing or mismatched playground artifact')
    provenance = json.loads((ROOT / 'data/playground-build.json').read_text())
    if provenance['rust_commit'] != manifest['revision'] or provenance['dirty']:
        errors.append('playground source provenance mismatch')
    for name, page in pages.items():
        errors.extend(f'{name}: {issue}' for issue in page.issues)
        for link in page.links:
            parsed = urlsplit(link)
            if parsed.scheme or parsed.netloc or (not parsed.path and not parsed.fragment):
                continue
            if parsed.path.startswith('/'):
                target = public / unquote(parsed.path).lstrip('/')
            else:
                target = public / Path(name).parent / unquote(parsed.path)
            if not parsed.path:
                target = public / name
            if target.is_dir():
                target /= 'index.html'
            if not target.exists():
                errors.append(f'{name}: missing {link}')
                continue
            relative = target.relative_to(public).as_posix()
            if parsed.fragment and relative in pages and unquote(parsed.fragment) not in pages[relative].ids:
                errors.append(f'{name}: missing fragment {link}')
    examples = list((ROOT / 'internal/catalog/content').rglob('*.vibe'))
    for example in examples:
        origin, path = example.relative_to(ROOT / 'internal/catalog/content').as_posix().split('/', 1)
        slug = path.removesuffix('.vibe').lower().replace('/', '-').replace('_', '-').replace('.', '-')
        if origin != 'upstream':
            slug = origin + '-' + slug
        if f'examples/{slug}/index.html' not in pages:
            errors.append('lost example URL: ' + slug)
    for anchor in json.loads((ROOT / 'data/legacy_reference_anchors.json').read_text()):
        if anchor not in pages['reference/index.html'].ids:
            errors.append('lost reference fragment: ' + anchor)
    for name in ('index.html', 'examples/index.html', 'reference/index.html', '404.html'):
        if name not in pages:
            errors.append('missing page: ' + name)
    if errors:
        raise SystemExit('\n'.join(errors))
    print(f'Checked {len(pages)} pages, {len(examples)} preserved example URLs, local links, legacy fragments, and CSP-compatible markup.')


if __name__ == '__main__':
    main()
