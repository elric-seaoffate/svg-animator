package web

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"

	"gitea.seaoffate.net/blackgrape/svg-animator/internal/generator"
	"gitea.seaoffate.net/blackgrape/svg-animator/internal/rasterizer"
)

//go:embed static/*
var staticFS embed.FS

type renderStatePayload struct {
	Format   string  `json:"format"`
	Duration float64 `json:"duration"`
	FPS      int     `json:"fps"`
	State    struct {
		Image struct {
			Width  int    `json:"width"`
			Height int    `json:"height"`
			Mime   string `json:"mime"`
			B64    string `json:"b64"`
		} `json:"image"`
		Duration float64 `json:"duration"`
		Loop     string  `json:"loop"`
		Camera   struct {
			Motion     string  `json:"motion"`
			StartX     float64 `json:"startX"`
			StartY     float64 `json:"startY"`
			StartZoom  float64 `json:"startZoom"`
			EndX       float64 `json:"endX"`
			EndY       float64 `json:"endY"`
			EndZoom    float64 `json:"endZoom"`
			Sway       float64 `json:"sway"`
			Breathe    float64 `json:"breathe"`
			TiltX      float64 `json:"tiltX"`
			TiltY      float64 `json:"tiltY"`
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

	fmt.Println("========================================================")
	fmt.Printf(" SVG Animator Web Studio listening on http://%s\n", bindAddr)
	fmt.Println("========================================================")

	return http.ListenAndServe(bindAddr, mux)
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

	localTemp := filepath.Join(".", "render_workspace")
	os.MkdirAll(localTemp, 0755)

	tmpDir, err := os.MkdirTemp(localTemp, "svg-api-export-*")
	if err != nil {
		http.Error(w, "Failed to create temp directory", http.StatusInternalServerError)
		return
	}
	defer os.RemoveAll(tmpDir)

	st := req.State
	
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
		StartPitch:      st.Camera.TiltY,
		StartYaw:        st.Camera.TiltX,
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

	svgText := generator.BuildStandaloneSVG(st.Image.Width, st.Image.Height, st.Image.Mime, st.Image.B64, opts)
	htmlText := generator.BuildStandaloneHTML("export", st.Image.Width, st.Image.Height, svgText)

	htmlPath := filepath.Join(tmpDir, "index.html")
	if err := os.WriteFile(htmlPath, []byte(htmlText), 0644); err != nil {
		http.Error(w, "Failed to write temp HTML", http.StatusInternalServerError)
		return
	}

	outExt := ".png" 
	if req.Format == "webp" {
		outExt = ".webp"
	}
	outPath := filepath.Join(tmpDir, "output"+outExt)

	// FIX: Pass LoopMode into rasterizer to resolve infinite looping bug
	if err := rasterizer.Export(htmlPath, outPath, req.Format, req.Duration, req.FPS, st.Loop, st.Image.Width, st.Image.Height); err != nil {
		http.Error(w, fmt.Sprintf("Rasterizer error: %v", err), http.StatusInternalServerError)
		return
	}

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