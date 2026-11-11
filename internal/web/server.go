package web

import (
	"context"
	"crypto/rand"
	"database/sql"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"gitea.seaoffate.net/blackgrape/svg-animator/internal/db"
	"gitea.seaoffate.net/blackgrape/svg-animator/internal/generator"
	"gitea.seaoffate.net/blackgrape/svg-animator/internal/rasterizer"
	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/sva"
)

//go:embed static/*
var staticFS embed.FS

func init() {
	_ = mime.AddExtensionType(".wasm", "application/wasm")
}

// ServerConfig holds runtime configuration for the HTTP studio server.
type ServerConfig struct {
	BindAddr   string
	DataDir    string
	ConfigPath string
}

type renderJobStatus struct {
	mu           sync.RWMutex
	CurrentFrame int                `json:"currentFrame"`
	TotalFrames  int                `json:"totalFrames"`
	Percent      int                `json:"percent"`
	Phase        string             `json:"phase"`
	Done         bool               `json:"done"`
	Canceled     bool               `json:"canceled"`
	Error        string             `json:"error,omitempty"`
	cancelFunc   context.CancelFunc
}

type renderedBundle struct {
	dirPath  string
	webpPath string
	apngPath string
	mp4Path  string
}

var (
	activeJobs      sync.Map // map[string]*renderJobStatus
	activeBundles   sync.Map // map[string]*renderedBundle
	bundleCount     int64
	bundleMu        sync.Mutex
	renderWorkspace string        = "./render_workspace"
	renderSemaphore chan struct{} = make(chan struct{}, 2) // Max 2 concurrent headless render jobs

	reDangerousTags    = regexp.MustCompile(`(?is)<(script|iframe|object|embed|foreignobject)\b.*?(?:/>|</(script|iframe|object|embed|foreignobject)>)`)
	reDangerousTagSelf = regexp.MustCompile(`(?is)<(script|iframe|object|embed|foreignobject)\b[^>]*>`)
	reEventHandlers    = regexp.MustCompile(`(?i)\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)`)
	reJavaScriptScheme = regexp.MustCompile(`(?i)(?:href|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')`)

	allowedAudioExts = map[string]bool{
		".mp3":  true,
		".wav":  true,
		".ogg":  true,
		".m4a":  true,
		".aac":  true,
		".flac": true,
	}
)

func sanitizeSVGMarkup(svg string) string {
	if svg == "" {
		return ""
	}
	clean := reDangerousTags.ReplaceAllString(svg, "")
	clean = reDangerousTagSelf.ReplaceAllString(clean, "")
	clean = reEventHandlers.ReplaceAllString(clean, "")
	clean = reJavaScriptScheme.ReplaceAllString(clean, `href=""`)
	return clean
}

func generateSecureID(prefix string) string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
	}
	return fmt.Sprintf("%s-%s", prefix, hex.EncodeToString(b))
}

func checkSameOrigin(r *http.Request) bool {
	if sfs := r.Header.Get("Sec-Fetch-Site"); sfs == "cross-site" {
		return false
	}

	origin := r.Header.Get("Origin")
	if origin != "" {
		u, err := url.Parse(origin)
		if err != nil {
			return false
		}
		if !strings.EqualFold(u.Host, r.Host) {
			return false
		}
		return true
	}

	referer := r.Header.Get("Referer")
	if referer != "" {
		u, err := url.Parse(referer)
		if err != nil {
			return false
		}
		if !strings.EqualFold(u.Host, r.Host) {
			return false
		}
		return true
	}

	return true
}

func validateAudioExtension(name string) (string, error) {
	ext := strings.ToLower(filepath.Ext(name))
	if ext == "" {
		return ".mp3", nil
	}
	if !allowedAudioExts[ext] {
		return "", fmt.Errorf("unsupported audio file extension %q (allowed: mp3, wav, ogg, m4a, aac, flac)", ext)
	}
	return ext, nil
}

type audioInspectRequest struct {
	AudioB64  string `json:"audioB64"`
	AudioName string `json:"audioName"`
	FixHeader bool   `json:"fixHeader"`
}

type renderStatePayload struct {
	JobID     string  `json:"jobId"`
	Format    string  `json:"format"`
	Duration  float64 `json:"duration"`
	FPS       int     `json:"fps"`
	Width     int     `json:"width"`
	Height    int     `json:"height"`
	SVGMarkup string  `json:"svgMarkup"`
	AudioB64  string  `json:"audioB64,omitempty"`
	AudioName string  `json:"audioName,omitempty"`
	AudioFit  string  `json:"audioFit,omitempty"`
	State     struct {
		Image struct {
			Width  int    `json:"width"`
			Height int    `json:"height"`
			Mime   string `json:"mime"`
			B64    string `json:"b64"`
		} `json:"image"`
		Duration float64 `json:"duration"`
		Loop     string  `json:"loop"`
		Camera   struct {
			Motion        string  `json:"motion"`
			CamDuration   float64 `json:"camDuration"`
			CamLoop       string  `json:"camLoop"`
			BgColor       string  `json:"bgColor"`
			BgTransparent bool    `json:"bgTransparent"`
			StartX        float64 `json:"startX"`
			StartY        float64 `json:"startY"`
			StartZoom     float64 `json:"startZoom"`
			EndX          float64 `json:"endX"`
			EndY          float64 `json:"endY"`
			EndZoom       float64 `json:"endZoom"`
			Sway          float64 `json:"sway"`
			Breathe       float64 `json:"breathe"`
			TiltX         float64 `json:"tiltX"`
			TiltY         float64 `json:"tiltY"`
		} `json:"camera"`
		Optical struct {
			Type      string  `json:"type"`
			StartBlur float64 `json:"startBlur"`
			EndBlur   float64 `json:"endBlur"`
			FocusDur  float64 `json:"focusDur"`
			TsShape   string  `json:"tsShape"`
			TsPosX    float64 `json:"tsPosX"`
			TsPos     float64 `json:"tsPos"`
			TsWidth   float64 `json:"tsWidth"`
			TsBlur    float64 `json:"tsBlur"`
			MbInt     float64 `json:"mbInt"`
			MbAng     float64 `json:"mbAng"`
		} `json:"optical"`
		Overlays struct {
			Frame         bool    `json:"frame"`
			FrameStyle    string  `json:"frameStyle"`
			FrameDepth    float64 `json:"frameDepth"`
			FrameLighting bool    `json:"frameLighting"`
			FrameLightDir string  `json:"frameLightDir"`
			FrameLightInt float64 `json:"frameLightInt"`
			FrameShadow   float64 `json:"frameShadow"`
			FrameFillet   bool    `json:"frameFillet"`
		} `json:"overlays"`
	} `json:"state"`
}

// StartServer preserves backward compatibility with simple bindAddr calls.
func StartServer(bindAddr string) error {
	return StartServerWithConfig(ServerConfig{
		BindAddr: bindAddr,
		DataDir:  ".",
	})
}

// StartServerWithConfig initializes SQLite, cleans stale workspaces, and runs the HTTP server with graceful shutdown.
func StartServerWithConfig(cfg ServerConfig) error {
	if strings.TrimSpace(cfg.DataDir) == "" {
		cfg.DataDir = "."
	}
	if err := os.MkdirAll(cfg.DataDir, 0755); err != nil {
		return fmt.Errorf("creating data directory %s: %w", cfg.DataDir, err)
	}

	renderWorkspace = filepath.Join(cfg.DataDir, "render_workspace")
	if err := os.MkdirAll(renderWorkspace, 0755); err != nil {
		return fmt.Errorf("creating render workspace %s: %w", renderWorkspace, err)
	}
	cleanupStaleWorkspaces(renderWorkspace)

	dbPath := filepath.Join(cfg.DataDir, "studio_library.db")
	if err := db.InitDB(dbPath); err != nil {
		return fmt.Errorf("initializing sqlite project library: %w", err)
	}

	subFS, err := fs.Sub(staticFS, "static")
	if err != nil {
		return fmt.Errorf("mounting static embedded files: %w", err)
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(subFS)))

	// Export, Audio Inspector & Rasterizer Endpoints
	mux.HandleFunc("/api/export", handleExport)
	mux.HandleFunc("/api/export/progress", handleExportProgress)
	mux.HandleFunc("/api/export/cancel", handleExportCancel)
	mux.HandleFunc("/api/export/bundle", handleExportBundle)
	mux.HandleFunc("/api/export/audio/inspect", handleAudioInspect)

	// SQLite Project Library Endpoints
	mux.HandleFunc("/api/export/projects", handleProjectsList)
	mux.HandleFunc("/api/export/projects/get", handleProjectGet)
	mux.HandleFunc("/api/export/projects/save", handleProjectSave)
	mux.HandleFunc("/api/export/projects/delete", handleProjectDelete)

	// SVA Native Project Format Endpoints
	mux.HandleFunc("/api/export/sva", handleExportSVA)
	mux.HandleFunc("/api/projects/export-sva", handleExportSVA)
	mux.HandleFunc("/api/import/sva", handleImportSVA)
	mux.HandleFunc("/api/projects/import-sva", handleImportSVA)

	mux.HandleFunc("/api/projects", handleProjectsList)
	mux.HandleFunc("/api/projects/get", handleProjectGet)
	mux.HandleFunc("/api/projects/save", handleProjectSave)
	mux.HandleFunc("/api/projects/delete", handleProjectDelete)

	displayAddr := cfg.BindAddr
	if strings.HasPrefix(displayAddr, ":") {
		displayAddr = "0.0.0.0" + displayAddr
	}

	fmt.Println("========================================================")
	fmt.Printf(" SVG Animator Web Studio listening on http://%s\n", displayAddr)
	if cfg.ConfigPath != "" {
		fmt.Printf(" Config File : %s\n", cfg.ConfigPath)
	}
	fmt.Printf(" SQLite DB   : %s\n", dbPath)
	fmt.Printf(" Workspace   : %s\n", renderWorkspace)
	fmt.Println("========================================================")

	srv := &http.Server{
		Addr:              cfg.BindAddr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// Listen for SIGINT / SIGTERM for clean systemd service shutdown
	sigCtx, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()

	errCh := make(chan error, 1)
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case err := <-errCh:
		return err
	case <-sigCtx.Done():
		fmt.Println("\n>> Shutdown signal received. Canceling active renders and stopping HTTP server...")
		cancelAllActiveJobs()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
		_ = db.CloseDB()
		cleanupStaleWorkspaces(renderWorkspace)
		fmt.Println(">> Server stopped cleanly.")
		return nil
	}
}

func cancelAllActiveJobs() {
	activeJobs.Range(func(_, val any) bool {
		if job, ok := val.(*renderJobStatus); ok {
			job.mu.Lock()
			job.Canceled = true
			if job.cancelFunc != nil {
				job.cancelFunc()
			}
			job.mu.Unlock()
		}
		return true
	})
}

func cleanupStaleWorkspaces(workspaceDir string) {
	entries, err := os.ReadDir(workspaceDir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() && (strings.HasPrefix(name, "svg-") || strings.HasPrefix(name, "cli-render-")) {
			_ = os.RemoveAll(filepath.Join(workspaceDir, name))
		}
	}
}

func writeDecodeError(w http.ResponseWriter, err error) {
	var maxBytesErr *http.MaxBytesError
	if errors.As(err, &maxBytesErr) {
		http.Error(w, "Payload exceeds 100MB limit", http.StatusRequestEntityTooLarge)
		return
	}
	http.Error(w, fmt.Sprintf("Invalid JSON payload: %v", err), http.StatusBadRequest)
}

func handleAudioInspect(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 100*1024*1024)
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !checkSameOrigin(r) {
		http.Error(w, "Cross-origin request blocked", http.StatusForbidden)
		return
	}

	var req audioInspectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeDecodeError(w, err)
		return
	}

	ext, extErr := validateAudioExtension(req.AudioName)
	if extErr != nil {
		http.Error(w, extErr.Error(), http.StatusBadRequest)
		return
	}

	rawAudio, err := base64.StdEncoding.DecodeString(req.AudioB64)
	if err != nil || len(rawAudio) == 0 {
		http.Error(w, "Invalid audio data", http.StatusBadRequest)
		return
	}

	os.MkdirAll(renderWorkspace, 0755)

	tmpDir, err := os.MkdirTemp(renderWorkspace, "svg-audio-probe-*")
	if err != nil {
		http.Error(w, "Failed to create temp directory", http.StatusInternalServerError)
		return
	}
	defer os.RemoveAll(tmpDir)

	inPath := filepath.Join(tmpDir, "input"+ext)
	if err := os.WriteFile(inPath, rawAudio, 0644); err != nil {
		http.Error(w, "Failed to write temp audio", http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()

	probeRes, err := rasterizer.ProbeAudioFile(ctx, inPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	resp := map[string]any{
		"decodedDuration": probeRes.DecodedDuration,
		"headerDuration":  probeRes.HeaderDuration,
		"headerMismatch":  probeRes.HeaderMismatch,
	}

	if req.FixHeader {
		fixedPath := filepath.Join(tmpDir, "fixed"+ext)
		if err := rasterizer.FixAudioContainer(ctx, inPath, fixedPath); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		fixedBytes, err := os.ReadFile(fixedPath)
		if err != nil {
			http.Error(w, "Failed to read fixed audio", http.StatusInternalServerError)
			return
		}
		fixedProbe, err := rasterizer.ProbeAudioFile(ctx, fixedPath)
		if err == nil && fixedProbe.DecodedDuration > 0 {
			resp["decodedDuration"] = fixedProbe.DecodedDuration
			resp["headerDuration"] = fixedProbe.HeaderDuration
			resp["headerMismatch"] = false
		}
		resp["fixedAudioB64"] = base64.StdEncoding.EncodeToString(fixedBytes)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handleProjectsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	list, err := db.ListProjects()
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to list projects: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

func handleProjectGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	idStr := r.URL.Query().Get("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "Invalid project id", http.StatusBadRequest)
		return
	}

	proj, err := db.GetProject(id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "Project not found", http.StatusNotFound)
			return
		}
		http.Error(w, fmt.Sprintf("Failed to load project: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(proj)
}

func handleProjectSave(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 100*1024*1024)
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !checkSameOrigin(r) {
		http.Error(w, "Cross-origin request blocked", http.StatusForbidden)
		return
	}

	var req db.ProjectRecord
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeDecodeError(w, err)
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		req.Name = "Untitled Project"
	}
	if strings.TrimSpace(req.SchemaJSON) == "" {
		http.Error(w, "Project schemaJson cannot be empty", http.StatusBadRequest)
		return
	}

	saved, err := db.SaveProject(req)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to save project: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(saved)
}

func handleProjectDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !checkSameOrigin(r) {
		http.Error(w, "Cross-origin request blocked", http.StatusForbidden)
		return
	}

	idStr := r.URL.Query().Get("id")
	var id int64
	if idStr != "" {
		if parsed, err := strconv.ParseInt(idStr, 10, 64); err == nil {
			id = parsed
		}
	} else if r.Body != nil {
		var req struct {
			ID int64 `json:"id"`
		}
		if decErr := json.NewDecoder(r.Body).Decode(&req); decErr == nil {
			id = req.ID
		}
	}
	if id <= 0 {
		http.Error(w, "Invalid project id", http.StatusBadRequest)
		return
	}

	if err := db.DeleteProject(id); err != nil {
		http.Error(w, fmt.Sprintf("Failed to delete project: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"deleted": true})
}

func handleExportSVA(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var projectName string
	var projectDesc string
	var schemaBytes []byte

	if r.Method == http.MethodGet {
		idStr := r.URL.Query().Get("id")
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil || id <= 0 {
			http.Error(w, "Invalid project id for SVA export", http.StatusBadRequest)
			return
		}
		proj, err := db.GetProject(id)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to load project: %v", err), http.StatusInternalServerError)
			return
		}
		projectName = proj.Name
		projectDesc = proj.Description
		schemaBytes = []byte(proj.SchemaJSON)
	} else {
		if !checkSameOrigin(r) {
			http.Error(w, "Cross-origin request blocked", http.StatusForbidden)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 100*1024*1024)
		var req struct {
			Name        string          `json:"name"`
			Description string          `json:"description"`
			SchemaJSON  json.RawMessage `json:"schemaJson"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		projectName = req.Name
		projectDesc = req.Description
		schemaBytes = req.SchemaJSON
	}

	if projectName == "" {
		projectName = "Untitled Project"
	}

	proj, err := sva.BuildProjectFromStudioState(projectName, projectDesc, schemaBytes)
	if err != nil {
		http.Error(w, "Failed to build SVA project: "+err.Error(), http.StatusBadRequest)
		return
	}

	svaBytes, err := sva.Encode(proj)
	if err != nil {
		http.Error(w, "Failed to encode SVA package: "+err.Error(), http.StatusInternalServerError)
		return
	}

	safeFilename := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			return r
		}
		return '_'
	}, projectName)
	if safeFilename == "" {
		safeFilename = "project"
	}

	w.Header().Set("Content-Type", "application/vnd.svg-animator.project+zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s.sva\"", safeFilename))
	w.Header().Set("Content-Length", strconv.Itoa(len(svaBytes)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(svaBytes)
}

func handleImportSVA(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !checkSameOrigin(r) {
		http.Error(w, "Cross-origin request blocked", http.StatusForbidden)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 100*1024*1024)

	var data []byte
	var err error

	contentType := r.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "multipart/form-data") {
		if err := r.ParseMultipartForm(100 * 1024 * 1024); err != nil {
			http.Error(w, "Failed to parse multipart form: "+err.Error(), http.StatusBadRequest)
			return
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "Missing file parameter in form: "+err.Error(), http.StatusBadRequest)
			return
		}
		defer file.Close()
		data, err = io.ReadAll(file)
		if err != nil {
			http.Error(w, "Failed to read uploaded file: "+err.Error(), http.StatusBadRequest)
			return
		}
	} else {
		data, err = io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Failed to read request body: "+err.Error(), http.StatusBadRequest)
			return
		}
	}

	proj, err := sva.Decode(data)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]any{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	studioStateJSON, err := sva.ExtractStudioState(proj)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{
			"success": false,
			"error":   "Failed to extract studio state: " + err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success":    true,
		"manifest":   proj.Manifest,
		"schemaJson": string(studioStateJSON),
	})
}

func handleExportProgress(w http.ResponseWriter, r *http.Request) {
	jobID := r.URL.Query().Get("jobId")
	if jobID == "" {
		http.Error(w, "Missing jobId", http.StatusBadRequest)
		return
	}

	val, ok := activeJobs.Load(jobID)
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"currentFrame": 0,
			"totalFrames":  0,
			"percent":      0,
			"phase":        "Preparing render job...",
			"done":         false,
		})
		return
	}

	job := val.(*renderJobStatus)
	job.mu.RLock()
	resp := map[string]any{
		"currentFrame": job.CurrentFrame,
		"totalFrames":  job.TotalFrames,
		"percent":      job.Percent,
		"phase":        job.Phase,
		"done":         job.Done,
		"canceled":     job.Canceled,
		"error":        job.Error,
	}
	job.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handleExportCancel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !checkSameOrigin(r) {
		http.Error(w, "Cross-origin request blocked", http.StatusForbidden)
		return
	}

	jobID := r.URL.Query().Get("jobId")
	if jobID == "" && r.Body != nil {
		var req struct {
			JobID string `json:"jobId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			jobID = req.JobID
		}
	}
	if jobID != "" {
		if val, ok := activeJobs.Load(jobID); ok {
			job := val.(*renderJobStatus)
			job.mu.Lock()
			job.Canceled = true
			job.Phase = "Render canceled by user."
			if job.cancelFunc != nil {
				job.cancelFunc()
			}
			job.mu.Unlock()
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"canceled": true})
}

func handleExportBundle(w http.ResponseWriter, r *http.Request) {
	bundleID := r.URL.Query().Get("bundleId")
	format := r.URL.Query().Get("fmt")
	if bundleID == "" || (format != "webp" && format != "apng" && format != "mp4") {
		http.Error(w, "Invalid bundle request", http.StatusBadRequest)
		return
	}

	val, ok := activeBundles.Load(bundleID)
	if !ok {
		http.Error(w, "Bundle expired or not found", http.StatusNotFound)
		return
	}

	b := val.(*renderedBundle)
	targetPath := b.webpPath
	contentType := "image/webp"
	ext := ".webp"
	if format == "apng" {
		targetPath = b.apngPath
		contentType = "image/png"
		ext = ".png"
	} else if format == "mp4" {
		targetPath = b.mp4Path
		contentType = "video/mp4"
		ext = ".mp4"
	}

	file, err := os.Open(targetPath)
	if err != nil {
		http.Error(w, "Failed to open bundle file", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="export%s"`, ext))
	io.Copy(w, file)
}

func handleExport(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 100*1024*1024)

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !checkSameOrigin(r) {
		http.Error(w, "Cross-origin request blocked", http.StatusForbidden)
		return
	}

	// Concurrency limiter: maximum 2 simultaneous headless render jobs
	select {
	case renderSemaphore <- struct{}{}:
		defer func() { <-renderSemaphore }()
	default:
		http.Error(w, "Server is currently at maximum export capacity. Please try again shortly.", http.StatusTooManyRequests)
		return
	}

	var req renderStatePayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeDecodeError(w, err)
		return
	}

	st := req.State
	exportWidth := req.Width
	exportHeight := req.Height
	if exportWidth <= 0 {
		exportWidth = st.Image.Width
	}
	if exportHeight <= 0 {
		exportHeight = st.Image.Height
	}
	if exportWidth < 16 || exportWidth > 4096 {
		http.Error(w, "Export width must be between 16 and 4096 pixels", http.StatusBadRequest)
		return
	}
	if exportHeight < 16 || exportHeight > 4096 {
		http.Error(w, "Export height must be between 16 and 4096 pixels", http.StatusBadRequest)
		return
	}

	if req.FPS <= 0 {
		req.FPS = 24
	} else if req.FPS > 60 {
		http.Error(w, "Export FPS cannot exceed 60", http.StatusBadRequest)
		return
	}

	if req.Duration <= 0 {
		req.Duration = 7.0
	} else if req.Duration > 300.0 {
		http.Error(w, "Export duration cannot exceed 300 seconds", http.StatusBadRequest)
		return
	}

	captureDuration := req.Duration
	if st.Loop == "pingpong" {
		captureDuration = req.Duration * 2.0
	}
	totalFrames := int(captureDuration * float64(req.FPS))
	if totalFrames > 18000 {
		http.Error(w, "Total export frame count exceeds 18000 frames limit", http.StatusBadRequest)
		return
	}

	// Sanitize SVG markup to block stored/injected scripts, foreignObjects, iframes and inline event handlers
	if req.SVGMarkup != "" {
		req.SVGMarkup = sanitizeSVGMarkup(req.SVGMarkup)
	}

	renderCtx, cancelRender := context.WithCancel(r.Context())
	defer cancelRender()

	job := &renderJobStatus{
		Phase:      "Starting render pipeline...",
		cancelFunc: cancelRender,
	}
	if req.JobID == "" {
		req.JobID = generateSecureID("job")
	}
	if oldVal, loaded := activeJobs.Load(req.JobID); loaded {
		if oldJob, ok := oldVal.(*renderJobStatus); ok {
			oldJob.mu.Lock()
			oldJob.Canceled = true
			if oldJob.cancelFunc != nil {
				oldJob.cancelFunc()
			}
			oldJob.mu.Unlock()
		}
	}
	activeJobs.Store(req.JobID, job)
	defer activeJobs.Delete(req.JobID)

	onProgress := func(current, total int, phase string) {
		job.mu.Lock()
		job.CurrentFrame = current
		job.TotalFrames = total
		if total > 0 {
			pct := int((float64(current) / float64(total)) * 100.0)
			if pct > 100 {
				pct = 100
			}
			job.Percent = pct
		}
		job.Phase = phase
		job.mu.Unlock()
	}

	os.MkdirAll(renderWorkspace, 0755)

	tmpDir, err := os.MkdirTemp(renderWorkspace, "svg-api-export-*")
	if err != nil {
		http.Error(w, "Failed to create temp directory", http.StatusInternalServerError)
		return
	}

	keepTmpDir := false
	defer func() {
		if !keepTmpDir {
			os.RemoveAll(tmpDir)
		}
	}()

	audioPath := ""
	if req.AudioB64 != "" {
		ext, extErr := validateAudioExtension(req.AudioName)
		if extErr != nil {
			http.Error(w, extErr.Error(), http.StatusBadRequest)
			return
		}
		rawAudio, err := base64.StdEncoding.DecodeString(req.AudioB64)
		if err == nil && len(rawAudio) > 0 {
			audioPath = filepath.Join(tmpDir, "audio_input"+ext)
			if err := os.WriteFile(audioPath, rawAudio, 0644); err != nil {
				audioPath = ""
			}
		}
	}

	audioFit := req.AudioFit
	if audioFit == "" {
		audioFit = "loop"
	}

	svgText := req.SVGMarkup
	if svgText == "" {
		frameStyle := "none"
		if st.Overlays.Frame {
			frameStyle = st.Overlays.FrameStyle
		}

		opts := generator.Options{
			Duration:        fmt.Sprintf("%.1fs", req.Duration),
			LoopMode:        st.Loop,
			CameraMotion:    st.Camera.Motion,
			StartX:          st.Camera.StartX,
			StartY:          st.Camera.StartY,
			StartScale:      st.Camera.StartZoom,
			EndX:            st.Camera.EndX,
			EndY:            st.Camera.EndY,
			EndScale:        st.Camera.EndZoom,
			DriftSway:       st.Camera.Sway,
			DriftBreathe:    st.Camera.Breathe,
			StartPitch:      st.Camera.TiltX,
			StartYaw:        st.Camera.TiltY,
			StartBlur:       st.Optical.StartBlur,
			EndBlur:         st.Optical.EndBlur,
			StartExposure:   1.0,
			EndExposure:     1.0,
			TiltBlur:        st.Optical.TsBlur,
			TiltPosition:    st.Optical.TsPos,
			TiltBandWidth:   st.Optical.TsWidth,
			StartMotionBlur: st.Optical.MbInt,
			MotionAngle:     st.Optical.MbAng,
			FrameStyle:      frameStyle,
			FrameDepth:      st.Overlays.FrameDepth,
			FrameShadow:     0.55,
		}

		if st.Optical.Type != "focus-pull" {
			opts.StartBlur = 0.0
			opts.EndBlur = 0.0
		}
		if st.Optical.Type != "motion-blur" {
			opts.StartMotionBlur = 0.0
			opts.MotionAngle = 0.0
		}
		if st.Optical.Type != "tilt-shift" {
			opts.TiltBlur = 0.0
			opts.TiltBandWidth = 0.0
		}

		svgText = generator.BuildStandaloneSVG(st.Image.Width, st.Image.Height, st.Image.Mime, st.Image.B64, opts)
	}

	htmlText := generator.BuildStandaloneHTML("export", exportWidth, exportHeight, svgText)

	htmlPath := filepath.Join(tmpDir, "index.html")
	if err := os.WriteFile(htmlPath, []byte(htmlText), 0644); err != nil {
		http.Error(w, "Failed to write temp HTML", http.StatusInternalServerError)
		return
	}

	if req.Format == "both" || req.Format == "all" {
		webpPath := filepath.Join(tmpDir, "output.webp")
		apngPath := filepath.Join(tmpDir, "output.png")
		mp4Path := ""
		if req.Format == "all" {
			mp4Path = filepath.Join(tmpDir, "output.mp4")
		}

		if err := rasterizer.ExportBundleContext(renderCtx, htmlPath, webpPath, apngPath, mp4Path, audioPath, audioFit, req.Duration, req.FPS, st.Loop, onProgress, exportWidth, exportHeight); err != nil {
			if errors.Is(renderCtx.Err(), context.Canceled) {
				http.Error(w, "Render canceled", http.StatusRequestTimeout)
				return
			}
			http.Error(w, fmt.Sprintf("Rasterizer error: %v", err), http.StatusInternalServerError)
			return
		}

		keepTmpDir = true
		bundleID := generateSecureID("bundle")
		bundleMu.Lock()
		bundleCount++
		bundleMu.Unlock()

		activeBundles.Store(bundleID, &renderedBundle{
			dirPath:  tmpDir,
			webpPath: webpPath,
			apngPath: apngPath,
			mp4Path:  mp4Path,
		})

		time.AfterFunc(3*time.Minute, func() {
			activeBundles.Delete(bundleID)
			bundleMu.Lock()
			bundleCount--
			bundleMu.Unlock()
			os.RemoveAll(tmpDir)
		})

		job.mu.Lock()
		job.Done = true
		job.Percent = 100
		job.Phase = "Complete"
		job.mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"bundleId": bundleID,
			"mode":     req.Format,
		})
		return
	}

	outExt := ".png"
	contentType := "image/png"
	if req.Format == "webp" {
		outExt = ".webp"
		contentType = "image/webp"
	} else if req.Format == "mp4" {
		outExt = ".mp4"
		contentType = "video/mp4"
	}
	outPath := filepath.Join(tmpDir, "output"+outExt)

	if err := rasterizer.ExportContext(renderCtx, htmlPath, outPath, req.Format, req.Duration, req.FPS, st.Loop, audioPath, audioFit, onProgress, exportWidth, exportHeight); err != nil {
		if errors.Is(renderCtx.Err(), context.Canceled) {
			http.Error(w, "Render canceled", http.StatusRequestTimeout)
			return
		}
		http.Error(w, fmt.Sprintf("Rasterizer error: %v", err), http.StatusInternalServerError)
		return
	}

	job.mu.Lock()
	job.Done = true
	job.Percent = 100
	job.Phase = "Complete"
	job.mu.Unlock()

	file, err := os.Open(outPath)
	if err != nil {
		http.Error(w, "Failed to open output file", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="export%s"`, outExt))
	io.Copy(w, file)
}