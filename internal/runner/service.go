package runner

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"sort"
	"time"

	"github.com/mgomes/vibescript/vibes"
	"github.com/mgomes/vibescript/vibes/value"
	"github.com/xipkit/vibescript-lang.org/internal/catalog"
)

var (
	ErrExampleNotFound    = errors.New("example not found")
	ErrExampleNotRunnable = errors.New("example is not runnable")
)

type Result struct {
	Kind       string `json:"kind"`
	Display    string `json:"display"`
	Value      any    `json:"value"`
	DurationUS int64  `json:"duration_us"`
}

type Service struct {
	store    *catalog.Store
	compiled map[string]*vibes.Script
	stats    Stats
}

// Stats describes the startup compile pass. The site renders these numbers,
// so they are measured on the machine serving the page rather than quoted.
type Stats struct {
	CompiledScripts int
	MedianCompile   time.Duration
}

// EngineConfig is the sandbox configuration enforced by the browser runner.
// The site renders these values on the homepage, so they must stay in sync
// with what the engine actually enforces.
var EngineConfig = vibes.Config{
	StepQuota:        250_000,
	MemoryQuotaBytes: 256 << 10,
	RecursionLimit:   32,
	StrictEffects:    true,
}

func New(store *catalog.Store) (*Service, error) {
	engine, err := vibes.NewEngine(EngineConfig)
	if err != nil {
		return nil, fmt.Errorf("new vibes engine: %w", err)
	}

	compiled := make(map[string]*vibes.Script, store.Count())
	elapsed := make([]time.Duration, 0, store.RunnableCount())
	for _, example := range store.All() {
		if !example.Runnable {
			continue
		}

		started := time.Now()
		script, err := engine.Compile(example.Source)
		if err != nil {
			return nil, fmt.Errorf("compile %s: %w", example.SourcePath, err)
		}
		elapsed = append(elapsed, time.Since(started))
		compiled[example.Slug] = script
	}

	return &Service{
		store:    store,
		compiled: compiled,
		stats: Stats{
			CompiledScripts: len(compiled),
			MedianCompile:   median(elapsed),
		},
	}, nil
}

// Stats reports what the startup compile pass measured.
func (s *Service) Stats() Stats {
	return s.stats
}

func median(values []time.Duration) time.Duration {
	if len(values) == 0 {
		return 0
	}

	sorted := slices.Clone(values)
	slices.Sort(sorted)

	mid := len(sorted) / 2
	if len(sorted)%2 == 1 {
		return sorted[mid]
	}
	return (sorted[mid-1] + sorted[mid]) / 2
}

func (s *Service) Run(ctx context.Context, slug string) (Result, error) {
	example, ok := s.store.BySlug(slug)
	if !ok {
		return Result{}, ErrExampleNotFound
	}
	if !example.Runnable {
		return Result{}, ErrExampleNotRunnable
	}

	script, ok := s.compiled[slug]
	if !ok {
		return Result{}, fmt.Errorf("compiled script missing for %s", slug)
	}

	started := time.Now()
	result, err := script.Call(ctx, example.RunFunction, nil, vibes.CallOptions{
		Capabilities: example.Capabilities,
	})
	if err != nil {
		return Result{}, err
	}

	return Result{
		Kind:       result.Kind().String(),
		Display:    result.String(),
		Value:      exportValue(result),
		DurationUS: time.Since(started).Microseconds(),
	}, nil
}

func exportValue(v value.Value) any {
	switch v.Kind() {
	case value.KindNil:
		return nil
	case value.KindBool:
		return v.Bool()
	case value.KindInt:
		return v.Int()
	case value.KindFloat:
		return v.Float()
	case value.KindString, value.KindSymbol, value.KindMoney, value.KindDuration, value.KindTime, value.KindRange, value.KindEnum, value.KindEnumValue, value.KindClass, value.KindInstance:
		return v.String()
	case value.KindArray:
		items := v.Array()
		exported := make([]any, len(items))
		for i, item := range items {
			exported[i] = exportValue(item)
		}
		return exported
	case value.KindHash, value.KindObject:
		hash := v.Hash()
		keys := make([]string, 0, len(hash))
		for key := range hash {
			keys = append(keys, key)
		}
		sort.Strings(keys)

		exported := make(map[string]any, len(hash))
		for _, key := range keys {
			exported[key] = exportValue(hash[key])
		}
		return exported
	default:
		return v.String()
	}
}
