package greeter

import "testing"

func TestGreet(t *testing.T) {
	tests := map[string]string{
		"Phuphu": "Hello, Phuphu! Welcome to the Go Pokédex.",
		"":       "Hello, Trainer! Welcome to the Go Pokédex.",
	}
	for in, want := range tests {
		if got := Greet(in); got != want {
			t.Errorf("Greet(%q) = %q, want %q", in, got, want)
		}
	}
}
