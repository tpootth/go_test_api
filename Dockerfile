# ---- build ----
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/poke .

# ---- run ----
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/poke /poke
EXPOSE 8080
ENTRYPOINT ["/poke"]
