package scene

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// nextImageID generates the next sequential image ID.
func (s *Scene) nextImageID() StringID {
	s.imagesCounter++
	return StringID("image-" + strconv.FormatInt(s.imagesCounter, 10))
}

// ImagesCounter returns the current image ID counter.
func (s *Scene) ImagesCounter() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.imagesCounter
}

// CreateImage inserts a new Image object into the scene.
func (s *Scene) CreateImage(initial Image) (Image, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var newID StringID
	if initial.ID != "" {
		if _, exists := s.images[initial.ID]; exists {
			return Image{}, fmt.Errorf("image with ID %s already exists", initial.ID)
		}
		newID = initial.ID
		rawID := string(newID)
		if strings.HasPrefix(rawID, "image-") {
			if num, err := strconv.ParseInt(strings.TrimPrefix(rawID, "image-"), 10, 64); err == nil && num > s.imagesCounter {
				s.imagesCounter = num
			}
		} else if num, err := strconv.ParseInt(rawID, 10, 64); err == nil && num > s.imagesCounter {
			s.imagesCounter = num
		}
	} else {
		newID = s.nextImageID()
	}

	displayName := initial.Name
	if displayName == "" {
		if initial.Filename != "" {
			displayName = initial.Filename
		} else {
			displayName = "Image " + string(newID)
		}
	}

	w := initial.Width
	if w <= 0 {
		if initial.NaturalWidth > 0 {
			w = initial.NaturalWidth
		} else {
			w = 200.0
		}
	}
	h := initial.Height
	if h <= 0 {
		if initial.NaturalHeight > 0 {
			h = initial.NaturalHeight
		} else {
			h = 150.0
		}
	}

	// Default position to center if unspecified
	x := initial.X
	y := initial.Y
	if x == 0 && y == 0 {
		x = 50.0
		y = 50.0
	}

	opacity := initial.Opacity
	if opacity <= 0 {
		opacity = 1.0
	}

	srcVal := initial.Src
	if srcVal == "" {
		srcVal = initial.Data
	}

	var cropPtr *ImageCrop
	if initial.Crop != nil {
		c := *initial.Crop
		cropPtr = &c
	}

	var clipPtr *ImageClip
	if initial.Clip != nil {
		cl := *initial.Clip
		clipPtr = &cl
	}

	// Initialize crop versions
	var versions []CropVersion
	if len(initial.CropVersions) > 0 {
		versions = make([]CropVersion, len(initial.CropVersions))
		copy(versions, initial.CropVersions)
	} else {
		nw := initial.NaturalWidth
		if nw <= 0 {
			nw = w
		}
		nh := initial.NaturalHeight
		if nh <= 0 {
			nh = h
		}
		origVer := CropVersion{
			ID:           "original",
			Name:         "Original",
			SourceX:      0,
			SourceY:      0,
			SourceWidth:  nw,
			SourceHeight: nh,
			Width:        w,
			Height:       h,
			X:            math.Round(x*1000.0) / 1000.0,
			Y:            math.Round(y*1000.0) / 1000.0,
			OrigX:        math.Round(x*1000.0) / 1000.0,
			OrigY:        math.Round(y*1000.0) / 1000.0,
			OrigWidth:    w,
			OrigHeight:   h,
		}
		versions = append(versions, origVer)
		if cropPtr != nil && cropPtr.Enabled && cropPtr.SourceWidth > 0 && cropPtr.SourceHeight > 0 {
			cropVer := CropVersion{
				ID:           "crop-1",
				Name:         "Crop 1",
				SourceX:      cropPtr.SourceX,
				SourceY:      cropPtr.SourceY,
				SourceWidth:  cropPtr.SourceWidth,
				SourceHeight: cropPtr.SourceHeight,
				Width:        w,
				Height:       h,
				X:            math.Round(x*1000.0) / 1000.0,
				Y:            math.Round(y*1000.0) / 1000.0,
				OrigX:        cropPtr.OrigX,
				OrigY:        cropPtr.OrigY,
				OrigWidth:    cropPtr.OrigWidth,
				OrigHeight:   cropPtr.OrigHeight,
			}
			versions = append(versions, cropVer)
		}
	}
	activeVerID := initial.ActiveCropVersionID
	if activeVerID == "" {
		if cropPtr != nil && cropPtr.Enabled && len(versions) > 1 {
			activeVerID = versions[1].ID
		} else {
			activeVerID = "original"
		}
	}

	img := Image{
		ID:                  newID,
		Name:                displayName,
		AssetRef:            initial.AssetRef,
		Src:                 srcVal,
		Data:                srcVal,
		Filename:            initial.Filename,
		Mime:                initial.Mime,
		X:                   math.Round(x*1000.0) / 1000.0,
		Y:                   math.Round(y*1000.0) / 1000.0,
		Width:               w,
		Height:              h,
		NaturalWidth:        initial.NaturalWidth,
		NaturalHeight:       initial.NaturalHeight,
		MaintainAspectRatio: initial.MaintainAspectRatio,
		Crop:                cropPtr,
		CropVersions:        versions,
		ActiveCropVersionID: activeVerID,
		Clip:                clipPtr,
		Opacity:             opacity,
		Visible:             initial.Visible,
		Locked:              initial.Locked,
		Metadata:            initial.Metadata,
	}

	if s.images == nil {
		s.images = make(map[StringID]Image)
	}
	s.images[newID] = img
	s.imageIDs = append(s.imageIDs, newID)

	// Append to layer order at top
	s.ensureLayersInitializedLocked()
	s.layers = append(s.layers, LayerEntry{Type: SelectionImage, ID: newID})

	s.revision++
	return img, nil
}

// GetImage retrieves an image by ID.
func (s *Scene) GetImage(id StringID) (Image, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	img, exists := s.images[id]
	return img, exists
}

// ValidateImage checks that image configuration conforms to operational bounds.
func ValidateImage(img *Image) error {
	if img == nil {
		return errors.New("nil image")
	}
	if img.Width < 0 || img.Height < 0 {
		return errors.New("image dimensions cannot be negative")
	}
	if img.Opacity < 0 || img.Opacity > 1.0 {
		return errors.New("opacity must be between 0.0 and 1.0")
	}
	return nil
}

// ImagePatch defines a typed pointer-field patch for partial updates to Image.
type ImagePatch struct {
	Name                *string              `json:"name,omitempty"`
	AssetRef            *string              `json:"assetRef,omitempty"`
	Src                 *string              `json:"src,omitempty"`
	Data                *string              `json:"data,omitempty"`
	Filename            *string              `json:"filename,omitempty"`
	Mime                *string              `json:"mime,omitempty"`
	X                   *float64             `json:"x,omitempty"`
	Y                   *float64             `json:"y,omitempty"`
	Width               *float64             `json:"width,omitempty"`
	Height              *float64             `json:"height,omitempty"`
	NaturalWidth        *float64             `json:"naturalWidth,omitempty"`
	NaturalHeight       *float64             `json:"naturalHeight,omitempty"`
	MaintainAspectRatio *bool                `json:"maintainAspectRatio,omitempty"`
	Crop                *ImageCrop           `json:"crop,omitempty"`
	CropVersions        *[]CropVersion       `json:"cropVersions,omitempty"`
	ActiveCropVersionID *string              `json:"activeCropVersionId,omitempty"`
	Clip                *ImageClip           `json:"clip,omitempty"`
	Opacity             *float64             `json:"opacity,omitempty"`
	Visible             *bool                `json:"visible,omitempty"`
	Locked              *bool                `json:"locked,omitempty"`
	Metadata            map[string]any       `json:"metadata,omitempty"`
}

// UpdateImagePatch updates fields of an existing image using typed pointers for safe partial updates.
func (s *Scene) UpdateImagePatch(id StringID, patch ImagePatch) (Image, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	img, exists := s.images[id]
	if !exists {
		return Image{}, fmt.Errorf("image not found: %s", id)
	}

	candidate := img

	if patch.Name != nil {
		candidate.Name = *patch.Name
	}
	if patch.AssetRef != nil {
		candidate.AssetRef = *patch.AssetRef
	}
	if patch.Src != nil {
		candidate.Src = *patch.Src
		candidate.Data = *patch.Src
	} else if patch.Data != nil {
		candidate.Src = *patch.Data
		candidate.Data = *patch.Data
	}
	if patch.Filename != nil {
		candidate.Filename = *patch.Filename
	}
	if patch.Mime != nil {
		candidate.Mime = *patch.Mime
	}
	if patch.X != nil {
		candidate.X = math.Round(*patch.X*1000.0) / 1000.0
	}
	if patch.Y != nil {
		candidate.Y = math.Round(*patch.Y*1000.0) / 1000.0
	}
	if patch.Width != nil {
		candidate.Width = *patch.Width
	}
	if patch.Height != nil {
		candidate.Height = *patch.Height
	}
	if patch.NaturalWidth != nil {
		candidate.NaturalWidth = *patch.NaturalWidth
	}
	if patch.NaturalHeight != nil {
		candidate.NaturalHeight = *patch.NaturalHeight
	}
	if patch.MaintainAspectRatio != nil {
		candidate.MaintainAspectRatio = *patch.MaintainAspectRatio
	}
	if patch.Crop != nil {
		c := *patch.Crop
		candidate.Crop = &c
	}
	if patch.CropVersions != nil {
		candidate.CropVersions = *patch.CropVersions
	}
	if patch.ActiveCropVersionID != nil {
		candidate.ActiveCropVersionID = *patch.ActiveCropVersionID
	}
	if patch.Clip != nil {
		cl := *patch.Clip
		candidate.Clip = &cl
	}
	if patch.Opacity != nil {
		candidate.Opacity = *patch.Opacity
	}
	if patch.Visible != nil {
		candidate.Visible = patch.Visible
	}
	if patch.Locked != nil {
		candidate.Locked = *patch.Locked
	}
	if patch.Metadata != nil {
		candidate.Metadata = patch.Metadata
	}

	if candidate.Crop == nil || !candidate.Crop.Enabled {
		if len(candidate.CropVersions) > 0 && candidate.CropVersions[0].ID == "original" {
			if patch.Width != nil {
				candidate.CropVersions[0].Width = candidate.Width
				candidate.CropVersions[0].OrigWidth = candidate.Width
			}
			if patch.Height != nil {
				candidate.CropVersions[0].Height = candidate.Height
				candidate.CropVersions[0].OrigHeight = candidate.Height
			}
			if patch.X != nil || patch.Y != nil {
				candidate.CropVersions[0].X = candidate.X
				candidate.CropVersions[0].Y = candidate.Y
				candidate.CropVersions[0].OrigX = candidate.X
				candidate.CropVersions[0].OrigY = candidate.Y
			}
		}
	}

	if err := ValidateImage(&candidate); err != nil {
		return Image{}, fmt.Errorf("validating image: %w", err)
	}

	s.images[id] = candidate
	s.revision++
	return candidate, nil
}

// UpdateImage updates fields of an existing image (compatibility wrapper around UpdateImagePatch).
func (s *Scene) UpdateImage(id StringID, patch Image) (Image, error) {
	p := ImagePatch{}
	if patch.Name != "" {
		p.Name = &patch.Name
	}
	if patch.AssetRef != "" {
		p.AssetRef = &patch.AssetRef
	}
	if patch.Src != "" {
		p.Src = &patch.Src
	}
	if patch.Data != "" {
		p.Data = &patch.Data
	}
	if patch.Filename != "" {
		p.Filename = &patch.Filename
	}
	if patch.Mime != "" {
		p.Mime = &patch.Mime
	}
	if patch.X != 0 {
		p.X = &patch.X
	}
	if patch.Y != 0 {
		p.Y = &patch.Y
	}
	if patch.Width > 0 {
		p.Width = &patch.Width
	}
	if patch.Height > 0 {
		p.Height = &patch.Height
	}
	if patch.NaturalWidth > 0 {
		p.NaturalWidth = &patch.NaturalWidth
	}
	if patch.NaturalHeight > 0 {
		p.NaturalHeight = &patch.NaturalHeight
	}
	if patch.MaintainAspectRatio {
		p.MaintainAspectRatio = &patch.MaintainAspectRatio
	}
	if patch.Crop != nil {
		p.Crop = patch.Crop
	}
	if patch.CropVersions != nil {
		p.CropVersions = &patch.CropVersions
	}
	if patch.ActiveCropVersionID != "" {
		p.ActiveCropVersionID = &patch.ActiveCropVersionID
	}
	if patch.Clip != nil {
		p.Clip = patch.Clip
	}
	if patch.Opacity > 0 {
		p.Opacity = &patch.Opacity
	}
	if patch.Visible != nil {
		p.Visible = patch.Visible
	}
	if patch.Locked {
		p.Locked = &patch.Locked
	}
	if patch.Metadata != nil {
		p.Metadata = patch.Metadata
	}
	return s.UpdateImagePatch(id, p)
}

// DeleteImage deletes an image and removes it from layers and any parent group.
func (s *Scene) DeleteImage(id StringID) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.images[id]; !exists {
		return fmt.Errorf("image not found: %s", id)
	}

	delete(s.images, id)

	newIDs := make([]StringID, 0, len(s.imageIDs)-1)
	for _, cur := range s.imageIDs {
		if cur != id {
			newIDs = append(newIDs, cur)
		}
	}
	s.imageIDs = newIDs

	// Prune from selection, parent group and layers
	s.pruneSelectionLocked(SelectionImage, id)
	s.pruneGroupMembersLocked(SelectionImage, id)
	s.removeLayerEntryLocked(SelectionImage, id)

	s.revision++
	return nil
}

// GetAllImages returns all image objects in deterministic order.
func (s *Scene) GetAllImages() []Image {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]Image, 0, len(s.imageIDs))
	for _, id := range s.imageIDs {
		if img, exists := s.images[id]; exists {
			out = append(out, img)
		}
	}
	return out
}

func ensureCropVersionsInitializedLocked(img *Image) {
	if len(img.CropVersions) == 0 {
		nw := img.NaturalWidth
		if nw <= 0 {
			nw = img.Width
		}
		nh := img.NaturalHeight
		if nh <= 0 {
			nh = img.Height
		}
		orig := CropVersion{
			ID:           "original",
			Name:         "Original",
			SourceX:      0,
			SourceY:      0,
			SourceWidth:  nw,
			SourceHeight: nh,
			Width:        img.Width,
			Height:       img.Height,
			X:            img.X,
			Y:            img.Y,
			OrigX:        img.X,
			OrigY:        img.Y,
			OrigWidth:    img.Width,
			OrigHeight:   img.Height,
		}
		img.CropVersions = []CropVersion{orig}
		if img.ActiveCropVersionID == "" {
			img.ActiveCropVersionID = "original"
		}
	}
}

// CreateCropVersion configures a named crop and records it as an active crop version.
func (s *Scene) CreateCropVersion(id StringID, name string, crop ImageCrop, newX, newY, newW, newH *float64) (Image, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	img, exists := s.images[id]
	if !exists {
		return Image{}, fmt.Errorf("image not found: %s", id)
	}

	ensureCropVersionsInitializedLocked(&img)

	crop.Enabled = true

	// If original uncropped dimensions are not recorded yet, capture current dimensions
	if crop.OrigWidth <= 0 {
		if img.Crop != nil && img.Crop.OrigWidth > 0 {
			crop.OrigWidth = img.Crop.OrigWidth
			crop.OrigHeight = img.Crop.OrigHeight
			crop.OrigX = img.Crop.OrigX
			crop.OrigY = img.Crop.OrigY
		} else {
			crop.OrigWidth = img.Width
			crop.OrigHeight = img.Height
			crop.OrigX = img.X
			crop.OrigY = img.Y
		}
	}

	// Ensure the "original" version reflects the uncropped dimensions
	if len(img.CropVersions) > 0 && img.CropVersions[0].ID == "original" {
		if crop.OrigWidth > 0 {
			img.CropVersions[0].Width = crop.OrigWidth
			img.CropVersions[0].OrigWidth = crop.OrigWidth
		}
		if crop.OrigHeight > 0 {
			img.CropVersions[0].Height = crop.OrigHeight
			img.CropVersions[0].OrigHeight = crop.OrigHeight
		}
		if crop.OrigX > 0 || crop.OrigY > 0 {
			img.CropVersions[0].X = crop.OrigX
			img.CropVersions[0].Y = crop.OrigY
			img.CropVersions[0].OrigX = crop.OrigX
			img.CropVersions[0].OrigY = crop.OrigY
		}
	}

	img.Crop = &crop

	targetW := img.Width
	if newW != nil && *newW > 0 {
		targetW = *newW
		img.Width = *newW
	}
	targetH := img.Height
	if newH != nil && *newH > 0 {
		targetH = *newH
		img.Height = *newH
	}
	targetX := img.X
	if newX != nil {
		targetX = math.Round(*newX*1000.0) / 1000.0
		img.X = targetX
	}
	targetY := img.Y
	if newY != nil {
		targetY = math.Round(*newY*1000.0) / 1000.0
		img.Y = targetY
	}

	// Generate version ID and Name
	verNum := len(img.CropVersions)
	verID := fmt.Sprintf("crop-%d", verNum)
	for {
		clash := false
		for _, cv := range img.CropVersions {
			if cv.ID == verID {
				clash = true
				break
			}
		}
		if !clash {
			break
		}
		verNum++
		verID = fmt.Sprintf("crop-%d", verNum)
	}

	verName := strings.TrimSpace(name)
	if verName == "" {
		verName = fmt.Sprintf("Crop %d", verNum)
	}

	newVersion := CropVersion{
		ID:           verID,
		Name:         verName,
		SourceX:      crop.SourceX,
		SourceY:      crop.SourceY,
		SourceWidth:  crop.SourceWidth,
		SourceHeight: crop.SourceHeight,
		Width:        targetW,
		Height:       targetH,
		X:            targetX,
		Y:            targetY,
		OrigX:        crop.OrigX,
		OrigY:        crop.OrigY,
		OrigWidth:    crop.OrigWidth,
		OrigHeight:   crop.OrigHeight,
	}

	img.CropVersions = append(img.CropVersions, newVersion)
	img.ActiveCropVersionID = verID

	s.images[id] = img
	s.revision++
	return img, nil
}

// SetImageCrop configures non-destructive rectangular cropping for an image, registering it as a crop version.
func (s *Scene) SetImageCrop(id StringID, crop ImageCrop, newX, newY, newW, newH *float64) (Image, error) {
	return s.CreateCropVersion(id, "", crop, newX, newY, newW, newH)
}

// SelectCropVersion switches the active crop version for an image.
func (s *Scene) SelectCropVersion(id StringID, versionID string) (Image, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	img, exists := s.images[id]
	if !exists {
		return Image{}, fmt.Errorf("image not found: %s", id)
	}

	ensureCropVersionsInitializedLocked(&img)

	var targetVer *CropVersion
	for i := range img.CropVersions {
		if img.CropVersions[i].ID == versionID {
			targetVer = &img.CropVersions[i]
			break
		}
	}
	if targetVer == nil {
		return Image{}, fmt.Errorf("crop version %q not found for image %s", versionID, id)
	}

	img.ActiveCropVersionID = versionID
	if versionID == "original" {
		img.Crop = nil
		if targetVer.Width > 0 {
			img.Width = targetVer.Width
		}
		if targetVer.Height > 0 {
			img.Height = targetVer.Height
		}
		if targetVer.X > 0 || targetVer.Y > 0 {
			img.X = targetVer.X
			img.Y = targetVer.Y
		}
	} else {
		crop := ImageCrop{
			Enabled:      true,
			SourceX:      targetVer.SourceX,
			SourceY:      targetVer.SourceY,
			SourceWidth:  targetVer.SourceWidth,
			SourceHeight: targetVer.SourceHeight,
			OrigX:        targetVer.OrigX,
			OrigY:        targetVer.OrigY,
			OrigWidth:    targetVer.OrigWidth,
			OrigHeight:   targetVer.OrigHeight,
		}
		img.Crop = &crop
		if targetVer.Width > 0 {
			img.Width = targetVer.Width
		}
		if targetVer.Height > 0 {
			img.Height = targetVer.Height
		}
		if targetVer.X > 0 || targetVer.Y > 0 {
			img.X = targetVer.X
			img.Y = targetVer.Y
		}
	}

	s.images[id] = img
	s.revision++
	return img, nil
}

// RenameCropVersion renames a crop version of an image.
func (s *Scene) RenameCropVersion(id StringID, versionID string, newName string) (Image, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	img, exists := s.images[id]
	if !exists {
		return Image{}, fmt.Errorf("image not found: %s", id)
	}

	trimmed := strings.TrimSpace(newName)
	if trimmed == "" {
		return Image{}, fmt.Errorf("crop version name cannot be empty")
	}

	ensureCropVersionsInitializedLocked(&img)

	found := false
	for i := range img.CropVersions {
		if img.CropVersions[i].ID == versionID {
			img.CropVersions[i].Name = trimmed
			found = true
			break
		}
	}
	if !found {
		return Image{}, fmt.Errorf("crop version %q not found for image %s", versionID, id)
	}

	s.images[id] = img
	s.revision++
	return img, nil
}

// DeleteCropVersion removes an existing crop version from an image.
func (s *Scene) DeleteCropVersion(id StringID, versionID string) (Image, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	img, exists := s.images[id]
	if !exists {
		return Image{}, fmt.Errorf("image not found: %s", id)
	}

	if versionID == "original" {
		return Image{}, fmt.Errorf("cannot delete original uncropped version")
	}

	ensureCropVersionsInitializedLocked(&img)

	idx := -1
	for i := range img.CropVersions {
		if img.CropVersions[i].ID == versionID {
			idx = i
			break
		}
	}
	if idx < 0 {
		return Image{}, fmt.Errorf("crop version %q not found for image %s", versionID, id)
	}

	// Remove from list
	img.CropVersions = append(img.CropVersions[:idx], img.CropVersions[idx+1:]...)

	// If the deleted version was active, switch to the previous version or "original"
	if img.ActiveCropVersionID == versionID {
		newActiveIdx := idx - 1
		if newActiveIdx < 0 || newActiveIdx >= len(img.CropVersions) {
			newActiveIdx = 0
		}
		activeVer := img.CropVersions[newActiveIdx]
		img.ActiveCropVersionID = activeVer.ID
		if activeVer.ID == "original" {
			img.Crop = nil
			if activeVer.Width > 0 {
				img.Width = activeVer.Width
			}
			if activeVer.Height > 0 {
				img.Height = activeVer.Height
			}
			if activeVer.X > 0 || activeVer.Y > 0 {
				img.X = activeVer.X
				img.Y = activeVer.Y
			}
		} else {
			crop := ImageCrop{
				Enabled:      true,
				SourceX:      activeVer.SourceX,
				SourceY:      activeVer.SourceY,
				SourceWidth:  activeVer.SourceWidth,
				SourceHeight: activeVer.SourceHeight,
				OrigX:        activeVer.OrigX,
				OrigY:        activeVer.OrigY,
				OrigWidth:    activeVer.OrigWidth,
				OrigHeight:   activeVer.OrigHeight,
			}
			img.Crop = &crop
			if activeVer.Width > 0 {
				img.Width = activeVer.Width
			}
			if activeVer.Height > 0 {
				img.Height = activeVer.Height
			}
			if activeVer.X > 0 || activeVer.Y > 0 {
				img.X = activeVer.X
				img.Y = activeVer.Y
			}
		}
	}

	s.images[id] = img
	s.revision++
	return img, nil
}

// CommitCrop commits current cropped content as the image's new base raster source.
// If discardVersions is true, removes previous crop versions and resets to a single Original version.
// If discardVersions is false, retains previous versions and original asset references.
func (s *Scene) CommitCrop(id StringID, newSrc, newAssetRef, newFilename, newMime string, nw, nh, w, h float64, discardVersions bool) (Image, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	img, exists := s.images[id]
	if !exists {
		return Image{}, fmt.Errorf("image not found: %s", id)
	}

	if newSrc != "" {
		img.Src = newSrc
		img.Data = newSrc
	}
	if newAssetRef != "" {
		img.AssetRef = newAssetRef
	}
	if newFilename != "" {
		img.Filename = newFilename
	}
	if newMime != "" {
		img.Mime = newMime
	}
	if nw > 0 {
		img.NaturalWidth = nw
	}
	if nh > 0 {
		img.NaturalHeight = nh
	}
	if w > 0 {
		img.Width = w
	}
	if h > 0 {
		img.Height = h
	}

	// Active crop is now committed into the source image
	img.Crop = nil

	if discardVersions {
		orig := CropVersion{
			ID:           "original",
			Name:         "Original",
			SourceX:      0,
			SourceY:      0,
			SourceWidth:  img.NaturalWidth,
			SourceHeight: img.NaturalHeight,
			Width:        img.Width,
			Height:       img.Height,
			X:            img.X,
			Y:            img.Y,
			OrigX:        img.X,
			OrigY:        img.Y,
			OrigWidth:    img.Width,
			OrigHeight:   img.Height,
		}
		img.CropVersions = []CropVersion{orig}
		img.ActiveCropVersionID = "original"
	} else {
		ensureCropVersionsInitializedLocked(&img)
		img.ActiveCropVersionID = "original"
		if len(img.CropVersions) > 0 && img.CropVersions[0].ID == "original" {
			img.CropVersions[0].SourceWidth = img.NaturalWidth
			img.CropVersions[0].SourceHeight = img.NaturalHeight
			img.CropVersions[0].Width = img.Width
			img.CropVersions[0].Height = img.Height
		}
	}

	s.images[id] = img
	s.revision++
	return img, nil
}

// ResetImageCrop removes cropping and restores pre-crop dimensions by selecting the "original" crop version.
func (s *Scene) ResetImageCrop(id StringID) (Image, error) {
	return s.SelectCropVersion(id, "original")
}

// SetImageClip configures non-destructive object-local rectangular clipping for an image.
func (s *Scene) SetImageClip(id StringID, clip ImageClip) (Image, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	img, exists := s.images[id]
	if !exists {
		return Image{}, fmt.Errorf("image not found: %s", id)
	}

	clip.Enabled = true
	img.Clip = &clip
	s.images[id] = img
	s.revision++
	return img, nil
}

// ResetImageClip removes object-local clipping from an image.
func (s *Scene) ResetImageClip(id StringID) (Image, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	img, exists := s.images[id]
	if !exists {
		return Image{}, fmt.Errorf("image not found: %s", id)
	}

	img.Clip = nil
	s.images[id] = img
	s.revision++
	return img, nil
}
