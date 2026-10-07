# Go Pokédex

A small Go web app that shows Pokémon as cards, using data from [PokeAPI](https://pokeapi.co).
It only needs the standard library.

- Pokémon cards coloured by type, with artwork, height/weight, abilities and base-stat bars
- Search by name or Pokédex number (`pikachu, 151`), or roll a random team
- JSON API at `/api/pokemon`
- Fetches run concurrently and results are cached in memory
- Light and dark mode; works on phones

## Getting started

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
