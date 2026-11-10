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
	"io"
	"os"
	"path"
	"strconv"
	"strings"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/scene"
)

// Validate checks an SVA package's integrity, manifest, and safety constraints
// without fully loading all assets into memory.
func Validate(data []byte) (*Manifest, error) {
	if len(data) == 0 {
		return nil, ErrInvalidZip
	}

	readerAt := bytes.NewReader(data)
	zr, err := zip.NewReader(readerAt, int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidZip, err)
	}

	if len(zr.File) > MaxEntryCount {
		return nil, ErrTooManyEntries
	}

	var totalUncompressed int64
	var manifestFile *zip.File

	for _, f := range zr.File {
		cleanName := path.Clean(f.Name)
		if strings.HasPrefix(cleanName, "/") || strings.HasPrefix(cleanName, "\\") || strings.Contains(cleanName, "..") {
			return nil, ErrZipSlipAttempt
		}
		if f.Mode()&os.ModeSymlink != 0 {
			return nil, ErrSymlinkNotAllowed
		}

		uncompressed := int64(f.UncompressedSize64)
		if uncompressed > MaxSingleEntryBytes {
			return nil, ErrEntryTooLarge
		}
		totalUncompressed += uncompressed
		if totalUncompressed > MaxTotalUncompressedBytes {
			return nil, ErrArchiveTooLarge
		}

		if f.CompressedSize64 > 0 && uncompressed > 1024*1024 {
			ratio := float64(uncompressed) / float64(f.CompressedSize64)
			if ratio > MaxCompressionRatio {
				return nil, ErrZipBombAttempt
			}
		}

		if cleanName == ManifestFileName {
			manifestFile = f
		}
	}

	if manifestFile == nil {
		return nil, ErrMissingManifest
	}

	rc, err := manifestFile.Open()
	if err != nil {
		return nil, fmt.Errorf("sva: opening manifest.json: %w", err)
	}
	defer rc.Close()

	manifestBytes, err := io.ReadAll(io.LimitReader(rc, MaxManifestBytes+1))
	if err != nil {
		return nil, fmt.Errorf("sva: reading manifest.json: %w", err)
	}
	if int64(len(manifestBytes)) > MaxManifestBytes {
		return nil, ErrEntryTooLarge
	}

	var manifest Manifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		return nil, fmt.Errorf("sva: decoding manifest.json: %w", err)
	}

	if manifest.Format != FormatSignature {
		return nil, ErrInvalidSignature
	}

	if err := checkVersionCompatibility(manifest.MinReaderVersion); err != nil {
		return nil, err
	}

	return &manifest, nil
}

// Decode extracts, validates, and parses an SVA package into an in-memory Project.
func Decode(data []byte) (*Project, error) {
	manifest, err := Validate(data)
	if err != nil {
		return nil, err
	}

	readerAt := bytes.NewReader(data)
	zr, err := zip.NewReader(readerAt, int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidZip, err)
	}

	scenePath := manifest.Scene
	if scenePath == "" {
		scenePath = SceneFileName
	}
	scenePath = path.Clean(scenePath)

	var sceneFile *zip.File
	assetFiles := make(map[string]*zip.File)

	for _, f := range zr.File {
		cleanName := path.Clean(f.Name)
		if cleanName == scenePath {
			sceneFile = f
		} else if strings.HasPrefix(cleanName, AssetsDirPrefix) {
			assetFiles[cleanName] = f
		}
	}

	if sceneFile == nil {
		return nil, ErrMissingScene
	}

	// 1. Read and parse scene.json
	sc, err := sceneFile.Open()
	if err != nil {
		return nil, fmt.Errorf("sva: opening %s: %w", scenePath, err)
	}
	defer sc.Close()

	sceneBytes, err := io.ReadAll(io.LimitReader(sc, MaxSceneJSONBytes+1))
	if err != nil {
		return nil, fmt.Errorf("sva: reading %s: %w", scenePath, err)
	}
	if int64(len(sceneBytes)) > MaxSceneJSONBytes {
		return nil, ErrEntryTooLarge
	}

	var sceneData SceneData
	if err := json.Unmarshal(sceneBytes, &sceneData); err != nil {
		return nil, fmt.Errorf("sva: decoding %s: %w", scenePath, err)
	}

	// 2. Extract Assets
	assets := make(map[string][]byte)
	for p, f := range assetFiles {
		ac, err := f.Open()
		if err != nil {
			return nil, fmt.Errorf("sva: opening asset %s: %w", p, err)
		}
		assetBytes, err := io.ReadAll(io.LimitReader(ac, MaxSingleEntryBytes+1))
		ac.Close()
		if err != nil {
			return nil, fmt.Errorf("sva: reading asset %s: %w", p, err)
		}
		if int64(len(assetBytes)) > MaxSingleEntryBytes {
			return nil, ErrEntryTooLarge
		}
		assets[p] = assetBytes
	}

	// 3. Verify manifest assets exist in package
	for _, entry := range manifest.Assets {
		cleanEntryPath := path.Clean(entry.Path)
		assetBytes, ok := assets[cleanEntryPath]
		if !ok {
			// Check if path was stored without assets/ prefix
			assetBytes, ok = assets[AssetsDirPrefix+cleanEntryPath]
		}
		if !ok {
			return nil, fmt.Errorf("sva: manifest declares asset %s, but file is missing from archive", entry.Path)
		}
		if entry.SHA256 != "" {
			h := sha256.Sum256(assetBytes)
			hashStr := hex.EncodeToString(h[:])
			if !strings.EqualFold(hashStr, entry.SHA256) {
				return nil, fmt.Errorf("%w for asset %s", ErrAssetChecksumMismatch, entry.Path)
			}
		}
	}

	// 4. Verify referenced photo asset exists in package if present
	if sceneData.Photo != nil && sceneData.Photo.AssetPath != "" {
		cleanPhotoPath := path.Clean(sceneData.Photo.AssetPath)
		photoBytes, ok := assets[cleanPhotoPath]
		if !ok {
			photoBytes, ok = assets[AssetsDirPrefix+cleanPhotoPath]
		}
		if !ok || len(photoBytes) == 0 {
			return nil, fmt.Errorf("sva: scene references background photo %s, but asset is missing from archive", sceneData.Photo.AssetPath)
		}
	}

	return &Project{
		Manifest: *manifest,
		Scene:    sceneData,
		Assets:   assets,
	}, nil
}

// ExtractStudioState reconstructs a Schema 1.2.0 JSON payload from an SVA Project.
// It bundles binary assets back into base64 strings so the web editor and
// SQLite project persistence can restore them without architectural friction.
func ExtractStudioState(proj *Project) ([]byte, error) {
	if proj == nil {
		return nil, errors.New("sva: project is nil")
	}

	s := proj.Scene

	// 1. Resolve Background Photo
	var loadedPhoto map[string]any
	if s.Photo != nil && s.Photo.AssetPath != "" {
		assetBytes, ok := proj.Assets[path.Clean(s.Photo.AssetPath)]
		if !ok {
			assetBytes, ok = proj.Assets[AssetsDirPrefix+path.Clean(s.Photo.AssetPath)]
		}
		if !ok || len(assetBytes) == 0 {
			return nil, fmt.Errorf("sva: referenced background photo %q missing or empty in package", s.Photo.AssetPath)
		}
		mime := s.Photo.MIME
		if mime == "" {
			mime = detectMIMEType(s.Photo.AssetPath, assetBytes)
		}
		b64 := base64.StdEncoding.EncodeToString(assetBytes)

		loadedPhoto = map[string]any{
			"filename":      s.Photo.Filename,
			"mime":          mime,
			"b64":           b64, // Raw base64 string matching Studio state convention
			"naturalWidth":  s.Photo.NaturalWidth,
			"naturalHeight": s.Photo.NaturalHeight,
		}
	}

	// 2. Resolve Custom Glow Graphics
	resolvedGlows := make([]scene.Glow, len(s.Glows))
	copy(resolvedGlows, s.Glows)
	for i := range resolvedGlows {
		g := &resolvedGlows[i]
		if g.Shape == "custom" && g.CustomB64 == "" && g.Metadata != nil {
			if assetPathStr, ok := g.Metadata["assetPath"].(string); ok && assetPathStr != "" {
				assetBytes, ok := proj.Assets[path.Clean(assetPathStr)]
				if !ok {
					assetBytes, ok = proj.Assets[AssetsDirPrefix+path.Clean(assetPathStr)]
				}
				if ok && len(assetBytes) > 0 {
					mime := g.CustomMime
					if mime == "" {
						mime = detectMIMEType(assetPathStr, assetBytes)
					}
					g.CustomB64 = base64.StdEncoding.EncodeToString(assetBytes)
					g.CustomMime = mime
				}
			}
		}
	}

	// 3. Resolve Custom Flow Graphics
	resolvedFlows := make([]scene.Flow, len(s.Flows))
	copy(resolvedFlows, s.Flows)
	for i := range resolvedFlows {
		f := &resolvedFlows[i]
		if f.CustomB64 == "" && f.Metadata != nil {
			if assetPathStr, ok := f.Metadata["assetPath"].(string); ok && assetPathStr != "" {
				assetBytes, ok := proj.Assets[path.Clean(assetPathStr)]
				if !ok {
					assetBytes, ok = proj.Assets[AssetsDirPrefix+path.Clean(assetPathStr)]
				}
				if ok && len(assetBytes) > 0 {
					mime := f.CustomMime
					if mime == "" {
						mime = detectMIMEType(assetPathStr, assetBytes)
					}
					f.CustomB64 = base64.StdEncoding.EncodeToString(assetBytes)
					f.CustomMime = mime
				}
			}
		}
	}

	controls := make(map[string]any)
	if s.Controls != nil {
		for k, v := range s.Controls {
			controls[k] = v
		}
	}
	if loadedPhoto != nil {
		controls["canvasPatternSelect"] = "photo"
		if _, ok := controls["photoFitSelect"]; !ok {
			controls["photoFitSelect"] = "match"
		}
	}

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

	resolvedGroups := s.Groups
	if resolvedGroups == nil {
		resolvedGroups = []scene.Group{}
	}

	payload := map[string]any{
		"version":         "1.2.0",
		"controls":        controls,
		"loadedPhoto":     loadedPhoto,
		"presets":         s.Presets,
		"autoApplyPreset": s.AutoApplyPreset,
		"nodes":           s.Nodes,
		"nodesCounter":    s.NodesCounter,
		"flows":           resolvedFlows,
		"flowsCounter":    s.FlowsCounter,
		"glows":           resolvedGlows,
		"glowsCounter":    s.GlowsCounter,
		"ripples":         s.Ripples,
		"ripplesCounter":  s.RipplesCounter,
		"groups":          resolvedGroups,
		"groupsCounter":   groupsCounter,
		"metadata":        s.Metadata,
	}

	return json.Marshal(payload)
}

func checkVersionCompatibility(minReaderVer string) error {
	if minReaderVer == "" {
		return nil
	}
	parts := strings.Split(minReaderVer, ".")
	if len(parts) == 0 {
		return nil
	}
	major, err := strconv.Atoi(parts[0])
	if err != nil {
		return nil
	}
	// Current reader supports major version 1
	if major > 1 {
		return fmt.Errorf("%w: package requires reader version %s (current version %s)", ErrUnsupportedVersion, minReaderVer, CurrentFormatVersion)
	}
	return nil
}
