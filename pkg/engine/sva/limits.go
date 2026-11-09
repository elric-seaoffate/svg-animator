package sva

import "errors"

// Resource safety limits for SVA package processing.
// These protect against zip slip, zip bombs, unbounded memory consumption,
// and corrupted or malicious archive payloads.
const (
	// MaxTotalUncompressedBytes is the maximum allowed aggregate size of all uncompressed files in an SVA archive (256 MiB).
	MaxTotalUncompressedBytes int64 = 256 * 1024 * 1024

	// MaxSingleEntryBytes is the maximum size allowed for any single uncompressed entry (100 MiB).
	MaxSingleEntryBytes int64 = 100 * 1024 * 1024

	// MaxManifestBytes is the maximum allowed size of manifest.json (2 MiB).
	MaxManifestBytes int64 = 2 * 1024 * 1024

	// MaxSceneJSONBytes is the maximum allowed size of scene.json (20 MiB).
	MaxSceneJSONBytes int64 = 20 * 1024 * 1024

	// MaxEntryCount is the maximum number of file entries permitted inside the archive.
	MaxEntryCount = 1000

	// MaxCompressionRatio is the maximum ratio of uncompressed size to compressed size allowed for entries > 1 MiB.
	MaxCompressionRatio float64 = 100.0

	// CurrentFormatVersion is the authoritative SVA package format specification version.
	CurrentFormatVersion = "1.0.0"

	// FormatSignature is the required format identifier in manifest.json.
	FormatSignature = "sva"

	// ManifestFileName is the root manifest filename in the package.
	ManifestFileName = "manifest.json"

	// SceneFileName is the default scene description filename.
	SceneFileName = "scene.json"

	// AssetsDirPrefix is the directory prefix where packaged binary assets reside.
	AssetsDirPrefix = "assets/"
)

var (
	ErrInvalidZip          = errors.New("sva: file is not a valid zip archive")
	ErrMissingManifest     = errors.New("sva: archive is missing manifest.json")
	ErrMissingScene        = errors.New("sva: archive is missing scene.json")
	ErrInvalidSignature    = errors.New("sva: invalid format signature (must be 'sva')")
	ErrUnsupportedVersion  = errors.New("sva: unsupported format version")
	ErrZipSlipAttempt      = errors.New("sva: zip slip path traversal attempt detected")
	ErrZipBombAttempt      = errors.New("sva: compression ratio exceeds safety threshold (potential zip bomb)")
	ErrArchiveTooLarge     = errors.New("sva: total uncompressed archive size exceeds maximum safety limit")
	ErrEntryTooLarge       = errors.New("sva: archive entry exceeds maximum allowable size")
	ErrTooManyEntries      = errors.New("sva: archive contains more entries than permitted")
	ErrInvalidEntryPath    = errors.New("sva: entry path contains illegal characters or points outside root")
	ErrSymlinkNotAllowed   = errors.New("sva: symlink archive entries are forbidden")
	ErrMissingAsset        = errors.New("sva: referenced asset is missing from package")
	ErrAssetChecksumMismatch = errors.New("sva: asset checksum does not match manifest")
)
