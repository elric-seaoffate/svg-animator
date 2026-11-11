package web

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"gitea.seaoffate.net/blackgrape/svg-animator/internal/db"
)

func TestProjectDeleteMethodCheck(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test_sec.db")
	if err := db.InitDB(dbPath); err != nil {
		t.Fatalf("failed to init db: %v", err)
	}
	defer db.CloseDB()

	// 1. GET /api/projects/delete must return 405 Method Not Allowed
	req := httptest.NewRequest(http.MethodGet, "/api/projects/delete?id=1", nil)
	rec := httptest.NewRecorder()
	handleProjectDelete(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405 Method Not Allowed for GET /api/projects/delete, got %d", rec.Code)
	}

	// 2. Cross-origin POST /api/projects/delete must return 403 Forbidden
	crossReq := httptest.NewRequest(http.MethodPost, "/api/projects/delete?id=1", nil)
	crossReq.Host = "127.0.0.1:8088"
	crossReq.Header.Set("Origin", "http://evil.com")
	crossRec := httptest.NewRecorder()
	handleProjectDelete(crossRec, crossReq)

	if crossRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for cross-origin POST /api/projects/delete, got %d", crossRec.Code)
	}
}

func TestExportCancelMethodCheck(t *testing.T) {
	// 1. GET /api/export/cancel must return 405 Method Not Allowed
	req := httptest.NewRequest(http.MethodGet, "/api/export/cancel?jobId=test", nil)
	rec := httptest.NewRecorder()
	handleExportCancel(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405 Method Not Allowed for GET /api/export/cancel, got %d", rec.Code)
	}

	// 2. Cross-origin POST /api/export/cancel must return 403 Forbidden
	crossReq := httptest.NewRequest(http.MethodPost, "/api/export/cancel?jobId=test", nil)
	crossReq.Host = "127.0.0.1:8088"
	crossReq.Header.Set("Origin", "http://malicious.org")
	crossRec := httptest.NewRecorder()
	handleExportCancel(crossRec, crossReq)

	if crossRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for cross-origin POST /api/export/cancel, got %d", crossRec.Code)
	}
}

func TestAudioExtensionValidation(t *testing.T) {
	validExts := []string{"song.mp3", "track.WAV", "audio.ogg", "clip.m4a", "sound.aac", "voice.flac"}
	for _, name := range validExts {
		ext, err := validateAudioExtension(name)
		if err != nil {
			t.Errorf("expected valid extension for %s, got error: %v", name, err)
		}
		if ext == "" {
			t.Errorf("expected non-empty ext for %s", name)
		}
	}

	invalidExts := []string{"exploit.exe", "script.sh", "page.php", "hls.m3u8", "data.bin", "file.py"}
	for _, name := range invalidExts {
		_, err := validateAudioExtension(name)
		if err == nil {
			t.Errorf("expected error for disallowed extension %s, got nil", name)
		}
	}
}

func TestSanitizeSVGMarkup(t *testing.T) {
	maliciousSVG := `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
		<script>fetch('/api/projects/delete?id=1', {method:'POST'});</script>
		<foreignObject width="100" height="100">
			<iframe src="http://169.254.169.254/"></iframe>
		</foreignObject>
		<rect x="0" y="0" width="100" height="100" fill="red" onload="alert('XSS')" onerror="alert('err')" />
		<a href="javascript:alert(1)"><text>Click</text></a>
		<g id="validGroup">
			<path d="M 0 0 L 10 10" stroke="blue" />
			<animate attributeName="opacity" from="0" to="1" dur="2s" repeatCount="indefinite" />
		</g>
	</svg>`

	sanitized := sanitizeSVGMarkup(maliciousSVG)

	if strings.Contains(strings.ToLower(sanitized), "<script") {
		t.Error("sanitized SVG still contains <script>")
	}
	if strings.Contains(strings.ToLower(sanitized), "<foreignobject") {
		t.Error("sanitized SVG still contains <foreignObject>")
	}
	if strings.Contains(strings.ToLower(sanitized), "<iframe") {
		t.Error("sanitized SVG still contains <iframe")
	}
	if strings.Contains(strings.ToLower(sanitized), "onload=") {
		t.Error("sanitized SVG still contains onload=")
	}
	if strings.Contains(strings.ToLower(sanitized), "onerror=") {
		t.Error("sanitized SVG still contains onerror=")
	}
	if strings.Contains(strings.ToLower(sanitized), "javascript:") {
		t.Error("sanitized SVG still contains javascript:")
	}

	// Verify valid elements are preserved
	if !strings.Contains(sanitized, `<rect x="0" y="0" width="100" height="100" fill="red"`) {
		t.Error("sanitized SVG dropped valid <rect>")
	}
	if !strings.Contains(sanitized, `<path d="M 0 0 L 10 10" stroke="blue" />`) {
		t.Error("sanitized SVG dropped valid <path>")
	}
	if !strings.Contains(sanitized, `<animate attributeName="opacity"`) {
		t.Error("sanitized SVG dropped valid <animate>")
	}
}

func TestExportParameterLimits(t *testing.T) {
	// Test oversized export dimensions rejection
	oversizedPayload := renderStatePayload{
		Width:    5000,
		Height:   1000,
		FPS:      24,
		Duration: 5.0,
	}
	body, _ := json.Marshal(oversizedPayload)
	req := httptest.NewRequest(http.MethodPost, "/api/export", bytes.NewReader(body))
	req.Host = "127.0.0.1:8088"
	req.Header.Set("Origin", "http://127.0.0.1:8088")
	rec := httptest.NewRecorder()
	handleExport(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for width > 4096, got %d: %s", rec.Code, rec.Body.String())
	}

	// Test excessive duration rejection
	longDurationPayload := renderStatePayload{
		Width:    1280,
		Height:   720,
		FPS:      30,
		Duration: 350.0,
	}
	body2, _ := json.Marshal(longDurationPayload)
	req2 := httptest.NewRequest(http.MethodPost, "/api/export", bytes.NewReader(body2))
	req2.Host = "127.0.0.1:8088"
	req2.Header.Set("Origin", "http://127.0.0.1:8088")
	rec2 := httptest.NewRecorder()
	handleExport(rec2, req2)

	if rec2.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for duration > 300s, got %d: %s", rec2.Code, rec2.Body.String())
	}
}
