#!/usr/bin/env python3
"""Type-check and compare every website example using the Rust Vibescript CLI."""

import argparse
import difflib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SUPPORT = ROOT / "scripts/static-examples"


def invoke(command):
    return subprocess.run(command, capture_output=True, text=True, timeout=15)


def encoded(value):
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def compare(expected, actual, label):
    equal = compare_value(expected, actual)
    if not equal:
        print(f"FAIL {label}: output differs", file=sys.stderr)
        print("".join(difflib.unified_diff(
            encoded(expected).splitlines(keepends=True),
            encoded(actual).splitlines(keepends=True),
            fromfile="expected", tofile="actual",
        )), file=sys.stderr, end="")
    return equal


def compare_value(expected, actual):
    if isinstance(expected, bool) or isinstance(actual, bool):
        return type(expected) is type(actual) and expected == actual
    if isinstance(expected, dict) and isinstance(actual, dict):
        return expected.keys() == actual.keys() and all(
            compare_value(expected[key], actual[key]) for key in expected
        )
    if isinstance(expected, list) and isinstance(actual, list):
        return len(expected) == len(actual) and all(
            compare_value(left, right) for left, right in zip(expected, actual)
        )
    return expected == actual


def verify(args):
    executable = shutil.which(args.vibes)
    if executable is None:
        raise ValueError(f"Rust vibes not found: {args.vibes}; set VIBES or --vibes")
    version = invoke([executable, "--version"])
    if version.returncode or not version.stdout.startswith(("vibescript ", "vibescript.rs ")):
        raise ValueError("the verifier requires the Rust vibes CLI")

    content = args.content.resolve()
    fixture = json.loads(args.expected.read_text())
    if fixture["schema"] != 1:
        raise ValueError("unsupported fixture schema")
    examples = fixture["examples"]
    sources = {str(path.relative_to(content)): path for path in content.rglob("*.vibe")}
    if sources.keys() != examples.keys():
        missing = sorted(sources.keys() - examples.keys())
        stale = sorted(examples.keys() - sources.keys())
        raise ValueError(f"fixture coverage differs: missing={missing}, stale={stale}")

    cache = args.cache.resolve()
    if cache == content or content in cache.parents or cache in content.parents:
        raise ValueError("cache and content directories must not overlap")
    cache.mkdir(parents=True, exist_ok=True)
    exporter = (SUPPORT / "export.vibe").read_text()
    failures = []
    outputs = {}
    checks = runs = probes = capabilities = 0

    for relative, path in sorted(sources.items()):
        expected = examples[relative]
        source = path.read_text()
        if not re.search(r"^# vibe: 0\.1\.0$", source, re.MULTILINE):
            failures.append(f"{relative}: missing current # vibe marker")
            continue
        if not re.search(r"^def run(?:\s|$)", source, re.MULTILINE):
            failures.append(f"{relative}: missing run entry point")
            continue
        uses = re.search(r"^# uses: (.+)$", source, re.MULTILINE)
        if uses:
            capabilities += 1
            for name in uses[1].split(","):
                name = name.strip()
                if not re.fullmatch(r"[a-z]+", name):
                    raise ValueError(f"invalid preview capability name: {name}")
                source += "\n" + (SUPPORT / f"preview-{name}.vibe").read_text()

        prepared = cache / relative
        prepared.parent.mkdir(parents=True, exist_ok=True)
        prepared.write_text(source)
        check_path = prepared if uses else path
        check = invoke([executable, "check", "--json", str(check_path)])
        if check.returncode or check.stdout.strip():
            failures.append(f"{relative}: check failed\n{check.stdout}{check.stderr}")
            continue
        checks += 1

        source += "\n" + exporter
        for index, probe in enumerate(expected.get("probes", [])):
            source += (
                f"\ndef example_probe_{index} -> any\n"
                f"  example_export({probe['expression']})\nend\n"
            )
        prepared.write_text(source)
        cases = [("example_output", {"value": expected["value"], "display": expected["display"]})] + [
            (f"example_probe_{index}", probe["value"])
            for index, probe in enumerate(expected.get("probes", []))
        ]
        for function, wanted in cases:
            label = f"{relative}:{function}"
            result = invoke([
                executable, str(prepared), "--function", function,
                "--steps", "5000000", "--memory", "16777216",
                "--recursion", "256", "--timeout-ms", "5000",
            ])
            if result.returncode or result.stderr:
                failures.append(f"{label}: execution failed\n{result.stderr}{result.stdout}")
                continue
            try:
                actual = json.loads(result.stdout)
            except json.JSONDecodeError:
                failures.append(f"{label}: expected one JSON result, got {result.stdout!r}")
                continue
            if function == "example_output":
                runs += 1
                outputs[relative] = actual
            else:
                probes += 1
            if not compare(wanted, actual, label):
                failures.append(f"{label}: output mismatch")

    (cache / "actual.json").write_text(encoded(outputs))
    report = {
        "engine": version.stdout.strip(), "checks": checks, "runs": runs,
        "probes": probes, "capability_examples": capabilities, "failures": failures,
    }
    (cache / "report.json").write_text(encoded(report))
    for failure in failures:
        print(f"FAIL {failure}", file=sys.stderr)
    print(
        f"{checks}/{len(sources)} checked; {runs}/{len(sources)} executed; "
        f"{probes} probes; {capabilities} with preview capabilities; "
        f"{len(failures)} failures ({version.stdout.strip()})"
    )
    return bool(failures)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vibes", default=os.environ.get("VIBES", "vibes"))
    parser.add_argument("--content", type=Path, default=ROOT / "internal/catalog/content")
    parser.add_argument("--expected", type=Path, default=SUPPORT / "expected.json")
    parser.add_argument("--cache", type=Path, default=ROOT / ".cache/static-examples/verified")
    args = parser.parse_args()
    try:
        return verify(args)
    except (OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
        print(f"FAIL {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
