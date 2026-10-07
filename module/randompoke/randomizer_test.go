package randompoke

import (
	"strconv"
	"testing"
)

func TestRandomIDs(t *testing.T) {
	ids := RandomIDs(10)
	if len(ids) != 10 {
		t.Fatalf("got %d ids, want 10", len(ids))
	}

	seen := map[string]bool{}
	for _, s := range ids {
		n, err := strconv.Atoi(s)
		if err != nil || n < 1 || n > MaxID {
			t.Errorf("id %q out of range", s)
		}
		if seen[s] {
			t.Errorf("duplicate id %q", s)
		}
		seen[s] = true
	}
}

func TestRandomIDsClamps(t *testing.T) {
	if got := len(RandomIDs(-5)); got != 0 {
		t.Errorf("RandomIDs(-5) returned %d ids, want 0", got)
	}
}
