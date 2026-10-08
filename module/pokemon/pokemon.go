// Package pokemon is a small, cached client for https://pokeapi.co.
package pokemon

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// DefaultBaseURL is the public PokeAPI endpoint for Pokémon resources.
const DefaultBaseURL = "https://pokeapi.co/api/v2/pokemon/"

// ErrNotFound is returned when PokeAPI has no Pokémon with the given name or ID.
var ErrNotFound = errors.New("pokemon not found")

// Pokemon is the cleaned-up view of a Pokémon that the app renders.
type Pokemon struct {
	ID        int      `json:"id"`
	Name      string   `json:"name"`
	HeightM   float64  `json:"height_m"`
	WeightKg  float64  `json:"weight_kg"`
	Types     []string `json:"types"`
	Abilities []string `json:"abilities"`
	Image     string   `json:"image"`
	Stats     []Stat   `json:"stats"`
}

// Stat is one base stat, e.g. {"hp", 35}.
type Stat struct {
	Name  string `json:"name"`
	Value int    `json:"value"`
}

// PrimaryType returns the first type, used for card colouring.
func (p Pokemon) PrimaryType() string {
	if len(p.Types) == 0 {
		return "normal"
	}
	return p.Types[0]
}

// apiPokemon mirrors the subset of the PokeAPI response we use.
type apiPokemon struct {
	ID     int    `json:"id"`
	Name   string `json:"name"`
	Height int    `json:"height"` // decimetres
	Weight int    `json:"weight"` // hectograms
	Types  []struct {
		Type struct {
			Name string `json:"name"`
		} `json:"type"`
	} `json:"types"`
	Abilities []struct {
		Ability struct {
			Name string `json:"name"`
		} `json:"ability"`
	} `json:"abilities"`
	Stats []struct {
		BaseStat int `json:"base_stat"`
		Stat     struct {
			Name string `json:"name"`
		} `json:"stat"`
	} `json:"stats"`
	Sprites struct {
		FrontDefault string `json:"front_default"`
		Other        struct {
			OfficialArtwork struct {
				FrontDefault string `json:"front_default"`
			} `json:"official-artwork"`
		} `json:"other"`
	} `json:"sprites"`
}

func (a apiPokemon) toPokemon() Pokemon {
	p := Pokemon{
		ID:       a.ID,
		Name:     a.Name,
		HeightM:  float64(a.Height) / 10,
		WeightKg: float64(a.Weight) / 10,
		Image:    a.Sprites.Other.OfficialArtwork.FrontDefault,
	}
	if p.Image == "" {
		p.Image = a.Sprites.FrontDefault
	}
	for _, t := range a.Types {
		p.Types = append(p.Types, t.Type.Name)
	}
	for _, ab := range a.Abilities {
		p.Abilities = append(p.Abilities, ab.Ability.Name)
	}
	for _, s := range a.Stats {
		p.Stats = append(p.Stats, Stat{Name: s.Stat.Name, Value: s.BaseStat})
	}
	return p
}

// Client fetches Pokémon from PokeAPI and caches successful lookups in memory.
// It is safe for concurrent use.
type Client struct {
	BaseURL    string
	HTTPClient *http.Client

	mu    sync.RWMutex
	cache map[string]Pokemon
}

// NewClient returns a Client pointed at the public PokeAPI.
func NewClient() *Client {
	return &Client{
		BaseURL:    DefaultBaseURL,
		HTTPClient: &http.Client{Timeout: 10 * time.Second},
		cache:      make(map[string]Pokemon),
	}
}

// Fetch looks up a single Pokémon by name or Pokédex ID.
func (c *Client) Fetch(ctx context.Context, nameOrID string) (Pokemon, error) {
	key := strings.ToLower(strings.TrimSpace(nameOrID))
	if key == "" {
		return Pokemon{}, ErrNotFound
	}

	c.mu.RLock()
	p, ok := c.cache[key]
	c.mu.RUnlock()
	if ok {
		return p, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+url.PathEscape(key), nil)
	if err != nil {
		return Pokemon{}, err
	}
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return Pokemon{}, fmt.Errorf("fetch %q: %w", key, err)
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode == http.StatusNotFound:
		return Pokemon{}, fmt.Errorf("%q: %w", key, ErrNotFound)
	case resp.StatusCode != http.StatusOK:
		io.Copy(io.Discard, resp.Body)
		return Pokemon{}, fmt.Errorf("fetch %q: unexpected status %s", key, resp.Status)
	}

	var raw apiPokemon
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return Pokemon{}, fmt.Errorf("decode %q: %w", key, err)
	}
	p = raw.toPokemon()

	c.mu.Lock()
	c.cache[key] = p
	c.cache[p.Name] = p
	c.mu.Unlock()
	return p, nil
}

// FetchMany looks up several Pokémon concurrently. Results keep the order of
// names; lookups that fail are skipped and reported in the returned errors.
func (c *Client) FetchMany(ctx context.Context, names []string) ([]Pokemon, []error) {
	results := make([]Pokemon, len(names))
	errs := make([]error, len(names))

	var wg sync.WaitGroup
	for i, name := range names {
		wg.Add(1)
		go func(i int, name string) {
			defer wg.Done()
			results[i], errs[i] = c.Fetch(ctx, name)
		}(i, name)
	}
	wg.Wait()

	found := make([]Pokemon, 0, len(names))
	var failed []error
	for i := range names {
		if errs[i] != nil {
			failed = append(failed, errs[i])
			continue
		}
		found = append(found, results[i])
	}
	return found, failed
}
