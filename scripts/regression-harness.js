#!/usr/bin/env node
/**
 * =============================================================================
 * SVG Animator Studio — Phase 1 Incremental JS Operational Regression Harness
 * =============================================================================
 * Executes the ACTUAL production JavaScript files in internal/web/static/js/
 * in their index.html load order across four incremental stages:
 *
 *   Stage 1 (REG-02a): Pure Operational Core (effects.js, scene-state.js, coordinator.js)
 *                      with zero DOM mocks (only global.window = global).
 *   Stage 2 (REG-02b): Viewport Math & Component CRUD (stage.js, presets.js,
 *                      nodes.js, flows.js, glows.js, ripples.js) with only a
 *                      no-op window.addEventListener stub for module load.
 *   Stage 3 (REG-03a): Selection Exclusivity, ControlStateAdaptor, HistoryManager
 *                      (maxDepth: 50), and ProjectManager (schema 1.2.0) using
 *                      control test doubles parsed from internal/web/static/index.html.
 *                      NOTE: Uses DOM control test doubles and no-op UI refresh stubs
 *                      (syncUIAfterHistoryRestore, openAccordionById, triggerAppRender);
 *                      this exercises operational state/history/serialization logic, not
 *                      live browser DOM layout or event handling.
 *   Stage 4 (REG-03b): SVG Layer Injection (injectIntoSVG / buildFullSVG) and
 *                      Export Payload Builders (still-export-modal.js, export-modal.js).
 *                      NOTE: AnimatedExportStudio.constructExportJobPayload calls
 *                      window.serializeSVGForExport, which in production uses browser-only
 *                      DOMParser/XMLSerializer (SceneState.serializeSVGForExport). In
 *                      Stage 4, a pass-through window.serializeSVGForExport stub is wired
 *                      solely to exercise constructExportJobPayload's browser-independent
 *                      payload construction; SceneState.serializeSVGForExport itself is
 *                      recorded as browser-dependent under REG-04.
 * =============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const REPO_ROOT = path.resolve(__dirname, '..');
const JS_DIR = path.join(REPO_ROOT, 'internal', 'web', 'static', 'js');
const INDEX_HTML_PATH = path.join(REPO_ROOT, 'internal', 'web', 'static', 'index.html');

function loadProductionScript(filename) {
  const fullPath = path.join(JS_DIR, filename);
  const code = fs.readFileSync(fullPath, 'utf8');
  vm.runInThisContext(code, { filename: fullPath });
}

function runHarness() {
  // ===========================================================================
  // STAGE 1: Pure Operational Core (Zero DOM Mock — only global.window = global)
  // ===========================================================================
  global.window = global;

  loadProductionScript('effects.js');
  loadProductionScript('scene-state.js');
  loadProductionScript('coordinator.js');

  assert.strictEqual(typeof window.Effects, 'object', 'window.Effects must exist');
  assert.strictEqual(typeof window.SceneState, 'object', 'window.SceneState must exist');
  assert.strictEqual(typeof window.ControlStateAdaptor, 'object', 'window.ControlStateAdaptor must exist');
  assert.strictEqual(typeof window.AppCoordinator, 'object', 'window.AppCoordinator must exist');

  // Verify SceneState control ownership & render state compilation
  window.SceneState.setControl('canvasWidthInput', '1600');
  window.SceneState.setControl('canvasHeightInput', '900');
  window.SceneState.setControl('cameraMotionSelect', 'ken-burns');
  window.SceneState.setControl('chkSnapToGrid', true);
  window.SceneState.setControl('snapGridSizeNum', '25');

  assert.strictEqual(window.SceneState.getNumControl('canvasWidthInput', 1280), 1600);
  assert.strictEqual(window.SceneState.getBoolControl('chkSnapToGrid', false), true);

  const snapCfg = window.SceneState.getSnapConfig();
  assert.strictEqual(snapCfg.enabled, true);
  assert.strictEqual(snapCfg.gridSizePx, 25);
  assert.strictEqual(snapCfg.canvasWidth, 1600);
  assert.strictEqual(snapCfg.canvasHeight, 900);

  const canvasDims = window.AppCoordinator.getCanvasDimensions();
  assert.strictEqual(canvasDims.width, 1600);
  assert.strictEqual(canvasDims.height, 900);

  const renderState = window.SceneState.buildRenderState();
  assert.ok(renderState && renderState.image, 'buildRenderState must return state.image');
  assert.strictEqual(renderState.image.width, 1600);
  assert.strictEqual(renderState.image.height, 900);
  assert.strictEqual(renderState.camera.motion, 'ken-burns');

  const baseSvg = window.Effects.build(renderState);
  assert.ok(
    baseSvg.includes('<svg') && baseSvg.includes('viewBox="0 0 1600 900"'),
    'Effects.build must produce valid 1600x900 SVG'
  );

  // ===========================================================================
  // STAGE 2: Viewport Math & Component Operational CRUD
  //          (Minimal no-op window.addEventListener so stage.js loads)
  // ===========================================================================
  window.addEventListener = function() {};

  loadProductionScript('stage.js');
  loadProductionScript('presets.js');
  loadProductionScript('nodes.js');
  loadProductionScript('flows.js');
  loadProductionScript('glows.js');
  loadProductionScript('ripples.js');

  // 2.1 Stage pure math (computeSnappedPosition, computeSnappedPct, computeFitScale, rectClientToPct)
  const snappedOn = window.Stage.computeSnappedPosition(3.7, 5.0, {
    enabled: true,
    gridSizePx: 25,
    canvasWidth: 1000,
    canvasHeight: 1000
  });
  assert.strictEqual(snappedOn.x, 5);
  assert.strictEqual(snappedOn.y, 5);

  const snappedOff = window.Stage.computeSnappedPosition(3.7, 5.0, { enabled: false });
  assert.strictEqual(snappedOff.x, 3.7);

  const snappedPctX = window.Stage.computeSnappedPct(3.7, 'x', {
    enabled: true,
    gridSizePx: 25,
    canvasWidth: 1000,
    canvasHeight: 1000
  });
  assert.strictEqual(snappedPctX, 5);

  const fitScale = window.Stage.computeFitScale(1000, 600, 1600, 900, 80);
  assert.ok(fitScale > 0 && fitScale < 1, 'computeFitScale must calculate positive scale');

  const clientPct = window.Stage.rectClientToPct(500, 300, { left: 100, top: 100, width: 800, height: 400 }, true);
  assert.strictEqual(clientPct.x, 50);
  assert.strictEqual(clientPct.y, 50);

  // 2.2 NodePresets operational API (setPresetParam, setAllEnabled, getState, setState, applyToNodeObject, extractFromNodeObject)
  window.NodePresets.setPresetParam('fillColor', '#112233', true);
  window.NodePresets.setPresetParam('width', 180, true);
  const presetState = window.NodePresets.getState();
  assert.strictEqual(presetState.preset.fillColor.enabled, true);
  assert.strictEqual(presetState.preset.fillColor.value, '#112233');
  assert.strictEqual(presetState.preset.width.enabled, true);
  assert.strictEqual(presetState.preset.width.value, 180);

  // 2.3 DiagramNodes CRUD & hit testing (actual properties: shape, text, subtext, x, y, width, height, fillColor, etc.)
  const node1 = window.DiagramNodes.createNode({ shape: 'rounded', x: 25, y: 30, text: 'Auth Service' });
  const node2 = window.DiagramNodes.createNode({ shape: 'cylinder', x: 75, y: 65, text: 'Primary DB', fillColor: '#224466', width: 160 });
  assert.strictEqual(window.DiagramNodes.getAllNodes().length, 2);
  assert.strictEqual(node1.fillColor, '#112233', 'Preset fillColor should apply to node1 when autoApplyToNewNodes is true');
  assert.strictEqual(node1.width, 180, 'Preset width should apply to node1');
  assert.strictEqual(node2.fillColor, '#224466', 'Explicit initialProps.fillColor on node2 overrides preset');

  window.DiagramNodes.updateNode(node1.id, { text: 'OAuth2 Service', width: 200, height: 90 });
  assert.strictEqual(window.DiagramNodes.getNode(node1.id).text, 'OAuth2 Service');
  assert.strictEqual(window.DiagramNodes.getNode(node1.id).width, 200);
  assert.strictEqual(window.DiagramNodes.getNode(node1.id).height, 90);

  const hit = window.DiagramNodes.findNodeAtPct(25, 30, 1600, 900);
  assert.ok(hit && hit.id === node1.id, 'findNodeAtPct must locate node1 at (25%, 30%)');

  // Verify NodePresets.applyToNodeObject and extractFromNodeObject
  window.NodePresets.extractFromNodeObject(node2);
  assert.strictEqual(window.NodePresets.getState().preset.fillColor.value, '#224466');
  window.NodePresets.setPresetParam('fillColor', '#112233', true);
  window.NodePresets.applyToNodeObject(node2);
  assert.strictEqual(window.DiagramNodes.getNode(node2.id).fillColor, '#112233');

  // 2.4 DataFlows CRUD, waypoints (nodes array), path generation, and midpoint calculation
  // Actual DataFlows properties: id, nodes ([{x,y}, ...]), type, route ('curve'|'ortho-hv'|'ortho-vh'|'ortho-mid'), label, curvature, etc.
  const flow1 = window.DataFlows.createFlow({
    nodes: [
      { x: 25, y: 30 },
      { x: 75, y: 65 }
    ],
    route: 'ortho-mid',
    label: 'TLS 1.3',
    curvature: 0.4
  });
  assert.strictEqual(window.DataFlows.getAllFlows().length, 1);
  assert.strictEqual(flow1.nodes.length, 2);

  const addedWp = window.DataFlows.addWaypoint(flow1.id, 50, 30);
  assert.ok(addedWp && addedWp.waypointIdx === 2, 'addWaypoint must append waypoint at index 2');
  assert.strictEqual(window.DataFlows.getFlow(flow1.id).nodes.length, 3);

  const updatedWp = window.DataFlows.updateWaypoint(flow1.id, 2, 55, 45);
  assert.strictEqual(updatedWp.x, 55);
  assert.strictEqual(updatedWp.y, 45);

  const curvePath = window.DataFlows.generatePathString(
    window.DataFlows.getFlow(flow1.id).nodes,
    0.4,
    1600,
    900,
    'curve'
  );
  assert.ok(curvePath && curvePath.startsWith('M '), 'generatePathString(curve) must return valid SVG path');

  const orthoPath = window.DataFlows.generatePathString(
    window.DataFlows.getFlow(flow1.id).nodes,
    0.4,
    1600,
    900,
    'ortho-mid'
  );
  assert.ok(orthoPath && orthoPath.startsWith('M '), 'generatePathString(ortho-mid) must return valid SVG path');

  const midPt = window.DataFlows.getMidpoint(
    window.DataFlows.getFlow(flow1.id).nodes,
    0.4,
    1600,
    900
  );
  assert.ok(typeof midPt.x === 'number' && typeof midPt.y === 'number', 'getMidpoint must return numeric {x, y}');

  window.DataFlows.removeWaypoint(flow1.id, 2);
  assert.strictEqual(window.DataFlows.getFlow(flow1.id).nodes.length, 2, 'removeWaypoint must reduce nodes length back to 2');

  // 2.5 Glows & Ripples CRUD (actual operational properties)
  const glow1 = window.Glows.createGlow({ x: 25, y: 30, color: '#00ffcc', size: 14, blur: 40, opacity: 0.8 });
  assert.strictEqual(glow1.size, 14, 'createGlow must initialize size');
  assert.strictEqual(glow1.blur, 40, 'createGlow must initialize blur');
  assert.strictEqual(glow1.opacity, 0.8, 'createGlow must initialize opacity');
  window.Glows.updateGlow(glow1.id, { size: 18, blur: 60, opacity: 0.9 });
  assert.strictEqual(window.Glows.getGlow(glow1.id).size, 18);
  assert.strictEqual(window.Glows.getGlow(glow1.id).blur, 60);
  assert.strictEqual(window.Glows.getGlow(glow1.id).opacity, 0.9);

  const ripple1 = window.Ripples.createRipple({ x: 75, y: 65, outerR: 120, refraction: 25, dur: 2.5 });
  assert.strictEqual(ripple1.outerR, 120, 'createRipple must initialize outerR');
  assert.strictEqual(ripple1.refraction, 25, 'createRipple must initialize refraction');
  assert.strictEqual(ripple1.dur, 2.5, 'createRipple must initialize dur');
  window.Ripples.updateRipple(ripple1.id, { outerR: 180, refraction: 45, dur: 3.5 });
  assert.strictEqual(window.Ripples.getRipple(ripple1.id).outerR, 180);
  assert.strictEqual(window.Ripples.getRipple(ripple1.id).refraction, 45);
  assert.strictEqual(window.Ripples.getRipple(ripple1.id).dur, 3.5);

  console.log('[HARNESS] REG-02 PASS: Stage 1 & 2 operational state, math, presets, and CRUD verified.');

  // ===========================================================================
  // STAGE 3: Selection Exclusivity, ControlStateAdaptor, HistoryManager (50),
  //          and ProjectManager (Schema 1.2.0)
  // ===========================================================================
  const htmlSource = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const controlElements = new Map();
  const tagRegex = /<(input|select|textarea)\b([^>]*)>/gi;
  let match;
  while ((match = tagRegex.exec(htmlSource)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const idMatch = /\bid="([^"]+)"/.exec(attrs);
    if (!idMatch) continue;
    const id = idMatch[1];
    const typeMatch = /\btype="([^"]+)"/.exec(attrs);
    const valMatch = /\bvalue="([^"]*)"/.exec(attrs);
    const checked = /\bchecked\b/.test(attrs);
    controlElements.set(id, {
      id,
      tagName: tag.toUpperCase(),
      type: typeMatch ? typeMatch[1] : (tag === 'select' ? 'select-one' : 'text'),
      value: valMatch ? valMatch[1] : '',
      checked,
      disabled: false,
      style: {},
      dataset: {},
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener() {},
      removeEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      appendChild() {},
      removeChild() {},
      setAttribute() {},
      getAttribute() { return null; }
    });
  }

  function makeStubElement(idOrTag) {
    return {
      id: idOrTag,
      tagName: String(idOrTag).toUpperCase(),
      type: 'text',
      value: '',
      checked: false,
      disabled: false,
      innerHTML: '',
      textContent: '',
      style: {},
      dataset: {},
      children: [],
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener() {},
      removeEventListener() {},
      appendChild(child) { this.children.push(child); return child; },
      removeChild() {},
      insertBefore(child) { this.children.push(child); return child; },
      setAttribute(k, v) { this[k] = v; },
      getAttribute(k) { return this[k] || null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 1600, height: 900 }; }
    };
  }

  global.document = {
    body: makeStubElement('body'),
    getElementById(id) {
      if (!controlElements.has(id)) {
        controlElements.set(id, makeStubElement(id));
      }
      return controlElements.get(id);
    },
    querySelector() { return makeStubElement('query'); },
    querySelectorAll() { return []; },
    createElement(tag) { return makeStubElement(tag); },
    createElementNS(ns, tag) { return makeStubElement(tag); },
    addEventListener() {}
  };

  // UI presentation callbacks stubbed as no-ops for Stage 3 operational testing
  window.syncUIAfterHistoryRestore = function() {};
  window.openAccordionById = function() {};
  window.triggerAppRender = function() {};

  loadProductionScript('history.js');
  loadProductionScript('projects.js');

  // 3.1 ControlStateAdaptor synchronization across 95 tracked controls + chkAutoApplyPreset
  assert.strictEqual(window.HistoryManager.trackedControlIds.length, 95);
  document.getElementById('canvasWidthInput').value = '1600';
  document.getElementById('canvasHeightInput').value = '900';
  document.getElementById('chkSnapToGrid').checked = true;
  document.getElementById('chkAutoApplyPreset').checked = false;

  const syncedFromDom = window.ControlStateAdaptor.syncFromDOM(window.HistoryManager.trackedControlIds);
  assert.strictEqual(syncedFromDom.canvasWidthInput, '1600');
  assert.strictEqual(syncedFromDom.chkSnapToGrid, true);
  assert.strictEqual(window.SceneState.getBoolControl('chkAutoApplyPreset', true), false);

  window.ControlStateAdaptor.setPairValue('duration', '12');
  assert.strictEqual(document.getElementById('durationSlider').value, '12');
  assert.strictEqual(document.getElementById('durationNum').value, '12');
  assert.strictEqual(window.SceneState.getControl('durationNum'), '12');

  // Verify ControlStateAdaptor.syncToDOM() with explicit dictionary (updates DOM & SceneState.controls)
  window.ControlStateAdaptor.syncToDOM({
    canvasWidthInput: '1920',
    canvasHeightInput: '1080',
    chkSnapToGrid: false,
    cameraMotionSelect: 'pan-left'
  });
  assert.strictEqual(document.getElementById('canvasWidthInput').value, '1920', 'syncToDOM must update input value');
  assert.strictEqual(document.getElementById('canvasHeightInput').value, '1080', 'syncToDOM must update input value');
  assert.strictEqual(document.getElementById('chkSnapToGrid').checked, false, 'syncToDOM must update checkbox checked state');
  assert.strictEqual(document.getElementById('cameraMotionSelect').value, 'pan-left', 'syncToDOM must update select value');
  assert.strictEqual(window.SceneState.getNumControl('canvasWidthInput', 0), 1920, 'syncToDOM must update SceneState.controls');
  assert.strictEqual(window.SceneState.getNumControl('canvasHeightInput', 0), 1080, 'syncToDOM must update SceneState.controls');
  assert.strictEqual(window.SceneState.getBoolControl('chkSnapToGrid', true), false, 'syncToDOM must update SceneState.controls');
  assert.strictEqual(window.SceneState.getControl('cameraMotionSelect'), 'pan-left', 'syncToDOM must update SceneState.controls');

  // Verify ControlStateAdaptor.syncToDOM() without arguments (flushes SceneState.controls to DOM)
  window.SceneState.setControl('durationNum', '16');
  window.ControlStateAdaptor.syncToDOM();
  assert.strictEqual(document.getElementById('durationNum').value, '16', 'syncToDOM() with no args must flush SceneState.controls to DOM');

  // Verify NodePresets.autoApplyToNewNodes operational state -> DOM sync direction
  document.getElementById('chkAutoApplyPreset').checked = true;
  window.NodePresets.setState({ autoApplyToNewNodes: false });
  window.NodePresets.syncAllRowsUI();
  assert.strictEqual(window.NodePresets.autoApplyToNewNodes, false, 'syncAllRowsUI must preserve NodePresets.autoApplyToNewNodes');
  assert.strictEqual(document.getElementById('chkAutoApplyPreset').checked, false, 'syncAllRowsUI must write autoApplyToNewNodes to #chkAutoApplyPreset');
  window.NodePresets.setState({ autoApplyToNewNodes: true });
  window.NodePresets.syncAllRowsUI();
  assert.strictEqual(document.getElementById('chkAutoApplyPreset').checked, true);

  // 3.2 Selection Exclusivity via Real Component Selectors & AppCoordinator Integration
  window.DiagramNodes.selectNode(node1.id);
  assert.strictEqual(window.DiagramNodes.activeId, node1.id, 'DiagramNodes.selectNode must set DiagramNodes.activeId');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, 'node');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, node1.id);

  window.DataFlows.selectFlow(flow1.id);
  assert.strictEqual(window.DataFlows.activeId, flow1.id, 'DataFlows.selectFlow must set DataFlows.activeId');
  assert.strictEqual(window.DiagramNodes.activeId, null, 'Selecting a flow must deselect active node via AppCoordinator');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, 'flow');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, flow1.id);

  window.Glows.selectGlow(glow1.id);
  assert.strictEqual(window.Glows.activeId, glow1.id, 'Glows.selectGlow must set Glows.activeId');
  assert.strictEqual(window.DataFlows.activeId, null, 'Selecting a glow must deselect active flow via AppCoordinator');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, 'glow');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, glow1.id);

  window.Ripples.selectRipple(ripple1.id);
  assert.strictEqual(window.Ripples.activeId, ripple1.id, 'Ripples.selectRipple must set Ripples.activeId');
  assert.strictEqual(window.Glows.activeId, null, 'Selecting a ripple must deselect active glow via AppCoordinator');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, 'ripple');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, ripple1.id);

  window.AppCoordinator.clearSelection();
  assert.strictEqual(window.Ripples.activeId, null, 'AppCoordinator.clearSelection must deselect active ripple');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, null);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, null);

  // 3.3 HistoryManager maxDepth: 50, Undo, Redo
  assert.strictEqual(window.HistoryManager.maxDepth, 50);
  window.HistoryManager.undoStack = [];
  window.HistoryManager.redoStack = [];

  for (let i = 1; i <= 55; i++) {
    window.DiagramNodes.updateNode(node1.id, { x: 10 + i });
    window.HistoryManager.recordImmediate();
  }
  assert.strictEqual(window.HistoryManager.undoStack.length, 50, 'History undoStack must cap at maxDepth 50');

  // Undo one step (from x=65 back to x=64)
  window.HistoryManager.undo();
  assert.strictEqual(window.DiagramNodes.getNode(node1.id).x, 64, 'Undo must restore previous node x=64');
  assert.strictEqual(window.HistoryManager.redoStack.length, 1);

  // Redo back to x=65
  window.HistoryManager.redo();
  assert.strictEqual(window.DiagramNodes.getNode(node1.id).x, 65, 'Redo must restore node x=65');

  // 3.4 ProjectManager Schema 1.2.0 Serialization & Restoration
  // Note: serializeStudioState() returns a JSON string; parse it to inspect schema fields.
  const savedProjectJson = window.ProjectManager.serializeStudioState();
  assert.strictEqual(typeof savedProjectJson, 'string', 'serializeStudioState must return a JSON string');
  const savedProject = JSON.parse(savedProjectJson);
  assert.strictEqual(savedProject.version, '1.2.0', 'Serialized schema version must be 1.2.0');
  assert.strictEqual(Array.isArray(savedProject.nodes), true);
  assert.strictEqual(savedProject.nodes.length, 2);
  assert.strictEqual(savedProject.flows.length, 1);
  assert.strictEqual(savedProject.glows.length, 1);
  assert.strictEqual(savedProject.ripples.length, 1);

  // Delete objects, then restore from savedProjectJson
  window.DiagramNodes.deleteNode(node1.id);
  window.DataFlows.deleteFlow(flow1.id);
  assert.strictEqual(window.DiagramNodes.getAllNodes().length, 1);
  assert.strictEqual(window.DataFlows.getAllFlows().length, 0);

  window.ProjectManager.applyStudioState(savedProjectJson);
  assert.strictEqual(window.DiagramNodes.getAllNodes().length, 2, 'applyStudioState must restore both nodes');
  assert.strictEqual(window.DataFlows.getAllFlows().length, 1, 'applyStudioState must restore flow');
  assert.strictEqual(window.DataFlows.getFlow(flow1.id).label, 'TLS 1.3', 'applyStudioState must preserve flow label');

  // ===========================================================================
  // STAGE 4: SVG Layer Injection & Export Payload Construction
  // ===========================================================================
  // Wire window.buildFullSVG bridge (in browser, app.js sets this inside DOMContentLoaded)
  window.buildFullSVG = function(state, overrides) {
    return window.SceneState.buildFullSVG(state, overrides);
  };

  // Wire pass-through window.serializeSVGForExport stub for constructExportJobPayload.
  // NOTE: Production SceneState.serializeSVGForExport uses browser DOMParser/XMLSerializer
  // and cannot run in Node.js without a browser DOM; it is reported under REG-04.
  window.serializeSVGForExport = function(rawSvg) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + rawSvg;
  };

  const fullState = window.SceneState.buildRenderState();
  const fullSvg = window.SceneState.buildFullSVG(fullState);
  assert.ok(fullSvg.includes('OAuth2 Service'), 'buildFullSVG must include DiagramNodes markup');
  assert.ok(fullSvg.includes('TLS 1.3'), 'buildFullSVG must include DataFlows markup');

  loadProductionScript('still-export-modal.js');
  loadProductionScript('export-modal.js');

  const stillCfg = window.StillExportStudio.buildStillRenderConfig(fullState, {
    width: 1920,
    height: 1080,
    enableCamera: false,
    enableOptical: false,
    enableFrame: false
  });
  assert.strictEqual(
    stillCfg.payloadState.camera.motion,
    'static',
    'Disabling camera in buildStillRenderConfig must force payloadState.camera.motion = static'
  );
  assert.strictEqual(
    stillCfg.payloadState.optical.type,
    'none',
    'Disabling optical in buildStillRenderConfig must force payloadState.optical.type = none'
  );
  assert.strictEqual(
    stillCfg.payloadState.overlays.frame,
    false,
    'Disabling frame in buildStillRenderConfig must force payloadState.overlays.frame = false'
  );
  assert.ok(stillCfg.rawSvg && stillCfg.rawSvg.includes('<svg'), 'buildStillRenderConfig must produce rawSvg');

  const exportPayload = window.AnimatedExportStudio.constructExportJobPayload(fullState, {
    jobId: 'job-test-1',
    format: 'mp4',
    fps: 30,
    width: 1920,
    height: 1080,
    duration: 7
  });
  assert.strictEqual(exportPayload.jobId, 'job-test-1');
  assert.strictEqual(exportPayload.format, 'mp4');
  assert.strictEqual(exportPayload.fps, 30);
  assert.strictEqual(exportPayload.width, 1920);
  assert.strictEqual(exportPayload.height, 1080);
  assert.strictEqual(exportPayload.duration, 7);
  assert.ok(exportPayload.svgMarkup && exportPayload.svgMarkup.includes('<svg'), 'constructExportJobPayload must populate svgMarkup');

  console.log('[HARNESS] REG-03 PASS: Stage 3 & 4 selection, history(50), schema 1.2.0, SVG compilation, and export payload builders verified (with DOM control test doubles and serializeSVGForExport pass-through stub).');
}

try {
  runHarness();
  process.exit(0);
} catch (err) {
  console.error('[HARNESS] FAIL:', err && err.stack ? err.stack : err);
  process.exit(1);
}
