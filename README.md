# vibescript-lang.org

The Vibescript website. Browse examples, read their source, and run them from your browser. A Go server runs the scripts with the Vibescript interpreter.

## Run

```bash
just run
```

The server listens on `0.0.0.0:8080` by default. Override it with `HOST`, `PORT`, and `SHUTDOWN_TIMEOUT`.

## Deploy

Deployments are configured for Miren on Vultr. See [docs/deployment.md](docs/deployment.md).

## What's here

- Hundreds of examples from [Vibescript](https://github.com/xipkit/vibescript), Rosetta Code, and common app tasks.
- Source code and a Run button for each example.
- A language reference at `/reference`.

## Test

```bash
go test ./...
```
