package db

import (
	"encoding/json"
	"path/filepath"
	"testing"
)

func TestSQLiteProjectPersistence(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test_studio_library.db")

	if err := InitDB(dbPath); err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}

	// Verify initial list is empty
	initialList, err := ListProjects()
	if err != nil {
		t.Fatalf("ListProjects on empty DB failed: %v", err)
	}
	if len(initialList) != 0 {
		t.Fatalf("expected 0 projects initially, got %d", len(initialList))
	}

	// Sample schema_json v1.2.0 payload matching ProjectManager.serializeStudioState()
	sampleSchema := map[string]interface{}{
		"version":   "1.2.0",
		"timestamp": "2026-04-11T10:00:00.000Z",
		"controls": map[string]interface{}{
			"canvasWidth":  "1920",
			"canvasHeight": "1080",
			"chk3DFrame":   true,
		},
		"loadedPhoto": map[string]interface{}{
			"dataUrl": "",
			"width":   0,
			"height":  0,
			"aspect":  1.0,
		},
		"presets": map[string]interface{}{
			"enableAll": true,
			"presets":   map[string]interface{}{},
		},
		"nodes": map[string]interface{}{
			"counter": 1,
			"items": []map[string]interface{}{
				{
					"id":    "node_1",
					"shape": "rounded",
					"x":     50.0,
					"y":     50.0,
					"w":     140.0,
					"h":     64.0,
					"text":  "Primary Server",
				},
			},
		},
		"flows": map[string]interface{}{
			"counter": 0,
			"items":   []interface{}{},
		},
		"glows": map[string]interface{}{
			"counter": 0,
			"items":   []interface{}{},
		},
		"ripples": map[string]interface{}{
			"counter": 0,
			"items":   []interface{}{},
		},
	}
	schemaBytes, err := json.Marshal(sampleSchema)
	if err != nil {
		t.Fatalf("failed to marshal sample schema: %v", err)
	}

	// 1. Insert new project
	savedSummary, err := SaveProject(ProjectRecord{
		ProjectSummary: ProjectSummary{
			Name:        "Phase 1 Test Topology",
			Description: "Automated verification project",
			CanvasWidth: 1920,
			CanvasHeight: 1080,
		},
		SchemaJSON: string(schemaBytes),
	})
	if err != nil {
		t.Fatalf("SaveProject (insert) failed: %v", err)
	}
	if savedSummary.ID <= 0 {
		t.Fatalf("expected positive project ID, got %d", savedSummary.ID)
	}
	if savedSummary.Name != "Phase 1 Test Topology" {
		t.Errorf("expected name %q, got %q", "Phase 1 Test Topology", savedSummary.Name)
	}

	// 2. GetProject and verify SchemaJSON round-trip
	loadedRecord, err := GetProject(savedSummary.ID)
	if err != nil {
		t.Fatalf("GetProject(%d) failed: %v", savedSummary.ID, err)
	}
	if loadedRecord.SchemaJSON != string(schemaBytes) {
		t.Errorf("SchemaJSON mismatch on round-trip:\ngot:  %s\nwant: %s", loadedRecord.SchemaJSON, string(schemaBytes))
	}

	// 3. Update existing project
	sampleSchema["timestamp"] = "2026-04-11T10:05:00.000Z"
	updatedBytes, _ := json.Marshal(sampleSchema)
	updatedSummary, err := SaveProject(ProjectRecord{
		ProjectSummary: ProjectSummary{
			ID:           savedSummary.ID,
			Name:         "Phase 1 Test Topology (Updated)",
			Description:  "Updated description",
			CanvasWidth:  2560,
			CanvasHeight: 1440,
		},
		SchemaJSON: string(updatedBytes),
	})
	if err != nil {
		t.Fatalf("SaveProject (update) failed: %v", err)
	}
	if updatedSummary.ID != savedSummary.ID {
		t.Errorf("expected updated project ID %d, got %d", savedSummary.ID, updatedSummary.ID)
	}
	if updatedSummary.CanvasWidth != 2560 || updatedSummary.CanvasHeight != 1440 {
		t.Errorf("expected updated dimensions 2560x1440, got %dx%d", updatedSummary.CanvasWidth, updatedSummary.CanvasHeight)
	}

	// 4. ListProjects should have 1 entry
	projects, err := ListProjects()
	if err != nil {
		t.Fatalf("ListProjects failed: %v", err)
	}
	if len(projects) != 1 {
		t.Fatalf("expected 1 project in list, got %d", len(projects))
	}
	if projects[0].Name != "Phase 1 Test Topology (Updated)" {
		t.Errorf("expected listed project name %q, got %q", "Phase 1 Test Topology (Updated)", projects[0].Name)
	}

	// 5. DeleteProject
	if err := DeleteProject(savedSummary.ID); err != nil {
		t.Fatalf("DeleteProject(%d) failed: %v", savedSummary.ID, err)
	}
	afterDelete, err := ListProjects()
	if err != nil {
		t.Fatalf("ListProjects after delete failed: %v", err)
	}
	if len(afterDelete) != 0 {
		t.Fatalf("expected 0 projects after delete, got %d", len(afterDelete))
	}
}
