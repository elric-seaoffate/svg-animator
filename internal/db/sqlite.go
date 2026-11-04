package db

import (
	"database/sql"
	"fmt"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type ProjectSummary struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	CanvasWidth  int    `json:"canvasWidth"`
	CanvasHeight int    `json:"canvasHeight"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

type ProjectRecord struct {
	ProjectSummary
	SchemaJSON string `json:"schemaJson"`
}

var (
	conn *sql.DB
	mu   sync.RWMutex
)

// InitDB opens or creates the local SQLite database file and initializes the schema.
func InitDB(dbPath string) error {
	mu.Lock()
	defer mu.Unlock()

	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)", dbPath)
	database, err := sql.Open("sqlite", dsn)
	if err != nil {
		return fmt.Errorf("opening sqlite db: %w", err)
	}

	database.SetMaxOpenConns(1)
	database.SetMaxIdleConns(1)

	if err := database.Ping(); err != nil {
		return fmt.Errorf("pinging sqlite db: %w", err)
	}

	schemaSQL := `
	CREATE TABLE IF NOT EXISTS projects (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		canvas_width INTEGER NOT NULL DEFAULT 1280,
		canvas_height INTEGER NOT NULL DEFAULT 720,
		schema_json TEXT NOT NULL,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);

	CREATE TABLE IF NOT EXISTS assets (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		category TEXT NOT NULL DEFAULT 'general',
		mime_type TEXT NOT NULL,
		width INTEGER NOT NULL DEFAULT 0,
		height INTEGER NOT NULL DEFAULT 0,
		data_b64 TEXT NOT NULL,
		created_at TEXT NOT NULL
	);
	`

	if _, err := database.Exec(schemaSQL); err != nil {
		return fmt.Errorf("initializing sqlite schema: %w", err)
	}

	conn = database
	return nil
}

// ListProjects returns metadata for all saved projects ordered by most recently updated.
func ListProjects() ([]ProjectSummary, error) {
	mu.RLock()
	defer mu.RUnlock()

	if conn == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	rows, err := conn.Query(`
		SELECT id, name, description, canvas_width, canvas_height, created_at, updated_at
		FROM projects
		ORDER BY updated_at DESC, id DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []ProjectSummary
	for rows.Next() {
		var p ProjectSummary
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.CanvasWidth, &p.CanvasHeight, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	if list == nil {
		list = []ProjectSummary{}
	}
	return list, rows.Err()
}

// GetProject retrieves a full project record including its serialized JSON state.
func GetProject(id int64) (*ProjectRecord, error) {
	mu.RLock()
	defer mu.RUnlock()

	if conn == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var p ProjectRecord
	err := conn.QueryRow(`
		SELECT id, name, description, canvas_width, canvas_height, schema_json, created_at, updated_at
		FROM projects
		WHERE id = ?
	`, id).Scan(&p.ID, &p.Name, &p.Description, &p.CanvasWidth, &p.CanvasHeight, &p.SchemaJSON, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// SaveProject inserts a new project (if id <= 0) or updates an existing project (if id > 0).
func SaveProject(p ProjectRecord) (*ProjectSummary, error) {
	mu.Lock()
	defer mu.Unlock()

	if conn == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	nowStr := time.Now().Format("2006-01-02 15:04:05")
	if p.CanvasWidth <= 0 {
		p.CanvasWidth = 1280
	}
	if p.CanvasHeight <= 0 {
		p.CanvasHeight = 720
	}

	if p.ID > 0 {
		res, err := conn.Exec(`
			UPDATE projects
			SET name = ?, description = ?, canvas_width = ?, canvas_height = ?, schema_json = ?, updated_at = ?
			WHERE id = ?
		`, p.Name, p.Description, p.CanvasWidth, p.CanvasHeight, p.SchemaJSON, nowStr, p.ID)
		if err != nil {
			return nil, err
		}
		affected, _ := res.RowsAffected()
		if affected > 0 {
			return &ProjectSummary{
				ID:           p.ID,
				Name:         p.Name,
				Description:  p.Description,
				CanvasWidth:  p.CanvasWidth,
				CanvasHeight: p.CanvasHeight,
				UpdatedAt:    nowStr,
			}, nil
		}
	}

	res, err := conn.Exec(`
		INSERT INTO projects (name, description, canvas_width, canvas_height, schema_json, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, p.Name, p.Description, p.CanvasWidth, p.CanvasHeight, p.SchemaJSON, nowStr, nowStr)
	if err != nil {
		return nil, err
	}

	newID, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &ProjectSummary{
		ID:           newID,
		Name:         p.Name,
		Description:  p.Description,
		CanvasWidth:  p.CanvasWidth,
		CanvasHeight: p.CanvasHeight,
		CreatedAt:    nowStr,
		UpdatedAt:    nowStr,
	}, nil
}

// DeleteProject removes a project by ID.
func DeleteProject(id int64) error {
	mu.Lock()
	defer mu.Unlock()

	if conn == nil {
		return fmt.Errorf("database not initialized")
	}

	_, err := conn.Exec(`DELETE FROM projects WHERE id = ?`, id)
	return err
}