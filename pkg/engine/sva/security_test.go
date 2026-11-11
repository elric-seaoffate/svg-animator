package sva

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestSVACumulativeDecompressionLimit(t *testing.T) {
	// Create an archive containing multiple entries whose sum of sizes would exceed MaxTotalUncompressedBytes (256MB)
	// We craft an archive where header claims legitimate small sizes or where multiple entries cumulatively exceed limit
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	nowISO := time.Now().UTC().Format(time.RFC3339)
	manifest := Manifest{
		Format:           FormatSignature,
		Version:          CurrentFormatVersion,
		MinReaderVersion: CurrentFormatVersion,
		Name:             "Oversized Test",
		CreatedAt:        nowISO,
		SavedAt:          nowISO,
		Generator:        "Test",
		Scene:            SceneFileName,
	}

	// Add 9 assets of 30MB each => total 270MB (> 256MB MaxTotalUncompressedBytes)
	// Use patterned bytes so compression ratio stays under MaxCompressionRatio (100:1)
	chunk30MB := make([]byte, 30*1024*1024)
	for j := range chunk30MB {
		chunk30MB[j] = byte((j * 31) % 251)
	}
	h := sha256.Sum256(chunk30MB)
	chunkHash := hex.EncodeToString(h[:])

	for i := 1; i <= 9; i++ {
		assetPath := "assets/large_asset_" + string(rune('0'+i)) + ".bin"
		manifest.Assets = append(manifest.Assets, AssetEntry{
			ID:     "asset-" + string(rune('0'+i)),
			Path:   assetPath,
			MIME:   "application/octet-stream",
			Size:   int64(len(chunk30MB)),
			SHA256: chunkHash,
		})
	}

	manifestBytes, _ := json.Marshal(manifest)
	mw, _ := zw.Create(ManifestFileName)
	mw.Write(manifestBytes)

	sceneData := SceneData{
		SchemaVersion: CurrentFormatVersion,
	}
	sceneBytes, _ := json.Marshal(sceneData)
	sw, _ := zw.Create(SceneFileName)
	sw.Write(sceneBytes)

	for _, entry := range manifest.Assets {
		aw, _ := zw.Create(entry.Path)
		aw.Write(chunk30MB)
	}

	zw.Close()
	archiveBytes := buf.Bytes()

	// Decoding must reject with ErrArchiveTooLarge or ErrZipBombAttempt without OOM
	_, err := Decode(archiveBytes)
	if err == nil {
		t.Fatal("expected Decode to reject archive exceeding cumulative 256MB limit, but succeeded")
	}
	if !errors.Is(err, ErrArchiveTooLarge) && !errors.Is(err, ErrZipBombAttempt) && !strings.Contains(err.Error(), "archive exceeds maximum total decompressed size") && !strings.Contains(err.Error(), "compression ratio exceeds") {
		t.Fatalf("expected ErrArchiveTooLarge or ErrZipBombAttempt, got: %v", err)
	}
}

func TestSVAMandatorySHA256(t *testing.T) {
	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	nowISO := time.Now().UTC().Format(time.RFC3339)
	manifest := Manifest{
		Format:           FormatSignature,
		Version:          CurrentFormatVersion,
		MinReaderVersion: CurrentFormatVersion,
		Name:             "Missing Hash Test",
		CreatedAt:        nowISO,
		SavedAt:          nowISO,
		Generator:        "Test",
		Scene:            SceneFileName,
		Assets: []AssetEntry{
			{
				ID:     "asset-1",
				Path:   "assets/test.png",
				MIME:   "image/png",
				Size:   4,
				SHA256: "", // Empty hash must be rejected
			},
		},
	}

	manifestBytes, _ := json.Marshal(manifest)
	mw, _ := zw.Create(ManifestFileName)
	mw.Write(manifestBytes)

	sceneData := SceneData{
		SchemaVersion: CurrentFormatVersion,
	}
	sceneBytes, _ := json.Marshal(sceneData)
	sw, _ := zw.Create(SceneFileName)
	sw.Write(sceneBytes)

	aw, _ := zw.Create("assets/test.png")
	aw.Write([]byte("PNG\x00"))

	zw.Close()

	_, err := Decode(buf.Bytes())
	if err == nil {
		t.Fatal("expected Decode to reject asset without SHA-256 hash, but succeeded")
	}
	if !strings.Contains(err.Error(), "required SHA-256 checksum") {
		t.Fatalf("expected error mentioning required SHA-256 checksum, got: %v", err)
	}
}

func TestSVAAssetPathSanitization(t *testing.T) {
	// Verify that BuildProjectFromStudioState sanitizes object IDs with path traversal attempts
	traversalSchema := `{
		"version": "1.2.0",
		"glows": [
			{
				"id": "../../etc/shadow",
				"shape": "custom",
				"customB64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGP6zwAAAgcBApocMXEAAAAASUVORK5CYII=",
				"customMime": "image/png"
			}
		],
		"images": [
			{
				"id": "../../../root/secret",
				"data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGP6zwAAAgcBApocMXEAAAAASUVORK5CYII=",
				"mime": "image/png"
			}
		]
	}`

	proj, err := BuildProjectFromStudioState("Sanitize Test", "", []byte(traversalSchema))
	if err != nil {
		t.Fatalf("BuildProjectFromStudioState failed: %v", err)
	}

	for assetPath := range proj.Assets {
		if strings.Contains(assetPath, "..") {
			t.Fatalf("asset path %q contains unsanitized path traversal sequence '..'", assetPath)
		}
		if !strings.HasPrefix(assetPath, AssetsDirPrefix) {
			t.Fatalf("asset path %q does not have required prefix %q", assetPath, AssetsDirPrefix)
		}
	}
}
