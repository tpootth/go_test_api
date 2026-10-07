// Command poke serves a small Pokédex web page and JSON API backed by PokeAPI.
package main

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"html/template"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"poke/module/greeter"
	"poke/module/pokemon"
	"poke/module/randompoke"
)

//go:embed templates/index.html
var templateFS embed.FS

// defaultTeam is shown when no search or random roll is requested.
var defaultTeam = []string{
	"bulbasaur", "charmander", "squirtle", "pikachu", "jigglypuff",
	"meowth", "psyduck", "machop", "geodude", "eevee",
}

const randomCount = 10

type server struct {
	client  *pokemon.Client
	tmpl    *template.Template
	trainer string
}

// pageData is what templates/index.html renders.
type pageData struct {
	Greeting  string
	Query     string
	Random    bool
	Pokemon   []pokemon.Pokemon
	Failed    int
	Generated string
	Elapsed   string
}

func main() {
	client := pokemon.NewClient()
	client.BaseURL = getenv("POKEAPI_URL", pokemon.DefaultBaseURL)

	s := &server{
		client:  client,
		tmpl:    parseTemplates(),
		trainer: getenv("TRAINER_NAME", "Phuphu"),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/api/pokemon", s.handleAPI)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})

	srv := &http.Server{
		Addr:              ":" + getenv("PORT", "8080"),
		Handler:           logRequests(mux),
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      30 * time.Second,
	}

	go func() {
		log.Printf("Pokédex listening on http://localhost%s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}

func parseTemplates() *template.Template {
	return template.Must(template.New("index.html").Funcs(template.FuncMap{
		"title":    title,
		"statName": statName,
		"statPct":  func(v int) int { return min(v*100/255, 100) }, // 255 is the max base stat
	}).ParseFS(templateFS, "templates/index.html"))
}

// lookup resolves the request's query parameters into a list of Pokémon.
// ?q=pikachu,25 searches by name or ID; ?random=1 rolls a random team.
func (s *server) lookup(r *http.Request) (pageData, error) {
	start := time.Now()
	data := pageData{
		Greeting: greeter.Greet(s.trainer),
		Query:    strings.TrimSpace(r.URL.Query().Get("q")),
		Random:   r.URL.Query().Get("random") != "",
	}

	names := defaultTeam
	switch {
	case data.Query != "":
		names = splitQuery(data.Query)
	case data.Random:
		names = randompoke.RandomIDs(randomCount)
	}

	found, errs := s.client.FetchMany(r.Context(), names)
	for _, err := range errs {
		log.Printf("lookup: %v", err)
	}

	data.Pokemon = found
	data.Failed = len(errs)
	data.Generated = time.Now().Format("2006-01-02 15:04:05")
	data.Elapsed = time.Since(start).Round(time.Millisecond).String()

	if len(found) == 0 && len(errs) > 0 && !allNotFound(errs) {
		return data, errs[0]
	}
	return data, nil
}

func (s *server) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	data, err := s.lookup(r)
	if err != nil {
		w.WriteHeader(http.StatusBadGateway)
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := s.tmpl.Execute(w, data); err != nil {
		log.Printf("render: %v", err)
	}
}

func (s *server) handleAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")

	data, err := s.lookup(r)
	if err != nil {
		w.WriteHeader(http.StatusBadGateway)
		enc.Encode(map[string]string{"error": err.Error()})
		return
	}
	enc.Encode(map[string]any{
		"count":   len(data.Pokemon),
		"failed":  data.Failed,
		"pokemon": data.Pokemon,
	})
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s (%s)", r.Method, r.URL.RequestURI(), time.Since(start).Round(time.Millisecond))
	})
}

func splitQuery(q string) []string {
	var names []string
	for _, part := range strings.FieldsFunc(q, func(r rune) bool { return r == ',' || r == ' ' }) {
		names = append(names, strings.ToLower(part))
	}
	return names
}

func allNotFound(errs []error) bool {
	for _, err := range errs {
		if !errors.Is(err, pokemon.ErrNotFound) {
			return false
		}
	}
	return true
}

// title turns "lightning-rod" into "Lightning Rod".
func title(s string) string {
	words := strings.Fields(strings.ReplaceAll(s, "-", " "))
	for i, w := range words {
		words[i] = strings.ToUpper(w[:1]) + w[1:]
	}
	return strings.Join(words, " ")
}

// statName shortens PokeAPI stat names for display ("special-attack" -> "Sp. Atk").
func statName(s string) string {
	short := map[string]string{
		"hp": "HP", "attack": "Atk", "defense": "Def",
		"special-attack": "Sp. Atk", "special-defense": "Sp. Def", "speed": "Speed",
	}
	if v, ok := short[s]; ok {
		return v
	}
	return title(s)
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
