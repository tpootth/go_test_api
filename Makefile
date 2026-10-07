.PHONY: run build test fmt vet docker

run:
	go run .

build:
	go build -o bin/poke .

test:
	go test ./...

fmt:
	gofmt -w .

vet:
	go vet ./...

docker:
	docker build -t go-pokedex .
	docker run --rm -p 8080:8080 go-pokedex
