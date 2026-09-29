#!/usr/bin/env python3
"""Render the Open Graph card as a PNG.

The card is built from the site's own brand tokens, wordmark, and webfont so it
stays in step with the design instead of drifting into a third set of greens.

Text is restricted to ASCII: the inlined MonoLisaText subset covers U+0020-007E,
so an em dash or curly quote would silently render as tofu.

Usage:
    python3 scripts/build_og_card.py            # writes static/static/og-card.png
    python3 scripts/build_og_card.py --html-only

Rendering needs Chrome or Chromium. The binary is resolved from PATH, then the
usual macOS bundle locations; override with --chrome or the CHROME env var.

ImageMagick (`magick` or `convert`) is optional. When present the screenshot is
reduced to an 8-bit palette, which roughly halves the file; without it the raw
screenshot is written instead.
"""

from __future__ import annotations

import argparse
import base64
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
STATIC = ROOT / "static" / "static"
FONT = STATIC / "fonts" / "woff2" / "0-MonoLisaText-normal.woff2"
LOGO = STATIC / "logo-dark.svg"
OUT = STATIC / "og-card.png"
# The URL every page advertised before the refresh. Links already cached against
# it must keep resolving to the current art, so a default run rewrites it too.
LEGACY_OUT = STATIC / "og-image.png"

CHROME_BUNDLES = (
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
)
CHROME_COMMANDS = (
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "chrome",
)
# ImageMagick 7 ships `magick`, 6 ships `convert`. Optional: it only shrinks the
# screenshot to an 8-bit palette.
CONVERT_COMMANDS = ("magick", "convert")


def find_converter() -> str | None:
    for command in CONVERT_COMMANDS:
        found = shutil.which(command)
        if found:
            return found
    return None


def find_chrome(explicit: str | None = None) -> str:
    """Resolve a Chrome/Chromium binary across macOS bundles, PATH, and Linux."""
    if explicit:
        resolved = shutil.which(explicit) or (explicit if pathlib.Path(explicit).exists() else None)
        if not resolved:
            sys.exit(f"chrome not found at {explicit}")
        return resolved

    for command in CHROME_COMMANDS:
        found = shutil.which(command)
        if found:
            return found
    for bundle in CHROME_BUNDLES:
        if pathlib.Path(bundle).exists():
            return bundle

    sys.exit(
        "could not find Chrome or Chromium. Install one, or pass --chrome /path/to/binary "
        "(or set CHROME=/path/to/binary)."
    )

WIDTH, HEIGHT = 1200, 630

# Dark theme tokens, mirroring :root in site.css
BG = "#0c0d0a"
INK = "#f1efe2"
MUTED = "rgba(241, 239, 226, 0.66)"
ACCENT = "#56c96e"
TOK_KEYWORD = "#dd93b7"
TOK_CONSTANT = "#96bfe3"
TOK_STRING = "#dcbe78"

# Mirrors the homepage hero, including the swash under one word.
HEADLINE = "A Ruby-like language to extend your app."
UNDERLINED = "extend"
SUBLINE = "Let users and AI agents add features with scripts."

SPARKLE = (
    "M17.5 0C17.5 9.665 25.335 17.5 35 17.5C25.335 17.5 17.5 25.335 17.5 35"
    "C17.5 25.335 9.665 17.5 0 17.5C9.665 17.5 17.5 9.665 17.5 0Z"
)

# The hero's underline stroke, from layouts/home.html.
SWASH = "M2 9C48 4 118 2 197 5C150 7.5 70 9 6 11.5Z"

# Same sine as the homepage wave, but filled to the bottom edge rather than
# drawn as a ribbon: a wavy lower edge would let the background show through at
# the card's bottom corners.
def wave_path(crest: int) -> str:
    segments = "".join(
        f" c72 {-36 if i % 2 == 0 else 36} 128 {-36 if i % 2 == 0 else 36} 200 0"
        for i in range(7)
    )
    return f"M-40 {crest}{segments} L1360 150 L-40 150 Z"


def sparkle(x, y, size, color, tilt):
    return (
        f'<svg class="sp" style="left:{x}px;top:{y}px;width:{size}px;height:{size}px;'
        f'fill:{color};transform:rotate({tilt}deg)" viewBox="0 0 35 35">'
        f'<path d="{SPARKLE}"/></svg>'
    )


def build_html() -> str:
    for path in (FONT, LOGO):
        if not path.exists():
            sys.exit(f"missing required asset: {path}")

    font_b64 = base64.b64encode(FONT.read_bytes()).decode()
    logo = LOGO.read_text()
    # Scale the wordmark by height; its viewBox is 682x139.
    logo = logo.replace("<svg", '<svg class="wordmark"', 1)

    non_ascii = [c for c in HEADLINE + SUBLINE if ord(c) > 0x7E]
    if non_ascii:
        sys.exit(f"card text must stay ASCII, found: {non_ascii!r}")
    if HEADLINE.count(UNDERLINED) != 1:
        sys.exit(f"underlined word must appear once in the headline: {UNDERLINED!r}")
    headline = HEADLINE.replace(
        UNDERLINED,
        f'<span class="underlined">{UNDERLINED}<svg class="swash" viewBox="0 0 200 12" '
        f'preserveAspectRatio="none"><path d="{SWASH}"/></svg></span>',
    )

    return f"""<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @font-face {{
    font-family: "MonoLisaText";
    src: url(data:font/woff2;base64,{font_b64}) format("woff2");
    font-weight: 1 900;
    font-display: block;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  html, body {{ width: {WIDTH}px; height: {HEIGHT}px; }}
  body {{
    background: {BG};
    color: {INK};
    font-family: "MonoLisaText";
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 78px;
  }}
  .wordmark {{ height: 52px; width: auto; display: block; align-self: flex-start; margin-bottom: 42px; }}
  h1 {{
    font-size: 62px;
    font-weight: 900;
    line-height: 1.06;
    letter-spacing: -0.035em;
    max-width: 940px;
  }}
  p {{
    margin-top: 26px;
    font-size: 27px;
    font-weight: 500;
    color: {MUTED};
    letter-spacing: -0.01em;
  }}
  .underlined {{ position: relative; white-space: nowrap; isolation: isolate; }}
  .swash {{
    position: absolute;
    left: -1.5%;
    bottom: 0.02em;
    width: 103%;
    height: 0.2em;
    overflow: visible;
    z-index: -1;
    fill: {ACCENT};
  }}
  .wave {{ position: absolute; left: 0; right: 0; bottom: 0; line-height: 0; }}
  .wave svg {{ width: 100%; height: 126px; display: block; }}
  .sp {{ position: absolute; }}
</style></head>
<body>
  {sparkle(1052, 92, 34, TOK_KEYWORD, -14)}
  {sparkle(1120, 168, 20, TOK_CONSTANT, 18)}
  {sparkle(92, 96, 16, TOK_STRING, 24)}
  {logo}
  <h1>{headline}</h1>
  <p>{SUBLINE}</p>
  <div class="wave">
    <svg viewBox="0 0 1200 150" preserveAspectRatio="none">
      <path d="{wave_path(38)}" fill="{ACCENT}" opacity="0.3"/>
      <path d="{wave_path(74)}" fill="{ACCENT}"/>
    </svg>
  </div>
</body></html>
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--html-only", action="store_true")
    parser.add_argument("--out", default=str(OUT))
    parser.add_argument(
        "--chrome",
        default=os.environ.get("CHROME"),
        help="path to a Chrome/Chromium binary (default: search PATH, then macOS bundles)",
    )
    args = parser.parse_args()

    html = build_html()

    # --html-only needs no renderer, so it returns before any tool lookup.
    if args.html_only:
        keep = ROOT / "og-card-preview.html"
        keep.write_text(html)
        print(f"wrote {keep}")
        return

    # Preflight both tools so a missing one fails before rendering, not after.
    chrome = find_chrome(args.chrome)
    converter = find_converter()
    if converter is None:
        print(
            "note: ImageMagick not found; writing the raw screenshot without "
            "8-bit optimization (install imagemagick for a smaller file)",
            file=sys.stderr,
        )

    with tempfile.TemporaryDirectory() as tmp:
        page = pathlib.Path(tmp) / "card.html"
        page.write_text(html)

        raw = pathlib.Path(tmp) / "raw.png"
        try:
            # Headless Chrome writes the screenshot but does not always exit,
            # so bound it and judge success by the file rather than the code.
            subprocess.run(
                [
                    chrome,
                    "--headless=new",
                    f"--user-data-dir={tmp}/profile",
                    "--force-device-scale-factor=1",
                    f"--window-size={WIDTH},{HEIGHT}",
                    "--hide-scrollbars",
                    "--virtual-time-budget=3000",
                    f"--screenshot={raw}",
                    page.as_uri(),
                ],
                timeout=45,
                capture_output=True,
            )
        except subprocess.TimeoutExpired:
            pass

        if not raw.exists():
            sys.exit("chrome did not produce a screenshot")

        if converter:
            # 8-bit palette keeps the file small; the card is flat color.
            subprocess.run(
                [
                    converter,
                    str(raw),
                    "-strip",
                    "-depth",
                    "8",
                    "-define",
                    "png:color-type=2",
                    args.out,
                ],
                check=True,
            )
        else:
            shutil.copyfile(raw, args.out)

    out_path = pathlib.Path(args.out)
    print(f"wrote {out_path} ({out_path.stat().st_size:,} bytes)")

    # Only mirror for a default run; an explicit --out stays single-target.
    if out_path.resolve() == OUT.resolve():
        LEGACY_OUT.write_bytes(out_path.read_bytes())
        print(f"synced {LEGACY_OUT} (legacy URL)")


if __name__ == "__main__":
    main()
