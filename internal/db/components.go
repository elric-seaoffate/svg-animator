package db

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// ComponentSummary holds browse/list metadata for a saved reusable Component Definition.
type ComponentSummary struct {
	ComponentID   string   `json:"componentId"`
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	Category      string   `json:"category"`
	Tags          []string `json:"tags"`
	LatestVersion string   `json:"latestVersion"`
	ThumbnailSVG  string   `json:"thumbnailSvg,omitempty"`
	ContentSHA256 string   `json:"contentSha256"`
	CreatedAt     string   `json:"createdAt"`
	UpdatedAt     string   `json:"updatedAt"`
}

// ComponentRecord holds the full persisted Component Definition including its JSON payload.
type ComponentRecord struct {
	ComponentSummary
	DefinitionJSON string `json:"definitionJson"`
	Changelog      string `json:"changelog,omitempty"`
}

// ComponentRevisionSummary describes a preserved immutable revision of a Component Definition.
type ComponentRevisionSummary struct {
	ComponentID   string `json:"componentId"`
	Version       string `json:"version"`
	Changelog     string `json:"changelog"`
	ContentSHA256 string `json:"contentSha256"`
	CreatedAt     string `json:"createdAt"`
}

// ComponentUsageReport lists parent components and projects referencing a ComponentID.
type ComponentUsageReport struct {
	ComponentID      string   `json:"componentId"`
	InUse            bool     `json:"inUse"`
	ParentComponents []string `json:"parentComponents"`
	Projects         []string `json:"projects"`
}

func computeSHA256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

// ListComponents returns all saved reusable components matching optional search query, category, and tag filters.
func ListComponents(query, category, tag string) ([]ComponentSummary, error) {
	mu.RLock()
	defer mu.RUnlock()

	if conn == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	rows, err := conn.Query(`
		SELECT component_id, name, description, category, tags_json, latest_version, thumbnail_svg, content_sha256, created_at, updated_at
		FROM components
		ORDER BY updated_at DESC, name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	qLow := strings.ToLower(strings.TrimSpace(query))
	catLow := strings.ToLower(strings.TrimSpace(category))
	tagLow := strings.ToLower(strings.TrimSpace(tag))

	list := make([]ComponentSummary, 0)
	for rows.Next() {
		var c ComponentSummary
		var tagsJSON string
		if err := rows.Scan(&c.ComponentID, &c.Name, &c.Description, &c.Category, &tagsJSON, &c.LatestVersion, &c.ThumbnailSVG, &c.ContentSHA256, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		var tags []string
		_ = json.Unmarshal([]byte(tagsJSON), &tags)
		if tags == nil {
			tags = []string{}
		}
		c.Tags = tags

		if catLow != "" && catLow != "all" && strings.ToLower(c.Category) != catLow {
			continue
		}
		if tagLow != "" {
			hasTag := false
			for _, t := range c.Tags {
				if strings.ToLower(t) == tagLow {
					hasTag = true
					break
				}
			}
			if !hasTag {
				continue
			}
		}
		if qLow != "" {
			hay := strings.ToLower(c.Name + " " + c.Description + " " + c.Category + " " + strings.Join(c.Tags, " "))
			if !strings.Contains(hay, qLow) {
				continue
			}
		}
		list = append(list, c)
	}
	return list, rows.Err()
}

// GetComponent retrieves a full component record (latest version by default, or a specific preserved revision if version != "").
func GetComponent(componentID, version string) (*ComponentRecord, error) {
	mu.RLock()
	defer mu.RUnlock()

	if conn == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var rec ComponentRecord
	var tagsJSON string
	err := conn.QueryRow(`
		SELECT component_id, name, description, category, tags_json, latest_version, thumbnail_svg, definition_json, content_sha256, created_at, updated_at
		FROM components
		WHERE component_id = ?
	`, componentID).Scan(
		&rec.ComponentID, &rec.Name, &rec.Description, &rec.Category, &tagsJSON,
		&rec.LatestVersion, &rec.ThumbnailSVG, &rec.DefinitionJSON, &rec.ContentSHA256,
		&rec.CreatedAt, &rec.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(tagsJSON), &rec.Tags)
	if rec.Tags == nil {
		rec.Tags = []string{}
	}

	reqVer := strings.TrimSpace(version)
	if reqVer != "" && reqVer != rec.LatestVersion {
		var revDef, revLog, revHash, revAt string
		err := conn.QueryRow(`
			SELECT definition_json, changelog, content_sha256, created_at
			FROM component_revisions
			WHERE component_id = ? AND version = ?
		`, componentID, reqVer).Scan(&revDef, &revLog, &revHash, &revAt)
		if err != nil {
			return nil, fmt.Errorf("component %s version %s not found: %w", componentID, reqVer, err)
		}
		rec.LatestVersion = reqVer
		rec.DefinitionJSON = revDef
		rec.Changelog = revLog
		rec.ContentSHA256 = revHash
		rec.UpdatedAt = revAt
	}

	return &rec, nil
}

// SaveComponent inserts or updates a component in the global library and records an immutable snapshot in component_revisions.
func SaveComponent(rec ComponentRecord) (*ComponentSummary, error) {
	mu.Lock()
	defer mu.Unlock()

	if conn == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	cid := strings.TrimSpace(rec.ComponentID)
	if cid == "" {
		return nil, fmt.Errorf("componentId is required")
	}
	name := strings.TrimSpace(rec.Name)
	if name == "" {
		return nil, fmt.Errorf("component name is required")
	}
	if !json.Valid([]byte(rec.DefinitionJSON)) {
		return nil, fmt.Errorf("invalid json in definitionJson")
	}
	ver := strings.TrimSpace(rec.LatestVersion)
	if ver == "" {
		ver = "1.0.0"
	}
	cat := strings.TrimSpace(rec.Category)
	if cat == "" {
		cat = "general"
	}
	if rec.Tags == nil {
		rec.Tags = []string{}
	}
	tagsBytes, _ := json.Marshal(rec.Tags)
	hash := strings.TrimSpace(rec.ContentSHA256)
	if hash == "" {
		hash = computeSHA256Hex(rec.DefinitionJSON)
	}

	nowStr := time.Now().UTC().Format(time.RFC3339)
	var existingCreatedAt string
	_ = conn.QueryRow(`SELECT created_at FROM components WHERE component_id = ?`, cid).Scan(&existingCreatedAt)
	if existingCreatedAt == "" {
		existingCreatedAt = nowStr
	}

	tx, err := conn.Begin()
	if err != nil {
		return nil, err
	}
	defer func() {
		if tx != nil {
			_ = tx.Rollback()
		}
	}()

	_, err = tx.Exec(`
		INSERT INTO components (component_id, name, description, category, tags_json, latest_version, thumbnail_svg, definition_json, content_sha256, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(component_id) DO UPDATE SET
			name = excluded.name,
			description = excluded.description,
			category = excluded.category,
			tags_json = excluded.tags_json,
			latest_version = excluded.latest_version,
			thumbnail_svg = excluded.thumbnail_svg,
			definition_json = excluded.definition_json,
			content_sha256 = excluded.content_sha256,
			updated_at = excluded.updated_at
	`, cid, name, rec.Description, cat, string(tagsBytes), ver, rec.ThumbnailSVG, rec.DefinitionJSON, hash, existingCreatedAt, nowStr)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(`
		INSERT INTO component_revisions (component_id, version, definition_json, changelog, content_sha256, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(component_id, version) DO UPDATE SET
			definition_json = excluded.definition_json,
			changelog = excluded.changelog,
			content_sha256 = excluded.content_sha256,
			created_at = excluded.created_at
	`, cid, ver, rec.DefinitionJSON, rec.Changelog, hash, nowStr)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil

	return &ComponentSummary{
		ComponentID:   cid,
		Name:          name,
		Description:   rec.Description,
		Category:      cat,
		Tags:          rec.Tags,
		LatestVersion: ver,
		ThumbnailSVG:  rec.ThumbnailSVG,
		ContentSHA256: hash,
		CreatedAt:     existingCreatedAt,
		UpdatedAt:     nowStr,
	}, nil
}

// ListComponentRevisions returns all preserved revisions for a component ordered newest-first.
func ListComponentRevisions(componentID string) ([]ComponentRevisionSummary, error) {
	mu.RLock()
	defer mu.RUnlock()

	if conn == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	rows, err := conn.Query(`
		SELECT component_id, version, changelog, content_sha256, created_at
		FROM component_revisions
		WHERE component_id = ?
		ORDER BY created_at DESC, version DESC
	`, componentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]ComponentRevisionSummary, 0)
	for rows.Next() {
		var r ComponentRevisionSummary
		if err := rows.Scan(&r.ComponentID, &r.Version, &r.Changelog, &r.ContentSHA256, &r.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, r)
	}
	return list, rows.Err()
}

// GetComponentUsage checks whether a component is referenced by any other saved component or saved project.
func GetComponentUsage(componentID string) (*ComponentUsageReport, error) {
	mu.RLock()
	defer mu.RUnlock()

	if conn == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	return getComponentUsageLocked(componentID)
}

func getComponentUsageLocked(componentID string) (*ComponentUsageReport, error) {
	rep := &ComponentUsageReport{
		ComponentID:      componentID,
		ParentComponents: []string{},
		Projects:         []string{},
	}
	needle := `"` + componentID + `"`

	// 1. Check parent components referencing componentID in their definition_json
	rows, err := conn.Query(`
		SELECT component_id, name, definition_json
		FROM components
		WHERE component_id != ?
	`, componentID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var otherID, otherName, defJSON string
		if err := rows.Scan(&otherID, &otherName, &defJSON); err != nil {
			rows.Close()
			return nil, err
		}
		if strings.Contains(defJSON, needle) {
			rep.ParentComponents = append(rep.ParentComponents, fmt.Sprintf("%s (%s)", otherName, otherID))
		}
	}
	rows.Close()

	// 2. Check saved projects referencing componentID in schema_json
	pRows, err := conn.Query(`SELECT id, name, schema_json FROM projects`)
	if err != nil {
		return nil, err
	}
	for pRows.Next() {
		var pid int64
		var pName, schemaJSON string
		if err := pRows.Scan(&pid, &pName, &schemaJSON); err != nil {
			pRows.Close()
			return nil, err
		}
		if strings.Contains(schemaJSON, needle) {
			rep.Projects = append(rep.Projects, fmt.Sprintf("%s (#%d)", pName, pid))
		}
	}
	pRows.Close()

	rep.InUse = len(rep.ParentComponents) > 0 || len(rep.Projects) > 0
	return rep, nil
}

// DeleteComponent deletes a component from the library, refusing if it is still in use unless force is true.
func DeleteComponent(componentID string, force bool) (*ComponentUsageReport, error) {
	mu.Lock()
	defer mu.Unlock()

	if conn == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	usage, err := getComponentUsageLocked(componentID)
	if err != nil {
		return nil, err
	}
	if usage.InUse && !force {
		return usage, fmt.Errorf("component %q is currently in use by %d parent component(s) and %d project(s)", componentID, len(usage.ParentComponents), len(usage.Projects))
	}

	_, err = conn.Exec(`DELETE FROM component_revisions WHERE component_id = ?`, componentID)
	if err != nil {
		return usage, err
	}
	_, err = conn.Exec(`DELETE FROM components WHERE component_id = ?`, componentID)
	return usage, err
}
