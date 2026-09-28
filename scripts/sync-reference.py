#!/usr/bin/env python3
"""Render a pinned Rust language reference and its matching builtin signatures."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
GUIDES = ['language', 'cli', 'types', 'capabilities', 'globals', 'errors', 'diagnostics',
          'formatting', 'output', 'strings', 'regex', 'modules', 'require', 'classes',
          'sessions', 'tooling', 'platforms', 'safe-navigation', 'equality', 'random',
          'timezones', 'loop', 'introspection', 'value-helpers', 'checker', 'lsp']


def command(*args, **kwargs):
    return subprocess.check_output(args, text=True, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--revision', default=json.loads((ROOT / 'data/reference.json').read_text())['revision'] if (ROOT / 'data/reference.json').exists() else 'HEAD')
    parser.add_argument('--cache', type=Path, required=True, help='Build outputs and Cargo cache on a disk with space')
    args = parser.parse_args()
    repo, cache = args.repo.resolve(), args.cache.resolve()
    revision = command('git', '-C', str(repo), 'rev-parse', args.revision + '^{commit}').strip()
    cache.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='site-reference-', dir='/tmp') as temporary:
        checkout = (Path(temporary) / 'source').resolve()
        subprocess.run(['git', '-C', str(repo), 'worktree', 'add', '--detach', str(checkout), revision], check=True)
        try:
            (checkout / '.cache').symlink_to(cache / 'env', target_is_directory=True)
            (cache / 'env').mkdir(exist_ok=True)
            cargo_cache = cache / 'env/cargo'
            if not cargo_cache.exists():
                cargo_cache.symlink_to(repo / '.cache/cargo', target_is_directory=True)
            (cache / 'target').mkdir(exist_ok=True)
            (checkout / 'target').symlink_to(cache / 'target', target_is_directory=True)
            prelude_cache = cache / f'prelude-{revision}.txt'
            if prelude_cache.exists():
                prelude = prelude_cache.read_text()
            else:
                subprocess.run(['./scripts/cargo', 'build', '--offline', '--profile', 'gate', '-p', 'vibes'], cwd=checkout, env={**os.environ, 'CARGO_BUILD_JOBS': '3'}, check=True)
                prelude = command(str(checkout / 'target/gate/vibes'), 'prelude')
                prelude_cache.write_text(prelude)
            output = ROOT / 'content/reference'
            output.mkdir(parents=True, exist_ok=True)
            sources = {f'docs/{name}.md': name for name in GUIDES}
            # Older ADRs link to Go-era guides removed from the Rust tree.
            retired = {
                'docs/blocks.md': '/reference/#blocks',
                'docs/hashes.md': '/reference/#shapes-and-dictionaries',
                'docs/integration.md': '/reference/capabilities/',
                'docs/versioning.md': '/reference/#removed-spellings',
                'docs/migrating-to-1.0.md': '/reference/#removed-spellings',
            }
            pending = list(sources)
            def resolve(source, target):
                path = (checkout / source).parent.joinpath(target).resolve()
                if path.is_relative_to(checkout) and path.relative_to(checkout).as_posix() in retired:
                    return path.relative_to(checkout).as_posix()
                if not path.is_relative_to(checkout) or not path.is_file():
                    raise ValueError(f'Unresolved reference link: {source}: {target}')
                return path.relative_to(checkout).as_posix()
            for source in pending:
                for target in re.findall(r'\]\(([^)\s]+)\)', (checkout / source).read_text()):
                    if target == '...' or re.match(r'^[a-z]+:|^#|^/', target):
                        continue
                    target = target.partition('#')[0]
                    if not target.endswith('.md'):
                        continue
                    linked = resolve(source, target)
                    if linked in retired or not linked.startswith('docs/'):
                        continue
                    if linked not in sources:
                        sources[linked] = linked.removeprefix('docs/').removesuffix('.md').lower()
                        pending.append(linked)
            asset_root = ROOT / 'static/reference-source' / revision
            if asset_root.exists():
                shutil.rmtree(asset_root)
            for stale in output.rglob('*.md'):
                stale.unlink()
            for source, name in sources.items():
                text = (checkout / source).read_text()
                title = text.splitlines()[0].removeprefix('# ')
                body = text.partition('\n')[2].lstrip()
                def link(match):
                    target = match[1]
                    if target == '...' or re.match(r'^[a-z]+:|^#|^/', target):
                        return match[0]
                    path, _, fragment = target.partition('#')
                    linked = resolve(source, path)
                    if linked in retired:
                        return '](' + retired[linked] + ')'
                    if linked in sources:
                        slug = sources[linked]
                        url = '/reference/' + ('' if slug == 'language' else slug + '/')
                    else:
                        asset = ROOT / 'static/reference-source' / revision / linked
                        asset.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copyfile(checkout / linked, asset)
                        url = '/' + asset.relative_to(ROOT / 'static').as_posix()
                    return '](' + url + ('#' + fragment if fragment else '') + ')'
                body = re.sub(r'\]\(([^)\s]+)\)', link, body)
                front = {'title': title, 'type': 'reference', 'description': title + ' for the Rust implementation of Vibescript.', 'source': source, 'guide': name in GUIDES}
                target = output / ('_index.md' if name == 'language' else name + '.md')
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(json.dumps(front) + '\n\n' + body.rstrip() + '\n')
            license_path = ROOT / 'static/reference-source' / revision / 'LICENSE'
            license_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(checkout / 'LICENSE', license_path)
            (output / 'prelude.md').write_text(json.dumps({'title': 'Builtin signatures', 'type': 'reference', 'guide': True, 'description': 'Every builtin signature from vibes prelude.'}) + '\n\n```text\n' + prelude.rstrip() + '\n```\n')
            (ROOT / 'data/reference.json').write_text(json.dumps({'revision': revision, 'guides': GUIDES, 'prelude_sha256': hashlib.sha256(prelude.encode()).hexdigest()}, indent=2) + '\n')
        finally:
            subprocess.run(['git', '-C', str(repo), 'worktree', 'remove', '--force', str(checkout)], check=True)


if __name__ == '__main__':
    main()
