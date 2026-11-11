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

func TestImageCropAndReset(t *testing.T) {
	sc := NewScene()

	img, err := sc.CreateImage(Image{
		Filename:      "photo.png",
		NaturalWidth:  1000,
		NaturalHeight: 800,
		Width:         500,
		Height:        400,
		X:             50,
		Y:             50,
	})
	if err != nil {
		t.Fatalf("CreateImage failed: %v", err)
	}

	// Apply crop: source rect (100, 100, 400, 300)
	crop := ImageCrop{
		SourceX:      100,
		SourceY:      100,
		SourceWidth:  400,
		SourceHeight: 300,
	}
	newW := 200.0
	newH := 150.0
	newX := 45.0
	newY := 48.0

	cropped, err := sc.SetImageCrop(img.ID, crop, &newX, &newY, &newW, &newH)
	if err != nil {
		t.Fatalf("SetImageCrop failed: %v", err)
	}

	if cropped.Crop == nil || !cropped.Crop.Enabled {
		t.Fatalf("expected crop to be enabled, got %+v", cropped.Crop)
	}
	if cropped.Crop.OrigWidth != 500 || cropped.Crop.OrigHeight != 400 {
		t.Errorf("expected orig dimensions 500x400, got %fx%f", cropped.Crop.OrigWidth, cropped.Crop.OrigHeight)
	}
	if cropped.Crop.OrigX != 50 || cropped.Crop.OrigY != 50 {
		t.Errorf("expected orig pos 50,50, got %f,%f", cropped.Crop.OrigX, cropped.Crop.OrigY)
	}
	if cropped.Width != 200 || cropped.Height != 150 {
		t.Errorf("expected new dimensions 200x150, got %fx%f", cropped.Width, cropped.Height)
	}
	if cropped.X != 45 || cropped.Y != 48 {
		t.Errorf("expected new pos 45,48, got %f,%f", cropped.X, cropped.Y)
	}

	// Reset crop
	reset, err := sc.ResetImageCrop(img.ID)
	if err != nil {
		t.Fatalf("ResetImageCrop failed: %v", err)
	}
	if reset.Crop != nil {
		t.Errorf("expected crop to be nil after reset, got %+v", reset.Crop)
	}
	if reset.Width != 500 || reset.Height != 400 {
		t.Errorf("expected restored dimensions 500x400, got %fx%f", reset.Width, reset.Height)
	}
	if reset.X != 50 || reset.Y != 50 {
		t.Errorf("expected restored pos 50,50, got %f,%f", reset.X, reset.Y)
	}
}

func TestCropVersionsLifecycleAndCommit(t *testing.T) {
	sc := NewScene()

	img, err := sc.CreateImage(Image{
		Filename:      "machine.png",
		NaturalWidth:  1920,
		NaturalHeight: 1080,
		Width:         400,
		Height:        225,
		X:             50,
		Y:             50,
	})
	if err != nil {
		t.Fatalf("CreateImage failed: %v", err)
	}

	// 1. Initial image should have 1 version ("original")
	if len(img.CropVersions) != 1 || img.CropVersions[0].ID != "original" {
		t.Fatalf("expected initial version 'original', got %+v", img.CropVersions)
	}
	if img.ActiveCropVersionID != "original" {
		t.Errorf("expected ActiveCropVersionID 'original', got %s", img.ActiveCropVersionID)
	}

	// 2. Create Crop 1
	crop1 := ImageCrop{
		SourceX:      100,
		SourceY:      50,
		SourceWidth:  800,
		SourceHeight: 600,
	}
	w1, h1, x1, y1 := 300.0, 225.0, 48.0, 52.0
	img1, err := sc.CreateCropVersion(img.ID, "Motor Assembly", crop1, &x1, &y1, &w1, &h1)
	if err != nil {
		t.Fatalf("CreateCropVersion 1 failed: %v", err)
	}
	if len(img1.CropVersions) != 2 {
		t.Fatalf("expected 2 crop versions, got %d", len(img1.CropVersions))
	}
	if img1.ActiveCropVersionID != img1.CropVersions[1].ID {
		t.Errorf("expected active version %s, got %s", img1.CropVersions[1].ID, img1.ActiveCropVersionID)
	}
	if img1.CropVersions[1].Name != "Motor Assembly" {
		t.Errorf("expected name 'Motor Assembly', got %s", img1.CropVersions[1].Name)
	}
	ver1ID := img1.CropVersions[1].ID

	// 3. Create Crop 2
	crop2 := ImageCrop{
		SourceX:      1000,
		SourceY:      200,
		SourceWidth:  500,
		SourceHeight: 400,
	}
	w2, h2, x2, y2 := 250.0, 200.0, 60.0, 40.0
	img2, err := sc.CreateCropVersion(img.ID, "Control Panel", crop2, &x2, &y2, &w2, &h2)
	if err != nil {
		t.Fatalf("CreateCropVersion 2 failed: %v", err)
	}
	if len(img2.CropVersions) != 3 {
		t.Fatalf("expected 3 crop versions, got %d", len(img2.CropVersions))
	}
	ver2ID := img2.CropVersions[2].ID
	if img2.ActiveCropVersionID != ver2ID {
		t.Errorf("expected active version %s, got %s", ver2ID, img2.ActiveCropVersionID)
	}

	// 4. Switch to original
	origState, err := sc.SelectCropVersion(img.ID, "original")
	if err != nil {
		t.Fatalf("SelectCropVersion 'original' failed: %v", err)
	}
	if origState.Crop != nil {
		t.Errorf("expected crop nil on original, got %+v", origState.Crop)
	}
	if origState.ActiveCropVersionID != "original" {
		t.Errorf("expected active 'original', got %s", origState.ActiveCropVersionID)
	}

	// 5. Switch back to Crop 1
	c1State, err := sc.SelectCropVersion(img.ID, ver1ID)
	if err != nil {
		t.Fatalf("SelectCropVersion 1 failed: %v", err)
	}
	if c1State.Crop == nil || c1State.Crop.SourceWidth != 800 {
		t.Errorf("expected restored crop 1 width 800, got %+v", c1State.Crop)
	}
	if c1State.Width != 300 || c1State.Height != 225 {
		t.Errorf("expected restored display dimensions 300x225, got %fx%f", c1State.Width, c1State.Height)
	}

	// 6. Rename Crop 1
	renamed, err := sc.RenameCropVersion(img.ID, ver1ID, "Primary Pump")
	if err != nil {
		t.Fatalf("RenameCropVersion failed: %v", err)
	}
	if renamed.CropVersions[1].Name != "Primary Pump" {
		t.Errorf("expected renamed 'Primary Pump', got %s", renamed.CropVersions[1].Name)
	}

	// 7. Delete Crop 2
	deleted, err := sc.DeleteCropVersion(img.ID, ver2ID)
	if err != nil {
		t.Fatalf("DeleteCropVersion failed: %v", err)
	}
	if len(deleted.CropVersions) != 2 {
		t.Errorf("expected 2 versions after deletion, got %d", len(deleted.CropVersions))
	}

	// Cannot delete original
	if _, err := sc.DeleteCropVersion(img.ID, "original"); err == nil {
		t.Errorf("expected error when deleting 'original', got nil")
	}

	// 8. Commit Crop (Preserve versions)
	committedPreserve, err := sc.CommitCrop(img.ID, "data:image/png;base64,AAA", "assets/cropped.png", "cropped.png", "image/png", 800, 600, 300, 225, false)
	if err != nil {
		t.Fatalf("CommitCrop preserve failed: %v", err)
	}
	if committedPreserve.Crop != nil {
		t.Errorf("expected Crop nil after commit, got %+v", committedPreserve.Crop)
	}
	if committedPreserve.NaturalWidth != 800 || committedPreserve.NaturalHeight != 600 {
		t.Errorf("expected new natural dimensions 800x600, got %fx%f", committedPreserve.NaturalWidth, committedPreserve.NaturalHeight)
	}
	if len(committedPreserve.CropVersions) < 1 {
		t.Errorf("expected preserved crop versions, got %d", len(committedPreserve.CropVersions))
	}

	// 9. Commit Crop (Discard versions)
	committedDiscard, err := sc.CommitCrop(img.ID, "data:image/png;base64,BBB", "assets/final.png", "final.png", "image/png", 800, 600, 300, 225, true)
	if err != nil {
		t.Fatalf("CommitCrop discard failed: %v", err)
	}
	if len(committedDiscard.CropVersions) != 1 || committedDiscard.CropVersions[0].ID != "original" {
		t.Errorf("expected only 1 'original' version after discard, got %+v", committedDiscard.CropVersions)
	}
}
