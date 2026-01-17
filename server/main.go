package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type Server struct {
	mu         sync.RWMutex
	solution   string
	template   string // Store latest template from extension
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
func (s *Server) handleTemplatePost(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req TemplateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Clean non-breaking spaces (0xC2 0xA0 in UTF-8)
	// Replace all non-breaking spaces with regular spaces
	cleanCode := strings.ReplaceAll(req.Code, "\u00A0", " ")
	cleanCode = strings.ReplaceAll(cleanCode, "\xA0", " ")

	// Store cleaned template in memory
	s.mu.Lock()
	s.template = cleanCode
	s.mu.Unlock()

	log.Printf("Template received (%d bytes)", len(cleanCode))
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// GET /template - Neovim fetches latest template
func (s *Server) handleTemplateGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.mu.RLock()
	code := s.template
	s.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SolutionResponse{Code: code})
}

// POST /solution - Neovim sends solution code
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

// GET /solution - Extension fetches latest solution
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
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

func main() {
	// Default path - can be overridden via env var or flag
	editorPath := os.Getenv("LCEDITOR_PATH")
	if editorPath == "" {
		home, _ := os.UserHomeDir()
		editorPath = filepath.Join(home, "LCEditor.py")
	}

	server := NewServer(editorPath)

	http.HandleFunc("/template", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			server.handleTemplatePost(w, r)
		} else if r.Method == http.MethodGet {
			server.handleTemplateGet(w, r)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
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
