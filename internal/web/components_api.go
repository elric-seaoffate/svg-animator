package web

import (
	"encoding/json"
	"net/http"
	"strings"

	"gitea.seaoffate.net/blackgrape/svg-animator/internal/db"
)

const maxComponentSaveBodyBytes = 8 * 1024 * 1024 // 8 MiB safety bound

func handleComponentsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	q := r.URL.Query().Get("q")
	cat := r.URL.Query().Get("category")
	tag := r.URL.Query().Get("tag")

	list, err := db.ListComponents(q, cat, tag)
	if err != nil {
		http.Error(w, "Failed to list components: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"components": list,
		"count":      len(list),
	})
}

func handleComponentGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" {
		http.Error(w, "Missing component id", http.StatusBadRequest)
		return
	}
	ver := strings.TrimSpace(r.URL.Query().Get("version"))
	rec, err := db.GetComponent(id, ver)
	if err != nil {
		http.Error(w, "Component not found: "+err.Error(), http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(rec)
}

func handleComponentSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxComponentSaveBodyBytes)
	var req struct {
		ComponentID    string   `json:"componentId"`
		Name           string   `json:"name"`
		Description    string   `json:"description"`
		Category       string   `json:"category"`
		Tags           []string `json:"tags"`
		Version        string   `json:"version"`
		LatestVersion  string   `json:"latestVersion"`
		ThumbnailSVG   string   `json:"thumbnailSvg"`
		DefinitionJSON string   `json:"definitionJson"`
		ContentSHA256  string   `json:"contentSha256"`
		Changelog      string   `json:"changelog"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid component payload: "+err.Error(), http.StatusBadRequest)
		return
	}

	ver := strings.TrimSpace(req.Version)
	if ver == "" {
		ver = strings.TrimSpace(req.LatestVersion)
	}
	if ver == "" {
		ver = "1.0.0"
	}

	safeThumb := ""
	if strings.TrimSpace(req.ThumbnailSVG) != "" {
		safeThumb = sanitizeSVGMarkup(req.ThumbnailSVG)
	}

	summary, err := db.SaveComponent(db.ComponentRecord{
		ComponentSummary: db.ComponentSummary{
			ComponentID:   strings.TrimSpace(req.ComponentID),
			Name:          strings.TrimSpace(req.Name),
			Description:   strings.TrimSpace(req.Description),
			Category:      strings.TrimSpace(req.Category),
			Tags:          req.Tags,
			LatestVersion: ver,
			ThumbnailSVG:  safeThumb,
			ContentSHA256: strings.TrimSpace(req.ContentSHA256),
		},
		DefinitionJSON: req.DefinitionJSON,
		Changelog:      strings.TrimSpace(req.Changelog),
	})
	if err != nil {
		http.Error(w, "Failed to save component: "+err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success":   true,
		"component": summary,
	})
}

func handleComponentRevisions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" {
		http.Error(w, "Missing component id", http.StatusBadRequest)
		return
	}
	revs, err := db.ListComponentRevisions(id)
	if err != nil {
		http.Error(w, "Failed to list revisions: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"componentId": id,
		"revisions":   revs,
		"count":       len(revs),
	})
}

func handleComponentUsage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" {
		http.Error(w, "Missing component id", http.StatusBadRequest)
		return
	}
	rep, err := db.GetComponentUsage(id)
	if err != nil {
		http.Error(w, "Failed to inspect component usage: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(rep)
}

func handleComponentDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ComponentID string `json:"componentId"`
		Force       bool   `json:"force"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid delete request: "+err.Error(), http.StatusBadRequest)
		return
	}
	id := strings.TrimSpace(req.ComponentID)
	if id == "" {
		http.Error(w, "Missing componentId", http.StatusBadRequest)
		return
	}

	usage, err := db.DeleteComponent(id, req.Force)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": false,
			"error":   err.Error(),
			"usage":   usage,
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success":     true,
		"componentId": id,
	})
}
