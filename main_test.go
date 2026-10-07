package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"poke/module/pokemon"
)

func newTestServer(t *testing.T) *server {
	t.Helper()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/pikachu") {
			w.Write([]byte(`{"id":25,"name":"pikachu","height":4,"weight":60,
				"types":[{"type":{"name":"electric"}}],
				"abilities":[{"ability":{"name":"lightning-rod"}}],
				"stats":[{"base_stat":90,"stat":{"name":"speed"}}]}`))
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(upstream.Close)

	client := pokemon.NewClient()
	client.BaseURL = upstream.URL + "/"
	return &server{client: client, tmpl: parseTemplates(), trainer: "Ash"}
}

func TestIndexRendersCards(t *testing.T) {
	s := newTestServer(t)
	rec := httptest.NewRecorder()
	s.handleIndex(rec, httptest.NewRequest(http.MethodGet, "/?q=pikachu,missingno", nil))

	body := rec.Body.String()
	for _, want := range []string{"Hello, Ash!", "Pikachu", "#0025", "Lightning Rod", "1 not found"} {
		if !strings.Contains(body, want) {
			t.Errorf("page missing %q", want)
		}
	}
}

func TestAPI(t *testing.T) {
	s := newTestServer(t)
	rec := httptest.NewRecorder()
	s.handleAPI(rec, httptest.NewRequest(http.MethodGet, "/api/pokemon?q=pikachu", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"name": "pikachu"`) {
		t.Errorf("unexpected body: %s", rec.Body)
	}
}

func TestTitle(t *testing.T) {
	if got := title("lightning-rod"); got != "Lightning Rod" {
		t.Errorf("title = %q", got)
	}
}
