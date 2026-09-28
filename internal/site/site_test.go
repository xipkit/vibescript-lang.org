package site

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/xipkit/vibescript-lang.org/internal/catalog"
	"github.com/xipkit/vibescript-lang.org/internal/runner"
)

func TestHomePageRendersFeaturedExamples(t *testing.T) {
	app := newTestApp(t)

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	recorder := httptest.NewRecorder()

	app.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	body := recorder.Body.String()
	for _, want := range []string{"Send an SMS", "Send an email", "Value boundaries", "Release readiness"} {
		if !strings.Contains(body, want) {
			t.Fatalf("expected homepage to contain %q", want)
		}
	}

	if !strings.Contains(body, "/api/examples/showcase-notifications-sms/run") {
		t.Fatalf("expected hero runner wiring, got %q", body)
	}
}

func TestHomePageRendersRealGuardrailValues(t *testing.T) {
	app := newTestApp(t)

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	recorder := httptest.NewRecorder()

	app.ServeHTTP(recorder, request)

	body := recorder.Body.String()
	for _, value := range []string{"250k steps", "256 KiB", "depth 32"} {
		if !strings.Contains(body, value) {
			t.Fatalf("expected guardrail value %q from runner.EngineConfig, got %q", value, body)
		}
	}
}

func TestRunHeroExample(t *testing.T) {
	app := newTestApp(t)

	request := httptest.NewRequest(http.MethodPost, "/api/examples/showcase-notifications-sms/run", nil)
	recorder := httptest.NewRecorder()

	app.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	if body := recorder.Body.String(); !strings.Contains(body, "Order 1042 is on its way.") || !strings.Contains(body, `"status":"preview"`) {
		t.Fatalf("expected hero example output, got %q", body)
	}
}

func TestExamplesPageRendersCatalog(t *testing.T) {
	app := newTestApp(t)

	request := httptest.NewRequest(http.MethodGet, "/examples", nil)
	recorder := httptest.NewRecorder()

	app.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	body := recorder.Body.String()
	if !strings.Contains(body, "Browse examples") {
		t.Fatalf("expected catalog intro, got %q", body)
	}

	if !strings.Contains(body, "Strings Operations") {
		t.Fatalf("expected example listing, got %q", body)
	}
}

func TestExamplePageRendersDetail(t *testing.T) {
	app := newTestApp(t)

	request := httptest.NewRequest(http.MethodGet, "/examples/strings-operations", nil)
	recorder := httptest.NewRecorder()

	app.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	body := recorder.Body.String()
	if !strings.Contains(body, "Strings Operations") {
		t.Fatalf("expected detail title, got %q", body)
	}

	if !strings.Contains(body, "Run example") {
		t.Fatalf("expected runner copy, got %q", body)
	}
}

func TestReferencePageRendersContentAndSidebar(t *testing.T) {
	app := newTestApp(t)

	request := httptest.NewRequest(http.MethodGet, "/reference", nil)
	recorder := httptest.NewRecorder()

	app.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	body := recorder.Body.String()
	for _, want := range []string{
		"Language Reference",
		`data-reference-nav`,
		`href="#basics"`,
		`id="parameters"`,
		`id="app-services"`,
		`class="language-vibe"`,
		catalog.UpstreamVersion,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("expected reference page to contain %q", want)
		}
	}
}

func TestNotificationPagesShowGoAdapters(t *testing.T) {
	app := newTestApp(t)
	for _, slug := range []string{"showcase-notifications-sms", "showcase-notifications-email"} {
		t.Run(slug, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/examples/"+slug, nil)
			recorder := httptest.NewRecorder()
			app.ServeHTTP(recorder, request)
			if recorder.Code != http.StatusOK {
				t.Fatalf("GET /examples/%s status = %d, want 200", slug, recorder.Code)
			}
			for _, want := range []string{`class="language-go"`, "NewTypedBuiltin", `href="/reference#app-services"`, "message preview"} {
				if !strings.Contains(recorder.Body.String(), want) {
					t.Errorf("GET /examples/%s missing %q", slug, want)
				}
			}
		})
	}
}

func TestMissingExampleReturnsNotFound(t *testing.T) {
	app := newTestApp(t)

	request := httptest.NewRequest(http.MethodGet, "/examples/does-not-exist", nil)
	recorder := httptest.NewRecorder()

	app.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", recorder.Code)
	}
}

func TestHealthz(t *testing.T) {
	app := newTestApp(t)

	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	recorder := httptest.NewRecorder()

	app.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	if !strings.Contains(recorder.Body.String(), `"status":"ok"`) {
		t.Fatalf("expected health payload, got %q", recorder.Body.String())
	}
}

func TestRunExample(t *testing.T) {
	app := newTestApp(t)

	request := httptest.NewRequest(http.MethodPost, "/api/examples/control-flow-case-when/run", nil)
	recorder := httptest.NewRecorder()

	app.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	body := recorder.Body.String()
	if !strings.Contains(body, `"kind":"array"`) {
		t.Fatalf("expected array result, got %q", body)
	}

	if !strings.Contains(body, `"perfect"`) {
		t.Fatalf("expected runnable output, got %q", body)
	}
}

func TestStaticAsset(t *testing.T) {
	app := newTestApp(t)

	request := httptest.NewRequest(http.MethodGet, "/static/site.css", nil)
	recorder := httptest.NewRecorder()

	app.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	if !strings.Contains(recorder.Body.String(), "--font-display") {
		t.Fatalf("expected stylesheet body, got %q", recorder.Body.String())
	}
}

func TestGzipHomePage(t *testing.T) {
	app := newTestApp(t)

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("Accept-Encoding", "gzip")
	recorder := httptest.NewRecorder()

	app.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	if got := recorder.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("expected gzip content encoding, got %q", got)
	}

	body := readGzipBody(t, recorder)
	if !strings.Contains(body, "<!doctype html>") {
		t.Fatalf("expected gzipped HTML document, got %q", body)
	}
}

func TestGzipStaticAsset(t *testing.T) {
	app := newTestApp(t)

	request := httptest.NewRequest(http.MethodGet, "/static/site.css", nil)
	request.Header.Set("Accept-Encoding", "gzip")
	recorder := httptest.NewRecorder()

	app.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	if got := recorder.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("expected gzip content encoding, got %q", got)
	}

	if got := recorder.Header().Get("Accept-Ranges"); got != "" {
		t.Fatalf("expected no accept-ranges header, got %q", got)
	}

	body := readGzipBody(t, recorder)
	if !strings.Contains(body, "--font-display") {
		t.Fatalf("expected stylesheet body, got %q", body)
	}
}

func TestGzipHeadStaticAsset(t *testing.T) {
	app := newTestApp(t)

	request := httptest.NewRequest(http.MethodHead, "/static/site.css", nil)
	request.Header.Set("Accept-Encoding", "gzip")
	recorder := httptest.NewRecorder()

	app.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	if got := recorder.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("expected gzip content encoding, got %q", got)
	}

	if got := recorder.Header().Get("Content-Length"); got != "" {
		t.Fatalf("expected no content-length header, got %q", got)
	}

	if got := recorder.Body.String(); got != "" {
		t.Fatalf("expected empty HEAD body, got %q", got)
	}
}

func TestLegacyHostRedirect(t *testing.T) {
	app := newTestApp(t)

	request := httptest.NewRequest(http.MethodGet, "https://vibescript.mauriciogomes.com/examples?tag=arrays", nil)
	recorder := httptest.NewRecorder()

	app.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusMovedPermanently {
		t.Fatalf("expected status 301, got %d", recorder.Code)
	}

	want := "https://vibescript-lang.org/examples?tag=arrays"
	if got := recorder.Header().Get("Location"); got != want {
		t.Fatalf("expected redirect %q, got %q", want, got)
	}
}

func TestRequestTimeoutWritesGatewayTimeoutWhenDeadlineExpires(t *testing.T) {
	handler := requestTimeout(time.Nanosecond)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusGatewayTimeout {
		t.Fatalf("expected status 504, got %d", recorder.Code)
	}

	if !strings.Contains(recorder.Body.String(), http.StatusText(http.StatusGatewayTimeout)) {
		t.Fatalf("expected timeout body, got %q", recorder.Body.String())
	}
}

func TestRequestTimeoutDoesNotOverwriteCommittedResponse(t *testing.T) {
	handler := requestTimeout(time.Nanosecond)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
		<-r.Context().Done()
	}))

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusAccepted {
		t.Fatalf("expected status 202, got %d", recorder.Code)
	}
}

func newTestApp(t *testing.T) http.Handler {
	t.Helper()

	store, err := catalog.Load()
	if err != nil {
		t.Fatalf("load catalog: %v", err)
	}

	runService, err := runner.New(store)
	if err != nil {
		t.Fatalf("new runner: %v", err)
	}

	app, err := New(store, runService)
	if err != nil {
		t.Fatalf("new app: %v", err)
	}

	return app
}

func readGzipBody(t *testing.T, recorder *httptest.ResponseRecorder) string {
	t.Helper()

	reader, err := gzip.NewReader(recorder.Body)
	if err != nil {
		t.Fatalf("gzip.NewReader(response body) error = %v, want nil", err)
	}
	defer reader.Close()

	body, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("io.ReadAll(gzip response body) error = %v, want nil", err)
	}
	return string(body)
}
