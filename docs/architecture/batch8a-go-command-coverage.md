# SVG Animator Studio — Go WASM Protocol Command Coverage & Authority Analysis

**Document Identifier:** `DOC-ARCH-BATCH8A-CMD-COVERAGE`  
**Audit Batch:** Batch 8A (Post-Carbon Remediation)  
**Status:** COMPLETE / CANONICAL AUDIT EVIDENCE  
**Repository Baseline Commit:** `61ca201e42d9f4672aca75f9f8f42e3c02ddb073`  
**Generated Date:** 2026-11-12  

---

## 1. Executive Summary

This report provides a complete, evidence-based verification of all commands exposed by the authoritative Go engine protocol (`pkg/engine/protocol/commands.go`).

- **Total Go Protocol Commands:** 117
- **Commands Dispatched by JavaScript Bridge (`engine-bridge.js`):** 113 (96.6%)
- **Orphaned / Uncalled Go Commands:** 4 (3.4%)
- **Automated Test Coverage:** 102 / 117 commands verified in `commands_test.go`

### Key Observations

1. **High Protocol Breadth:** The Go engine implements 117 discrete protocol operations covering 20 architectural domains, including full CRUD for all primitives, group transformations, multi-level locking, undo/redo history, SVA package packaging, and camera/optics transforms.
2. **Orphaned Commands Identified:** 4 Go commands (`Scene.UpdateFlow`, `Scene.RemoveFlow`, `Node.Get`, `Image.CropVersionCreate`) are defined in Go protocol but never dispatched from JavaScript, representing either deprecated legacy paths or missing presentation integrations.
3. **Unchecked Return Envelopes in Presentation Layer:** While Go returns structured JSON envelopes with `success: bool`, `error: string`, and `revision: uint64`, several critical JavaScript presentation methods (e.g. `AppCoordinator.moveSelectedNodes` and `app.js:commitCurrentCrop`) discard or fail to check the return status, producing false-success states (Violation `A8A-004`).
4. **Whole-Scene vs Granular Mutation Risk:** `Scene.SetState` replaces the entire scene in one command, but `engine-bridge.js:syncScene()` constructs the payload by scraping 9 separate in-memory JS arrays and DOM elements, introducing severe risk of clobbering Go state (Violation `A8A-005`).

---

## 2. Command Coverage Matrix by Architectural Domain

### Engine Lifecycle & Diagnostics (1 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Engine.Ping` | L1146 | *None (Direct)* | `ping` (L201) | `TestDispatchPing` | N/A |

### Geometry & Coordinate Math (2 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Geometry.GenerateFlowPath` | L1155 | *None (Direct)* | `generateFlowPath` (L205), `getFlowMidpoint` (L217) | `TestDispatchGenerateFlowPath` | N/A |
| `Geometry.ComputeSnappedPosition` | L1167 | *None (Direct)* | `computeSnappedPosition` (L229) | `TestDispatchComputeSnappedPosition` | N/A |

### Scene Lifecycle & State Snapshots (7 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Scene.SetState` | L1177 | SetFromSnapshot, Reset, History, GetSelection, GetSnapshot, Revision | `syncScene` (L2511) | `TestDispatchSceneAndTimelineEvaluation`, `TestDispatchNumericSceneSetState`, `TestTimelineEvaluateReadOnlyIsolation`, `TestSafePartialUpdatesAndCommandContracts` | N/A |
| `Scene.GetState` | L1220 | GetSnapshot | `getSceneState` (L2032) | `TestTimelineEvaluateReadOnlyIsolation` | N/A |
| `Scene.UpdateFlow` | L1224 | Revision, UpdateFlow | **ORPHANED (Uncalled)** | *Needs dedicated test* | N/A |
| `Scene.RemoveFlow` | L1232 | RemoveFlow, Revision | **ORPHANED (Uncalled)** | *Needs dedicated test* | N/A |
| `Scene.Copy` | L2790 | CopySelection | `copySelection` (L1378) | `TestDispatchGroupAndClipboardCommands` | N/A |
| `Scene.Paste` | L2801 | GetSnapshot, PastePayload | `pastePayload` (L1392) | `TestDispatchGroupAndClipboardCommands` | N/A |
| `Scene.Duplicate` | L2813 | GetSnapshot, DuplicateSelection | `duplicateSelection` (L1409) | `TestDispatchGroupAndClipboardCommands` | N/A |

### Timeline & Scene Evaluation (2 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Timeline.EvaluateSceneAtTime` | L1242 | *None (Direct)* | `if` (L2537) | `TestDispatchSceneAndTimelineEvaluation`, `TestTimelineEvaluateReadOnlyIsolation` | N/A |
| `Timeline.EvaluateBatch` | L1255 | *None (Direct)* | `if` (L2561) | `TestTimelineEvaluateReadOnlyIsolation` | N/A |

### Shape Catalog & Preset Geometry (2 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Shape.GetCatalog` | L1271 | *None (Direct)* | `getShapeCatalog` (L244) | `TestDispatchShapePresetAndNodeCommands` | N/A |
| `Shape.Describe` | L1275 | *None (Direct)* | `describeShape` (L254) | `TestDispatchShapePresetAndNodeCommands` | N/A |

### General / Uncategorized (7 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Preset.GetDefaults` | L1283 | *None (Direct)* | `getDefaultPreset` (L297) | `TestDispatchShapePresetAndNodeCommands` | N/A |
| `Preset.Apply` | L1287 | *None (Direct)* | `applyPreset` (L307) | `TestDispatchShapePresetAndNodeCommands` | N/A |
| `Preset.Extract` | L1298 | *None (Direct)* | `extractPreset` (L324) | *Needs dedicated test* | N/A |
| `Object.Rename` | L2575 | RenameObject | `renameObject` (L873) | `TestDispatchAllObjectTypesRenameAndClear`, `TestDispatchObjectRenameCommands` | N/A |
| `Project.EncodeSVA` | L2596 | GetSnapshot | `encodeSVA` (L2040) | `TestDispatchSVACommands` | N/A |
| `Project.DecodeSVA` | L2632 | SetFromSnapshot, ClearSelection, History, GetSelection, GetSnapshot | `decodeSVA` (L2052) | `TestDispatchSVACommands` | N/A |
| `Project.ValidateSVA` | L2661 | *None (Direct)* | `validateSVA` (L2062) | `TestDispatchSVACommands` | N/A |

### Diagram Nodes (6 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Node.Create` | L1306 | Revision, CreateNode | `createNode` (L337) | `TestDispatchGroupAndClipboardCommands`, `TestSafePartialUpdatesAndCommandContracts`, `TestDispatchSelectionCommands`, `TestDispatchSVACommands`, `TestDispatchObjectRenameCommands`, `TestDispatchHistoryCommands`, `TestDispatchShapePresetAndNodeCommands` | N/A |
| `Node.Update` | L1317 | UpdateNode, RenameObject, GetNode, Revision | `updateNode` (L349) | `TestSafePartialUpdatesAndCommandContracts`, `TestDispatchShapePresetAndNodeCommands` | Yes |
| `Node.Delete` | L1417 | RemoveNode, Revision | `deleteNode` (L360) | `TestDispatchShapePresetAndNodeCommands` | N/A |
| `Node.Get` | L1428 | GetNode | **ORPHANED (Uncalled)** | `TestDispatchObjectRenameCommands` | N/A |
| `Node.FindAt` | L1438 | FindNodeAt | `findNodeAt` (L380) | `TestDispatchShapePresetAndNodeCommands` | N/A |
| `Node.GetBounds` | L1446 | DistributeNodes, AlignNodes, GetNodeEffectiveProps, GetAllFlows, MoveNodes, GetNode | `getNodeBounds` (L368) | `TestDispatchShapePresetAndNodeCommands` | N/A |

### Flow Connectors (14 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Flow.Create` | L1539 | Revision, CreateFlow | `createFlow` (L393) | `TestDispatchAllObjectTypesRenameAndClear`, `TestDispatchSelectionCommands`, `TestDispatchFlowLifecycleAndOperations`, `TestSafePartialUpdatesAndCommandContracts` | N/A |
| `Flow.Update` | L1550 | RenameObject, UpdateFlow, GetFlow, Revision | `updateFlow` (L403) | `TestDispatchFlowLifecycleAndOperations`, `TestSafePartialUpdatesAndCommandContracts` | Yes |
| `Flow.Delete` | L1659 | RemoveFlow, Revision | `deleteFlow` (L414) | `TestDispatchFlowLifecycleAndOperations` | N/A |
| `Flow.Get` | L1670 | GetFlow | `getFlow` (L422) | `TestDispatchAllObjectTypesRenameAndClear`, `TestDispatchFlowLifecycleAndOperations` | N/A |
| `Flow.GetAll` | L1680 | GetAllFlows | `getAllFlows` (L430) | `TestDispatchFlowLifecycleAndOperations` | N/A |
| `Flow.FindAt` | L1684 | FindFlowAt | `findFlowAt` (L438) | `TestDispatchFlowLifecycleAndOperations` | N/A |
| `Flow.GetBounds` | L1692 | GetFlowBounds, GetFlow | `getFlowBounds` (L451) | `TestDispatchFlowLifecycleAndOperations` | N/A |
| `Flow.AddWaypoint` | L1708 | Revision, AddWaypoint | `if` (L466) | `TestDispatchFlowLifecycleAndOperations` | N/A |
| `Flow.RemoveWaypoint` | L1721 | RemoveWaypoint, Revision | `removeFlowWaypoint` (L476) | `TestDispatchFlowLifecycleAndOperations` | N/A |
| `Flow.UpdateWaypoint` | L1734 | Revision, UpdateWaypoint | `updateFlowWaypoint` (L487) | `TestDispatchFlowLifecycleAndOperations` | N/A |
| `Flow.AttachToNode` | L1746 | AttachFlowToNode, Revision | `attachFlowToNode` (L500) | *Needs dedicated test* | N/A |
| `Flow.DetachFromNode` | L1757 | Revision, DetachFlowFromNode | `detachFlowFromNode` (L512) | *Needs dedicated test* | N/A |
| `Flow.RecalculateConnections` | L1768 | Revision, RecalculateNodeConnections | `recalculateFlowConnections` (L523) | *Needs dedicated test* | N/A |
| `Flow.Describe` | L1778 | *None (Direct)* | `describeFlow` (L533) | `TestDispatchFlowLifecycleAndOperations` | N/A |

### Glow Effects (8 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Glow.Create` | L1786 | CreateGlow, Revision | `createGlow` (L551) | `TestDispatchAllObjectTypesRenameAndClear`, `TestDispatchGlowLifecycleAndOperations`, `TestSafePartialUpdatesAndCommandContracts` | N/A |
| `Glow.Update` | L1797 | GetGlow, RenameObject, Revision, UpdateGlow | `updateGlow` (L587) | `TestDispatchGlowLifecycleAndOperations`, `TestSafePartialUpdatesAndCommandContracts` | Yes |
| `Glow.Delete` | L1905 | RemoveGlow, Revision | `deleteGlow` (L600) | `TestDispatchGlowLifecycleAndOperations` | N/A |
| `Glow.Get` | L1916 | GetGlow | `getGlow` (L608) | `TestDispatchGlowLifecycleAndOperations` | N/A |
| `Glow.GetAll` | L1926 | GetAllGlows | `getAllGlows` (L616) | *Needs dedicated test* | N/A |
| `Glow.FindAt` | L1930 | FindGlowAt | `findGlowAt` (L624) | `TestDispatchGlowLifecycleAndOperations` | N/A |
| `Glow.GetBounds` | L1938 | GetGlow, GetGlowBounds | `getGlowBounds` (L637) | `TestDispatchGlowLifecycleAndOperations` | N/A |
| `Glow.Describe` | L1954 | GetGlow, DescribeGlow | `describeGlow` (L649) | `TestDispatchGlowLifecycleAndOperations` | N/A |

### Ripple Effects (8 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Ripple.Create` | L1966 | CreateRipple, Revision | `createRipple` (L665) | `TestDispatchAllObjectTypesRenameAndClear`, `TestDispatchRippleLifecycleAndOperations`, `TestSafePartialUpdatesAndCommandContracts` | N/A |
| `Ripple.Update` | L1977 | RenameObject, UpdateRipple, GetRipple, Revision | `updateRipple` (L691) | `TestDispatchRippleLifecycleAndOperations`, `TestSafePartialUpdatesAndCommandContracts` | Yes |
| `Ripple.Delete` | L2055 | RemoveRipple, Revision | `deleteRipple` (L704) | `TestDispatchRippleLifecycleAndOperations` | N/A |
| `Ripple.Get` | L2066 | GetRipple | `getRipple` (L712) | `TestDispatchRippleLifecycleAndOperations` | N/A |
| `Ripple.GetAll` | L2076 | GetAllRipples | `getAllRipples` (L720) | *Needs dedicated test* | N/A |
| `Ripple.FindAt` | L2080 | FindRippleAt | `findRippleAt` (L728) | `TestDispatchRippleLifecycleAndOperations` | N/A |
| `Ripple.GetBounds` | L2088 | GetRipple, GetRippleBounds | `getRippleBounds` (L741) | `TestDispatchRippleLifecycleAndOperations` | N/A |
| `Ripple.Describe` | L2104 | DescribeRipple, GetRipple | `describeRipple` (L753) | `TestDispatchRippleLifecycleAndOperations` | N/A |

### Camera Transforms (3 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Camera.Get` | L2116 | GetCamera | `getCamera` (L777) | `TestDispatchCameraCommands` | N/A |
| `Camera.Update` | L2119 | GetCamera, UpdateCamera, Revision | `updateCamera` (L769) | `TestSafePartialUpdatesAndCommandContracts`, `TestDispatchCameraCommands` | N/A |
| `Camera.Evaluate` | L2186 | GetCamera | `if` (L792) | `TestDispatchCameraCommands` | N/A |

### Optics & Shaders (3 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Optics.Get` | L2205 | GetOptical | `getOptics` (L809) | `TestDispatchOpticsCommands` | N/A |
| `Optics.Update` | L2208 | GetOptical, UpdateOptical, Revision | `updateOptics` (L801) | `TestSafePartialUpdatesAndCommandContracts`, `TestDispatchOpticsCommands` | N/A |
| `Optics.Evaluate` | L2261 | GetOptical | `if` (L824) | `TestDispatchOpticsCommands` | N/A |

### Frame & Viewport Bounds (3 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Frame.Get` | L2278 | GetFrame | `getFrame` (L841) | `TestDispatchFrameCommands` | N/A |
| `Frame.Update` | L2281 | Revision, UpdateFrame, GetFrame | `updateFrame` (L833) | `TestDispatchFrameCommands`, `TestSafePartialUpdatesAndCommandContracts` | N/A |
| `Frame.Describe` | L2339 | GetFrame | `if` (L855) | `TestDispatchFrameCommands` | N/A |

### Selection Authority (6 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Selection.Get` | L2355 | GetSelection | `getSelection` (L885) | `TestDispatchSelectionCommands` | N/A |
| `Selection.Set` | L2365 | SetMultiSelection, SetSelection | `setSelection` (L893) | `TestDispatchSelectionCommands` | N/A |
| `Selection.Add` | L2399 | AddToSelection | `addToSelection` (L911) | `TestDispatchSelectionCommands` | N/A |
| `Selection.Toggle` | L2423 | ToggleSelection | `toggleSelection` (L922) | `TestDispatchSelectionCommands` | N/A |
| `Selection.Remove` | L2447 | RemoveFromSelection | `removeFromSelection` (L933) | *Needs dedicated test* | N/A |
| `Selection.Clear` | L2471 | ClearSelection | `clearSelection` (L944) | `TestDispatchSelectionCommands` | N/A |

### History & Undo/Redo (5 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `History.Record` | L2481 | GetSelection, GetSnapshot, History | `recordHistory` (L1976) | `TestDispatchHistoryCommands` | N/A |
| `History.Undo` | L2506 | UndoHistory, History | `undoHistory` (L1987) | `TestDispatchHistoryCommands` | N/A |
| `History.Redo` | L2531 | History, RedoHistory | `redoHistory` (L1995) | `TestDispatchHistoryCommands` | N/A |
| `History.GetState` | L2556 | History | `getHistoryState` (L2003) | `TestDispatchHistoryCommands` | N/A |
| `History.Clear` | L2565 | History | `clearHistory` (L2011) | `TestDispatchHistoryCommands` | N/A |

### Group Hierarchies (10 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Group.Create` | L2679 | CreateGroup | `createGroup` (L1098) | `TestDispatchGroupAndClipboardCommands` | N/A |
| `Group.Ungroup` | L2690 | Ungroup | `ungroup` (L1117) | `TestDispatchGroupAndClipboardCommands` | N/A |
| `Group.RemoveMembers` | L2701 | RemoveGroupMembers | `removeGroupMembers` (L1132) | `TestDispatchGroupAndClipboardCommands` | N/A |
| `Group.Delete` | L2712 | GetSnapshot, DeleteGroup | `deleteGroup` (L1156) | *Needs dedicated test* | N/A |
| `Group.Rename` | L2727 | RenameGroup | `renameGroup` (L1174) | `TestDispatchGroupAndClipboardCommands` | N/A |
| `Group.Get` | L2738 | GetGroup | `getGroup` (L1190) | `TestDispatchGroupAndClipboardCommands` | N/A |
| `Group.List` | L2746 | GetAllGroups, GroupsCounter | `listGroups` (L1201), `if` (L1217) | `TestDispatchGroupAndClipboardCommands` | N/A |
| `Group.Move` | L2754 | GetSnapshot, MoveGroup | `moveGroup` (L1334) | `TestDispatchGroupAndClipboardCommands` | N/A |
| `Group.FindByMember` | L2765 | FindGroupByMember | `findGroupByMember` (L1352) | `TestDispatchGroupAndClipboardCommands` | N/A |
| `Group.Bounds` | L2773 | ComputeGroupBounds | `getGroupBounds` (L1363) | `TestDispatchGroupAndClipboardCommands` | N/A |

### Image Objects & Bake (14 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Image.Create` | L2825 | CreateImage | `createImage` (L1427), `createImage` (L3399) | `TestImageCommitCropKeyMismatchProtocol`, `TestSafePartialUpdatesAndCommandContracts`, `TestDispatchImageAndLayerCommands` | N/A |
| `Image.Update` | L2836 | UpdateImagePatch | `updateImage` (L1448), `updateImage` (L3459) | `TestSafePartialUpdatesAndCommandContracts`, `TestDispatchImageAndLayerCommands` | N/A |
| `Image.Delete` | L2847 | DeleteImage | `deleteImage` (L1761), `deleteImage` (L3914) | `TestDispatchImageAndLayerCommands` | N/A |
| `Image.Get` | L2857 | GetImage | `getImage` (L1777) | `TestDispatchImageAndLayerCommands` | N/A |
| `Image.List` | L2865 | GetAllImages, ImagesCounter | `listImages` (L1786) | `TestDispatchImageAndLayerCommands` | N/A |
| `Image.Crop` | L2873 | CreateCropVersion, SetImageCrop | `if` (L1470), `cropImage` (L3502) | `TestImageCommitCropKeyMismatchProtocol`, `TestDispatchImageAndLayerCommands` | N/A |
| `Image.CropVersionCreate` | L2890 | CreateCropVersion | **ORPHANED (Uncalled)** | *Needs dedicated test* | N/A |
| `Image.CropVersionSelect` | L2901 | SelectCropVersion | `selectCropVersion` (L1489), `selectCropVersion` (L3611) | *Needs dedicated test* | N/A |
| `Image.CropVersionRename` | L2912 | RenameCropVersion | `renameCropVersion` (L1508), `renameCropVersion` (L3662) | *Needs dedicated test* | N/A |
| `Image.CropVersionDelete` | L2923 | DeleteCropVersion | `deleteCropVersion` (L1523), `deleteCropVersion` (L3689) | *Needs dedicated test* | N/A |
| `Image.CommitCrop` | L2934 | CommitCrop | `commitCrop` (L1542), `commitCrop` (L3722) | `TestImageCommitCropKeyMismatchProtocol` | N/A |
| `Image.ResetCrop` | L2964 | ResetImageCrop | `resetCrop` (L1573), `resetCrop` (L3815) | `TestDispatchImageAndLayerCommands` | N/A |
| `Image.Clip` | L2975 | SetImageClip | `clipImage` (L1592), `clipImage` (L3852) | `TestDispatchImageAndLayerCommands` | N/A |
| `Image.ResetClip` | L2986 | ResetImageClip | `resetClip` (L1617), `resetClip` (L3886) | `TestDispatchImageAndLayerCommands` | N/A |

### Layer Stack & Reordering (9 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Layer.Get` | L2997 | GetLayers | `getLayers` (L1796) | `TestDispatchImageAndLayerCommands` | N/A |
| `Layer.Set` | L3004 | SetLayers | `setLayers` (L1805) | *Needs dedicated test* | N/A |
| `Layer.BringToFront` | L3014 | GetLayers, BringToFront | `if` (L1887) | `TestLayerReorderProtocolPayloads`, `TestDispatchImageAndLayerCommands` | N/A |
| `Layer.SendToBack` | L3025 | GetLayers, SendToBack | `if` (L1904) | `TestLayerReorderProtocolPayloads` | N/A |
| `Layer.BringForward` | L3036 | BringForward, GetLayers | `if` (L1921) | `TestLayerReorderProtocolPayloads` | N/A |
| `Layer.SendBackward` | L3047 | GetLayers, SendBackward | `if` (L1938) | `TestLayerReorderProtocolPayloads` | N/A |
| `Layer.SetVisibility` | L3058 | SetObjectVisibility | `setLayerVisibility` (L1953) | `TestDispatchImageAndLayerCommands` | N/A |
| `Layer.SetLocked` | L3068 | SetObjectLocked | `setLayerLocked` (L1960) | `TestDispatchImageAndLayerCommands` | Yes |
| `Layer.GetEffective` | L3078 | GetEffectiveLocked, GetEffectiveVisibility | `getEffectiveLayer` (L1967), `getEffective` (L4365) | `TestDispatchImageAndLayerCommands` | Yes |

### Background & Crop Pipeline (7 commands)

| Command Name | Go Line | Go Scene Method | JS Bridge Wrapper | Tests in `commands_test.go` | Lock / Visibility Checked |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Background.Set` | L3087 | Revision, GetBackground, SetBackground | `setBackground` (L1636) | `TestBackgroundCropCommitProtocol`, `TestDispatchBackgroundCropLifecycle` | N/A |
| `Background.Get` | L3099 | CropBackground, GetBackground | `getBackground` (L1645) | `TestDispatchBackgroundCropLifecycle` | N/A |
| `Background.CropSelect` | L3117 | SelectBackgroundCropVersion | `selectBackgroundCropVersion` (L1669) | `TestDispatchBackgroundCropLifecycle` | N/A |
| `Background.CropRename` | L3128 | RenameBackgroundCropVersion | `renameBackgroundCropVersion` (L1682) | `TestDispatchBackgroundCropLifecycle` | N/A |
| `Background.CropDelete` | L3139 | DeleteBackgroundCropVersion | `deleteBackgroundCropVersion` (L1697) | `TestDispatchBackgroundCropLifecycle` | N/A |
| `Background.CropReset` | L3150 | ResetBackgroundCrop | `resetBackgroundCrop` (L1711) | `TestDispatchBackgroundCropLifecycle` | N/A |
| `Background.CropCommit` | L3157 | CommitBackgroundCrop | `commitBackgroundCrop` (L1723) | `TestBackgroundCropCommitProtocol` | N/A |

---

## 3. Deep Analysis of Protocol Anomalies & Authority Gaps

### 3.1 Orphaned Go Protocol Commands

The following 4 commands exist in `pkg/engine/protocol/commands.go` but are never dispatched by `engine-bridge.js`:

1. **`Scene.UpdateFlow` (L1224):** Legacy scene-level flow updater. JavaScript dispatches `Flow.Update` instead. `Scene.UpdateFlow` should be deprecated and removed in Batch 8B.
2. **`Scene.RemoveFlow` (L1232):** Legacy scene-level flow remover. JavaScript dispatches `Flow.Delete` instead. Should be deprecated and removed in Batch 8B.
3. **`Node.Get` (L1428):** Returns an individual node's JSON representation. JavaScript maintains local node lists and reads full snapshots (`Scene.GetState` / `Scene.GetSnapshot`), so individual node queries are bypassed.
4. **`Image.CropVersionCreate` (L2890):** Implemented in Go for creating non-destructive crop version branches. JavaScript currently uses `Image.Crop` and `Image.CommitCrop` directly; this command is currently unused in UI presentation.

### 3.2 JavaScript Operations Lacking Go Equivalents

Several critical state calculations occur purely in JavaScript without corresponding Go commands:

- **Dynamic Camera/Optics Synthesis from DOM (`scene-state.js:319`):** `SceneState.buildRenderState()` extracts camera pan, zoom, vignette, grain, and color adjustments directly from DOM form controls on every frame rather than querying Go `Camera.Get` or `Optics.Get`.
- **Fallback Shadow Timeline Evaluation (`engine-bridge.js:2550`):** `_evaluateSceneAtTimeJS()` duplicates 380 lines of Bezier easing, ping-pong oscillation, and time interpolation in JavaScript because `_sceneSynced` gates Go evaluation.
- **Local Object ID Pre-allocation (`nodes.js:34`):** Local `nodesCounter` and `flowsCounter` allocate IDs in JavaScript before sending `Create` commands to Go, creating potential ID collision risks.

### 3.3 Whole-Scene Mutation Risks (`Scene.SetState`)

`Scene.SetState` (L1177) performs a complete replacement of the active scene graph. In `engine-bridge.js:2511`, `syncScene()` calls `buildCurrentSceneSnapshot()` which scrapes 9 separate in-memory JS arrays and DOM states to build the replacement JSON. If any JS array is stale or mid-operation, `Scene.SetState` unconditionally overwrites the Go engine with corrupted data.

**Remediation:** Restrict `Scene.SetState` exclusively to project loading (`ProjectManager.loadProject`) and `.sva` archive extraction. All interactive operations must use granular typed commands (`Node.Create`, `Flow.Update`, etc.).

### 3.4 Missing Atomic Operations

Currently, complex operations such as **Bake Image to Background** require multiple consecutive commands:
1. `Background.Set` (sets the canvas background to the baked image)
2. `Image.Delete` (removes the baked foreground image)
3. `History.RecordSnapshot` (records history in Go)

If any step fails, the editor enters a split-brain state where the background is changed but the image remains, or the image is deleted without recording history. An atomic `Image.Bake` protocol command must be introduced in Batch 8B.

---

## 4. Remediation Prioritization

| Action | Target Command(s) | Remediation Batch | Target File(s) |
| :--- | :--- | :--- | :--- |
| Deprecate orphaned commands | `Scene.UpdateFlow`, `Scene.RemoveFlow` | Batch 8B | `pkg/engine/protocol/commands.go` |
| Enforce return envelope checks | `Nodes.MoveGroup`, `Group.Move`, `Image.CommitCrop` | Batch 8B | `coordinator.js`, `app.js` |
| Introduce atomic Bake command | `Image.Bake` | Batch 8B | `pkg/engine/protocol/commands.go`, `app.js` |
| Eliminate `syncScene` scraping | `Scene.SetState` | Batch 8B | `engine-bridge.js`, `projects.js` |
| Remove `_sceneSynced` evaluation bypass | `Timeline.EvaluateSceneAtTime` | Batch 8C | `engine-bridge.js` |
| Deprecate shadow fallback engines | `ImageObjects`, `ObjectGroups`, `LayerManager._fallbackReorder` | Batch 8C | `engine-bridge.js` |

