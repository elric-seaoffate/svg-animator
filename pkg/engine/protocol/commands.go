package protocol

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"runtime"
	"strings"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/geometry"
	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/scene"
	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/sva"
	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/timeline"
)

// ProtocolVersion defines the current contract version between engine and host/bridge.
const ProtocolVersion = "1.0.0"

var activeScene = scene.NewScene()

// EngineInfo describes the Go WebAssembly runtime and capabilities.
type EngineInfo struct {
	Version   string `json:"version"`
	GoVersion string `json:"goVersion"`
	Platform  string `json:"platform"`
	Status    string `json:"status"`
}

// GenerateFlowPathRequest is the payload for "Geometry.GenerateFlowPath".
type GenerateFlowPathRequest struct {
	Nodes     []geometry.Point `json:"nodes"`
	Curvature float64          `json:"curvature"`
	Width     float64          `json:"width"`
	Height    float64          `json:"height"`
	RouteMode string           `json:"routeMode"`
}

// GenerateFlowPathResponse contains the computed SVG path string and midpoint.
type GenerateFlowPathResponse struct {
	Path     string         `json:"path"`
	Midpoint geometry.Point `json:"midpoint"`
}

// ComputeSnappedPositionRequest is the payload for "Geometry.ComputeSnappedPosition".
type ComputeSnappedPositionRequest struct {
	XPct       float64             `json:"xPct"`
	YPct       float64             `json:"yPct"`
	SnapConfig geometry.SnapConfig `json:"snapConfig"`
}

// ComputeSnappedPositionResponse contains the snapped point.
type ComputeSnappedPositionResponse struct {
	Point geometry.Point `json:"point"`
}

// SetSceneStateRequest is the payload for "Scene.SetState".
type SetSceneStateRequest struct {
	Snapshot scene.Snapshot `json:"snapshot"`
}

// SetSceneStateResponse reports the active scene revision after state replacement.
type SetSceneStateResponse struct {
	Revision   int64  `json:"revision"`
	FlowsCount int    `json:"flowsCount"`
	Status     string `json:"status"`
}

// EvaluateSceneAtTimeRequest is the payload for "Timeline.EvaluateSceneAtTime".
type EvaluateSceneAtTimeRequest struct {
	Time     float64         `json:"time"`
	Snapshot *scene.Snapshot `json:"snapshot,omitempty"`
}

// EvaluateBatchRequest is the payload for "Timeline.EvaluateBatch".
type EvaluateBatchRequest struct {
	Times    []float64       `json:"times"`
	Snapshot *scene.Snapshot `json:"snapshot,omitempty"`
}

// ShapeDescribeRequest is the payload for "Shape.Describe".
type ShapeDescribeRequest struct {
	Shape    string  `json:"shape"`
	Width    float64 `json:"width"`
	Height   float64 `json:"height"`
	Text     string  `json:"text,omitempty"`
	Subtext  string  `json:"subtext,omitempty"`
	FontSize float64 `json:"fontSize,omitempty"`
}

// PresetApplyRequest is the payload for "Preset.Apply".
type PresetApplyRequest struct {
	Node   scene.Node         `json:"node"`
	Preset scene.PresetConfig `json:"preset"`
}

// PresetExtractRequest is the payload for "Preset.Extract".
type PresetExtractRequest struct {
	Node   scene.Node         `json:"node"`
	Preset scene.PresetConfig `json:"preset"`
}

// NodeCreateRequest is the payload for "Node.Create".
type NodeCreateRequest struct {
	Initial scene.Node          `json:"initial"`
	Preset  *scene.PresetConfig `json:"preset,omitempty"`
	Snap    bool                `json:"snap"`
}

// NodeUpdateRequest is the payload for "Node.Update".
type NodeUpdateRequest struct {
	ID    scene.StringID `json:"id"`
	Patch scene.Node     `json:"patch"`
}

// NodeDeleteRequest is the payload for "Node.Delete".
type NodeDeleteRequest struct {
	ID scene.StringID `json:"id"`
}

// NodeFindAtRequest is the payload for "Node.FindAt".
type NodeFindAtRequest struct {
	XPct    float64 `json:"xPct"`
	YPct    float64 `json:"yPct"`
	CanvasW float64 `json:"canvasW"`
	CanvasH float64 `json:"canvasH"`
}

// NodeGetBoundsRequest is the payload for "Node.GetBounds".
type NodeGetBoundsRequest struct {
	ID      scene.StringID `json:"id"`
	CanvasW float64        `json:"canvasW"`
	CanvasH float64        `json:"canvasH"`
}

// FlowCreateRequest is the payload for "Flow.Create".
type FlowCreateRequest struct {
	Initial scene.Flow `json:"initial"`
}

// FlowUpdateRequest is the payload for "Flow.Update".
type FlowUpdateRequest struct {
	ID    scene.StringID `json:"id"`
	Patch scene.Flow     `json:"patch"`
}

// FlowDeleteRequest is the payload for "Flow.Delete".
type FlowDeleteRequest struct {
	ID scene.StringID `json:"id"`
}

// FlowFindAtRequest is the payload for "Flow.FindAt".
type FlowFindAtRequest struct {
	XPct    float64 `json:"xPct"`
	YPct    float64 `json:"yPct"`
	CanvasW float64 `json:"canvasW"`
	CanvasH float64 `json:"canvasH"`
}

// FlowGetBoundsRequest is the payload for "Flow.GetBounds".
type FlowGetBoundsRequest struct {
	ID      scene.StringID `json:"id"`
	CanvasW float64        `json:"canvasW"`
	CanvasH float64        `json:"canvasH"`
}

// FlowAddWaypointRequest is the payload for "Flow.AddWaypoint".
type FlowAddWaypointRequest struct {
	ID scene.StringID `json:"id"`
	X  *float64       `json:"x,omitempty"`
	Y  *float64       `json:"y,omitempty"`
}

// FlowRemoveWaypointRequest is the payload for "Flow.RemoveWaypoint".
type FlowRemoveWaypointRequest struct {
	ID          scene.StringID `json:"id"`
	WaypointIdx int            `json:"waypointIdx"`
}

// FlowUpdateWaypointRequest is the payload for "Flow.UpdateWaypoint".
type FlowUpdateWaypointRequest struct {
	ID          scene.StringID `json:"id"`
	WaypointIdx int            `json:"waypointIdx"`
	X           float64        `json:"x"`
	Y           float64        `json:"y"`
}

// FlowAttachToNodeRequest is the payload for "Flow.AttachToNode".
type FlowAttachToNodeRequest struct {
	FlowID scene.StringID `json:"flowId"`
	NodeID scene.StringID `json:"nodeId"`
	IsEnd  bool           `json:"isEnd"`
}

// FlowDetachFromNodeRequest is the payload for "Flow.DetachFromNode".
type FlowDetachFromNodeRequest struct {
	FlowID scene.StringID `json:"flowId"`
	IsEnd  bool           `json:"isEnd"`
}

// FlowRecalculateConnectionsRequest is the payload for "Flow.RecalculateConnections".
type FlowRecalculateConnectionsRequest struct {
	NodeID scene.StringID `json:"nodeId"`
}

// FlowDescribeRequest is the payload for "Flow.Describe".
type FlowDescribeRequest struct {
	Nodes     []geometry.Point `json:"nodes"`
	Curvature float64          `json:"curvature"`
	Width     float64          `json:"width"`
	Height    float64          `json:"height"`
	RouteMode string           `json:"routeMode"`
}

// GlowCreateRequest is the payload for "Glow.Create".
type GlowCreateRequest struct {
	Initial scene.Glow `json:"initial"`
}

// GlowUpdateRequest is the payload for "Glow.Update".
type GlowUpdateRequest struct {
	ID    scene.StringID `json:"id"`
	Patch scene.Glow     `json:"patch"`
}

// GlowDeleteRequest is the payload for "Glow.Delete".
type GlowDeleteRequest struct {
	ID scene.StringID `json:"id"`
}

// GlowFindAtRequest is the payload for "Glow.FindAt".
type GlowFindAtRequest struct {
	XPct    float64 `json:"xPct"`
	YPct    float64 `json:"yPct"`
	CanvasW float64 `json:"canvasW"`
	CanvasH float64 `json:"canvasH"`
}

// GlowGetBoundsRequest is the payload for "Glow.GetBounds".
type GlowGetBoundsRequest struct {
	ID      scene.StringID `json:"id"`
	CanvasW float64        `json:"canvasW"`
	CanvasH float64        `json:"canvasH"`
}

// GlowDescribeRequest is the payload for "Glow.Describe".
type GlowDescribeRequest struct {
	ID      scene.StringID `json:"id"`
	CanvasW float64        `json:"canvasW"`
	CanvasH float64        `json:"canvasH"`
}

// RippleCreateRequest is the payload for "Ripple.Create".
type RippleCreateRequest struct {
	Initial scene.Ripple `json:"initial"`
}

// RippleUpdateRequest is the payload for "Ripple.Update".
type RippleUpdateRequest struct {
	ID    scene.StringID `json:"id"`
	Patch scene.Ripple   `json:"patch"`
}

// RippleDeleteRequest is the payload for "Ripple.Delete".
type RippleDeleteRequest struct {
	ID scene.StringID `json:"id"`
}

// RippleFindAtRequest is the payload for "Ripple.FindAt".
type RippleFindAtRequest struct {
	XPct    float64 `json:"xPct"`
	YPct    float64 `json:"yPct"`
	CanvasW float64 `json:"canvasW"`
	CanvasH float64 `json:"canvasH"`
}

// RippleGetBoundsRequest is the payload for "Ripple.GetBounds".
type RippleGetBoundsRequest struct {
	ID      scene.StringID `json:"id"`
	CanvasW float64        `json:"canvasW"`
	CanvasH float64        `json:"canvasH"`
}

// RippleDescribeRequest is the payload for "Ripple.Describe".
type RippleDescribeRequest struct {
	ID      scene.StringID `json:"id"`
	CanvasW float64        `json:"canvasW"`
	CanvasH float64        `json:"canvasH"`
}

// CameraUpdateRequest is the payload for "Camera.Update".
type CameraUpdateRequest struct {
	Camera scene.CameraConfig `json:"camera"`
}

// CameraEvaluateRequest is the payload for "Camera.Evaluate".
type CameraEvaluateRequest struct {
	Time    float64             `json:"time"`
	CanvasW float64             `json:"canvasW"`
	CanvasH float64             `json:"canvasH"`
	Camera  *scene.CameraConfig `json:"camera,omitempty"`
}

// OpticsUpdateRequest is the payload for "Optics.Update".
type OpticsUpdateRequest struct {
	Optical scene.OpticalConfig `json:"optical"`
}

// OpticsEvaluateRequest is the payload for "Optics.Evaluate".
type OpticsEvaluateRequest struct {
	Time        float64              `json:"time"`
	CamDuration float64              `json:"camDuration"`
	CamLoop     string               `json:"camLoop"`
	Optical     *scene.OpticalConfig `json:"optical,omitempty"`
}

// FrameUpdateRequest is the payload for "Frame.Update".
type FrameUpdateRequest struct {
	Frame scene.FrameConfig `json:"frame"`
}

// FrameDescribeRequest is the payload for "Frame.Describe".
type FrameDescribeRequest struct {
	CanvasW float64            `json:"canvasW"`
	CanvasH float64            `json:"canvasH"`
	Frame   *scene.FrameConfig `json:"frame,omitempty"`
}

// SelectionSetRequest is the payload for "Selection.Set", "Selection.Add", "Selection.Toggle", "Selection.Remove".
type SelectionSetRequest struct {
	Type  string                `json:"type"`
	ID    scene.StringID        `json:"id"`
	Items []scene.SelectionItem `json:"items,omitempty"`
}

// SelectionResponse is the payload for "Selection.Get", "Selection.Set", "Selection.Add", "Selection.Toggle", "Selection.Remove", "Selection.Clear".
type SelectionResponse struct {
	Type    string                `json:"type"`
	ID      scene.StringID        `json:"id"`
	Items   []scene.SelectionItem `json:"items,omitempty"`
	Count   int                   `json:"count"`
	Success bool                  `json:"success"`
	Error   string                `json:"error,omitempty"`
}

// NodesMoveGroupRequest is the payload for "Nodes.MoveGroup".
type NodesMoveGroupRequest struct {
	IDs []scene.StringID `json:"ids"`
	DX  float64          `json:"dx"`
	DY  float64          `json:"dy"`
}

// NodesAlignRequest is the payload for "Nodes.Align".
type NodesAlignRequest struct {
	IDs     []scene.StringID `json:"ids"`
	Mode    string           `json:"mode"`
	CanvasW float64          `json:"canvasW"`
	CanvasH float64          `json:"canvasH"`
}

// NodesDistributeRequest is the payload for "Nodes.Distribute".
type NodesDistributeRequest struct {
	IDs     []scene.StringID `json:"ids"`
	Mode    string           `json:"mode"`
	CanvasW float64          `json:"canvasW"`
	CanvasH float64          `json:"canvasH"`
}

// NodesTransformResponse is the response payload for "Nodes.MoveGroup", "Nodes.Align", "Nodes.Distribute".
type NodesTransformResponse struct {
	Success bool         `json:"success"`
	Nodes   []scene.Node `json:"nodes,omitempty"`
	Count   int          `json:"count"`
	Error   string       `json:"error,omitempty"`
}

// GroupCreateRequest payload for "Group.Create".
type GroupCreateRequest struct {
	Name    string              `json:"name,omitempty"`
	Members []scene.GroupMember `json:"members"`
}

// GroupCreateResponse response for "Group.Create".
type GroupCreateResponse struct {
	Success bool        `json:"success"`
	Group   scene.Group `json:"group,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// GroupUngroupRequest payload for "Group.Ungroup".
type GroupUngroupRequest struct {
	GroupID scene.StringID `json:"groupId"`
}

// GroupUngroupResponse response for "Group.Ungroup".
type GroupUngroupResponse struct {
	Success bool                `json:"success"`
	Members []scene.GroupMember `json:"members,omitempty"`
	Error   string              `json:"error,omitempty"`
}

// GroupRemoveMembersRequest payload for "Group.RemoveMembers".
type GroupRemoveMembersRequest struct {
	GroupID scene.StringID      `json:"groupId"`
	Members []scene.GroupMember `json:"members"`
}

// GroupRemoveMembersResponse response for "Group.RemoveMembers".
type GroupRemoveMembersResponse struct {
	Success   bool        `json:"success"`
	Dissolved bool        `json:"dissolved"`
	Group     scene.Group `json:"group,omitempty"`
	Error     string      `json:"error,omitempty"`
}

// GroupDeleteRequest payload for "Group.Delete".
type GroupDeleteRequest struct {
	GroupID       scene.StringID `json:"groupId"`
	DeleteMembers bool           `json:"deleteMembers"`
}

// GroupDeleteResponse response for "Group.Delete".
type GroupDeleteResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// GroupRenameRequest payload for "Group.Rename".
type GroupRenameRequest struct {
	GroupID scene.StringID `json:"groupId"`
	Name    string         `json:"name"`
}

// GroupRenameResponse response for "Group.Rename".
type GroupRenameResponse struct {
	Success bool        `json:"success"`
	Group   scene.Group `json:"group,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// GroupGetRequest payload for "Group.Get".
type GroupGetRequest struct {
	GroupID scene.StringID `json:"groupId"`
}

// GroupGetResponse response for "Group.Get".
type GroupGetResponse struct {
	Found bool        `json:"found"`
	Group scene.Group `json:"group,omitempty"`
	Error string      `json:"error,omitempty"`
}

// GroupListResponse response for "Group.List".
type GroupListResponse struct {
	Groups        []scene.Group `json:"groups"`
	Count         int           `json:"count"`
	GroupsCounter int64         `json:"groupsCounter"`
}

// GroupMoveRequest payload for "Group.Move".
type GroupMoveRequest struct {
	GroupID scene.StringID `json:"groupId"`
	DX      float64        `json:"dx"`
	DY      float64        `json:"dy"`
}

// GroupMoveResponse response for "Group.Move".
type GroupMoveResponse struct {
	Success  bool            `json:"success"`
	Snapshot *scene.Snapshot `json:"snapshot,omitempty"`
	Error    string          `json:"error,omitempty"`
}

// GroupFindMemberRequest payload for "Group.FindByMember".
type GroupFindMemberRequest struct {
	Type scene.SelectionType `json:"type"`
	ID   scene.StringID      `json:"id"`
}

// GroupFindMemberResponse response for "Group.FindByMember".
type GroupFindMemberResponse struct {
	Found bool        `json:"found"`
	Group scene.Group `json:"group,omitempty"`
}

// GroupBoundsRequest payload for "Group.Bounds".
type GroupBoundsRequest struct {
	GroupID scene.StringID `json:"groupId"`
	CanvasW float64        `json:"canvasW"`
	CanvasH float64        `json:"canvasH"`
}

// GroupBoundsResponse response for "Group.Bounds".
type GroupBoundsResponse struct {
	Success bool    `json:"success"`
	MinX    float64 `json:"minX"`
	MinY    float64 `json:"minY"`
	MaxX    float64 `json:"maxX"`
	MaxY    float64 `json:"maxY"`
	Error   string  `json:"error,omitempty"`
}

// ImageCreateRequest payload for "Image.Create".
type ImageCreateRequest struct {
	Image scene.Image `json:"image"`
}

// ImageCreateResponse response for "Image.Create".
type ImageCreateResponse struct {
	Success bool        `json:"success"`
	Image   scene.Image `json:"image,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// ImageUpdateRequest payload for "Image.Update".
type ImageUpdateRequest struct {
	ID    scene.StringID `json:"id"`
	Patch scene.Image    `json:"patch"`
}

// ImageUpdateResponse response for "Image.Update".
type ImageUpdateResponse struct {
	Success bool        `json:"success"`
	Image   scene.Image `json:"image,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// ImageDeleteRequest payload for "Image.Delete".
type ImageDeleteRequest struct {
	ID scene.StringID `json:"id"`
}

// ImageDeleteResponse response for "Image.Delete".
type ImageDeleteResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// ImageGetRequest payload for "Image.Get".
type ImageGetRequest struct {
	ID scene.StringID `json:"id"`
}

// ImageGetResponse response for "Image.Get".
type ImageGetResponse struct {
	Found bool        `json:"found"`
	Image scene.Image `json:"image,omitempty"`
}

// ImageListResponse response for "Image.List".
type ImageListResponse struct {
	Images        []scene.Image `json:"images"`
	Count         int           `json:"count"`
	ImagesCounter int64         `json:"imagesCounter"`
}

// ImageCropRequest payload for "Image.Crop".
type ImageCropRequest struct {
	ID   scene.StringID  `json:"id"`
	Crop scene.ImageCrop `json:"crop"`
	NewX *float64        `json:"newX,omitempty"`
	NewY *float64        `json:"newY,omitempty"`
	NewW *float64        `json:"newW,omitempty"`
	NewH *float64        `json:"newH,omitempty"`
}

// ImageCropResponse response for "Image.Crop".
type ImageCropResponse struct {
	Success bool        `json:"success"`
	Image   scene.Image `json:"image,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// ImageResetCropRequest payload for "Image.ResetCrop".
type ImageResetCropRequest struct {
	ID scene.StringID `json:"id"`
}

// ImageResetCropResponse response for "Image.ResetCrop".
type ImageResetCropResponse struct {
	Success bool        `json:"success"`
	Image   scene.Image `json:"image,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// ImageClipRequest payload for "Image.Clip".
type ImageClipRequest struct {
	ID   scene.StringID  `json:"id"`
	Clip scene.ImageClip `json:"clip"`
}

// ImageClipResponse response for "Image.Clip".
type ImageClipResponse struct {
	Success bool        `json:"success"`
	Image   scene.Image `json:"image,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// ImageResetClipRequest payload for "Image.ResetClip".
type ImageResetClipRequest struct {
	ID scene.StringID `json:"id"`
}

// ImageResetClipResponse response for "Image.ResetClip".
type ImageResetClipResponse struct {
	Success bool        `json:"success"`
	Image   scene.Image `json:"image,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// LayerGetResponse response for "Layer.Get".
type LayerGetResponse struct {
	Layers []scene.LayerEntry `json:"layers"`
	Count  int                `json:"count"`
}

// LayerSetRequest payload for "Layer.Set".
type LayerSetRequest struct {
	Layers []scene.LayerEntry `json:"layers"`
}

// LayerSetResponse response for "Layer.Set".
type LayerSetResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// LayerReorderRequest payload for "Layer.BringToFront", "Layer.BringForward", "Layer.SendBackward", "Layer.SendToBack".
type LayerReorderRequest struct {
	Targets []scene.SelectionItem `json:"targets"`
}

// LayerReorderResponse response for layer reorder commands.
type LayerReorderResponse struct {
	Success bool               `json:"success"`
	Changed bool               `json:"changed"`
	Layers  []scene.LayerEntry `json:"layers,omitempty"`
	Error   string             `json:"error,omitempty"`
}

// LayerVisibilityRequest payload for "Layer.SetVisibility".
type LayerVisibilityRequest struct {
	Type    scene.SelectionType `json:"type"`
	ID      scene.StringID      `json:"id"`
	Visible bool                `json:"visible"`
}

// LayerVisibilityResponse response for "Layer.SetVisibility".
type LayerVisibilityResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// LayerLockedRequest payload for "Layer.SetLocked".
type LayerLockedRequest struct {
	Type   scene.SelectionType `json:"type"`
	ID     scene.StringID      `json:"id"`
	Locked bool                `json:"locked"`
}

// LayerLockedResponse response for "Layer.SetLocked".
type LayerLockedResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// LayerEffectiveRequest payload for "Layer.GetEffective".
type LayerEffectiveRequest struct {
	Type scene.SelectionType `json:"type"`
	ID   scene.StringID      `json:"id"`
}

// LayerEffectiveResponse response for "Layer.GetEffective".
type LayerEffectiveResponse struct {
	Visible bool `json:"visible"`
	Locked  bool `json:"locked"`
}

// SceneCopyRequest payload for "Scene.Copy".
type SceneCopyRequest struct {
	Items   []scene.SelectionItem `json:"items,omitempty"`
	GroupID scene.StringID        `json:"groupId,omitempty"`
}

// SceneCopyResponse response for "Scene.Copy".
type SceneCopyResponse struct {
	Success bool                   `json:"success"`
	Payload scene.ClipboardPayload `json:"payload,omitempty"`
	Error   string                 `json:"error,omitempty"`
}

// ScenePasteRequest payload for "Scene.Paste".
type ScenePasteRequest struct {
	Payload scene.ClipboardPayload `json:"payload"`
	OffsetX float64                `json:"offsetX"`
	OffsetY float64                `json:"offsetY"`
}

// ScenePasteResponse response for "Scene.Paste".
type ScenePasteResponse struct {
	Success    bool                  `json:"success"`
	NewItems   []scene.SelectionItem `json:"newItems,omitempty"`
	NewGroupID scene.StringID        `json:"newGroupId,omitempty"`
	Snapshot   *scene.Snapshot       `json:"snapshot,omitempty"`
	Error      string                `json:"error,omitempty"`
}

// SceneDuplicateRequest payload for "Scene.Duplicate".
type SceneDuplicateRequest struct {
	Items   []scene.SelectionItem `json:"items,omitempty"`
	GroupID scene.StringID        `json:"groupId,omitempty"`
	OffsetX float64                `json:"offsetX"`
	OffsetY float64                `json:"offsetY"`
}

// SceneDuplicateResponse response for "Scene.Duplicate".
type SceneDuplicateResponse struct {
	Success    bool                  `json:"success"`
	NewItems   []scene.SelectionItem `json:"newItems,omitempty"`
	NewGroupID scene.StringID        `json:"newGroupId,omitempty"`
	Snapshot   *scene.Snapshot       `json:"snapshot,omitempty"`
	Error      string                `json:"error,omitempty"`
}

// HistoryRecordRequest is the payload for "History.Record".
type HistoryRecordRequest struct {
	Snapshot  *scene.Snapshot       `json:"snapshot,omitempty"`
	Selection *scene.SelectionState `json:"selection,omitempty"`
}

// HistoryStateResponse is the response for "History.Record", "History.GetState", "History.Clear".
type HistoryStateResponse struct {
	UndoCount int  `json:"undoCount"`
	RedoCount int  `json:"redoCount"`
	CanUndo   bool `json:"canUndo"`
	CanRedo   bool `json:"canRedo"`
	Recorded  bool `json:"recorded,omitempty"`
}

// HistoryRestoreResponse is the response for "History.Undo" and "History.Redo".
type HistoryRestoreResponse struct {
	Success   bool                  `json:"success"`
	Snapshot  *scene.Snapshot       `json:"snapshot,omitempty"`
	Selection *scene.SelectionState `json:"selection,omitempty"`
	UndoCount int                   `json:"undoCount"`
	RedoCount int                   `json:"redoCount"`
	CanUndo   bool                  `json:"canUndo"`
	CanRedo   bool                  `json:"canRedo"`
	Error     string                `json:"error,omitempty"`
}

// ObjectRenameRequest is the payload for "Object.Rename".
type ObjectRenameRequest struct {
	Type string         `json:"type"`
	ID   scene.StringID `json:"id"`
	Name string         `json:"name"`
}

// ObjectRenameResponse is the response for "Object.Rename".
type ObjectRenameResponse struct {
	Type    string         `json:"type"`
	ID      scene.StringID `json:"id"`
	Name    string         `json:"name"`
	Success bool           `json:"success"`
}

// EncodeSVARequest is the payload for "Project.EncodeSVA".
type EncodeSVARequest struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	State       json.RawMessage `json:"state,omitempty"`
}

// EncodeSVAResponse is returned by "Project.EncodeSVA".
type EncodeSVAResponse struct {
	Success    bool   `json:"success"`
	DataB64    string `json:"dataB64,omitempty"`
	Filename   string `json:"filename,omitempty"`
	Size       int64  `json:"size,omitempty"`
	AssetCount int    `json:"assetCount,omitempty"`
	Error      string `json:"error,omitempty"`
}

// DecodeSVARequest is the payload for "Project.DecodeSVA".
type DecodeSVARequest struct {
	DataB64 string `json:"dataB64"`
}

// DecodeSVAResponse is returned by "Project.DecodeSVA".
type DecodeSVAResponse struct {
	Success  bool            `json:"success"`
	Manifest *sva.Manifest   `json:"manifest,omitempty"`
	State    json.RawMessage `json:"state,omitempty"`
	Error    string          `json:"error,omitempty"`
}

// ValidateSVARequest is the payload for "Project.ValidateSVA".
type ValidateSVARequest struct {
	DataB64 string `json:"dataB64"`
}

// ValidateSVAResponse is returned by "Project.ValidateSVA".
type ValidateSVAResponse struct {
	Success  bool          `json:"success"`
	Manifest *sva.Manifest `json:"manifest,omitempty"`
	Error    string        `json:"error,omitempty"`
}

// Dispatch processes incoming commands and returns JSON-encoded responses.
func Dispatch(command string, payloadJSON []byte) ([]byte, error) {
	switch command {
	case "Engine.Ping":
		info := EngineInfo{
			Version:   ProtocolVersion,
			GoVersion: runtime.Version(),
			Platform:  runtime.GOOS + "/" + runtime.GOARCH,
			Status:    "ready",
		}
		return json.Marshal(info)

	case "Geometry.GenerateFlowPath":
		var req GenerateFlowPathRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding GenerateFlowPathRequest: %w", err)
		}
		path := geometry.GenerateFlowPath(req.Nodes, req.Curvature, req.Width, req.Height, req.RouteMode)
		mid := geometry.GetFlowMidpoint(req.Nodes, req.Curvature, req.Width, req.Height)
		return json.Marshal(GenerateFlowPathResponse{
			Path:     path,
			Midpoint: mid,
		})

	case "Geometry.ComputeSnappedPosition":
		var req ComputeSnappedPositionRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding ComputeSnappedPositionRequest: %w", err)
		}
		pt := geometry.ComputeSnappedPosition(req.XPct, req.YPct, req.SnapConfig)
		return json.Marshal(ComputeSnappedPositionResponse{
			Point: pt,
		})

	case "Scene.SetState":
		var req SetSceneStateRequest
		if err := json.Unmarshal(payloadJSON, &req); err == nil && (len(req.Snapshot.Flows) > 0 || req.Snapshot.Revision > 0 || len(req.Snapshot.Nodes) > 0) {
			activeScene.SetFromSnapshot(req.Snapshot)
			return json.Marshal(SetSceneStateResponse{
				Revision:   activeScene.Revision(),
				FlowsCount: len(req.Snapshot.Flows),
				Status:     "ok",
			})
		}
		var directSnap scene.Snapshot
		if err := json.Unmarshal(payloadJSON, &directSnap); err != nil {
			return nil, fmt.Errorf("decoding SetSceneStateRequest: %w", err)
		}
		activeScene.SetFromSnapshot(directSnap)
		return json.Marshal(SetSceneStateResponse{
			Revision:   activeScene.Revision(),
			FlowsCount: len(directSnap.Flows),
			Status:     "ok",
		})

	case "Scene.GetState":
		snap := activeScene.GetSnapshot()
		return json.Marshal(snap)

	case "Scene.UpdateFlow":
		var f scene.Flow
		if err := json.Unmarshal(payloadJSON, &f); err != nil {
			return nil, fmt.Errorf("decoding UpdateFlow: %w", err)
		}
		activeScene.UpdateFlow(f)
		return json.Marshal(map[string]any{"revision": activeScene.Revision(), "status": "ok"})

	case "Scene.RemoveFlow":
		var req struct {
			ID scene.StringID `json:"id"`
		}
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding RemoveFlow: %w", err)
		}
		ok := activeScene.RemoveFlow(req.ID)
		return json.Marshal(map[string]any{"removed": ok, "revision": activeScene.Revision()})

	case "Timeline.EvaluateSceneAtTime":
		var req EvaluateSceneAtTimeRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding EvaluateSceneAtTimeRequest: %w", err)
		}
		if req.Snapshot != nil {
			activeScene.SetFromSnapshot(*req.Snapshot)
		}
		res := timeline.EvaluateSceneAtTime(activeScene, req.Time)
		return json.Marshal(res)

	case "Timeline.EvaluateBatch":
		var req EvaluateBatchRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding EvaluateBatchRequest: %w", err)
		}
		if req.Snapshot != nil {
			activeScene.SetFromSnapshot(*req.Snapshot)
		}
		results := make([]timeline.FrameResult, len(req.Times))
		for i, t := range req.Times {
			results[i] = timeline.EvaluateSceneAtTime(activeScene, t)
		}
		return json.Marshal(results)

	case "Shape.GetCatalog":
		catalog := geometry.GetShapeCatalog()
		return json.Marshal(catalog)

	case "Shape.Describe":
		var req ShapeDescribeRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding ShapeDescribeRequest: %w", err)
		}
		desc := geometry.DescribeShape(req.Shape, req.Width, req.Height, req.Text, req.Subtext, req.FontSize)
		return json.Marshal(desc)

	case "Preset.GetDefaults":
		defaults := scene.DefaultPreset()
		return json.Marshal(defaults)

	case "Preset.Apply":
		var req PresetApplyRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding PresetApplyRequest: %w", err)
		}
		changed := req.Preset.ApplyPresetToNode(&req.Node)
		return json.Marshal(map[string]any{
			"node":    req.Node,
			"changed": changed,
		})

	case "Preset.Extract":
		var req PresetExtractRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding PresetExtractRequest: %w", err)
		}
		req.Preset.ExtractPresetFromNode(req.Node)
		return json.Marshal(req.Preset)

	case "Node.Create":
		var req NodeCreateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding NodeCreateRequest: %w", err)
		}
		created := activeScene.CreateNode(req.Initial, req.Preset, req.Snap)
		return json.Marshal(map[string]any{
			"node":     created,
			"revision": activeScene.Revision(),
		})

	case "Node.Update":
		var req NodeUpdateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding NodeUpdateRequest: %w", err)
		}
		existing := activeScene.GetNode(req.ID)
		if existing == nil {
			return nil, fmt.Errorf("node with id %q not found", req.ID)
		}
		updated := *existing
		if req.Patch.Name != "" {
			updated.Name = req.Patch.Name
		}
		if req.Patch.Shape != "" {
			updated.Shape = geometry.NormalizeShapeID(req.Patch.Shape)
		}
		if req.Patch.Text != "" {
			updated.Text = req.Patch.Text
			updated.Label = req.Patch.Text
		} else if req.Patch.Label != "" {
			updated.Text = req.Patch.Label
			updated.Label = req.Patch.Label
		}
		if req.Patch.Subtext != "" {
			updated.Subtext = req.Patch.Subtext
		}
		if req.Patch.X != 0 {
			updated.X = req.Patch.X
		}
		if req.Patch.Y != 0 {
			updated.Y = req.Patch.Y
		}
		if req.Patch.Width > 0 {
			updated.Width = req.Patch.Width
		}
		if req.Patch.Height > 0 {
			updated.Height = req.Patch.Height
		}
		if req.Patch.FillColor != "" {
			updated.FillColor = req.Patch.FillColor
			updated.Fill = req.Patch.FillColor
		} else if req.Patch.Fill != "" {
			updated.FillColor = req.Patch.Fill
			updated.Fill = req.Patch.Fill
		}
		if req.Patch.StrokeColor != "" {
			updated.StrokeColor = req.Patch.StrokeColor
			updated.Stroke = req.Patch.StrokeColor
		} else if req.Patch.Stroke != "" {
			updated.StrokeColor = req.Patch.Stroke
			updated.Stroke = req.Patch.Stroke
		}
		if req.Patch.TextColor != "" {
			updated.TextColor = req.Patch.TextColor
		}
		if req.Patch.FontSize > 0 {
			updated.FontSize = req.Patch.FontSize
		}
		if req.Patch.FillOpacity > 0 {
			updated.FillOpacity = req.Patch.FillOpacity
		}
		if req.Patch.StrokeWidth > 0 {
			updated.StrokeWidth = req.Patch.StrokeWidth
		}
		if req.Patch.StrokeStyle != "" {
			updated.StrokeStyle = req.Patch.StrokeStyle
		}
		if req.Patch.Anim != "" {
			updated.Anim = req.Patch.Anim
			updated.Animation = req.Patch.Anim
		} else if req.Patch.Animation != "" {
			updated.Anim = req.Patch.Animation
			updated.Animation = req.Patch.Animation
		}
		activeScene.UpdateNode(updated)
		return json.Marshal(map[string]any{
			"node":     updated,
			"revision": activeScene.Revision(),
		})

	case "Node.Delete":
		var req NodeDeleteRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding NodeDeleteRequest: %w", err)
		}
		deleted := activeScene.RemoveNode(req.ID)
		return json.Marshal(map[string]any{
			"deleted":  deleted,
			"revision": activeScene.Revision(),
		})

	case "Node.Get":
		var req struct {
			ID scene.StringID `json:"id"`
		}
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding Node.Get request: %w", err)
		}
		node := activeScene.GetNode(req.ID)
		return json.Marshal(node)

	case "Node.FindAt":
		var req NodeFindAtRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding NodeFindAtRequest: %w", err)
		}
		found := activeScene.FindNodeAt(req.XPct, req.YPct, req.CanvasW, req.CanvasH)
		return json.Marshal(found)

	case "Node.GetBounds":
		var req NodeGetBoundsRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding NodeGetBoundsRequest: %w", err)
		}
		node := activeScene.GetNode(req.ID)
		if node == nil {
			return nil, fmt.Errorf("node %q not found", req.ID)
		}
		eff := activeScene.GetNodeEffectiveProps(*node)
		desc := geometry.DescribeShape(node.Shape, eff.Width, eff.Height, node.Text, node.Subtext, eff.FontSize)
		canvasW := req.CanvasW
		if canvasW <= 0 {
			canvasW = 1280
		}
		canvasH := req.CanvasH
		if canvasH <= 0 {
			canvasH = 720
		}
		cx := (node.X / 100.0) * canvasW
		cy := (node.Y / 100.0) * canvasH
		return json.Marshal(map[string]any{
			"node":   node,
			"cx":     cx,
			"cy":     cy,
			"bounds": desc.Bounds,
			"screenRect": map[string]float64{
				"left":   cx + desc.Bounds.MinX,
				"top":    cy + desc.Bounds.MinY,
				"right":  cx + desc.Bounds.MaxX,
				"bottom": cy + desc.Bounds.MaxY,
				"width":  desc.Bounds.Width,
				"height": desc.Bounds.Height,
			},
		})

	case "Node.MoveGroup", "Nodes.MoveGroup":
		var req NodesMoveGroupRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding NodesMoveGroupRequest: %w", err)
		}
		updated, err := activeScene.MoveNodes(req.IDs, req.DX, req.DY)
		if err != nil {
			return json.Marshal(NodesTransformResponse{
				Success: false,
				Error:   err.Error(),
			})
		}
		return json.Marshal(NodesTransformResponse{
			Success: true,
			Nodes:   updated,
			Count:   len(updated),
		})

	case "Node.Align", "Nodes.Align":
		var req NodesAlignRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding NodesAlignRequest: %w", err)
		}
		updated, err := activeScene.AlignNodes(req.IDs, req.Mode, req.CanvasW, req.CanvasH)
		if err != nil {
			return json.Marshal(NodesTransformResponse{
				Success: false,
				Error:   err.Error(),
			})
		}
		return json.Marshal(NodesTransformResponse{
			Success: true,
			Nodes:   updated,
			Count:   len(updated),
		})

	case "Node.Distribute", "Nodes.Distribute":
		var req NodesDistributeRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding NodesDistributeRequest: %w", err)
		}
		updated, err := activeScene.DistributeNodes(req.IDs, req.Mode, req.CanvasW, req.CanvasH)
		if err != nil {
			return json.Marshal(NodesTransformResponse{
				Success: false,
				Error:   err.Error(),
			})
		}
		return json.Marshal(NodesTransformResponse{
			Success: true,
			Nodes:   updated,
			Count:   len(updated),
		})

	case "Flow.Create":
		var req FlowCreateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding FlowCreateRequest: %w", err)
		}
		created := activeScene.CreateFlow(req.Initial)
		return json.Marshal(map[string]any{
			"flow":     created,
			"revision": activeScene.Revision(),
		})

	case "Flow.Update":
		var req FlowUpdateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding FlowUpdateRequest: %w", err)
		}
		existing := activeScene.GetFlow(req.ID)
		if existing == nil {
			return nil, fmt.Errorf("flow with id %q not found", req.ID)
		}
		updated := *existing
		if req.Patch.Name != "" {
			updated.Name = req.Patch.Name
		}
		if len(req.Patch.Nodes) >= 2 {
			updated.Nodes = req.Patch.Nodes
		}
		if req.Patch.Type != "" {
			updated.Type = req.Patch.Type
		}
		if req.Patch.RouteMode != "" {
			updated.RouteMode = req.Patch.RouteMode
		} else if req.Patch.Route != "" {
			updated.RouteMode = req.Patch.Route
		}
		if req.Patch.LineStyle != "" {
			updated.LineStyle = req.Patch.LineStyle
		}
		if req.Patch.Arrow != "" {
			updated.Arrow = req.Patch.Arrow
		}
		if req.Patch.LineWidth > 0 {
			updated.LineWidth = req.Patch.LineWidth
		}
		if req.Patch.Color != "" {
			updated.Color = req.Patch.Color
		}
		if req.Patch.Opacity > 0 {
			updated.Opacity = req.Patch.Opacity
		}
		if req.Patch.Speed > 0 {
			updated.Speed = req.Patch.Speed
		}
		if req.Patch.Delay >= 0 {
			updated.Delay = req.Patch.Delay
		}
		if req.Patch.EndDelay >= 0 {
			updated.EndDelay = req.Patch.EndDelay
		}
		updated.HideOnDelay = req.Patch.HideOnDelay
		if req.Patch.Scale > 0 {
			updated.Scale = req.Patch.Scale
		}
		if req.Patch.Glow >= 0 {
			updated.Glow = req.Patch.Glow
		}
		updated.ShowLine = req.Patch.ShowLine
		if req.Patch.Label != "" {
			updated.Label = req.Patch.Label
		}
		if req.Patch.Curvature != 0 {
			updated.Curvature = req.Patch.Curvature
		}
		if req.Patch.FromNodeID != "" {
			updated.FromNodeID = req.Patch.FromNodeID
		}
		if req.Patch.ToNodeID != "" {
			updated.ToNodeID = req.Patch.ToNodeID
		}
		if req.Patch.CustomB64 != "" {
			updated.CustomB64 = req.Patch.CustomB64
		}
		if req.Patch.CustomMime != "" {
			updated.CustomMime = req.Patch.CustomMime
		}
		if req.Patch.CustomW > 0 {
			updated.CustomW = req.Patch.CustomW
		}
		if req.Patch.CustomH > 0 {
			updated.CustomH = req.Patch.CustomH
		}

		activeScene.UpdateFlow(updated)
		return json.Marshal(map[string]any{
			"flow":     updated,
			"revision": activeScene.Revision(),
		})

	case "Flow.Delete":
		var req FlowDeleteRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding FlowDeleteRequest: %w", err)
		}
		deleted := activeScene.RemoveFlow(req.ID)
		return json.Marshal(map[string]any{
			"deleted":  deleted,
			"revision": activeScene.Revision(),
		})

	case "Flow.Get":
		var req struct {
			ID scene.StringID `json:"id"`
		}
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding Flow.Get request: %w", err)
		}
		flow := activeScene.GetFlow(req.ID)
		return json.Marshal(flow)

	case "Flow.GetAll":
		flows := activeScene.GetAllFlows()
		return json.Marshal(flows)

	case "Flow.FindAt":
		var req FlowFindAtRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding FlowFindAtRequest: %w", err)
		}
		found := activeScene.FindFlowAt(req.XPct, req.YPct, req.CanvasW, req.CanvasH)
		return json.Marshal(found)

	case "Flow.GetBounds":
		var req FlowGetBoundsRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding FlowGetBoundsRequest: %w", err)
		}
		flow := activeScene.GetFlow(req.ID)
		if flow == nil {
			return nil, fmt.Errorf("flow %q not found", req.ID)
		}
		bounds, mid := activeScene.GetFlowBounds(*flow, req.CanvasW, req.CanvasH)
		return json.Marshal(map[string]any{
			"flow":     flow,
			"bounds":   bounds,
			"midpoint": mid,
		})

	case "Flow.AddWaypoint":
		var req FlowAddWaypointRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding FlowAddWaypointRequest: %w", err)
		}
		f, idx, ok := activeScene.AddWaypoint(req.ID, req.X, req.Y)
		return json.Marshal(map[string]any{
			"flow":        f,
			"waypointIdx": idx,
			"success":     ok,
			"revision":    activeScene.Revision(),
		})

	case "Flow.RemoveWaypoint":
		var req FlowRemoveWaypointRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding FlowRemoveWaypointRequest: %w", err)
		}
		f, idx, ok := activeScene.RemoveWaypoint(req.ID, req.WaypointIdx)
		return json.Marshal(map[string]any{
			"flow":        f,
			"waypointIdx": idx,
			"success":     ok,
			"revision":    activeScene.Revision(),
		})

	case "Flow.UpdateWaypoint":
		var req FlowUpdateWaypointRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding FlowUpdateWaypointRequest: %w", err)
		}
		f, ok := activeScene.UpdateWaypoint(req.ID, req.WaypointIdx, req.X, req.Y)
		return json.Marshal(map[string]any{
			"flow":     f,
			"success":  ok,
			"revision": activeScene.Revision(),
		})

	case "Flow.AttachToNode":
		var req FlowAttachToNodeRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding FlowAttachToNodeRequest: %w", err)
		}
		ok := activeScene.AttachFlowToNode(req.FlowID, req.IsEnd, req.NodeID)
		return json.Marshal(map[string]any{
			"success":  ok,
			"revision": activeScene.Revision(),
		})

	case "Flow.DetachFromNode":
		var req FlowDetachFromNodeRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding FlowDetachFromNodeRequest: %w", err)
		}
		ok := activeScene.DetachFlowFromNode(req.FlowID, req.IsEnd)
		return json.Marshal(map[string]any{
			"success":  ok,
			"revision": activeScene.Revision(),
		})

	case "Flow.RecalculateConnections":
		var req FlowRecalculateConnectionsRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding FlowRecalculateConnectionsRequest: %w", err)
		}
		activeScene.RecalculateNodeConnections(req.NodeID)
		return json.Marshal(map[string]any{
			"revision": activeScene.Revision(),
		})

	case "Flow.Describe":
		var req FlowDescribeRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding FlowDescribeRequest: %w", err)
		}
		desc := geometry.DescribeFlowGeometry(req.Nodes, req.Curvature, req.Width, req.Height, req.RouteMode)
		return json.Marshal(desc)

	case "Glow.Create":
		var req GlowCreateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding GlowCreateRequest: %w", err)
		}
		glow := activeScene.CreateGlow(req.Initial)
		return json.Marshal(map[string]any{
			"glow":     glow,
			"revision": activeScene.Revision(),
		})

	case "Glow.Update":
		var req GlowUpdateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding GlowUpdateRequest: %w", err)
		}
		existing := activeScene.GetGlow(req.ID)
		if existing == nil {
			return nil, fmt.Errorf("glow %q not found", req.ID)
		}
		updated := *existing
		if req.Patch.Name != "" {
			updated.Name = req.Patch.Name
		}
		if req.Patch.Shape != "" {
			updated.Shape = req.Patch.Shape
		}
		if req.Patch.Color != "" {
			updated.Color = req.Patch.Color
		}
		if req.Patch.Playback != "" {
			updated.Playback = req.Patch.Playback
		}
		if req.Patch.Size > 0 {
			updated.Size = req.Patch.Size
		}
		if req.Patch.Scale > 0 {
			updated.Scale = req.Patch.Scale
		}
		if req.Patch.Blur >= 0 {
			updated.Blur = req.Patch.Blur
		}
		if req.Patch.Duration > 0 {
			updated.Duration = req.Patch.Duration
		}
		if req.Patch.Delay >= 0 {
			updated.Delay = req.Patch.Delay
		}
		if req.Patch.EndDelay >= 0 {
			updated.EndDelay = req.Patch.EndDelay
		}
		if req.Patch.Opacity >= 0 {
			updated.Opacity = req.Patch.Opacity
		}
		if req.Patch.Thick > 0 {
			updated.Thick = req.Patch.Thick
		}
		if req.Patch.CoreR > 0 {
			updated.CoreR = req.Patch.CoreR
		}
		if req.Patch.Rings > 0 {
			updated.Rings = req.Patch.Rings
			updated.RadarRings = req.Patch.Rings
		} else if req.Patch.RadarRings > 0 {
			updated.RadarRings = req.Patch.RadarRings
			updated.Rings = req.Patch.RadarRings
		}
		if req.Patch.RadarStagger > 0 {
			updated.RadarStagger = req.Patch.RadarStagger
		}
		updated.HideOnDelay = req.Patch.HideOnDelay
		if req.Patch.X != 0 || req.Patch.Y != 0 {
			updated.X = req.Patch.X
			updated.Y = req.Patch.Y
		}
		if req.Patch.CustomB64 != "" {
			updated.CustomB64 = req.Patch.CustomB64
		}
		if req.Patch.CustomMime != "" {
			updated.CustomMime = req.Patch.CustomMime
		}
		if req.Patch.CustomW > 0 {
			updated.CustomW = req.Patch.CustomW
		}
		if req.Patch.CustomH > 0 {
			updated.CustomH = req.Patch.CustomH
		}

		activeScene.UpdateGlow(updated)
		return json.Marshal(map[string]any{
			"glow":     updated,
			"revision": activeScene.Revision(),
		})

	case "Glow.Delete":
		var req GlowDeleteRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding GlowDeleteRequest: %w", err)
		}
		deleted := activeScene.RemoveGlow(req.ID)
		return json.Marshal(map[string]any{
			"deleted":  deleted,
			"revision": activeScene.Revision(),
		})

	case "Glow.Get":
		var req struct {
			ID scene.StringID `json:"id"`
		}
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding Glow.Get request: %w", err)
		}
		glow := activeScene.GetGlow(req.ID)
		return json.Marshal(glow)

	case "Glow.GetAll":
		glows := activeScene.GetAllGlows()
		return json.Marshal(glows)

	case "Glow.FindAt":
		var req GlowFindAtRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding GlowFindAtRequest: %w", err)
		}
		found := activeScene.FindGlowAt(req.XPct, req.YPct, req.CanvasW, req.CanvasH)
		return json.Marshal(found)

	case "Glow.GetBounds":
		var req GlowGetBoundsRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding GlowGetBoundsRequest: %w", err)
		}
		glow := activeScene.GetGlow(req.ID)
		if glow == nil {
			return nil, fmt.Errorf("glow %q not found", req.ID)
		}
		bounds, center := activeScene.GetGlowBounds(*glow, req.CanvasW, req.CanvasH)
		return json.Marshal(map[string]any{
			"glow":   glow,
			"bounds": bounds,
			"center": center,
		})

	case "Glow.Describe":
		var req GlowDescribeRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding GlowDescribeRequest: %w", err)
		}
		glow := activeScene.GetGlow(req.ID)
		if glow == nil {
			return nil, fmt.Errorf("glow %q not found", req.ID)
		}
		desc := activeScene.DescribeGlow(*glow, req.CanvasW, req.CanvasH)
		return json.Marshal(desc)

	case "Ripple.Create":
		var req RippleCreateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding RippleCreateRequest: %w", err)
		}
		ripple := activeScene.CreateRipple(req.Initial)
		return json.Marshal(map[string]any{
			"ripple":   ripple,
			"revision": activeScene.Revision(),
		})

	case "Ripple.Update":
		var req RippleUpdateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding RippleUpdateRequest: %w", err)
		}
		existing := activeScene.GetRipple(req.ID)
		if existing == nil {
			return nil, fmt.Errorf("ripple %q not found", req.ID)
		}
		updated := *existing
		if req.Patch.Name != "" {
			updated.Name = req.Patch.Name
		}
		if req.Patch.Color != "" {
			updated.Color = req.Patch.Color
		}
		if req.Patch.Opacity >= 0 {
			updated.Opacity = req.Patch.Opacity
		}
		if req.Patch.InnerR >= 0 {
			updated.InnerR = req.Patch.InnerR
		}
		if req.Patch.OuterR > 0 {
			updated.OuterR = req.Patch.OuterR
		}
		if req.Patch.Rings > 0 {
			updated.Rings = req.Patch.Rings
			updated.WaveCount = req.Patch.Rings
		} else if req.Patch.WaveCount > 0 {
			updated.WaveCount = req.Patch.WaveCount
			updated.Rings = req.Patch.WaveCount
		}
		if req.Patch.Thick > 0 {
			updated.Thick = req.Patch.Thick
		}
		if req.Patch.Refraction >= 0 {
			updated.Refraction = req.Patch.Refraction
		}
		if req.Patch.Duration > 0 {
			updated.Duration = req.Patch.Duration
		}
		if req.Patch.Delay >= 0 {
			updated.Delay = req.Patch.Delay
		}
		if req.Patch.EndDelay >= 0 {
			updated.EndDelay = req.Patch.EndDelay
		}
		if req.Patch.X != 0 || req.Patch.Y != 0 {
			updated.X = req.Patch.X
			updated.Y = req.Patch.Y
		}

		activeScene.UpdateRipple(updated)
		return json.Marshal(map[string]any{
			"ripple":   updated,
			"revision": activeScene.Revision(),
		})

	case "Ripple.Delete":
		var req RippleDeleteRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding RippleDeleteRequest: %w", err)
		}
		deleted := activeScene.RemoveRipple(req.ID)
		return json.Marshal(map[string]any{
			"deleted":  deleted,
			"revision": activeScene.Revision(),
		})

	case "Ripple.Get":
		var req struct {
			ID scene.StringID `json:"id"`
		}
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding Ripple.Get request: %w", err)
		}
		ripple := activeScene.GetRipple(req.ID)
		return json.Marshal(ripple)

	case "Ripple.GetAll":
		ripples := activeScene.GetAllRipples()
		return json.Marshal(ripples)

	case "Ripple.FindAt":
		var req RippleFindAtRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding RippleFindAtRequest: %w", err)
		}
		found := activeScene.FindRippleAt(req.XPct, req.YPct, req.CanvasW, req.CanvasH)
		return json.Marshal(found)

	case "Ripple.GetBounds":
		var req RippleGetBoundsRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding RippleGetBoundsRequest: %w", err)
		}
		ripple := activeScene.GetRipple(req.ID)
		if ripple == nil {
			return nil, fmt.Errorf("ripple %q not found", req.ID)
		}
		bounds, center := activeScene.GetRippleBounds(*ripple, req.CanvasW, req.CanvasH)
		return json.Marshal(map[string]any{
			"ripple": ripple,
			"bounds": bounds,
			"center": center,
		})

	case "Ripple.Describe":
		var req RippleDescribeRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding RippleDescribeRequest: %w", err)
		}
		ripple := activeScene.GetRipple(req.ID)
		if ripple == nil {
			return nil, fmt.Errorf("ripple %q not found", req.ID)
		}
		desc := activeScene.DescribeRipple(*ripple, req.CanvasW, req.CanvasH)
		return json.Marshal(desc)

	case "Camera.Get":
		return json.Marshal(activeScene.GetCamera())

	case "Camera.Update":
		var req CameraUpdateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding CameraUpdateRequest: %w", err)
		}
		if err := scene.ValidateCamera(&req.Camera); err != nil {
			return nil, fmt.Errorf("validating camera: %w", err)
		}
		activeScene.UpdateCamera(req.Camera)
		return json.Marshal(map[string]any{
			"camera":   activeScene.GetCamera(),
			"revision": activeScene.Revision(),
		})

	case "Camera.Evaluate":
		var req CameraEvaluateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding CameraEvaluateRequest: %w", err)
		}
		cam := activeScene.GetCamera()
		if req.Camera != nil {
			cam = *req.Camera
		}
		tx, ty, scale, roll, transformStr, stage3dTransform := scene.EvaluateCameraAtTime(cam, req.Time, req.CanvasW, req.CanvasH, nil)
		return json.Marshal(map[string]any{
			"translateX":       tx,
			"translateY":       ty,
			"scale":            scale,
			"roll":             roll,
			"transform":        transformStr,
			"stage3dTransform": stage3dTransform,
		})

	case "Optics.Get":
		return json.Marshal(activeScene.GetOptical())

	case "Optics.Update":
		var req OpticsUpdateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding OpticsUpdateRequest: %w", err)
		}
		if err := scene.ValidateOptical(&req.Optical); err != nil {
			return nil, fmt.Errorf("validating optics: %w", err)
		}
		activeScene.UpdateOptical(req.Optical)
		return json.Marshal(map[string]any{
			"optical":  activeScene.GetOptical(),
			"revision": activeScene.Revision(),
		})

	case "Optics.Evaluate":
		var req OpticsEvaluateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding OpticsEvaluateRequest: %w", err)
		}
		opt := activeScene.GetOptical()
		if req.Optical != nil {
			opt = *req.Optical
		}
		blur, filterAttr, defs, isActive := scene.EvaluateOpticalAtTime(opt, req.Time, req.CamDuration, req.CamLoop, nil)
		return json.Marshal(map[string]any{
			"blur":       blur,
			"filterAttr": filterAttr,
			"defs":       defs,
			"isActive":   isActive,
		})

	case "Frame.Get":
		return json.Marshal(activeScene.GetFrame())

	case "Frame.Update":
		var req FrameUpdateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding FrameUpdateRequest: %w", err)
		}
		if err := scene.ValidateFrame(&req.Frame); err != nil {
			return nil, fmt.Errorf("validating frame: %w", err)
		}
		activeScene.UpdateFrame(req.Frame)
		return json.Marshal(map[string]any{
			"frame":    activeScene.GetFrame(),
			"revision": activeScene.Revision(),
		})

	case "Frame.Describe":
		var req FrameDescribeRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding FrameDescribeRequest: %w", err)
		}
		f := activeScene.GetFrame()
		if req.Frame != nil {
			f = *req.Frame
		}
		defs, markup := scene.BuildFrameMarkup(f, req.CanvasW, req.CanvasH)
		return json.Marshal(map[string]any{
			"defs":    defs,
			"markup":  markup,
			"enabled": f.Enabled,
		})

	case "Selection.Get":
		sel := activeScene.GetSelection()
		return json.Marshal(SelectionResponse{
			Type:    string(sel.Type),
			ID:      sel.ID,
			Items:   sel.Items,
			Count:   len(sel.Items),
			Success: true,
		})

	case "Selection.Set":
		var req SelectionSetRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding SelectionSetRequest: %w", err)
		}
		var sel scene.SelectionState
		var err error
		if len(req.Items) > 0 {
			var primary *scene.SelectionItem
			if req.Type != "" && req.ID != "" {
				primary = &scene.SelectionItem{Type: scene.SelectionType(req.Type), ID: req.ID}
			}
			sel, err = activeScene.SetMultiSelection(req.Items, primary)
		} else {
			sel, err = activeScene.SetSelection(scene.SelectionType(req.Type), req.ID)
		}
		if err != nil {
			return json.Marshal(SelectionResponse{
				Type:    string(sel.Type),
				ID:      sel.ID,
				Items:   sel.Items,
				Count:   len(sel.Items),
				Success: false,
				Error:   err.Error(),
			})
		}
		return json.Marshal(SelectionResponse{
			Type:    string(sel.Type),
			ID:      sel.ID,
			Items:   sel.Items,
			Count:   len(sel.Items),
			Success: true,
		})

	case "Selection.Add":
		var req SelectionSetRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding SelectionSetRequest: %w", err)
		}
		sel, err := activeScene.AddToSelection(scene.SelectionItem{Type: scene.SelectionType(req.Type), ID: req.ID})
		if err != nil {
			return json.Marshal(SelectionResponse{
				Type:    string(sel.Type),
				ID:      sel.ID,
				Items:   sel.Items,
				Count:   len(sel.Items),
				Success: false,
				Error:   err.Error(),
			})
		}
		return json.Marshal(SelectionResponse{
			Type:    string(sel.Type),
			ID:      sel.ID,
			Items:   sel.Items,
			Count:   len(sel.Items),
			Success: true,
		})

	case "Selection.Toggle":
		var req SelectionSetRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding SelectionSetRequest: %w", err)
		}
		sel, err := activeScene.ToggleSelection(scene.SelectionItem{Type: scene.SelectionType(req.Type), ID: req.ID})
		if err != nil {
			return json.Marshal(SelectionResponse{
				Type:    string(sel.Type),
				ID:      sel.ID,
				Items:   sel.Items,
				Count:   len(sel.Items),
				Success: false,
				Error:   err.Error(),
			})
		}
		return json.Marshal(SelectionResponse{
			Type:    string(sel.Type),
			ID:      sel.ID,
			Items:   sel.Items,
			Count:   len(sel.Items),
			Success: true,
		})

	case "Selection.Remove":
		var req SelectionSetRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding SelectionSetRequest: %w", err)
		}
		sel, err := activeScene.RemoveFromSelection(scene.SelectionItem{Type: scene.SelectionType(req.Type), ID: req.ID})
		if err != nil {
			return json.Marshal(SelectionResponse{
				Type:    string(sel.Type),
				ID:      sel.ID,
				Items:   sel.Items,
				Count:   len(sel.Items),
				Success: false,
				Error:   err.Error(),
			})
		}
		return json.Marshal(SelectionResponse{
			Type:    string(sel.Type),
			ID:      sel.ID,
			Items:   sel.Items,
			Count:   len(sel.Items),
			Success: true,
		})

	case "Selection.Clear":
		sel := activeScene.ClearSelection()
		return json.Marshal(SelectionResponse{
			Type:    string(sel.Type),
			ID:      sel.ID,
			Items:   sel.Items,
			Count:   0,
			Success: true,
		})

	case "History.Record":
		var req HistoryRecordRequest
		if len(payloadJSON) > 0 && string(payloadJSON) != "{}" && string(payloadJSON) != "null" {
			_ = json.Unmarshal(payloadJSON, &req)
		}
		snap := activeScene.GetSnapshot()
		if req.Snapshot != nil {
			snap = *req.Snapshot
		}
		sel := activeScene.GetSelection()
		if req.Selection != nil {
			sel = *req.Selection
		}
		rec := activeScene.History().Record(snap, sel)
		uCount, rCount, canUndo, canRedo := activeScene.History().GetState()
		return json.Marshal(HistoryStateResponse{
			UndoCount: uCount,
			RedoCount: rCount,
			CanUndo:   canUndo,
			CanRedo:   canRedo,
			Recorded:  rec,
		})

	case "History.Undo":
		entry, err := activeScene.UndoHistory()
		uCount, rCount, canUndo, canRedo := activeScene.History().GetState()
		if err != nil {
			return json.Marshal(HistoryRestoreResponse{
				Success:   false,
				Error:     err.Error(),
				UndoCount: uCount,
				RedoCount: rCount,
				CanUndo:   canUndo,
				CanRedo:   canRedo,
			})
		}
		snapCopy := entry.Snapshot
		selCopy := entry.Selection
		return json.Marshal(HistoryRestoreResponse{
			Success:   true,
			Snapshot:  &snapCopy,
			Selection: &selCopy,
			UndoCount: uCount,
			RedoCount: rCount,
			CanUndo:   canUndo,
			CanRedo:   canRedo,
		})

	case "History.Redo":
		entry, err := activeScene.RedoHistory()
		uCount, rCount, canUndo, canRedo := activeScene.History().GetState()
		if err != nil {
			return json.Marshal(HistoryRestoreResponse{
				Success:   false,
				Error:     err.Error(),
				UndoCount: uCount,
				RedoCount: rCount,
				CanUndo:   canUndo,
				CanRedo:   canRedo,
			})
		}
		snapCopy := entry.Snapshot
		selCopy := entry.Selection
		return json.Marshal(HistoryRestoreResponse{
			Success:   true,
			Snapshot:  &snapCopy,
			Selection: &selCopy,
			UndoCount: uCount,
			RedoCount: rCount,
			CanUndo:   canUndo,
			CanRedo:   canRedo,
		})

	case "History.GetState":
		uCount, rCount, canUndo, canRedo := activeScene.History().GetState()
		return json.Marshal(HistoryStateResponse{
			UndoCount: uCount,
			RedoCount: rCount,
			CanUndo:   canUndo,
			CanRedo:   canRedo,
		})

	case "History.Clear":
		activeScene.History().Clear()
		uCount, rCount, canUndo, canRedo := activeScene.History().GetState()
		return json.Marshal(HistoryStateResponse{
			UndoCount: uCount,
			RedoCount: rCount,
			CanUndo:   canUndo,
			CanRedo:   canRedo,
		})

	case "Object.Rename":
		var req ObjectRenameRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding ObjectRenameRequest: %w", err)
		}
		ok, err := activeScene.RenameObject(scene.SelectionType(req.Type), req.ID, req.Name)
		if err != nil || !ok {
			return json.Marshal(ObjectRenameResponse{
				Type:    req.Type,
				ID:      req.ID,
				Name:    req.Name,
				Success: false,
			})
		}
		return json.Marshal(ObjectRenameResponse{
			Type:    req.Type,
			ID:      req.ID,
			Name:    req.Name,
			Success: true,
		})

	case "Project.EncodeSVA":
		var req EncodeSVARequest
		if len(payloadJSON) > 0 {
			_ = json.Unmarshal(payloadJSON, &req)
		}
		var proj *sva.Project
		var err error
		if len(req.State) > 0 && string(req.State) != "null" && string(req.State) != "{}" {
			proj, err = sva.BuildProjectFromStudioState(req.Name, req.Description, req.State)
		} else {
			snap := activeScene.GetSnapshot()
			snapBytes, _ := json.Marshal(snap)
			proj, err = sva.BuildProjectFromStudioState(req.Name, req.Description, snapBytes)
		}
		if err != nil {
			return json.Marshal(EncodeSVAResponse{Success: false, Error: err.Error()})
		}
		data, err := sva.Encode(proj)
		if err != nil {
			return json.Marshal(EncodeSVAResponse{Success: false, Error: err.Error()})
		}
		cleanName := strings.TrimSpace(req.Name)
		if cleanName == "" {
			cleanName = "project"
		}
		b64 := base64.StdEncoding.EncodeToString(data)
		return json.Marshal(EncodeSVAResponse{
			Success:    true,
			DataB64:    b64,
			Filename:   cleanName + ".sva",
			Size:       int64(len(data)),
			AssetCount: len(proj.Assets),
		})

	case "Project.DecodeSVA":
		var req DecodeSVARequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding DecodeSVARequest: %w", err)
		}
		svaBytes, err := base64.StdEncoding.DecodeString(req.DataB64)
		if err != nil {
			return json.Marshal(DecodeSVAResponse{Success: false, Error: "invalid base64: " + err.Error()})
		}
		proj, err := sva.Decode(svaBytes)
		if err != nil {
			return json.Marshal(DecodeSVAResponse{Success: false, Error: err.Error()})
		}
		// Apply scene to active Go engine scene
		activeScene.SetFromSnapshot(proj.Scene.ToSnapshot())
		activeScene.ClearSelection()
		activeScene.History().Clear()
		activeScene.History().Record(activeScene.GetSnapshot(), activeScene.GetSelection())

		stateBytes, err := sva.ExtractStudioState(proj)
		if err != nil {
			return json.Marshal(DecodeSVAResponse{Success: false, Error: "extracting studio state: " + err.Error()})
		}
		return json.Marshal(DecodeSVAResponse{
			Success:  true,
			Manifest: &proj.Manifest,
			State:    json.RawMessage(stateBytes),
		})

	case "Project.ValidateSVA":
		var req ValidateSVARequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding ValidateSVARequest: %w", err)
		}
		svaBytes, err := base64.StdEncoding.DecodeString(req.DataB64)
		if err != nil {
			return json.Marshal(ValidateSVAResponse{Success: false, Error: "invalid base64: " + err.Error()})
		}
		manifest, err := sva.Validate(svaBytes)
		if err != nil {
			return json.Marshal(ValidateSVAResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(ValidateSVAResponse{
			Success:  true,
			Manifest: manifest,
		})

	case "Group.Create":
		var req GroupCreateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding GroupCreateRequest: %w", err)
		}
		grp, err := activeScene.CreateGroup(req.Name, req.Members)
		if err != nil {
			return json.Marshal(GroupCreateResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(GroupCreateResponse{Success: true, Group: grp})

	case "Group.Ungroup":
		var req GroupUngroupRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding GroupUngroupRequest: %w", err)
		}
		members, err := activeScene.Ungroup(req.GroupID)
		if err != nil {
			return json.Marshal(GroupUngroupResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(GroupUngroupResponse{Success: true, Members: members})

	case "Group.RemoveMembers":
		var req GroupRemoveMembersRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding GroupRemoveMembersRequest: %w", err)
		}
		remGrp, dissolved, err := activeScene.RemoveGroupMembers(req.GroupID, req.Members)
		if err != nil {
			return json.Marshal(GroupRemoveMembersResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(GroupRemoveMembersResponse{Success: true, Dissolved: dissolved, Group: remGrp})

	case "Group.Delete":
		var req GroupDeleteRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding GroupDeleteRequest: %w", err)
		}
		if err := activeScene.DeleteGroup(req.GroupID, req.DeleteMembers); err != nil {
			return json.Marshal(GroupDeleteResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(GroupDeleteResponse{Success: true})

	case "Group.Rename":
		var req GroupRenameRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding GroupRenameRequest: %w", err)
		}
		grp, err := activeScene.RenameGroup(req.GroupID, req.Name)
		if err != nil {
			return json.Marshal(GroupRenameResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(GroupRenameResponse{Success: true, Group: grp})

	case "Group.Get":
		var req GroupGetRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding GroupGetRequest: %w", err)
		}
		grp, exists := activeScene.GetGroup(req.GroupID)
		return json.Marshal(GroupGetResponse{Found: exists, Group: grp})

	case "Group.List":
		grps := activeScene.GetAllGroups()
		return json.Marshal(GroupListResponse{
			Groups:        grps,
			Count:         len(grps),
			GroupsCounter: activeScene.GroupsCounter(),
		})

	case "Group.Move":
		var req GroupMoveRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding GroupMoveRequest: %w", err)
		}
		if err := activeScene.MoveGroup(req.GroupID, req.DX, req.DY); err != nil {
			return json.Marshal(GroupMoveResponse{Success: false, Error: err.Error()})
		}
		snap := activeScene.GetSnapshot()
		return json.Marshal(GroupMoveResponse{Success: true, Snapshot: &snap})

	case "Group.FindByMember":
		var req GroupFindMemberRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding GroupFindMemberRequest: %w", err)
		}
		grp, found := activeScene.FindGroupByMember(req.Type, req.ID)
		return json.Marshal(GroupFindMemberResponse{Found: found, Group: grp})

	case "Group.Bounds":
		var req GroupBoundsRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding GroupBoundsRequest: %w", err)
		}
		minX, minY, maxX, maxY, err := activeScene.ComputeGroupBounds(req.GroupID, req.CanvasW, req.CanvasH)
		if err != nil {
			return json.Marshal(GroupBoundsResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(GroupBoundsResponse{
			Success: true,
			MinX:    minX,
			MinY:    minY,
			MaxX:    maxX,
			MaxY:    maxY,
		})

	case "Scene.Copy":
		var req SceneCopyRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding SceneCopyRequest: %w", err)
		}
		payload, err := activeScene.CopySelection(req.Items, req.GroupID)
		if err != nil {
			return json.Marshal(SceneCopyResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(SceneCopyResponse{Success: true, Payload: payload})

	case "Scene.Paste":
		var req ScenePasteRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding ScenePasteRequest: %w", err)
		}
		newItems, newGrpID, err := activeScene.PastePayload(req.Payload, req.OffsetX, req.OffsetY)
		if err != nil {
			return json.Marshal(ScenePasteResponse{Success: false, Error: err.Error()})
		}
		snap := activeScene.GetSnapshot()
		return json.Marshal(ScenePasteResponse{Success: true, NewItems: newItems, NewGroupID: newGrpID, Snapshot: &snap})

	case "Scene.Duplicate":
		var req SceneDuplicateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding SceneDuplicateRequest: %w", err)
		}
		newItems, newGrpID, err := activeScene.DuplicateSelection(req.Items, req.GroupID, req.OffsetX, req.OffsetY)
		if err != nil {
			return json.Marshal(SceneDuplicateResponse{Success: false, Error: err.Error()})
		}
		snap := activeScene.GetSnapshot()
		return json.Marshal(SceneDuplicateResponse{Success: true, NewItems: newItems, NewGroupID: newGrpID, Snapshot: &snap})

	case "Image.Create":
		var req ImageCreateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding ImageCreateRequest: %w", err)
		}
		img, err := activeScene.CreateImage(req.Image)
		if err != nil {
			return json.Marshal(ImageCreateResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(ImageCreateResponse{Success: true, Image: img})

	case "Image.Update":
		var req ImageUpdateRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding ImageUpdateRequest: %w", err)
		}
		img, err := activeScene.UpdateImage(req.ID, req.Patch)
		if err != nil {
			return json.Marshal(ImageUpdateResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(ImageUpdateResponse{Success: true, Image: img})

	case "Image.Delete":
		var req ImageDeleteRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding ImageDeleteRequest: %w", err)
		}
		if err := activeScene.DeleteImage(req.ID); err != nil {
			return json.Marshal(ImageDeleteResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(ImageDeleteResponse{Success: true})

	case "Image.Get":
		var req ImageGetRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding ImageGetRequest: %w", err)
		}
		img, exists := activeScene.GetImage(req.ID)
		return json.Marshal(ImageGetResponse{Found: exists, Image: img})

	case "Image.List":
		images := activeScene.GetAllImages()
		return json.Marshal(ImageListResponse{
			Images:        images,
			Count:         len(images),
			ImagesCounter: activeScene.ImagesCounter(),
		})

	case "Image.Crop":
		var req ImageCropRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding ImageCropRequest: %w", err)
		}
		img, err := activeScene.SetImageCrop(req.ID, req.Crop, req.NewX, req.NewY, req.NewW, req.NewH)
		if err != nil {
			return json.Marshal(ImageCropResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(ImageCropResponse{Success: true, Image: img})

	case "Image.ResetCrop":
		var req ImageResetCropRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding ImageResetCropRequest: %w", err)
		}
		img, err := activeScene.ResetImageCrop(req.ID)
		if err != nil {
			return json.Marshal(ImageResetCropResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(ImageResetCropResponse{Success: true, Image: img})

	case "Image.Clip":
		var req ImageClipRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding ImageClipRequest: %w", err)
		}
		img, err := activeScene.SetImageClip(req.ID, req.Clip)
		if err != nil {
			return json.Marshal(ImageClipResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(ImageClipResponse{Success: true, Image: img})

	case "Image.ResetClip":
		var req ImageResetClipRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding ImageResetClipRequest: %w", err)
		}
		img, err := activeScene.ResetImageClip(req.ID)
		if err != nil {
			return json.Marshal(ImageResetClipResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(ImageResetClipResponse{Success: true, Image: img})

	case "Layer.Get":
		layers := activeScene.GetLayers()
		return json.Marshal(LayerGetResponse{
			Layers: layers,
			Count:  len(layers),
		})

	case "Layer.Set":
		var req LayerSetRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding LayerSetRequest: %w", err)
		}
		if err := activeScene.SetLayers(req.Layers); err != nil {
			return json.Marshal(LayerSetResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(LayerSetResponse{Success: true})

	case "Layer.BringToFront":
		var req LayerReorderRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding LayerReorderRequest: %w", err)
		}
		changed, err := activeScene.BringToFront(req.Targets)
		if err != nil {
			return json.Marshal(LayerReorderResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(LayerReorderResponse{Success: true, Changed: changed, Layers: activeScene.GetLayers()})

	case "Layer.SendToBack":
		var req LayerReorderRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding LayerReorderRequest: %w", err)
		}
		changed, err := activeScene.SendToBack(req.Targets)
		if err != nil {
			return json.Marshal(LayerReorderResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(LayerReorderResponse{Success: true, Changed: changed, Layers: activeScene.GetLayers()})

	case "Layer.BringForward":
		var req LayerReorderRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding LayerReorderRequest: %w", err)
		}
		changed, err := activeScene.BringForward(req.Targets)
		if err != nil {
			return json.Marshal(LayerReorderResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(LayerReorderResponse{Success: true, Changed: changed, Layers: activeScene.GetLayers()})

	case "Layer.SendBackward":
		var req LayerReorderRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding LayerReorderRequest: %w", err)
		}
		changed, err := activeScene.SendBackward(req.Targets)
		if err != nil {
			return json.Marshal(LayerReorderResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(LayerReorderResponse{Success: true, Changed: changed, Layers: activeScene.GetLayers()})

	case "Layer.SetVisibility":
		var req LayerVisibilityRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding LayerVisibilityRequest: %w", err)
		}
		if err := activeScene.SetObjectVisibility(req.Type, req.ID, req.Visible); err != nil {
			return json.Marshal(LayerVisibilityResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(LayerVisibilityResponse{Success: true})

	case "Layer.SetLocked":
		var req LayerLockedRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding LayerLockedRequest: %w", err)
		}
		if err := activeScene.SetObjectLocked(req.Type, req.ID, req.Locked); err != nil {
			return json.Marshal(LayerLockedResponse{Success: false, Error: err.Error()})
		}
		return json.Marshal(LayerLockedResponse{Success: true})

	case "Layer.GetEffective":
		var req LayerEffectiveRequest
		if err := json.Unmarshal(payloadJSON, &req); err != nil {
			return nil, fmt.Errorf("decoding LayerEffectiveRequest: %w", err)
		}
		vis := activeScene.GetEffectiveVisibility(req.Type, req.ID)
		locked := activeScene.GetEffectiveLocked(req.Type, req.ID)
		return json.Marshal(LayerEffectiveResponse{Visible: vis, Locked: locked})

	default:
		return nil, errors.New("unknown engine command: " + command)
	}
}
