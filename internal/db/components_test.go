package db

import (
	"path/filepath"
	"testing"
)

func TestComponentLibrarySQLitePersistenceAndDeleteProtection(t *testing.T) {
	tmpDB := filepath.Join(t.TempDir(), "test_components.db")
	if err := InitDB(tmpDB); err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	defer CloseDB()

	// 1. Save v1.0.0 of a child component
	childID := "cmp-status-led-11223344"
	sum1, err := SaveComponent(ComponentRecord{
		ComponentSummary: ComponentSummary{
			ComponentID:   childID,
			Name:          "Status LED",
			Description:   "Pulsing indicator",
			Category:      "indicators",
			Tags:          []string{"led", "status"},
			LatestVersion: "1.0.0",
			ThumbnailSVG:  `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="10"/></svg>`,
		},
		DefinitionJSON: `{"componentId":"cmp-status-led-11223344","version":"1.0.0","name":"Status LED"}`,
		Changelog:      "Initial version",
	})
	if err != nil {
		t.Fatalf("SaveComponent v1.0.0 failed: %v", err)
	}
	if sum1.LatestVersion != "1.0.0" || sum1.ContentSHA256 == "" {
		t.Fatalf("unexpected summary: %+v", sum1)
	}

	// 2. Save v1.1.0 revision and verify both versions are retrievable
	if _, err := SaveComponent(ComponentRecord{
		ComponentSummary: ComponentSummary{
			ComponentID:   childID,
			Name:          "Status LED",
			Description:   "Pulsing indicator v1.1",
			Category:      "indicators",
			Tags:          []string{"led", "status", "pulse"},
			LatestVersion: "1.1.0",
		},
		DefinitionJSON: `{"componentId":"cmp-status-led-11223344","version":"1.1.0","name":"Status LED"}`,
		Changelog:      "Added brightness control",
	}); err != nil {
		t.Fatalf("SaveComponent v1.1.0 failed: %v", err)
	}

	revs, err := ListComponentRevisions(childID)
	if err != nil || len(revs) != 2 {
		t.Fatalf("expected 2 preserved revisions, got %d (err=%v)", len(revs), err)
	}

	oldRec, err := GetComponent(childID, "1.0.0")
	if err != nil || oldRec.LatestVersion != "1.0.0" {
		t.Fatalf("expected preserved v1.0.0, got %+v (err=%v)", oldRec, err)
	}

	// 3. Search & filter
	found, err := ListComponents("pulsing", "indicators", "pulse")
	if err != nil || len(found) != 1 || found[0].ComponentID != childID {
		t.Fatalf("expected 1 filtered component, got %+v (err=%v)", found, err)
	}

	// 4. Save a parent component referencing childID and verify delete protection
	parentID := "cmp-machine-panel-55667788"
	if _, err := SaveComponent(ComponentRecord{
		ComponentSummary: ComponentSummary{
			ComponentID:   parentID,
			Name:          "Machine Panel",
			Category:      "panels",
			LatestVersion: "1.0.0",
		},
		DefinitionJSON: `{"componentId":"cmp-machine-panel-55667788","dependencies":[{"componentId":"cmp-status-led-11223344","version":"1.1.0"}]}`,
	}); err != nil {
		t.Fatalf("SaveComponent parent failed: %v", err)
	}

	usage, err := DeleteComponent(childID, false)
	if err == nil || !usage.InUse || len(usage.ParentComponents) != 1 {
		t.Fatalf("expected delete protection when referenced by parent component, got usage=%+v err=%v", usage, err)
	}

	// Force delete succeeds
	if _, err := DeleteComponent(childID, true); err != nil {
		t.Fatalf("force DeleteComponent failed: %v", err)
	}
}
