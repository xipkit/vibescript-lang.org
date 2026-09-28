package catalog

import (
	"testing"

	"github.com/mgomes/vibescript/vibes"
)

func TestLoad(t *testing.T) {
	store, err := Load()
	if err != nil {
		t.Fatalf("load catalog: %v", err)
	}

	if store.Count() < 49 {
		t.Fatalf("expected at least 49 examples, got %d", store.Count())
	}

	if store.RunnableCount() < 22 {
		t.Fatalf("expected at least 22 runnable examples, got %d", store.RunnableCount())
	}

	example, ok := store.BySlug("strings-operations")
	if !ok {
		t.Fatalf("expected strings-operations to be present")
	}

	if !example.Runnable {
		t.Fatalf("expected strings-operations to be runnable")
	}

	if example.RunFunction != "run" {
		t.Fatalf("expected run entrypoint, got %q", example.RunFunction)
	}

	wantSourceURL := UpstreamRepoURL + "/blob/" + upstreamRevision + "/examples/strings/operations.vibe"
	if example.SourceURL != wantSourceURL {
		t.Errorf("SourceURL = %q, want %q", example.SourceURL, wantSourceURL)
	}

	rosettaExample, ok := store.BySlug("rosettacode-popular-fizzbuzz")
	if !ok {
		t.Fatalf("expected rosettacode-popular-fizzbuzz to be present")
	}

	if !rosettaExample.Runnable {
		t.Fatalf("expected rosetta example to be runnable")
	}

	showcaseExample, ok := store.BySlug("showcase-workflows-release-readiness")
	if !ok {
		t.Fatalf("expected showcase-workflows-release-readiness to be present")
	}

	if !showcaseExample.Runnable {
		t.Fatalf("expected showcase example to be runnable")
	}
}

func TestCatalogUsesTheLightLanguageSurface(t *testing.T) {
	store, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v, want nil", err)
	}

	if got, want := store.Count(), 203; got != want {
		t.Errorf("Count() = %d, want %d", got, want)
	}
	if got, want := store.TaggedCount("showcase"), 33; got != want {
		t.Errorf("TaggedCount(%q) = %d, want %d", "showcase", got, want)
	}

	for _, slug := range []string{
		"basics-namespaces",
		"showcase-language-synchronous-blocks",
		"showcase-language-value-boundaries",
	} {
		if _, ok := store.BySlug(slug); !ok {
			t.Errorf("BySlug(%q) found = false, want true", slug)
		}
	}

	for _, slug := range []string{
		"tasks-scoring",
		"showcase-concurrency-batch-enrich",
		"showcase-concurrency-batch-pipeline",
		"showcase-concurrency-bounded-fanout",
		"showcase-concurrency-concurrent-scoring",
		"showcase-concurrency-parallel-prepare",
		"showcase-concurrency-staged-barrier",
		"showcase-concurrency-task-error-propagation",
	} {
		if _, ok := store.BySlug(slug); ok {
			t.Errorf("BySlug(%q) found = true, want false", slug)
		}
	}

	featured := store.Featured(3)
	if len(featured) != 3 {
		t.Fatalf("len(Featured(3)) = %d, want 3", len(featured))
	}
	for i, want := range []string{"showcase-notifications-sms", "showcase-notifications-email", "showcase-language-value-boundaries"} {
		if featured[i].Slug != want {
			t.Errorf("Featured(3)[%d].Slug = %q, want %q", i, featured[i].Slug, want)
		}
	}
}

func TestAllExamplesCompileAndPassStaticChecks(t *testing.T) {
	store, err := Load()
	if err != nil {
		t.Fatalf("load catalog: %v", err)
	}

	engine := vibes.MustNewEngine(vibes.Config{})
	for _, example := range store.All() {
		t.Run(example.SourcePath, func(t *testing.T) {
			script, err := engine.Compile(example.Source)
			if err != nil {
				t.Fatalf("Compile(%q) error = %v, want nil", example.SourcePath, err)
			}

			if !example.Runnable {
				return
			}

			opts := vibes.CallOptions{Capabilities: example.Capabilities}
			if warnings := script.CheckWarningsForFunctionWithOptions(example.RunFunction, opts); len(warnings) > 0 {
				t.Errorf(
					"CheckWarningsForFunctionWithOptions(%q, %q) = %#v, want none",
					example.SourcePath,
					example.RunFunction,
					warnings,
				)
			}
		})
	}
}

// The site promises every catalog example runs in the browser, and the runner
// silently skips any example without a top-level run entry point. Assert the
// invariant so an import can never quietly reintroduce a dead example.
func TestEveryExampleIsRunnable(t *testing.T) {
	store, err := Load()
	if err != nil {
		t.Fatalf("load catalog: %v", err)
	}

	for _, example := range store.All() {
		if !example.Runnable {
			t.Errorf("%s (%s) defines no top-level `def run`", example.Slug, example.SourcePath)
		}
	}

	if store.RunnableCount() != store.Count() {
		t.Fatalf("runnable count = %d, want all %d examples", store.RunnableCount(), store.Count())
	}
}
