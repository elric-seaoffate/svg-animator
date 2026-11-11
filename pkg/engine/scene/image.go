package scene

import (
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

// UpdateImage updates fields of an existing image.
func (s *Scene) UpdateImage(id StringID, patch Image) (Image, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	img, exists := s.images[id]
	if !exists {
		return Image{}, fmt.Errorf("image not found: %s", id)
	}

	if patch.Name != "" {
		img.Name = patch.Name
	}
	if patch.AssetRef != "" {
		img.AssetRef = patch.AssetRef
	}
	if patch.Src != "" {
		img.Src = patch.Src
		img.Data = patch.Src
	} else if patch.Data != "" {
		img.Src = patch.Data
		img.Data = patch.Data
	}
	if patch.Filename != "" {
		img.Filename = patch.Filename
	}
	if patch.Mime != "" {
		img.Mime = patch.Mime
	}
	if patch.X != 0 || patch.Y != 0 {
		img.X = math.Round(patch.X*1000.0) / 1000.0
		img.Y = math.Round(patch.Y*1000.0) / 1000.0
	}
	if patch.Width > 0 {
		img.Width = patch.Width
	}
	if patch.Height > 0 {
		img.Height = patch.Height
	}
	if patch.NaturalWidth > 0 {
		img.NaturalWidth = patch.NaturalWidth
	}
	if patch.NaturalHeight > 0 {
		img.NaturalHeight = patch.NaturalHeight
	}
	img.MaintainAspectRatio = patch.MaintainAspectRatio
	if patch.Crop != nil {
		c := *patch.Crop
		img.Crop = &c
	}
	if patch.Opacity > 0 {
		img.Opacity = patch.Opacity
	}
	if patch.Visible != nil {
		img.Visible = patch.Visible
	}
	img.Locked = patch.Locked
	if patch.Metadata != nil {
		img.Metadata = patch.Metadata
	}

	s.images[id] = img
	s.revision++
	return img, nil
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

// SetImageCrop configures non-destructive rectangular cropping for an image.
func (s *Scene) SetImageCrop(id StringID, crop ImageCrop, newX, newY, newW, newH *float64) (Image, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	img, exists := s.images[id]
	if !exists {
		return Image{}, fmt.Errorf("image not found: %s", id)
	}

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

	img.Crop = &crop

	if newW != nil && *newW > 0 {
		img.Width = *newW
	}
	if newH != nil && *newH > 0 {
		img.Height = *newH
	}
	if newX != nil {
		img.X = math.Round(*newX*1000.0) / 1000.0
	}
	if newY != nil {
		img.Y = math.Round(*newY*1000.0) / 1000.0
	}

	s.images[id] = img
	s.revision++
	return img, nil
}

// ResetImageCrop removes cropping and restores pre-crop dimensions.
func (s *Scene) ResetImageCrop(id StringID) (Image, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	img, exists := s.images[id]
	if !exists {
		return Image{}, fmt.Errorf("image not found: %s", id)
	}

	if img.Crop != nil {
		if img.Crop.OrigWidth > 0 {
			img.Width = img.Crop.OrigWidth
		}
		if img.Crop.OrigHeight > 0 {
			img.Height = img.Crop.OrigHeight
		}
		if img.Crop.OrigWidth > 0 && img.Crop.OrigHeight > 0 {
			img.X = img.Crop.OrigX
			img.Y = img.Crop.OrigY
		}
		img.Crop = nil
	}

	s.images[id] = img
	s.revision++
	return img, nil
}
