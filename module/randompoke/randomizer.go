package randomizer

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strconv" // Import the strconv package for string conversion
	"time"
)

const pokemonAPIURL = "https://pokeapi.co/api/v2/pokemon/"

func getRandomPokemonNames(count int) (string, error) {
	rand.Seed(time.Now().UnixNano())
	pokemonNames := make([]string, count)

	for i := 0; i < count; i++ {
		id := rand.Intn(898) + 1
		url := pokemonAPIURL + strconv.Itoa(id) // Convert id to string

		resp, err := http.Get(url)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()

		var result map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return "", err
		}

		name, ok := result["name"].(string)
		if !ok {
			return "", fmt.Errorf("invalid data received from API")
		}

		pokemonNames[i] = name
	}

	jsonNames, err := json.Marshal(pokemonNames)
	if err != nil {
		return "", err
	}

	return string(jsonNames), nil
}
