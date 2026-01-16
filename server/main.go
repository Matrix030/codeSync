package main

import (
	"encoding"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
)

type Server struct {
	mu         sync.RWMutex
	solution   string
	editorPath string
}

type TemplateRequest struct {
	Code string `json:"code"`
}

type SolutionRequest struct {
	Code string `json:"code"`
}

type SolutionResponse struct {
	Code string `json:"code"`
}

func NewServer(editorPath string) *Server {
	return &Server{
		editorPath: editorPath,
	}
}

// POST /template - Extension sends problem template
func (s *Server) handleTemplate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not alowed", http.StatusMethodNotAllowed)
		return
	}

	var req TemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Write template to LCEditor.py
	if err := os.WriteFile(s.editorPath, []byte(req.Code), 0644); err != nil {
		http.Error(w, "Failed to write file", http.StatusInternalServerError)
		log.Printf("Error writing template: %", err)
		return
	}

	log.Printf("Template written to %s", s.editorPath)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

//POST /solution - neovim sends solution code

func (s *Server) handleSolutionPost(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SolutionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	s.solution = req.Code
	s.mu.Unlock()

	log.Printf("Solution received (%d bytes)", len(req.Code))
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// Get /solution - Extension fetches latest solution
func (s *Server) handleSolutionGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.mu.RLock()
	code := s.solution
	s.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SolutionResponse{Code: code})
}

// Enable CORS for browser extension
func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Origin", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Origin", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

func main() {
	// Default path - can be overidden via env var or flag
	editorPath := os.Getenv("LCEDITOR_PATH")
	if editorPath == "" {
		home, _ := os.UserHomeDir()
		editorPath = filepath.Join(home, "LCEditor.py")
	}

	server := NewServer(editorPath)

	http.HandleFunc("/template", corsMiddleware(server.handleTemplate))
	http.HandleFunc("/solution", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			server.handleSolutionPost(w, r)
		} else if r.Method == http.MethodGet {
			server.handleSolutionGet(w, r)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	port := ":8080"
	log.Printf("CodeSync server starting on %s", port)
	log.Printf("Editor file: %s", editorPath)
	log.Fatal(http.ListenAndServe(port, nil))
}
