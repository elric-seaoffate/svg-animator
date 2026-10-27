package web

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"gitea.seaoffate.net/blackgrape/svg-animator/internal/generator"
	"gitea.seaoffate.net/blackgrape/svg-animator/internal/rasterizer"
)

//go:embed static/*
var staticFS embed.FS

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
}

var (
	activeJobs    sync.Map // map[string]*renderJobStatus
	activeBundles sync.Map // map[string]*renderedBundle
)

type renderStatePayload struct {
	JobID     string  `json:"jobId"`
	Format    string  `json:"format"`
	Duration  float64 `json:"duration"`
	FPS       int     `json:"fps"`
	Width     int     `json:"width"`
	Height    int     `json:"height"`
	SVGMarkup string  `json:"svgMarkup"`
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
			Frame      bool    `json:"frame"`
			FrameStyle string  `json:"frameStyle"`
			FrameDepth float64 `json:"frameDepth"`
		} `json:"overlays"`
	} `json:"state"`
}

func StartServer(bindAddr string) error {
	subFS, err := fs.Sub(staticFS, "static")
	if err != nil {
		return fmt.Errorf("mounting static embedded files: %w", err)
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(subFS)))
	mux.HandleFunc("/api/export", handleExport)
	mux.HandleFunc("/api/export/progress", handleExportProgress)
	mux.HandleFunc("/api/export/cancel", handleExportCancel)
	mux.HandleFunc("/api/export/bundle", handleExportBundle)

	fmt.Println("========================================================")
	fmt.Printf(" SVG Animator Web Studio listening on http://%s\n", bindAddr)
	fmt.Println("========================================================")

	return http.ListenAndServe(bindAddr, mux)
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

	jobID := r.URL.Query().Get("jobId")
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
	if bundleID == "" || (format != "webp" && format != "apng") {
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
	r.Body = http.MaxBytesReader(w, r.Body, 50*1024*1024)

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req renderStatePayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
		return
	}

	renderCtx, cancelRender := context.WithCancel(r.Context())
	defer cancelRender()

	job := &renderJobStatus{
		Phase:      "Starting render pipeline...",
		cancelFunc: cancelRender,
	}
	if req.JobID != "" {
		activeJobs.Store(req.JobID, job)
		defer activeJobs.Delete(req.JobID)
	}

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

	localTemp := filepath.Join(".", "render_workspace")
	os.MkdirAll(localTemp, 0755)

	tmpDir, err := os.MkdirTemp(localTemp, "svg-api-export-*")
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

	st := req.State
	exportWidth := req.Width
	exportHeight := req.Height
	if exportWidth <= 0 {
		exportWidth = st.Image.Width
	}
	if exportHeight <= 0 {
		exportHeight = st.Image.Height
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

	// Dual Export Mode: Capture frames once and stream WebP + APNG via binary bundle endpoint
	if req.Format == "both" {
		webpPath := filepath.Join(tmpDir, "output.webp")
		apngPath := filepath.Join(tmpDir, "output.png")

		if err := rasterizer.ExportBothContext(renderCtx, htmlPath, webpPath, apngPath, req.Duration, req.FPS, st.Loop, onProgress, exportWidth, exportHeight); err != nil {
			if errors.Is(renderCtx.Err(), context.Canceled) {
				http.Error(w, "Render canceled", http.StatusRequestTimeout)
				return
			}
			http.Error(w, fmt.Sprintf("Rasterizer error: %v", err), http.StatusInternalServerError)
			return
		}

		keepTmpDir = true
		bundleID := fmt.Sprintf("bundle-%d", time.Now().UnixNano())
		activeBundles.Store(bundleID, &renderedBundle{
			dirPath:  tmpDir,
			webpPath: webpPath,
			apngPath: apngPath,
		})

		// Automatically clean up temporary bundle directory after 3 minutes
		time.AfterFunc(3*time.Minute, func() {
			activeBundles.Delete(bundleID)
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
		})
		return
	}

	// Single Format Export Mode (WebP or APNG)
	outExt := ".png"
	if req.Format == "webp" {
		outExt = ".webp"
	}
	outPath := filepath.Join(tmpDir, "output"+outExt)

	if err := rasterizer.ExportContext(renderCtx, htmlPath, outPath, req.Format, req.Duration, req.FPS, st.Loop, onProgress, exportWidth, exportHeight); err != nil {
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

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="export%s"`, outExt))
	io.Copy(w, file)
}