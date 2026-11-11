package scene

import (
	"encoding/json"
	"errors"
	"sync"
	"time"
)

// HistoryEntry stores a snapshot of scene state and selection for undo/redo.
type HistoryEntry struct {
	Snapshot  Snapshot       `json:"snapshot"`
	Selection SelectionState `json:"selection"`
	Timestamp int64          `json:"timestamp"`
}

// HistoryManager manages an undo/redo stack up to maxDepth.
type HistoryManager struct {
	mu        sync.RWMutex
	undoStack []HistoryEntry
	redoStack []HistoryEntry
	maxDepth  int
}

// NewHistoryManager creates a new history manager with maxDepth limit.
func NewHistoryManager(maxDepth int) *HistoryManager {
	if maxDepth <= 0 {
		maxDepth = 50
	}
	return &HistoryManager{
		undoStack: make([]HistoryEntry, 0, maxDepth),
		redoStack: make([]HistoryEntry, 0, maxDepth),
		maxDepth:  maxDepth,
	}
}

// Record pushes a new snapshot and selection onto the undo stack.
// If identical to the current top snapshot, it is discarded to prevent duplicate entries.
func (h *HistoryManager) Record(snap Snapshot, sel SelectionState) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	normSnap := DeepCopySnapshot(snap)
	normSel := DeepCopySelection(sel)

	// Check if identical to top
	if len(h.undoStack) > 0 {
		top := h.undoStack[len(h.undoStack)-1]
		if top.Snapshot.Revision == normSnap.Revision &&
			len(top.Snapshot.Nodes) == len(normSnap.Nodes) &&
			len(top.Snapshot.Flows) == len(normSnap.Flows) &&
			len(top.Snapshot.Glows) == len(normSnap.Glows) &&
			len(top.Snapshot.Ripples) == len(normSnap.Ripples) &&
			len(top.Snapshot.Groups) == len(normSnap.Groups) &&
			len(top.Snapshot.Images) == len(normSnap.Images) &&
			len(top.Snapshot.Layers) == len(normSnap.Layers) &&
			top.Selection.Equal(normSel) {
			topB, _ := json.Marshal(top.Snapshot)
			curB, _ := json.Marshal(normSnap)
			if string(topB) == string(curB) {
				return false
			}
		}
	}

	entry := HistoryEntry{
		Snapshot:  normSnap,
		Selection: normSel,
		Timestamp: time.Now().UnixMilli(),
	}

	h.undoStack = append(h.undoStack, entry)
	if len(h.undoStack) > h.maxDepth {
		h.undoStack = h.undoStack[len(h.undoStack)-h.maxDepth:]
	}
	h.redoStack = nil // Invalidate redo on new edit
	return true
}

// Undo restores the previous snapshot from undoStack and moves current to redoStack.
func (h *HistoryManager) Undo(currentSnap Snapshot, currentSel SelectionState) (HistoryEntry, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if len(h.undoStack) <= 1 {
		return HistoryEntry{}, errors.New("cannot undo: stack has 1 or fewer entries")
	}

	current := h.undoStack[len(h.undoStack)-1]
	if currentSnap.Revision > current.Snapshot.Revision {
		current = HistoryEntry{
			Snapshot:  DeepCopySnapshot(currentSnap),
			Selection: DeepCopySelection(currentSel),
			Timestamp: time.Now().UnixMilli(),
		}
	}
	h.undoStack = h.undoStack[:len(h.undoStack)-1]
	h.redoStack = append(h.redoStack, current)

	restored := h.undoStack[len(h.undoStack)-1]
	return HistoryEntry{
		Snapshot:  DeepCopySnapshot(restored.Snapshot),
		Selection: DeepCopySelection(restored.Selection),
		Timestamp: restored.Timestamp,
	}, nil
}

// Redo pops from redoStack, pushes onto undoStack, and returns the restored entry.
func (h *HistoryManager) Redo() (HistoryEntry, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if len(h.redoStack) == 0 {
		return HistoryEntry{}, errors.New("cannot redo: redo stack is empty")
	}

	next := h.redoStack[len(h.redoStack)-1]
	h.redoStack = h.redoStack[:len(h.redoStack)-1]
	h.undoStack = append(h.undoStack, next)

	return HistoryEntry{
		Snapshot:  DeepCopySnapshot(next.Snapshot),
		Selection: DeepCopySelection(next.Selection),
		Timestamp: next.Timestamp,
	}, nil
}

// CanUndo returns true if there is an earlier state to restore.
func (h *HistoryManager) CanUndo() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.undoStack) > 1
}

// CanRedo returns true if there is an undone state to restore.
func (h *HistoryManager) CanRedo() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.redoStack) > 0
}

// GetState returns current stack counts and capability flags.
func (h *HistoryManager) GetState() (undoCount, redoCount int, canUndo, canRedo bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	uLen := len(h.undoStack)
	rLen := len(h.redoStack)
	return uLen, rLen, uLen > 1, rLen > 0
}

// Clear clears both undo and redo stacks.
func (h *HistoryManager) Clear() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.undoStack = nil
	h.redoStack = nil
}
