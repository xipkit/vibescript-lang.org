# Static website examples

All 203 examples are retained: 135 Rosetta Code programs, 35 upstream samples,
and 33 showcase examples. Each has a typed `run` entry point. This migration
uses Rust Vibescript **0.1.0**, commit
`187e0455c92cef44ed1cfd0bf6aa9d1a43e82e65` (ADR-007 and ADR-008), built on
2026-09-27. Every `# vibe:` marker now names that package version; it is not the
old Go language version. The engine commit is recorded in `expected.json`
because its development package version alone does not identify the language.

From the website root:

```sh
VIBES=../vibescript/target/gate/vibes \
  python3 scripts/check-static-examples.py
```

Build that binary in the Rust checkout if necessary:

```sh
CARGO_BUILD_JOBS=3 ./scripts/cargo build --offline --profile gate -p vibes
```

The verifier needs Python 3 and the Rust CLI. It rejects missing or stale fixture
entries, checks every source, calls every `run`, compares both the display text
and the exported JSON value, and runs additional boundary and capability probes.
Each invocation has a five-second engine timeout, a fifteen-second process
timeout, five million steps, 16 MiB of tracked memory, and 256 call frames.
The completed migration passed 203 checks, 203 entry-point runs, and 51 extra
probes. Fault injection also confirmed that type errors, changed output, and
uncovered examples fail the gate.

Large integers are compared as integers, without conversion through JavaScript
numbers or floats. JSON numbers compare by value; booleans remain distinct.

`--content`, `--expected`, `--vibes`, and `--cache` override paths. This allows
Hugo integration to move the examples without changing the verifier. Generated
sources, actual outputs, and the check report go under
`.cache/static-examples/verified/`. Fixtures are reviewed data: there is no
command that silently accepts new outputs.

## Baseline and output changes

Before editing any examples, `go test ./...` passed and the original
`internal/runner.Service` ran all 203 successfully. The exact display text,
exported value, result kind, entry point, slug, and original source SHA-256 are
in [the Go baseline](../../.cache/static-examples/go-baseline.json). Upstream
baseline keys omit the `upstream/` prefix because that is how the Go catalog
reports `SourcePath`.

The baseline and its recorder are committed at `2c0d006`, with the original
examples still intact. To reproduce it without reverting the migrated corpus:

```sh
git worktree add --detach /tmp/site-go-baseline 2c0d006
cd /tmp/site-go-baseline
go run .cache/static-examples/capture.go
```

The original site revision is `5ca06f3`, using Go Vibescript v0.70.0. Do not run
the Go recorder against the migrated files: the deprecated engine cannot parse
the new language. No Go server, templates, catalog code, or deployment files were
changed.

Only these three examples have different expected exported values:

| Example | Difference and reason |
| --- | --- |
| `rosettacode/popular/factorial.vibe` | `recursive_25` and `iterative_50` now export their full integers. The Go site's `exportValue` called `Int()` on big integers and returned zero. Its recorded display text already contained the correct values and is preserved. |
| `showcase/numbers/big_integers.vibe` | The same exporter defect affected `factorial_50`, `two_to_the_256`, and `fibonacci_300`. Expected values were independently calculated with Python integers. Display text is unchanged. `still_an_int` now actually tests the integer type instead of parity. |
| `showcase/reliability/resilient_parse.vibe` | Static types reject `1 <=> "a"`. The former `incomparable_is_nil: true` field becomes `ordered_comparison: -1`, comparing `1.0` with `2.0`. Missing-key recovery, division-by-zero recovery, infinity rendering, and NaN detection remain. This is the only changed display string. |

Integer quotient algorithms now use `//`, including digit extraction,
factorization, calendar indices, and Chudnovsky's exact integer arithmetic.
`safe_divide` and the temperature conversion helpers use true `/` division and
return floats. Their original integral sample results have the same visible
output; additional probes verify `7 / 2 == 3.5` and the non-integral Fahrenheit
conversion. None of the examples needs negative integer exponentiation or a
changed exception class to reproduce its original `run` output.

## Rewrites and retained intent

No example was dropped. Beyond signatures, optional values, dictionary types,
string keys, typed blocks, and the canonical spelling fixes, these examples
needed changes to their teaching approach:

- `rosettacode/popular/tree_traversal.vibe` uses a `Node` class with optional
  `Node` children in place of arbitrarily nested dynamic hashes. All four
  traversal orders are identical, with additional empty and single-node probes.
- `rosettacode/popular/url_parser.vibe` uses typed `partition` tuples instead of
  optional substring arithmetic. Scheme, host, path, and query output is
  preserved, including probes for a host without a path and a trailing slash.
- `showcase/reliability/resilient_parse.vibe` uses a valid finite comparison as
  described above.
- `showcase/strings/word_arrays.vibe` uses explicit string and symbol arrays and
  string interpolation instead of removed percent literals. Its metadata now
  explains the modern syntax, and all outputs match.
- `upstream/collections/symbols.vibe` explicitly converts a symbol to a string
  before dictionary lookup. Symbols no longer act as implicit hash keys.
- `upstream/enums/operations.vibe` passes enum members in typed collections and
  binds a symbol separately when comparing it with an enum. This preserves the
  original `symbol_same: false`; comparing against an enum member instead would
  silently change the lesson and output.
- `upstream/strings/operations.vibe` uses the canonical literal results for the
  removed string `clear` and `replace` helpers, typed regex arguments, and
  checked capture reads. Its output is unchanged.

Indexed string algorithms materialize character arrays before repeatedly
fetching a bounded character. Collection reads that may legitimately miss keep
optional types; required array entries use `fetch`. Mutations still target the
original collection or nested path, preserving value semantics.

## Capability previews

Seven sources declare `# uses:`. A bare CLI has no host declarations, so these
seven cannot pass standalone `vibes check` without an embedding environment.
The verifier appends the corresponding `preview-*.vibe` test doubles to a cached
copy, then uses **the Rust CLI's actual checker and VM** on that complete source.
The other 196 sources are checked directly. The examples themselves keep their
host API calls and contain no preview implementations.

The doubles expose typed classes through functions named `sms`, `email`, `ctx`,
`db`, `jobs`, and `events`. They perform no I/O. They are test fixtures, not a
replacement for Rust capability registration or its effects enforcement.
`preview-*.vibe` is the executable contract for the browser host to implement:

| Capability | Preview contract |
| --- | --- |
| `sms.send(to, body)` | Returns `{ body, status: "preview", to }`, all strings. |
| `email.send(to, subject, body)` | Returns `{ body, status: "preview", subject, to }`, all strings. |
| `ctx.user` | Returns `{ id: "p-1", role: "coach" }`. Scripts index this record with string keys. |
| `db` | Typed player lookup, ordered query, update preview, synchronous score iteration, and money sum. Sample scores total `75.00 USD`; updates return a changed record without persistence. |
| `jobs.enqueue` | Returns the job name, player ID, delay string, deduplication key, and preview status. Nothing is queued. |
| `events.publish` | Returns the channel, payload, and preview status. Nothing is published. |

SMS and email previews reproduce the Go adapter's field order as well as its
values. The other capability samples' original `run` functions mostly describe
the host requirements; extra fixture probes now actually call their helpers.
The `jobs`/`events` return records are an explicit preview contract replacing
previously unspecified host results. The database sum's field name is now a
string instead of a symbol. These choices require coordination with the
playground host when implementing its additional capabilities.

`export.vibe` is only a verification adapter. It recursively renders money,
duration, time, and symbol values as the old site did, while preserving integer
precision. The original example result is also interpolated before export so
its display text is checked independently. This is necessary because the flat
CLI's native JSON encoder rejects money and duration values.

## Examples added after the migration

Twenty-three examples were added under `upstream/` so that no catalog category
has a single entry. They were written for Rust Vibescript 0.80.0, the pinned
playground revision, and keep the same `# vibe: 0.1.0` marker as the verifier
expects. Each output was reviewed by hand before it was recorded, and twelve
probes pin edge cases such as leftover cents, empty slugs, and range bounds.
Three of them use the `ctx`, `db`, `events`, and `jobs` previews. A later
showcase example, `showcase/automation/trial_reminder.vibe`, backs the home page
hero. The verifier now covers 227 examples and 66 probes.

## Follow-up

Rust `fef329a3` settles NaN ordering: float `<=>` is a total order, so the probe
`n = 0.0 / 0.0; [n <=> 1.0, 1.0 <=> n, n <=> n]` prints `[-1,1,0]`. All 203
examples and 51 probes pass against that revision. The browser playground still
has to provide the preview capability contracts that the `preview-*.vibe`
doubles describe.
