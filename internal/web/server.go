package web

import (
	"embed"
	"fmt"
	"io/fs"
	"net/http"
)

//go:embed static/*
var staticFS embed.FS

// StartServer launches the embedded HTTP server.
func StartServer(bindAddr string) error {
	subFS, err := fs.Sub(staticFS, "static")
	if err != nil {
		return fmt.Errorf("mounting static embedded files: %w", err)
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(subFS)))

	fmt.Println("========================================================")
	fmt.Printf(" SVG Animator Web Studio listening on http://%s\n", bindAddr)
	fmt.Println(" Open the URL above to access the visual studio.")
	fmt.Println(" Press Ctrl+C to stop the server.")
	fmt.Println("========================================================")

	return http.ListenAndServe(bindAddr, mux)
}