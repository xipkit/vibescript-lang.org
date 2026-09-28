package runner

import (
	"context"
	"testing"
	"time"

	"github.com/xipkit/vibescript-lang.org/internal/catalog"
)

func TestRunRunnableExample(t *testing.T) {
	store, err := catalog.Load()
	if err != nil {
		t.Fatalf("load catalog: %v", err)
	}

	service, err := New(store)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	result, err := service.Run(context.Background(), "control-flow-case-when")
	if err != nil {
		t.Fatalf("run example: %v", err)
	}

	if result.Kind != "array" {
		t.Fatalf("expected array result, got %q", result.Kind)
	}

	values, ok := result.Value.([]any)
	if !ok {
		t.Fatalf("expected array export, got %T", result.Value)
	}

	if len(values) != 3 {
		t.Fatalf("expected 3 values, got %d", len(values))
	}

	if values[0] != "perfect" || values[1] != "great" || values[2] != "ok" {
		t.Fatalf("unexpected output: %#v", values)
	}
}

func TestRunArraysExtrasExample(t *testing.T) {
	store, err := catalog.Load()
	if err != nil {
		t.Fatalf("load catalog: %v", err)
	}

	service, err := New(store)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	result, err := service.Run(context.Background(), "arrays-extras")
	if err != nil {
		t.Fatalf("run example: %v", err)
	}

	if result.Kind != "hash" {
		t.Fatalf("expected hash result, got %q", result.Kind)
	}

	value, ok := result.Value.(map[string]any)
	if !ok {
		t.Fatalf("expected hash export, got %T", result.Value)
	}

	if !numericValueEquals(value["numeric_sum"], 44) {
		t.Fatalf("expected numeric_sum 44, got %#v (%T)", value["numeric_sum"], value["numeric_sum"])
	}

	if !numericValueEquals(value["first_match"], 12) {
		t.Fatalf("expected first_match 12, got %#v (%T)", value["first_match"], value["first_match"])
	}
}

func TestRunAllRunnableExamples(t *testing.T) {
	store, err := catalog.Load()
	if err != nil {
		t.Fatalf("load catalog: %v", err)
	}

	service, err := New(store)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	for _, example := range store.All() {
		if !example.Runnable {
			continue
		}

		example := example
		t.Run(example.Slug, func(t *testing.T) {
			if _, err := service.Run(context.Background(), example.Slug); err != nil {
				t.Fatalf("run %s: %v", example.Slug, err)
			}
		})
	}
}

func TestNotificationPreviews(t *testing.T) {
	store, err := catalog.Load()
	if err != nil {
		t.Fatalf("Load(): %v", err)
	}
	service, err := New(store)
	if err != nil {
		t.Fatalf("New(): %v", err)
	}

	for _, tc := range []struct {
		slug string
		want map[string]string
	}{
		{
			slug: "showcase-notifications-sms",
			want: map[string]string{
				"status": "preview",
				"to":     "+12025550123",
				"body":   "Order 1042 is on its way.",
			},
		},
		{
			slug: "showcase-notifications-email",
			want: map[string]string{
				"status":  "preview",
				"to":      "alex@example.com",
				"subject": "Welcome, Alex!",
				"body":    "Hi Alex,\n\nYour account is ready. Thanks for joining us.",
			},
		},
	} {
		t.Run(tc.slug, func(t *testing.T) {
			result, err := service.Run(t.Context(), tc.slug)
			if err != nil {
				t.Fatalf("Run(%q): %v", tc.slug, err)
			}
			got, ok := result.Value.(map[string]any)
			if !ok {
				t.Fatalf("Run(%q) value = %T, want preview hash", tc.slug, result.Value)
			}
			if len(got) != len(tc.want) {
				t.Errorf("Run(%q) fields = %d, want %d", tc.slug, len(got), len(tc.want))
			}
			for key, want := range tc.want {
				if got[key] != want {
					t.Errorf("Run(%q)[%q] = %q, want %q", tc.slug, key, got[key], want)
				}
			}
		})
	}
}

func numericValueEquals(value any, expected int) bool {
	switch typed := value.(type) {
	case int:
		return typed == expected
	case int64:
		return typed == int64(expected)
	case float64:
		return typed == float64(expected)
	default:
		return false
	}
}

func TestMedian(t *testing.T) {
	cases := []struct {
		name   string
		values []time.Duration
		want   time.Duration
	}{
		{"empty", nil, 0},
		{"single", []time.Duration{10}, 10},
		{"odd length takes the middle", []time.Duration{30, 10, 20}, 20},
		{"even length averages the middle pair", []time.Duration{40, 10, 30, 20}, 25},
		{"unsorted input", []time.Duration{5, 100, 1, 50}, 27},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := median(tc.values); got != tc.want {
				t.Fatalf("median(%v) = %v, want %v", tc.values, got, tc.want)
			}
		})
	}
}
