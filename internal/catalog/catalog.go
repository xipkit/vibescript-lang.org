package catalog

import (
	"fmt"
	"hash/fnv"
	"io/fs"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/mgomes/vibescript/vibes"
	"github.com/xipkit/vibescript-lang.org/internal/notifications"
)

const (
	UpstreamRepoURL  = "https://github.com/xipkit/vibescript"
	UpstreamVersion  = "v0.70.0"
	upstreamRevision = "v0.70.0"
)

var featuredExamples = map[string]int{
	"control_flow/case_when.vibe": 100,
	"strings/operations.vibe":     101,
	"stdlib/core_utilities.vibe":  102,
	"enums/operations.vibe":       103,
}

var upstreamSummaries = map[string]string{
	"arrays/extras.vibe":                 "Use array helpers to search, sort, combine, and inspect values.",
	"background/jobs_and_events.vibe":    "Queue jobs and publish events through APIs from the Go app.",
	"basics/functions_and_calls.vibe":    "Define functions, call other functions, and return values.",
	"basics/literals_and_operators.vibe": "Work with numbers, strings, arrays, hashes, and common operators.",
	"basics/namespaces.vibe":             "Group constants and module functions under a namespace.",
	"blocks/advanced.vibe":               "Filter, group, and reduce data with blocks.",
	"blocks/enumerable_reports.vibe":     "Group donations and total the money in each currency.",
	"blocks/transformations.vibe":        "Map, filter, and reduce collections with blocks.",
	"blocks/yield_patterns.vibe":         "Write functions that accept and yield to blocks.",
	"capabilities/context_access.vibe":   "Read the current user from context provided by the Go app.",
	"capabilities/database_queries.vibe": "Query and update data through a database API from the Go app.",
	"capabilities/iteration.vibe":        "Iterate over records returned by an API from the Go app.",
	"collections/arrays.vibe":            "Read, build, and update arrays.",
	"collections/hashes.vibe":            "Build, update, and read nested hashes.",
	"collections/symbols.vibe":           "Use labels, strings, and symbols in one string-key hash space.",
	"control_flow/case_when.vibe":        "Match values and ranges with case and when.",
	"control_flow/conditionals.vibe":     "Choose values with if, elsif, else, and unless.",
	"control_flow/loop_control.vibe":     "Skip and stop loop iterations with next and break.",
	"control_flow/recursion.vibe":        "Write factorial and Fibonacci functions with recursion.",
	"control_flow/until_loop.vibe":       "Repeat work with an until loop.",
	"control_flow/while_loop.vibe":       "Repeat work with a while loop.",
	"durations/durations.vibe":           "Create durations and add them together.",
	"enums/operations.vibe":              "Define enums and inspect their values.",
	"errors/assertions.vibe":             "Check inputs with assertions.",
	"hashes/operations.vibe":             "Merge, search, and count values in hashes.",
	"hashes/transformations.vibe":        "Rename, filter, and transform hash keys and values.",
	"loops/advanced.vibe":                "Nest loops and stop early with break.",
	"loops/fizzbuzz.vibe":                "Write FizzBuzz with a loop and conditionals.",
	"loops/iteration.vibe":               "Iterate over ranges and arrays with common loop helpers.",
	"money/operations.vibe":              "Add, subtract, and compare money values.",
	"policies/access_control.vibe":       "Write access rules as small functions.",
	"ranges/usage.vibe":                  "Create ascending and descending ranges, then filter their values.",
	"stdlib/core_utilities.vibe":         "Parse JSON and time values, then create IDs.",
	"strings/operations.vibe":            "Normalize, split, search, and inspect strings.",
	"time/duration.vibe":                 "Add durations to times and use duration arithmetic.",
}

var runEntryPointPattern = regexp.MustCompile(`(?m)^def run\b`)

type Example struct {
	Slug        string
	Title       string
	Summary     string
	Description string
	Category    string
	Difficulty  string
	Topic       string
	Origin      string
	Stage       string
	Featured    bool
	Runnable    bool
	Tags        []string
	Source      string
	SourcePath  string
	SourceURL   string
	RunFunction string
	FeatureRank int
	// HostSource is the Go adapter used to run this example, when present.
	HostSource string
	// Capabilities contains the host adapters available to this example.
	Capabilities []vibes.CapabilityAdapter
}

// AccentSlots is the number of syntax-token colors the site cycles chips through.
const AccentSlots = 6

// Accent maps a label to a stable slot in the syntax-token palette, so a given
// category keeps the same chip color across pages and reloads.
func Accent(label string) int {
	hash := fnv.New32a()
	hash.Write([]byte(label))
	return int(hash.Sum32() % AccentSlots)
}

// SourceBody returns Source with the leading metadata comment block removed,
// mirroring the lines parseMetadata consumes.
func (e Example) SourceBody() string {
	lines := strings.Split(e.Source, "\n")
	body := 0
	for body < len(lines) {
		trimmed := strings.TrimSpace(lines[body])
		if trimmed == "" || (strings.HasPrefix(trimmed, "# ") && strings.Contains(trimmed, ":")) {
			body++
			continue
		}
		break
	}
	return strings.TrimRight(strings.Join(lines[body:], "\n"), "\n")
}

type Store struct {
	examples      []Example
	featured      []Example
	bySlug        map[string]Example
	runnableCount int
}

func Load() (*Store, error) {
	examples := make([]Example, 0, 64)

	err := fs.WalkDir(content, "content", func(filePath string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || path.Ext(filePath) != ".vibe" {
			return nil
		}

		source, err := fs.ReadFile(content, filePath)
		if err != nil {
			return fmt.Errorf("read %s: %w", filePath, err)
		}

		example, ok, err := loadExample(filePath, source)
		if err != nil {
			return err
		}
		if !ok {
			return nil
		}

		examples = append(examples, example)

		return nil
	})
	if err != nil {
		return nil, err
	}

	titleCounts := make(map[string]int, len(examples))
	for _, example := range examples {
		titleCounts[example.Title]++
	}
	for i := range examples {
		if titleCounts[examples[i].Title] > 1 {
			examples[i].Title = examples[i].Category + " " + examples[i].Title
		}
	}

	// Hand-written showcase examples lead the catalog; the bulk imports follow.
	// Alphabetical category order alone would bury them under 170 imports.
	sort.Slice(examples, func(i, j int) bool {
		left := examples[i]
		right := examples[j]
		if rank := originRank(left.Origin) - originRank(right.Origin); rank != 0 {
			return rank < 0
		}
		if left.Category != right.Category {
			return left.Category < right.Category
		}
		return left.Title < right.Title
	})

	store := &Store{
		examples: make([]Example, len(examples)),
		bySlug:   make(map[string]Example, len(examples)),
	}
	copy(store.examples, examples)

	for _, example := range store.examples {
		store.bySlug[example.Slug] = example
		if example.Runnable {
			store.runnableCount++
		}
		if example.Featured {
			store.featured = append(store.featured, example)
		}
	}

	sort.Slice(store.featured, func(i, j int) bool {
		left := store.featured[i]
		right := store.featured[j]
		if left.FeatureRank != right.FeatureRank {
			return left.FeatureRank < right.FeatureRank
		}
		if left.Category != right.Category {
			return left.Category < right.Category
		}
		return left.Title < right.Title
	})

	return store, nil
}

func loadExample(filePath string, source []byte) (Example, bool, error) {
	relativeToContent := strings.TrimPrefix(filePath, "content/")
	parts := strings.Split(relativeToContent, "/")
	if len(parts) < 2 {
		return Example{}, false, nil
	}

	switch parts[0] {
	case "showcase":
		return loadShowcaseExample(strings.Join(parts[1:], "/"), source), true, nil
	case "upstream":
		return loadUpstreamExample(strings.Join(parts[1:], "/"), source), true, nil
	case "rosettacode":
		return loadRosettaCodeExample(strings.Join(parts[1:], "/"), source), true, nil
	default:
		return Example{}, false, nil
	}
}

func loadUpstreamExample(relativePath string, source []byte) Example {
	categoryKey := path.Dir(relativePath)
	titleKey := strings.TrimSuffix(path.Base(relativePath), ".vibe")
	runnable := runEntryPointPattern.Match(source)

	stage := "Imported"
	summary := upstreamSummaries[relativePath]
	if summary == "" {
		summary = "A Vibescript example from the upstream repository."
	}
	description := "This example comes from the Vibescript repository."
	runFunction := ""
	if runnable {
		stage = "Runnable"
		description = "This example has a run function, so you can run it in your browser."
		runFunction = "run"
	}

	tags := []string{"upstream", slugPart(categoryKey)}
	if runnable {
		tags = append(tags, "browser-runner")
	}

	return Example{
		Slug:        slugPart(strings.TrimSuffix(relativePath, ".vibe")),
		Title:       titleize(titleKey),
		Summary:     summary,
		Description: description,
		Category:    titleize(categoryKey),
		Difficulty:  "Reference",
		Topic:       titleize(categoryKey),
		Origin:      "Upstream",
		Stage:       stage,
		Featured:    isFeatured(relativePath),
		Runnable:    runnable,
		Tags:        tags,
		Source:      string(source),
		SourcePath:  relativePath,
		SourceURL:   fmt.Sprintf("%s/blob/%s/examples/%s", UpstreamRepoURL, upstreamRevision, relativePath),
		RunFunction: runFunction,
		FeatureRank: featuredExamples[relativePath],
	}
}

func loadRosettaCodeExample(relativePath string, source []byte) Example {
	metadata := parseMetadata(string(source))
	titleKey := strings.TrimSuffix(path.Base(relativePath), ".vibe")
	title := metadata["title"]
	if title == "" {
		title = titleize(titleKey)
	}

	category := metadata["category"]
	if category == "" {
		category = "Rosetta Code"
	}

	difficulty := metadata["difficulty"]
	if difficulty == "" {
		difficulty = "Reference"
	}

	runnable := runEntryPointPattern.Match(source)
	stage := metadata["stage"]
	if stage == "" {
		if runnable {
			stage = "Runnable"
		} else {
			stage = "Draft"
		}
	}

	summary := metadata["summary"]
	if summary == "" {
		if runnable {
			summary = fmt.Sprintf("Run the Rosetta Code task %q in Vibescript.", title)
		} else {
			summary = fmt.Sprintf("A Vibescript draft of the Rosetta Code task %q.", title)
		}
	}

	description := metadata["description"]
	if description == "" {
		description = "This example comes from Rosetta Code."
	}

	sourceURL := metadata["source"]
	if sourceURL == "" {
		sourceURL = "https://rosettacode.org/wiki/" + strings.ReplaceAll(title, " ", "_")
	}

	tags := []string{"rosetta-code"}
	if extra := splitMetadataList(metadata["tags"]); len(extra) > 0 {
		tags = append(tags, extra...)
	}
	if runnable {
		tags = append(tags, "browser-runner")
	}

	runFunction := ""
	if runnable {
		runFunction = "run"
	}

	featured := metadata["featured"] == "true"
	featureRank := 0
	if featured {
		featureRank = parseFeatureRank(metadata["feature_rank"], 500)
	}

	return Example{
		Slug:        "rosettacode-" + slugPart(strings.TrimSuffix(relativePath, ".vibe")),
		Title:       title,
		Summary:     summary,
		Description: description,
		Category:    category,
		Difficulty:  difficulty,
		Topic:       category,
		Origin:      "Rosetta Code",
		Stage:       stage,
		Featured:    featured,
		Runnable:    runnable,
		Tags:        dedupe(tags),
		Source:      string(source),
		SourcePath:  "rosettacode/" + relativePath,
		SourceURL:   sourceURL,
		RunFunction: runFunction,
		FeatureRank: featureRank,
	}
}

func loadShowcaseExample(relativePath string, source []byte) Example {
	metadata := parseMetadata(string(source))
	titleKey := strings.TrimSuffix(path.Base(relativePath), ".vibe")
	title := metadata["title"]
	if title == "" {
		title = titleize(titleKey)
	}

	category := metadata["category"]
	if category == "" {
		category = "Vibescript Showcase"
	}

	difficulty := metadata["difficulty"]
	if difficulty == "" {
		difficulty = "Showcase"
	}

	runnable := runEntryPointPattern.Match(source)
	stage := metadata["stage"]
	if stage == "" {
		if runnable {
			stage = "Showcase"
		} else {
			stage = "Draft"
		}
	}

	summary := metadata["summary"]
	if summary == "" {
		summary = fmt.Sprintf("%s written in Vibescript.", title)
	}

	description := metadata["description"]
	if description == "" {
		description = "This example uses Vibescript types and functions to solve a common app problem."
	}

	tags := []string{"showcase", "idiomatic-vibescript"}
	if extra := splitMetadataList(metadata["tags"]); len(extra) > 0 {
		tags = append(tags, extra...)
	}
	if runnable {
		tags = append(tags, "browser-runner")
	}

	runFunction := ""
	if runnable {
		runFunction = "run"
	}

	featured := metadata["featured"] == "true"
	featureRank := 0
	if featured {
		featureRank = parseFeatureRank(metadata["feature_rank"], 0)
	}

	// The showcase corpus shares one category, so the topic comes from the
	// subdirectory (finance, workflows, ...) to give cards a meaningful chip.
	topic := category
	if dir := path.Dir(relativePath); dir != "." {
		topic = titleize(dir)
	}

	var hostSource string
	var capabilities []vibes.CapabilityAdapter
	switch relativePath {
	case "notifications/sms.vibe":
		hostSource = notifications.SMSSource
		capabilities = []vibes.CapabilityAdapter{notifications.SMS{}}
	case "notifications/email.vibe":
		hostSource = notifications.EmailSource
		capabilities = []vibes.CapabilityAdapter{notifications.Email{}}
	}

	return Example{
		Slug:         "showcase-" + slugPart(strings.TrimSuffix(relativePath, ".vibe")),
		Title:        title,
		Summary:      summary,
		Description:  description,
		Category:     category,
		Difficulty:   difficulty,
		Topic:        topic,
		Origin:       "Showcase",
		Stage:        stage,
		Featured:     featured,
		Runnable:     runnable,
		Tags:         dedupe(tags),
		Source:       string(source),
		SourcePath:   "showcase/" + relativePath,
		SourceURL:    metadata["source"],
		HostSource:   hostSource,
		Capabilities: capabilities,
		RunFunction:  runFunction,
		FeatureRank:  featureRank,
	}
}

func parseMetadata(source string) map[string]string {
	metadata := map[string]string{}
	for _, line := range strings.Split(source, "\n") {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "# ") || !strings.Contains(trimmed, ":") {
			if trimmed == "" {
				continue
			}
			break
		}

		parts := strings.SplitN(strings.TrimPrefix(trimmed, "# "), ":", 2)
		key := strings.ToLower(strings.TrimSpace(parts[0]))
		value := strings.TrimSpace(parts[1])
		metadata[key] = value
	}

	return metadata
}

func splitMetadataList(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}

	parts := strings.Split(value, ",")
	items := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			items = append(items, trimmed)
		}
	}

	return items
}

func (s *Store) All() []Example {
	ordered := make([]Example, len(s.examples))
	copy(ordered, s.examples)
	return ordered
}

func (s *Store) Featured(limit int) []Example {
	if limit > len(s.featured) {
		limit = len(s.featured)
	}
	featured := make([]Example, limit)
	copy(featured, s.featured[:limit])
	return featured
}

func (s *Store) BySlug(slug string) (Example, bool) {
	example, ok := s.bySlug[slug]
	return example, ok
}

func (s *Store) Count() int {
	return len(s.examples)
}

func (s *Store) RunnableCount() int {
	return s.runnableCount
}

func (s *Store) TaggedCount(tag string) int {
	count := 0
	for _, example := range s.examples {
		for _, current := range example.Tags {
			if current == tag {
				count++
				break
			}
		}
	}
	return count
}

func originRank(origin string) int {
	switch origin {
	case "Showcase":
		return 0
	case "Upstream":
		return 1
	default:
		return 2
	}
}

func isFeatured(relativePath string) bool {
	_, ok := featuredExamples[relativePath]
	return ok
}

func slugPart(value string) string {
	replacer := strings.NewReplacer("/", "-", "_", "-", ".", "-")
	return replacer.Replace(strings.ToLower(value))
}

func titleize(value string) string {
	value = strings.ReplaceAll(value, "/", " ")
	value = strings.ReplaceAll(value, "_", " ")
	parts := strings.Fields(value)
	for i, part := range parts {
		parts[i] = strings.ToUpper(part[:1]) + part[1:]
	}
	return strings.Join(parts, " ")
}

func dedupe(values []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func parseFeatureRank(value string, fallback int) int {
	if strings.TrimSpace(value) == "" {
		return fallback
	}

	rank, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return fallback
	}

	return rank
}
