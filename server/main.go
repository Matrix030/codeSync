package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
)

type Server struct {
	mu sync.RWMutex
	solution string
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

//POST /template - Extension sends problem template
func (s *Server) handleTemplate(w http.ResponseWriter, r *http.Request) {
	if r.Method !+ http.MethodPost {
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
	json.NewEncoder(w).Encode(map[string]{"status": "success"})
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

//Get /solution - Extension fetches latest solution
func (s *Server) handleSolutionGet(w http.ResponseWriter, r *http.Request) {

}


