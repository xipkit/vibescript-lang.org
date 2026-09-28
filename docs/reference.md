# Updating the reference

`data/reference.json` pins a Rust commit and the SHA-256 of its `vibes prelude`
output. The checked-in Markdown under `content/reference/` lets Pages build
without cloning Rust, compiling it, or downloading docs.

To update both prose and signatures from one immutable commit:

```sh
python3 scripts/sync-reference.py \
  --repo /Volumes/AI/Work/xipkit/vibescript.rs \
  --revision FULL_RUST_COMMIT \
  --cache /Volumes/AI/Work/xipkit/vibescript.rs/.cache/site-static/reference
hugo --cleanDestinationDir
python3 scripts/check-site.py
```

The script creates a detached checkout under `/tmp`, builds the pinned `vibes`
CLI offline with `CARGO_BUILD_JOBS=3`, runs `vibes prelude`, and removes the checkout.
Cargo artifacts and temporary compilation files live in the supplied external
cache; dependencies reuse the Rust repository's Cargo cache. The main Rust
checkout is never edited. Rust and its cached dependencies are required only
when refreshing the snapshot.

The language guide is `/reference/`; supporting guides and builtin signatures
have child pages. Linked Markdown dependencies are also copied recursively, and links are rewritten
to local URLs. Non-Markdown linked files retain their pinned revision under
`/reference-source/`. This works before the Rust branch has a public source URL. Old reference
fragments are preserved by `data/reference_aliases.json` and the heading render
hook, including `/reference#app-services`.

Review `GUIDES` in the script when adding upstream documentation. Regenerate,
review the changes, and commit the snapshot and manifest together. A website
build never silently pulls newer language documentation.
