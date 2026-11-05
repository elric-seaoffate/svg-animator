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
		"version": "1.2.0",
		"controls": map[string]interface{}{
			"canvasPatternSelect": "blueprint",
			"canvasPresetSelect":  "1920x1080",
			"canvasWidthInput":    "1920",
			"canvasHeightInput":   "1080",
			"chkSnapToGrid":       false,
			"chkModuleFrame":      true,
			"frameStyleSelect":    "walnut",
		},
		"loadedPhoto": nil,
		"presets": map[string]interface{}{
			"width":       map[string]interface{}{"enabled": true, "value": 170},
			"height":      map[string]interface{}{"enabled": false, "value": 80},
			"fillColor":   map[string]interface{}{"enabled": true, "value": "#161b22"},
			"strokeColor": map[string]interface{}{"enabled": true, "value": "#58a6ff"},
			"textColor":   map[string]interface{}{"enabled": true, "value": "#e6edf3"},
			"fontSize":    map[string]interface{}{"enabled": true, "value": 15},
			"fillOpacity": map[string]interface{}{"enabled": false, "value": 0.92},
			"strokeWidth": map[string]interface{}{"enabled": false, "value": 2},
			"strokeStyle": map[string]interface{}{"enabled": false, "value": "solid"},
			"shape":       map[string]interface{}{"enabled": false, "value": "rounded"},
			"anim":        map[string]interface{}{"enabled": false, "value": "none"},
		},
		"autoApplyPreset": true,
		"nodes": []map[string]interface{}{
			{
				"id":          1,
				"shape":       "rounded",
				"text":        "Primary Server",
				"subtext":     "10.0.0.1",
				"x":           50.0,
				"y":           50.0,
				"width":       170.0,
				"height":      80.0,
				"fillColor":   "#161b22",
				"fillOpacity": 0.92,
				"strokeColor": "#58a6ff",
				"strokeWidth": 2.0,
				"strokeStyle": "solid",
				"textColor":   "#e6edf3",
				"fontSize":    15.0,
				"anim":        "none",
			},
		},
		"nodesCounter":   1,
		"flows":          []interface{}{},
		"flowsCounter":   0,
		"glows":          []interface{}{},
		"glowsCounter":   0,
		"ripples":        []interface{}{},
		"ripplesCounter": 0,
	}
	schemaBytes, err := json.Marshal(sampleSchema)
	if err != nil {
		t.Fatalf("failed to marshal sample schema: %v", err)
	}

	// 1. Insert new project
	savedSummary, err := SaveProject(ProjectRecord{
		ProjectSummary: ProjectSummary{
			Name:         "Phase 1 Test Topology",
			Description:  "Automated verification project",
			CanvasWidth:  1920,
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
	sampleSchema["autoApplyPreset"] = false
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
