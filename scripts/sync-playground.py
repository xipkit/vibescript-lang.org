#!/usr/bin/env python3
"""Vendor a reviewed playground artifact with its source revision and content hash."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--wasm', type=Path, required=True)
    args = parser.parse_args()
    revision = subprocess.check_output(['git', '-C', str(args.repo), 'rev-parse', args.revision + '^{commit}'], text=True).strip()
    protocol = subprocess.check_output(['git', '-C', str(args.repo), 'show', revision + ':docs/playground.md'])
    wasm = args.wasm.read_bytes()
    if not wasm.startswith(b'\x00asm\x01\x00\x00\x00'):
        parser.error('artifact is not a WebAssembly version 1 module')
    digest = hashlib.sha256(wasm).hexdigest()
    provenance = json.loads(args.wasm.with_name('manifest.json').read_text())
    if provenance.get('dirty') is not False or provenance.get('rust_commit') != revision:
        parser.error('build manifest must identify the requested clean source commit')
    if provenance.get('sha256') != digest or provenance.get('bytes') != len(wasm):
        parser.error('artifact does not match its build manifest')
    if provenance.get('target') != 'wasm32-wasip1':
        parser.error('artifact must target wasm32-wasip1')
    (ROOT / 'data/playground-build.json').write_text(json.dumps(provenance, indent=2) + '\n')
    name = f'playground.{digest}.wasm'
    destination = ROOT / 'static/wasm'
    destination.mkdir(exist_ok=True)
    (destination / name).write_bytes(wasm)
    for stale in destination.glob('playground.*.wasm'):
        if stale.name != name:
            stale.unlink()
    (ROOT / 'docs/playground-protocol.md').write_bytes(protocol)
    licenses = ROOT / 'static/licenses'
    licenses.mkdir(exist_ok=True)
    for license_name, source in [('vibescript-MIT.txt', 'LICENSE'), ('tzdata-NOTICE.txt', 'licenses/tzdata-NOTICE.txt')]:
        text = subprocess.check_output(['git', '-C', str(args.repo), 'show', revision + ':' + source])
        (licenses / license_name).write_bytes(text)
    (ROOT / 'data/playground.json').write_text(json.dumps({'revision': revision, 'sha256': digest, 'bytes': len(wasm), 'url': '/wasm/' + name}, indent=2) + '\n')
    print(f'Vendored {name} ({len(wasm):,} bytes) from {revision}')


if __name__ == '__main__':
    main()
