// Package greeter builds the welcome message shown on the home page.
package greeter

import "fmt"

// Greet returns a friendly greeting for name.
func Greet(name string) string {
	if name == "" {
		name = "Trainer"
	}
	return fmt.Sprintf("Hello, %s! Welcome to the Go Pokédex.", name)
}
