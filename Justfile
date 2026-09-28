default:
    just --list

build:
    hugo --gc --minify --cleanDestinationDir

run: build
    python3 scripts/serve.py

check: build
    python3 scripts/check-site.py

browser:
    node scripts/check-browser.mjs
