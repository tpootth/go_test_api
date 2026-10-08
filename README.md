# Go Pokédex

A small Go web app that shows Pokémon as cards, using data from [PokeAPI](https://pokeapi.co).
It only needs the standard library.

- Pokémon cards coloured by type, with artwork, height/weight, abilities and base-stat bars
- Search by name or Pokédex number (`pikachu, 151`), or roll a random team
- JSON API at `/api/pokemon`
- Fetches run concurrently and results are cached in memory
- Light and dark mode; works on phones

## Web app (GitHub Pages)

`web/` holds a static version of the Pokédex that runs entirely in the browser and talks to PokeAPI directly:
browse by generation and type, search by partial name or number, and open any Pokémon for its Pokédex entry,
abilities, base stats and shiny artwork. Link straight to one with `#25`.

The page opens on the **Network** view: a [d3.js](https://d3js.org) bubble network of the loaded Pokémon: each type
is a hub, each Pokémon is a bubble (sized by base stat total) linked to its types, so dual-types sit between
their two hubs. Hover to highlight connections, drag to rearrange, click a bubble for details. The **Cards** view
shows the same Pokémon as a grid.

It is deployed by `.github/workflows/pages.yml`, which publishes `web/` to the `gh-pages` branch on every
push to `master` that touches `web/`. Live at **https://tpootth.github.io/go_test_api/**.

Preview locally:

```bash
python3 -m http.server -d web 8000   # open http://localhost:8000
```

## Go server



```bash
go run .
# open http://localhost:8080
```

Or with Docker:

```bash
docker build -t go-pokedex .
docker run --rm -p 8080:8080 go-pokedex
```

## Endpoints

| Path | Description |
| --- | --- |
| `GET /` | Pokédex page (starter team by default) |
| `GET /?q=pikachu,25` | Search by names and/or numbers |
| `GET /?random=1` | 10 random Pokémon |
| `GET /api/pokemon` | Same lookups as JSON (`q` and `random` work too) |
| `GET /healthz` | Health check |

Example:

```bash
curl "http://localhost:8080/api/pokemon?q=pikachu"
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | Port to listen on |
| `TRAINER_NAME` | `Phuphu` | Name used in the greeting |
| `POKEAPI_URL` | `https://pokeapi.co/api/v2/pokemon/` | PokeAPI base URL |

## Project layout

```
.
├── main.go                    # HTTP server, routes, handlers
├── templates/index.html       # Page template (embedded into the binary)
├── web/                       # Static web app for GitHub Pages
└── module/
    ├── greeter/               # Greeting message
    ├── pokemon/               # Cached PokeAPI client
    └── randompoke/            # Random Pokédex IDs
```

## Development

```bash
make test   # go test ./...
make vet    # go vet ./...
make fmt    # gofmt -w .
```
