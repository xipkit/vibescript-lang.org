package main

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"

	"github.com/xipkit/vibescript-lang.org/internal/catalog"
	"github.com/xipkit/vibescript-lang.org/internal/runner"
)

func main() {
	store, err := catalog.Load()
	if err != nil {
		panic(err)
	}
	service, err := runner.New(store)
	if err != nil {
		panic(err)
	}
	records := make(map[string]any, store.Count())
	for _, example := range store.All() {
		record := map[string]any{
			"slug":          example.Slug,
			"entry_point":   example.RunFunction,
			"runnable":      example.Runnable,
			"source_sha256": fmt.Sprintf("%x", sha256.Sum256([]byte(example.Source))),
		}
		if example.Runnable {
			result, err := service.Run(context.Background(), example.Slug)
			if err != nil {
				record["error"] = err.Error()
			} else {
				record["kind"] = result.Kind
				record["display"] = result.Display
				record["value"] = result.Value
			}
		} else {
			record["skip_reason"] = "The Go site has no run entry point or capability adapters for this sample."
		}
		records[example.SourcePath] = record
	}
	data, err := json.MarshalIndent(map[string]any{"site_revision": "5ca06f3", "engine": "Go v0.70.0", "examples": records}, "", "  ")
	if err != nil {
		panic(err)
	}
	if err := os.WriteFile(".cache/static-examples/go-baseline.json", append(data, '\n'), 0644); err != nil {
		panic(err)
	}
	fmt.Printf("Recorded %d examples (%d runnable)\n", store.Count(), store.RunnableCount())
}
