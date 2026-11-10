package scene

import (
	"testing"
)

func TestImageCRUD(t *testing.T) {
	sc := NewScene()

	// 1. Create Image
	img, err := sc.CreateImage(Image{
		Filename:     "diagram.png",
		NaturalWidth: 800,
		NaturalHeight: 600,
		Width:        400,
		Height:       300,
		X:            50,
		Y:            50,
	})
	if err != nil {
		t.Fatalf("CreateImage failed: %v", err)
	}
	if img.ID != "image-1" {
		t.Errorf("expected ID image-1, got %s", img.ID)
	}
	if img.Name != "diagram.png" {
		t.Errorf("expected Name diagram.png, got %s", img.Name)
	}
	if img.Width != 400 || img.Height != 300 {
		t.Errorf("expected 400x300, got %fx%f", img.Width, img.Height)
	}
	if !img.IsVisible() {
		t.Errorf("expected default image to be visible")
	}
	if img.IsLocked() {
		t.Errorf("expected default image to be unlocked")
	}

	// Verify image is in layers
	layers := sc.GetLayers()
	if len(layers) != 1 || layers[0].Type != SelectionImage || layers[0].ID != img.ID {
		t.Fatalf("expected 1 layer entry for image, got %+v", layers)
	}

	// 2. Get Image
	retrieved, exists := sc.GetImage(img.ID)
	if !exists {
		t.Fatalf("image %s not found", img.ID)
	}
	if retrieved.Name != "diagram.png" {
		t.Errorf("expected Name diagram.png, got %s", retrieved.Name)
	}

	// 3. Update Image
	visFalse := false
	updated, err := sc.UpdateImage(img.ID, Image{
		Name:    "Renamed Diagram",
		Width:   500,
		Height:  375,
		Visible: &visFalse,
		Locked:  true,
	})
	if err != nil {
		t.Fatalf("UpdateImage failed: %v", err)
	}
	if updated.Name != "Renamed Diagram" {
		t.Errorf("expected Renamed Diagram, got %s", updated.Name)
	}
	if updated.Width != 500 || updated.Height != 375 {
		t.Errorf("expected 500x375, got %fx%f", updated.Width, updated.Height)
	}
	if updated.IsVisible() {
		t.Errorf("expected image to be hidden")
	}
	if !updated.IsLocked() {
		t.Errorf("expected image to be locked")
	}

	// 4. GetAllImages
	all := sc.GetAllImages()
	if len(all) != 1 || all[0].ID != img.ID {
		t.Errorf("expected 1 image in GetAllImages, got %d", len(all))
	}

	// 5. Delete Image
	err = sc.DeleteImage(img.ID)
	if err != nil {
		t.Fatalf("DeleteImage failed: %v", err)
	}
	if len(sc.GetAllImages()) != 0 {
		t.Errorf("expected 0 images after deletion")
	}
	if len(sc.GetLayers()) != 0 {
		t.Errorf("expected 0 layers after image deletion, got %+v", sc.GetLayers())
	}
}

func TestImageSnapshotAndHistory(t *testing.T) {
	sc := NewScene()

	sc.RecordHistory() // initial empty

	img1, _ := sc.CreateImage(Image{
		Filename: "bg.jpg",
		Width:    1280,
		Height:   720,
	})
	sc.RecordHistory()

	img2, _ := sc.CreateImage(Image{
		Filename: "logo.png",
		Width:    200,
		Height:   50,
	})
	sc.RecordHistory()

	if len(sc.GetAllImages()) != 2 {
		t.Fatalf("expected 2 images, got %d", len(sc.GetAllImages()))
	}

	// Undo to img1 only
	entry, err := sc.UndoHistory()
	if err != nil {
		t.Fatalf("Undo failed: %v", err)
	}
	if len(entry.Snapshot.Images) != 1 || entry.Snapshot.Images[0].ID != img1.ID {
		t.Errorf("expected snapshot with img1 on undo, got %+v", entry.Snapshot.Images)
	}
	if len(sc.GetAllImages()) != 1 {
		t.Errorf("expected 1 image after undo, got %d", len(sc.GetAllImages()))
	}

	// Redo back to both images
	entry, err = sc.RedoHistory()
	if err != nil {
		t.Fatalf("Redo failed: %v", err)
	}
	if len(entry.Snapshot.Images) != 2 {
		t.Errorf("expected snapshot with 2 images on redo, got %d", len(entry.Snapshot.Images))
	}
	if len(sc.GetAllImages()) != 2 {
		t.Errorf("expected 2 images after redo, got %d", len(sc.GetAllImages()))
	}
	_ = img2
}
