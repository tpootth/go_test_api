// Package randompoke picks random Pokémon to show.
package randompoke

import (
	"math/rand"
	"strconv"
)

// MaxID is the highest National Pokédex number that is picked.
const MaxID = 1025

// RandomIDs returns count distinct Pokédex IDs (as strings, ready to be used
// as PokeAPI lookups). count is clamped to the range [0, MaxID].
func RandomIDs(count int) []string {
	if count < 0 {
		count = 0
	}
	if count > MaxID {
		count = MaxID
	}

	seen := make(map[int]struct{}, count)
	ids := make([]string, 0, count)
	for len(ids) < count {
		id := rand.Intn(MaxID) + 1
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, strconv.Itoa(id))
	}
	return ids
}
