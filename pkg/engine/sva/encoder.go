package sva

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/scene"
)

// Encode serializes an in-memory Project into a valid .sva ZIP byte stream.
func Encode(proj *Project) ([]byte, error) {
	if proj == nil {
		return nil, errors.New("sva: project is nil")
	}

	// 1. Ensure required Manifest defaults
	if proj.Manifest.Format == "" {
		proj.Manifest.Format = FormatSignature
	}
	if proj.Manifest.Version == "" {
		proj.Manifest.Version = CurrentFormatVersion
	}
	if proj.Manifest.MinReaderVersion == "" {
		proj.Manifest.MinReaderVersion = CurrentFormatVersion
	}
	if proj.Manifest.Generator == "" {
		proj.Manifest.Generator = "SVG Animator Studio v1.2.0"
	}
	if proj.Manifest.Scene == "" {
		proj.Manifest.Scene = SceneFileName
	}
	nowISO := time.Now().UTC().Format(time.RFC3339)
	if proj.Manifest.CreatedAt == "" {
		proj.Manifest.CreatedAt = nowISO
	}
	if proj.Manifest.SavedAt == "" {
		proj.Manifest.SavedAt = nowISO
	}
	if proj.Scene.SchemaVersion == "" {
		proj.Scene.SchemaVersion = CurrentFormatVersion
	}

	// 2. Synchronize and validate Asset inventory
	if proj.Assets == nil {
		proj.Assets = make(map[string][]byte)
	}

	// Rebuild manifest assets list deterministically from actual assets map
	assetKeys := make([]string, 0, len(proj.Assets))
	for k := range proj.Assets {
		assetKeys = append(assetKeys, k)
	}
	sort.Strings(assetKeys)

	// Map existing manifest asset metadata if present
	existingMeta := make(map[string]AssetEntry)
	for _, entry := range proj.Manifest.Assets {
		existingMeta[entry.Path] = entry
	}

	manifestAssets := make([]AssetEntry, 0, len(assetKeys))
	for _, p := range assetKeys {
		data := proj.Assets[p]
		cleanPath := path.Clean(p)
		if !strings.HasPrefix(cleanPath, AssetsDirPrefix) {
			cleanPath = AssetsDirPrefix + cleanPath
		}
		h := sha256.Sum256(data)
		hashStr := hex.EncodeToString(h[:])

		entry := existingMeta[p]
		if entry.Path == "" {
			entry = existingMeta[cleanPath]
		}
		entry.Path = cleanPath
		entry.Size = int64(len(data))
		entry.SHA256 = hashStr
		if entry.ID == "" {
			entry.ID = path.Base(cleanPath)
		}
		if entry.MIME == "" {
			entry.MIME = detectMIMEType(cleanPath, data)
		}
		manifestAssets = append(manifestAssets, entry)
	}
	proj.Manifest.Assets = manifestAssets

	// 3. Serialize Manifest and Scene JSON
	manifestJSON, err := json.MarshalIndent(proj.Manifest, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("sva: encoding manifest.json: %w", err)
	}

	sceneJSON, err := json.MarshalIndent(proj.Scene, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("sva: encoding scene.json: %w", err)
	}

	// 4. Construct ZIP archive
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	// Consistent modtime based on SavedAt
	modTime, err := time.Parse(time.RFC3339, proj.Manifest.SavedAt)
	if err != nil {
		modTime = time.Now().UTC()
	}

	// Write manifest.json
	mh := &zip.FileHeader{
		Name:     ManifestFileName,
		Method:   zip.Deflate,
		Modified: modTime,
	}
	mw, err := zw.CreateHeader(mh)
	if err != nil {
		return nil, fmt.Errorf("sva: creating manifest header: %w", err)
	}
	if _, err := mw.Write(manifestJSON); err != nil {
		return nil, fmt.Errorf("sva: writing manifest.json: %w", err)
	}

	// Write scene.json
	sh := &zip.FileHeader{
		Name:     SceneFileName,
		Method:   zip.Deflate,
		Modified: modTime,
	}
	sw, err := zw.CreateHeader(sh)
	if err != nil {
		return nil, fmt.Errorf("sva: creating scene header: %w", err)
	}
	if _, err := sw.Write(sceneJSON); err != nil {
		return nil, fmt.Errorf("sva: writing scene.json: %w", err)
	}

	// Write Assets in sorted order
	for _, p := range assetKeys {
		data := proj.Assets[p]
		cleanPath := path.Clean(p)
		if !strings.HasPrefix(cleanPath, AssetsDirPrefix) {
			cleanPath = AssetsDirPrefix + cleanPath
		}

		ah := &zip.FileHeader{
			Name:     cleanPath,
			Method:   zip.Deflate,
			Modified: modTime,
		}
		aw, err := zw.CreateHeader(ah)
		if err != nil {
			return nil, fmt.Errorf("sva: creating asset header for %s: %w", cleanPath, err)
		}
		if _, err := aw.Write(data); err != nil {
			return nil, fmt.Errorf("sva: writing asset %s: %w", cleanPath, err)
		}
	}

	if err := zw.Close(); err != nil {
		return nil, fmt.Errorf("sva: closing zip writer: %w", err)
	}

	return buf.Bytes(), nil
}

// BuildProjectFromStudioState extracts binary assets from legacy Studio state (base64 data URIs),
// packages them into SVA Project assets, and prepares a canonical Project.
func BuildProjectFromStudioState(projectName string, projectDesc string, schemaJson []byte) (*Project, error) {
	var raw struct {
		Version         string                 `json:"version"`
		Controls        map[string]any         `json:"controls"`
		LoadedPhoto     map[string]any         `json:"loadedPhoto"`
		Presets         map[string]any         `json:"presets"`
		AutoApplyPreset *bool                  `json:"autoApplyPreset"`
		Nodes           []scene.Node           `json:"nodes"`
		NodesCounter    int                    `json:"nodesCounter"`
		Flows           []scene.Flow           `json:"flows"`
		FlowsCounter    int                    `json:"flowsCounter"`
		Glows           []scene.Glow           `json:"glows"`
		GlowsCounter    int                    `json:"glowsCounter"`
		Ripples         []scene.Ripple         `json:"ripples"`
		RipplesCounter  int                    `json:"ripplesCounter"`
		Groups          []scene.Group          `json:"groups"`
		GroupsCounter   int                    `json:"groupsCounter"`
		Images          []scene.Image          `json:"images"`
		ImagesCounter   int                    `json:"imagesCounter"`
		Layers          []scene.LayerEntry     `json:"layers"`
		Metadata        map[string]any         `json:"metadata"`
	}

	if err := json.Unmarshal(schemaJson, &raw); err != nil {
		return nil, fmt.Errorf("sva: parsing studio schema JSON: %w", err)
	}

	assets := make(map[string][]byte)
	var photoInfo *PhotoAssetInfo

	// 1. Process Background Image (LoadedPhoto)
	if raw.LoadedPhoto != nil && len(raw.LoadedPhoto) > 0 {
		b64Val, _ := raw.LoadedPhoto["b64"].(string)
		if b64Val == "" {
			if s, ok := raw.LoadedPhoto["dataUrl"].(string); ok && s != "" {
				b64Val = s
			} else if s, ok := raw.LoadedPhoto["dataURL"].(string); ok && s != "" {
				b64Val = s
			} else if s, ok := raw.LoadedPhoto["src"].(string); ok && s != "" {
				b64Val = s
			} else if s, ok := raw.LoadedPhoto["data"].(string); ok && s != "" {
				b64Val = s
			}
		}
		mimeVal, _ := raw.LoadedPhoto["mime"].(string)
		filenameVal, _ := raw.LoadedPhoto["filename"].(string)
		w, _ := raw.LoadedPhoto["naturalWidth"].(float64)
		h, _ := raw.LoadedPhoto["naturalHeight"].(float64)

		if b64Val != "" || filenameVal != "" || mimeVal != "" || w > 0 || h > 0 {
			if filenameVal == "" {
				filenameVal = "background_photo"
			}
			if b64Val == "" {
				return nil, fmt.Errorf("sva: background photo %q has no image data to bundle", filenameVal)
			}
			data, cleanMime, err := decodeBase64DataURI(b64Val, mimeVal)
			if err != nil {
				return nil, fmt.Errorf("sva: decoding background photo %q: %w", filenameVal, err)
			}
			if len(data) == 0 {
				return nil, fmt.Errorf("sva: background photo %q decoded to 0 bytes", filenameVal)
			}

			ext := extensionForMIME(cleanMime)
			assetPath := AssetsDirPrefix + sanitizeFilename(filenameVal) + ext
			assets[assetPath] = data

			photoInfo = &PhotoAssetInfo{
				AssetID:       "asset-photo-bg",
				AssetPath:     assetPath,
				Filename:      filenameVal,
				MIME:          cleanMime,
				NaturalWidth:  int(w),
				NaturalHeight: int(h),
			}
		}
	}

	// 2. Process Custom Glow Graphics
	for i := range raw.Glows {
		g := &raw.Glows[i]
		if g.Shape == "custom" && g.CustomB64 != "" {
			data, cleanMime, err := decodeBase64DataURI(g.CustomB64, g.CustomMime)
			if err != nil {
				return nil, fmt.Errorf("sva: decoding custom glow graphic %s: %w", g.ID, err)
			}
			if len(data) == 0 {
				return nil, fmt.Errorf("sva: custom glow graphic %s decoded to 0 bytes", g.ID)
			}
			ext := extensionForMIME(cleanMime)
			assetPath := fmt.Sprintf("%sglow_%s_custom%s", AssetsDirPrefix, g.ID, ext)
			assets[assetPath] = data
			g.CustomMime = cleanMime
			// In SVA scene.json, customB64 is cleared and referenced via assetPath
			g.CustomB64 = ""
			if g.Metadata == nil {
				g.Metadata = make(map[string]any)
			}
			g.Metadata["assetPath"] = assetPath
		}
	}

	// 3. Process Custom Flow Graphics
	for i := range raw.Flows {
		f := &raw.Flows[i]
		if f.CustomB64 != "" {
			data, cleanMime, err := decodeBase64DataURI(f.CustomB64, f.CustomMime)
			if err != nil {
				return nil, fmt.Errorf("sva: decoding custom flow graphic %s: %w", f.ID, err)
			}
			if len(data) == 0 {
				return nil, fmt.Errorf("sva: custom flow graphic %s decoded to 0 bytes", f.ID)
			}
			ext := extensionForMIME(cleanMime)
			assetPath := fmt.Sprintf("%sflow_%s_custom%s", AssetsDirPrefix, f.ID, ext)
			assets[assetPath] = data
			f.CustomMime = cleanMime
			f.CustomB64 = ""
			if f.Metadata == nil {
				f.Metadata = make(map[string]any)
			}
			f.Metadata["assetPath"] = assetPath
		}
	}

	// 4. Process Independent Image Objects (raw.Images)
	for i := range raw.Images {
		img := &raw.Images[i]
		rawB64 := img.Src
		if rawB64 == "" {
			rawB64 = img.Data
		}
		if rawB64 != "" {
			data, cleanMime, err := decodeBase64DataURI(rawB64, img.Mime)
			if err == nil && len(data) > 0 {
				ext := extensionForMIME(cleanMime)
				assetPath := fmt.Sprintf("%simage_%s%s", AssetsDirPrefix, img.ID, ext)
				assets[assetPath] = data
				img.Mime = cleanMime
				img.AssetRef = assetPath
				img.Src = ""
				img.Data = ""
			}
		}
	}

	// 4. Construct SceneData
	if projectName == "" {
		projectName = "Untitled Project"
	}

	autoApply := true
	if raw.AutoApplyPreset != nil {
		autoApply = *raw.AutoApplyPreset
	}

	nowISO := time.Now().UTC().Format(time.RFC3339)

	groupsCounter := raw.GroupsCounter
	groups := raw.Groups
	if groups == nil {
		groups = []scene.Group{}
	}
	if groupsCounter == 0 && len(groups) > 0 {
		for _, g := range groups {
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

	proj := &Project{
		Manifest: Manifest{
			Format:           FormatSignature,
			Version:          CurrentFormatVersion,
			MinReaderVersion: CurrentFormatVersion,
			Name:             projectName,
			Description:      projectDesc,
			CreatedAt:        nowISO,
			SavedAt:          nowISO,
			Generator:        "SVG Animator Studio v1.2.0",
			Scene:            SceneFileName,
			Metadata:         raw.Metadata,
		},
		Scene: SceneData{
			SchemaVersion:   CurrentFormatVersion,
			Controls:        raw.Controls,
			Presets:         raw.Presets,
			AutoApplyPreset: autoApply,
			Photo:           photoInfo,
			Nodes:           raw.Nodes,
			NodesCounter:    raw.NodesCounter,
			Flows:           raw.Flows,
			FlowsCounter:    raw.FlowsCounter,
			Glows:           raw.Glows,
			GlowsCounter:    raw.GlowsCounter,
			Ripples:         raw.Ripples,
			RipplesCounter:  raw.RipplesCounter,
			Groups:          groups,
			GroupsCounter:   groupsCounter,
			Images:          raw.Images,
			ImagesCounter:   raw.ImagesCounter,
			Layers:          raw.Layers,
			Metadata:        raw.Metadata,
		},
		Assets: assets,
	}

	// Extract standard scene config from Controls if available
	extractSceneConfigsFromControls(&proj.Scene, raw.Controls)

	return proj, nil
}

func decodeBase64DataURI(b64Str string, fallbackMime string) ([]byte, string, error) {
	b64Str = strings.TrimSpace(b64Str)
	mime := fallbackMime
	if strings.HasPrefix(b64Str, "data:") {
		parts := strings.SplitN(b64Str, ",", 2)
		if len(parts) == 2 {
			meta := parts[0]
			b64Str = parts[1]
			semiIdx := strings.Index(meta, ";")
			if semiIdx > 5 {
				mime = meta[5:semiIdx]
			}
		}
	}

	// Strip all interior whitespace characters (\r, \n, space, tab) from base64 string
	var sb strings.Builder
	sb.Grow(len(b64Str))
	for _, r := range b64Str {
		if r != ' ' && r != '\t' && r != '\n' && r != '\r' {
			sb.WriteRune(r)
		}
	}
	cleanB64 := sb.String()

	data, err := base64.StdEncoding.DecodeString(cleanB64)
	if err != nil {
		// Fallback 1: RawStdEncoding (unpadded)
		data, err = base64.RawStdEncoding.DecodeString(cleanB64)
	}
	if err != nil {
		// Fallback 2: URLEncoding
		data, err = base64.URLEncoding.DecodeString(cleanB64)
	}
	if err != nil {
		// Fallback 3: RawURLEncoding
		data, err = base64.RawURLEncoding.DecodeString(cleanB64)
	}
	if err != nil {
		return nil, mime, err
	}
	if mime == "" {
		mime = detectMIMEType("image", data)
	}
	return data, mime, nil
}

func detectMIMEType(name string, data []byte) string {
	ext := strings.ToLower(path.Ext(name))
	switch ext {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	case ".gif":
		return "image/gif"
	}
	if len(data) >= 8 && bytes.Equal(data[:8], []byte("\x89PNG\r\n\x1a\n")) {
		return "image/png"
	}
	if len(data) >= 3 && bytes.Equal(data[:3], []byte("\xff\xd8\xff")) {
		return "image/jpeg"
	}
	if len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		return "image/webp"
	}
	if bytes.Contains(data[:min(len(data), 512)], []byte("<svg")) {
		return "image/svg+xml"
	}
	return "application/octet-stream"
}

func extensionForMIME(mime string) string {
	switch strings.ToLower(mime) {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "image/svg+xml":
		return ".svg"
	case "image/gif":
		return ".gif"
	default:
		return ".bin"
	}
}

func sanitizeFilename(s string) string {
	clean := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			return r
		}
		return '_'
	}, s)
	if clean == "" {
		return "asset"
	}
	return clean
}

func extractSceneConfigsFromControls(sceneData *SceneData, controls map[string]any) {
	if controls == nil {
		return
	}
	getFloat := func(key string, def float64) float64 {
		if v, ok := controls[key]; ok {
			switch n := v.(type) {
			case float64:
				return n
			case int:
				return float64(n)
			}
		}
		return def
	}
	getStr := func(key string, def string) string {
		if v, ok := controls[key]; ok {
			if s, ok := v.(string); ok && s != "" {
				return s
			}
		}
		return def
	}
	getBool := func(key string, def bool) bool {
		if v, ok := controls[key]; ok {
			if b, ok := v.(bool); ok {
				return b
			}
		}
		return def
	}

	sceneData.Canvas.Width = getFloat("canvasWidthInput", 1600)
	sceneData.Canvas.Height = getFloat("canvasHeightInput", 900)
	sceneData.Canvas.Duration = getFloat("exportDurationInput", 17)
	sceneData.Canvas.PlaybackMode = getStr("exportLoopSelect", "loop")
	sceneData.Canvas.Pattern = getStr("canvasPatternSelect", "blueprint")
	sceneData.Canvas.GridSize = getFloat("canvasGridSizeSlider", 25)
	sceneData.Canvas.BgColor = getStr("canvasBgColorPicker", "#070b12")
	sceneData.Canvas.BgTransparent = getBool("chkCanvasBgTransparent", false)

	sceneData.Camera.Motion = getStr("cameraMotionSelect", "ken-burns")
	sceneData.Camera.Duration = getFloat("camDurationSlider", 8)
	sceneData.Camera.Loop = getStr("camLoopSelect", "loop")
	sceneData.Camera.StartX = getFloat("startXSlider", 50)
	sceneData.Camera.StartY = getFloat("startYSlider", 50)
	sceneData.Camera.StartZoom = getFloat("startZoomSlider", 1.0)
	sceneData.Camera.EndX = getFloat("endXSlider", 50)
	sceneData.Camera.EndY = getFloat("endYSlider", 50)
	sceneData.Camera.EndZoom = getFloat("endZoomSlider", 1.25)
	sceneData.Camera.Sway = getFloat("swaySlider", 1.4)
	sceneData.Camera.Breathe = getFloat("breatheSlider", 1.8)
	sceneData.Camera.TiltX = getFloat("perspTiltXSlider", 0)
	sceneData.Camera.TiltY = getFloat("perspTiltYSlider", 0)

	sceneData.Optical.Type = getStr("effectSelect", "none")
	sceneData.Optical.StartBlur = getFloat("startBlurSlider", 0)
	sceneData.Optical.EndBlur = getFloat("endBlurSlider", 18)
	sceneData.Optical.FocusDur = getFloat("focusDurSlider", 6)
	sceneData.Optical.TSShape = getStr("tsShapeSelect", "horizontal")
	sceneData.Optical.TSPosX = getFloat("tsPosXSlider", 50)
	sceneData.Optical.TSPos = getFloat("tsPosSlider", 50)
	sceneData.Optical.TSWidth = getFloat("tsWidthSlider", 20)
	sceneData.Optical.TSBlur = getFloat("tsBlurSlider", 8)
	sceneData.Optical.MBInt = getFloat("mbIntSlider", 0)
	sceneData.Optical.MBAng = getFloat("mbAngSlider", 0)

	sceneData.Frame.Enabled = getBool("chkModuleFrame", false)
	sceneData.Frame.Style = getStr("frameStyleSelect", "none")
	sceneData.Frame.Depth = getFloat("frameDepthSlider", 48)
	sceneData.Frame.Lighting = getBool("chkFrameLighting", true)
	sceneData.Frame.LightDir = getStr("frameLightDirSelect", "tl")
	sceneData.Frame.LightInt = getFloat("frameLightIntSlider", 0.6)
	sceneData.Frame.Shadow = getFloat("frameShadowSlider", 0.55)
	sceneData.Frame.Fillet = getBool("chkFrameFillet", true)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
