package pokemon

import (
	"encoding/json"
	"io/ioutil"
	"log"
	"net/http"
	"strings"
)

type Pokemon struct {
    Name      string     `json:"name"`
    Height    int        `json:"height"`
    Weight    int        `json:"weight"`
    Types     []Type     `json:"types"`
    Abilities []Ability  `json:"abilities"`
}

type Type struct {
    TypeInfo struct {
        Name string `json:"name"`
    } `json:"type"`
}

type Ability struct {
    AbilityInfo struct {
        Name string `json:"name"`
    } `json:"ability"`
}

func FetchPokemon(pokemonName string) Pokemon {
    url := "https://pokeapi.co/api/v2/pokemon/" + pokemonName

    resp, err := http.Get(url)
    if err != nil {
        log.Fatal(err)
    }
    defer resp.Body.Close()

    body, err := ioutil.ReadAll(resp.Body)
    if err != nil {
        log.Fatal(err)
    }

    var pokemon Pokemon
    if err := json.Unmarshal(body, &pokemon); err != nil {
        log.Fatal(err)
    }

    return pokemon
}

func FormatTypes(types []Type) string {
    var typeNames []string
    for _, t := range types {
        typeNames = append(typeNames, t.TypeInfo.Name)
    }
    return strings.Join(typeNames, ", ")
}

// Helper function to format ability names from the Abilities slice.
func FormatAbilities(abilities []Ability) string {
    var abilityNames []string
    for _, a := range abilities {
        abilityNames = append(abilityNames, a.AbilityInfo.Name)
    }
    return strings.Join(abilityNames, ", ")
}
