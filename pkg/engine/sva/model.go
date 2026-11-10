package sva

import (
	"strconv"
	"strings"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/scene"
)

// AssetEntry describes a bundled binary or vector asset in the package.
type AssetEntry struct {
	ID       string         `json:"id"`
	Path     string         `json:"path"`
	MIME     string         `json:"mime"`
	Size     int64          `json:"size"`
	Width    int            `json:"width,omitempty"`
	Height   int            `json:"height,omitempty"`
	SHA256   string         `json:"sha256,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

// Manifest represents the top-level manifest.json descriptor for an SVA package.
type Manifest struct {
	Format           string         `json:"format"`
	Version          string         `json:"version"`
	MinReaderVersion string         `json:"minReaderVersion"`
	Name             string         `json:"name"`
	Description      string         `json:"description,omitempty"`
	CreatedAt        string         `json:"createdAt"`
	SavedAt          string         `json:"savedAt"`
	Generator        string         `json:"generator"`
	Scene            string         `json:"scene"`
	Assets           []AssetEntry   `json:"assets,omitempty"`
	Metadata         map[string]any `json:"metadata,omitempty"`
}

// PhotoAssetInfo holds metadata for a bundled background image.
type PhotoAssetInfo struct {
	AssetID      string `json:"assetId,omitempty"`
	AssetPath    string `json:"assetPath,omitempty"`
	Filename     string `json:"filename,omitempty"`
	MIME         string `json:"mime,omitempty"`
	NaturalWidth int    `json:"naturalWidth,omitempty"`
	NaturalHeight int   `json:"naturalHeight,omitempty"`
}

// SceneData represents the comprehensive, editable scene description in scene.json.
// It encompasses all Go scene models, diagram objects, effect configurations,
// tracked UI controls, presets, and asset references.
type SceneData struct {
	SchemaVersion   string                 `json:"schemaVersion"`
	Canvas          scene.CanvasConfig     `json:"canvas"`
	Camera          scene.CameraConfig     `json:"camera"`
	Optical         scene.OpticalConfig    `json:"optical,omitempty"`
	Frame           scene.FrameConfig      `json:"frame,omitempty"`
	Controls        map[string]any         `json:"controls,omitempty"`
	Presets         map[string]any         `json:"presets,omitempty"`
	AutoApplyPreset bool                   `json:"autoApplyPreset"`
	Photo           *PhotoAssetInfo        `json:"photo,omitempty"`
	Nodes           []scene.Node           `json:"nodes"`
	NodesCounter    int                    `json:"nodesCounter,omitempty"`
	Flows           []scene.Flow           `json:"flows"`
	FlowsCounter    int                    `json:"flowsCounter,omitempty"`
	Glows           []scene.Glow           `json:"glows"`
	GlowsCounter    int                    `json:"glowsCounter,omitempty"`
	Ripples         []scene.Ripple         `json:"ripples"`
	RipplesCounter  int                    `json:"ripplesCounter,omitempty"`
	Groups          []scene.Group          `json:"groups,omitempty"`
	GroupsCounter   int                    `json:"groupsCounter,omitempty"`
	Metadata        map[string]any         `json:"metadata,omitempty"`
}

// Project represents an uncompressed in-memory SVA project ready for encoding or consumption.
type Project struct {
	Manifest Manifest
	Scene    SceneData
	Assets   map[string][]byte // Keyed by package relative path, e.g. "assets/bg.jpg"
}

// ToSnapshot converts SceneData into a canonical scene.Snapshot.
func (s *SceneData) ToSnapshot() scene.Snapshot {
	groupsCounter := s.GroupsCounter
	if groupsCounter == 0 && len(s.Groups) > 0 {
		for _, g := range s.Groups {
			rawID := string(g.ID)
			if strings.HasPrefix(rawID, "group-") {
				if num, err := strconv.Atoi(strings.TrimPrefix(rawID, "group-")); err == nil && num > groupsCounter {
					groupsCounter = num
				}
			} else if num, err := strconv.Atoi(rawID); err == nil && num > groupsCounter {
				groupsCounter = num
			}
		}
	}

	return scene.Snapshot{
		Canvas:        s.Canvas,
		Camera:        s.Camera,
		Optical:       s.Optical,
		Frame:         s.Frame,
		Overlays:      s.Frame,
		Nodes:         s.Nodes,
		Flows:         s.Flows,
		Glows:         s.Glows,
		Ripples:       s.Ripples,
		Groups:        s.Groups,
		GroupsCounter: int64(groupsCounter),
	}
}
