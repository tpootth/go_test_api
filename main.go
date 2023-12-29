package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"poke/module/greeter"
	"poke/module/pokemon"
	"sync"
	"time"
)

var jsonData = `[
    "bulbasaur",
    "charmander",
    "squirtle",
    "pikachu",
    "jigglypuff",
    "meowth",
    "psyduck",
    "machop",
    "geodude",
    "eevee"
]`

//update wtf how i cod docker - -"
// var jsonData = pokemonRandomizer.getRandomPokemonNames(10)

var push_name = "Phuphu!!"

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		greetery(w, push_name)
		
		// jsonData, err := pokemonRandomizer.getRandomPokemonNames(10)
		// if err != nil {
		// 	fmt.Fprintf(w, "Error getting random Pokémon names: %s", err)
		// 	return
		// }d

		var pokemonNames []string
		if err := json.Unmarshal([]byte(jsonData), &pokemonNames); err != nil {
			fmt.Fprintf(w, "Error parsing JSON: %s", err)
			return
		}

		var wg sync.WaitGroup
		for _, name := range pokemonNames {
			wg.Add(1)
			go func(name string) {
				defer wg.Done()
				poke := pokemon.FetchPokemon(name)
				currentTime(w)
				fmt.Fprintf(w, "Name: %s,\nHeight: %d,\nWeight: %d,\nTypes: %s,\nAbilities: %s\n\n",
					poke.Name, poke.Height, poke.Weight, pokemon.FormatTypes(poke.Types), pokemon.FormatAbilities(poke.Abilities))
			}(name)
		}
		wg.Wait()
	})

	log.Fatal(http.ListenAndServe(":8080", nil))
}

func greetery(w http.ResponseWriter, name string) {
    greeting := greeter.Greet(name)
	fmt.Fprintf(w, "\n%s\n\n", greeting)
}

func currentTime(w http.ResponseWriter) {
	currentTime := time.Now()
	formattedTime := currentTime.Format("2006-01-02 15:04:05.0000")
	fmt.Fprintf(w,"Current time:%s\n", formattedTime)
}
