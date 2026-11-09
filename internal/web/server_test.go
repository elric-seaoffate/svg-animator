package web

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"gitea.seaoffate.net/blackgrape/svg-animator/internal/db"
)

func TestEmbeddedStaticAssetsAndScriptOrder(t *testing.T) {
	indexBytes, err := fs.ReadFile(staticFS, "static/index.html")
	if err != nil {
		t.Fatalf("failed to read embedded static/index.html: %v", err)
	}
	indexHTML := string(indexBytes)

	expectedScripts := []string{
		"static/js/effects.js",
		"static/js/scene-state.js",
		"static/js/coordinator.js",
		"static/js/stage.js",
		"static/js/shape-registry.js",
		"static/js/presets.js",
		"static/js/nodes.js",
		"static/js/flows.js",
		"static/js/glows.js",
		"static/js/ripples.js",
		"static/js/history.js",
		"static/js/projects.js",
		"static/js/app.js",
		"static/js/still-export-modal.js",
		"static/js/export-modal.js",
	}

	lastIdx := -1
	for _, scriptPath := range expectedScripts {
		data, err := fs.ReadFile(staticFS, scriptPath)
		if err != nil {
			t.Fatalf("embedded file %q missing from staticFS: %v", scriptPath, err)
		}
		if len(data) == 0 {
			t.Fatalf("embedded file %q is empty", scriptPath)
		}

		relRef := strings.TrimPrefix(scriptPath, "static/")
		pos := strings.Index(indexHTML, relRef)
		if pos == -1 {
			t.Fatalf("index.html does not reference required script %q", relRef)
		}
		if pos <= lastIdx {
			t.Fatalf("script %q appears out of order in index.html (pos %d <= previous %d)", relRef, pos, lastIdx)
		}
		lastIdx = pos
	}
}

func TestPhase1ArchitecturalInvariants(t *testing.T) {
	// 1. effects.js, coordinator.js, and shape-registry.js must remain completely free of direct DOM element lookups
	pureFiles := []string{
		"static/js/effects.js",
		"static/js/coordinator.js",
		"static/js/shape-registry.js",
	}
	for _, path := range pureFiles {
		data, err := fs.ReadFile(staticFS, path)
		if err != nil {
			t.Fatalf("failed to read %s: %v", path, err)
		}
		content := string(data)
		if strings.Contains(content, "document.getElementById(") {
			t.Errorf("%s must not contain direct document.getElementById( calls", path)
		}
	}

	// 2. In scene-state.js, window.SceneState (before window.ControlStateAdaptor) must be pure operational state
	sceneStateBytes, err := fs.ReadFile(staticFS, "static/js/scene-state.js")
	if err != nil {
		t.Fatalf("failed to read static/js/scene-state.js: %v", err)
	}
	sceneStateContent := string(sceneStateBytes)
	adaptorSplit := strings.Index(sceneStateContent, "window.ControlStateAdaptor")
	if adaptorSplit == -1 {
		t.Fatalf("scene-state.js missing window.ControlStateAdaptor definition")
	}
	pureSceneStateSection := sceneStateContent[:adaptorSplit]
	if strings.Contains(pureSceneStateSection, "document.getElementById(") {
		t.Errorf("window.SceneState in scene-state.js must not contain document.getElementById( calls")
	}
}

func TestProjectRESTEndpoints(t *testing.T) {
	tmpDir := t.TempDir()
	if err := db.InitDB(filepath.Join(tmpDir, "test_web_projects.db")); err != nil {
		t.Fatalf("db.InitDB failed: %v", err)
	}

	// 1. POST /api/projects/save
	savePayload := map[string]interface{}{
		"name":         "Web API Test Project",
		"description":  "Created via httptest",
		"canvasWidth":  1920,
		"canvasHeight": 1080,
		"schemaJson":   `{"version":"1.2.0","controls":{"canvasWidth":"1920","canvasHeight":"1080"}}`,
	}
	bodyBytes, _ := json.Marshal(savePayload)
	reqSave := httptest.NewRequest(http.MethodPost, "/api/projects/save", bytes.NewReader(bodyBytes))
	reqSave.Header.Set("Content-Type", "application/json")
	recSave := httptest.NewRecorder()
	handleProjectSave(recSave, reqSave)

	if recSave.Code != http.StatusOK {
		t.Fatalf("handleProjectSave status = %d, want 200; body = %s", recSave.Code, recSave.Body.String())
	}
	var savedSummary db.ProjectSummary
	if err := json.Unmarshal(recSave.Body.Bytes(), &savedSummary); err != nil {
		t.Fatalf("failed to decode save response: %v", err)
	}
	if savedSummary.ID <= 0 {
		t.Fatalf("expected positive saved ID, got %d", savedSummary.ID)
	}

	// 2. GET /api/projects
	reqList := httptest.NewRequest(http.MethodGet, "/api/projects", nil)
	recList := httptest.NewRecorder()
	handleProjectsList(recList, reqList)
	if recList.Code != http.StatusOK {
		t.Fatalf("handleProjectsList status = %d, want 200", recList.Code)
	}
	var listed []db.ProjectSummary
	if err := json.Unmarshal(recList.Body.Bytes(), &listed); err != nil {
		t.Fatalf("failed to decode list response: %v", err)
	}
	if len(listed) != 1 || listed[0].ID != savedSummary.ID {
		t.Fatalf("expected 1 project with ID %d, got %+v", savedSummary.ID, listed)
	}

	// 3. GET /api/projects/get?id=1
	reqGet := httptest.NewRequest(http.MethodGet, "/api/projects/get?id=1", nil)
	recGet := httptest.NewRecorder()
	handleProjectGet(recGet, reqGet)
	if recGet.Code != http.StatusOK {
		t.Fatalf("handleProjectGet status = %d, want 200", recGet.Code)
	}
	var fetched db.ProjectRecord
	if err := json.Unmarshal(recGet.Body.Bytes(), &fetched); err != nil {
		t.Fatalf("failed to decode get response: %v", err)
	}
	if fetched.SchemaJSON != savePayload["schemaJson"] {
		t.Errorf("fetched SchemaJSON = %s, want %s", fetched.SchemaJSON, savePayload["schemaJson"])
	}

	// 4. POST /api/projects/delete?id=1
	reqDel := httptest.NewRequest(http.MethodPost, "/api/projects/delete?id=1", nil)
	recDel := httptest.NewRecorder()
	handleProjectDelete(recDel, reqDel)
	if recDel.Code != http.StatusOK {
		t.Fatalf("handleProjectDelete status = %d, want 200", recDel.Code)
	}
}

func TestSVARESTEndpoints(t *testing.T) {
	tmpDir := t.TempDir()
	if err := db.InitDB(filepath.Join(tmpDir, "test_sva_endpoints.db")); err != nil {
		t.Fatalf("db.InitDB failed: %v", err)
	}

	// 1. Save a project to SQLite
	savePayload := map[string]interface{}{
		"name":         "SVA Export Source",
		"description":  "Database project to export to SVA",
		"canvasWidth":  1600,
		"canvasHeight": 900,
		"schemaJson":   `{"version":"1.2.0","controls":{"canvasWidthInput":"1600","canvasHeightInput":"900"},"nodes":[{"id":"node1","name":"Core Router","shape":"rounded","text":"Gateway"}]}`,
	}
	bodyBytes, _ := json.Marshal(savePayload)
	reqSave := httptest.NewRequest(http.MethodPost, "/api/projects/save", bytes.NewReader(bodyBytes))
	recSave := httptest.NewRecorder()
	handleProjectSave(recSave, reqSave)
	if recSave.Code != http.StatusOK {
		t.Fatalf("handleProjectSave status = %d", recSave.Code)
	}
	var savedSummary db.ProjectSummary
	_ = json.Unmarshal(recSave.Body.Bytes(), &savedSummary)

	// 2. GET /api/projects/export-sva?id=savedID
	reqExport := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/projects/export-sva?id=%d", savedSummary.ID), nil)
	recExport := httptest.NewRecorder()
	handleExportSVA(recExport, reqExport)
	if recExport.Code != http.StatusOK {
		t.Fatalf("handleExportSVA status = %d, want 200; body = %s", recExport.Code, recExport.Body.String())
	}
	svaBytes := recExport.Body.Bytes()
	if len(svaBytes) < 4 || string(svaBytes[:2]) != "PK" {
		t.Fatalf("expected valid zip/sva magic header, got: %v", svaBytes[:min(10, len(svaBytes))])
	}
	if recExport.Header().Get("Content-Type") != "application/vnd.svg-animator.project+zip" {
		t.Errorf("expected Content-Type application/vnd.svg-animator.project+zip, got %s", recExport.Header().Get("Content-Type"))
	}

	// 3. POST /api/projects/import-sva with the generated .sva bytes
	reqImport := httptest.NewRequest(http.MethodPost, "/api/projects/import-sva", bytes.NewReader(svaBytes))
	reqImport.Header.Set("Content-Type", "application/vnd.svg-animator.project+zip")
	recImport := httptest.NewRecorder()
	handleImportSVA(recImport, reqImport)
	if recImport.Code != http.StatusOK {
		t.Fatalf("handleImportSVA status = %d, want 200; body = %s", recImport.Code, recImport.Body.String())
	}
	var importRes struct {
		Success    bool            `json:"success"`
		Manifest   json.RawMessage `json:"manifest"`
		SchemaJSON string          `json:"schemaJson"`
	}
	if err := json.Unmarshal(recImport.Body.Bytes(), &importRes); err != nil {
		t.Fatalf("failed to decode import response: %v", err)
	}
	if !importRes.Success {
		t.Fatalf("import failed: %s", recImport.Body.String())
	}
	if !strings.Contains(importRes.SchemaJSON, "Core Router") {
		t.Errorf("imported schema missing node name: %s", importRes.SchemaJSON)
	}
}
