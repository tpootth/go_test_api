package pokemon

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

const pikachuJSON = `{
  "id": 25, "name": "pikachu", "height": 4, "weight": 60,
  "types": [{"type": {"name": "electric"}}],
  "abilities": [{"ability": {"name": "static"}}, {"ability": {"name": "lightning-rod"}}],
  "stats": [{"base_stat": 35, "stat": {"name": "hp"}}],
  "sprites": {"front_default": "small.png", "other": {"official-artwork": {"front_default": "art.png"}}}
}`

func newTestClient(t *testing.T, hits *int32) *Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(hits, 1)
		if strings.HasSuffix(r.URL.Path, "/pikachu") {
			w.Write([]byte(pikachuJSON))
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(srv.Close)

	c := NewClient()
	c.BaseURL = srv.URL + "/"
	return c
}

func TestFetch(t *testing.T) {
	var hits int32
	c := newTestClient(t, &hits)

	p, err := c.Fetch(context.Background(), "Pikachu")
	if err != nil {
		t.Fatal(err)
	}
	if p.ID != 25 || p.Name != "pikachu" || p.HeightM != 0.4 || p.WeightKg != 6 {
		t.Errorf("unexpected pokemon: %+v", p)
	}
	if p.Image != "art.png" || p.PrimaryType() != "electric" || len(p.Abilities) != 2 {
		t.Errorf("unexpected details: %+v", p)
	}

	if _, err := c.Fetch(context.Background(), "pikachu"); err != nil {
		t.Fatal(err)
	}
	if hits != 1 {
		t.Errorf("expected cached second lookup, got %d upstream hits", hits)
	}
}

func TestFetchNotFound(t *testing.T) {
	var hits int32
	c := newTestClient(t, &hits)

	if _, err := c.Fetch(context.Background(), "missingno"); !errors.Is(err, ErrNotFound) {
		t.Errorf("got %v, want ErrNotFound", err)
	}
}

func TestFetchMany(t *testing.T) {
	var hits int32
	c := newTestClient(t, &hits)

	found, errs := c.FetchMany(context.Background(), []string{"pikachu", "missingno"})
	if len(found) != 1 || found[0].Name != "pikachu" {
		t.Errorf("found = %+v", found)
	}
	if len(errs) != 1 {
		t.Errorf("errs = %v", errs)
	}
}
