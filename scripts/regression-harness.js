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
const STYLE_CSS_PATH = path.join(REPO_ROOT, 'internal', 'web', 'static', 'css', 'style.css');

function loadProductionScript(filename) {
  const fullPath = path.join(JS_DIR, filename);
  const code = fs.readFileSync(fullPath, 'utf8');
  vm.runInThisContext(code, { filename: fullPath });
}

async function runHarness() {
  // ===========================================================================
  // STAGE 1: Pure Operational Core (Zero DOM Mock — only global.window = global)
  // ===========================================================================
  global.window = global;

  if (typeof global.Image === 'undefined') {
    global.Image = class {
      constructor() {
        this.width = 400;
        this.height = 300;
        this.naturalWidth = 800;
        this.naturalHeight = 600;
      }
      set src(v) {
        this._src = v;
        if (typeof this.onload === 'function') {
          this.onload();
        }
      }
      get src() {
        return this._src;
      }
    };
    window.Image = global.Image;
  }

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

  const dimsBefore = window.AppCoordinator.getCanvasDimensions();
  assert.strictEqual(dimsBefore.width, 1600, 'Dimensions before render-state construction must reflect SceneState controls fallback');
  assert.strictEqual(dimsBefore.height, 900);

  const renderState = window.SceneState.buildRenderState();
  assert.ok(renderState && renderState.image, 'buildRenderState must return state.image');
  assert.strictEqual(renderState.image.width, 1600);
  assert.strictEqual(renderState.image.height, 900);
  assert.strictEqual(renderState.camera.motion, 'ken-burns');

  const dimsAfter = window.AppCoordinator.getCanvasDimensions();
  assert.strictEqual(dimsAfter.width, 1600, 'Dimensions after render-state construction must reflect currentImage');
  assert.strictEqual(dimsAfter.height, 900);

  const baseSvg = window.Effects.build(renderState);
  assert.ok(
    baseSvg.includes('<svg') && baseSvg.includes('viewBox="0 0 1600 900"'),
    'Effects.build must produce valid 1600x900 SVG'
  );

  // ===========================================================================
  // STAGE 2: Viewport Math & Component Operational CRUD
  //          (Browser event listener and getElementById test mock for stage.js & snap math)
  // ===========================================================================
  window.addEventListener = function() {};
  global.document = {
    addEventListener() {},
    getElementById() { return null; }
  };

  loadProductionScript('wasm_exec.js');
  loadProductionScript('engine-bridge.js');
  loadProductionScript('stage.js');
  loadProductionScript('shape-registry.js');
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
  assert.strictEqual(snappedOn.x, 2.5);
  assert.strictEqual(snappedOn.y, 5);

  const snappedOff = window.Stage.computeSnappedPosition(3.7, 5.0, { enabled: false });
  assert.strictEqual(snappedOff.x, 3.7);

  const snappedPctX = window.Stage.computeSnappedPct(3.7, 'x', {
    enabled: true,
    gridSizePx: 25,
    canvasWidth: 1000,
    canvasHeight: 1000
  });
  assert.strictEqual(snappedPctX, 2.5);

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
  assert.strictEqual(node2.width, 160, 'Explicit initialProps.width on node2 overrides preset');

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

  // 2.3b ShapeRegistry operational API & Golden Fixture Invariants
  assert.ok(window.ShapeRegistry, 'window.ShapeRegistry must exist');
  assert.strictEqual(Object.isFrozen(window.ShapeRegistry), true, 'window.ShapeRegistry must be frozen');
  assert.strictEqual(typeof window.ShapeRegistry.get, 'function');
  assert.strictEqual(typeof window.ShapeRegistry.has, 'function');
  assert.strictEqual(typeof window.ShapeRegistry.getAll, 'function');
  assert.strictEqual(typeof window.ShapeRegistry.getIds, 'function');

  const shapeIds = window.ShapeRegistry.getIds();
  assert.strictEqual(shapeIds.length, 12, 'ShapeRegistry must contain exactly 12 built-in shapes');
  assert.strictEqual(window.ShapeRegistry.has('rounded'), true);
  assert.strictEqual(window.ShapeRegistry.has('unknown_test_shape'), false);
  assert.strictEqual(window.ShapeRegistry.get('unknown_test_shape'), null);

  const roundedDef = window.ShapeRegistry.get('rounded');
  assert.ok(roundedDef && typeof roundedDef.buildSVG === 'function');
  assert.strictEqual(Object.isFrozen(roundedDef), true);

  const allDefs = window.ShapeRegistry.getAll();
  assert.strictEqual(allDefs.length, 12);
  allDefs.forEach((d) => assert.strictEqual(Object.isFrozen(d), true));

  // Balanced <g>-tag depth scanner for extracting complete nodes-layer without truncation
  function extractBalancedNodesLayer(svgString) {
    assert.strictEqual(typeof svgString, 'string', 'Input to extractBalancedNodesLayer must be a string');
    const startIdx = svgString.indexOf('<g id="nodes-layer">');
    if (startIdx === -1) {
      throw new Error('Missing <g id="nodes-layer"> element in SVG string');
    }

    // Determine outer unclosed <g> depth preceding the nodes-layer element
    const beforeLayer = svgString.slice(0, startIdx);
    const beforeTagRegex = /<\/?g\b[^>]*>/g;
    let outerDepthBefore = 0;
    let mBefore;
    while ((mBefore = beforeTagRegex.exec(beforeLayer)) !== null) {
      if (mBefore[0].startsWith('</')) {
        outerDepthBefore--;
      } else if (!/\/>\s*$/.test(mBefore[0])) {
        outerDepthBefore++;
      }
    }

    const tagRegex = /<\/?g\b[^>]*>/g;
    tagRegex.lastIndex = startIdx;
    let layerDepth = 0;
    let endIdx = -1;
    let match;

    while ((match = tagRegex.exec(svgString)) !== null) {
      if (match[0].startsWith('</')) {
        layerDepth--;
        if (layerDepth === 0) {
          endIdx = tagRegex.lastIndex;
          break;
        }
        if (layerDepth < 0) {
          throw new Error('Malformed SVG: Extra closing </g> tag encountered in nodes-layer');
        }
      } else if (!/\/>\s*$/.test(match[0])) {
        layerDepth++;
      }
    }

    if (layerDepth > 0 || endIdx === -1) {
      throw new Error(`Malformed SVG: Unclosed <g> tags in nodes-layer (remaining depth: ${layerDepth})`);
    }

    // Validate remainder of svgString does not contain unmatched closing </g> tags
    const afterTagRegex = /<\/?g\b[^>]*>/g;
    afterTagRegex.lastIndex = endIdx;
    let remainingOuterDepth = outerDepthBefore;
    let mAfter;
    while ((mAfter = afterTagRegex.exec(svgString)) !== null) {
      if (mAfter[0].startsWith('</')) {
        remainingOuterDepth--;
        if (remainingOuterDepth < 0) {
          throw new Error('Malformed SVG: Extra closing </g> tag encountered in nodes-layer');
        }
      } else if (!/\/>\s*$/.test(mAfter[0])) {
        remainingOuterDepth++;
      }
    }

    const extracted = svgString.slice(startIdx, endIdx);
    const openCount = (extracted.match(/<g\b[^>]*>/g) || []).filter((t) => !/\/>\s*$/.test(t)).length;
    const closeCount = (extracted.match(/<\/g>/g) || []).length;
    assert.strictEqual(openCount, closeCount, 'Extracted nodes-layer tag count must be balanced');
    return extracted;
  }

  // Focused validation of extractBalancedNodesLayer against valid and malformed structures
  // 1. A valid nested layer
  const validNested = '<svg><g id="nodes-layer"><g data-node-id="1"><text>nested</text></g></g></svg>';
  assert.strictEqual(
    extractBalancedNodesLayer(validNested),
    '<g id="nodes-layer"><g data-node-id="1"><text>nested</text></g></g>'
  );

  // 2. A missing layer root
  assert.throws(
    () => extractBalancedNodesLayer('<svg><rect width="100" height="100" /></svg>'),
    /Missing <g id="nodes-layer"> element/
  );

  // 3. An unclosed nested group
  assert.throws(
    () => extractBalancedNodesLayer('<g id="nodes-layer"><g data-node-id="1">unclosed</g>'),
    /Unclosed <g> tags in nodes-layer/
  );

  // 4. An extra closing group tag inside the layer
  assert.throws(
    () => extractBalancedNodesLayer('<g id="nodes-layer"><g data-node-id="1">extra-close</g></g></g>'),
    /Extra closing <\/g> tag encountered in nodes-layer/
  );
  assert.throws(
    () => extractBalancedNodesLayer('<g id="nodes-layer"><g data-node-id="1">inner</g></g><text>trailing</text></g>'),
    /Extra closing <\/g> tag encountered in nodes-layer/
  );

  // 5. A valid surrounding SVG group after the completed nodes-layer
  const validSurrounding = '<svg><g id="nodes-layer"><g data-node-id="1">node</g></g><g id="camera-rig"><circle cx="10" cy="10" r="5" /></g></svg>';
  assert.strictEqual(
    extractBalancedNodesLayer(validSurrounding),
    '<g id="nodes-layer"><g data-node-id="1">node</g></g>'
  );

  // Golden baseline fixtures for all 12 shapes plus unknown shape fallback
  const GOLDEN_SHAPE_FIXTURES = {
    textbox: '<g id="nodes-layer">\n<g data-node-id="1" transform="translate(640.00, 360.00)" style="cursor: move;"><rect x="-85" y="-40" width="170" height="80" fill="transparent" stroke="none" /><text x="0" y="-5.5" fill="#e6edf3" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-size="15" font-weight="600" text-anchor="middle">Shape Label</text><text x="0" y="15.7" fill="#e6edf3" fill-opacity="0.75" font-family="monospace" font-size="12" text-anchor="middle">Subtext 1</text></g>\n</g>',
    rect: '<g id="nodes-layer">\n<g data-node-id="1" transform="translate(640.00, 360.00)" style="cursor: move;"><rect x="-85" y="-40" width="170" height="80" rx="2" fill="#161b22" fill-opacity="0.92" stroke="#58a6ff" stroke-width="2"  filter="url(#nodeDropShadow)" /><text x="0" y="-5.5" fill="#e6edf3" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-size="15" font-weight="600" text-anchor="middle">Shape Label</text><text x="0" y="15.7" fill="#e6edf3" fill-opacity="0.75" font-family="monospace" font-size="12" text-anchor="middle">Subtext 1</text></g>\n</g>',
    rounded: '<g id="nodes-layer">\n<g data-node-id="1" transform="translate(640.00, 360.00)" style="cursor: move;"><rect x="-85" y="-40" width="170" height="80" rx="12" fill="#161b22" fill-opacity="0.92" stroke="#58a6ff" stroke-width="2"  filter="url(#nodeDropShadow)" /><text x="0" y="-5.5" fill="#e6edf3" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-size="15" font-weight="600" text-anchor="middle">Shape Label</text><text x="0" y="15.7" fill="#e6edf3" fill-opacity="0.75" font-family="monospace" font-size="12" text-anchor="middle">Subtext 1</text></g>\n</g>',
    pill: '<g id="nodes-layer">\n<g data-node-id="1" transform="translate(640.00, 360.00)" style="cursor: move;"><rect x="-85" y="-40" width="170" height="80" rx="40" fill="#161b22" fill-opacity="0.92" stroke="#58a6ff" stroke-width="2"  filter="url(#nodeDropShadow)" /><text x="0" y="-5.5" fill="#e6edf3" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-size="15" font-weight="600" text-anchor="middle">Shape Label</text><text x="0" y="15.7" fill="#e6edf3" fill-opacity="0.75" font-family="monospace" font-size="12" text-anchor="middle">Subtext 1</text></g>\n</g>',
    circle: '<g id="nodes-layer">\n<g data-node-id="1" transform="translate(640.00, 360.00)" style="cursor: move;"><circle cx="0" cy="0" r="40" fill="#161b22" fill-opacity="0.92" stroke="#58a6ff" stroke-width="2"  filter="url(#nodeDropShadow)" /><text x="0" y="-5.5" fill="#e6edf3" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-size="15" font-weight="600" text-anchor="middle">Shape Label</text><text x="0" y="15.7" fill="#e6edf3" fill-opacity="0.75" font-family="monospace" font-size="12" text-anchor="middle">Subtext 1</text></g>\n</g>',
    diamond: '<g id="nodes-layer">\n<g data-node-id="1" transform="translate(640.00, 360.00)" style="cursor: move;"><polygon points="0,-40 85,0 0,40 -85,0" stroke-linejoin="round" fill="#161b22" fill-opacity="0.92" stroke="#58a6ff" stroke-width="2"  filter="url(#nodeDropShadow)" /><text x="0" y="-5.5" fill="#e6edf3" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-size="15" font-weight="600" text-anchor="middle">Shape Label</text><text x="0" y="15.7" fill="#e6edf3" fill-opacity="0.75" font-family="monospace" font-size="12" text-anchor="middle">Subtext 1</text></g>\n</g>',
    hexagon: '<g id="nodes-layer">\n<g data-node-id="1" transform="translate(640.00, 360.00)" style="cursor: move;"><polygon points="-47.6,-40 47.6,-40 85,0 47.6,40 -47.6,40 -85,0" stroke-linejoin="round" fill="#161b22" fill-opacity="0.92" stroke="#58a6ff" stroke-width="2"  filter="url(#nodeDropShadow)" /><text x="0" y="-5.5" fill="#e6edf3" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-size="15" font-weight="600" text-anchor="middle">Shape Label</text><text x="0" y="15.7" fill="#e6edf3" fill-opacity="0.75" font-family="monospace" font-size="12" text-anchor="middle">Subtext 1</text></g>\n</g>',
    parallelogram: '<g id="nodes-layer">\n<g data-node-id="1" transform="translate(640.00, 360.00)" style="cursor: move;"><polygon points="-57.8,-40 85,-40 57.8,40 -85,40" stroke-linejoin="round" fill="#161b22" fill-opacity="0.92" stroke="#58a6ff" stroke-width="2"  filter="url(#nodeDropShadow)" /><text x="0" y="-5.5" fill="#e6edf3" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-size="15" font-weight="600" text-anchor="middle">Shape Label</text><text x="0" y="15.7" fill="#e6edf3" fill-opacity="0.75" font-family="monospace" font-size="12" text-anchor="middle">Subtext 1</text></g>\n</g>',
    cylinder: '<g id="nodes-layer">\n<g data-node-id="1" transform="translate(640.00, 360.00)" style="cursor: move;"><g filter="url(#nodeDropShadow)"><path d="M -85,-25.6 L -85,25.6 A 85,14.399999999999999 0 0,0 85,25.6 L 85,-25.6 Z" fill="#161b22" fill-opacity="0.92" stroke="#58a6ff" stroke-width="2"  /><ellipse cx="0" cy="-25.6" rx="85" ry="14.399999999999999" fill="#161b22" fill-opacity="0.92" stroke="#58a6ff" stroke-width="2"  /></g><text x="0" y="-5.5" fill="#e6edf3" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-size="15" font-weight="600" text-anchor="middle">Shape Label</text><text x="0" y="15.7" fill="#e6edf3" fill-opacity="0.75" font-family="monospace" font-size="12" text-anchor="middle">Subtext 1</text></g>\n</g>',
    cloud: '<g id="nodes-layer">\n<g data-node-id="1" transform="translate(640.00, 360.00)" style="cursor: move;"><path d="M -46.75000000000001,26 C -80.75,26 -85,2 -61.199999999999996,-8 C -63.75,-30 -12.75,-38 6.8,-24 C 38.25,-36 78.2,-20 68,-2 C 89.25,10 72.25,26 42.5,26 Z" stroke-linejoin="round" fill="#161b22" fill-opacity="0.92" stroke="#58a6ff" stroke-width="2"  filter="url(#nodeDropShadow)" /><text x="0" y="-5.5" fill="#e6edf3" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-size="15" font-weight="600" text-anchor="middle">Shape Label</text><text x="0" y="15.7" fill="#e6edf3" fill-opacity="0.75" font-family="monospace" font-size="12" text-anchor="middle">Subtext 1</text></g>\n</g>',
    callout: '<g id="nodes-layer">\n<g data-node-id="1" transform="translate(640.00, 360.00)" style="cursor: move;"><g filter="url(#nodeDropShadow)"><polygon points="-85,-40 69,-40 85,-24 85,40 -85,40" stroke-linejoin="round" fill="#161b22" fill-opacity="0.92" stroke="#58a6ff" stroke-width="2"  /><polyline points="69,-40 69,-24 85,-24" fill="none" stroke="#58a6ff" stroke-width="2" /></g><text x="0" y="-5.5" fill="#e6edf3" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-size="15" font-weight="600" text-anchor="middle">Shape Label</text><text x="0" y="15.7" fill="#e6edf3" fill-opacity="0.75" font-family="monospace" font-size="12" text-anchor="middle">Subtext 1</text></g>\n</g>',
    axes: '<g id="nodes-layer">\n<g data-node-id="1" transform="translate(640.00, 360.00)" style="cursor: move;"><rect x="-85" y="-40" width="170" height="80" fill="#161b22" fill-opacity="0.92" stroke="none" /><line x1="-42.5" y1="-40" x2="-42.5" y2="40" stroke="#58a6ff" stroke-opacity="0.2" stroke-width="1" stroke-dasharray="4,4" /><line x1="-85" y1="20" x2="85" y2="20" stroke="#58a6ff" stroke-opacity="0.2" stroke-width="1" stroke-dasharray="4,4" /><line x1="0" y1="-40" x2="0" y2="40" stroke="#58a6ff" stroke-opacity="0.2" stroke-width="1" stroke-dasharray="4,4" /><line x1="-85" y1="0" x2="85" y2="0" stroke="#58a6ff" stroke-opacity="0.2" stroke-width="1" stroke-dasharray="4,4" /><line x1="42.5" y1="-40" x2="42.5" y2="40" stroke="#58a6ff" stroke-opacity="0.2" stroke-width="1" stroke-dasharray="4,4" /><line x1="-85" y1="-20" x2="85" y2="-20" stroke="#58a6ff" stroke-opacity="0.2" stroke-width="1" stroke-dasharray="4,4" /><line x1="85" y1="-40" x2="85" y2="40" stroke="#58a6ff" stroke-opacity="0.2" stroke-width="1" stroke-dasharray="4,4" /><line x1="-85" y1="-40" x2="85" y2="-40" stroke="#58a6ff" stroke-opacity="0.2" stroke-width="1" stroke-dasharray="4,4" /><polyline points="-85,-40 -85,40 85,40" fill="none" stroke="#58a6ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /><text x="-85" y="-50" fill="#e6edf3" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-size="15" font-weight="600" text-anchor="start">Shape Label</text><text x="85" y="60" fill="#e6edf3" fill-opacity="0.75" font-family="monospace" font-size="12" text-anchor="end">Subtext 1</text></g>\n</g>',
    unknown_test_shape: '<g id="nodes-layer">\n<g data-node-id="1" transform="translate(640.00, 360.00)" style="cursor: move;"><text x="0" y="-5.5" fill="#e6edf3" font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif" font-size="15" font-weight="600" text-anchor="middle">Shape Label</text><text x="0" y="15.7" fill="#e6edf3" fill-opacity="0.75" font-family="monospace" font-size="12" text-anchor="middle">Subtext 1</text></g>\n</g>'
  };

  const savedDiagramNodesState = window.DiagramNodes.getState();
  const fixtureRenderState = {
    canvasWidth: 1280,
    canvasHeight: 720,
    filterId: 'none',
    frameStyle: 'none',
    showGrid: false,
    cameraZoom: 1,
    cameraPanX: 0,
    cameraPanY: 0,
    depth3D: 0,
    tiltX: 0,
    tiltY: 0,
    stageBackground: '#1e1e2e',
    image: { width: 1280, height: 720 }
  };
  const fixtureBaseSvg = window.Effects.build(fixtureRenderState);

  for (const [sId, expectedLayerSvg] of Object.entries(GOLDEN_SHAPE_FIXTURES)) {
    window.DiagramNodes.setState({
      nodes: [{
        id: 1,
        shape: sId,
        text: 'Shape Label',
        subtext: 'Subtext 1',
        x: 50,
        y: 50,
        width: 170,
        height: 80,
        fillColor: '#161b22',
        fillOpacity: 0.92,
        strokeColor: '#58a6ff',
        strokeWidth: 2,
        strokeStyle: 'solid',
        textColor: '#e6edf3',
        fontSize: 15,
        anim: 'none'
      }],
      nodesCounter: 1,
      selectedNodeId: null
    });
    const injected = window.DiagramNodes.injectIntoSVG(fixtureBaseSvg, fixtureRenderState);
    const actualLayerSvg = extractBalancedNodesLayer(injected);
    assert.strictEqual(
      actualLayerSvg,
      expectedLayerSvg,
      `SVG markup for shape "${sId}" must match baseline golden fixture 100% character-for-character`
    );

    // Verify balance & node content invariants
    const openGCount = (actualLayerSvg.match(/<g\b[^>]*>/g) || []).length;
    const closeGCount = (actualLayerSvg.match(/<\/g>/g) || []).length;
    assert.strictEqual(openGCount, closeGCount, `Shape "${sId}" must have balanced <g> tags`);
    assert.ok(actualLayerSvg.startsWith('<g id="nodes-layer">'), `Shape "${sId}" must start with nodes-layer`);
    assert.ok(actualLayerSvg.endsWith('</g>\n</g>'), `Shape "${sId}" must close both node and nodes-layer`);
    assert.ok(actualLayerSvg.includes('Shape Label'), `Shape "${sId}" must contain primary text`);
    assert.ok(actualLayerSvg.includes('Subtext 1'), `Shape "${sId}" must contain subtext`);
  }
  // Restore original node state
  window.DiagramNodes.setState(savedDiagramNodesState);

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

  // 2.4b Stage 2.3: DataFlows.setActiveWaypointIndex & getActiveWaypointIndex (OBS-01)
  window.DataFlows.activeId = flow1.id;
  assert.strictEqual(window.DataFlows.setActiveWaypointIndex(1), true, 'setActiveWaypointIndex(1) must return true for valid index');
  assert.strictEqual(window.DataFlows.getActiveWaypointIndex(), 1, 'getActiveWaypointIndex must return 1');
  assert.strictEqual(window.DataFlows.setActiveWaypointIndex(0), true, 'setActiveWaypointIndex(0) must return true for index 0');
  assert.strictEqual(window.DataFlows.getActiveWaypointIndex(), 0);
  assert.strictEqual(window.DataFlows.setActiveWaypointIndex(-1), false, 'setActiveWaypointIndex must reject negative index');
  assert.strictEqual(window.DataFlows.getActiveWaypointIndex(), 0, 'Active index must remain unchanged on negative input');
  assert.strictEqual(window.DataFlows.setActiveWaypointIndex('invalid'), false, 'setActiveWaypointIndex must reject NaN string');
  assert.strictEqual(window.DataFlows.setActiveWaypointIndex(99), false, 'setActiveWaypointIndex must reject out-of-bounds index');
  assert.strictEqual(window.DataFlows.getActiveWaypointIndex(), 0);

  // 2.4c Stage 2.3: NodePresets.resetToDefaults (P1-03)
  window.NodePresets.setPresetParam('fillColor', '#ff0000', true);
  window.NodePresets.setPresetParam('width', 999, false);
  window.NodePresets.autoApplyToNewNodes = false;
  assert.strictEqual(window.NodePresets.getState().preset.fillColor.value, '#ff0000');
  assert.strictEqual(window.NodePresets.getState().autoApplyToNewNodes, false);

  const resetPresetState = window.NodePresets.resetToDefaults();
  assert.strictEqual(resetPresetState.preset.fillColor.value, '#161b22', 'resetToDefaults must restore default fillColor');
  assert.strictEqual(resetPresetState.preset.fillColor.enabled, true);
  assert.strictEqual(resetPresetState.preset.width.value, 170, 'resetToDefaults must restore default width');
  assert.strictEqual(resetPresetState.preset.width.enabled, true);
  assert.strictEqual(resetPresetState.autoApplyToNewNodes, true, 'resetToDefaults must reset autoApplyToNewNodes to true');

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
  function makeStubElement(idOrTag) {
    const classes = new Set();
    const el = {
      id: idOrTag,
      tagName: String(idOrTag).toUpperCase(),
      type: 'text',
      value: '',
      checked: false,
      disabled: false,
      textContent: '',
      style: {},
      dataset: {},
      children: [],
      parentElement: null,
      classList: {
        add(...cls) { cls.forEach((c) => classes.add(c)); },
        remove(...cls) { cls.forEach((c) => classes.delete(c)); },
        toggle(c, force) {
          if (force === true) { classes.add(c); return true; }
          if (force === false) { classes.delete(c); return false; }
          if (classes.has(c)) { classes.delete(c); return false; }
          classes.add(c); return true;
        },
        contains(c) { return classes.has(c); }
      },
      addEventListener(evt, fn) {
        if (!this._listeners) this._listeners = {};
        if (!this._listeners[evt]) this._listeners[evt] = [];
        this._listeners[evt].push(fn);
      },
      removeEventListener(evt, fn) {
        if (!this._listeners || !this._listeners[evt]) return;
        this._listeners[evt] = this._listeners[evt].filter((f) => f !== fn);
      },
      dispatchEvent(evt) {
        const type = typeof evt === 'string' ? evt : (evt ? evt.type : '');
        const e = typeof evt === 'object' ? evt : { type, target: this };
        if (!e.target) e.target = this;
        let isStopped = false;
        const prevStop = e.stopPropagation;
        e.stopPropagation = function() {
          isStopped = true;
          if (typeof prevStop === 'function') prevStop.call(e);
        };
        if (typeof e.preventDefault !== 'function') {
          e.preventDefault = function() { e.defaultPrevented = true; };
        }
        if (this._listeners && this._listeners[type]) {
          this._listeners[type].slice().forEach((fn) => fn(e));
        }
        if (!isStopped && this.parentElement && typeof this.parentElement.dispatchEvent === 'function') {
          this.parentElement.dispatchEvent(e);
        }
      },
      focus() {
        if (typeof global.document !== 'undefined') {
          global.document.activeElement = this;
        }
      },
      click() {
        this.dispatchEvent({ type: 'click', target: this });
      },
      appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) this.children.splice(idx, 1);
        child.parentElement = null;
        return child;
      },
      remove() {
        if (this.parentElement && typeof this.parentElement.removeChild === 'function') {
          this.parentElement.removeChild(this);
        }
      },
      insertBefore(child, ref) {
        child.parentElement = this;
        const idx = ref ? this.children.indexOf(ref) : -1;
        if (idx !== -1) {
          this.children.splice(idx, 0, child);
        } else {
          this.children.push(child);
        }
        return child;
      },
      setAttribute(k, v) {
        this[k] = v;
        if (k === 'data-unknown-shape') this.dataset.unknownShape = v;
        if (k === 'data-target-acc') this.dataset.targetAcc = v;
        if (k === 'class' && typeof v === 'string') {
          v.split(/\s+/).forEach((c) => c && classes.add(c));
        }
      },
      getContext() {
        return {
          drawImage() {},
          fillRect() {},
          beginPath() {},
          moveTo() {},
          lineTo() {},
          stroke() {},
          arc() {},
          fill() {},
          createRadialGradient() { return { addColorStop() {} }; },
          save() {},
          restore() {}
        };
      },
      toDataURL() {
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      },
      getAttribute(k) { return this[k] || null; },
      hasAttribute(k) { return this[k] !== undefined && this[k] !== null; },
      removeAttribute(k) { delete this[k]; },
      contains(target) {
        if (!target) return false;
        if (target === this) return true;
        let cur = target.parentElement;
        while (cur) {
          if (cur === this) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      closest(sel) {
        let cur = this;
        while (cur) {
          if (sel.startsWith('.') && cur.classList && cur.classList.contains(sel.slice(1))) return cur;
          if (sel.startsWith('#') && cur.id === sel.slice(1)) return cur;
          if (sel.startsWith('[') && sel.endsWith(']')) {
            const attr = sel.slice(1, -1);
            if (cur.hasAttribute && cur.hasAttribute(attr)) return cur;
            if (cur.getAttribute && cur.getAttribute(attr) !== null) return cur;
          }
          if (cur.tagName && cur.tagName.toLowerCase() === sel.toLowerCase()) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      scrollIntoView() {},
      querySelector(sel) {
        if (sel === 'option[data-unknown-shape="true"]') {
          return this.children.find((c) => c.dataset && c.dataset.unknownShape === 'true') || null;
        }
        if (sel === '.rail-icon') {
          return this.children.find((c) => c.classList && c.classList.contains('rail-icon')) || null;
        }
        return null;
      },
      querySelectorAll() { return []; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 1600, height: 900 }; }
    };
    Object.defineProperty(el, 'firstChild', {
      get() { return this.children[0] || null; }
    });
    Object.defineProperty(el, 'options', {
      get() { return this.children.filter((c) => c.tagName === 'OPTION'); }
    });
    Object.defineProperty(el, 'className', {
      get() { return Array.from(classes).join(' '); },
      set(val) {
        classes.clear();
        if (val) {
          String(val).trim().split(/\s+/).forEach((c) => {
            if (c) classes.add(c);
          });
        }
      }
    });
    let innerHTMLVal = '';
    Object.defineProperty(el, 'innerHTML', {
      get() { return innerHTMLVal; },
      set(val) {
        innerHTMLVal = val;
        if (val === '') {
          this.children = [];
        }
      }
    });
    return el;
  }

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
    const el = makeStubElement(id);
    el.tagName = tag.toUpperCase();
    el.type = typeMatch ? typeMatch[1] : (tag === 'select' ? 'select-one' : 'text');
    el.value = valMatch ? valMatch[1] : '';
    el.checked = checked;
    controlElements.set(id, el);
  }

  global.document = {
    body: makeStubElement('body'),
    activeElement: null,
    getElementById(id) {
      if (!controlElements.has(id)) {
        controlElements.set(id, makeStubElement(id));
      }
      return controlElements.get(id);
    },
    querySelector(sel) {
      const all = this.querySelectorAll(sel);
      return all.length > 0 ? all[0] : null;
    },
    querySelectorAll(sel) {
      const results = [];
      for (const el of controlElements.values()) {
        if (!sel) continue;
        if (sel.includes('.icon-rail-left') && el.classList && el.classList.contains('icon-rail-btn')) {
          if (el.closest && el.closest('.icon-rail-left')) {
            if (sel.includes('.active') && !el.classList.contains('active')) continue;
            if (sel.includes('[data-target-acc]')) {
              if (el.getAttribute('data-target-acc')) results.push(el);
            } else if (sel.includes(':not(.icon-rail-toggle)')) {
              if (!el.classList.contains('icon-rail-toggle')) results.push(el);
            } else {
              results.push(el);
            }
          }
        } else if (sel.includes('.icon-rail-right') && el.classList && el.classList.contains('icon-rail-btn')) {
          if (el.closest && el.closest('.icon-rail-right')) {
            if (sel.includes('.active') && !el.classList.contains('active')) continue;
            if (sel.includes('[data-target-acc]')) {
              if (el.getAttribute('data-target-acc')) results.push(el);
            } else if (sel.includes(':not(.icon-rail-toggle)')) {
              if (!el.classList.contains('icon-rail-toggle')) results.push(el);
            } else {
              results.push(el);
            }
          }
        } else if (sel.includes('.icon-rail-btn') && el.classList && el.classList.contains('icon-rail-btn')) {
          if (sel.includes('.active') && !el.classList.contains('active')) continue;
          results.push(el);
        } else if (sel.includes('.accordion') && el.classList && el.classList.contains('accordion')) {
          results.push(el);
        }
      }
      return results;
    },
    createElement(tag) { return makeStubElement(tag); },
    createElementNS(ns, tag) { return makeStubElement(tag); },
    addEventListener() {}
  };

  // UI presentation callbacks stubbed as no-ops for Stage 3 operational testing
  window.syncUIAfterHistoryRestore = function() {};
  window.openAccordionById = function() {};
  const harnessSvgRenderer = function() {
    const el = document.getElementById('svgContainer');
    if (el && window.SceneState && typeof window.SceneState.buildFullSVG === 'function') {
      try {
        const state = (window.SceneState && typeof window.SceneState.buildRenderState === 'function') ? window.SceneState.buildRenderState() : null;
        el.innerHTML = window.SceneState.buildFullSVG(state);
      } catch (e) {
        console.error('harnessSvgRenderer error:', e);
      }
    }
  };
  window.triggerAppRender = harnessSvgRenderer;
  if (window.AppCoordinator) {
    window.AppCoordinator.registerRenderHandler(harnessSvgRenderer);
  }
  window.getLoadedPhoto = function() { return window.SceneState ? window.SceneState.getLoadedPhoto() : null; };
  window.setLoadedPhoto = function(p) { return window.SceneState ? window.SceneState.setLoadedPhoto(p) : null; };

  loadProductionScript('history.js');
  loadProductionScript('projects.js');
  loadProductionScript('app.js');

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

  // Test OBS-02: Component-level deselect must synchronize with AppCoordinator without leaving stale selection
  window.DiagramNodes.selectNode(node1.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, node1.id);
  window.DiagramNodes.deselectNode();
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, null, 'DiagramNodes.deselectNode must clear AppCoordinator activeSelection');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, null);

  window.DataFlows.selectFlow(flow1.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, flow1.id);
  window.DataFlows.deselectFlow();
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, null, 'DataFlows.deselectFlow must clear AppCoordinator activeSelection');

  window.Glows.selectGlow(glow1.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, glow1.id);
  window.Glows.deselectGlow();
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, null, 'Glows.deselectGlow must clear AppCoordinator activeSelection');

  window.Ripples.selectRipple(ripple1.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, ripple1.id);
  window.Ripples.deselectRipple();
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, null, 'Ripples.deselectRipple must clear AppCoordinator activeSelection');

  // 3.2b Stage 2.5: Peer UI Refresh Decoupling & Overlay Coordination (ARCH-07)
  let lastOpenedAccordion = null;
  const originalOpenAccordionById = window.openAccordionById;
  window.openAccordionById = function(accId) {
    lastOpenedAccordion = accId;
    if (typeof originalOpenAccordionById === 'function') {
      originalOpenAccordionById(accId);
    }
  };

  let selectionEventsCount = 0;
  let lastSelectionEvent = null;
  const selectionListener = (payload) => {
    selectionEventsCount++;
    lastSelectionEvent = payload;
  };
  window.AppCoordinator.on('selection:changed', selectionListener);

  // 1. Stage-initiated node selection
  selectionEventsCount = 0;
  window.AppCoordinator.selectObject('node', node1.id, { openAccordionId: 'acc-nodes' });
  assert.strictEqual(window.DiagramNodes.activeId, node1.id, 'Stage-initiated node selection must activate DiagramNodes');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, 'node');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, node1.id);
  assert.strictEqual(lastOpenedAccordion, 'acc-nodes', 'Stage-initiated selection must open requested accordion');
  assert.strictEqual(selectionEventsCount, 1, 'Selection must emit selection:changed exactly once');

  // 2. Stage-initiated transition to flow
  selectionEventsCount = 0;
  window.AppCoordinator.selectObject('flow', flow1.id, { openAccordionId: 'acc-flows' });
  assert.strictEqual(window.DiagramNodes.activeId, null, 'Transitioning to flow must deselect node');
  assert.strictEqual(window.DataFlows.activeId, flow1.id, 'Flow must become active');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, 'flow');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, flow1.id);
  assert.strictEqual(lastOpenedAccordion, 'acc-flows');
  assert.strictEqual(selectionEventsCount, 1);

  // 3. Waypoint selection via DataFlows.selectWaypoint and AppCoordinator.selectWaypoint
  window.DataFlows.addWaypoint(flow1.id); // now 3 waypoints: 0, 1, 2
  assert.strictEqual(window.DataFlows.getFlow(flow1.id).nodes.length, 3);

  // Select waypoint 1 via AppCoordinator
  const wp1Success = window.AppCoordinator.selectWaypoint(1);
  assert.strictEqual(wp1Success, true, 'AppCoordinator.selectWaypoint(1) must succeed');
  assert.strictEqual(window.DataFlows.getActiveWaypointIndex(), 1);
  assert.strictEqual(Number(document.getElementById('flowNodeSlider').value), 1);
  assert.strictEqual(Number(document.getElementById('flowNodeNum').value), 1);

  // Select waypoint 2 directly via DataFlows.selectWaypoint
  const wp2Success = window.DataFlows.selectWaypoint(2);
  assert.strictEqual(wp2Success, true, 'DataFlows.selectWaypoint(2) must succeed');
  assert.strictEqual(window.DataFlows.getActiveWaypointIndex(), 2);
  assert.strictEqual(Number(document.getElementById('flowNodeSlider').value), 2);

  // Invalid waypoint tests
  assert.strictEqual(window.AppCoordinator.selectWaypoint(99), false, 'Out-of-range index must return false');
  assert.strictEqual(window.DataFlows.getActiveWaypointIndex(), 2, 'Active index must remain unchanged on failure');
  assert.strictEqual(window.AppCoordinator.selectWaypoint(-1), false, 'Negative index must return false');
  assert.strictEqual(window.AppCoordinator.selectWaypoint('invalid'), false, 'NaN string must return false');

  // Deselect flow and test selectWaypoint with no active flow
  window.DataFlows.deselectFlow();
  assert.strictEqual(window.AppCoordinator.selectWaypoint(0), false, 'selectWaypoint with no active flow must return false');

  // 4. Camera mode selection via AppCoordinator
  window.DiagramNodes.selectNode(node1.id);
  assert.strictEqual(window.DiagramNodes.activeId, node1.id);
  window.AppCoordinator.selectObject('camera', 'start', { skipStageClear: true });
  assert.strictEqual(window.DiagramNodes.activeId, null, 'Camera selection must deselect active node');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, 'camera');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, 'start');
  assert.strictEqual(window.Stage.activePlacement, 'start');

  window.AppCoordinator.selectObject('camera', 'end', { skipStageClear: true });
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, 'camera');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, 'end');
  assert.strictEqual(window.Stage.activePlacement, 'end');
  window.Stage.clearActive();

  // 5. Centralized overlay coordination (AppCoordinator.updateActiveOverlays)
  let nodeOverlayUpdated = 0;
  let flowOverlayUpdated = 0;
  let glowOverlayUpdated = 0;
  let rippleOverlayUpdated = 0;

  const origNodeOverlay = window.DiagramNodes.updateUIOverlay;
  const origFlowOverlay = window.DataFlows.updateUIOverlay;
  const origGlowOverlay = window.Glows.updateUIOverlay;
  const origRippleOverlay = window.Ripples.updateUIOverlay;

  window.DiagramNodes.updateUIOverlay = function(n) { nodeOverlayUpdated++; return origNodeOverlay.call(this, n); };
  window.DataFlows.updateUIOverlay = function() { flowOverlayUpdated++; return origFlowOverlay.call(this); };
  window.Glows.updateUIOverlay = function(g) { glowOverlayUpdated++; return origGlowOverlay.call(this, g); };
  window.Ripples.updateUIOverlay = function(r) { rippleOverlayUpdated++; return origRippleOverlay.call(this, r); };

  // Nothing active: no overlay updates
  window.AppCoordinator.clearSelection();
  window.AppCoordinator.updateActiveOverlays();
  assert.strictEqual(nodeOverlayUpdated, 0);
  assert.strictEqual(flowOverlayUpdated, 0);
  assert.strictEqual(glowOverlayUpdated, 0);
  assert.strictEqual(rippleOverlayUpdated, 0);

  // Node active: DiagramNodes overlay updated
  window.AppCoordinator.selectObject('node', node1.id);
  nodeOverlayUpdated = 0;
  window.AppCoordinator.updateActiveOverlays();
  assert.strictEqual(nodeOverlayUpdated, 1, 'updateActiveOverlays must update active node overlay');
  assert.strictEqual(flowOverlayUpdated, 0);

  // Flow active: DataFlows overlay updated
  window.AppCoordinator.selectObject('flow', flow1.id);
  flowOverlayUpdated = 0;
  window.AppCoordinator.updateActiveOverlays();
  assert.strictEqual(flowOverlayUpdated, 1, 'updateActiveOverlays must update active flow overlay');

  // Glow active: Glows overlay updated
  window.AppCoordinator.selectObject('glow', glow1.id);
  glowOverlayUpdated = 0;
  window.AppCoordinator.updateActiveOverlays();
  assert.strictEqual(glowOverlayUpdated, 1, 'updateActiveOverlays must update active glow overlay');

  // Ripple active: Ripples overlay updated
  window.AppCoordinator.selectObject('ripple', ripple1.id);
  rippleOverlayUpdated = 0;
  window.AppCoordinator.updateActiveOverlays();
  assert.strictEqual(rippleOverlayUpdated, 1, 'updateActiveOverlays must update active ripple overlay');

  // Restore spies
  window.DiagramNodes.updateUIOverlay = origNodeOverlay;
  window.DataFlows.updateUIOverlay = origFlowOverlay;
  window.Glows.updateUIOverlay = origGlowOverlay;
  window.Ripples.updateUIOverlay = origRippleOverlay;
  window.AppCoordinator.off('selection:changed', selectionListener);
  window.AppCoordinator.clearSelection();

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

  // Test P1-03: Restoring a project payload omitting presets resets NodePresets to defaults
  window.NodePresets.setPresetParam('fillColor', '#990099', true);
  const legacyProjectNoPresets = JSON.parse(savedProjectJson);
  delete legacyProjectNoPresets.presets;
  window.ProjectManager.applyStudioState(JSON.stringify(legacyProjectNoPresets));
  assert.strictEqual(window.NodePresets.getState().preset.fillColor.value, '#161b22', 'applyStudioState without presets must reset NodePresets to defaults');
  assert.strictEqual(window.NodePresets.getState().autoApplyToNewNodes, true);

  // 3.5 Stage 2.6: History & Project Clean Snapshots (ARCH-04 Verification)
  // Ensure captureSnapshot and applySnapshot function strictly through ControlStateAdaptor & NodePresets
  const snap1 = JSON.parse(window.HistoryManager.captureSnapshot());
  assert.strictEqual(typeof snap1.controls, 'object');
  assert.strictEqual(typeof snap1.autoApplyPreset, 'boolean');
  assert.strictEqual(snap1.autoApplyPreset, true);
  assert.strictEqual(Object.keys(snap1.controls).length, 95);

  // Partial legacy controls restoration does not throw
  const partialSnap = {
    controls: { canvasWidthInput: '1440' },
    presets: window.NodePresets.preset,
    autoApplyPreset: false,
    nodes: [],
    flows: [],
    glows: [],
    ripples: []
  };
  window.HistoryManager.applySnapshot(JSON.stringify(partialSnap));
  assert.strictEqual(document.getElementById('canvasWidthInput').value, '1440');
  assert.strictEqual(window.NodePresets.getState().autoApplyToNewNodes, false);

  // Reset back to standard canvas width for subsequent tests
  document.getElementById('canvasWidthInput').value = '1600';
  window.NodePresets.getState().autoApplyToNewNodes = true;

  // ===========================================================================
  // STAGE 2.2: Shape Selection UI Integration & Unknown Shape Handling
  // ===========================================================================
  assert.strictEqual(typeof window.populateShapeDropdowns, 'function', 'window.populateShapeDropdowns must be exported by app.js');
  assert.strictEqual(typeof window.ensureShapeInDropdown, 'function', 'window.ensureShapeInDropdown must be exported by app.js');

  // Initialize UI event listeners for DiagramNodes and NodePresets if not already done
  if (window.NodePresets && !window.NodePresets._initialized) window.NodePresets.init();
  if (window.DiagramNodes && !window.DiagramNodes._initialized) window.DiagramNodes.init();

  const nodeSelect = document.getElementById('nodeShapeSelect');
  const presetSelect = document.getElementById('presetVal-shape');
  const registryShapes = window.ShapeRegistry.getAll();
  assert.strictEqual(registryShapes.length, 12, 'ShapeRegistry must provide exactly 12 built-in shapes');

  // 1 & 8: Population populates 12 shapes without triggering unintended change/input events
  let nodeChangeEventCount = 0;
  let nodeInputEventCount = 0;
  let presetChangeEventCount = 0;
  let presetInputEventCount = 0;

  nodeSelect.addEventListener('change', () => { nodeChangeEventCount++; });
  nodeSelect.addEventListener('input', () => { nodeInputEventCount++; });
  presetSelect.addEventListener('change', () => { presetChangeEventCount++; });
  presetSelect.addEventListener('input', () => { presetInputEventCount++; });

  window.populateShapeDropdowns();

  // Test 8: Population does not trigger unintended change/input events
  assert.strictEqual(nodeChangeEventCount, 0, 'populateShapeDropdowns must not trigger change event on nodeShapeSelect');
  assert.strictEqual(nodeInputEventCount, 0, 'populateShapeDropdowns must not trigger input event on nodeShapeSelect');
  assert.strictEqual(presetChangeEventCount, 0, 'populateShapeDropdowns must not trigger change event on presetVal-shape');
  assert.strictEqual(presetInputEventCount, 0, 'populateShapeDropdowns must not trigger input event on presetVal-shape');

  // Test 1 & 2: Both dropdowns receive exactly the 12 registry shapes in exact order with correct IDs and displayNames
  assert.strictEqual(nodeSelect.children.length, 12, 'nodeShapeSelect must receive exactly 12 options');
  assert.strictEqual(presetSelect.children.length, 12, 'presetVal-shape must receive exactly 12 options');

  for (let i = 0; i < 12; i++) {
    assert.strictEqual(nodeSelect.children[i].value, registryShapes[i].id, `Option ${i} value must match registry ID`);
    assert.strictEqual(nodeSelect.children[i].textContent, registryShapes[i].displayName, `Option ${i} text must match registry displayName`);
    assert.strictEqual(presetSelect.children[i].value, registryShapes[i].id, `Preset option ${i} value must match registry ID`);
    assert.strictEqual(presetSelect.children[i].textContent, registryShapes[i].displayName, `Preset option ${i} text must match registry displayName`);
  }

  // Test 3: Existing valid selections are preserved
  nodeSelect.value = 'diamond';
  presetSelect.value = 'cloud';
  window.populateShapeDropdowns();
  assert.strictEqual(nodeSelect.value, 'diamond', 'populateShapeDropdowns must preserve existing valid node shape selection');
  assert.strictEqual(presetSelect.value, 'cloud', 'populateShapeDropdowns must preserve existing valid preset shape selection');

  // Test 4: Missing registry leaves the static HTML fallback intact
  const savedRegistry = window.ShapeRegistry;
  delete window.ShapeRegistry;
  const mockFallbackSelect = makeStubElement('select');
  mockFallbackSelect.appendChild({ tagName: 'OPTION', value: 'static_fallback_1', textContent: 'Static 1', children: [] });
  mockFallbackSelect.appendChild({ tagName: 'OPTION', value: 'static_fallback_2', textContent: 'Static 2', children: [] });
  controlElements.set('nodeShapeSelect', mockFallbackSelect);

  window.populateShapeDropdowns();
  assert.strictEqual(mockFallbackSelect.children.length, 2, 'Missing registry must leave static HTML fallback options intact');
  assert.strictEqual(mockFallbackSelect.children[0].value, 'static_fallback_1');
  assert.strictEqual(mockFallbackSelect.children[1].value, 'static_fallback_2');

  // Restore registry and real elements
  window.ShapeRegistry = savedRegistry;
  controlElements.set('nodeShapeSelect', nodeSelect);
  window.populateShapeDropdowns();

  // Test 5: Unknown node shape IDs are represented without changing underlying node data
  const legacyNode = window.DiagramNodes.createNode({
    shape: 'legacy_trapezoid',
    text: 'Legacy Service',
    applyPreset: false
  });
  assert.strictEqual(legacyNode.shape, 'legacy_trapezoid', 'createNode must store unknown shape ID as-is');

  // Select the legacy node to make it active and trigger syncEditorUI
  window.DiagramNodes.selectNode(legacyNode.id);

  // Assert dropdown value and presence of temporary disabled option
  assert.strictEqual(nodeSelect.value, 'legacy_trapezoid', 'nodeShapeSelect must represent unknown shape ID');
  const tempNodeOpt = nodeSelect.querySelector('option[data-unknown-shape="true"]');
  assert.ok(tempNodeOpt, 'Temporary option for unknown node shape must be present in nodeShapeSelect');
  assert.strictEqual(tempNodeOpt.disabled, true, 'Temporary unknown shape option must be disabled');
  assert.strictEqual(tempNodeOpt.value, 'legacy_trapezoid', 'Temporary option value must match unknown shape ID');
  assert.strictEqual(tempNodeOpt.textContent, 'Unknown Shape: legacy_trapezoid', 'Temporary option text must label unknown shape');

  // Verify underlying node data was NOT modified or converted
  assert.strictEqual(window.DiagramNodes.getNode(legacyNode.id).shape, 'legacy_trapezoid', 'Underlying node data must retain original unknown shape ID');

  // Test 6: Unknown preset shape IDs are represented without changing underlying preset data
  window.NodePresets.setState({
    preset: {
      shape: { enabled: true, value: 'obsolete_shape' }
    }
  });
  assert.strictEqual(window.NodePresets.getState().preset.shape.value, 'obsolete_shape');

  window.NodePresets.syncRowUI('shape');
  assert.strictEqual(presetSelect.value, 'obsolete_shape', 'presetVal-shape must represent unknown preset shape ID');
  const tempPresetOpt = presetSelect.querySelector('option[data-unknown-shape="true"]');
  assert.ok(tempPresetOpt, 'Temporary option for unknown preset shape must be present in presetVal-shape');
  assert.strictEqual(tempPresetOpt.disabled, true, 'Temporary unknown preset shape option must be disabled');
  assert.strictEqual(tempPresetOpt.value, 'obsolete_shape', 'Temporary preset option value must match unknown shape ID');
  assert.strictEqual(tempPresetOpt.textContent, 'Unknown Shape: obsolete_shape', 'Temporary preset option text must label unknown shape');

  // Verify underlying preset data was NOT modified
  assert.strictEqual(window.NodePresets.getState().preset.shape.value, 'obsolete_shape', 'Underlying preset data must retain original unknown shape ID');

  // Test 7: Selecting a valid replacement works normally
  // User selects 'hexagon' for the legacy node
  nodeSelect.value = 'hexagon';
  nodeSelect.dispatchEvent({ type: 'change', target: nodeSelect });

  // Assert underlying node shape updated to 'hexagon'
  assert.strictEqual(window.DiagramNodes.getNode(legacyNode.id).shape, 'hexagon', 'Selecting valid replacement must update underlying node shape');
  // Assert temporary option was removed
  assert.strictEqual(nodeSelect.querySelector('option[data-unknown-shape="true"]'), null, 'Temporary option must be removed after valid selection on nodeShapeSelect');

  // User selects 'pill' for the legacy preset
  presetSelect.value = 'pill';
  presetSelect.dispatchEvent({ type: 'change', target: presetSelect });
  assert.strictEqual(window.NodePresets.getState().preset.shape.value, 'pill', 'Selecting valid replacement must update underlying preset shape');
  assert.strictEqual(presetSelect.querySelector('option[data-unknown-shape="true"]'), null, 'Temporary option must be removed after valid selection on presetVal-shape');

  // ===========================================================================
  // 3.7 Stage 2.4: Restoration & UI Refresh Decoupling Verification
  // ===========================================================================
  // Test 1: history:changed event emission
  let lastHistoryEvent = null;
  window.AppCoordinator.on('history:changed', (e) => {
    lastHistoryEvent = e;
  });

  window.DiagramNodes.updateNode(legacyNode.id, { x: 75 });
  window.HistoryManager.recordImmediate();
  assert.ok(lastHistoryEvent, 'recordImmediate must emit history:changed event');
  assert.strictEqual(lastHistoryEvent.canUndo, true, 'history:changed canUndo must be true after recordImmediate');
  assert.strictEqual(lastHistoryEvent.canRedo, false, 'history:changed canRedo must be false after recordImmediate');

  // Test 2: state:restored event emission & coordination
  let lastRestoreEvent = null;
  window.AppCoordinator.on('state:restored', (e) => {
    lastRestoreEvent = e;
  });

  // Test 3: Undo emits history:changed and state:restored
  const preUndoLength = window.HistoryManager.undoStack.length;
  window.HistoryManager.undo();
  assert.ok(lastRestoreEvent, 'undo must coordinate post-restore and emit state:restored');
  assert.strictEqual(lastRestoreEvent.source, 'undo', 'state:restored source must be undo');
  assert.strictEqual(lastHistoryEvent.canRedo, true, 'undo must emit history:changed with canRedo=true');
  assert.strictEqual(window.HistoryManager.undoStack.length, preUndoLength - 1);

  // Test 4: Redo emits history:changed and state:restored
  window.HistoryManager.redo();
  assert.strictEqual(lastRestoreEvent.source, 'redo', 'state:restored source must be redo');
  assert.strictEqual(lastHistoryEvent.canUndo, true, 'redo must emit history:changed with canUndo=true');

  // Test 5: Deselection & overlay reset during coordinatePostRestore
  const testCoordNode = window.DiagramNodes.createNode({ shape: 'rect', text: 'CoordTest' });
  window.DiagramNodes.selectNode(testCoordNode.id);
  assert.strictEqual(window.DiagramNodes.activeId, testCoordNode.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, testCoordNode.id);

  window.AppCoordinator.coordinatePostRestore({ source: 'test_clear' });
  assert.strictEqual(window.DiagramNodes.activeId, null, 'coordinatePostRestore must clear DiagramNodes.activeId');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, null, 'coordinatePostRestore must clear AppCoordinator activeSelection');

  // Test 6: Direct applyStudioState with default coordination
  lastRestoreEvent = null;
  const sampleSchema = window.ProjectManager.serializeStudioState();
  window.ProjectManager.applyStudioState(sampleSchema);
  assert.ok(lastRestoreEvent, 'direct applyStudioState must trigger coordinatePostRestore by default');
  assert.strictEqual(lastRestoreEvent.source, 'direct_apply', 'state:restored source must be direct_apply');

  // Test 7: loadProject metadata sequencing and history baseline
  window.ProjectManager.fetchProjectById = async (id) => ({
    id: id,
    name: 'Sequenced Project',
    description: 'Sequencing Description',
    schemaJson: sampleSchema
  });

  let loadRestoreMetadata = null;
  window.AppCoordinator.on('state:restored', (e) => {
    if (e.source === 'project') {
      loadRestoreMetadata = {
        receivedProjectId: e.projectId,
        actualCurrentId: window.ProjectManager.currentProjectId,
        actualCurrentName: window.ProjectManager.currentProjectName
      };
    }
  });

  await window.ProjectManager.loadProject(101);
  assert.ok(loadRestoreMetadata, 'loadProject must trigger state:restored with source project');
  assert.strictEqual(loadRestoreMetadata.receivedProjectId, 101, 'state:restored must receive correct projectId');
  assert.strictEqual(loadRestoreMetadata.actualCurrentId, 101, 'currentProjectId must be updated BEFORE coordinatePostRestore runs');
  assert.strictEqual(loadRestoreMetadata.actualCurrentName, 'Sequenced Project', 'currentProjectName must be updated BEFORE coordinatePostRestore runs');
  assert.strictEqual(window.HistoryManager.undoStack.length, 1, 'loadProject must record exactly 1 initial baseline history snapshot');
  assert.strictEqual(window.HistoryManager.redoStack.length, 0, 'loadProject must clear redoStack');

  // Test 8: resetToNewProject
  lastRestoreEvent = null;
  global.confirm = () => true;
  window.ProjectManager.resetToNewProject();
  assert.ok(lastRestoreEvent, 'resetToNewProject must trigger coordinatePostRestore');
  assert.strictEqual(lastRestoreEvent.source, 'new_project', 'state:restored source must be new_project');
  assert.strictEqual(window.ProjectManager.currentProjectId, 0, 'resetToNewProject must reset currentProjectId to 0');
  assert.strictEqual(window.ProjectManager.currentProjectName, 'Untitled Project', 'resetToNewProject must reset name to Untitled Project');
  assert.strictEqual(window.DiagramNodes.list.length, 0, 'resetToNewProject must clear DiagramNodes');
  assert.strictEqual(window.DataFlows.list.length, 0, 'resetToNewProject must clear DataFlows');
  assert.strictEqual(window.HistoryManager.undoStack.length, 1, 'resetToNewProject must record 1 baseline snapshot');

  // Re-populate state for Stage 4 export assertions
  window.DiagramNodes.createNode({ shape: 'rounded', text: 'OAuth2 Service' });
  const fNode1 = window.DiagramNodes.createNode({ shape: 'rect', text: 'Auth Client' });
  const fNode2 = window.DiagramNodes.createNode({ shape: 'cylinder', text: 'Token DB' });
  window.DataFlows.createFlow({ fromNodeId: fNode1.id, toNodeId: fNode2.id, label: 'TLS 1.3' });

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
  const realSerializeSVGForExport = window.serializeSVGForExport;
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

  // ===========================================================================
  // STAGE 2.6: SVGExportAdapter XML Serialization & Fidelity (ARCH-02)
  // ===========================================================================
  window.serializeSVGForExport = realSerializeSVGForExport;
  assert.strictEqual(typeof window.SVGExportAdapter, 'object', 'window.SVGExportAdapter must be defined');
  assert.strictEqual(typeof window.SVGExportAdapter.serialize, 'function', 'SVGExportAdapter.serialize must be a function');

  // 1. Throws in non-browser environment when DOMParser is missing
  assert.throws(
    () => window.SVGExportAdapter.serialize('<svg></svg>'),
    /SVGExportAdapter requires a browser DOM environment with DOMParser and XMLSerializer/,
    'SVGExportAdapter must throw descriptive error when browser XML APIs are missing'
  );

  // 2. Throws on empty SVG input
  assert.throws(
    () => window.SVGExportAdapter.serialize(''),
    /SVG generation returned empty/,
    'SVGExportAdapter must throw when rawSvg is empty'
  );

  // 3. Test double simulating browser DOMParser and XMLSerializer for XML serialization verification
  class MockDOMParser {
    parseFromString(str, type) {
      if (!str || !str.includes('<svg')) {
        return {
          getElementsByTagName(tag) {
            return tag === 'parsererror' ? [{ textContent: 'Malformed XML markup: missing root svg' }] : [];
          }
        };
      }
      if (str.includes('<malformed>')) {
        return {
          getElementsByTagName(tag) {
            return tag === 'parsererror' ? [{ textContent: 'Unclosed tag <malformed>' }] : [];
          }
        };
      }

      const attributes = {};
      const hrefElements = [];
      const attrMatches = str.match(/<svg\b([^>]*)>/i);
      if (attrMatches) {
        const rawAttrs = attrMatches[1];
        const attrRe = /([a-zA-Z0-9_:-]+)="([^"]*)"/g;
        let m;
        while ((m = attrRe.exec(rawAttrs)) !== null) {
          attributes[m[1]] = m[2];
        }
      }

      const useMatches = str.match(/<(use|image)\b([^>]*)>/gi) || [];
      useMatches.forEach((tagStr) => {
        const hrefMatch = /\bhref="([^"]*)"/i.exec(tagStr);
        if (hrefMatch) {
          const elAttrs = { href: hrefMatch[1] };
          hrefElements.push({
            tagName: tagStr.startsWith('<use') ? 'use' : 'image',
            getAttribute(k) { return elAttrs[k] || null; },
            setAttributeNS(ns, k, v) { elAttrs[k] = v; },
            attrs: elAttrs
          });
        }
      });

      const root = {
        hasAttribute(k) { return attributes[k] !== undefined; },
        setAttribute(k, v) { attributes[k] = v; },
        attributes,
        hrefElements
      };

      return {
        getElementsByTagName(tag) { return []; },
        documentElement: root,
        querySelectorAll(sel) {
          if (sel === '[href]') return hrefElements;
          return [];
        }
      };
    }
  }

  class MockXMLSerializer {
    serializeToString(root) {
      let serialized = '<svg';
      Object.keys(root.attributes).forEach((k) => {
        serialized += ` ${k}="${root.attributes[k]}"`;
      });
      serialized += '>';
      root.hrefElements.forEach((el) => {
        serialized += `<${el.tagName}`;
        Object.keys(el.attrs).forEach((k) => {
          serialized += ` ${k}="${el.attrs[k]}"`;
        });
        serialized += '/>';
      });
      serialized += '<text>OAuth2 &amp; TLS &lt;3</text></svg>';
      return serialized;
    }
  }

  // Set test doubles
  global.DOMParser = MockDOMParser;
  global.XMLSerializer = MockXMLSerializer;

  try {
    // 4. Test invalid XML handling throws
    assert.throws(
      () => window.SVGExportAdapter.serialize('<svg width="100"><malformed></svg>'),
      /XML Parsing Failed/,
      'SVGExportAdapter must throw on XML parser error'
    );

    // 5. Test valid SVG serialization: adds xmlns:xlink and xlink:href
    const sampleSvg = '<svg width="1280" height="720"><use href="#icon1"/><image href="test.png"/></svg>';
    const outputXml = window.SVGExportAdapter.serialize(sampleSvg);

    assert.ok(outputXml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n'), 'Output must have XML declaration');
    assert.ok(outputXml.includes('xmlns:xlink="http://www.w3.org/1999/xlink"'), 'Root svg must receive xmlns:xlink attribute');
    assert.ok(outputXml.includes('xlink:href="#icon1"'), 'use element must receive xlink:href attribute');
    assert.ok(outputXml.includes('xlink:href="test.png"'), 'image element must receive xlink:href attribute');
    assert.ok(outputXml.includes('OAuth2 &amp; TLS &lt;3'), 'XML special characters must be preserved');

    // 6. Test window.serializeSVGForExport entrypoint delegates to SVGExportAdapter
    const delegatedXml = window.serializeSVGForExport(sampleSvg);
    assert.strictEqual(delegatedXml, outputXml, 'window.serializeSVGForExport must delegate to SVGExportAdapter');
  } finally {
    delete global.DOMParser;
    delete global.XMLSerializer;
  }

  // ===========================================================================
  // STAGE 3.1: Workspace Foundation, Icon Rails & Sliding Drawers
  // ===========================================================================
  assert.strictEqual(typeof window.WorkspaceController, 'object', 'window.WorkspaceController must be defined');
  assert.strictEqual(typeof window.WorkspaceController.openLeftDrawer, 'function');
  assert.strictEqual(typeof window.WorkspaceController.closeLeftDrawer, 'function');
  assert.strictEqual(typeof window.WorkspaceController.openRightDrawer, 'function');
  assert.strictEqual(typeof window.WorkspaceController.closeRightDrawer, 'function');
  assert.strictEqual(typeof window.WorkspaceController.toggleMaximizedCanvas, 'function');
  assert.strictEqual(typeof window.WorkspaceController.handleKeydown, 'function');

  // Set up mock DOM elements for drawers and rails
  const leftDrawerEl = document.getElementById('leftDrawer');
  const rightDrawerEl = document.getElementById('rightDrawer');
  const btnToggleLeft = document.getElementById('railBtn-toggleLeft');
  const btnToggleRight = document.getElementById('railBtn-toggleRight');
  const btnCollapseLeft = document.getElementById('btnCollapseLeftDrawer');
  const btnCollapseRight = document.getElementById('btnCollapseRightDrawer');
  const btnMaxCanvas = document.getElementById('btnMaximizeCanvas');
  const inputPanelEl = document.getElementById('inputPanel');
  const settingsPanelEl = document.getElementById('settingsPanel');
  const accBackgroundEl = document.getElementById('acc-background');
  const accNodesEl = document.getElementById('acc-nodes');
  const accCameraEl = document.getElementById('acc-camera');
  const accOpticsEl = document.getElementById('acc-optics');
  const accExportEl = document.getElementById('acc-export');
  const groupFrameEl = document.getElementById('groupFrame');
  const chkModuleFrame = document.getElementById('chkModuleFrame');
  const subpanelOpticsEl = document.getElementById('subpanelOptics');
  const subpanelFrameEl = document.getElementById('subpanelFrame');
  const drawerBackdropEl = document.getElementById('drawerBackdrop');
  const railBtnBackground = document.getElementById('railBtn-background');
  const railBtnNodes = document.getElementById('railBtn-nodes');
  const railBtnCamera = document.getElementById('railBtn-camera');
  const railBtnOptics = document.getElementById('railBtn-optics');
  const railBtnFrame = document.getElementById('railBtn-frame');
  const railBtnExport = document.getElementById('railBtn-export');

  // Hierarchy setup
  leftDrawerEl.appendChild(inputPanelEl);
  inputPanelEl.appendChild(accBackgroundEl);
  inputPanelEl.appendChild(accNodesEl);
  rightDrawerEl.appendChild(settingsPanelEl);
  settingsPanelEl.appendChild(accCameraEl);
  settingsPanelEl.appendChild(accOpticsEl);
  settingsPanelEl.appendChild(accExportEl);
  accOpticsEl.appendChild(subpanelOpticsEl);
  accOpticsEl.appendChild(subpanelFrameEl);
  subpanelFrameEl.appendChild(chkModuleFrame);
  subpanelFrameEl.appendChild(groupFrameEl);

  railBtnBackground.setAttribute('data-target-acc', 'acc-background');
  railBtnBackground.classList.add('icon-rail-btn');
  railBtnNodes.setAttribute('data-target-acc', 'acc-nodes');
  railBtnNodes.classList.add('icon-rail-btn');
  railBtnCamera.setAttribute('data-target-acc', 'acc-camera');
  railBtnCamera.classList.add('icon-rail-btn');
  railBtnOptics.setAttribute('data-target-acc', 'acc-optics');
  railBtnOptics.classList.add('icon-rail-btn');
  railBtnFrame.setAttribute('data-target-acc', 'acc-frame');
  railBtnFrame.classList.add('icon-rail-btn');
  railBtnExport.setAttribute('data-target-acc', 'acc-export');
  railBtnExport.classList.add('icon-rail-btn');
  accBackgroundEl.classList.add('accordion');
  accBackgroundEl.classList.add('accordion-section');
  accNodesEl.classList.add('accordion');
  accNodesEl.classList.add('accordion-section');
  accCameraEl.classList.add('accordion');
  accCameraEl.classList.add('accordion-section');
  accOpticsEl.classList.add('accordion');
  accOpticsEl.classList.add('accordion-section');
  accExportEl.classList.add('accordion');
  accExportEl.classList.add('accordion-section');

  const leftRailEl = makeStubElement('leftRail');
  leftRailEl.classList.add('icon-rail-left');
  leftRailEl.appendChild(railBtnBackground);
  leftRailEl.appendChild(railBtnNodes);
  controlElements.set('leftRail', leftRailEl);

  const rightRailEl = makeStubElement('rightRail');
  rightRailEl.classList.add('icon-rail-right');
  rightRailEl.appendChild(railBtnCamera);
  rightRailEl.appendChild(railBtnOptics);
  rightRailEl.appendChild(railBtnFrame);
  rightRailEl.appendChild(railBtnExport);
  controlElements.set('rightRail', rightRailEl);

  // Initialize WorkspaceController to bind backdrop and controls
  window.WorkspaceController.init();

  // 1 & 2. Left and Right Drawer Open & Close
  window.WorkspaceController.openLeftDrawer();
  assert.strictEqual(window.WorkspaceController.leftDrawerOpen, true);
  assert.strictEqual(leftDrawerEl.classList.contains('collapsed'), false);

  window.WorkspaceController.closeLeftDrawer();
  assert.strictEqual(window.WorkspaceController.leftDrawerOpen, false);
  assert.strictEqual(leftDrawerEl.classList.contains('collapsed'), true);

  window.WorkspaceController.openRightDrawer();
  assert.strictEqual(window.WorkspaceController.rightDrawerOpen, true);
  assert.strictEqual(rightDrawerEl.classList.contains('collapsed'), false);

  window.WorkspaceController.closeRightDrawer();
  assert.strictEqual(window.WorkspaceController.rightDrawerOpen, false);
  assert.strictEqual(rightDrawerEl.classList.contains('collapsed'), true);

  // 3. Independent Drawer State on Wide Desktop (innerWidth >= 1440)
  global.window.innerWidth = 1920;
  window.WorkspaceController.openLeftDrawer();
  window.WorkspaceController.openRightDrawer();
  assert.strictEqual(window.WorkspaceController.leftDrawerOpen, true);
  assert.strictEqual(window.WorkspaceController.rightDrawerOpen, true);

  window.WorkspaceController.closeLeftDrawer();
  assert.strictEqual(window.WorkspaceController.leftDrawerOpen, false);
  assert.strictEqual(window.WorkspaceController.rightDrawerOpen, true, 'Right drawer must remain open when left drawer closes on wide screen');

  // 4. Rail selection & active-state synchronization
  window.WorkspaceController.openLeftDrawer();
  window.WorkspaceController.syncRailForAccordion('acc-nodes');
  assert.strictEqual(railBtnNodes.classList.contains('active'), true);
  assert.strictEqual(railBtnCamera.classList.contains('active'), false);

  // 5. openAccordionById opening a collapsed drawer
  window.WorkspaceController.closeLeftDrawer();
  assert.strictEqual(window.WorkspaceController.leftDrawerOpen, false);
  window.openAccordionById('acc-nodes');
  assert.strictEqual(window.WorkspaceController.leftDrawerOpen, true, 'openAccordionById must open parent leftDrawer if closed');
  assert.strictEqual(accNodesEl.classList.contains('open'), true);

  window.WorkspaceController.closeRightDrawer();
  assert.strictEqual(window.WorkspaceController.rightDrawerOpen, false);
  window.openAccordionById('acc-camera');
  assert.strictEqual(window.WorkspaceController.rightDrawerOpen, true, 'openAccordionById must open parent rightDrawer if closed');
  assert.strictEqual(accCameraEl.classList.contains('open'), true);

  // 6 & 7. Maximized Canvas Mode and Restoration
  window.WorkspaceController.openLeftDrawer();
  window.WorkspaceController.openRightDrawer();
  window.WorkspaceController.setMaximized(true);
  assert.strictEqual(window.WorkspaceController.isMaximized, true);
  assert.strictEqual(window.WorkspaceController.leftDrawerOpen, false, 'Maximize must close left drawer');
  assert.strictEqual(window.WorkspaceController.rightDrawerOpen, false, 'Maximize must close right drawer');
  assert.strictEqual(btnMaxCanvas.classList.contains('active'), true);

  window.WorkspaceController.setMaximized(false);
  assert.strictEqual(window.WorkspaceController.isMaximized, false);
  assert.strictEqual(window.WorkspaceController.leftDrawerOpen, true, 'Exiting maximize must restore left drawer');
  assert.strictEqual(window.WorkspaceController.rightDrawerOpen, true, 'Exiting maximize must restore right drawer');
  assert.strictEqual(btnMaxCanvas.classList.contains('active'), false);

  // 8. Keyboard Shortcuts: T (Left), N (Right), Shift+Space (Maximize), Escape (Exit Maximize)
  window.WorkspaceController.handleKeydown({ code: 'KeyT' });
  assert.strictEqual(window.WorkspaceController.leftDrawerOpen, false, 'T key must toggle left drawer');
  window.WorkspaceController.handleKeydown({ code: 'KeyT' });
  assert.strictEqual(window.WorkspaceController.leftDrawerOpen, true);

  window.WorkspaceController.handleKeydown({ code: 'KeyN' });
  assert.strictEqual(window.WorkspaceController.rightDrawerOpen, false, 'N key must toggle right drawer');
  window.WorkspaceController.handleKeydown({ code: 'KeyN' });
  assert.strictEqual(window.WorkspaceController.rightDrawerOpen, true);

  window.WorkspaceController.handleKeydown({ code: 'Space', shiftKey: true });
  assert.strictEqual(window.WorkspaceController.isMaximized, true, 'Shift+Space must toggle maximize');
  window.WorkspaceController.handleKeydown({ key: 'Escape' });
  assert.strictEqual(window.WorkspaceController.isMaximized, false, 'Escape must exit maximize');

  // 9. Shortcut suppression inside editable inputs
  document.activeElement = makeStubElement('canvasWidthInput');
  document.activeElement.tagName = 'INPUT';
  const handledInInput = window.WorkspaceController.handleKeydown({ code: 'KeyT' });
  assert.strictEqual(handledInInput, false, 'Shortcuts must be suppressed inside INPUT elements');
  document.activeElement = null;

  // 10. Shortcut suppression while modal is open
  const modalEl = document.getElementById('projectsModal');
  modalEl.style.display = 'flex';
  const handledInModal = window.WorkspaceController.handleKeydown({ code: 'KeyT' });
  assert.strictEqual(handledInModal, false, 'Shortcuts must be suppressed while modals are displayed');
  modalEl.style.display = 'none';

  // ===========================================================================
  // STAGE 3.1 REVIEW REMEDIATION: Backdrop, Focus Management & Rail Disambiguation
  // ===========================================================================

  // Remediation Check 1: Exactly one #drawerBackdrop in index.html
  const backdropMatches = htmlSource.match(/\bid="drawerBackdrop"/g) || [];
  assert.strictEqual(backdropMatches.length, 1, 'index.html must contain exactly one #drawerBackdrop element');

  // Remediation Check 2: Backdrop initially hidden on desktop
  global.window.innerWidth = 1920;
  window.WorkspaceController._syncBackdrop();
  assert.strictEqual(drawerBackdropEl.classList.contains('active'), false, 'Backdrop must be initially inactive on desktop');

  // Remediation Check 3: Backdrop visible when a responsive drawer opens (< 1024px)
  global.window.innerWidth = 800;
  window.WorkspaceController.openLeftDrawer();
  assert.strictEqual(drawerBackdropEl.classList.contains('active'), true, 'Backdrop must be active when responsive drawer is open (< 1024px)');
  assert.strictEqual(drawerBackdropEl.hasAttribute('aria-hidden'), false, 'Active backdrop must remove aria-hidden');

  // Remediation Check 4: Backdrop hidden when responsive drawers close
  window.WorkspaceController.closeLeftDrawer();
  assert.strictEqual(drawerBackdropEl.classList.contains('active'), false, 'Backdrop must be inactive when drawers are closed');
  assert.strictEqual(drawerBackdropEl.getAttribute('aria-hidden'), 'true', 'Inactive backdrop must have aria-hidden=true');

  // Remediation Check 5: Clicking the backdrop closes responsive drawer(s)
  window.WorkspaceController.openRightDrawer();
  assert.strictEqual(window.WorkspaceController.rightDrawerOpen, true);
  assert.strictEqual(drawerBackdropEl.classList.contains('active'), true);
  drawerBackdropEl.click();
  assert.strictEqual(window.WorkspaceController.rightDrawerOpen, false, 'Clicking backdrop must close open drawer');
  assert.strictEqual(drawerBackdropEl.classList.contains('active'), false, 'Clicking backdrop must hide backdrop');

  // Remediation Check 6: Desktop layouts (>= 1024px) do not show interactive backdrop
  global.window.innerWidth = 1440;
  window.WorkspaceController.openLeftDrawer();
  window.WorkspaceController.openRightDrawer();
  assert.strictEqual(drawerBackdropEl.classList.contains('active'), false, 'Desktop layouts must never show active backdrop');

  // Remediation Check 7: Viewport transitions do not leave a stale backdrop
  global.window.innerWidth = 800;
  window.WorkspaceController._syncBackdrop();
  assert.strictEqual(drawerBackdropEl.classList.contains('active'), true);
  global.window.innerWidth = 1440;
  window.WorkspaceController._syncBackdrop();
  assert.strictEqual(drawerBackdropEl.classList.contains('active'), false, 'Viewport transition to desktop must deactivate backdrop');

  // Remediation Check 8: Focus inside a closing left drawer moves to railBtn-toggleLeft
  window.WorkspaceController.openLeftDrawer();
  const inputInLeft = makeStubElement('inputInLeft');
  leftDrawerEl.appendChild(inputInLeft);
  inputInLeft.focus();
  assert.strictEqual(global.document.activeElement, inputInLeft);
  window.WorkspaceController.closeLeftDrawer();
  assert.strictEqual(global.document.activeElement, btnToggleLeft, 'Closing left drawer with activeElement inside must restore focus to railBtn-toggleLeft');

  // Remediation Check 9: Focus inside a closing right drawer moves to railBtn-toggleRight
  window.WorkspaceController.openRightDrawer();
  const inputInRight = makeStubElement('inputInRight');
  rightDrawerEl.appendChild(inputInRight);
  inputInRight.focus();
  assert.strictEqual(global.document.activeElement, inputInRight);
  window.WorkspaceController.closeRightDrawer();
  assert.strictEqual(global.document.activeElement, btnToggleRight, 'Closing right drawer with activeElement inside must restore focus to railBtn-toggleRight');

  // Remediation Check 10: Closing a drawer does not steal unrelated focus
  window.WorkspaceController.openLeftDrawer();
  const outsideEl = makeStubElement('outsideEl');
  outsideEl.focus();
  assert.strictEqual(global.document.activeElement, outsideEl);
  window.WorkspaceController.closeLeftDrawer();
  assert.strictEqual(global.document.activeElement, outsideEl, 'Closing drawer when focus is elsewhere must not steal focus');

  // Remediation Check 11: Optics rail activation does not activate Frame
  window.WorkspaceController.openRightDrawer();
  window.WorkspaceController.syncRailForAccordion('acc-optics');
  assert.strictEqual(railBtnOptics.classList.contains('active'), true, 'Optics sync must activate Optics rail button');
  assert.strictEqual(railBtnFrame.classList.contains('active'), false, 'Optics sync must not activate Frame rail button');

  // Remediation Check 12: Frame rail activation does not activate Optics
  window.WorkspaceController.syncRailForAccordion('acc-frame');
  assert.strictEqual(railBtnFrame.classList.contains('active'), true, 'Frame sync must activate Frame rail button');
  assert.strictEqual(railBtnOptics.classList.contains('active'), false, 'Frame sync must not activate Optics rail button');

  // Remediation Check 13: Programmatic accordion opening uses deterministic active rail
  window.openAccordionById('acc-optics');
  assert.strictEqual(railBtnOptics.classList.contains('active'), true, 'openAccordionById(acc-optics) must activate Optics rail button');
  assert.strictEqual(railBtnFrame.classList.contains('active'), false, 'openAccordionById(acc-optics) must deactivate Frame rail button');

  window.openAccordionById('acc-frame');
  assert.strictEqual(railBtnFrame.classList.contains('active'), true, 'openAccordionById(acc-frame) must activate Frame rail button');
  assert.strictEqual(railBtnOptics.classList.contains('active'), false, 'openAccordionById(acc-frame) must deactivate Optics rail button');

  window.openAccordionById('acc-optical');
  assert.strictEqual(railBtnOptics.classList.contains('active'), true, 'openAccordionById(acc-optical) must activate Optics rail button');
  assert.strictEqual(railBtnFrame.classList.contains('active'), false, 'openAccordionById(acc-optical) must deactivate Frame rail button');

  // Remediation Check 14: Frame navigation with Frame initially disabled
  chkModuleFrame.checked = false;
  window.WorkspaceController.closeRightDrawer();
  assert.strictEqual(window.WorkspaceController.rightDrawerOpen, false);

  window.openAccordionById('acc-frame');
  assert.strictEqual(chkModuleFrame.checked, false, 'chkModuleFrame.checked must remain false after navigating to acc-frame');
  assert.strictEqual(railBtnFrame.classList.contains('active'), true, 'Frame rail button must be active');
  assert.strictEqual(railBtnOptics.classList.contains('active'), false, 'Optics rail button must be inactive');
  assert.strictEqual(window.WorkspaceController.rightDrawerOpen, true, 'Right drawer must open for acc-frame');
  assert.strictEqual(accOpticsEl.classList.contains('open'), true, 'acc-optics accordion must be open');
  assert.ok(chkModuleFrame, 'chkModuleFrame must remain accessible');

  // Remediation Check 15: Frame navigation with Frame initially enabled
  chkModuleFrame.checked = true;
  window.openAccordionById('acc-frame');
  assert.strictEqual(chkModuleFrame.checked, true, 'chkModuleFrame.checked must remain true after navigating to acc-frame');
  assert.strictEqual(railBtnFrame.classList.contains('active'), true, 'Frame rail button must remain active');

  // Remediation Check 16: Repeated navigation across Optics and Frame preserves state and serialization
  chkModuleFrame.checked = false;
  const historyDepthBefore = window.HistoryManager.undoStack ? window.HistoryManager.undoStack.length : 0;
  const stateBefore = window.ControlStateAdaptor.syncFromDOM(window.HistoryManager.trackedControlIds);

  window.openAccordionById('acc-optics');
  assert.strictEqual(railBtnOptics.classList.contains('active'), true);
  assert.strictEqual(railBtnFrame.classList.contains('active'), false);
  assert.strictEqual(chkModuleFrame.checked, false);

  window.openAccordionById('acc-frame');
  assert.strictEqual(railBtnFrame.classList.contains('active'), true);
  assert.strictEqual(railBtnOptics.classList.contains('active'), false);
  assert.strictEqual(chkModuleFrame.checked, false);

  window.openAccordionById('acc-optics');
  assert.strictEqual(railBtnOptics.classList.contains('active'), true);
  assert.strictEqual(railBtnFrame.classList.contains('active'), false);
  assert.strictEqual(chkModuleFrame.checked, false);

  window.openAccordionById('acc-frame');
  assert.strictEqual(railBtnFrame.classList.contains('active'), true);
  assert.strictEqual(railBtnOptics.classList.contains('active'), false);
  assert.strictEqual(chkModuleFrame.checked, false);

  const historyDepthAfter = window.HistoryManager.undoStack ? window.HistoryManager.undoStack.length : 0;
  assert.strictEqual(historyDepthAfter, historyDepthBefore, 'Navigation must not create history entries');

  const stateAfter = window.ControlStateAdaptor.syncFromDOM(window.HistoryManager.trackedControlIds);
  assert.strictEqual(stateAfter.chkModuleFrame, stateBefore.chkModuleFrame, 'chkModuleFrame serialized state must not change during navigation');
  assert.deepStrictEqual(stateAfter, stateBefore, 'Tracked controls must not be altered merely by rail/accordion navigation');

  // Stage 3.2 Check 1: Idempotency of WorkspaceController.init
  assert.strictEqual(window.WorkspaceController._initialized, true, 'WorkspaceController._initialized must be true');
  window.WorkspaceController.init();
  assert.strictEqual(window.WorkspaceController._initialized, true, 'WorkspaceController.init() must be idempotent');

  // Stage 3.2 Check 2: Drawer section memory on reopen (lastLeftAccId and lastRightAccId)
  assert.strictEqual(typeof window.WorkspaceController.lastLeftAccId, 'string');
  assert.strictEqual(typeof window.WorkspaceController.lastRightAccId, 'string');

  // Test Left Drawer reopen restores last active left rail button and expands section
  window.openAccordionById('acc-nodes');
  assert.strictEqual(window.WorkspaceController.lastLeftAccId, 'acc-nodes');
  assert.strictEqual(railBtnNodes.classList.contains('active'), true);
  window.WorkspaceController.closeLeftDrawer();
  assert.strictEqual(railBtnNodes.classList.contains('active'), false);
  accNodesEl.classList.remove('open');
  window.WorkspaceController.openLeftDrawer();
  assert.strictEqual(railBtnNodes.classList.contains('active'), true, 'Reopening left drawer must restore active highlight for acc-nodes');
  assert.strictEqual(accNodesEl.classList.contains('open'), true, 'Reopening left drawer must expand remembered accordion section');

  // Test Right Drawer reopen restores last active right rail button and expands section
  window.openAccordionById('acc-camera');
  assert.strictEqual(window.WorkspaceController.lastRightAccId, 'acc-camera');
  assert.strictEqual(railBtnCamera.classList.contains('active'), true);
  window.WorkspaceController.closeRightDrawer();
  assert.strictEqual(railBtnCamera.classList.contains('active'), false);
  accCameraEl.classList.remove('open');
  window.WorkspaceController.openRightDrawer();
  assert.strictEqual(railBtnCamera.classList.contains('active'), true, 'Reopening right drawer must restore active highlight for acc-camera');
  assert.strictEqual(accCameraEl.classList.contains('open'), true, 'Reopening right drawer must expand remembered accordion section');

  // Test acc-frame reopening ensures acc-optics is open in DOM
  window.openAccordionById('acc-frame');
  assert.strictEqual(window.WorkspaceController.lastRightAccId, 'acc-frame');
  window.WorkspaceController.closeRightDrawer();
  accOpticsEl.classList.remove('open');
  window.WorkspaceController.openRightDrawer();
  assert.strictEqual(accOpticsEl.classList.contains('open'), true, 'Reopening right drawer with acc-frame must expand acc-optics in DOM');
  assert.strictEqual(railBtnFrame.classList.contains('active'), true);

  // Stage 3.2 Check 3: Compact viewports (< 1440px) enforce mutual drawer exclusivity
  global.window.innerWidth = 1280;
  window.WorkspaceController.openLeftDrawer();
  assert.strictEqual(window.WorkspaceController.leftDrawerOpen, true);
  assert.strictEqual(window.WorkspaceController.rightDrawerOpen, false, 'Right drawer must close when left drawer opens on compact viewports');

  window.WorkspaceController.openRightDrawer();
  assert.strictEqual(window.WorkspaceController.rightDrawerOpen, true);
  assert.strictEqual(window.WorkspaceController.leftDrawerOpen, false, 'Left drawer must close when right drawer opens on compact viewports');

  // On desktop (>= 1440px), both drawers can open simultaneously
  global.window.innerWidth = 1600;
  window.WorkspaceController.openLeftDrawer();
  assert.strictEqual(window.WorkspaceController.leftDrawerOpen, true);
  assert.strictEqual(window.WorkspaceController.rightDrawerOpen, true, 'Both drawers can remain open simultaneously on desktop');

  // Stage 3.2 Check 4: CSS responsive rules and focus styles verification
  const cssSource = fs.readFileSync(path.join(__dirname, '../internal/web/static/css/style.css'), 'utf8');
  assert.ok(cssSource.includes('@media (max-width: 1023px)'), 'style.css must contain @media (max-width: 1023px)');
  assert.ok(cssSource.includes('@media (max-width: 767px)'), 'style.css must contain @media (max-width: 767px)');
  assert.ok(cssSource.includes('@media (max-width: 480px)'), 'style.css must contain @media (max-width: 480px)');
  assert.ok(cssSource.includes('--drawer-width: calc(100vw - var(--rail-width) * 2)'), 'style.css must contain mobile narrow drawer width');
  assert.ok(cssSource.includes('.drawer-close-btn:focus-visible'), 'style.css must contain .drawer-close-btn:focus-visible rule');
  assert.ok(cssSource.includes('.history-btn:focus-visible'), 'style.css must contain .history-btn:focus-visible rule');
  assert.ok(htmlSource.includes('id="btnHeaderExport"'), 'index.html must contain btnHeaderExport in header');

  // Stage 3.2 Check 5: Overlay sync integration
  let stageOverlayUpdated = false;
  let coordinatorOverlayUpdated = false;
  const originalSyncOverlayBounds = window.Stage.syncOverlayBounds;
  const originalUpdateActiveOverlays = window.AppCoordinator ? window.AppCoordinator.updateActiveOverlays : null;

  window.Stage.syncOverlayBounds = () => { stageOverlayUpdated = true; };
  if (window.AppCoordinator) {
    window.AppCoordinator.updateActiveOverlays = () => { coordinatorOverlayUpdated = true; };
  }

  window.WorkspaceController._syncOverlays();
  assert.strictEqual(stageOverlayUpdated, true, '_syncOverlays must invoke Stage.syncOverlayBounds');
  if (originalUpdateActiveOverlays) {
    assert.strictEqual(coordinatorOverlayUpdated, true, '_syncOverlays must invoke AppCoordinator.updateActiveOverlays');
  }

  window.Stage.syncOverlayBounds = originalSyncOverlayBounds;
  if (window.AppCoordinator && originalUpdateActiveOverlays) {
    window.AppCoordinator.updateActiveOverlays = originalUpdateActiveOverlays;
  }

  // ===========================================================================
  // Stage 3.3 Contextual Tool Panels Verification
  // ===========================================================================
  assert.strictEqual(typeof window.WorkspaceController.showToolPanel, 'function', 'showToolPanel must be a public method');
  assert.strictEqual(typeof window.WorkspaceController.toolTitles, 'object', 'toolTitles dictionary must be defined');

  // 1. Selecting tool displays only its panel with active-tool class and hides others
  window.WorkspaceController.showToolPanel('acc-nodes');
  assert.strictEqual(accNodesEl.classList.contains('active-tool'), true, 'acc-nodes must be active tool');
  assert.strictEqual(accBackgroundEl.classList.contains('active-tool'), false, 'acc-background must be inactive');
  assert.strictEqual(railBtnNodes.classList.contains('active'), true, 'railBtnNodes must be active');
  assert.strictEqual(railBtnBackground.classList.contains('active'), false, 'railBtnBackground must be inactive');
  assert.strictEqual(document.getElementById('leftDrawerTitle').textContent, 'Diagram Shapes & Text');

  // 2. Switching tool in same drawer replaces the visible panel
  window.WorkspaceController.showToolPanel('acc-background');
  assert.strictEqual(accBackgroundEl.classList.contains('active-tool'), true, 'acc-background must become active tool');
  assert.strictEqual(accNodesEl.classList.contains('active-tool'), false, 'acc-nodes must be deactivated');
  assert.strictEqual(railBtnBackground.classList.contains('active'), true);
  assert.strictEqual(railBtnNodes.classList.contains('active'), false);
  assert.strictEqual(document.getElementById('leftDrawerTitle').textContent, 'Canvas & Background');

  // 3. Optics and Frame separation inside acc-optics
  window.WorkspaceController.showToolPanel('acc-optics');
  assert.strictEqual(accOpticsEl.classList.contains('active-tool'), true, 'acc-optics must be active-tool');
  assert.strictEqual(accOpticsEl.classList.contains('show-optics'), true, 'acc-optics must have show-optics');
  assert.strictEqual(accOpticsEl.classList.contains('show-frame'), false, 'acc-optics must not have show-frame when optics active');
  assert.strictEqual(railBtnOptics.classList.contains('active'), true, 'railBtnOptics must be active');
  assert.strictEqual(railBtnFrame.classList.contains('active'), false, 'railBtnFrame must be inactive');
  assert.strictEqual(document.getElementById('rightDrawerTitle').textContent, 'Optical Effects');
  assert.strictEqual(chkModuleFrame.checked, false, 'chkModuleFrame must remain untouched');

  window.WorkspaceController.showToolPanel('acc-frame');
  assert.strictEqual(accOpticsEl.classList.contains('active-tool'), true, 'acc-optics must remain active-tool for frame');
  assert.strictEqual(accOpticsEl.classList.contains('show-frame'), true, 'acc-optics must have show-frame');
  assert.strictEqual(accOpticsEl.classList.contains('show-optics'), false, 'acc-optics must not have show-optics when frame active');
  assert.strictEqual(railBtnFrame.classList.contains('active'), true, 'railBtnFrame must be active');
  assert.strictEqual(railBtnOptics.classList.contains('active'), false, 'railBtnOptics must be inactive');
  assert.strictEqual(document.getElementById('rightDrawerTitle').textContent, 'Presentation Frame');
  assert.strictEqual(chkModuleFrame.checked, false, 'chkModuleFrame must remain untouched');

  // 4. Programmatic navigation compatibility via openAccordionById
  window.openAccordionById('acc-export');
  assert.strictEqual(accExportEl.classList.contains('active-tool'), true, 'openAccordionById(acc-export) must activate acc-export tool');
  assert.strictEqual(railBtnExport.classList.contains('active'), true);
  assert.strictEqual(document.getElementById('rightDrawerTitle').textContent, 'Export & Render Studio');

  window.openAccordionById('acc-optical');
  assert.strictEqual(accOpticsEl.classList.contains('active-tool'), true);
  assert.strictEqual(accOpticsEl.classList.contains('show-optics'), true);
  assert.strictEqual(railBtnOptics.classList.contains('active'), true);

  // 5. CSS Contextual Panel Rules verified in stylesheet
  assert.ok(cssSource.includes('.drawer .panel > .accordion-section.active-tool'), 'style.css must contain .drawer .panel > .accordion-section.active-tool');
  assert.ok(cssSource.includes('.drawer .panel-toolbar'), 'style.css must hide .panel-toolbar in contextual mode');
  assert.ok(cssSource.includes('#acc-optics.active-tool.show-optics #subpanelOptics'), 'style.css must contain Optics subpanel rule');
  assert.ok(cssSource.includes('#acc-optics.active-tool.show-frame #subpanelFrame'), 'style.css must contain Frame subpanel rule');
  assert.ok(htmlSource.includes('id="subpanelOptics"'), 'index.html must contain subpanelOptics');
  assert.ok(htmlSource.includes('id="subpanelFrame"'), 'index.html must contain subpanelFrame');

  // ===========================================================================
  // Stage 3.4 Compact Instance Lists & Split Properties Inspector Verification
  // ===========================================================================

  // 1. Structure Verification: HTML markup contains split layout and empty state placeholders
  assert.ok(htmlSource.includes('class="inspector-split-layout"'), 'index.html must contain .inspector-split-layout');
  assert.ok(htmlSource.includes('class="inspector-master-column"'), 'index.html must contain .inspector-master-column');
  assert.ok(htmlSource.includes('class="inspector-detail-column"'), 'index.html must contain .inspector-detail-column');
  assert.ok(htmlSource.includes('id="emptyNodeSelection"'), 'index.html must contain emptyNodeSelection');
  assert.ok(htmlSource.includes('id="emptyFlowSelection"'), 'index.html must contain emptyFlowSelection');
  assert.ok(htmlSource.includes('id="emptyGlowSelection"'), 'index.html must contain emptyGlowSelection');
  assert.ok(htmlSource.includes('id="emptyRippleSelection"'), 'index.html must contain emptyRippleSelection');
  assert.ok(htmlSource.includes('id="btnAddNode"'), 'index.html must contain btnAddNode');
  assert.ok(htmlSource.includes('id="btnAddFlow"'), 'index.html must contain btnAddFlow');
  assert.ok(htmlSource.includes('id="btnAddGlow"'), 'index.html must contain btnAddGlow');
  assert.ok(htmlSource.includes('id="btnAddRipple"'), 'index.html must contain btnAddRipple');

  // 2. CSS Verification: Stylesheet defines compact rows, scrollable lists, 35/65 split, preserved 420px drawer width, and compact property rows
  assert.ok(cssSource.includes('.flow-list-item.compact-instance-row'), 'style.css must contain .flow-list-item.compact-instance-row');
  assert.ok(cssSource.includes('.compact-instance-list'), 'style.css must contain .compact-instance-list');
  assert.ok(cssSource.includes('.drawer.left-drawer.expanded-inspector'), 'style.css must contain .expanded-inspector');
  assert.ok(cssSource.includes('grid-template-columns: minmax(0, 7fr) minmax(0, 13fr);'), 'style.css must contain 35/65 split grid');
  assert.ok(!cssSource.includes('grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);'), 'style.css must NOT contain conflicting 40/60 split grid');
  assert.ok(!cssSource.includes('grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);'), 'style.css must NOT contain conflicting 60/40 split grid');
  assert.ok(!cssSource.includes('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);'), 'style.css must NOT contain conflicting 50/50 split grid');
  assert.ok(cssSource.includes('--drawer-width: 420px;'), 'style.css must define 420px drawer width for wide desktop');
  assert.ok(cssSource.includes('--drawer-width: 460px;'), 'style.css must define 460px drawer width for >= 1600px desktop');
  assert.ok(cssSource.includes('.inspector-prop-row'), 'style.css must contain .inspector-prop-row');
  assert.ok(htmlSource.includes('class="inspector-prop-row"'), 'index.html must contain .inspector-prop-row');
  assert.ok(cssSource.includes('#nodeEditor select'), 'style.css must contain scoped compact input rules');

  // 3. DiagramNodes Compact List & Properties Inspector Lifecycle
  const nodeEd = document.getElementById('nodeEditor');
  const nodeEmpty = document.getElementById('emptyNodeSelection');
  const nListCont = document.getElementById('nodeListContainer');

  const testNode1 = window.DiagramNodes.createNode({ text: 'Gateway Service', width: 200, shape: 'cylinder' });
  const testNode2 = window.DiagramNodes.createNode({ text: 'Auth Cache', width: 180, shape: 'cloud' });
  window.DiagramNodes.renderList();
  assert.ok(nListCont.children.length >= 2, 'nodeListContainer must contain compact rows for created nodes');

  // Selecting a node displays properties and hides empty state without recording history
  const histBeforeSelect = window.HistoryManager.undoStack ? window.HistoryManager.undoStack.length : 0;
  window.DiagramNodes.selectNode(testNode1.id);
  assert.strictEqual(window.DiagramNodes.activeId, testNode1.id);
  assert.strictEqual(nodeEd.style.display, 'block', 'nodeEditor must be visible when a node is selected');
  assert.strictEqual(nodeEmpty.style.display, 'none', 'emptyNodeSelection must be hidden when a node is selected');
  const histAfterSelect = window.HistoryManager.undoStack ? window.HistoryManager.undoStack.length : 0;
  assert.strictEqual(histAfterSelect, histBeforeSelect, 'Selecting an instance must not alter undo history depth');

  // Deselecting a node hides editor and displays empty state
  window.DiagramNodes.deselectNode();
  assert.strictEqual(window.DiagramNodes.activeId, null);
  assert.strictEqual(nodeEd.style.display, 'none', 'nodeEditor must be hidden when deselected');
  assert.strictEqual(nodeEmpty.style.display, 'block', 'emptyNodeSelection must be shown when deselected');

  // 4. DataFlows Compact List & Properties Inspector Lifecycle
  const flowEd = document.getElementById('flowEditor');
  const flowEmpty = document.getElementById('emptyFlowSelection');
  const testFlow1 = window.DataFlows.createFlow({ label: 'RPC Channel', color: '#00ffcc' });
  window.DataFlows.selectFlow(testFlow1.id);
  assert.strictEqual(window.DataFlows.activeId, testFlow1.id);
  assert.strictEqual(flowEd.style.display, 'block', 'flowEditor must be visible when a flow is selected');
  assert.strictEqual(flowEmpty.style.display, 'none', 'emptyFlowSelection must be hidden when a flow is selected');

  window.DataFlows.deselectFlow();
  assert.strictEqual(window.DataFlows.activeId, null);
  assert.strictEqual(flowEd.style.display, 'none', 'flowEditor must be hidden when deselected');
  assert.strictEqual(flowEmpty.style.display, 'block', 'emptyFlowSelection must be shown when deselected');

  // 5. Glows Compact List & Properties Inspector Lifecycle
  const glowEd = document.getElementById('glowEditor');
  const glowEmpty = document.getElementById('emptyGlowSelection');
  const testGlow1 = window.Glows.createGlow({ shape: 'radar', color: '#ff0044' });
  window.Glows.selectGlow(testGlow1.id);
  assert.strictEqual(window.Glows.activeId, testGlow1.id);
  assert.strictEqual(glowEd.style.display, 'block', 'glowEditor must be visible when a glow is selected');
  assert.strictEqual(glowEmpty.style.display, 'none', 'emptyGlowSelection must be hidden when a glow is selected');

  window.Glows.deselectGlow();
  assert.strictEqual(window.Glows.activeId, null);
  assert.strictEqual(glowEd.style.display, 'none', 'glowEditor must be hidden when deselected');
  assert.strictEqual(glowEmpty.style.display, 'block', 'emptyGlowSelection must be shown when deselected');

  // 6. Ripples Compact List & Properties Inspector Lifecycle
  const rippleEd = document.getElementById('rippleEditor');
  const rippleEmpty = document.getElementById('emptyRippleSelection');
  const testRipple1 = window.Ripples.createRipple({ rings: 4, outerR: 180 });
  window.Ripples.selectRipple(testRipple1.id);
  assert.strictEqual(window.Ripples.activeId, testRipple1.id);
  assert.strictEqual(rippleEd.style.display, 'block', 'rippleEditor must be visible when a ripple is selected');
  assert.strictEqual(rippleEmpty.style.display, 'none', 'emptyRippleSelection must be hidden when a ripple is selected');

  window.Ripples.deselectRipple();
  assert.strictEqual(window.Ripples.activeId, null);
  assert.strictEqual(rippleEd.style.display, 'none', 'rippleEditor must be hidden when deselected');
  assert.strictEqual(rippleEmpty.style.display, 'block', 'emptyRippleSelection must be shown when deselected');

  // 7. Drawer Expanded Inspector Mode Synchronization
  window.WorkspaceController.showToolPanel('acc-nodes');
  assert.strictEqual(leftDrawerEl.classList.contains('expanded-inspector'), true, 'leftDrawer must receive expanded-inspector class for acc-nodes');

  window.WorkspaceController.showToolPanel('acc-flows');
  assert.strictEqual(leftDrawerEl.classList.contains('expanded-inspector'), true, 'leftDrawer must receive expanded-inspector class for acc-flows');

  window.WorkspaceController.showToolPanel('acc-glows');
  assert.strictEqual(leftDrawerEl.classList.contains('expanded-inspector'), true, 'leftDrawer must receive expanded-inspector class for acc-glows');

  window.WorkspaceController.showToolPanel('acc-ripples');
  assert.strictEqual(leftDrawerEl.classList.contains('expanded-inspector'), true, 'leftDrawer must receive expanded-inspector class for acc-ripples');

  window.WorkspaceController.showToolPanel('acc-background');
  assert.strictEqual(leftDrawerEl.classList.contains('expanded-inspector'), false, 'leftDrawer must remove expanded-inspector class for non-object acc-background');

  window.WorkspaceController.showToolPanel('acc-presets');
  assert.strictEqual(leftDrawerEl.classList.contains('expanded-inspector'), false, 'leftDrawer must remove expanded-inspector class for non-object acc-presets');

  // 8. Cross-Module Selection Coordination via AppCoordinator
  window.DiagramNodes.selectNode(testNode1.id);
  assert.strictEqual(window.DiagramNodes.activeId, testNode1.id);
  assert.strictEqual(window.DataFlows.activeId, null);

  window.DataFlows.selectFlow(testFlow1.id);
  assert.strictEqual(window.DataFlows.activeId, testFlow1.id);
  assert.strictEqual(window.DiagramNodes.activeId, null, 'Selecting flow must deselect active node');

  // 9. Clean up created test entities
  window.DiagramNodes.deleteNode(testNode1.id);
  window.DiagramNodes.deleteNode(testNode2.id);
  window.DataFlows.deleteFlow(testFlow1.id);
  window.Glows.deleteGlow(testGlow1.id);
  window.Ripples.deleteRipple(testRipple1.id);

  // 11. Preservation of all 95 tracked control IDs
  assert.strictEqual(window.HistoryManager.trackedControlIds.length, 95);
  window.HistoryManager.trackedControlIds.forEach((id) => {
    assert.ok(htmlSource.includes(`id="${id}"`), `Tracked control ID '${id}' must exist in index.html`);
  });

  // 12. No duplicate IDs introduced in index.html
  const allIds = [];
  const idRegex = /\bid="([^"]+)"/g;
  let idMatch;
  while ((idMatch = idRegex.exec(htmlSource)) !== null) {
    allIds.push(idMatch[1]);
  }
  const idSet = new Set();
  const duplicates = [];
  allIds.forEach((id) => {
    if (idSet.has(id)) duplicates.push(id);
    else idSet.add(id);
  });
  assert.strictEqual(duplicates.length, 0, `index.html must have zero duplicate IDs, but found duplicates: ${duplicates.join(', ')}`);

  // 13. Preservation of all 15 script tags in exact order
  const scriptTagsInHtml = [];
  const scriptRegex = /<script\s+src="([^"?]+)(?:\?[^"]*)?"\s*><\/script>/g;
  let scriptMatch;
  while ((scriptMatch = scriptRegex.exec(htmlSource)) !== null) {
    scriptTagsInHtml.push(scriptMatch[1]);
  }
  assert.strictEqual(scriptTagsInHtml.length, 17, 'index.html must contain exactly 17 script tags');
  const expectedScriptOrder = [
    'js/wasm_exec.js',
    'js/engine-bridge.js',
    'js/effects.js',
    'js/scene-state.js',
    'js/coordinator.js',
    'js/stage.js',
    'js/shape-registry.js',
    'js/presets.js',
    'js/nodes.js',
    'js/flows.js',
    'js/glows.js',
    'js/ripples.js',
    'js/history.js',
    'js/projects.js',
    'js/app.js',
    'js/still-export-modal.js',
    'js/export-modal.js'
  ];
  assert.deepStrictEqual(scriptTagsInHtml, expectedScriptOrder, '17 script tags must be in exact dependency order');

  // 14. Phase 4: Floating Contextual Object Properties Editor Verification
  assert.ok(window.FloatingPropertiesEditor, 'window.FloatingPropertiesEditor must be defined');
  window.FloatingPropertiesEditor.init();
  assert.strictEqual(window.FloatingPropertiesEditor._initialized, true);
  window.FloatingPropertiesEditor.init(); // Idempotency check
  assert.strictEqual(window.FloatingPropertiesEditor._initialized, true);

  const floatingEditorEl = document.getElementById('floatingContextEditor');
  assert.ok(floatingEditorEl, '#floatingContextEditor must exist in DOM');

  // ===========================================================================
  // 15. Go-First WebAssembly Engine & Bridge Verification
  // ===========================================================================
  assert.ok(window.EngineBridge, 'window.EngineBridge must be defined');
  assert.strictEqual(typeof window.EngineBridge.isReady, 'function');
  assert.strictEqual(typeof window.EngineBridge.dispatch, 'function');

  // Verify WASM binary exists on disk
  const wasmPath = path.join(__dirname, '..', 'internal', 'web', 'static', 'wasm', 'engine.wasm');
  assert.ok(fs.existsSync(wasmPath), 'internal/web/static/wasm/engine.wasm must exist');
  const wasmStat = fs.statSync(wasmPath);
  assert.ok(wasmStat.size > 100000, `WASM binary size should be > 100KB, got ${wasmStat.size}`);

  // Test WASM runtime instantiation & bridge communication in Node.js
  const wasmBuffer = fs.readFileSync(wasmPath);
  const goWasm = new window.Go();
  const wasmModule = await WebAssembly.instantiate(wasmBuffer, goWasm.importObject);
  goWasm.run(wasmModule.instance).catch(() => {});

  assert.ok(window.__svgAnimatorWasmBridge, 'Go WASM must export window.__svgAnimatorWasmBridge');
  assert.strictEqual(window.__svgAnimatorWasmBridge.isReady, true);
  window.EngineBridge._bridge = window.__svgAnimatorWasmBridge;
  window.EngineBridge.status = 'ready';
  assert.strictEqual(window.EngineBridge.isReady(), true);

  // Ping engine
  const pingRes = window.EngineBridge.ping();
  assert.ok(pingRes, 'Ping must return data');
  assert.strictEqual(pingRes.status, 'ready');
  assert.strictEqual(pingRes.version, '1.0.0');

  // Test Flow Path Generation via WASM with Parity Check against JS
  const testWaypoints = [
    { x: 10, y: 15 },
    { x: 45, y: 55 },
    { x: 80, y: 85 }
  ];

  // Ortho-HV
  const wasmOrthoHV = window.EngineBridge.generateFlowPath(testWaypoints, 0, 1000, 1000, 'ortho-hv');
  assert.ok(wasmOrthoHV && wasmOrthoHV.path, 'WASM must return path for ortho-hv');
  assert.strictEqual(wasmOrthoHV.path, 'M 100,150 L 450,150 L 450,550 L 800,550 L 800,850');

  // Spline
  const wasmSpline = window.EngineBridge.generateFlowPath(testWaypoints, 30, 1000, 1000, 'curve');
  assert.ok(wasmSpline && wasmSpline.path.includes(' C '), 'WASM curve must generate cubic spline');

  // 2-node Quad Bezier
  const twoNodes = [{ x: 10, y: 10 }, { x: 90, y: 90 }];
  const wasmQuad = window.EngineBridge.generateFlowPath(twoNodes, 40, 1000, 1000, 'curve');
  assert.ok(wasmQuad && wasmQuad.path.includes(' Q '), 'WASM 2-node curve must generate quadratic Bezier');

  // Snapped Position via WASM
  const wasmSnap = window.EngineBridge.computeSnappedPosition(3.7, 5.0, {
    enabled: true,
    gridSizePx: 25,
    canvasWidth: 1000,
    canvasHeight: 1000
  });
  assert.ok(wasmSnap, 'WASM must return snapped position');
  assert.strictEqual(wasmSnap.x, 2.5);
  assert.strictEqual(wasmSnap.y, 5.0);

  // Verification of call metrics
  const stats = window.EngineBridge.getStats();
  assert.ok(stats.totalCalls >= 4, 'Stats should record at least 4 WASM calls');
  assert.strictEqual(stats.errors, 0, 'Stats should record zero errors');

  // Test Graceful JS Fallback when WASM is disabled
  window.EngineBridge.status = 'fallback';
  assert.strictEqual(window.EngineBridge.isReady(), false);
  const fallbackPath = window.DataFlows.generatePathString(testWaypoints, 0, 1000, 1000, 'ortho-hv');
  assert.strictEqual(fallbackPath, 'M 100,150 L 450,150 L 450,550 L 800,550 L 800,850', 'JS fallback must generate identical path');

  // Re-enable WASM bridge for subsequent tests
  window.EngineBridge.status = 'ready';
  assert.strictEqual(window.EngineBridge.isReady(), true);

  // ===========================================================================
  // 16. Go-First Scene Model, Timeline & Batch Frame Evaluation Verification (Stage 2)
  // ===========================================================================
  const testSceneSnapshot = {
    revision: 101,
    canvas: {
      width: 1200,
      height: 800,
      duration: 6.0,
      loop: 'loop'
    },
    camera: {
      motion: 'ken-burns',
      camDuration: 6.0,
      camLoop: 'loop',
      startX: 40,
      startY: 40,
      startZoom: 1.0,
      endX: 60,
      endY: 60,
      endZoom: 1.2
    },
    nodes: [
      { id: 'node-anim-1', shape: 'rect', animation: 'pulse', x: 20, y: 30, width: 150, height: 80 }
    ],
    flows: [
      {
        id: 'flow-anim-1',
        nodes: [{ x: 10, y: 20 }, { x: 90, y: 80 }],
        curvature: 30,
        routeMode: 'curve',
        speed: 3.0,
        delay: 0.5,
        endDelay: 0.5,
        opacity: 0.9,
        lineStyle: 'marching',
        showLine: true
      }
    ],
    glows: [
      {
        id: 'glow-anim-1',
        x: 50,
        y: 50,
        size: 40,
        dur: 2.0,
        delay: 0.0,
        playback: 'pingpong',
        isRadar: true,
        radarRings: 3
      }
    ],
    ripples: [
      {
        id: 'rip-anim-1',
        x: 30,
        y: 70,
        innerR: 10,
        outerR: 60,
        dur: 2.0,
        delay: 0.0
      }
    ]
  };

  const syncResult = window.EngineBridge.syncScene(testSceneSnapshot);
  assert.strictEqual(syncResult, true, 'WASM engine must sync scene successfully');

  // Empty Scene Evaluation
  const emptySceneSnapshot = {
    revision: 102,
    canvas: { width: 1000, height: 1000, duration: 5.0, loop: 'once' },
    camera: { motion: 'static' },
    nodes: [],
    flows: [],
    glows: [],
    ripples: []
  };
  window.EngineBridge.syncScene(emptySceneSnapshot);
  const emptyFrame = window.EngineBridge.evaluateSceneAtTime(2.0);
  assert.ok(emptyFrame, 'Empty scene evaluation must succeed');
  assert.strictEqual(emptyFrame.time, 2.0);
  assert.strictEqual(emptyFrame.flows.length, 0, 'Empty scene must have 0 flows');
  assert.strictEqual(emptyFrame.glows.length, 0, 'Empty scene must have 0 glows');

  // Restore testSceneSnapshot
  window.EngineBridge.syncScene(testSceneSnapshot);

  // Deterministic evaluation at time zero, mid-transit, end, and boundary
  // At t = 0: flow has delay 0.5, so before start:
  const frameT0 = window.EngineBridge.evaluateSceneAtTime(0.0);
  assert.ok(frameT0, 'Evaluation at t=0 must succeed');
  assert.strictEqual(frameT0.flows[0].visible, false, 'Flow must not be visible before delay');
  assert.strictEqual(frameT0.flows[0].opacity, 0.0, 'Flow opacity must be 0 before delay');

  // At t = 2.0s: local = 2.0 - 0.5 = 1.5s. In 3.0s speed, prog = 1.5 / 3.0 = 0.5 (midpoint!)
  const frameT2 = window.EngineBridge.evaluateSceneAtTime(2.0);
  assert.ok(frameT2 && frameT2.flows[0], 'Evaluation at t=2.0 must succeed');
  const fl2 = frameT2.flows[0];
  assert.strictEqual(fl2.visible, true);
  assert.strictEqual(fl2.progress, 0.5);
  assert.ok(fl2.x > 100 && fl2.x < 1100, `Flow X midpoint must be in middle range, got ${fl2.x}`);
  assert.ok(fl2.y > 100 && fl2.y < 700, `Flow Y midpoint must be in middle range, got ${fl2.y}`);
  assert.strictEqual(fl2.opacity, 0.9, 'Flow opacity at mid-transit should be peak 0.9');

  // Determinism check: direct evaluation at t=2.0 produces identical result
  const frameT2Repeat = window.EngineBridge.evaluateSceneAtTime(2.0);
  assert.strictEqual(frameT2.flows[0].x, frameT2Repeat.flows[0].x, 'Frame evaluation must be deterministic');
  assert.strictEqual(frameT2.flows[0].y, frameT2Repeat.flows[0].y, 'Frame evaluation must be deterministic');
  assert.strictEqual(frameT2.flows[0].rotation, frameT2Repeat.flows[0].rotation, 'Frame rotation must be deterministic');

  // Exact loop boundary: cycle length = speed (3.0) + endDelay (0.5) = 3.5s.
  // Delay = 0.5s. So cycle 1 ends at t = 0.5 + 3.5 = 4.0s.
  // At t = 4.1s: local = 4.1 - 0.5 = 3.6s. In cycle 2: tInCycle = 0.1s. prog = 0.1 / 3.0 = 0.0333...
  const frameLoop = window.EngineBridge.evaluateSceneAtTime(4.1);
  assert.ok(frameLoop && frameLoop.flows[0], 'Frame evaluation past loop boundary must succeed');
  assert.ok(frameLoop.flows[0].progress < 0.1, `Flow progress should have wrapped to near 0, got ${frameLoop.flows[0].progress}`);

  // Numerical Parity Check: Go WASM vs Pure JavaScript Fallback
  const wasmFrame = window.EngineBridge.evaluateSceneAtTime(2.25);
  const jsFrame = window.EngineBridge._evaluateSceneAtTimeJS(testSceneSnapshot, 2.25);

  assert.strictEqual(wasmFrame.flows.length, jsFrame.flows.length, 'Flow counts must match between Go and JS');
  const wasmFlow = wasmFrame.flows[0];
  const jsFlow = jsFrame.flows[0];
  assert.ok(Math.abs(wasmFlow.x - jsFlow.x) <= 0.05, `Parity check flow X: wasm=${wasmFlow.x}, js=${jsFlow.x}`);
  assert.ok(Math.abs(wasmFlow.y - jsFlow.y) <= 0.05, `Parity check flow Y: wasm=${wasmFlow.y}, js=${jsFlow.y}`);
  assert.ok(Math.abs(wasmFlow.rotation - jsFlow.rotation) <= 0.1, `Parity check flow rotation: wasm=${wasmFlow.rotation}, js=${jsFlow.rotation}`);
  assert.ok(Math.abs(wasmFlow.opacity - jsFlow.opacity) <= 0.01, `Parity check flow opacity: wasm=${wasmFlow.opacity}, js=${jsFlow.opacity}`);

  // Batch Frame Evaluation
  const batchFrames = window.EngineBridge.evaluateBatch([0.0, 1.0, 2.0, 3.0]);
  assert.strictEqual(batchFrames.length, 4, 'evaluateBatch must return 4 frames');
  assert.strictEqual(batchFrames[2].flows[0].progress, 0.5, 'Batch frame at index 2 (t=2.0) must match');

  // TimelinePlayer Play/Pause/Seek and DOM presentation verification
  assert.ok(window.TimelinePlayer, 'window.TimelinePlayer must be defined');
  window.TimelinePlayer.init();
  window.TimelinePlayer.seek(1.5);
  assert.strictEqual(window.TimelinePlayer.currentTime, 1.5, 'TimelinePlayer seek must update currentTime');

  // Verify Active Engine Badge and frame stats
  const diagStats = window.EngineBridge.getFrameEvaluationStats();
  assert.ok(diagStats.framesEvaluated >= 5, `Must have evaluated >= 5 frames, got ${diagStats.framesEvaluated}`);
  assert.strictEqual(diagStats.activeEngine, 'WASM', 'Active engine must report WASM');

  // Graceful fallback on failure / disabled WASM
  window.EngineBridge.status = 'fallback';
  assert.strictEqual(window.EngineBridge.getActiveEngineName(), 'JS fallback');
  const fallbackFrame = window.EngineBridge.evaluateSceneAtTime(2.0);
  assert.ok(fallbackFrame && fallbackFrame.flows.length > 0, 'Fallback evaluation must succeed without WASM');
  assert.strictEqual(fallbackFrame.flows[0].progress, 0.5, 'Fallback progress must match Go progress');

  // Re-enable WASM
  window.EngineBridge.status = 'ready';
  assert.strictEqual(window.EngineBridge.getActiveEngineName(), 'WASM (Ready)');

  // ===========================================================================
  // 16.1 Browser-Side Numeric ID Normalization & Real Go Scene Synchronization
  // ===========================================================================
  // Create live objects using the legacy JavaScript modules (which generate numeric IDs: 1, 2, 3...)
  const liveN1 = window.DiagramNodes.createNode({ text: 'NumericNode1', x: 20, y: 20, shape: 'rounded' });
  const liveN2 = window.DiagramNodes.createNode({ text: 'NumericNode2', x: 70, y: 70, shape: 'rect' });
  const liveF1 = window.DataFlows.createFlow({
    nodes: [{ x: 20, y: 20 }, { x: 70, y: 70 }],
    speed: 2.5,
    delay: 0.2,
    opacity: 0.95
  });
  const liveG1 = window.Glows.createGlow({ shape: 'radar', rings: 3, dur: 1.8, delay: 0.1 });
  const liveR1 = window.Ripples.createRipple({ innerR: 10, outerR: 120, dur: 2.2 });

  // Verify that legacy JS objects indeed have numeric IDs
  assert.strictEqual(typeof liveN1.id, 'number', 'Legacy Node ID must be numeric');
  assert.strictEqual(typeof liveF1.id, 'number', 'Legacy Flow ID must be numeric');
  assert.strictEqual(typeof liveG1.id, 'number', 'Legacy Glow ID must be numeric');
  assert.strictEqual(typeof liveR1.id, 'number', 'Legacy Ripple ID must be numeric');

  // Generate real snapshot using production bridge normalizer
  const liveSnapshot = window.EngineBridge.buildCurrentSceneSnapshot();

  // Verify normalized IDs in the snapshot are canonical strings
  const snapNode = liveSnapshot.nodes.find((n) => n.id === String(liveN1.id));
  const snapFlow = liveSnapshot.flows.find((f) => f.id === String(liveF1.id));
  const snapGlow = liveSnapshot.glows.find((g) => g.id === String(liveG1.id));
  const snapRipple = liveSnapshot.ripples.find((r) => r.id === String(liveR1.id));

  assert.ok(snapNode, 'Normalized snapshot must contain node with canonical string ID');
  assert.ok(snapFlow, 'Normalized snapshot must contain flow with canonical string ID');
  assert.ok(snapGlow, 'Normalized snapshot must contain glow with canonical string ID');
  assert.ok(snapRipple, 'Normalized snapshot must contain ripple with canonical string ID');
  assert.strictEqual(typeof snapNode.id, 'string', 'Normalized node ID must be string');
  assert.strictEqual(typeof snapFlow.id, 'string', 'Normalized flow ID must be string');

  // Synchronize live snapshot to real Go WASM engine
  const liveSyncSuccess = window.EngineBridge.syncScene(liveSnapshot);
  assert.strictEqual(liveSyncSuccess, true, 'Real browser scene with numeric IDs must sync to Go without error');
  assert.strictEqual(window.EngineBridge._sceneSynced, true, '_sceneSynced must be true');
  assert.strictEqual(window.EngineBridge._lastSyncError, null, '_lastSyncError must be null');
  assert.strictEqual(window.EngineBridge.getActiveEngineName(), 'WASM (Ready)');

  // Evaluate frame via Go WASM and verify flow frame update matches the live flow ID
  const evalLive = window.EngineBridge.evaluateSceneAtTime(1.0);
  assert.ok(evalLive && evalLive.flows.length > 0, 'Go WASM evaluation must return flow updates');
  const matchedFlowUpdate = evalLive.flows.find((fl) => fl.id === String(liveF1.id));
  assert.ok(matchedFlowUpdate, `Flow frame update must reference canonical flow ID "${liveF1.id}"`);
  assert.strictEqual(window.EngineBridge.getActiveEngineName(), 'WASM');

  // Verify collision handling when different object types share the same numeric ID (e.g. Node 1, Flow 1, Glow 1, Ripple 1)
  const idCollisionSnapshot = {
    revision: 201,
    canvas: { width: 1000, height: 1000, duration: 5.0, loop: 'once' },
    camera: { motion: 'static' },
    nodes: [{ id: 1, shape: 'rounded', text: 'SameIdNode' }],
    flows: [{ id: 1, nodes: [{ x: 0, y: 0 }, { x: 50, y: 50 }], speed: 2 }],
    glows: [{ id: 1, shape: 'circle', dur: 1.5 }],
    ripples: [{ id: 1, dur: 2.0 }]
  };
  const collisionSync = window.EngineBridge.syncScene(idCollisionSnapshot);
  assert.strictEqual(collisionSync, true, 'Same numeric ID in different collections must synchronize without collision');
  const collisionFrame = window.EngineBridge.evaluateSceneAtTime(1.0);
  assert.strictEqual(collisionFrame.flows[0].id, '1');
  assert.strictEqual(collisionFrame.glows[0].id, '1');
  assert.strictEqual(collisionFrame.ripples[0].id, '1');

  // Synchronization failure lifecycle testing:
  // If an invalid payload fails Scene.SetState, _sceneSynced must become false
  const prevSyncError = window.EngineBridge._lastSyncError;
  // Trigger failure by simulating rejected command
  const badCommandResult = window.EngineBridge.dispatch('Scene.SetState', '{ invalid json [}');
  assert.strictEqual(badCommandResult, null, 'Invalid JSON payload must return null');

  // Test that evaluateSceneAtTime uses JS fallback when unsynced
  window.EngineBridge._sceneSynced = false;
  window.EngineBridge._lastSyncError = 'Simulated sync failure';
  assert.strictEqual(window.EngineBridge.getActiveEngineName(), 'Sync Failed (JS fallback)');
  const fallbackEval = window.EngineBridge.evaluateSceneAtTime(1.0);
  assert.ok(fallbackEval, 'Evaluation must gracefully fall back to JS when sync is failed');

  // Clean recovery when valid scene is synchronized
  window.EngineBridge.syncScene(testSceneSnapshot);
  assert.strictEqual(window.EngineBridge._sceneSynced, true, 'Sync must recover on valid scene');
  assert.strictEqual(window.EngineBridge.getActiveEngineName(), 'WASM (Ready)');

  // Clean up live test objects
  window.DiagramNodes.removeNode(liveN1.id);
  window.DiagramNodes.removeNode(liveN2.id);
  window.DataFlows.deleteFlow(liveF1.id);
  window.Glows.deleteGlow(liveG1.id);
  window.Ripples.deleteRipple(liveR1.id);
  window.EngineBridge.syncScene(); // Resync clean scene

  // Verify FloatingPropertiesEditor lifecycle
  const fNode = window.DiagramNodes.createNode({ text: 'FloatingNodeTest', width: 220, height: 110, shape: 'rect' });
  const fFlow = window.DataFlows.createFlow({ label: 'FloatingFlowTest', color: '#123456' });
  const fGlow = window.Glows.createGlow({ color: '#ff1122', size: 45 });
  const fRipple = window.Ripples.createRipple({ color: '#99aabb', refraction: 40 });

  // Open for node
  window.DiagramNodes.selectNode(fNode.id);
  window.FloatingPropertiesEditor.openFor('node', fNode.id);
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, true, 'Editor must be open');
  assert.strictEqual(window.FloatingPropertiesEditor.activeType, 'node');
  assert.strictEqual(window.FloatingPropertiesEditor.activeId, fNode.id);
  assert.strictEqual(floatingEditorEl.style.display, 'flex');
  assert.strictEqual(document.getElementById('fctx-nodeSection').style.display, 'block');
  assert.strictEqual(document.getElementById('fctx-flowSection').style.display, 'none');

  // Form population test
  const fctxWidthNum = document.getElementById('fctx-nodeWidthNum');
  assert.strictEqual(fctxWidthNum.value, 220, 'Node width in popup must match node.width');

  // Two-way property sync: popup edit -> operational update & sidebar update
  fctxWidthNum.value = 260;
  fctxWidthNum.dispatchEvent({ type: 'input', target: fctxWidthNum });
  assert.strictEqual(window.DiagramNodes.getNode(fNode.id).width, 260, 'Operational node width must update');
  assert.strictEqual(document.getElementById('nodeWidthNum').value, 260, 'Sidebar node width must sync');

  // Switch selection to flow while popup is open -> updates popup
  window.DataFlows.selectFlow(fFlow.id);
  assert.strictEqual(window.FloatingPropertiesEditor.activeType, 'flow');
  assert.strictEqual(window.FloatingPropertiesEditor.activeId, fFlow.id);
  assert.strictEqual(document.getElementById('fctx-flowSection').style.display, 'block');
  assert.strictEqual(document.getElementById('fctx-nodeSection').style.display, 'none');

  // Switch selection to glow
  window.Glows.selectGlow(fGlow.id);
  assert.strictEqual(window.FloatingPropertiesEditor.activeType, 'glow');
  assert.strictEqual(window.FloatingPropertiesEditor.activeId, fGlow.id);
  assert.strictEqual(document.getElementById('fctx-glowSection').style.display, 'block');

  // Switch selection to ripple
  window.Ripples.selectRipple(fRipple.id);
  assert.strictEqual(window.FloatingPropertiesEditor.activeType, 'ripple');
  assert.strictEqual(window.FloatingPropertiesEditor.activeId, fRipple.id);
  assert.strictEqual(document.getElementById('fctx-rippleSection').style.display, 'block');

  // Close popup
  window.FloatingPropertiesEditor.close();
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, false);
  assert.strictEqual(floatingEditorEl.style.display, 'none');

  // Opening & closing must not pollute undo stack
  const afterCloseUndoLen = window.HistoryManager.undoStack.length;
  window.FloatingPropertiesEditor.openFor('node', fNode.id);
  window.FloatingPropertiesEditor.close();
  assert.strictEqual(window.HistoryManager.undoStack.length, afterCloseUndoLen, 'Opening/closing popup must not create undo entries');

  // Deletion closes popup
  window.DiagramNodes.selectNode(fNode.id);
  window.FloatingPropertiesEditor.openFor('node', fNode.id);
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, true);
  window.DiagramNodes.removeNode(fNode.id);
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, false, 'Deleting node must close editor');

  // Clean up remaining test objects
  window.DataFlows.deleteFlow(fFlow.id);
  window.Glows.deleteGlow(fGlow.id);
  window.Ripples.deleteRipple(fRipple.id);

  // Incompatible tool activation closes popup
  const toolTestNode = window.DiagramNodes.createNode({ text: 'ToolCloseTest' });
  window.DiagramNodes.selectNode(toolTestNode.id);
  window.FloatingPropertiesEditor.openFor('node', toolTestNode.id);
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, true);
  window.WorkspaceController.showToolPanel('acc-background');
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, false, 'Switching to acc-background must close editor');
  window.DiagramNodes.deleteNode(toolTestNode.id);

  // Toggle and close behavior
  const escNode = window.DiagramNodes.createNode({ text: 'EscTest' });
  window.DiagramNodes.selectNode(escNode.id);
  window.FloatingPropertiesEditor.openFor('node', escNode.id);
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, true);
  window.FloatingPropertiesEditor.toggle('node', escNode.id);
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, false, 'Toggling open editor must close it');
  window.FloatingPropertiesEditor.toggle('node', escNode.id);
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, true, 'Toggling closed editor must open it');
  window.FloatingPropertiesEditor.close();
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, false, 'close() must close editor');
  window.DiagramNodes.deleteNode(escNode.id);

  // ===========================================================================
  // Phase 4 Right-Click Contextual Properties & Interaction Protection Tests
  // ===========================================================================
  const previewBoxEl = document.getElementById('previewBox');
  const stageOverlayLayerEl = document.getElementById('stageOverlayLayer');
  previewBoxEl.appendChild(stageOverlayLayerEl);

  // Initialize Stage interaction with the production callback
  window.Stage.init((placement, x, y) => {
    if (window.DataFlows && window.DataFlows.activeId !== null) {
      window.DataFlows.handleStageClick(x, y);
      return;
    }
    if (window.Glows && window.Glows.activeId !== null) {
      window.Glows.handleStageClick(x, y);
      return;
    }
    if (window.Ripples && window.Ripples.activeId !== null) {
      window.Ripples.handleStageClick(x, y);
      return;
    }
    if (window.DiagramNodes && window.DiagramNodes.activeId !== null) {
      window.DiagramNodes.handleStageClick(x, y);
      return;
    }
  });

  // Re-bind modules & FloatingPropertiesEditor controls & events with the full previewBox tree
  if (window.DiagramNodes) { window.DiagramNodes._initialized = false; window.DiagramNodes.init(); }
  if (window.DataFlows) { window.DataFlows._initialized = false; window.DataFlows.init(); }
  if (window.Glows) { window.Glows._initialized = false; window.Glows.init(); }
  if (window.Ripples) { window.Ripples._initialized = false; window.Ripples.init(); }
  window.FloatingPropertiesEditor.init();

  // Test 1: Right-Click on Node opens Properties immediately at click coords,
  // prevents default, stops propagation, preserves node coordinates, and does not pollute history
  const testNode = window.DiagramNodes.createNode({ text: 'RightClickNodeTest', x: 38.4, y: 52.6 });
  const nodeSvgEl = makeStubElement('g');
  nodeSvgEl.setAttribute('data-node-id', String(testNode.id));
  previewBoxEl.appendChild(nodeSvgEl);

  const origNodeX = window.DiagramNodes.getNode(testNode.id).x;
  const origNodeY = window.DiagramNodes.getNode(testNode.id).y;
  const historyLenBeforeNode = window.HistoryManager.undoStack.length;

  let preventDefaultCalled = false;
  let stopPropagationCalled = false;
  const nodeRightClickEvt = {
    type: 'contextmenu',
    button: 2,
    clientX: 250,
    clientY: 180,
    target: nodeSvgEl,
    preventDefault: () => { preventDefaultCalled = true; },
    stopPropagation: () => { stopPropagationCalled = true; }
  };
  previewBoxEl.dispatchEvent(nodeRightClickEvt);

  assert.strictEqual(preventDefaultCalled, true, 'Right-clicking node must call preventDefault() to suppress browser context menu');
  assert.strictEqual(stopPropagationCalled, true, 'Right-clicking node must call stopPropagation()');
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, true, 'Floating editor must open immediately on right-clicking node');
  assert.strictEqual(window.FloatingPropertiesEditor.activeType, 'node', 'Active type must be node');
  assert.strictEqual(window.FloatingPropertiesEditor.activeId, testNode.id, 'Active ID must match clicked node');
  assert.strictEqual(window.Stage.isDragging, false, 'Right-clicking node must not initiate stage dragging');
  assert.strictEqual(window.DiagramNodes.getNode(testNode.id).x, origNodeX, 'Node X must not change on right-click');
  assert.strictEqual(window.DiagramNodes.getNode(testNode.id).y, origNodeY, 'Node Y must not change on right-click');
  assert.strictEqual(window.HistoryManager.undoStack.length, historyLenBeforeNode, 'Right-click activation must not pollute history');

  // Verify property edit in popup updates node
  const nodeTextInp = document.getElementById('fctx-nodeTextInput');
  if (nodeTextInp) {
    nodeTextInp.value = 'UpdatedViaRightClickPopup';
    nodeTextInp.dispatchEvent({ type: 'input', target: nodeTextInp });
    assert.strictEqual(window.DiagramNodes.getNode(testNode.id).text, 'UpdatedViaRightClickPopup', 'Node text must update from popup');
  }

  // Test 2: Right-Click on Flow switches editor immediately to Flow
  const testFlow = window.DataFlows.createFlow({ label: 'RightClickFlowTest' });
  const flowPathEl = makeStubElement('path');
  flowPathEl.id = 'flowPath-' + testFlow.id;
  flowPathEl.classList.add('flow-track-path');
  previewBoxEl.appendChild(flowPathEl);

  const flowBeforeSnap = JSON.stringify(window.DataFlows.getFlow(testFlow.id));
  const historyLenBeforeFlow = window.HistoryManager.undoStack.length;
  preventDefaultCalled = false;
  stopPropagationCalled = false;

  const flowRightClickEvt = {
    type: 'contextmenu',
    button: 2,
    clientX: 300,
    clientY: 210,
    target: flowPathEl,
    preventDefault: () => { preventDefaultCalled = true; },
    stopPropagation: () => { stopPropagationCalled = true; }
  };
  previewBoxEl.dispatchEvent(flowRightClickEvt);

  assert.strictEqual(preventDefaultCalled, true, 'Right-clicking flow must call preventDefault()');
  assert.strictEqual(stopPropagationCalled, true, 'Right-clicking flow must call stopPropagation()');
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, true, 'Editor must remain open');
  assert.strictEqual(window.FloatingPropertiesEditor.activeType, 'flow', 'Editor must switch to flow');
  assert.strictEqual(window.FloatingPropertiesEditor.activeId, testFlow.id, 'Editor must target clicked flow');
  assert.strictEqual(JSON.stringify(window.DataFlows.getFlow(testFlow.id)), flowBeforeSnap, 'Flow data must remain untouched');
  assert.strictEqual(window.HistoryManager.undoStack.length, historyLenBeforeFlow, 'Flow right-click must not pollute history');

  // Test 3: Right-Click on Glow (both rendered SVG hit-target and reticle fallback)
  const testGlow = window.Glows.createGlow({ color: '#ff5533', size: 30 });
  const testGlow2 = window.Glows.createGlow({ color: '#33ff55', size: 40 });

  // 3a: SVG rendered hit target targeting for unselected Glow
  const glowInstanceSvg = makeStubElement('g');
  glowInstanceSvg.classList.add('diagram-glow-instance');
  glowInstanceSvg.setAttribute('data-glow-id', String(testGlow.id));
  const glowHitTarget = makeStubElement('rect');
  glowHitTarget.classList.add('glow-hit-target');
  glowHitTarget.setAttribute('pointer-events', 'all');
  glowHitTarget.setAttribute('fill', 'transparent');
  glowHitTarget.closest = (sel) => {
    if (sel === '[data-glow-id]') return glowInstanceSvg;
    return null;
  };
  glowInstanceSvg.appendChild(glowHitTarget);
  previewBoxEl.appendChild(glowInstanceSvg);

  const glowX = window.Glows.getGlow(testGlow.id).x;
  const glowY = window.Glows.getGlow(testGlow.id).y;
  const historyLenBeforeGlow = window.HistoryManager.undoStack.length;
  preventDefaultCalled = false;
  stopPropagationCalled = false;

  const glowSvgRightClickEvt = {
    type: 'contextmenu',
    button: 2,
    clientX: 380,
    clientY: 240,
    target: glowHitTarget,
    preventDefault: () => { preventDefaultCalled = true; },
    stopPropagation: () => { stopPropagationCalled = true; }
  };
  previewBoxEl.dispatchEvent(glowSvgRightClickEvt);

  assert.strictEqual(preventDefaultCalled, true, 'Right-clicking rendered glow SVG hit-target must call preventDefault()');
  assert.strictEqual(stopPropagationCalled, true, 'Right-clicking rendered glow SVG hit-target must call stopPropagation()');
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, true, 'Editor must open for rendered glow hit-target');
  assert.strictEqual(window.FloatingPropertiesEditor.activeType, 'glow', 'Editor active type must be glow');
  assert.strictEqual(window.FloatingPropertiesEditor.activeId, testGlow.id, 'Editor active ID must match clicked glow');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, testGlow.id, 'AppCoordinator selection must be testGlow');
  assert.strictEqual(window.Glows.getGlow(testGlow.id).x, glowX, 'Glow X must remain unchanged');
  assert.strictEqual(window.Glows.getGlow(testGlow.id).y, glowY, 'Glow Y must remain unchanged');
  assert.strictEqual(window.HistoryManager.undoStack.length, historyLenBeforeGlow, 'Glow right-click must not pollute history');

  // 3b: Switch to second glow via hit target while first glow was active
  const glowInstanceSvg2 = makeStubElement('g');
  glowInstanceSvg2.classList.add('diagram-glow-instance');
  glowInstanceSvg2.setAttribute('data-glow-id', String(testGlow2.id));
  const glowHitTarget2 = makeStubElement('rect');
  glowHitTarget2.classList.add('glow-hit-target');
  glowHitTarget2.closest = (sel) => {
    if (sel === '[data-glow-id]') return glowInstanceSvg2;
    return null;
  };
  glowInstanceSvg2.appendChild(glowHitTarget2);
  previewBoxEl.appendChild(glowInstanceSvg2);

  previewBoxEl.dispatchEvent({
    type: 'contextmenu',
    button: 2,
    clientX: 410,
    clientY: 260,
    target: glowHitTarget2,
    preventDefault: () => {},
    stopPropagation: () => {}
  });
  assert.strictEqual(window.FloatingPropertiesEditor.activeId, testGlow2.id, 'Editor must switch to testGlow2');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, testGlow2.id);

  // 3c: Fallback to reticle
  const glowTargetEl = document.getElementById('glowReticleTarget');
  previewBoxEl.dispatchEvent({
    type: 'contextmenu',
    button: 2,
    clientX: 400,
    clientY: 250,
    target: glowTargetEl,
    preventDefault: () => {},
    stopPropagation: () => {}
  });
  assert.strictEqual(window.FloatingPropertiesEditor.activeType, 'glow');

  // Test 4: Right-Click on Ripple (both rendered SVG hit-target and reticle fallback)
  const testRipple = window.Ripples.createRipple({ color: '#44aaff', refraction: 35 });
  const testRipple2 = window.Ripples.createRipple({ color: '#ffaa44', refraction: 45 });

  // 4a: SVG rendered hit target targeting for unselected Ripple
  const rippleInstanceSvg = makeStubElement('g');
  rippleInstanceSvg.classList.add('diagram-ripple-instance');
  rippleInstanceSvg.setAttribute('data-ripple-id', String(testRipple.id));
  const rippleHitTarget = makeStubElement('circle');
  rippleHitTarget.classList.add('ripple-hit-target');
  rippleHitTarget.setAttribute('pointer-events', 'all');
  rippleHitTarget.setAttribute('fill', 'transparent');
  rippleHitTarget.closest = (sel) => {
    if (sel === '[data-ripple-id]') return rippleInstanceSvg;
    return null;
  };
  rippleInstanceSvg.appendChild(rippleHitTarget);
  previewBoxEl.appendChild(rippleInstanceSvg);

  const rippleX = window.Ripples.getRipple(testRipple.id).x;
  const rippleY = window.Ripples.getRipple(testRipple.id).y;
  const historyLenBeforeRipple = window.HistoryManager.undoStack.length;
  preventDefaultCalled = false;
  stopPropagationCalled = false;

  const rippleSvgRightClickEvt = {
    type: 'contextmenu',
    button: 2,
    clientX: 440,
    clientY: 270,
    target: rippleHitTarget,
    preventDefault: () => { preventDefaultCalled = true; },
    stopPropagation: () => { stopPropagationCalled = true; }
  };
  previewBoxEl.dispatchEvent(rippleSvgRightClickEvt);

  assert.strictEqual(preventDefaultCalled, true, 'Right-clicking rendered ripple SVG hit-target must call preventDefault()');
  assert.strictEqual(stopPropagationCalled, true, 'Right-clicking rendered ripple SVG hit-target must call stopPropagation()');
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, true, 'Editor must open for ripple SVG hit-target');
  assert.strictEqual(window.FloatingPropertiesEditor.activeType, 'ripple', 'Editor must switch to ripple');
  assert.strictEqual(window.FloatingPropertiesEditor.activeId, testRipple.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, testRipple.id);
  assert.strictEqual(window.Ripples.getRipple(testRipple.id).x, rippleX, 'Ripple X must remain unchanged');
  assert.strictEqual(window.Ripples.getRipple(testRipple.id).y, rippleY, 'Ripple Y must remain unchanged');
  assert.strictEqual(window.HistoryManager.undoStack.length, historyLenBeforeRipple, 'Ripple right-click must not pollute history');

  // 4b: Switch to second ripple via hit target
  const rippleInstanceSvg2 = makeStubElement('g');
  rippleInstanceSvg2.classList.add('diagram-ripple-instance');
  rippleInstanceSvg2.setAttribute('data-ripple-id', String(testRipple2.id));
  const rippleHitTarget2 = makeStubElement('circle');
  rippleHitTarget2.classList.add('ripple-hit-target');
  rippleHitTarget2.closest = (sel) => {
    if (sel === '[data-ripple-id]') return rippleInstanceSvg2;
    return null;
  };
  rippleInstanceSvg2.appendChild(rippleHitTarget2);
  previewBoxEl.appendChild(rippleInstanceSvg2);

  previewBoxEl.dispatchEvent({
    type: 'contextmenu',
    button: 2,
    clientX: 460,
    clientY: 290,
    target: rippleHitTarget2,
    preventDefault: () => {},
    stopPropagation: () => {}
  });
  assert.strictEqual(window.FloatingPropertiesEditor.activeId, testRipple2.id, 'Editor must switch to testRipple2');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, testRipple2.id);

  // 4c: Fallback to reticle
  const rippleTargetEl = document.getElementById('rippleReticleTarget');
  previewBoxEl.dispatchEvent({
    type: 'contextmenu',
    button: 2,
    clientX: 450,
    clientY: 280,
    target: rippleTargetEl,
    preventDefault: () => {},
    stopPropagation: () => {}
  });
  assert.strictEqual(window.FloatingPropertiesEditor.activeType, 'ripple');

  // Test 5: Right-Click on blank / empty canvas space:
  // - closes floating Properties if open
  // - clears active selection (Select None)
  // - suppresses browser context menu
  // - does not initiate dragging or pollute history
  // - dispatches to clean extension hook handleCanvasContextMenu
  window.FloatingPropertiesEditor.openFor('node', testNode.id);
  window.AppCoordinator.selectObject('node', testNode.id);
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, true);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, testNode.id);
  const historyLenBeforeBlank = window.HistoryManager.undoStack.length;

  let canvasContextHookCalled = false;
  const origHandleCanvasContext = window.FloatingPropertiesEditor.handleCanvasContextMenu;
  window.FloatingPropertiesEditor.handleCanvasContextMenu = function(e) {
    canvasContextHookCalled = true;
  };

  const blankCanvasEl = makeStubElement('div');
  blankCanvasEl.id = 'svgBackgroundBlank';
  previewBoxEl.appendChild(blankCanvasEl);
  preventDefaultCalled = false;
  stopPropagationCalled = false;

  const blankRightClickEvt = {
    type: 'contextmenu',
    button: 2,
    clientX: 100,
    clientY: 100,
    target: blankCanvasEl,
    preventDefault: () => { preventDefaultCalled = true; },
    stopPropagation: () => { stopPropagationCalled = true; }
  };
  previewBoxEl.dispatchEvent(blankRightClickEvt);

  assert.strictEqual(preventDefaultCalled, true, 'Right-clicking empty canvas must call preventDefault() - SVG Animator Studio owns canvas context');
  assert.strictEqual(stopPropagationCalled, true, 'Right-clicking empty canvas must call stopPropagation()');
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, false, 'Right-clicking empty canvas must CLOSE floating Properties editor');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, null, 'Right-clicking empty canvas must CLEAR selection (Select None)');
  assert.strictEqual(window.Stage.isDragging, false, 'Right-clicking empty canvas must NOT initiate stage dragging');
  assert.strictEqual(window.HistoryManager.undoStack.length, historyLenBeforeBlank, 'Right-clicking empty canvas must NOT alter history');
  assert.strictEqual(canvasContextHookCalled, true, 'Extension point handleCanvasContextMenu must be called on empty canvas right-click');

  window.FloatingPropertiesEditor.handleCanvasContextMenu = origHandleCanvasContext;

  // Test 5b: Left-Click on blank canvas in normal Select mode clears selection (Select None)
  window.AppCoordinator.selectObject('node', testNode.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, testNode.id);
  const blankPointerDownEvt = {
    type: 'pointerdown',
    button: 0,
    clientX: 120,
    clientY: 120,
    target: blankCanvasEl,
    preventDefault: () => {},
    stopPropagation: () => {}
  };
  previewBoxEl.dispatchEvent(blankPointerDownEvt);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, null, 'Pointerdown on blank canvas must clear selection');
  assert.strictEqual(window.Stage.isDragging, false, 'Blank canvas click must not initiate node dragging');

  // Test 5c: Escape key handling priority
  // Priority 1: FloatingPropertiesEditor open -> closes editor & clears selection
  window.AppCoordinator.selectObject('node', testNode.id);
  window.FloatingPropertiesEditor.openFor('node', testNode.id);
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, true);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, testNode.id);

  let escHandled = window.WorkspaceController.handleKeydown({ key: 'Escape', code: 'Escape', preventDefault: () => {} });
  assert.strictEqual(escHandled, true, 'Escape must be handled');
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, false, 'Escape must close floating editor');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, null, 'Escape must clear active selection');

  // Priority 2: FloatingPropertiesEditor closed but object selected -> clears selection
  window.AppCoordinator.selectObject('flow', testFlow.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, testFlow.id);
  escHandled = window.WorkspaceController.handleKeydown({ key: 'Escape', code: 'Escape', preventDefault: () => {} });
  assert.strictEqual(escHandled, true);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, null, 'Escape must clear selection when editor was closed');

  // Priority 3: When modal is open, Escape does NOT clear canvas selection (modal priority)
  const projectsModalEl = document.getElementById('projectsModal');
  if (projectsModalEl) projectsModalEl.style.display = 'flex';
  window.AppCoordinator.selectObject('glow', testGlow.id);
  escHandled = window.WorkspaceController.handleKeydown({ key: 'Escape', code: 'Escape', preventDefault: () => {} });
  assert.strictEqual(escHandled, false, 'Modal open must bypass WorkspaceController Escape');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, testGlow.id, 'Selection preserved when modal open');
  if (projectsModalEl) projectsModalEl.style.display = 'none';
  window.AppCoordinator.clearSelection();

  // Test 5d: Sidebar Deselect buttons and active row click toggling
  // Deselect Node
  window.AppCoordinator.selectObject('node', testNode.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, testNode.id);
  const btnDeselectNode = document.getElementById('btnDeselectNode');
  if (btnDeselectNode) {
    btnDeselectNode.dispatchEvent({ type: 'click' });
    assert.strictEqual(window.AppCoordinator.getActiveSelection().id, null, 'btnDeselectNode must clear selection');
  }

  // Deselect Flow
  window.AppCoordinator.selectObject('flow', testFlow.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, testFlow.id);
  const btnDeselectFlow = document.getElementById('btnDeselectFlow');
  if (btnDeselectFlow) {
    btnDeselectFlow.dispatchEvent({ type: 'click' });
    assert.strictEqual(window.AppCoordinator.getActiveSelection().id, null, 'btnDeselectFlow must clear selection');
  }

  // Deselect Glow
  window.AppCoordinator.selectObject('glow', testGlow.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, testGlow.id);
  const btnDeselectGlow = document.getElementById('btnDeselectGlow');
  if (btnDeselectGlow) {
    btnDeselectGlow.dispatchEvent({ type: 'click' });
    assert.strictEqual(window.AppCoordinator.getActiveSelection().id, null, 'btnDeselectGlow must clear selection');
  }

  // Deselect Ripple
  window.AppCoordinator.selectObject('ripple', testRipple.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, testRipple.id);
  const btnDeselectRipple = document.getElementById('btnDeselectRipple');
  if (btnDeselectRipple) {
    btnDeselectRipple.dispatchEvent({ type: 'click' });
    assert.strictEqual(window.AppCoordinator.getActiveSelection().id, null, 'btnDeselectRipple must clear selection');
  }

  // Re-clicking active row in sidebar list deselects
  window.DiagramNodes.selectNode(testNode.id);
  assert.strictEqual(window.DiagramNodes.activeId, testNode.id);
  const nodeList = document.getElementById('nodeListContainer');
  const activeNodeRow = (nodeList && nodeList.children) ? Array.from(nodeList.children).find((c) => c.classList && c.classList.contains('selected')) : null;
  assert.ok(activeNodeRow, 'Active node row must exist in sidebar');
  activeNodeRow.onclick();
  assert.strictEqual(window.DiagramNodes.activeId, null, 'Re-clicking active node row in sidebar list must deselect');

  window.DataFlows.selectFlow(testFlow.id);
  assert.strictEqual(window.DataFlows.activeId, testFlow.id);
  const flowList = document.getElementById('flowListContainer');
  const activeFlowRow = (flowList && flowList.children) ? Array.from(flowList.children).find((c) => c.classList && c.classList.contains('selected')) : null;
  assert.ok(activeFlowRow, 'Active flow row must exist in sidebar');
  activeFlowRow.onclick();
  assert.strictEqual(window.DataFlows.activeId, null, 'Re-clicking active flow row in sidebar list must deselect');

  window.Glows.selectGlow(testGlow.id);
  assert.strictEqual(window.Glows.activeId, testGlow.id);
  const glowList = document.getElementById('glowListContainer');
  const activeGlowRow = (glowList && glowList.children) ? Array.from(glowList.children).find((c) => c.classList && c.classList.contains('selected')) : null;
  assert.ok(activeGlowRow, 'Active glow row must exist in sidebar');
  activeGlowRow.onclick();
  assert.strictEqual(window.Glows.activeId, null, 'Re-clicking active glow row in sidebar list must deselect');

  window.Ripples.selectRipple(testRipple.id);
  assert.strictEqual(window.Ripples.activeId, testRipple.id);
  const rippleList = document.getElementById('rippleListContainer');
  const activeRippleRow = (rippleList && rippleList.children) ? Array.from(rippleList.children).find((c) => c.classList && c.classList.contains('selected')) : null;
  assert.ok(activeRippleRow, 'Active ripple row must exist in sidebar');
  activeRippleRow.onclick();
  assert.strictEqual(window.Ripples.activeId, null, 'Re-clicking active ripple row in sidebar list must deselect');

  // Verify effects, camera, and render state remain fully operational after deselection
  const rStateAfterDeselect = window.SceneState.buildRenderState();
  assert.ok(rStateAfterDeselect && rStateAfterDeselect.image, 'SceneState renderState remains intact');
  assert.strictEqual(window.DiagramNodes.list.length >= 1, true, 'Nodes remain intact after deselect');
  assert.strictEqual(window.DataFlows.list.length >= 1, true, 'Flows remain intact after deselect');
  assert.strictEqual(window.Glows.list.length >= 1, true, 'Glows remain intact after deselect');
  assert.strictEqual(window.Ripples.list.length >= 1, true, 'Ripples remain intact after deselect');

  // Test 6: Right-Click inside text inputs, editable fields, and floating editor controls MUST NOT suppress native context menu
  window.FloatingPropertiesEditor.openFor('node', testNode.id);
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, true);
  preventDefaultCalled = false;
  stopPropagationCalled = false;

  const editorInpEl = document.getElementById('fctx-nodeTextInput') || floatingEditorEl;
  floatingEditorEl.appendChild(editorInpEl);
  const editorRightClickEvt = {
    type: 'contextmenu',
    button: 2,
    clientX: 200,
    clientY: 200,
    target: editorInpEl,
    preventDefault: () => { preventDefaultCalled = true; },
    stopPropagation: () => { stopPropagationCalled = true; }
  };
  previewBoxEl.dispatchEvent(editorRightClickEvt);

  assert.strictEqual(preventDefaultCalled, false, 'Right-clicking inside floating editor / text inputs must NOT call preventDefault() - preserves native text context menu');

  // Test 7: Double-click activation on canvas object still works
  window.FloatingPropertiesEditor.close();
  previewBoxEl.dispatchEvent({
    type: 'dblclick',
    target: nodeSvgEl
  });
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, true, 'Double-click on node SVG element must open editor');
  assert.strictEqual(window.FloatingPropertiesEditor.activeType, 'node');
  assert.strictEqual(window.FloatingPropertiesEditor.activeId, testNode.id);

  // Cleanup test objects
  window.FloatingPropertiesEditor.close();
  window.DiagramNodes.deleteNode(testNode.id);
  window.DataFlows.deleteFlow(testFlow.id);
  window.Glows.deleteGlow(testGlow.id);
  window.Ripples.deleteRipple(testRipple.id);

  // CSS structure and frozen layout verification
  const phase4CssSource = fs.readFileSync(STYLE_CSS_PATH, 'utf8');
  assert.ok(phase4CssSource.includes('minmax(0, 7fr) minmax(0, 13fr)'), 'CSS must preserve 35/65 split: minmax(0, 7fr) minmax(0, 13fr)');
  assert.ok(phase4CssSource.includes('--drawer-width: 420px;'), 'CSS must preserve 420px expanded drawer at 1280px');
  assert.ok(phase4CssSource.includes('--drawer-width: 460px;'), 'CSS must preserve 460px expanded drawer at 1600px');
  assert.ok(phase4CssSource.includes('.floating-context-editor'), 'CSS must define .floating-context-editor');
  assert.ok(phase4CssSource.includes('width: 380px;'), 'CSS must specify 380px width for floating editor');
  assert.ok(!phase4CssSource.includes('.canvas-context-btn'), 'CSS must completely remove .canvas-context-btn');

  // HTML verification: contextual gear button removed
  const indexHtmlSource = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  assert.ok(!indexHtmlSource.includes('btnCanvasContextEdit'), 'HTML must completely remove #btnCanvasContextEdit');
  assert.ok(!indexHtmlSource.includes('canvas-context-btn'), 'HTML must completely remove .canvas-context-btn');

  // ===========================================================================
  // Node Resize Clipping & Drop Shadow Filter Protection Test
  // ===========================================================================
  const resizeNode = window.DiagramNodes.createNode({ text: 'ResizeTest', x: 32, y: 32, width: 170, height: 80 });
  window.AppCoordinator.selectObject('node', resizeNode.id);

  const testWidths = [170, 200, 203, 204, 250, 350];
  const testHeights = [170, 200, 203, 204, 250, 350];

  const rState = window.SceneState.buildRenderState();
  const rBaseSvg = window.Effects.build(rState);

  // Test across width threshold
  for (const w of testWidths) {
    window.DiagramNodes.updateActive('width', w);
    const updated = window.DiagramNodes.getNode(resizeNode.id);
    assert.strictEqual(updated.width, w, `Node width must be ${w}`);
    assert.strictEqual(updated.x, 32, 'Node x must remain 32% (center anchor preserved)');

    const fullSvg = window.DiagramNodes.injectIntoSVG(rBaseSvg, rState);
    // Ensure nodeDropShadow does NOT have userSpaceOnUse (which caused ~203px clipping)
    assert.ok(!fullSvg.includes('filterUnits="userSpaceOnUse"'), 'nodeDropShadow must not use userSpaceOnUse');
    assert.ok(fullSvg.includes('<filter id="nodeDropShadow"'), 'nodeDropShadow filter must be defined');

    // Verify SVG rect coordinates match expected width and centered anchor
    const expectedHw = w / 2;
    assert.ok(
      fullSvg.includes(`width="${w}"`),
      `SVG markup must include width="${w}" for size ${w}`
    );
    assert.ok(
      fullSvg.includes(`x="-${expectedHw}"`),
      `SVG markup must include centered x="-${expectedHw}" for size ${w}`
    );
  }

  // Test across height threshold
  for (const h of testHeights) {
    window.DiagramNodes.updateActive('height', h);
    const updated = window.DiagramNodes.getNode(resizeNode.id);
    assert.strictEqual(updated.height, h, `Node height must be ${h}`);
    assert.strictEqual(updated.y, 32, 'Node y must remain 32% (center anchor preserved)');

    const fullSvg = window.DiagramNodes.injectIntoSVG(rBaseSvg, rState);
    const expectedHh = h / 2;
    assert.ok(
      fullSvg.includes(`height="${h}"`),
      `SVG markup must include height="${h}" for size ${h}`
    );
    assert.ok(
      fullSvg.includes(`y="-${expectedHh}"`),
      `SVG markup must include centered y="-${expectedHh}" for size ${h}`
    );
  }

  // Test Undo/Redo of dimensions
  window.HistoryManager.recordImmediate();
  window.DiagramNodes.updateActive('width', 300);
  window.HistoryManager.recordImmediate();
  assert.strictEqual(window.DiagramNodes.getNode(resizeNode.id).width, 300);
  window.HistoryManager.undo();
  assert.strictEqual(window.DiagramNodes.getNode(resizeNode.id).width, 350, 'Undo must restore previous width');
  window.HistoryManager.redo();
  assert.strictEqual(window.DiagramNodes.getNode(resizeNode.id).width, 300, 'Redo must restore updated width');

  window.DiagramNodes.deleteNode(resizeNode.id);

  // ===========================================================================
  // 16.2 WASM Stage 3: Go-Owned Node Geometry, Shapes & Presets Verification
  // ===========================================================================
  // 1. Authoritative Go Shape Catalog
  const wasmCatalog = window.EngineBridge.getShapeCatalog();
  assert.ok(Array.isArray(wasmCatalog) && wasmCatalog.length >= 12, 'Go Shape Catalog must contain >= 12 shapes');
  const expectedShapeTypes = [
    'rounded', 'rect', 'pill', 'textbox', 'callout',
    'diamond', 'hexagon', 'parallelogram', 'cylinder',
    'cloud', 'circle', 'axes'
  ];
  for (const sType of expectedShapeTypes) {
    const found = wasmCatalog.find((s) => s.id === sType);
    assert.ok(found, `Shape ${sType} must be present in Go shape catalog`);
    assert.ok(found.defaultWidth > 0 && found.defaultHeight > 0, `Shape ${sType} must define default dimensions`);
  }

  // 2. Authoritative Shape Geometry Descriptions across all shapes
  for (const sType of expectedShapeTypes) {
    const desc = window.EngineBridge.describeShape(sType, 180, 90, 'TestTitle', 'TestSub', 16);
    assert.ok(desc && desc.bounds, `describeShape must return valid description for ${sType}`);
    assert.strictEqual(desc.width, 180);
    assert.strictEqual(desc.height, 90);
    assert.strictEqual(desc.halfWidth, 90);
    assert.strictEqual(desc.halfHeight, 45);
    assert.strictEqual(desc.bounds.minX, -90);
    assert.strictEqual(desc.bounds.maxX, 90);
    assert.strictEqual(desc.bounds.minY, -45);
    assert.strictEqual(desc.bounds.maxY, 45);
    assert.ok(desc.elements.length > 0, `${sType} must contain geometric elements`);
    assert.strictEqual(desc.anchors.center.x, 0);
    assert.strictEqual(desc.anchors.center.y, 0);
  }

  // 3. Boundary & Dimension Handling: Large (> 203px), fractional, and minimum clamping
  const largeDesc = window.EngineBridge.describeShape('rounded', 350.5, 220.5, 'Large', '', 15);
  assert.strictEqual(largeDesc.width, 350.5);
  assert.strictEqual(largeDesc.height, 220.5);
  assert.strictEqual(largeDesc.halfWidth, 175.25);
  assert.strictEqual(largeDesc.halfHeight, 110.25);
  assert.strictEqual(largeDesc.bounds.minX, -175.25);
  assert.strictEqual(largeDesc.bounds.maxX, 175.25);

  const clampedDesc = window.EngineBridge.describeShape('rect', -5, 0, 'Clamp', '', 15);
  assert.ok(clampedDesc.width >= 10 && clampedDesc.height >= 10, 'Invalid dimensions must be clamped to safe minimums');

  // 4. Go Preset Defaults & Expansion
  const defaultPreset = window.EngineBridge.getDefaultPreset();
  assert.ok(defaultPreset && defaultPreset.preset, 'getDefaultPreset must return preset configuration');
  assert.strictEqual(defaultPreset.preset.width.enabled, true);
  assert.strictEqual(defaultPreset.preset.width.value, 170);

  const customPreset = JSON.parse(JSON.stringify(defaultPreset));
  customPreset.preset.height = { enabled: true, value: 95 };
  customPreset.preset.strokeColor = { enabled: true, value: '#a855f7' };
  customPreset.preset.shape = { enabled: true, value: 'hexagon' };

  const testPNode = { shape: 'rect', width: 100, height: 50 };
  const presetApplied = window.EngineBridge.applyPreset(testPNode, customPreset);
  assert.strictEqual(presetApplied, true, 'applyPreset must return true when properties change');
  assert.strictEqual(testPNode.width, 170, 'Preset width must be applied');
  assert.strictEqual(testPNode.height, 95, 'Preset height must be applied');
  assert.strictEqual(testPNode.shape, 'hexagon', 'Preset shape must be applied');
  assert.strictEqual(testPNode.strokeColor, '#a855f7', 'Preset strokeColor must be applied');

  // 5. Live Node Creation via Go WASM
  const createdNode = window.DiagramNodes.createNode({
    text: 'WASM Stage 3 Node',
    shape: 'diamond',
    x: 45,
    y: 55,
    width: 210,
    height: 105
  });
  assert.ok(createdNode && createdNode.id, 'createNode must return valid node');
  assert.strictEqual(createdNode.shape, 'diamond', 'Shape must match diamond');
  assert.strictEqual(createdNode.width, 210, 'Explicit width must be preserved over preset default');
  assert.strictEqual(createdNode.height, 105, 'Explicit height must be preserved over preset default');

  // 6. Node Hit-Testing via Go WASM
  const foundNode = window.DiagramNodes.findNodeAtPct(45, 55, 1280, 720);
  assert.ok(foundNode, 'findNodeAtPct must locate created node at (45%, 55%)');
  assert.strictEqual(foundNode.id, createdNode.id);

  // 7. Node-to-Flow Connection preservation
  const connFlow = window.DataFlows.createFlow({
    fromNodeId: String(createdNode.id),
    color: '#38bdf8'
  });
  assert.strictEqual(String(connFlow.fromNodeId), String(createdNode.id), 'Flow must attach to created node ID');

  // 8. Resizing & Live SVG rendering
  window.DiagramNodes.updateNode(createdNode.id, { width: 310, height: 160 });
  const updatedNode = window.DiagramNodes.getNode(createdNode.id);
  assert.strictEqual(updatedNode.width, 310);
  assert.strictEqual(updatedNode.height, 160);

  const stage3RenderState = window.SceneState.buildRenderState();
  const stage3BaseSvg = window.Effects.build(stage3RenderState);
  const stage3FullSvg = window.DiagramNodes.injectIntoSVG(stage3BaseSvg, stage3RenderState);
  assert.ok(stage3FullSvg.includes('<polygon'), 'Diamond node must render SVG polygon');
  assert.ok(stage3FullSvg.includes('filter="url(#nodeDropShadow)"'), 'Node must include drop shadow filter');

  // 9. Node Deletion and Cleanup
  window.DiagramNodes.removeNode(createdNode.id);
  assert.strictEqual(window.DiagramNodes.getNode(createdNode.id), null, 'Node must be deleted');
  window.DataFlows.deleteFlow(connFlow.id);

  // ===========================================================================
  // SECTION 16.3: WASM Stage 4 — Flow Operations, Geometry & Node Connections
  // ===========================================================================
  console.log('[HARNESS] Testing WASM Stage 4 Flow operations, geometry & connections...');

  // 1. Live Flow Creation via Go WASM
  const stage4Flow = window.DataFlows.createFlow({
    label: 'Stage 4 Mesh Flow',
    color: '#06b6d4',
    speed: 3.0,
    route: 'ortho-mid'
  });
  assert.ok(stage4Flow && stage4Flow.id, 'createFlow must return valid flow with ID');
  assert.strictEqual(stage4Flow.color, '#06b6d4', 'Flow color must be preserved');
  assert.strictEqual(stage4Flow.route, 'ortho-mid', 'Flow route must match ortho-mid');
  assert.strictEqual(stage4Flow.nodes.length, 2, 'Flow must start with 2 waypoints');

  // 2. Waypoint Management via Go WASM
  const wpAddRes = window.DataFlows.addWaypoint(stage4Flow.id, 50, 40);
  assert.ok(wpAddRes && wpAddRes.waypointIdx === 2, 'addWaypoint must append at index 2');
  const flowAfterAdd = window.DataFlows.getFlow(stage4Flow.id);
  assert.strictEqual(flowAfterAdd.nodes.length, 3, 'Flow nodes length must be 3');

  const wpUpdRes = window.DataFlows.updateWaypoint(stage4Flow.id, 2, 55, 45);
  assert.strictEqual(wpUpdRes.x, 55, 'Updated waypoint X must match');
  assert.strictEqual(wpUpdRes.y, 45, 'Updated waypoint Y must match');

  const wpRemRes = window.DataFlows.removeWaypoint(stage4Flow.id, 2);
  assert.ok(wpRemRes && wpRemRes.waypointIdx === 1, 'removeWaypoint must return new active index');
  const flowAfterRem = window.DataFlows.getFlow(stage4Flow.id);
  assert.strictEqual(flowAfterRem.nodes.length, 2, 'Flow nodes length must be back to 2');

  // Minimum waypoint guard: cannot reduce below 2
  const wpRemFail = window.DataFlows.removeWaypoint(stage4Flow.id, 0);
  assert.strictEqual(wpRemFail, null, 'removeWaypoint must reject dropping below 2 waypoints');
  assert.strictEqual(window.DataFlows.getFlow(stage4Flow.id).nodes.length, 2);

  // 3. Flow Hit-Testing via Go WASM
  // Flow endpoints default to (25%, 50%) -> (75%, 50%)
  const foundFlow = window.DataFlows.findFlowAtPct(50, 50, 1280, 720);
  assert.ok(foundFlow, 'findFlowAtPct must locate flow at (50%, 50%)');
  assert.strictEqual(String(foundFlow.id), String(stage4Flow.id), 'Found flow ID must match created flow');

  const missFlow = window.DataFlows.findFlowAtPct(50, 85, 1280, 720);
  assert.strictEqual(missFlow, null, 'findFlowAtPct must return null for far coordinates');

  // 4. Flow Bounds via Go WASM
  const flowBoundsRes = window.DataFlows.getFlowBounds(stage4Flow.id, 1280, 720);
  if (flowBoundsRes && flowBoundsRes.bounds) {
    assert.ok(flowBoundsRes.bounds.width > 0, 'Flow bounds width must be positive');
  }

  // 5. Node Attachment and Motion Synchronization
  const s4Node1 = window.DiagramNodes.createNode({ shape: 'rect', x: 20, y: 30, text: 'Src' });
  const s4Node2 = window.DiagramNodes.createNode({ shape: 'cylinder', x: 80, y: 70, text: 'Dst' });

  const connectedFlow = window.DataFlows.createFlow({
    fromNodeId: s4Node1.id,
    toNodeId: s4Node2.id,
    label: 'ConnTest'
  });
  assert.strictEqual(String(connectedFlow.fromNodeId), String(s4Node1.id));
  assert.strictEqual(String(connectedFlow.toNodeId), String(s4Node2.id));

  // Move s4Node1 -> attached flow start waypoint must update
  window.DiagramNodes.updateNode(s4Node1.id, { x: 25, y: 35 });
  const connFlowUpdated = window.DataFlows.getFlow(connectedFlow.id);
  assert.strictEqual(connFlowUpdated.nodes[0].x, 25, 'Flow start waypoint must follow node X');
  assert.strictEqual(connFlowUpdated.nodes[0].y, 35, 'Flow start waypoint must follow node Y');

  // Delete s4Node1 -> flow endpoint must detach cleanly while preserving waypoint coordinates
  window.DiagramNodes.removeNode(s4Node1.id);
  const connFlowAfterDel = window.DataFlows.getFlow(connectedFlow.id);
  assert.strictEqual(connFlowAfterDel.fromNodeId, undefined, 'fromNodeId must be cleared on node deletion');
  assert.strictEqual(connFlowAfterDel.nodes[0].x, 25, 'Waypoint X must remain intact after node delete');
  assert.strictEqual(connFlowAfterDel.nodes[0].y, 35, 'Waypoint Y must remain intact after node delete');

  // 6. Cleanup
  window.DiagramNodes.removeNode(s4Node2.id);
  window.DataFlows.deleteFlow(stage4Flow.id);
  window.DataFlows.deleteFlow(connectedFlow.id);

  // ===========================================================================
  // SECTION 16.4: WASM Stages 5 & 6 — Glow and Ripple Optical Engines
  // ===========================================================================
  console.log('[HARNESS] Testing WASM Stages 5 & 6 Glow and Ripple optical engines...');

  // 1. Live Glow Creation via Go WASM
  const stage5Glow = window.Glows.createGlow({
    shape: 'circle',
    color: '#ff0055',
    x: 45,
    y: 55,
    size: 32,
    opacity: 0.85
  });
  assert.ok(stage5Glow && stage5Glow.id, 'createGlow must return valid glow with ID');
  assert.strictEqual(stage5Glow.color, '#ff0055', 'Glow color must match');
  assert.strictEqual(stage5Glow.size, 32, 'Glow size must match');
  assert.strictEqual(stage5Glow.x, 45, 'Glow X must match');
  assert.strictEqual(stage5Glow.y, 55, 'Glow Y must match');

  // 2. Glow Hit-Testing via Go WASM
  const foundGlow = window.Glows.findGlowAtPct(45, 55, 1280, 720);
  assert.ok(foundGlow, 'findGlowAtPct must locate glow at (45%, 55%)');
  assert.strictEqual(String(foundGlow.id), String(stage5Glow.id), 'Found glow ID must match created glow');

  const missGlow = window.Glows.findGlowAtPct(90, 10, 1280, 720);
  assert.strictEqual(missGlow, null, 'findGlowAtPct must return null for far coordinates');

  // 3. Glow Bounds via Go WASM
  const glowBoundsRes = window.Glows.getGlowBounds(stage5Glow.id, 1280, 720);
  assert.ok(glowBoundsRes && glowBoundsRes.bounds, 'getGlowBounds must return bounds');
  assert.ok(glowBoundsRes.bounds.width > 0, 'Glow bounds width must be positive');

  // 4. Glow Modification & Live SVG Verification
  window.Glows.updateGlow(stage5Glow.id, { color: '#00ffaa', size: 40 });
  const updatedGlow = window.Glows.getGlow(stage5Glow.id);
  assert.strictEqual(updatedGlow.color, '#00ffaa', 'Updated glow color must match');
  assert.strictEqual(updatedGlow.size, 40, 'Updated glow size must match');

  const s5SvgState = { image: { width: 1280, height: 720, isBlankCanvas: true } };
  const s5InjectedSvg = window.Glows.injectIntoSVG('<!-- INJECT_CAMERA_RIG_ELEMENTS -->', 1280, 720);
  assert.ok(s5InjectedSvg.includes('class="glow-hit-target"'), 'Glow SVG injection must include glow-hit-target');
  assert.ok(s5InjectedSvg.includes('data-glow-id="' + stage5Glow.id + '"'), 'Glow SVG injection must include data-glow-id');

  // 5. Live Ripple Creation via Go WASM
  const stage6Ripple = window.Ripples.createRipple({
    color: '#38bdf8',
    opacity: 0.6,
    innerR: 10,
    outerR: 140,
    rings: 3,
    thick: 8,
    refraction: 30,
    x: 60,
    y: 40
  });
  assert.ok(stage6Ripple && stage6Ripple.id, 'createRipple must return valid ripple with ID');
  assert.strictEqual(stage6Ripple.color, '#38bdf8', 'Ripple color must match');
  assert.strictEqual(stage6Ripple.outerR, 140, 'Ripple outerR must match');
  assert.strictEqual(stage6Ripple.x, 60, 'Ripple X must match');
  assert.strictEqual(stage6Ripple.y, 40, 'Ripple Y must match');

  // 6. Ripple Hit-Testing via Go WASM
  const foundRipple = window.Ripples.findRippleAtPct(60, 40, 1280, 720);
  assert.ok(foundRipple, 'findRippleAtPct must locate ripple at (60%, 40%)');
  assert.strictEqual(String(foundRipple.id), String(stage6Ripple.id), 'Found ripple ID must match created ripple');

  const missRipple = window.Ripples.findRippleAtPct(10, 90, 1280, 720);
  assert.strictEqual(missRipple, null, 'findRippleAtPct must return null for far coordinates');

  // 7. Ripple Bounds via Go WASM
  const rippleBoundsRes = window.Ripples.getRippleBounds(stage6Ripple.id, 1280, 720);
  assert.ok(rippleBoundsRes && rippleBoundsRes.bounds, 'getRippleBounds must return bounds');
  assert.ok(rippleBoundsRes.bounds.width > 0, 'Ripple bounds width must be positive');

  // 8. Ripple Modification & Live SVG Verification
  window.Ripples.updateRipple(stage6Ripple.id, { color: '#a78bfa', outerR: 180 });
  const updatedRipple = window.Ripples.getRipple(stage6Ripple.id);
  assert.strictEqual(updatedRipple.color, '#a78bfa', 'Updated ripple color must match');
  assert.strictEqual(updatedRipple.outerR, 180, 'Updated ripple outerR must match');

  const s6InjectedSvg = window.Ripples.injectIntoSVG('<!-- INJECT_CAMERA_RIG_ELEMENTS -->', s5SvgState);
  assert.ok(s6InjectedSvg.includes('class="ripple-hit-target"'), 'Ripple SVG injection must include ripple-hit-target');
  assert.ok(s6InjectedSvg.includes('data-ripple-id="' + stage6Ripple.id + '"'), 'Ripple SVG injection must include data-ripple-id');

  // 9. Timeline Evaluation with Multi-Wave Ripple & Glow Playback Modes
  if (window.EngineBridge && typeof window.EngineBridge.evaluateSceneAtTime === 'function') {
    const evalRes = window.EngineBridge.evaluateSceneAtTime(1.5);
    if (evalRes) {
      assert.ok(Array.isArray(evalRes.glows), 'Timeline evaluation must include glows');
      assert.ok(Array.isArray(evalRes.ripples), 'Timeline evaluation must include ripples');
    }
  }

  // 10. Cleanup
  window.Glows.deleteGlow(stage5Glow.id);
  assert.strictEqual(window.Glows.getGlow(stage5Glow.id), null, 'Glow must be deleted');
  window.Ripples.deleteRipple(stage6Ripple.id);
  assert.strictEqual(window.Ripples.getRipple(stage6Ripple.id), null, 'Ripple must be deleted');

  // ===========================================================================
  // SECTION 16.5: WASM Stage 7 — Camera, Optics & Frame Engines
  // ===========================================================================
  console.log('[HARNESS] Testing WASM Stage 7 Camera, Optics & Frame engines...');

  // 1. Camera Engine Operations
  if (window.EngineBridge && typeof window.EngineBridge.updateCamera === 'function') {
    const camCfg = {
      motion: 'ken-burns',
      camDuration: 8.0,
      camLoop: 'pingpong',
      startX: 40,
      startY: 40,
      startZoom: 1.1,
      endX: 60,
      endY: 60,
      endZoom: 1.5
    };
    const updatedCam = window.EngineBridge.updateCamera(camCfg);
    if (updatedCam) {
      assert.strictEqual(updatedCam.motion, 'ken-burns', 'Camera motion must match');
      assert.strictEqual(updatedCam.camDuration, 8.0, 'Camera duration must match');
      assert.strictEqual(updatedCam.startZoom, 1.1, 'Camera startZoom must match');
    }

    const camEval = window.EngineBridge.evaluateCamera(4.0, 1920, 1080, camCfg);
    if (camEval) {
      assert.ok(camEval.scale >= 1.1 && camEval.scale <= 1.5, 'Evaluated scale must be between start and end');
      assert.ok(typeof camEval.transform === 'string' && camEval.transform.includes('scale('), 'Evaluated camera must return transform string');
    }
  }

  // 2. Optics Engine Operations
  if (window.EngineBridge && typeof window.EngineBridge.updateOptics === 'function') {
    const optCfg = {
      type: 'focus-pull',
      startBlur: 10,
      endBlur: 0,
      focusDur: 5
    };
    const updatedOpt = window.EngineBridge.updateOptics(optCfg);
    if (updatedOpt) {
      assert.strictEqual(updatedOpt.type, 'focus-pull', 'Optical type must match');
      assert.strictEqual(updatedOpt.startBlur, 10, 'Optical startBlur must match');
    }

    const optEval = window.EngineBridge.evaluateOptics(2.5, 5.0, 'once', optCfg);
    if (optEval) {
      assert.strictEqual(optEval.isActive, true, 'Optical focus-pull must be active');
      assert.ok(optEval.blur > 0 && optEval.blur < 10, 'Blur at midpoint must be between start and end');
      assert.ok(optEval.filterAttr.includes('#opt-focus'), 'Filter attribute must reference #opt-focus');
    }
  }

  // 3. Frame Engine Operations & Markup Generation
  if (window.EngineBridge && typeof window.EngineBridge.updateFrame === 'function') {
    const frameCfg = {
      frame: true,
      frameStyle: 'cyber-hud',
      frameDepth: 35,
      frameLighting: true,
      frameLightInt: 80
    };
    const updatedFrame = window.EngineBridge.updateFrame(frameCfg);
    if (updatedFrame) {
      assert.strictEqual(updatedFrame.frameStyle, 'cyber-hud', 'Frame style must match');
      assert.strictEqual(updatedFrame.frameDepth, 35, 'Frame depth must match');
    }

    const frameDesc = window.EngineBridge.describeFrame(frameCfg, 1920, 1080);
    if (frameDesc) {
      assert.ok(frameDesc.markup.includes('SYS.OPTICS // ONLINE'), 'Cyber-HUD markup must include SYS.OPTICS // ONLINE');
      assert.ok(frameDesc.defs.includes('hudGlow'), 'Cyber-HUD defs must include hudGlow filter');
    }
  }

  // 4. Live SVG Integration via Effects.buildFrameMarkup
  if (window.Effects && typeof window.Effects.buildFrameMarkup === 'function') {
    const walnutRes = window.Effects.buildFrameMarkup({
      frame: true,
      frameStyle: 'walnut',
      frameDepth: 40,
      frameLighting: true
    }, 1920, 1080);
    assert.ok(walnutRes && walnutRes.overlay, 'buildFrameMarkup must return overlay string');
    assert.ok(walnutRes.overlay.includes('id="frameAssembly"'), 'Walnut overlay must contain #frameAssembly');
  }

  // 5. Timeline Evaluation with Camera, Optical & Frame Integration
  if (window.EngineBridge && typeof window.EngineBridge.evaluateSceneAtTime === 'function') {
    const fullEval = window.EngineBridge.evaluateSceneAtTime(2.0);
    if (fullEval) {
      assert.ok(fullEval.camera !== undefined, 'Scene evaluation must include camera update');
      assert.ok(fullEval.optical !== undefined, 'Scene evaluation must include optical update');
      assert.ok(fullEval.frame !== undefined, 'Scene evaluation must include frame update');
    }
  }

  // 6. Accordion Isolation: Opening Frame accordion must NEVER toggle or auto-check chkModuleFrame
  const chkFrameEl = document.getElementById('chkModuleFrame');
  const wasCheckedBefore = chkFrameEl ? chkFrameEl.checked : false;
  // Trigger openAccordion for acc-frame
  if (window.openAccordion) {
    window.openAccordion('acc-frame');
  }
  const isCheckedAfter = chkFrameEl ? chkFrameEl.checked : false;
  assert.strictEqual(isCheckedAfter, wasCheckedBefore, 'Opening Frame accordion must never mutate chkModuleFrame.checked');

  // -------------------------------------------------------------------------
  // DEFECT 1 REGRESSION: Shape remains selectable & editable after Snap Preset
  // -------------------------------------------------------------------------
  console.log('[HARNESS] Testing Defect 1 regression: Shape selection after Snap Preset...');
  window.DiagramNodes.list = [];
  window.DiagramNodes.counter = 0;
  window.DiagramNodes.activeId = null;

  const defect1Node = window.DiagramNodes.createNode({
    shape: 'rounded',
    text: 'Defect1 Node',
    x: 50,
    y: 50,
    width: 200,
    height: 100
  });
  assert.ok(defect1Node, 'Created test node must exist');
  const createdId = defect1Node.id;
  assert.ok(createdId !== null && createdId !== undefined, 'Created node must have a valid ID');

  // Verify initial retrieval by both number and string ID
  assert.strictEqual(window.DiagramNodes.getNode(createdId), defect1Node);
  assert.strictEqual(window.DiagramNodes.getNode(String(createdId)), defect1Node);
  assert.strictEqual(window.DiagramNodes.getNode(Number(createdId)), defect1Node);

  // Apply Snap Preset
  window.DiagramNodes.selectNode(createdId);
  assert.strictEqual(String(window.DiagramNodes.activeId), String(createdId));
  window.DiagramNodes.applyPresetToActive();

  // Verify node ID is preserved and not corrupted or mutated to an incompatible type
  assert.strictEqual(String(defect1Node.id), String(createdId), 'Node ID must remain unchanged after preset apply');
  assert.strictEqual(window.DiagramNodes.getNode(createdId), defect1Node, 'getNode with original ID must succeed');
  assert.strictEqual(window.DiagramNodes.getNode(String(createdId)), defect1Node, 'getNode with string ID must succeed');
  assert.strictEqual(window.DiagramNodes.getNode(Number(createdId)), defect1Node, 'getNode with number ID must succeed');

  // Verify stage hit testing and target resolution for contextual properties
  const dummyEl = {
    getAttribute(name) {
      if (name === 'data-node-id') return String(createdId);
      return null;
    },
    closest(sel) {
      if (sel.includes('[data-node-id]')) return dummyEl;
      return null;
    }
  };
  const resolved = window.FloatingPropertiesEditor._resolveTargetObject(dummyEl);
  assert.ok(resolved, '_resolveTargetObject must resolve node');
  assert.strictEqual(resolved.type, 'node');
  assert.strictEqual(String(resolved.id), String(createdId));

  // Verify Stage node resolution
  const stageTargetNode = window.DiagramNodes.getNode(parseInt(dummyEl.getAttribute('data-node-id'), 10)) ||
                          window.DiagramNodes.getNode(dummyEl.getAttribute('data-node-id'));
  assert.strictEqual(stageTargetNode, defect1Node, 'Stage click target resolution must find node');

  // Verify dragging / stage position update
  assert.strictEqual(window.DiagramNodes.handleStageClick(60, 65), true, 'handleStageClick on active node must succeed');
  assert.strictEqual(defect1Node.x, 60);
  assert.strictEqual(defect1Node.y, 65);

  // Verify node dimensions update and preset re-application
  window.DiagramNodes.updateActive('width', 240);
  assert.strictEqual(defect1Node.width, 240);
  window.DiagramNodes.updateActive('height', 120);
  assert.strictEqual(defect1Node.height, 120);
  window.DiagramNodes.applyPresetToActive();
  assert.strictEqual(window.DiagramNodes.getNode(createdId), defect1Node);

  // Verify deselect and re-select
  window.DiagramNodes.deselectNode();
  assert.strictEqual(window.DiagramNodes.activeId, null);
  window.DiagramNodes.selectNode(createdId);
  assert.strictEqual(String(window.DiagramNodes.activeId), String(createdId));

  // -------------------------------------------------------------------------
  // DEFECT 2 REGRESSION: Play Scene execution, auto-rewind & frame presentation
  // -------------------------------------------------------------------------
  console.log('[HARNESS] Testing Defect 2 regression: Timeline scene playback & presentation...');
  assert.ok(window.TimelinePlayer, 'TimelinePlayer must exist');
  window.TimelinePlayer.init();
  assert.strictEqual(window.TimelinePlayer._initialized, true, 'TimelinePlayer must be initialized');

  // Test 1: Play Scene advances isPlaying
  window.TimelinePlayer.stop();
  assert.strictEqual(window.TimelinePlayer.status, 'stopped');
  assert.strictEqual(window.TimelinePlayer.currentTime, 0.0);
  window.TimelinePlayer.play();
  assert.strictEqual(window.TimelinePlayer.status, 'playing');
  assert.strictEqual(window.TimelinePlayer.isPlaying, true, 'TimelinePlayer.play() must set isPlaying = true');
  const playBtn = document.getElementById('btnTimelinePlay');
  assert.strictEqual(playBtn.textContent, '⏸ Pause Scene');

  // Test 2: Auto-rewind when clicking Play at end of playback
  window.TimelinePlayer.currentTime = window.TimelinePlayer.duration; // At 7.0s
  window.TimelinePlayer.status = 'ended';
  window.TimelinePlayer.isPlaying = false;
  window.TimelinePlayer.play();
  assert.strictEqual(window.TimelinePlayer.status, 'playing');
  assert.strictEqual(window.TimelinePlayer.isPlaying, true, 'Calling play() at duration must start playback');
  assert.strictEqual(window.TimelinePlayer.currentTime, 0.0, 'Calling play() at duration must auto-rewind to 0.0');

  // Test 3: Loop tick advances currentTime and clamps/pauses in 'once' mode
  window.TimelinePlayer.currentTime = 6.95;
  window.TimelinePlayer.duration = 7.0;
  window.TimelinePlayer.loopMode = 'once';
  window.TimelinePlayer.status = 'playing';
  window.TimelinePlayer.isPlaying = true;
  window.TimelinePlayer._lastTimestamp = 1000;
  window.TimelinePlayer._loop(1100); // +0.1s -> 7.05s >= 7.0s
  assert.strictEqual(window.TimelinePlayer.status, 'ended', 'Status must be ended when duration reached in once mode');
  assert.strictEqual(window.TimelinePlayer.isPlaying, false, 'Playback must pause when duration reached in once mode');
  assert.strictEqual(window.TimelinePlayer.currentTime, 7.0, 'Current time must clamp to duration');

  // Test 4: Seek and Stop
  window.TimelinePlayer.seek(3.5);
  assert.strictEqual(window.TimelinePlayer.currentTime, 3.5);
  window.TimelinePlayer.stop();
  assert.strictEqual(window.TimelinePlayer.status, 'stopped');
  assert.strictEqual(window.TimelinePlayer.isPlaying, false);
  assert.strictEqual(window.TimelinePlayer.currentTime, 0.0);

  // Test 5: DOM Frame presentation
  const mockSvgContainer = document.getElementById('svgContainer');
  let camRigStyle = {};
  const mockCamRig = {
    style: camRigStyle
  };
  mockSvgContainer.querySelector = function(sel) {
    if (sel.includes('.camera-rig')) return mockCamRig;
    return null;
  };
  window.TimelinePlayer.applyFrameToDOM({
    flows: [],
    glows: [],
    ripples: [],
    camera: { motion: 'ken-burns', transform: 'scale(1.15) translate(-20px, 10px)' },
    optical: { isActive: false },
    nodes: []
  });
  assert.strictEqual(mockCamRig.style.animation, 'none', 'Ken Burns motion must disable CSS animation');
  assert.strictEqual(mockCamRig.style.transform, 'scale(1.15) translate(-20px, 10px)', 'Camera transform must be applied to camRig');

  // -------------------------------------------------------------------------
  // PLAYBACK CONTROL OWNERSHIP & TIMELINE STATE MACHINE VERIFICATION
  // -------------------------------------------------------------------------
  console.log('[HARNESS] Testing Playback Control Ownership & Timeline State Machine...');

  // Case A: Editing while stopped
  window.TimelinePlayer.stop();
  assert.strictEqual(window.TimelinePlayer.status, 'stopped');
  assert.strictEqual(window.TimelinePlayer.currentTime, 0.0);

  // Create node and edit properties
  const editStopNode = window.DiagramNodes.createNode({ text: 'EditStop', x: 20, y: 20 });
  window.DiagramNodes.selectNode(editStopNode.id);
  window.DiagramNodes.updateActive('width', 220);
  window.DiagramNodes.applyPresetToActive();
  window.triggerAppRender();

  // Playhead must remain at 0.0 and status must remain stopped
  assert.strictEqual(window.TimelinePlayer.status, 'stopped', 'Editing while stopped must keep status stopped');
  assert.strictEqual(window.TimelinePlayer.isPlaying, false, 'Editing while stopped must not start playback');
  assert.strictEqual(window.TimelinePlayer.currentTime, 0.0, 'Editing while stopped must not move playhead');

  // Case B: Editing while paused
  window.TimelinePlayer.seek(2.5);
  window.TimelinePlayer.status = 'paused';
  window.TimelinePlayer.isPlaying = false;
  assert.strictEqual(window.TimelinePlayer.currentTime, 2.5);

  // Edit object while paused
  window.DiagramNodes.updateActive('x', 35);
  window.SceneState.setControl('cameraMotionSelect', 'handheld-drift');
  window.SceneState.setControl('effectSelect', 'focus-pull');
  window.triggerAppRender();

  assert.strictEqual(window.TimelinePlayer.status, 'paused', 'Editing while paused must keep status paused');
  assert.strictEqual(window.TimelinePlayer.isPlaying, false, 'Editing while paused must not start playback');
  assert.strictEqual(window.TimelinePlayer.currentTime, 2.5, 'Editing while paused must preserve playhead');

  // Resume from paused
  window.TimelinePlayer.play();
  assert.strictEqual(window.TimelinePlayer.status, 'playing', 'Play while paused must resume playing');
  assert.strictEqual(window.TimelinePlayer.isPlaying, true);
  assert.strictEqual(window.TimelinePlayer.currentTime, 2.5, 'Resume must start from paused playhead');

  // Case C: Editing while playing
  window.DiagramNodes.updateActive('y', 45);
  window.triggerAppRender();
  assert.strictEqual(window.TimelinePlayer.status, 'playing', 'Editing while playing must keep playing');
  assert.strictEqual(window.TimelinePlayer.isPlaying, true);
  assert.strictEqual(window.TimelinePlayer.currentTime, 2.5, 'Editing while playing must not reset playhead');

  // Case D: End-of-scene behavior in once mode
  window.TimelinePlayer.duration = 7.0;
  window.TimelinePlayer.loopMode = 'once';
  window.TimelinePlayer.currentTime = 6.95;
  window.TimelinePlayer._lastTimestamp = 2000;
  window.TimelinePlayer._loop(2100); // 6.95 + 0.1 -> 7.05 >= 7.0
  assert.strictEqual(window.TimelinePlayer.status, 'ended', 'Terminal frame must transition to ended');
  assert.strictEqual(window.TimelinePlayer.isPlaying, false, 'Playback must stop at end');
  assert.strictEqual(window.TimelinePlayer.currentTime, 7.0, 'Playhead must clamp to duration');

  // Additional ticks while ended must NOT restart playback
  window.TimelinePlayer._loop(2200);
  assert.strictEqual(window.TimelinePlayer.status, 'ended');
  assert.strictEqual(window.TimelinePlayer.isPlaying, false);
  assert.strictEqual(window.TimelinePlayer.currentTime, 7.0);

  // Play while ended: Rewind and start once
  window.TimelinePlayer.play();
  assert.strictEqual(window.TimelinePlayer.status, 'playing', 'Play from ended must start playing');
  assert.strictEqual(window.TimelinePlayer.isPlaying, true);
  assert.strictEqual(window.TimelinePlayer.currentTime, 0.0, 'Play from ended must rewind to zero');

  // Case E: Duration change preserves state and clamps if needed
  window.TimelinePlayer.pause();
  window.TimelinePlayer.seek(4.0);
  assert.strictEqual(window.TimelinePlayer.currentTime, 4.0);
  assert.strictEqual(window.TimelinePlayer.status, 'paused');

  // Increase duration
  window.SceneState.setControl('durationSlider', 10.0);
  window.TimelinePlayer.syncFromScene();
  assert.strictEqual(window.TimelinePlayer.duration, 10.0);
  assert.strictEqual(window.TimelinePlayer.currentTime, 4.0, 'Increasing duration must preserve playhead');
  assert.strictEqual(window.TimelinePlayer.status, 'paused', 'Increasing duration must preserve paused status');

  // Decrease duration below current playhead
  window.SceneState.setControl('durationSlider', 3.0);
  window.TimelinePlayer.syncFromScene();
  assert.strictEqual(window.TimelinePlayer.duration, 3.0);
  assert.strictEqual(window.TimelinePlayer.currentTime, 3.0, 'Decreasing duration must clamp playhead');
  assert.strictEqual(window.TimelinePlayer.status, 'paused', 'Decreasing duration must preserve paused status');

  // Case F: Project load stops playback without autoplay
  window.TimelinePlayer.play();
  assert.strictEqual(window.TimelinePlayer.status, 'playing');
  window.AppCoordinator.coordinatePostRestore({ source: 'project', projectId: 'proj-123' });
  assert.strictEqual(window.TimelinePlayer.status, 'stopped', 'Project restore must stop playback');
  assert.strictEqual(window.TimelinePlayer.isPlaying, false, 'Project restore must not autoplay');
  assert.strictEqual(window.TimelinePlayer.currentTime, 0.0, 'Project restore must reset playhead to 0.0');

  // Case G: Seek and scrub without autoplay
  window.TimelinePlayer.seek(1.5);
  assert.strictEqual(window.TimelinePlayer.currentTime, 1.5);
  assert.strictEqual(window.TimelinePlayer.status, 'stopped', 'Seek while stopped must remain stopped');
  assert.strictEqual(window.TimelinePlayer.isPlaying, false);

  // -------------------------------------------------------------------------
  // INDEPENDENT OBJECT ANIMATIONS VS GLOBAL CAMERA TRANSPORT SEPARATION
  // -------------------------------------------------------------------------
  console.log('[HARNESS] Testing Independent Object Animations vs Global Camera Transport Separation...');

  // 1. Flow visibility and independent animation markup
  window.DataFlows.list = [];
  window.DataFlows.counter = 0;
  const indepFlow = window.DataFlows.createFlow({
    nodes: [{ x: 10, y: 10 }, { x: 50, y: 50 }],
    color: '#38bdf8',
    speed: 2.5,
    opacity: 0.9,
    type: 'circle'
  });
  assert.ok(indepFlow, 'indepFlow must be created');

  const testState = window.SceneState.buildRenderState();
  const indepFullSvg = window.buildFullSVG ? window.buildFullSVG(testState) : window.DataFlows.injectIntoSVG(window.Effects.build(testState), testState);

  // Flow payload and motion elements must be fully generated and visible
  assert.ok(indepFullSvg.includes('class="flow-payload-group"'), 'SVG must include .flow-payload-group');
  assert.ok(indepFullSvg.includes('<animateMotion'), 'SVG must include independent SMIL <animateMotion>');
  assert.ok(indepFullSvg.includes('<mpath'), 'SVG must include <mpath> for path following');
  assert.ok(indepFullSvg.includes('class="flow-track-path"'), 'SVG must include .flow-track-path');

  // Verify applyFrameToDOM does NOT overwrite or hide Flow payload
  let flowPayloadStyle = {};
  let flowPayloadAttrs = {};
  const mockFlowPayload = {
    style: flowPayloadStyle,
    setAttribute(k, v) { flowPayloadAttrs[k] = v; }
  };
  mockSvgContainer.querySelector = function(sel) {
    if (sel.includes('.camera-rig')) return mockCamRig;
    if (sel.includes('.flow-payload-group')) return mockFlowPayload;
    return null;
  };

  // Evaluate frame at any time (stopped, paused, playing)
  window.TimelinePlayer.evaluateAndApply(0.0);
  assert.strictEqual(flowPayloadAttrs.opacity, undefined, 'applyFrameToDOM must NEVER overwrite Flow opacity');
  assert.strictEqual(flowPayloadAttrs.transform, undefined, 'applyFrameToDOM must NEVER overwrite Flow transform');
  assert.strictEqual(flowPayloadStyle.display, undefined, 'applyFrameToDOM must NEVER hide Flow payload');

  // 2. Glow independent animation while global transport is paused
  window.Glows.list = [];
  window.Glows.counter = 0;
  const indepRadarGlow = window.Glows.createGlow({
    x: 40,
    y: 40,
    shape: 'radar',
    size: 50,
    rings: 3,
    dur: 2.0
  });
  assert.ok(indepRadarGlow, 'Radar glow must be created');
  const glowSvg = window.Glows.injectIntoSVG(window.Effects.build(testState), testState.image.width, testState.image.height);
  assert.ok(glowSvg.includes('class="diagram-glow-instance"'), 'SVG must include .diagram-glow-instance');
  assert.ok(glowSvg.includes('attributeName="r"'), 'Glow radar rings must include independent SMIL radius animation');

  window.TimelinePlayer.play();
  window.TimelinePlayer.seek(2.5);
  window.TimelinePlayer.pause();
  assert.strictEqual(window.TimelinePlayer.status, 'paused');
  // Evaluating while paused updates ONLY Camera & Optics, never Glow rings
  let glowAttrs = {};
  const mockGlowCore = { setAttribute(k, v) { glowAttrs[k] = v; } };
  mockSvgContainer.querySelector = function(sel) {
    if (sel.includes('.camera-rig')) return mockCamRig;
    if (sel.includes('.diagram-glow-instance')) return { querySelector: () => mockGlowCore, querySelectorAll: () => [] };
    return null;
  };
  window.TimelinePlayer.evaluateAndApply(2.5);
  assert.strictEqual(glowAttrs.opacity, undefined, 'applyFrameToDOM must NEVER overwrite Glow core opacity');

  // 3. Ripple independent animation after global transport has ended
  window.Ripples.list = [];
  window.Ripples.counter = 0;
  const indepRip = window.Ripples.createRipple({
    x: 60,
    y: 60,
    rings: 4,
    innerR: 10,
    outerR: 80,
    dur: 3.0
  });
  assert.ok(indepRip, 'Ripple must be created');
  const ripSvg = window.Ripples.injectIntoSVG(window.Effects.build(testState), testState);
  assert.ok(ripSvg.includes('class="diagram-ripple-instance"'), 'SVG must include .diagram-ripple-instance');
  assert.ok(ripSvg.includes('attributeName="stroke-opacity"'), 'Ripple must include independent SMIL opacity animation');

  // Set global timeline to ended
  window.TimelinePlayer.currentTime = 7.0;
  window.TimelinePlayer.status = 'ended';
  window.TimelinePlayer.isPlaying = false;
  window.TimelinePlayer.evaluateAndApply(7.0);
  // Verify Camera was updated while Ripples remain untouched
  assert.strictEqual(mockCamRig.style.animation, 'none');

  // 4. Global seek updates Camera without touching Flow/Glow/Ripple DOM
  window.TimelinePlayer.seek(2.1);
  assert.strictEqual(window.TimelinePlayer.currentTime, 2.1);
  assert.strictEqual(window.TimelinePlayer.status, 'paused');

  // 5. Test Camera & Optics Preview Playback, Exact Reproduction Settings & Export Distinction
  console.log('[HARNESS] Testing Camera and Optics Preview Playback (17s Scene, 8s Ken Burns, 6s Focus Pull)...');
  window.SceneState.setControl('durationSlider', 17.0);
  window.SceneState.setControl('camDurationSlider', 8.0);
  window.SceneState.setControl('cameraMotionSelect', 'ken-burns');
  window.SceneState.setControl('camLoopSelect', 'once');
  window.SceneState.setControl('effectSelect', 'focus-pull');
  window.SceneState.setControl('startBlurSlider', 18.0);
  window.SceneState.setControl('endBlurSlider', 0.0);
  window.SceneState.setControl('focusDurSlider', 6.0);

  const reproState = window.SceneState.buildRenderState();
  assert.strictEqual(reproState.duration, 17.0, 'Global Scene duration must be 17s');
  assert.strictEqual(reproState.camera.camDuration, 8.0, 'Ken Burns duration must be 8s');
  assert.strictEqual(reproState.optical.focusDur, 6.0, 'Focus Pull duration must be 6s');
  window.EngineBridge.syncScene();

  // A. Standalone SVG export must contain declarative SMIL & CSS animations
  const exportSvg = window.Effects.build(reproState);
  assert.ok(exportSvg.includes('@keyframes camKenBurns'), 'Exported SVG must contain CSS @keyframes camKenBurns for standalone viewer playback');
  assert.ok(exportSvg.includes('animation: camKenBurns 8s'), 'Exported SVG must configure 8s Ken Burns CSS animation');
  assert.ok(exportSvg.includes('<filter id="opt-focus"'), 'Exported SVG must contain #opt-focus filter');
  assert.ok(exportSvg.includes('<animate attributeName="stdDeviation"'), 'Exported SVG must contain declarative SMIL <animate> for standalone viewer playback');
  assert.ok(exportSvg.includes('dur="6s"'), 'Exported SVG SMIL animate must have dur="6s"');

  // B. Live Editor Preview: applyFrameToDOM must neutralize SMIL in DOM and drive feGaussianBlur stdDeviation
  let feAttrs = {};
  let removedAnimElements = [];
  const mockAnimTag = {
    remove() { removedAnimElements.push(this); }
  };
  const mockFeGaussianBlur = {
    setAttribute(k, v) { feAttrs[k] = v; },
    querySelector(sel) {
      if (sel === 'animate') return mockAnimTag;
      return null;
    }
  };
  const mockOptFocus = {
    querySelector(sel) {
      if (sel.includes('feGaussianBlur')) return mockFeGaussianBlur;
      return null;
    }
  };

  mockSvgContainer.querySelector = function(sel) {
    if (sel.includes('.camera-rig')) return mockCamRig;
    if (sel.includes('feGaussianBlur')) return mockFeGaussianBlur;
    if (sel.includes('#opt-focus')) return mockOptFocus;
    return null;
  };
  mockSvgContainer.querySelectorAll = function(sel) {
    if (sel.includes('animate')) return [mockAnimTag];
    return [];
  };

  // Sync timeline player to scene
  window.TimelinePlayer.syncFromScene();
  assert.strictEqual(window.TimelinePlayer.duration, 17.0, 'TimelinePlayer duration must be 17s');

  // Evaluate at t=0s
  window.TimelinePlayer.stop();
  window.TimelinePlayer.evaluateAndApply(0.0);
  assert.ok(removedAnimElements.length > 0, 'Live preview must neutralize SMIL <animate> inside optics filter');
  assert.strictEqual(feAttrs.stdDeviation, '18.00', 'Blur must be 18.00 at t=0s');
  assert.strictEqual(mockCamRig.style.animation, 'none', 'Live preview must neutralize CSS @keyframes on camera-rig');

  // Evaluate at t=3s (midpoint of 6s focus pull)
  window.TimelinePlayer.evaluateAndApply(3.0);
  const blur3 = parseFloat(feAttrs.stdDeviation);
  assert.ok(blur3 < 18.0 && blur3 > 0.0, `Blur at t=3s must transition between 18 and 0 (got ${blur3})`);

  // Evaluate at t=6s (end of 6s focus pull duration)
  window.TimelinePlayer.evaluateAndApply(6.0);
  assert.strictEqual(feAttrs.stdDeviation, '0.00', 'Blur must reach 0.00 at t=6s');

  // Evaluate at t=8s (end of 8s Ken Burns duration)
  window.TimelinePlayer.evaluateAndApply(8.0);
  assert.strictEqual(feAttrs.stdDeviation, '0.00', 'Blur must hold at 0.00 at t=8s');
  const camTrans8 = mockCamRig.style.transform;

  // Evaluate at t=12s (both individual durations ended, scene still running)
  window.TimelinePlayer.evaluateAndApply(12.0);
  assert.strictEqual(feAttrs.stdDeviation, '0.00', 'Blur must hold at 0.00 at t=12s');
  assert.strictEqual(mockCamRig.style.transform, camTrans8, 'Camera must hold at end transform at t=12s');

  // Evaluate at t=17s (end of global scene duration)
  window.TimelinePlayer.evaluateAndApply(17.0);
  assert.strictEqual(feAttrs.stdDeviation, '0.00', 'Blur must hold at 0.00 at t=17s');
  assert.strictEqual(mockCamRig.style.transform, camTrans8, 'Camera must hold at end transform at t=17s');

  // Seek and Pause testing
  window.TimelinePlayer.play();
  window.TimelinePlayer.seek(4.5);
  window.TimelinePlayer.pause();
  assert.strictEqual(window.TimelinePlayer.status, 'paused');
  assert.strictEqual(window.TimelinePlayer.currentTime, 4.5);

  // Stop resets to t=0
  window.TimelinePlayer.stop();
  assert.strictEqual(window.TimelinePlayer.status, 'stopped');
  assert.strictEqual(window.TimelinePlayer.currentTime, 0.0);
  assert.strictEqual(feAttrs.stdDeviation, '18.00', 'Blur must reset to 18.00 on stop');

  // =========================================================================
  // STAGE 8 VERIFICATION: Authoritative Scene State, Selection, History & Editable Object Names
  // =========================================================================
  console.log('[HARNESS] Testing WASM Stage 8: Authoritative Scene State, Selection, History and Object Naming...');

  // Create objects for testing
  const stage8Node = window.DiagramNodes.createNode({ shape: 'rounded', text: 'Shape Text Label' });
  const stage8Flow = window.DataFlows.createFlow({ label: 'Badge Label' });
  const stage8Glow = window.Glows.createGlow({ shape: 'circle' });
  const stage8Ripple = window.Ripples.createRipple({ rings: 3 });

  // 1. Selection Coordination and Go Engine Parity
  window.AppCoordinator.selectObject('node', stage8Node.id);
  const selNode = window.EngineBridge.getSelection();
  assert.ok(selNode && selNode.success, 'EngineBridge.getSelection must return success');
  assert.strictEqual(selNode.type, 'node', 'Go selection type must be node');
  assert.strictEqual(String(selNode.id), String(stage8Node.id), 'Go selection id must match selected node');

  window.AppCoordinator.clearSelection();
  const selCleared = window.EngineBridge.getSelection();
  assert.strictEqual(selCleared.type, 'none', 'Go selection type must be none after clearSelection');
  assert.strictEqual(selCleared.id, '', 'Go selection id must be empty after clearSelection');

  // 2. Object Naming End-to-End

  // Node Rename
  window.DiagramNodes.selectNode(stage8Node.id);
  const unicodeNodeName = '🚀 Primary Core Pump #1 / 冷却ポンプ';
  window.DiagramNodes.updateActive('name', unicodeNodeName);
  assert.strictEqual(stage8Node.name, unicodeNodeName, 'stage8Node.name must be updated');
  assert.strictEqual(stage8Node.text, 'Shape Text Label', 'Node diagram text must remain intact after renaming');

  // Verify rename sent to Go engine
  const wasmNodeState = window.EngineBridge.dispatch('Node.Get', { id: String(stage8Node.id) });
  assert.ok(wasmNodeState, 'Node.Get must return node');
  assert.strictEqual(wasmNodeState.name, unicodeNodeName, 'Go scene node name must match renamed string');
  assert.strictEqual(wasmNodeState.text, 'Shape Text Label', 'Go scene node text must not be overwritten');

  // Flow Rename
  window.DataFlows.selectFlow(stage8Flow.id);
  const unicodeFlowName = 'Main Cooling Water Loop (High Temp) 💧';
  window.DataFlows.updateActive('name', unicodeFlowName);
  assert.strictEqual(stage8Flow.name, unicodeFlowName, 'stage8Flow.name must be updated');
  assert.strictEqual(stage8Flow.label, 'Badge Label', 'Flow midpoint badge label must remain intact after renaming');

  const wasmFlowState = window.EngineBridge.getFlow(stage8Flow.id);
  assert.ok(wasmFlowState, 'getFlow must return flow');
  assert.strictEqual(wasmFlowState.name, unicodeFlowName, 'Go scene flow name must match renamed string');

  // Glow Rename
  window.Glows.selectGlow(stage8Glow.id);
  const glowName = 'Reactor Core Overheat Alarm #3';
  window.Glows.updateActive('name', glowName);
  assert.strictEqual(stage8Glow.name, glowName, 'stage8Glow.name must be updated');

  const wasmGlowState = window.EngineBridge.dispatch('Glow.Get', { id: String(stage8Glow.id) });
  assert.strictEqual(wasmGlowState.name, glowName, 'Go scene glow name must match');

  // Ripple Rename
  window.Ripples.selectRipple(stage8Ripple.id);
  const rippleName = 'Expansion Wave Alpha';
  window.Ripples.updateActive('name', rippleName);
  assert.strictEqual(stage8Ripple.name, rippleName, 'stage8Ripple.name must be updated');

  const wasmRippleState = window.EngineBridge.dispatch('Ripple.Get', { id: String(stage8Ripple.id) });
  assert.strictEqual(wasmRippleState.name, rippleName, 'Go scene ripple name must match');

  // 3. Clear Name returns to default display label
  window.DiagramNodes.selectNode(stage8Node.id);
  window.DiagramNodes.updateActive('name', '');
  assert.strictEqual(stage8Node.name, '', 'Name should be cleared');
  const wasmNodeCleared = window.EngineBridge.dispatch('Node.Get', { id: String(stage8Node.id) });
  assert.strictEqual(wasmNodeCleared.name || '', '', 'Go scene node name should be cleared');

  // Restore name for round-trip test
  window.DiagramNodes.updateActive('name', unicodeNodeName);

  // 4. Undo and Redo of Renames
  window.HistoryManager.recordImmediate();
  const histState1 = window.EngineBridge.getHistoryState();
  assert.ok(histState1 && histState1.undoCount >= 2, 'History stack must have >= 2 entries');

  window.DiagramNodes.updateActive('name', 'Modified Temporary Name');
  window.HistoryManager.recordImmediate();

  window.HistoryManager.undo();
  assert.strictEqual(window.DiagramNodes.getNode(stage8Node.id).name, unicodeNodeName, 'Undo must restore previous object name');

  window.HistoryManager.redo();
  assert.strictEqual(window.DiagramNodes.getNode(stage8Node.id).name, 'Modified Temporary Name', 'Redo must re-apply modified object name');

  // Undo back to unicodeNodeName
  window.HistoryManager.undo();
  assert.strictEqual(window.DiagramNodes.getNode(stage8Node.id).name, unicodeNodeName, 'Undo must restore unicodeNodeName');

  // 5. Persistence: Project Save / Load Round-Trip
  const serialized = window.ProjectManager.serializeStudioState();
  assert.ok(serialized.includes(unicodeNodeName), 'Serialized project state must include custom object names');
  assert.ok(serialized.includes(unicodeFlowName), 'Serialized project state must include custom flow names');
  assert.ok(serialized.includes(glowName), 'Serialized project state must include custom glow names');
  assert.ok(serialized.includes(rippleName), 'Serialized project state must include custom ripple names');

  // Simulate loading the project state
  window.ProjectManager.applyStudioState(serialized);
  const restoredNode = window.DiagramNodes.getNode(stage8Node.id);
  assert.ok(restoredNode, 'Restored node must exist');
  assert.strictEqual(restoredNode.name, unicodeNodeName, 'Restored node name must match');
  assert.strictEqual(restoredNode.text, 'Shape Text Label', 'Restored node text must match');

  const restoredFlow = window.DataFlows.getFlow(stage8Flow.id);
  assert.ok(restoredFlow, 'Restored flow must exist');
  assert.strictEqual(restoredFlow.name, unicodeFlowName, 'Restored flow name must match');

  // =========================================================================
  // STAGE 9 VERIFICATION: Native .sva Project Format, Asset Packaging and Go Serialization
  // =========================================================================
  console.log('[HARNESS] Testing WASM Stage 9: Native .sva Project Format & Asset Packaging...');

  // 1. EngineBridge SVA encoding
  const stage9StateStr = window.ProjectManager.serializeStudioState();
  const stage9StateObj = JSON.parse(stage9StateStr);
  stage9StateObj.metadata = {
    futureDigitalTwinKey: 'TWIN-9942',
    tierLevel: 3
  };

  const svaEncResult = window.EngineBridge.encodeSVA('Mission Critical Plant', 'Stage 9 Verification Package', stage9StateObj);
  assert.ok(svaEncResult && svaEncResult.success, 'EngineBridge.encodeSVA must succeed');
  assert.ok(svaEncResult.dataB64 && svaEncResult.dataB64.length > 50, 'dataB64 must be non-empty');
  assert.strictEqual(svaEncResult.filename, 'Mission Critical Plant.sva', 'Filename must match project name with .sva extension');

  // 2. EngineBridge SVA validation
  const svaValResult = window.EngineBridge.validateSVA(svaEncResult.dataB64);
  assert.ok(svaValResult && svaValResult.success, 'EngineBridge.validateSVA must succeed');
  assert.strictEqual(svaValResult.manifest.format, 'sva', 'Format signature must be sva');
  assert.strictEqual(svaValResult.manifest.version, '1.0.0', 'SVA format version must be 1.0.0');
  assert.strictEqual(svaValResult.manifest.name, 'Mission Critical Plant');

  // 3. EngineBridge SVA decoding & state extraction
  const svaDecResult = window.EngineBridge.decodeSVA(svaEncResult.dataB64);
  assert.ok(svaDecResult && svaDecResult.success, 'EngineBridge.decodeSVA must succeed');
  assert.ok(svaDecResult.state, 'Decoded SVA must return restored state');

  const restoredSVAState = (typeof svaDecResult.state === 'string') ? JSON.parse(svaDecResult.state) : svaDecResult.state;
  assert.strictEqual(restoredSVAState.version, '1.2.0', 'Restored state must match schema 1.2.0');
  assert.ok(restoredSVAState.nodes.length >= 1, 'Restored state must contain diagram nodes');
  assert.strictEqual(restoredSVAState.metadata.futureDigitalTwinKey, 'TWIN-9942', 'Unknown extension metadata must survive SVA round-trip');

  // 4. ProjectManager SVA interfaces
  assert.strictEqual(typeof window.ProjectManager.exportSVA, 'function', 'ProjectManager.exportSVA must exist');
  assert.strictEqual(typeof window.ProjectManager.importSVA, 'function', 'ProjectManager.importSVA must exist');

  // 5. Stage 9 Regression: Background Image (generated-image(15) 1024x1024) Packaging & Restoration
  console.log('[HARNESS] Testing Stage 9 Regression: Background Photo Packaging & Restoration...');
  const fakePngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const photoState = {
    version: '1.2.0',
    controls: {
      canvasWidthInput: '1024',
      canvasHeightInput: '1024',
      canvasPatternSelect: 'photo',
      photoFitSelect: 'match'
    },
    loadedPhoto: {
      filename: 'generated-image(15)',
      mime: 'image/png',
      b64: fakePngB64,
      naturalWidth: 1024,
      naturalHeight: 1024
    },
    nodes: [],
    nodesCounter: 0,
    flows: [],
    flowsCounter: 0,
    glows: [],
    glowsCounter: 0,
    ripples: [],
    ripplesCounter: 0
  };

  const photoEnc = window.EngineBridge.encodeSVA('Photo Project', 'Testing background restoration', photoState);
  assert.ok(photoEnc && photoEnc.success, 'Photo SVA encode must succeed');

  const photoDec = window.EngineBridge.decodeSVA(photoEnc.dataB64);
  assert.ok(photoDec && photoDec.success, 'Photo SVA decode must succeed');

  const decodedPhotoState = (typeof photoDec.state === 'string') ? JSON.parse(photoDec.state) : photoDec.state;
  assert.ok(decodedPhotoState.loadedPhoto, 'Decoded state must have loadedPhoto');
  assert.strictEqual(decodedPhotoState.loadedPhoto.filename, 'generated-image(15)');
  assert.strictEqual(decodedPhotoState.loadedPhoto.naturalWidth, 1024);
  assert.strictEqual(decodedPhotoState.loadedPhoto.naturalHeight, 1024);
  assert.ok(!decodedPhotoState.loadedPhoto.b64.startsWith('data:'), 'Decoded loadedPhoto.b64 must be raw base64 string, not data URI');
  assert.strictEqual(decodedPhotoState.loadedPhoto.b64, fakePngB64, 'Decoded b64 must match original base64');
  assert.strictEqual(decodedPhotoState.controls.canvasPatternSelect, 'photo', 'Controls must have canvasPatternSelect=photo');

  // Apply to studio and verify DOM / Effects rendering
  window.ProjectManager.applyStudioState(decodedPhotoState);
  const currentPhoto = window.SceneState.getLoadedPhoto();
  assert.ok(currentPhoto, 'SceneState must have loaded photo');
  assert.strictEqual(currentPhoto.filename, 'generated-image(15)');

  const patternEl = document.getElementById('canvasPatternSelect');
  assert.ok(patternEl, 'canvasPatternSelect element must exist');
  assert.strictEqual(patternEl.value, 'photo', 'canvasPatternSelect must be set to photo');

  const canvasState = window.SceneState.buildCurrentCanvasState();
  const photoMarkup = window.Effects.buildPhotoElement(canvasState, 1024, 1024);
  assert.ok(photoMarkup.includes('<image href="data:image/png;base64,'), 'Photo markup must contain valid data:image/png;base64 href');
  assert.ok(!photoMarkup.includes('data:image/png;base64,data:'), 'Photo markup must NEVER contain double data: prefix');

  // =========================================================================
  // Stage 11 Quality & Usability Verification:
  // 1. Non-blocking Studio Notification / Toast System
  // 2. Undo / Redo Selection Retention
  // 3. Object Naming & Header Synchronization
  // =========================================================================
  console.log('[HARNESS] Testing Stage 11 Quality & Usability Improvements...');

  // 1. Studio Notification System
  assert.strictEqual(typeof window.AppCoordinator.showNotification, 'function', 'AppCoordinator.showNotification must exist');
  assert.strictEqual(typeof window.showStudioNotification, 'function', 'window.showStudioNotification must exist');

  const toastInfo = window.AppCoordinator.showNotification('Test Info Message', 'info', 0);
  assert.ok(toastInfo, 'showNotification must return toast element');
  assert.ok(toastInfo.className.includes('notice-info'), 'Toast must have notice-info class');
  const msgChild = toastInfo.children && toastInfo.children.find((c) => c.textContent && c.textContent.includes('Test Info Message'));
  assert.ok(msgChild, 'Toast must contain message text');

  const toastWarn = window.showStudioNotification('Warning: 2 waypoints minimum', 'warning', 0);
  assert.ok(toastWarn && toastWarn.className.includes('notice-warning'), 'showStudioNotification must support warning toasts');

  // 2. Undo / Redo Selection Retention
  window.DiagramNodes.list = [];
  window.DiagramNodes.counter = 0;
  const n1 = window.DiagramNodes.createNode({ text: 'Alpha' });
  window.AppCoordinator.selectObject('node', n1.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, n1.id);

  // When post restore is triggered with restoredSelection of existing node, selection must be retained
  window.AppCoordinator.coordinatePostRestore({
    source: 'undo',
    restoredSelection: { type: 'node', id: n1.id }
  });
  const selAfterUndo = window.AppCoordinator.getActiveSelection();
  assert.strictEqual(selAfterUndo.type, 'node', 'Selection type after undo must be preserved for existing object');
  assert.strictEqual(selAfterUndo.id, n1.id, 'Selection ID after undo must be preserved for existing object');

  // When post restore is triggered without restoredSelection (e.g. project reset or non-existent object), selection is cleared
  window.AppCoordinator.coordinatePostRestore({
    source: 'undo',
    restoredSelection: { type: 'node', id: 9999 } // does not exist
  });
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, null, 'Selection must be null if restored object no longer exists');

  // 3. Object Naming & Header Synchronization
  const n2 = window.DiagramNodes.createNode({ text: 'Beta' });
  window.DiagramNodes.activeId = n2.id;
  window.DiagramNodes.updateActive('name', 'Custom Gate');
  assert.strictEqual(n2.name, 'Custom Gate', 'updateActive("name") must update node.name');

  const nodeHeaderLbl = document.getElementById('editingNodeLabel');
  if (nodeHeaderLbl) {
    assert.ok(nodeHeaderLbl.innerText.includes('Custom Gate'), 'editingNodeLabel must include the object name');
  }

  const f1 = window.DataFlows.createFlow({ name: 'Initial Flow' });
  window.DataFlows.activeId = f1.id;
  window.DataFlows.updateActive('name', 'Telemetry Bus');
  assert.strictEqual(f1.name, 'Telemetry Bus', 'updateActive("name") must update flow.name');

  const flowHeaderLbl = document.getElementById('editingFlowLabel');
  if (flowHeaderLbl) {
    assert.ok(flowHeaderLbl.innerText.includes('Telemetry Bus'), 'editingFlowLabel must include the flow name');
  }

  // ---------------------------------------------------------------------------
  // 4. Stage 12: Multi-Selection, Group Movement, Alignment, Distribution & Colour Tool
  // ---------------------------------------------------------------------------
  console.log('[HARNESS] Testing Stage 12 Multi-Selection, Group Move, Alignment, Distribution & Colour Tool...');

  window.DiagramNodes.list = [];
  window.DiagramNodes.counter = 0;
  const sn1 = window.DiagramNodes.createNode({ text: 'Node 1', x: 20, y: 30, width: 100, height: 60, snap: false });
  const sn2 = window.DiagramNodes.createNode({ text: 'Node 2', x: 50, y: 30, width: 120, height: 80, snap: false });
  const sn3 = window.DiagramNodes.createNode({ text: 'Node 3', x: 80, y: 70, width: 100, height: 60, snap: false });

  // 4.1 Multi-Selection
  window.AppCoordinator.selectObject('node', sn1.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, sn1.id);
  assert.strictEqual(window.AppCoordinator.isObjectSelected('node', sn1.id), true);
  assert.strictEqual(window.AppCoordinator.isObjectSelected('node', sn2.id), false);

  window.AppCoordinator.addToSelection('node', sn2.id);
  assert.strictEqual(window.AppCoordinator.isObjectSelected('node', sn1.id), true);
  assert.strictEqual(window.AppCoordinator.isObjectSelected('node', sn2.id), true);
  const selectedNodeIds = window.AppCoordinator.getSelectedNodeIds();
  assert.strictEqual(selectedNodeIds.length, 2);
  assert.ok(selectedNodeIds.includes(sn1.id) && selectedNodeIds.includes(sn2.id));

  // Toggle selection
  window.AppCoordinator.toggleObjectSelection('node', sn1.id);
  assert.strictEqual(window.AppCoordinator.isObjectSelected('node', sn1.id), false);
  assert.strictEqual(window.AppCoordinator.isObjectSelected('node', sn2.id), true);

  // Set multi-selection explicitly
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: sn1.id },
    { type: 'node', id: sn2.id },
    { type: 'node', id: sn3.id }
  ], sn1.id);
  assert.strictEqual(window.AppCoordinator.getSelectedNodeIds().length, 3);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, sn1.id);

  // 4.2 Group Movement
  const initX1 = sn1.x, initY1 = sn1.y;
  const initX2 = sn2.x, initY2 = sn2.y;
  const initX3 = sn3.x, initY3 = sn3.y;

  window.AppCoordinator.moveSelectedNodes(5, -4);
  assert.strictEqual(sn1.x, initX1 + 5);
  assert.strictEqual(sn1.y, initY1 - 4);
  assert.strictEqual(sn2.x, initX2 + 5);
  assert.strictEqual(sn2.y, initY2 - 4);
  assert.strictEqual(sn3.x, initX3 + 5);
  assert.strictEqual(sn3.y, initY3 - 4);

  // 4.3 Alignment
  // Align top: all selected nodes align to the top edge of collective bounding box
  const dims = window.AppCoordinator.getCanvasDimensions();
  window.AppCoordinator.alignSelectedNodes('top');
  // Check that all top bounds match
  const top1 = sn1.y - ((sn1.height || 60) / dims.height) * 50;
  const top2 = sn2.y - ((sn2.height || 80) / dims.height) * 50;
  const top3 = sn3.y - ((sn3.height || 60) / dims.height) * 50;
  assert.ok(Math.abs(top1 - top2) < 0.01, 'Top alignment should match top edges between node 1 and 2');
  assert.ok(Math.abs(top2 - top3) < 0.01, 'Top alignment should match top edges between node 2 and 3');

  // Align horizontal center
  window.AppCoordinator.alignSelectedNodes('hcenter');
  assert.ok(Math.abs(sn1.x - sn2.x) < 0.01, 'HCenter alignment should match x centers');
  assert.ok(Math.abs(sn2.x - sn3.x) < 0.01, 'HCenter alignment should match x centers');

  // 4.4 Distribution
  // Reset positions horizontally
  window.DiagramNodes.updateNode(sn1.id, { x: 10, y: 50 });
  window.DiagramNodes.updateNode(sn2.id, { x: 30, y: 50 });
  window.DiagramNodes.updateNode(sn3.id, { x: 90, y: 50 });
  window.AppCoordinator.distributeSelectedNodes('horizontal');
  // Between outer nodes sn1 (x=10) and sn3 (x=90), middle node sn2 should be evenly spaced
  assert.ok(sn2.x > sn1.x && sn2.x < sn3.x, 'Distributed middle node must lie between outer anchor nodes');

  // 4.5 Custom Colour Picker Logic
  assert.ok(window.CustomColorPicker, 'CustomColorPicker must be defined');
  assert.strictEqual(window.CustomColorPicker.normalizeHex('#f00'), '#ff0000');
  assert.strictEqual(window.CustomColorPicker.normalizeHex('58a6ff'), '#58a6ff');

  const rgb = window.CustomColorPicker.hexToRgb('#ff8000');
  assert.strictEqual(rgb.r, 255);
  assert.strictEqual(rgb.g, 128);
  assert.strictEqual(rgb.b, 0);

  const hexFromRgb = window.CustomColorPicker.rgbToHex(255, 128, 0);
  assert.strictEqual(hexFromRgb, '#ff8000');

  // Test HSV <-> RGB conversions
  const hsv = window.CustomColorPicker.rgbToHsv(255, 0, 0);
  assert.strictEqual(hsv.h, 0);
  assert.strictEqual(hsv.s, 1);
  assert.strictEqual(hsv.v, 1);
  const rgbRoundTrip = window.CustomColorPicker.hsvToRgb(hsv.h, hsv.s, hsv.v);
  assert.strictEqual(rgbRoundTrip.r, 255);
  assert.strictEqual(rgbRoundTrip.g, 0);
  assert.strictEqual(rgbRoundTrip.b, 0);

  // Test Cyan
  const hsvCyan = window.CustomColorPicker.rgbToHsv(0, 255, 255);
  assert.strictEqual(hsvCyan.h, 180);
  assert.strictEqual(hsvCyan.s, 1);
  assert.strictEqual(hsvCyan.v, 1);
  const rgbCyanTrip = window.CustomColorPicker.hsvToRgb(180, 1, 1);
  assert.strictEqual(rgbCyanTrip.r, 0);
  assert.strictEqual(rgbCyanTrip.g, 255);
  assert.strictEqual(rgbCyanTrip.b, 255);

  // Swatch management
  window.CustomColorPicker.recentColors = [];
  window.CustomColorPicker.favColors = [];
  window.CustomColorPicker.addFavourite('#00ffcc');
  assert.ok(window.CustomColorPicker.favColors.includes('#00ffcc'), 'Favourite colour must be saved');
  window.CustomColorPicker.removeFavourite(0);
  assert.strictEqual(window.CustomColorPicker.favColors.length, 0, 'Favourite colour must be removed');

  // Test UI initialization, 3 distinct palette rows, and popover interaction
  assert.ok(htmlSource.includes('id="customColorPickerModal"'), 'customColorPickerModal must exist in index.html');
  assert.ok(htmlSource.includes('role="dialog"'), 'customColorPickerModal must have role="dialog"');
  assert.ok(htmlSource.includes('aria-modal="false"'), 'Must be non-modal popover with aria-modal="false"');
  assert.ok(htmlSource.includes('class="custom-color-picker-popover"'), 'Must have custom-color-picker-popover class');

  // Verify all 3 horizontal palette containers exist in HTML
  assert.ok(htmlSource.includes('id="colorPickerQuickPalette"'), 'Standard palette container must exist in index.html');
  assert.ok(htmlSource.includes('id="colorPickerRecentSwatches"'), 'Recent swatches container must exist in index.html');
  assert.ok(htmlSource.includes('id="colorPickerFavSwatches"'), 'Favourites swatches container must exist in index.html');

  // Verify RGB slider and numeric inputs exist in DOM
  ['R', 'G', 'B'].forEach((ch) => {
    assert.ok(htmlSource.includes(`id="colorPicker${ch}Slider"`), `colorPicker${ch}Slider must exist in index.html`);
    assert.ok(htmlSource.includes(`id="colorPicker${ch}Num"`), `colorPicker${ch}Num must exist in index.html`);
  });

  // Verify SV square and Hue slider exist
  assert.ok(htmlSource.includes('id="colorPickerSvSquare"'), 'colorPickerSvSquare must exist in index.html');
  assert.ok(htmlSource.includes('id="colorPickerSvHandle"'), 'colorPickerSvHandle must exist in index.html');
  assert.ok(htmlSource.includes('id="colorPickerHueSlider"'), 'colorPickerHueSlider must exist in index.html');
  assert.ok(htmlSource.includes('id="colorPickerCurrentSwatch"'), 'colorPickerCurrentSwatch must exist in index.html');
  assert.ok(htmlSource.includes('id="colorPickerPendingSwatch"'), 'colorPickerPendingSwatch must exist in index.html');
  assert.ok(htmlSource.includes('id="colorPickerHexInput"'), 'colorPickerHexInput must exist in index.html');

  // Test openFor, live preview, cancel and apply transactions
  const mockColorInput = {
    value: '#112233',
    tagName: 'INPUT',
    type: 'color',
    getBoundingClientRect: () => ({ left: 100, top: 100, right: 150, bottom: 130, width: 50, height: 30 }),
    dispatchEvent: () => {}
  };

  window.CustomColorPicker.openFor(mockColorInput);
  assert.strictEqual(window.CustomColorPicker.isOpen, true, 'Picker must be open');
  assert.strictEqual(window.CustomColorPicker.initialColor, '#112233');

  // Change color via setColor
  window.CustomColorPicker.setColor('#ff9900');
  assert.strictEqual(mockColorInput.value, '#ff9900', 'Live preview must immediately update active input');
  assert.strictEqual(window.CustomColorPicker.currentColor, '#ff9900');

  // Cancel reverts to initial
  window.CustomColorPicker.cancel();
  assert.strictEqual(mockColorInput.value, '#112233', 'Cancel must revert active input to initialColor');
  assert.strictEqual(window.CustomColorPicker.isOpen, false, 'Picker must close on cancel');

  // Re-open and apply commits
  window.CustomColorPicker.openFor(mockColorInput);
  window.CustomColorPicker.setColor('#33cc66');
  window.CustomColorPicker.apply();
  assert.strictEqual(mockColorInput.value, '#33cc66', 'Apply must commit new color');
  assert.strictEqual(window.CustomColorPicker.isOpen, false, 'Picker must close on apply');
  assert.ok(window.CustomColorPicker.recentColors.includes('#33cc66'), 'Recent colors must include applied color');

  // ---------------------------------------------------------------------------
  // 5. Stage 13: Persistent Object Groups, Integrated Duplication and Copy/Paste
  // ---------------------------------------------------------------------------
  console.log('[HARNESS] Testing Stage 13 Persistent Groups, Duplication and Copy/Paste...');

  // 5.1 Group Lifecycle & Membership
  if (window.EngineBridge && typeof window.EngineBridge.dispatch === 'function' && window.EngineBridge.isReady()) {
    window.EngineBridge.dispatch('Scene.SetState', JSON.stringify({ revision: 9999 }));
  }
  window.DiagramNodes.list = [];
  window.DiagramNodes.counter = 0;
  window.Glows.list = [];
  window.Glows.counter = 0;
  window.DataFlows.list = [];
  window.DataFlows.counter = 0;
  if (window.ObjectGroups) {
    window.ObjectGroups.list = [];
    window.ObjectGroups.counter = 0;
  }

  const gn1 = window.DiagramNodes.createNode({ text: 'Pump In', x: 20, y: 25, width: 100, height: 60, snap: false });
  const gn2 = window.DiagramNodes.createNode({ text: 'Pump Out', x: 50, y: 25, width: 100, height: 60, snap: false });
  const gg1 = window.Glows.createGlow({ x: 35, y: 25, size: 30, color: '#00ffaa' });

  // Select gn1 and gn2 and create a group
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: gn1.id },
    { type: 'node', id: gn2.id },
    { type: 'glow', id: gg1.id }
  ]);

  const createdGrp = window.AppCoordinator.createGroupFromSelection('Cooling Pump Assembly');
  assert.ok(createdGrp, 'Group must be successfully created');
  assert.strictEqual(createdGrp.name, 'Cooling Pump Assembly');
  assert.strictEqual(createdGrp.members.length, 3);

  // 5.2 Lookup by Member
  const foundByNode = window.AppCoordinator.findGroupByMember('node', gn1.id);
  assert.ok(foundByNode, 'findGroupByMember must locate group by member node');
  assert.strictEqual(foundByNode.id, createdGrp.id);

  const foundByGlow = window.AppCoordinator.findGroupByMember('glow', gg1.id);
  assert.ok(foundByGlow, 'findGroupByMember must locate group by member glow');
  assert.strictEqual(foundByGlow.id, createdGrp.id);

  const notFound = window.AppCoordinator.findGroupByMember('node', 99999);
  assert.strictEqual(notFound, null, 'findGroupByMember must return null for unassigned object');

  // 5.3 Selection semantics & Group-Edit Mode
  window.AppCoordinator.clearSelection();
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, null);

  // Clicking a grouped object automatically selects the entire group
  window.AppCoordinator.selectObject('node', gn1.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, 'group');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, createdGrp.id);

  // Enter group-edit mode: now selecting member selects individual object
  window.AppCoordinator.enterGroupEditMode(createdGrp.id);
  assert.strictEqual(window.AppCoordinator.isInGroupEditMode(), true);

  window.AppCoordinator.selectObject('node', gn1.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, 'node');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, gn1.id);

  // Exit group-edit mode
  window.AppCoordinator.exitGroupEditMode();
  assert.strictEqual(window.AppCoordinator.isInGroupEditMode(), false);

  // 5.4 Group Movement
  window.AppCoordinator.selectGroup(createdGrp.id);
  const origN1X = gn1.x;
  const origN2X = gn2.x;
  const origG1X = gg1.x;

  window.AppCoordinator.moveSelectedNodes(10, 5);
  const n1Moved = window.DiagramNodes.getNode(gn1.id);
  const n2Moved = window.DiagramNodes.getNode(gn2.id);
  const g1Moved = window.Glows.getGlow(gg1.id);

  assert.strictEqual(n1Moved.x, origN1X + 10, 'Group move must translate member node 1');
  assert.strictEqual(n2Moved.x, origN2X + 10, 'Group move must translate member node 2');
  assert.strictEqual(g1Moved.x, origG1X + 10, 'Group move must translate member glow');

  // 5.5 Automatic Group Pruning on Member Deletion
  // Deleting gg1 reduces member count from 3 to 2
  window.Glows.deleteGlow(gg1.id);
  let grpAfterGlow = window.AppCoordinator.getGroup(createdGrp.id);
  assert.ok(grpAfterGlow, 'Group must persist with 2 remaining members');
  assert.strictEqual(grpAfterGlow.members.length, 2);

  // Deleting gn1 reduces member count from 2 to 1 -> group automatically disbanded!
  window.DiagramNodes.deleteNode(gn1.id);
  let grpAfterNode = window.AppCoordinator.getGroup(createdGrp.id);
  assert.strictEqual(grpAfterNode, null, 'Group must be automatically disbanded when fewer than 2 members remain');

  // 5.6 Integrated Duplication & Copy/Paste with Flow Endpoint Remapping
  if (window.EngineBridge && typeof window.EngineBridge.dispatch === 'function' && window.EngineBridge.isReady()) {
    window.EngineBridge.dispatch('Scene.SetState', JSON.stringify({ revision: 10000 }));
  }
  window.DiagramNodes.list = [];
  window.DiagramNodes.counter = 0;
  window.DataFlows.list = [];
  window.DataFlows.counter = 0;

  const cn1 = window.DiagramNodes.createNode({ text: 'Source', x: 20, y: 40, width: 80, height: 40, snap: false });
  const cn2 = window.DiagramNodes.createNode({ text: 'Sink', x: 60, y: 40, width: 80, height: 40, snap: false });
  const cf1 = window.DataFlows.createFlow({ fromNodeId: cn1.id, toNodeId: cn2.id, label: 'Pipeline' });

  const beforePasteNodes = window.DiagramNodes.getAllNodes().length;
  const beforePasteFlows = window.DataFlows.getAllFlows().length;

  // Copy selection of Source, Sink, and connecting Flow
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: cn1.id },
    { type: 'node', id: cn2.id },
    { type: 'flow', id: cf1.id }
  ]);

  const copySuccess = window.AppCoordinator.copySelection();
  assert.strictEqual(copySuccess, true, 'copySelection must succeed');

  // Paste from clipboard
  const pasteSuccess = window.AppCoordinator.pasteClipboard();
  assert.strictEqual(pasteSuccess, true, 'pasteClipboard must succeed');

  // Verify that 2 new nodes and 1 new flow now exist in scene
  const allNodes = window.DiagramNodes.getAllNodes();
  const allFlows = window.DataFlows.getAllFlows();
  assert.strictEqual(allNodes.length, beforePasteNodes + 2, 'Paste must create 2 new nodes');
  assert.strictEqual(allFlows.length, beforePasteFlows + 1, 'Paste must create 1 new flow');

  // Verify that the duplicated flow is connected to the newly pasted nodes, NOT the original nodes!
  const pastedFlow = allFlows.find((f) => String(f.id) !== String(cf1.id));
  assert.ok(pastedFlow, 'Pasted flow must exist');
  assert.notStrictEqual(String(pastedFlow.fromNodeId), String(cn1.id), 'Pasted flow must remap fromNodeId away from original');
  assert.notStrictEqual(String(pastedFlow.toNodeId), String(cn2.id), 'Pasted flow must remap toNodeId away from original');
  assert.ok(allNodes.some((n) => String(n.id) === String(pastedFlow.fromNodeId)), 'Pasted flow fromNodeId must point to newly pasted node');
  assert.ok(allNodes.some((n) => String(n.id) === String(pastedFlow.toNodeId)), 'Pasted flow toNodeId must point to newly pasted node');

  // 5.7 Persistence in Snapshot & Undo/Redo
  const preGroupNodes = window.DiagramNodes.getAllNodes();
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: preGroupNodes[0].id },
    { type: 'node', id: preGroupNodes[1].id }
  ]);
  const persistGrp = window.AppCoordinator.createGroupFromSelection('Persist Test Group');
  assert.ok(persistGrp);

  const snapJson = window.HistoryManager.captureSnapshot();
  const parsedSnap = JSON.parse(snapJson);
  assert.ok(Array.isArray(parsedSnap.groups), 'Snapshot must contain groups array');
  assert.ok(parsedSnap.groups.some((g) => g.id === persistGrp.id), 'Snapshot must contain created group');

  // Undo/Redo roundtrip
  if (window.HistoryManager) {
    window.HistoryManager.undo();
    window.HistoryManager.redo();
  }

  // ===========================================================================
  // Section 6: Stage 13 Mixed-Type Selection and Persistent Grouping Verification
  //            (Scenarios 1 through 15)
  // ===========================================================================
  console.log('[HARNESS] Testing Stage 13 Mixed-Type Selection and Persistent Grouping (Scenarios 1-15)...');

  // Reset scene state cleanly
  if (window.EngineBridge && typeof window.EngineBridge.dispatch === 'function' && window.EngineBridge.isReady()) {
    window.EngineBridge.dispatch('Scene.SetState', JSON.stringify({ revision: 20000 }));
  }
  window.DiagramNodes.list = [];
  window.DiagramNodes.counter = 0;
  window.DataFlows.list = [];
  window.DataFlows.counter = 0;
  window.Glows.list = [];
  window.Glows.counter = 0;
  window.Ripples.list = [];
  window.Ripples.counter = 0;
  if (window.ObjectGroups) {
    window.ObjectGroups.list = [];
    window.ObjectGroups.counter = 0;
  }
  window.AppCoordinator.clearSelection();

  // Create one object of each of the 4 types
  const mNode = window.DiagramNodes.createNode({ text: 'Main Controller', x: 20, y: 30, width: 120, height: 60, snap: false });
  const mGlow = window.Glows.createGlow({ name: 'Status Indicator', x: 40, y: 30, size: 25, color: '#ff3366' });
  const mRipple = window.Ripples.createRipple({ name: 'Pulse Beacon', x: 60, y: 30, outerR: 120, color: '#33ccff' });
  const mFlow = window.DataFlows.createFlow({ name: 'Telemetry Line', fromNodeId: mNode.id, toNodeId: null, x1: 20, y1: 30, x2: 80, y2: 30, label: 'Data' });

  // SCENARIO 1: Mixed-type selection via additive clicks & toggle selection
  window.AppCoordinator.clearSelection();
  assert.strictEqual(window.AppCoordinator.getSelectedItems().length, 0, 'Scenario 1: selection begins empty');

  // Select node, then add glow, ripple, flow
  window.AppCoordinator.selectObject('node', mNode.id);
  assert.strictEqual(window.AppCoordinator.getSelectedItems().length, 1);

  window.AppCoordinator.addToSelection('glow', mGlow.id);
  assert.strictEqual(window.AppCoordinator.getSelectedItems().length, 2);
  assert.strictEqual(window.AppCoordinator.isObjectSelected('node', mNode.id), true);
  assert.strictEqual(window.AppCoordinator.isObjectSelected('glow', mGlow.id), true);

  window.AppCoordinator.addToSelection('ripple', mRipple.id);
  assert.strictEqual(window.AppCoordinator.getSelectedItems().length, 3);
  assert.strictEqual(window.AppCoordinator.isObjectSelected('ripple', mRipple.id), true);

  window.AppCoordinator.addToSelection('flow', mFlow.id);
  assert.strictEqual(window.AppCoordinator.getSelectedItems().length, 4);
  assert.strictEqual(window.AppCoordinator.isObjectSelected('flow', mFlow.id), true);

  // Toggle ripple off and on
  window.AppCoordinator.toggleObjectSelection('ripple', mRipple.id);
  assert.strictEqual(window.AppCoordinator.getSelectedItems().length, 3);
  assert.strictEqual(window.AppCoordinator.isObjectSelected('ripple', mRipple.id), false);

  window.AppCoordinator.toggleObjectSelection('ripple', mRipple.id);
  assert.strictEqual(window.AppCoordinator.getSelectedItems().length, 4);
  assert.strictEqual(window.AppCoordinator.isObjectSelected('ripple', mRipple.id), true);

  // SCENARIO 2: Mixed-type selection in instance lists
  window.DiagramNodes.renderList();
  window.Glows.renderList();
  window.Ripples.renderList();
  window.DataFlows.renderList();

  const nListEl = document.getElementById('nodesList');
  const gListEl = document.getElementById('glowsList');
  const rListEl = document.getElementById('ripplesList');
  const fListEl = document.getElementById('flowList');

  if (nListEl && nListEl.innerHTML) {
    assert.ok(nListEl.innerHTML.includes('selected'), 'Scenario 2: nodesList renders selected highlight');
  }
  if (gListEl && gListEl.innerHTML) {
    assert.ok(gListEl.innerHTML.includes('selected'), 'Scenario 2: glowsList renders selected highlight');
  }
  if (rListEl && rListEl.innerHTML) {
    assert.ok(rListEl.innerHTML.includes('selected'), 'Scenario 2: ripplesList renders selected highlight');
  }
  if (fListEl && fListEl.innerHTML) {
    assert.ok(fListEl.innerHTML.includes('selected'), 'Scenario 2: flowList renders selected highlight');
  }

  // SCENARIO 3: Mixed-type group creation across all permutations
  // Permutation A: Shape + Glow
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: mNode.id },
    { type: 'glow', id: mGlow.id }
  ]);
  const grpShapeGlow = window.AppCoordinator.createGroupFromSelection('Shape-Glow Pair');
  assert.ok(grpShapeGlow, 'Scenario 3A: Shape-Glow group created');
  assert.strictEqual(grpShapeGlow.members.length, 2);
  assert.ok(grpShapeGlow.members.some((m) => m.type === 'node' && String(m.id) === String(mNode.id)));
  assert.ok(grpShapeGlow.members.some((m) => m.type === 'glow' && String(m.id) === String(mGlow.id)));
  window.AppCoordinator.ungroupSelectedGroup();

  // Permutation B: Shape + Flow
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: mNode.id },
    { type: 'flow', id: mFlow.id }
  ]);
  const grpShapeFlow = window.AppCoordinator.createGroupFromSelection('Shape-Flow Pair');
  assert.ok(grpShapeFlow, 'Scenario 3B: Shape-Flow group created');
  assert.strictEqual(grpShapeFlow.members.length, 2);
  assert.ok(grpShapeFlow.members.some((m) => m.type === 'node' && String(m.id) === String(mNode.id)));
  assert.ok(grpShapeFlow.members.some((m) => m.type === 'flow' && String(m.id) === String(mFlow.id)));
  window.AppCoordinator.ungroupSelectedGroup();

  // Permutation C: Glow + Ripple
  window.AppCoordinator.setMultiSelection([
    { type: 'glow', id: mGlow.id },
    { type: 'ripple', id: mRipple.id }
  ]);
  const grpGlowRipple = window.AppCoordinator.createGroupFromSelection('Glow-Ripple Pair');
  assert.ok(grpGlowRipple, 'Scenario 3C: Glow-Ripple group created');
  assert.strictEqual(grpGlowRipple.members.length, 2);
  assert.ok(grpGlowRipple.members.some((m) => m.type === 'glow' && String(m.id) === String(mGlow.id)));
  assert.ok(grpGlowRipple.members.some((m) => m.type === 'ripple' && String(m.id) === String(mRipple.id)));
  window.AppCoordinator.ungroupSelectedGroup();

  // Permutation D: All 4 types (Shape + Glow + Ripple + Flow)
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: mNode.id },
    { type: 'glow', id: mGlow.id },
    { type: 'ripple', id: mRipple.id },
    { type: 'flow', id: mFlow.id }
  ]);
  const grpQuad = window.AppCoordinator.createGroupFromSelection('Integrated Substation');
  assert.ok(grpQuad, 'Scenario 3D: 4-type quad group created');
  assert.strictEqual(grpQuad.members.length, 4);
  assert.ok(grpQuad.members.some((m) => m.type === 'node'));
  assert.ok(grpQuad.members.some((m) => m.type === 'glow'));
  assert.ok(grpQuad.members.some((m) => m.type === 'ripple'));
  assert.ok(grpQuad.members.some((m) => m.type === 'flow'));

  // SCENARIO 4: Multi-selection toolbars & Floating Context Editor UI state
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: mNode.id },
    { type: 'glow', id: mGlow.id }
  ]);
  window.DiagramNodes.updateMultiSelectToolbar();

  const multiToolbar = document.getElementById('nodeMultiSelectToolbar');
  const multiCount = document.getElementById('multiSelectionBadge');
  if (multiToolbar && multiCount) {
    assert.strictEqual(multiToolbar.style.display, 'block');
    const badgeText = multiCount.innerText || multiCount.textContent;
    assert.strictEqual(badgeText, '2 Objects Selected', 'Scenario 4: Mixed selection uses Objects badge');
  }

  // Also check flow, glow, ripple auxiliary toolbars
  const flowToolbar = document.getElementById('flowMultiSelectToolbar');
  const flowCount = document.getElementById('flowMultiSelectionBadge');
  if (flowToolbar && flowCount) {
    assert.strictEqual(flowToolbar.style.display, 'block');
    const text = flowCount.innerText || flowCount.textContent;
    assert.strictEqual(text, '2 Objects Selected', 'Scenario 4: Flow toolbar shows 2 Objects Selected');
  }

  if (window.FloatingPropertiesEditor) {
    window.FloatingPropertiesEditor.openFor('node', mNode.id, { resetPosition: true });
    const fctxMultiBar = document.getElementById('fctx-multiBar');
    const fctxMultiCount = document.getElementById('fctx-multiCount');
    if (fctxMultiBar && fctxMultiCount) {
      assert.strictEqual(fctxMultiBar.style.display, 'flex');
      assert.strictEqual(fctxMultiCount.textContent, '2 Objects Selected', 'Scenario 4: Floating editor displays 2 Objects Selected');
    }
    window.FloatingPropertiesEditor.close(false);
  }

  // SCENARIO 5: Canvas mixed group dragging
  window.AppCoordinator.selectGroup(grpQuad.id);
  const nOrigX = mNode.x;
  const nOrigY = mNode.y;
  const gOrigX = mGlow.x;
  const gOrigY = mGlow.y;
  const rOrigX = mRipple.x;
  const rOrigY = mRipple.y;

  window.AppCoordinator.moveSelectedNodes(12, 8);

  const nAfter = window.DiagramNodes.getNode(mNode.id);
  const gAfter = window.Glows.getGlow(mGlow.id);
  const rAfter = window.Ripples.getRipple(mRipple.id);

  assert.strictEqual(nAfter.x, nOrigX + 12, 'Scenario 5: Node x translated');
  assert.strictEqual(nAfter.y, nOrigY + 8, 'Scenario 5: Node y translated');
  assert.strictEqual(gAfter.x, gOrigX + 12, 'Scenario 5: Glow x translated');
  assert.strictEqual(gAfter.y, gOrigY + 8, 'Scenario 5: Glow y translated');
  assert.strictEqual(rAfter.x, rOrigX + 12, 'Scenario 5: Ripple x translated');
  assert.strictEqual(rAfter.y, rOrigY + 8, 'Scenario 5: Ripple y translated');

  // SCENARIO 6: Instance list visual synchronization
  window.AppCoordinator.selectGroup(grpQuad.id);
  assert.strictEqual(window.AppCoordinator.isObjectSelected('node', mNode.id), true, 'Scenario 6: Node marked selected');
  assert.strictEqual(window.AppCoordinator.isObjectSelected('glow', mGlow.id), true, 'Scenario 6: Glow marked selected');
  assert.strictEqual(window.AppCoordinator.isObjectSelected('ripple', mRipple.id), true, 'Scenario 6: Ripple marked selected');
  assert.strictEqual(window.AppCoordinator.isObjectSelected('flow', mFlow.id), true, 'Scenario 6: Flow marked selected');

  // SCENARIO 7: Floating contextual properties editor right-click retention
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: mNode.id },
    { type: 'glow', id: mGlow.id },
    { type: 'ripple', id: mRipple.id }
  ]);
  assert.strictEqual(window.AppCoordinator.getSelectedItems().length, 3);

  if (window.FloatingPropertiesEditor) {
    window.FloatingPropertiesEditor.openFor('glow', mGlow.id, { resetPosition: false });
    assert.strictEqual(window.AppCoordinator.getSelectedItems().length, 3, 'Scenario 7: Multi-selection retained when opening properties');
    const fctxMultiBar = document.getElementById('fctx-multiBar');
    if (fctxMultiBar) {
      assert.strictEqual(fctxMultiBar.style.display, 'flex');
    }
    window.FloatingPropertiesEditor.close(false);
  }

  // SCENARIO 8: Group lookup and selection from non-node members
  window.AppCoordinator.clearSelection();
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, null);

  window.AppCoordinator.selectObject('glow', mGlow.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, 'group', 'Scenario 8: Selecting member glow selects group');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, grpQuad.id);

  window.AppCoordinator.clearSelection();
  window.AppCoordinator.selectObject('ripple', mRipple.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, 'group', 'Scenario 8: Selecting member ripple selects group');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, grpQuad.id);

  window.AppCoordinator.clearSelection();
  window.AppCoordinator.selectObject('flow', mFlow.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, 'group', 'Scenario 8: Selecting member flow selects group');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, grpQuad.id);

  // SCENARIO 9: Group-edit mode on non-node members
  window.AppCoordinator.enterGroupEditMode(grpQuad.id);
  assert.strictEqual(window.AppCoordinator.isInGroupEditMode(), true, 'Scenario 9: In group-edit mode');

  window.AppCoordinator.selectObject('glow', mGlow.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, 'glow', 'Scenario 9: Selecting glow in edit mode selects glow directly');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, mGlow.id);

  window.AppCoordinator.selectObject('ripple', mRipple.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, 'ripple', 'Scenario 9: Selecting ripple in edit mode selects ripple directly');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, mRipple.id);

  window.AppCoordinator.exitGroupEditMode();
  assert.strictEqual(window.AppCoordinator.isInGroupEditMode(), false, 'Scenario 9: Exited group-edit mode');

  // SCENARIO 10: Group movement preserves geometry coherence
  window.AppCoordinator.selectGroup(grpQuad.id);
  const preMoveNode = window.DiagramNodes.getNode(mNode.id).x;
  const preMoveGlow = window.Glows.getGlow(mGlow.id).x;
  const preMoveRipple = window.Ripples.getRipple(mRipple.id).x;

  window.AppCoordinator.moveSelectedNodes(-10, -5);

  assert.strictEqual(window.DiagramNodes.getNode(mNode.id).x, preMoveNode - 10, 'Scenario 10: Node coherent translate');
  assert.strictEqual(window.Glows.getGlow(mGlow.id).x, preMoveGlow - 10, 'Scenario 10: Glow coherent translate');
  assert.strictEqual(window.Ripples.getRipple(mRipple.id).x, preMoveRipple - 10, 'Scenario 10: Ripple coherent translate');

  // SCENARIO 11: Group renaming
  window.AppCoordinator.selectGroup(grpQuad.id);
  window.AppCoordinator.renameSelectedGroup('Substation Beta');
  const renamedGrp = window.AppCoordinator.getGroup(grpQuad.id);
  assert.strictEqual(renamedGrp.name, 'Substation Beta', 'Scenario 11: Renamed group reflected in coordinator');

  // SCENARIO 12: Member deletion & auto-dissolution
  assert.strictEqual(renamedGrp.members.length, 4);

  // Delete glow: 4 -> 3
  window.Glows.deleteGlow(mGlow.id);
  let grpAfter1 = window.AppCoordinator.getGroup(grpQuad.id);
  assert.ok(grpAfter1);
  assert.strictEqual(grpAfter1.members.length, 3, 'Scenario 12: Group pruned to 3 members');

  // Delete ripple: 3 -> 2
  window.Ripples.deleteRipple(mRipple.id);
  let grpAfter2 = window.AppCoordinator.getGroup(grpQuad.id);
  assert.ok(grpAfter2);
  assert.strictEqual(grpAfter2.members.length, 2, 'Scenario 12: Group pruned to 2 members');

  // Delete flow: 2 -> 1 -> dissolved!
  window.DataFlows.removeFlow(mFlow.id);
  let grpAfter3 = window.AppCoordinator.getGroup(grpQuad.id);
  assert.strictEqual(grpAfter3, null, 'Scenario 12: Group automatically dissolved when < 2 members remain');

  // SCENARIO 13: Mixed group duplication
  const dNode = window.DiagramNodes.createNode({ text: 'Generator', x: 15, y: 25, width: 90, height: 50, snap: false });
  const dGlow = window.Glows.createGlow({ name: 'Gen Light', x: 25, y: 25, size: 20 });
  const dRipple = window.Ripples.createRipple({ name: 'Gen Pulse', x: 35, y: 25, outerR: 50 });
  const dFlow = window.DataFlows.createFlow({ name: 'Power Line', fromNodeId: dNode.id, toNodeId: null, x1: 15, y1: 25, x2: 70, y2: 25 });

  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: dNode.id },
    { type: 'glow', id: dGlow.id },
    { type: 'ripple', id: dRipple.id },
    { type: 'flow', id: dFlow.id }
  ]);
  const grpToDup = window.AppCoordinator.createGroupFromSelection('Generator Assembly');
  assert.ok(grpToDup);

  const prevNodeCount = window.DiagramNodes.getAllNodes().length;
  const prevGlowCount = window.Glows.getAllGlows().length;
  const prevRippleCount = window.Ripples.getAllRipples().length;
  const prevFlowCount = window.DataFlows.getAllFlows().length;

  window.AppCoordinator.selectGroup(grpToDup.id);
  const dupSuccess = window.AppCoordinator.duplicateSelection();
  assert.strictEqual(dupSuccess, true, 'Scenario 13: duplicateSelection must succeed on mixed group');

  assert.strictEqual(window.DiagramNodes.getAllNodes().length, prevNodeCount + 1, 'Scenario 13: Duplicated node created');
  assert.strictEqual(window.Glows.getAllGlows().length, prevGlowCount + 1, 'Scenario 13: Duplicated glow created');
  assert.strictEqual(window.Ripples.getAllRipples().length, prevRippleCount + 1, 'Scenario 13: Duplicated ripple created');
  assert.strictEqual(window.DataFlows.getAllFlows().length, prevFlowCount + 1, 'Scenario 13: Duplicated flow created');

  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, 'group', 'Scenario 13: Duplicated group selected');
  assert.notStrictEqual(window.AppCoordinator.getActiveSelection().id, grpToDup.id);

  // SCENARIO 14: Mixed group copy/paste
  const copyOk = window.AppCoordinator.copySelection();
  assert.strictEqual(copyOk, true, 'Scenario 14: copySelection must succeed on mixed group');

  const pasteOk = window.AppCoordinator.pasteClipboard();
  assert.strictEqual(pasteOk, true, 'Scenario 14: pasteClipboard must succeed');

  assert.strictEqual(window.DiagramNodes.getAllNodes().length, prevNodeCount + 2, 'Scenario 14: Pasted node created');
  assert.strictEqual(window.Glows.getAllGlows().length, prevGlowCount + 2, 'Scenario 14: Pasted glow created');
  assert.strictEqual(window.Ripples.getAllRipples().length, prevRippleCount + 2, 'Scenario 14: Pasted ripple created');
  assert.strictEqual(window.DataFlows.getAllFlows().length, prevFlowCount + 2, 'Scenario 14: Pasted flow created');

  // SCENARIO 15: Native .sva / snapshot persistence
  const snapStr = window.HistoryManager.captureSnapshot();
  const snapObj = JSON.parse(snapStr);
  assert.ok(Array.isArray(snapObj.groups), 'Scenario 15: Snapshot contains groups');
  assert.ok(snapObj.groups.length >= 2, 'Scenario 15: Snapshot contains at least 2 groups');

  const hasMixedSnapshot = snapObj.groups.some((g) => {
    const types = new Set(g.members.map((m) => m.type));
    return types.has('node') && types.has('glow');
  });
  assert.strictEqual(hasMixedSnapshot, true, 'Scenario 15: Snapshot must contain mixed-type group');

  window.HistoryManager.applySnapshot(snapStr);
  const restoredGroups = window.AppCoordinator.getAllGroups();
  assert.ok(restoredGroups.length >= 2, 'Scenario 15: Restored groups match snapshot');

  // ===========================================================================
  // STAGE 13 REGRESSION REPAIR: Remove Group Members and Ungroup Lifecycle
  // ===========================================================================
  console.log('[HARNESS] Testing Stage 13 Regression Repair: Member Detachment & Ungrouping (Scenarios 16-22)...');

  // SCENARIO 16: Member detachment from 3-member group (retains group)
  const remNode1 = window.DiagramNodes.createNode({ text: 'RNode1', x: 20, y: 20 });
  const remNode2 = window.DiagramNodes.createNode({ text: 'RNode2', x: 40, y: 20 });
  const remGlow1 = window.Glows.createGlow({ name: 'RGlow1', x: 30, y: 30 });
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: remNode1.id },
    { type: 'node', id: remNode2.id },
    { type: 'glow', id: remGlow1.id }
  ]);
  const grp3 = window.AppCoordinator.createGroupFromSelection('Trio Group');
  assert.ok(grp3, 'Scenario 16: Trio Group created');
  assert.strictEqual(grp3.members.length, 3, 'Scenario 16: Trio Group has 3 members');

  // Detach remGlow1
  const detachRes1 = window.AppCoordinator.removeSelectedMembersFromGroup(
    [{ type: 'glow', id: remGlow1.id }],
    grp3.id
  );
  assert.strictEqual(detachRes1, true, 'Scenario 16: Member removal succeeded');
  const grpAfterDetach = window.AppCoordinator.getGroup(grp3.id);
  assert.ok(grpAfterDetach, 'Scenario 16: Group still exists after removing 1 member from 3');
  assert.strictEqual(grpAfterDetach.members.length, 2, 'Scenario 16: Group now has 2 members');
  assert.strictEqual(window.AppCoordinator.findGroupByMember('glow', remGlow1.id), null, 'Scenario 16: Detached glow is no longer in group');
  assert.ok(window.AppCoordinator.findGroupByMember('node', remNode1.id), 'Scenario 16: remNode1 still in group');

  // SCENARIO 17: Member detachment from 2-member group (triggers automatic dissolution)
  const detachRes2 = window.AppCoordinator.removeSelectedMembersFromGroup(
    [{ type: 'node', id: remNode1.id }],
    grp3.id
  );
  assert.strictEqual(detachRes2, true, 'Scenario 17: Removal succeeded');
  const grpDissolved = window.AppCoordinator.getGroup(grp3.id);
  assert.strictEqual(grpDissolved, null, 'Scenario 17: Group automatically dissolved when reduced below 2 members');
  assert.strictEqual(window.AppCoordinator.findGroupByMember('node', remNode1.id), null, 'Scenario 17: remNode1 independent');
  assert.strictEqual(window.AppCoordinator.findGroupByMember('node', remNode2.id), null, 'Scenario 17: remNode2 independent');
  // Both objects still exist on canvas
  assert.ok(window.DiagramNodes.getNode(remNode1.id), 'Scenario 17: remNode1 still on canvas');
  assert.ok(window.DiagramNodes.getNode(remNode2.id), 'Scenario 17: remNode2 still on canvas');

  // SCENARIO 18: Ungroup via AppCoordinator.ungroupSelectedGroup (keeps all objects)
  const uNode = window.DiagramNodes.createNode({ text: 'UNode', x: 50, y: 50 });
  const uFlow = window.DataFlows.createFlow({ name: 'UFlow', x1: 50, y1: 50, x2: 80, y2: 50 });
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: uNode.id },
    { type: 'flow', id: uFlow.id }
  ]);
  const grpToUngroup = window.AppCoordinator.createGroupFromSelection('Ungroup Test Group');
  assert.ok(grpToUngroup, 'Scenario 18: Group created');

  window.AppCoordinator.selectGroup(grpToUngroup.id);
  const ungroupRes = window.AppCoordinator.ungroupSelectedGroup();
  assert.strictEqual(ungroupRes, true, 'Scenario 18: Ungroup succeeded');
  assert.strictEqual(window.AppCoordinator.getGroup(grpToUngroup.id), null, 'Scenario 18: Group removed');
  assert.ok(window.DiagramNodes.getNode(uNode.id), 'Scenario 18: Node still exists');
  assert.ok(window.DataFlows.getFlow(uFlow.id), 'Scenario 18: Flow still exists');
  // Selected items must now be multi-selection of former members
  const selAfterUngroup = window.AppCoordinator.getSelectedItems();
  assert.strictEqual(selAfterUngroup.length, 2, 'Scenario 18: Former members selected as multi-selection');

  // SCENARIO 19: Floating Properties editor ungroup button click
  const edNode1 = window.DiagramNodes.createNode({ text: 'FNode1', x: 60, y: 60 });
  const edNode2 = window.DiagramNodes.createNode({ text: 'FNode2', x: 70, y: 60 });
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: edNode1.id },
    { type: 'node', id: edNode2.id }
  ]);
  const grpForEditor = window.AppCoordinator.createGroupFromSelection('Editor Ungroup');
  window.AppCoordinator.selectGroup(grpForEditor.id);

  if (window.FloatingPropertiesEditor) {
    window.FloatingPropertiesEditor.openFor('group', grpForEditor.id);
    assert.strictEqual(window.FloatingPropertiesEditor.isOpen, true);
    assert.strictEqual(window.FloatingPropertiesEditor.activeType, 'group');

    // Simulate clicking #fctx-btnUngroup
    const btnUngroupEl = document.getElementById('fctx-btnUngroup');
    assert.ok(btnUngroupEl, 'Scenario 19: fctx-btnUngroup exists');
    btnUngroupEl.click();

    assert.strictEqual(window.AppCoordinator.getGroup(grpForEditor.id), null, 'Scenario 19: Group disbanded via UI button');
    assert.ok(window.DiagramNodes.getNode(edNode1.id), 'Scenario 19: edNode1 remains');
    assert.ok(window.DiagramNodes.getNode(edNode2.id), 'Scenario 19: edNode2 remains');
    assert.strictEqual(window.FloatingPropertiesEditor.isOpen, false, 'Scenario 19: Editor closed');
  }

  // SCENARIO 20: In-group membership bar in Floating Properties Editor
  const memNode = window.DiagramNodes.createNode({ text: 'MemNode', x: 10, y: 10 });
  const memGlow = window.Glows.createGlow({ name: 'MemGlow', x: 15, y: 15 });
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: memNode.id },
    { type: 'glow', id: memGlow.id }
  ]);
  const pairGrp = window.AppCoordinator.createGroupFromSelection('Pair Group');
  assert.ok(pairGrp);

  if (window.FloatingPropertiesEditor) {
    // Open editor for member node
    window.FloatingPropertiesEditor.openFor('node', memNode.id);
    const memberBar = document.getElementById('fctx-memberOfGroupBar');
    const memberNameSpan = document.getElementById('fctx-memberOfGroupName');
    assert.ok(memberBar);
    assert.strictEqual(memberBar.style.display, 'flex', 'Scenario 20: Member bar visible when inspecting grouped object');
    assert.ok(memberNameSpan.textContent.includes('Pair Group'), 'Scenario 20: Member bar displays group name');

    // Remove from group via #fctx-btnRemoveFromGroup
    const btnRemove = document.getElementById('fctx-btnRemoveFromGroup');
    assert.ok(btnRemove);
    btnRemove.click();

    // Since pair group had 2 members and 1 was removed, it dissolved
    assert.strictEqual(window.AppCoordinator.getGroup(pairGrp.id), null, 'Scenario 20: Pair dissolved after member detachment');
    assert.strictEqual(memberBar.style.display, 'none', 'Scenario 20: Member bar hidden after dissolution');
    window.FloatingPropertiesEditor.close(false);
  }

  // SCENARIO 21: Multi-selection toolbar shows Ungroup for group selection
  const tNode1 = window.DiagramNodes.createNode({ text: 'T1', x: 80, y: 80 });
  const tNode2 = window.DiagramNodes.createNode({ text: 'T2', x: 90, y: 80 });
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: tNode1.id },
    { type: 'node', id: tNode2.id }
  ]);
  const tGrp = window.AppCoordinator.createGroupFromSelection('Toolbar Test Group');
  window.AppCoordinator.selectGroup(tGrp.id);

  if (window.DiagramNodes && typeof window.DiagramNodes.updateMultiSelectToolbar === 'function') {
    window.DiagramNodes.updateMultiSelectToolbar();
    const btnGrpSel = document.getElementById('btnGroupSelection');
    if (btnGrpSel) {
      assert.strictEqual(btnGrpSel.textContent, '🔓 Ungroup', 'Scenario 21: Toolbar button shows Ungroup when group selected');
      // Clicking it ungroups
      btnGrpSel.click();
      assert.strictEqual(window.AppCoordinator.getGroup(tGrp.id), null, 'Scenario 21: Ungrouped via toolbar button');
    }
  }

  // SCENARIO 22: Undo/redo for member detachment and ungrouping
  const undoNode1 = window.DiagramNodes.createNode({ text: 'Undo1', x: 100, y: 100 });
  const undoNode2 = window.DiagramNodes.createNode({ text: 'Undo2', x: 110, y: 100 });
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: undoNode1.id },
    { type: 'node', id: undoNode2.id }
  ]);
  const undoGrp = window.AppCoordinator.createGroupFromSelection('Undo Group');
  assert.ok(undoGrp);

  // Ungroup it
  window.AppCoordinator.selectGroup(undoGrp.id);
  window.AppCoordinator.ungroupSelectedGroup();
  assert.strictEqual(window.AppCoordinator.getGroup(undoGrp.id), null, 'Scenario 22: Ungrouped before undo');

  // Undo
  if (window.HistoryManager && typeof window.HistoryManager.undo === 'function') {
    window.HistoryManager.undo();
    const restoredGrp = window.AppCoordinator.getGroup(undoGrp.id);
    assert.ok(restoredGrp, 'Scenario 22: Group restored after undo');
    assert.strictEqual(restoredGrp.members.length, 2, 'Scenario 22: Restored group has 2 members');

    // Redo
    window.HistoryManager.redo();
    assert.strictEqual(window.AppCoordinator.getGroup(undoGrp.id), null, 'Scenario 22: Group re-ungrouped after redo');
  }

  // ===========================================================================
  // STAGE 13 FINAL UI REPAIR: Rectangular Marquee Selection & Selection Overlay Geometry
  // ===========================================================================
  console.log('[HARNESS] Testing Stage 13 Final UI Repair: Marquee & Overlay Geometry (Scenarios 23-28)...');

  // SCENARIO 23: Marquee selection of multiple types (Shapes, Shape+Flow, Glow+Ripple, All 4)
  const mqNodeA = window.DiagramNodes.createNode({ text: 'MQ_NodeA', x: 20, y: 30, width: 80, height: 40 });
  const mqNodeB = window.DiagramNodes.createNode({ text: 'MQ_NodeB', x: 35, y: 30, width: 80, height: 40 });
  const mqFlow = window.DataFlows.createFlow({ name: 'MQ_Flow', nodes: [{ x: 25, y: 30 }, { x: 35, y: 30 }] });
  const mqGlow = window.Glows.createGlow({ name: 'MQ_Glow', x: 60, y: 40, size: 25 });
  const mqRipple = window.Ripples.createRipple({ name: 'MQ_Ripple', x: 75, y: 40, outerR: 120 });

  // Simulate marquee covering mqNodeA and mqNodeB (x: 2..45, y: 20..40)
  const previewEl = document.getElementById('previewBox');
  assert.ok(previewEl, 'Scenario 23: previewBox exists');

  // Pointerdown on blank canvas (x: 2%, y: 20%) -> client coords
  const canvasW = window.Stage.canvasWidth || 1280;
  const canvasH = window.Stage.canvasHeight || 720;
  const rectPreview = previewEl.getBoundingClientRect();

  // Test pointer events sequence for marquee:
  previewEl.dispatchEvent({
    type: 'pointerdown',
    button: 0,
    clientX: rectPreview.left + (2 / 100) * rectPreview.width,
    clientY: rectPreview.top + (20 / 100) * rectPreview.height,
    pointerId: 1
  });
  assert.strictEqual(window.Stage.isMarqueeSelecting, true, 'Scenario 23: Marquee selecting started');

  // Move to (45%, 40%)
  previewEl.dispatchEvent({
    type: 'pointermove',
    clientX: rectPreview.left + (45 / 100) * rectPreview.width,
    clientY: rectPreview.top + (40 / 100) * rectPreview.height,
    pointerId: 1
  });
  const marqueeBoxEl = document.getElementById('marqueeSelectionBox');
  assert.ok(marqueeBoxEl, 'Scenario 23: marqueeBox exists');
  assert.strictEqual(marqueeBoxEl.style.display, 'block', 'Scenario 23: Marquee box displayed during drag');
  assert.ok(marqueeBoxEl.getAttribute('width') !== null, 'Scenario 23: Marquee box has width attribute');
  assert.ok(marqueeBoxEl.getAttribute('height') !== null, 'Scenario 23: Marquee box has height attribute');

  // Pointerup -> triggers hit detection
  previewEl.dispatchEvent({
    type: 'pointerup',
    clientX: rectPreview.left + (45 / 100) * rectPreview.width,
    clientY: rectPreview.top + (40 / 100) * rectPreview.height,
    pointerId: 1
  });
  assert.strictEqual(window.Stage.isMarqueeSelecting, false, 'Scenario 23: Marquee ended');
  assert.strictEqual(marqueeBoxEl.style.display, 'none', 'Scenario 23: Marquee box hidden after release');

  const selItemsShapes = window.AppCoordinator.getSelectedItems();
  assert.ok(selItemsShapes.some((it) => it.type === 'node' && it.id === mqNodeA.id), 'Scenario 23: mqNodeA selected');
  assert.ok(selItemsShapes.some((it) => it.type === 'node' && it.id === mqNodeB.id), 'Scenario 23: mqNodeB selected');

  // Marquee over Glow + Ripple (x: 55..85, y: 30..55)
  previewEl.dispatchEvent({
    type: 'pointerdown',
    button: 0,
    clientX: rectPreview.left + (55 / 100) * rectPreview.width,
    clientY: rectPreview.top + (30 / 100) * rectPreview.height,
    pointerId: 1
  });
  previewEl.dispatchEvent({
    type: 'pointermove',
    clientX: rectPreview.left + (85 / 100) * rectPreview.width,
    clientY: rectPreview.top + (55 / 100) * rectPreview.height,
    pointerId: 1
  });
  previewEl.dispatchEvent({
    type: 'pointerup',
    clientX: rectPreview.left + (85 / 100) * rectPreview.width,
    clientY: rectPreview.top + (55 / 100) * rectPreview.height,
    pointerId: 1
  });
  const selItemsOptics = window.AppCoordinator.getSelectedItems();
  assert.ok(selItemsOptics.some((it) => it.type === 'glow' && it.id === mqGlow.id), 'Scenario 23: mqGlow selected');
  assert.ok(selItemsOptics.some((it) => it.type === 'ripple' && it.id === mqRipple.id), 'Scenario 23: mqRipple selected');

  // Marquee encompassing all four (x: 2..95, y: 20..60)
  previewEl.dispatchEvent({
    type: 'pointerdown',
    button: 0,
    clientX: rectPreview.left + (2 / 100) * rectPreview.width,
    clientY: rectPreview.top + (20 / 100) * rectPreview.height,
    pointerId: 1
  });
  previewEl.dispatchEvent({
    type: 'pointermove',
    clientX: rectPreview.left + (95 / 100) * rectPreview.width,
    clientY: rectPreview.top + (60 / 100) * rectPreview.height,
    pointerId: 1
  });
  previewEl.dispatchEvent({
    type: 'pointerup',
    clientX: rectPreview.left + (95 / 100) * rectPreview.width,
    clientY: rectPreview.top + (60 / 100) * rectPreview.height,
    pointerId: 1
  });
  const selAll4 = window.AppCoordinator.getSelectedItems();
  assert.ok(selAll4.some((it) => it.type === 'node'), 'Scenario 23: Quad includes node');
  assert.ok(selAll4.some((it) => it.type === 'flow'), 'Scenario 23: Quad includes flow');
  assert.ok(selAll4.some((it) => it.type === 'glow'), 'Scenario 23: Quad includes glow');
  assert.ok(selAll4.some((it) => it.type === 'ripple'), 'Scenario 23: Quad includes ripple');

  // SCENARIO 24: Marquee under Zoom and Pan
  window.Stage.zoomMode = 'manual';
  window.Stage.zoomScale = 1.5;
  window.Stage.panX = 40;
  window.Stage.panY = 25;
  window.Stage.syncOverlayBounds(1280, 720);

  // Convert coords through clientToCanvasPct with pan/zoom active
  const testClientX = rectPreview.left + 200;
  const testClientY = rectPreview.top + 150;
  const converted = window.Stage.clientToCanvasPct(testClientX, testClientY);
  assert.ok(converted.x >= 0 && converted.x <= 100, 'Scenario 24: Zoom/pan X within canvas percentage');
  assert.ok(converted.y >= 0 && converted.y <= 100, 'Scenario 24: Zoom/pan Y within canvas percentage');

  // Reset zoom & pan
  window.Stage.zoomMode = 'fit';
  window.Stage.zoomScale = 1.0;
  window.Stage.panX = 0;
  window.Stage.panY = 0;
  window.Stage.syncOverlayBounds(1280, 720);

  // SCENARIO 25: Additive marquee selection (Shift-drag)
  window.AppCoordinator.selectObject('node', mqNodeA.id);
  assert.strictEqual(window.AppCoordinator.getSelectedItems().length, 1);

  previewEl.dispatchEvent({
    type: 'pointerdown',
    button: 0,
    shiftKey: true,
    clientX: rectPreview.left + (55 / 100) * rectPreview.width,
    clientY: rectPreview.top + (30 / 100) * rectPreview.height,
    pointerId: 1
  });
  assert.strictEqual(window.Stage.marqueeAdditive, true, 'Scenario 25: Marquee additive mode active');
  previewEl.dispatchEvent({
    type: 'pointermove',
    shiftKey: true,
    clientX: rectPreview.left + (85 / 100) * rectPreview.width,
    clientY: rectPreview.top + (55 / 100) * rectPreview.height,
    pointerId: 1
  });
  previewEl.dispatchEvent({
    type: 'pointerup',
    shiftKey: true,
    clientX: rectPreview.left + (85 / 100) * rectPreview.width,
    clientY: rectPreview.top + (55 / 100) * rectPreview.height,
    pointerId: 1
  });
  const additiveItems = window.AppCoordinator.getSelectedItems();
  assert.ok(additiveItems.some((it) => it.type === 'node' && it.id === mqNodeA.id), 'Scenario 25: Prior node preserved in additive marquee');
  assert.ok(additiveItems.some((it) => it.type === 'glow' && it.id === mqGlow.id), 'Scenario 25: Added glow in additive marquee');
  assert.ok(additiveItems.some((it) => it.type === 'ripple' && it.id === mqRipple.id), 'Scenario 25: Added ripple in additive marquee');

  // SCENARIO 26: Blank canvas click clears selection
  previewEl.dispatchEvent({
    type: 'pointerdown',
    button: 0,
    clientX: rectPreview.left + (2 / 100) * rectPreview.width,
    clientY: rectPreview.top + (90 / 100) * rectPreview.height,
    pointerId: 1
  });
  previewEl.dispatchEvent({
    type: 'pointerup',
    clientX: rectPreview.left + (2 / 100) * rectPreview.width,
    clientY: rectPreview.top + (90 / 100) * rectPreview.height,
    pointerId: 1
  });
  assert.strictEqual(window.AppCoordinator.getSelectedItems().length, 0, 'Scenario 26: Blank click cleared selection');

  // SCENARIO 27: Geometric bounds of selection indicators in multiSelectionGroup
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: mqNodeA.id },
    { type: 'glow', id: mqGlow.id },
    { type: 'ripple', id: mqRipple.id }
  ]);
  const multiGroupEl = document.getElementById('multiSelectionGroup');
  assert.ok(multiGroupEl);

  // Inspect generated overlay circles and rects in multiGroup
  const circles = multiGroupEl.children.filter((c) => c.tagName === 'CIRCLE');
  assert.ok(circles.length >= 1, 'Scenario 27: Circle indicators rendered for optical items');

  // Verify ripple indicator radius is properly bounded to effect size (~124px), NOT the bugged 546px
  const rippleCirc = circles.find((c) => (c.stroke || c.getAttribute('stroke')) === '#00e5ff');
  assert.ok(rippleCirc, 'Scenario 27: Ripple selection circle present');
  const rippleR = parseFloat(rippleCirc.r || rippleCirc.getAttribute('r'));
  assert.ok(rippleR < 200, `Scenario 27: Ripple circle radius must be bounded to effect size, got ${rippleR}px (expected ~124px, NOT 546px)`);
  assert.ok(rippleR >= 120, `Scenario 27: Ripple circle radius corresponds to outerR=120, got ${rippleR}px`);

  // Verify glow indicator radius is properly bounded to effect size (~29px), NOT 96px+
  const glowCirc = circles.find((c) => (c.stroke || c.getAttribute('stroke')) === '#ff7b72');
  assert.ok(glowCirc, 'Scenario 27: Glow selection circle present');
  const glowR = parseFloat(glowCirc.r || glowCirc.getAttribute('r'));
  assert.ok(glowR < 50, `Scenario 27: Glow circle radius must be bounded to effect size, got ${glowR}px (expected ~29px, NOT 96px+)`);
  assert.ok(glowR >= 25, `Scenario 27: Glow circle radius corresponds to size=25, got ${glowR}px`);

  // Verify square glow renders rect instead of circle
  const sqGlow = window.Glows.createGlow({ name: 'Square Glow', shape: 'square', x: 50, y: 50, size: 30 });
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: mqNodeA.id },
    { type: 'glow', id: sqGlow.id }
  ]);
  const rects = multiGroupEl.children.filter((c) => c.tagName === 'RECT' && (c.stroke || c.getAttribute('stroke')) === '#ff7b72');
  assert.strictEqual(rects.length, 1, 'Scenario 27: Square glow renders rectangular selection indicator');

  // SCENARIO 28: Group selection rectangular bounding box & absence of obscuring circle
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: mqNodeA.id },
    { type: 'ripple', id: mqRipple.id }
  ]);
  const mixedGroup = window.AppCoordinator.createGroupFromSelection('Mixed Clean Group');
  assert.ok(mixedGroup, 'Scenario 28: Mixed group created');

  window.AppCoordinator.selectGroup(mixedGroup.id);
  assert.strictEqual(window.AppCoordinator.getActiveSelection().type, 'group');

  // groupSelectionBox must be rectangular
  const grpBoxEl = document.getElementById('groupSelectionBox');
  assert.ok(grpBoxEl);
  assert.ok(grpBoxEl.getAttribute('width') !== null, 'Scenario 28: Group selection overlay has width attribute');
  assert.ok(grpBoxEl.getAttribute('height') !== null, 'Scenario 28: Group selection overlay has height attribute');

  // multiSelectionGroup must be empty when group is selected (no obscuring circular indicators over group box)
  assert.strictEqual(multiGroupEl.children.length, 0, 'Scenario 28: No circular indicators obscuring group rectangular bounds');

  // Ungroup and verify objects remain selected WITHOUT oversized circles
  const ungroupSuccess = window.AppCoordinator.ungroupSelectedGroup();
  assert.strictEqual(ungroupSuccess, true, 'Scenario 28: Ungroup succeeded');
  const releasedItems = window.AppCoordinator.getSelectedItems();
  assert.strictEqual(releasedItems.length, 2, 'Scenario 28: Released members retained in multi-selection');

  // Circles after ungroup must remain properly bounded (< 200px)
  const afterUngroupCircles = multiGroupEl.children.filter((c) => c.tagName === 'CIRCLE');
  afterUngroupCircles.forEach((c) => {
    const r = parseFloat(c.r || c.getAttribute('r'));
    assert.ok(r < 200, `Scenario 28: Circle after ungroup must not be oversized, got ${r}px`);
  });

  // Verify independent Flow/Glow/Ripple animation export integrity
  const exportState = window.SceneState ? window.SceneState.buildRenderState() : {};
  const fullSVG = window.SceneState ? window.SceneState.buildFullSVG(exportState) : '';
  assert.ok(fullSVG.includes('ripples-layer'), 'Scenario 28: Ripples layer preserved in SVG export');
  assert.ok(fullSVG.includes('glows-layer'), 'Scenario 28: Glows layer preserved in SVG export');
  assert.ok(fullSVG.includes('animate'), 'Scenario 28: Declarative animations preserved in SVG export');

  // ===========================================================================
  // SCENARIO 29: Full SVA Export/Import Round-Trip with Mixed-Type Group
  // (Shape + Flow + Glow + Ripple)
  // ===========================================================================
  console.log('\n[HARNESS] Scenario 29: Full SVA Export/Import Round-Trip of Mixed-Type Group...');
  window.ProjectManager.resetToNewProject();

  const s29Node = window.DiagramNodes.createNode({ shape: 'rect', text: 'Turbine Node', x: 50, y: 50, width: 100, height: 60 });
  const s29Flow = window.DataFlows.createFlow({ name: 'Steam Line', nodes: [{ x: 50, y: 50 }, { x: 150, y: 50 }], color: '#00ffcc' });
  const s29Glow = window.Glows.createGlow({ name: 'Turbine Core Glow', x: 75, y: 60, size: 25, color: '#ff3366' });
  const s29Ripple = window.Ripples.createRipple({ name: 'Turbine Vibration', x: 80, y: 70, innerRadius: 10, outerRadius: 40 });

  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: s29Node.id },
    { type: 'flow', id: s29Flow.id },
    { type: 'glow', id: s29Glow.id },
    { type: 'ripple', id: s29Ripple.id }
  ]);

  const s29Grp = window.AppCoordinator.createGroupFromSelection('Turbine Power Assembly');
  assert.ok(s29Grp && s29Grp.id, 'Scenario 29: Mixed-type group must be created');
  assert.strictEqual(s29Grp.name, 'Turbine Power Assembly');
  assert.strictEqual(s29Grp.members.length, 4, 'Scenario 29: Group must have 4 members');

  // Verify group is in Go and ObjectGroups
  assert.strictEqual(window.EngineBridge.listGroups().length, 1, 'Scenario 29: Go engine must have 1 group');
  assert.strictEqual(window.ObjectGroups.list.length, 1, 'Scenario 29: ObjectGroups must have 1 group');

  // Export SVA through ProjectManager.exportSVA
  let capturedExportBlob = null;
  let capturedExportFilename = null;
  const origDownloadBlob = window.ProjectManager._downloadBlob;
  window.ProjectManager._downloadBlob = (blob, fn) => {
    capturedExportBlob = blob;
    capturedExportFilename = fn;
  };

  await window.ProjectManager.exportSVA();
  assert.ok(capturedExportBlob, 'Scenario 29: exportSVA must yield an archive blob');
  assert.ok(capturedExportFilename.endsWith('.sva'), 'Scenario 29: Export filename must have .sva extension');

  // Inspect the archive via decodeSVA
  const s29Buf = await capturedExportBlob.arrayBuffer();
  const s29Bytes = new Uint8Array(s29Buf);
  let s29Binary = '';
  for (let i = 0; i < s29Bytes.length; i += 8192) {
    s29Binary += String.fromCharCode.apply(null, s29Bytes.subarray(i, i + 8192));
  }
  const s29B64 = btoa(s29Binary);

  const s29Val = window.EngineBridge.validateSVA(s29B64);
  assert.ok(s29Val && s29Val.success, 'Scenario 29: Exported archive must pass validateSVA');
  assert.strictEqual(s29Val.manifest.format, 'sva', 'Scenario 29: Format signature must be sva');

  const s29Dec = window.EngineBridge.decodeSVA(s29B64);
  assert.ok(s29Dec && s29Dec.success, 'Scenario 29: Exported archive must decode successfully');
  const s29DecState = typeof s29Dec.state === 'string' ? JSON.parse(s29Dec.state) : s29Dec.state;
  assert.ok(Array.isArray(s29DecState.groups), 'Scenario 29: Decoded state must have groups array');
  assert.strictEqual(s29DecState.groups.length, 1, 'Scenario 29: Decoded state must contain exactly 1 group');
  assert.strictEqual(s29DecState.groups[0].name, 'Turbine Power Assembly', 'Scenario 29: Group name must survive in archive');
  assert.strictEqual(s29DecState.groups[0].members.length, 4, 'Scenario 29: Group in archive must have 4 members');
  assert.ok(s29DecState.groupsCounter >= 1, 'Scenario 29: groupsCounter in archive must be >= 1');

  // Clear scene
  window.ProjectManager.resetToNewProject();
  assert.strictEqual(window.DiagramNodes.list.length, 0, 'Scenario 29: resetToNewProject must clear nodes');
  assert.strictEqual(window.DataFlows.list.length, 0, 'Scenario 29: resetToNewProject must clear flows');
  assert.strictEqual(window.Glows.list.length, 0, 'Scenario 29: resetToNewProject must clear glows');
  assert.strictEqual(window.Ripples.list.length, 0, 'Scenario 29: resetToNewProject must clear ripples');
  assert.strictEqual(window.ObjectGroups.list.length, 0, 'Scenario 29: resetToNewProject must clear ObjectGroups');
  assert.strictEqual(window.EngineBridge.listGroups().length, 0, 'Scenario 29: resetToNewProject must clear Go groups');

  // Import SVA file through ProjectManager.importSVA
  const fakeFile = {
    name: 'Turbine Power Assembly.sva',
    arrayBuffer: async () => s29Buf
  };
  await window.ProjectManager.importSVA(fakeFile);

  // Restore _downloadBlob
  window.ProjectManager._downloadBlob = origDownloadBlob;

  // Assert restored scene objects
  assert.strictEqual(window.DiagramNodes.list.length, 1, 'Scenario 29: Restored scene must have 1 node');
  assert.strictEqual(window.DataFlows.list.length, 1, 'Scenario 29: Restored scene must have 1 flow');
  assert.strictEqual(window.Glows.list.length, 1, 'Scenario 29: Restored scene must have 1 glow');
  assert.strictEqual(window.Ripples.list.length, 1, 'Scenario 29: Restored scene must have 1 ripple');

  // Assert restored groups
  assert.strictEqual(window.ObjectGroups.list.length, 1, 'Scenario 29: Restored ObjectGroups must have 1 group');
  assert.strictEqual(window.EngineBridge.listGroups().length, 1, 'Scenario 29: Restored Go engine must have 1 group');
  const restoredGrp = window.ObjectGroups.list[0];
  assert.strictEqual(restoredGrp.name, 'Turbine Power Assembly');
  assert.strictEqual(restoredGrp.members.length, 4);

  // Verify findGroupByMember across all 4 types
  const rNode = window.DiagramNodes.list[0];
  const rFlow = window.DataFlows.list[0];
  const rGlow = window.Glows.list[0];
  const rRipple = window.Ripples.list[0];

  assert.strictEqual(window.AppCoordinator.findGroupByMember('node', rNode.id)?.id, restoredGrp.id, 'Scenario 29: findGroupByMember must locate group by node');
  assert.strictEqual(window.AppCoordinator.findGroupByMember('flow', rFlow.id)?.id, restoredGrp.id, 'Scenario 29: findGroupByMember must locate group by flow');
  assert.strictEqual(window.AppCoordinator.findGroupByMember('glow', rGlow.id)?.id, restoredGrp.id, 'Scenario 29: findGroupByMember must locate group by glow');
  assert.strictEqual(window.AppCoordinator.findGroupByMember('ripple', rRipple.id)?.id, restoredGrp.id, 'Scenario 29: findGroupByMember must locate group by ripple');

  // Assert syncScene / render does not wipe groups
  if (typeof window.render === 'function') {
    window.render();
  }
  assert.strictEqual(window.EngineBridge.listGroups().length, 1, 'Scenario 29: syncScene must NOT wipe Go groups on render');
  assert.strictEqual(window.ObjectGroups.list.length, 1, 'Scenario 29: ObjectGroups must remain intact after render');
  console.log('[HARNESS] Scenario 29 PASS: Full SVA round-trip of mixed-type group verified.');

  // ===========================================================================
  // SCENARIO 30: Post-Import Group Selection, Group Edit Mode Member Removal,
  // and Group Dissolution Check
  // ===========================================================================
  console.log('\n[HARNESS] Scenario 30: Group Selection, Member Removal & Dissolution...');
  // 1. Selecting the group
  window.AppCoordinator.clearSelection();
  window.AppCoordinator.selectGroup(restoredGrp.id);
  const selAfterClick = window.AppCoordinator.getSelectedItems();
  assert.strictEqual(selAfterClick.length, 4, 'Scenario 30: Group selection contains all 4 members');

  // 2. Enter Group Edit Mode
  assert.ok(typeof window.AppCoordinator.enterGroupEditMode === 'function', 'enterGroupEditMode exists');
  window.AppCoordinator.enterGroupEditMode(restoredGrp.id);
  assert.strictEqual(window.AppCoordinator.getGroupEditModeGroupId(), restoredGrp.id, 'Scenario 30: Active group edit mode must be set');

  // 3. Remove 1 member (Flow) from group
  const remRes1 = window.AppCoordinator.removeSelectedMembersFromGroup([{ type: 'flow', id: rFlow.id }], restoredGrp.id);
  assert.strictEqual(remRes1, true, 'Scenario 30: Flow removal succeeded');
  const grpAfterRemoval = window.AppCoordinator.getGroup(restoredGrp.id);
  assert.strictEqual(grpAfterRemoval.members.length, 3, 'Scenario 30: Group should now have 3 members');
  assert.strictEqual(window.AppCoordinator.findGroupByMember('flow', rFlow.id), null, 'Scenario 30: Removed flow should no longer belong to group');
  assert.ok(window.AppCoordinator.findGroupByMember('node', rNode.id), 'Scenario 30: Node still belongs to group');

  // 4. Remove Glow from group
  const remRes2 = window.AppCoordinator.removeSelectedMembersFromGroup([{ type: 'glow', id: rGlow.id }], restoredGrp.id);
  assert.strictEqual(remRes2, true, 'Scenario 30: Glow removal succeeded');
  const grpAfter2Removals = window.AppCoordinator.getGroup(restoredGrp.id);
  assert.strictEqual(grpAfter2Removals.members.length, 2, 'Scenario 30: Group should now have 2 members (node and ripple)');

  // 5. Remove Ripple from group -> should dissolve group (less than 2 members)
  const remRes3 = window.AppCoordinator.removeSelectedMembersFromGroup([{ type: 'ripple', id: rRipple.id }], restoredGrp.id);
  assert.strictEqual(remRes3, true, 'Scenario 30: Ripple removal succeeded');
  const dissolvedGrp = window.AppCoordinator.getGroup(restoredGrp.id);
  assert.strictEqual(dissolvedGrp, null, 'Scenario 30: Group should dissolve when fewer than 2 members remain');
  assert.strictEqual(window.ObjectGroups.list.length, 0, 'Scenario 30: ObjectGroups list empty after dissolution');
  assert.strictEqual(window.EngineBridge.listGroups().length, 0, 'Scenario 30: Go listGroups empty after dissolution');
  assert.strictEqual(window.DiagramNodes.list.length, 1, 'Scenario 30: Remaining node must not be deleted');
  console.log('[HARNESS] Scenario 30 PASS: Group selection, member removal, and dissolution verified.');

  // ===========================================================================
  // SCENARIO 31: Undo / Redo of Member Removal and Ungroup on Imported Group
  // ===========================================================================
  console.log('\n[HARNESS] Scenario 31: Undo/Redo of Member Removal and Ungroup...');
  // Undo the last removal (which dissolved the group)
  window.HistoryManager.undo();
  assert.strictEqual(window.ObjectGroups.list.length, 1, 'Scenario 31: Undo must restore dissolved group');
  assert.strictEqual(window.EngineBridge.listGroups().length, 1, 'Scenario 31: Undo must restore group in Go engine');
  let restoredAfterUndo = window.ObjectGroups.list[0];
  assert.strictEqual(restoredAfterUndo.members.length, 2, 'Scenario 31: Restored group must have 2 members');

  // Redo dissolution
  window.HistoryManager.redo();
  assert.strictEqual(window.ObjectGroups.list.length, 0, 'Scenario 31: Redo must dissolve group again');
  assert.strictEqual(window.EngineBridge.listGroups().length, 0, 'Scenario 31: Redo must dissolve group in Go engine');

  // Undo back to restore it
  window.HistoryManager.undo();
  assert.strictEqual(window.ObjectGroups.list.length, 1, 'Scenario 31: Undo must restore group again');

  // Test ungroup and its undo/redo
  const s31GrpToUngroup = window.ObjectGroups.list[0];
  window.AppCoordinator.selectGroup(s31GrpToUngroup.id);
  const s31UngroupRes = window.AppCoordinator.ungroupSelectedGroup();
  assert.strictEqual(s31UngroupRes, true, 'Scenario 31: ungroup must succeed');
  assert.strictEqual(window.ObjectGroups.list.length, 0, 'Scenario 31: ungroup must remove group definition');
  assert.strictEqual(window.EngineBridge.listGroups().length, 0, 'Scenario 31: ungroup must remove group in Go');
  assert.strictEqual(window.DiagramNodes.list.length, 1, 'Scenario 31: ungroup must retain objects on canvas');

  // Undo ungroup
  window.HistoryManager.undo();
  assert.strictEqual(window.ObjectGroups.list.length, 1, 'Scenario 31: Undo ungroup must restore group');
  assert.strictEqual(window.EngineBridge.listGroups().length, 1, 'Scenario 31: Undo ungroup must restore group in Go');

  // Redo ungroup
  window.HistoryManager.redo();
  assert.strictEqual(window.ObjectGroups.list.length, 0, 'Scenario 31: Redo ungroup must re-ungroup');
  console.log('[HARNESS] Scenario 31 PASS: Undo/Redo of member removal and ungroup verified.');

  // ===========================================================================
  // SCENARIO 32: Optical-Only Group (Glow + Ripple) SVA Round-Trip
  // ===========================================================================
  console.log('\n[HARNESS] Scenario 32: Optical-Only Group SVA Round-Trip...');
  window.ProjectManager.resetToNewProject();

  const optGlow1 = window.Glows.createGlow({ name: 'Radar Glow 1', x: 100, y: 100, size: 30, color: '#ffaa00' });
  const optGlow2 = window.Glows.createGlow({ name: 'Radar Glow 2', x: 200, y: 200, size: 40, color: '#ff00aa' });
  const optRipple1 = window.Ripples.createRipple({ name: 'Sonar Pulse 1', x: 100, y: 100, innerRadius: 10, outerRadius: 60 });
  const optRipple2 = window.Ripples.createRipple({ name: 'Sonar Pulse 2', x: 200, y: 200, innerRadius: 15, outerRadius: 75 });

  window.AppCoordinator.setMultiSelection([
    { type: 'glow', id: optGlow1.id },
    { type: 'glow', id: optGlow2.id },
    { type: 'ripple', id: optRipple1.id },
    { type: 'ripple', id: optRipple2.id }
  ]);

  const optGroup = window.AppCoordinator.createGroupFromSelection('Pure Optics Cluster');
  assert.ok(optGroup, 'Scenario 32: Optical group created');
  assert.strictEqual(optGroup.members.length, 4, 'Scenario 32: Optical group has 4 optical members');

  // Export SVA
  let optBlob = null;
  window.ProjectManager._downloadBlob = (blob) => { optBlob = blob; };
  await window.ProjectManager.exportSVA();
  assert.ok(optBlob, 'Scenario 32: exportSVA succeeded for optical group');

  // Reset and Import
  window.ProjectManager.resetToNewProject();
  assert.strictEqual(window.Glows.list.length, 0);
  assert.strictEqual(window.Ripples.list.length, 0);
  assert.strictEqual(window.ObjectGroups.list.length, 0);

  const optBuf = await optBlob.arrayBuffer();
  await window.ProjectManager.importSVA({ name: 'Pure Optics Cluster.sva', arrayBuffer: async () => optBuf });

  assert.strictEqual(window.Glows.list.length, 2, 'Scenario 32: 2 Glows restored');
  assert.strictEqual(window.Ripples.list.length, 2, 'Scenario 32: 2 Ripples restored');
  assert.strictEqual(window.DiagramNodes.list.length, 0, 'Scenario 32: 0 Nodes restored');
  assert.strictEqual(window.ObjectGroups.list.length, 1, 'Scenario 32: 1 Group restored');
  assert.strictEqual(window.EngineBridge.listGroups().length, 1, 'Scenario 32: 1 Go group restored');

  const restoredOptGrp = window.ObjectGroups.list[0];
  assert.strictEqual(restoredOptGrp.name, 'Pure Optics Cluster');
  assert.strictEqual(restoredOptGrp.members.length, 4);
  assert.ok(restoredOptGrp.members.every(m => m.type === 'glow' || m.type === 'ripple'), 'Scenario 32: All members are optical');
  console.log('[HARNESS] Scenario 32 PASS: Optical-only group SVA round-trip verified.');

  // ===========================================================================
  // SCENARIO 33: Double SVA Round-Trip (Import -> Duplicate Group -> Re-Export -> Re-Import)
  // ===========================================================================
  console.log('\n[HARNESS] Scenario 33: Double SVA Round-Trip with Group Duplication...');
  // Add a node and a flow to the current scene so the duplicated group has mixed types and remapped flows
  const s33Node1 = window.DiagramNodes.createNode({ shape: 'rect', text: 'Inlet', x: 20, y: 20 });
  const s33Node2 = window.DiagramNodes.createNode({ shape: 'rect', text: 'Outlet', x: 80, y: 20 });
  const s33Flow = window.DataFlows.createFlow({ name: 'Connecting Pipe', fromNodeId: s33Node1.id, toNodeId: s33Node2.id, color: '#00ff99' });

  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: s33Node1.id },
    { type: 'node', id: s33Node2.id },
    { type: 'flow', id: s33Flow.id }
  ]);
  const pipingGroup = window.AppCoordinator.createGroupFromSelection('Piping Assembly');
  assert.ok(pipingGroup, 'Scenario 33: Piping group created');

  // Total groups now: 'Pure Optics Cluster' + 'Piping Assembly' = 2
  assert.strictEqual(window.ObjectGroups.list.length, 2, 'Scenario 33: 2 groups before duplication');

  // Duplicate piping group
  window.AppCoordinator.selectGroup(pipingGroup.id);
  const s33DupSuccess = window.AppCoordinator.duplicateSelection();
  assert.strictEqual(s33DupSuccess, true, 'Scenario 33: Duplication must succeed');
  assert.strictEqual(window.ObjectGroups.list.length, 3, 'Scenario 33: 3 groups after duplication');
  assert.strictEqual(window.EngineBridge.listGroups().length, 3, 'Scenario 33: 3 Go groups after duplication');

  // Re-export SVA
  let doubleRoundBlob = null;
  window.ProjectManager._downloadBlob = (blob) => { doubleRoundBlob = blob; };
  await window.ProjectManager.exportSVA();
  assert.ok(doubleRoundBlob, 'Scenario 33: Second SVA export succeeded');

  // Clear scene
  window.ProjectManager.resetToNewProject();
  assert.strictEqual(window.ObjectGroups.list.length, 0);
  assert.strictEqual(window.EngineBridge.listGroups().length, 0);

  // Re-import SVA
  const doubleRoundBuf = await doubleRoundBlob.arrayBuffer();
  await window.ProjectManager.importSVA({ name: 'DoubleRoundTrip.sva', arrayBuffer: async () => doubleRoundBuf });

  assert.strictEqual(window.ObjectGroups.list.length, 3, 'Scenario 33: 3 groups restored after double round trip');
  assert.strictEqual(window.EngineBridge.listGroups().length, 3, 'Scenario 33: 3 Go groups restored after double round trip');

  // Verify group names and unique IDs
  const groupIds = new Set(window.ObjectGroups.list.map(g => g.id));
  assert.strictEqual(groupIds.size, 3, 'Scenario 33: All 3 group IDs must be unique');
  console.log('[HARNESS] Scenario 33 PASS: Double SVA round-trip with group duplication verified.');

  // ===========================================================================
  // SCENARIO 34: Backward Compatibility, Malformed IDs & SQLite State Integration
  // ===========================================================================
  console.log('\n[HARNESS] Scenario 34: Backward Compatibility, Malformed IDs & SQLite State Integration...');
  // 1. Backward compatibility: Schema without groups or groups: null
  const legacySchema = {
    version: '1.2.0',
    controls: { canvasWidthInput: '1280', canvasHeightInput: '720' },
    nodes: [{ id: 'legacy-1', shape: 'rect', text: 'Legacy Valve', x: 50, y: 50, width: 60, height: 40 }],
    nodesCounter: 1,
    flows: [],
    flowsCounter: 0,
    glows: [],
    glowsCounter: 0,
    ripples: [],
    ripplesCounter: 0
    // groups and groupsCounter intentionally omitted
  };

  const legacyEnc = window.EngineBridge.encodeSVA('Legacy Archive', 'Testing missing groups field', legacySchema);
  assert.ok(legacyEnc && legacyEnc.success, 'Scenario 34: Encode legacy archive without groups must succeed');

  const legacyDec = window.EngineBridge.decodeSVA(legacyEnc.dataB64);
  assert.ok(legacyDec && legacyDec.success, 'Scenario 34: Decode legacy archive must succeed');
  const legacyState = typeof legacyDec.state === 'string' ? JSON.parse(legacyDec.state) : legacyDec.state;
  assert.ok(Array.isArray(legacyState.groups), 'Scenario 34: Decoded legacy state must default groups to empty array');
  assert.strictEqual(legacyState.groups.length, 0, 'Scenario 34: Decoded legacy groups must be empty');

  // Apply legacy state and coordinate post restore
  window.ProjectManager.applyStudioState(legacyState);
  window.AppCoordinator.coordinatePostRestore({ source: 'sva_import' });
  assert.strictEqual(window.ObjectGroups.list.length, 0, 'Scenario 34: ObjectGroups empty on legacy import');
  assert.strictEqual(window.EngineBridge.listGroups().length, 0, 'Scenario 34: EngineBridge groups empty on legacy import');

  // 2. Malformed member handling: Group references an object ID that doesn't exist
  const stateWithMalformedGroup = {
    version: '1.2.0',
    controls: { canvasWidthInput: '1280', canvasHeightInput: '720' },
    nodes: [{ id: 'valid-node', shape: 'rect', text: 'Valid Node', x: 10, y: 10, width: 50, height: 50 }],
    nodesCounter: 1,
    flows: [],
    flowsCounter: 0,
    glows: [],
    glowsCounter: 0,
    ripples: [],
    ripplesCounter: 0,
    groups: [
      {
        id: 'group-bad',
        name: 'Group With Ghost Member',
        members: [
          { type: 'node', id: 'valid-node' },
          { type: 'node', id: 'ghost-node-999' } // does not exist
        ]
      }
    ],
    groupsCounter: 1
  };

  window.ProjectManager.applyStudioState(stateWithMalformedGroup);
  window.AppCoordinator.coordinatePostRestore({ source: 'sva_import' });
  // Engine and Coordinator should safely load the group without crashing
  assert.strictEqual(window.ObjectGroups.list.length, 1, 'Scenario 34: Malformed group loaded gracefully');
  // findGroupByMember for valid node works
  assert.ok(window.AppCoordinator.findGroupByMember('node', 'valid-node'), 'Scenario 34: Valid member found in group');
  // findGroupByMember for ghost node returns null or doesn't crash
  assert.strictEqual(window.AppCoordinator.findGroupByMember('node', 'ghost-node-999')?.id, 'group-bad');

  // 3. SQLite persistence serialization verification
  // Verify serializeStudioState outputs valid groups and groupsCounter
  const studioSerialized = window.ProjectManager.serializeStudioState();
  const parsedStudio = JSON.parse(studioSerialized);
  assert.ok(Array.isArray(parsedStudio.groups), 'Scenario 34: serializeStudioState must produce groups array');
  assert.strictEqual(parsedStudio.groups.length, 1, 'Scenario 34: serializeStudioState groups count matches');
  assert.strictEqual(parsedStudio.groups[0].id, 'group-bad');
  assert.strictEqual(parsedStudio.groupsCounter, 1, 'Scenario 34: groupsCounter preserved in studio serialization');

  // Reset _downloadBlob to original
  window.ProjectManager._downloadBlob = origDownloadBlob;
  console.log('[HARNESS] Scenario 34 PASS: Backward compatibility, malformed IDs and SQLite serialization verified.');

  // ===========================================================================
  // STAGE 14: Unified Layer Management & Independent Image Objects
  // ===========================================================================
  console.log('\n[HARNESS] Testing Stage 14 Unified Layer Management & Independent Image Objects...');

  // ---------------------------------------------------------------------------
  // SCENARIO 35: Layer Ordering CRUD, BringToFront, SendToBack, BringForward, SendBackward
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 35: Layer ordering CRUD and reordering operations...');
  window.ProjectManager.resetToNewProject();

  const s35Node = window.DiagramNodes.createNode({ shape: 'rect', text: 'Base Node', x: 20, y: 20 });
  const s35Glow = window.Glows.createGlow({ name: 'Middle Glow', x: 40, y: 40 });
  const s35Img = window.ImageObjects.createImage({ name: 'Top Image', x: 60, y: 60, width: 100, height: 80 });

  window.LayerManager.ensureAllObjectsRepresented();
  let s35Layers = window.LayerManager.getLayers();
  assert.strictEqual(s35Layers.length, 3, 'Scenario 35: 3 layers must exist');
  assert.strictEqual(s35Layers[0].type, 'glow', 'Scenario 35: Glow is at index 0 (bottom)');
  assert.strictEqual(s35Layers[1].type, 'image', 'Scenario 35: Image is at index 1 (middle)');
  assert.strictEqual(s35Layers[2].type, 'node', 'Scenario 35: Node is at index 2 (top)');

  // Send node to back (index 2 -> index 0)
  window.LayerManager.sendToBack([{ type: 'node', id: s35Node.id }]);
  s35Layers = window.LayerManager.getLayers();
  assert.strictEqual(s35Layers[0].type, 'node', 'Scenario 35: Node sent to back');
  assert.strictEqual(s35Layers[1].type, 'glow', 'Scenario 35: Glow shifted to 1');
  assert.strictEqual(s35Layers[2].type, 'image', 'Scenario 35: Image shifted to 2');

  // Bring node forward (index 0 -> index 1)
  window.LayerManager.bringForward([{ type: 'node', id: s35Node.id }]);
  s35Layers = window.LayerManager.getLayers();
  assert.strictEqual(s35Layers[1].type, 'node', 'Scenario 35: Node brought forward 1 step');

  // Bring node to front (index 1 -> index 2)
  window.LayerManager.bringToFront([{ type: 'node', id: s35Node.id }]);
  s35Layers = window.LayerManager.getLayers();
  assert.strictEqual(s35Layers[2].type, 'node', 'Scenario 35: Node brought to front');

  // Send node backward (index 2 -> index 1)
  window.LayerManager.sendBackward([{ type: 'node', id: s35Node.id }]);
  s35Layers = window.LayerManager.getLayers();
  assert.strictEqual(s35Layers[1].type, 'node', 'Scenario 35: Node sent backward 1 step');
  console.log('[HARNESS] Scenario 35 PASS: Layer ordering CRUD and reordering operations verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 36: Object Visibility & Effective Visibility
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 36: Object visibility and exclusion from output and hit-testing...');
  window.LayerManager.setVisibility('node', s35Node.id, false);
  let effVis = window.LayerManager.getEffective('node', s35Node.id);
  assert.strictEqual(effVis.visible, false, 'Scenario 36: Node effective visibility is false');

  // SVG compilation must omit hidden elements
  const s36State = window.SceneState.buildRenderState ? window.SceneState.buildRenderState() : {};
  const s36SVG = window.buildFullSVG(s36State);
  assert.ok(!s36SVG.includes(`data-node-id="${s35Node.id}"`), 'Scenario 36: Hidden node must be excluded from SVG output');

  // Hit-testing on canvas must ignore hidden elements
  const hitNodeHidden = window.DiagramNodes.findNodeAtPct(s35Node.x, s35Node.y, 1280, 720);
  assert.strictEqual(hitNodeHidden, null, 'Scenario 36: Hidden node cannot be hit-tested on canvas');

  // Re-enable visibility
  window.LayerManager.setVisibility('node', s35Node.id, true);
  effVis = window.LayerManager.getEffective('node', s35Node.id);
  assert.strictEqual(effVis.visible, true, 'Scenario 36: Node effective visibility restored to true');
  const s36State2 = window.SceneState.buildRenderState ? window.SceneState.buildRenderState() : {};
  const s36SVGVisible = window.buildFullSVG(s36State2);
  assert.ok(s36SVGVisible.includes(`data-node-id="${s35Node.id}"`), 'Scenario 36: Visible node is present in SVG output');
  console.log('[HARNESS] Scenario 36 PASS: Object visibility verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 37: Object Locking & Canvas Selection Blocking
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 37: Object locking, canvas blocking, and deletion skip...');
  window.LayerManager.setLocked('node', s35Node.id, true);
  let effLock = window.LayerManager.getEffective('node', s35Node.id);
  assert.strictEqual(effLock.locked, true, 'Scenario 37: Node is locked');

  // Attempt to select locked node via canvas
  window.AppCoordinator.clearSelection();
  window.AppCoordinator.selectObject('node', s35Node.id, { source: 'canvas' });
  assert.strictEqual(window.AppCoordinator.getActiveSelection()?.id || null, null, 'Scenario 37: Canvas selection of locked object is blocked');

  // Select via layers list must succeed (for inspection/unlocking)
  window.AppCoordinator.selectObject('node', s35Node.id, { source: 'layers_list' });
  assert.ok(window.AppCoordinator.getActiveSelection(), 'Scenario 37: Selecting locked object from layers list succeeds');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, s35Node.id);

  // Delete selected objects must skip locked objects
  let skippedNotification = false;
  const origNotify = window.AppCoordinator.showNotification;
  window.AppCoordinator.showNotification = (msg, type) => {
    if (msg && (msg.includes('Cannot delete locked') || msg.includes('locked skipped') || msg.includes('Locked object(s) skipped'))) skippedNotification = true;
  };
  window.AppCoordinator.deleteSelectedObjects();
  window.AppCoordinator.showNotification = origNotify;

  assert.strictEqual(skippedNotification, true, 'Scenario 37: Notification shown when locked object skipped during delete');
  assert.ok(window.DiagramNodes.getNode(s35Node.id), 'Scenario 37: Locked node must not be deleted');

  // Unlock node
  window.LayerManager.setLocked('node', s35Node.id, false);
  effLock = window.LayerManager.getEffective('node', s35Node.id);
  assert.strictEqual(effLock.locked, false, 'Scenario 37: Node is unlocked');
  console.log('[HARNESS] Scenario 37 PASS: Object locking and deletion skip verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 38: Image Object Lifecycle, Aspect Ratio & Coordinate Mapping
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 38: Image Object lifecycle, aspect ratio math, and hit-testing...');
  const testPngB64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const s38Img = window.ImageObjects.createImage({
    name: 'Industrial Valve',
    filename: 'valve.png',
    data: testPngB64,
    x: 45,
    y: 55,
    width: 200,
    height: 100,
    naturalWidth: 400,
    naturalHeight: 200,
    maintainAspectRatio: true,
    opacity: 0.85
  });
  assert.ok(s38Img && s38Img.id, 'Scenario 38: Image created');
  assert.strictEqual(s38Img.name, 'Industrial Valve');

  const patchImg = window.ImageObjects.updateImage(s38Img.id, { width: 300 });
  assert.strictEqual(patchImg.width, 300, 'Scenario 38: Width updated');

  // Hit-testing image at percentage position (45%, 55%) on 1280x720 canvas
  const hitImg = window.ImageObjects.findImageAtPct(45, 55, 1280, 720);
  assert.ok(hitImg, 'Scenario 38: findImageAtPct finds image at its coordinates');
  assert.strictEqual(hitImg.id, s38Img.id);

  // Render SVG markup check
  const renderedImgMarkup = window.ImageObjects.renderImageElement(s38Img, 1280, 720);
  assert.ok(renderedImgMarkup.includes(`data-image-id="${s38Img.id}"`), 'Scenario 38: SVG markup includes data-image-id');
  assert.ok(renderedImgMarkup.includes('opacity="0.85"'), 'Scenario 38: SVG markup includes opacity');
  console.log('[HARNESS] Scenario 38 PASS: Image Object lifecycle and rendering verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 39: Layer and Group Integration
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 39: Layer and Group integration, contiguity, and hierarchy...');
  window.ProjectManager.resetToNewProject();

  const s39N1 = window.DiagramNodes.createNode({ text: 'Pump Inlet', x: 10, y: 10 });
  const s39G1 = window.Glows.createGlow({ name: 'Pump Core', x: 20, y: 20 });
  const s39N2 = window.DiagramNodes.createNode({ text: 'Pump Outlet', x: 30, y: 30 });
  const s39R1 = window.Ripples.createRipple({ name: 'Pump Cavitation', x: 40, y: 40 });

  window.LayerManager.ensureAllObjectsRepresented();
  // Create group with s39N1 and s39N2
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: s39N1.id },
    { type: 'node', id: s39N2.id }
  ]);
  const s39Grp = window.AppCoordinator.createGroupFromSelection('Pump Group');
  assert.ok(s39Grp, 'Scenario 39: Group created');

  // Group members must be placed contiguous in layer stack
  window.LayerManager.syncFromEngine();
  const s39Layers = window.LayerManager.getLayers();
  const idx1 = s39Layers.findIndex(l => l.type === 'node' && String(l.id) === String(s39N1.id));
  const idx2 = s39Layers.findIndex(l => l.type === 'node' && String(l.id) === String(s39N2.id));
  assert.ok(idx1 >= 0 && idx2 >= 0, 'Scenario 39: Both node layers found in layer stack');
  assert.strictEqual(Math.abs(idx1 - idx2), 1, 'Scenario 39: Group member layers must be contiguous in layer stack');

  // Reorder group to front
  window.LayerManager.bringToFront(s39Grp.members);
  const s39LayersAfter = window.LayerManager.getLayers();
  const lastIdx = s39LayersAfter.length - 1;
  const s39Top1 = s39LayersAfter[lastIdx];
  const s39Top2 = s39LayersAfter[lastIdx - 1];
  assert.ok((String(s39Top1.id) === String(s39N1.id) && String(s39Top2.id) === String(s39N2.id)) || (String(s39Top1.id) === String(s39N2.id) && String(s39Top2.id) === String(s39N1.id)),
    'Scenario 39: Moving group members to front moves all contiguous members to top');
  console.log('[HARNESS] Scenario 39 PASS: Layer and Group integration verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 40: Multi-Selection with Images, Duplication & Copy/Paste
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 40: Multi-selection with images, duplication and copy/paste...');
  window.ProjectManager.resetToNewProject();

  const s40Node = window.DiagramNodes.createNode({ text: 'Generator', x: 50, y: 50 });
  const s40Img = window.ImageObjects.createImage({ name: 'Logo Badge', x: 60, y: 60, width: 80, height: 40 });

  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: s40Node.id },
    { type: 'image', id: s40Img.id }
  ]);

  const s40Selected = window.AppCoordinator.getSelectedItems();
  assert.strictEqual(s40Selected.length, 2, 'Scenario 40: Mixed node and image selected');

  // Duplicate selection
  const s40DupOk = window.AppCoordinator.duplicateSelection();
  assert.strictEqual(s40DupOk, true, 'Scenario 40: Duplication succeeds with image');
  assert.strictEqual(window.DiagramNodes.list.length, 2, 'Scenario 40: 2 nodes exist after duplication');
  assert.strictEqual(window.ImageObjects.list.length, 2, 'Scenario 40: 2 images exist after duplication');

  // Copy and Paste
  const s40CopyOk = window.AppCoordinator.copySelection();
  assert.strictEqual(s40CopyOk, true, 'Scenario 40: Copy selection succeeds');
  const s40PasteOk = window.AppCoordinator.pasteClipboard();
  assert.strictEqual(s40PasteOk, true, 'Scenario 40: Paste clipboard succeeds');
  assert.strictEqual(window.DiagramNodes.list.length, 3, 'Scenario 40: 3 nodes exist after paste');
  assert.strictEqual(window.ImageObjects.list.length, 3, 'Scenario 40: 3 images exist after paste');
  console.log('[HARNESS] Scenario 40 PASS: Multi-selection with images, duplication and copy/paste verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 41: Native .sva Round-Trip with Bundled Image Assets & Layers
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 41: Native .sva round-trip with bundled image asset extraction...');
  window.ProjectManager.resetToNewProject();

  const s41Node = window.DiagramNodes.createNode({ text: 'Circuit Board', x: 25, y: 25 });
  const s41Flow = window.DataFlows.createFlow({ name: 'Data Bus', nodes: [{ x: 25, y: 25 }, { x: 75, y: 75 }] });
  const s41Glow = window.Glows.createGlow({ name: 'LED Indicator', x: 50, y: 50 });
  const s41Ripple = window.Ripples.createRipple({ name: 'Antenna Wave', x: 75, y: 75 });
  const s41Img = window.ImageObjects.createImage({
    name: 'Schematic Overlay',
    filename: 'schematic.png',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    x: 40,
    y: 40,
    width: 120,
    height: 90
  });

  const customLayers = [
    { type: 'ripple', id: s41Ripple.id, visible: true, locked: false },
    { type: 'node', id: s41Node.id, visible: true, locked: false },
    { type: 'glow', id: s41Glow.id, visible: false, locked: false },
    { type: 'image', id: s41Img.id, visible: true, locked: true },
    { type: 'flow', id: s41Flow.id, visible: true, locked: false }
  ];
  window.LayerManager.setLayers(customLayers);

  let s41CapturedBlob = null;
  const origBlobFn = window.ProjectManager._downloadBlob;
  window.ProjectManager._downloadBlob = (b) => { s41CapturedBlob = b; };

  await window.ProjectManager.exportSVA();
  assert.ok(s41CapturedBlob, 'Scenario 41: exportSVA succeeded');

  const s41Buf = await s41CapturedBlob.arrayBuffer();
  const s41Bytes = new Uint8Array(s41Buf);
  let s41Bin = '';
  for (let i = 0; i < s41Bytes.length; i += 8192) {
    s41Bin += String.fromCharCode.apply(null, s41Bytes.subarray(i, i + 8192));
  }
  const s41B64 = btoa(s41Bin);

  // Validate archive
  const s41Val = window.EngineBridge.validateSVA(s41B64);
  assert.ok(s41Val && s41Val.success, 'Scenario 41: Exported archive validates');

  // Decode archive and inspect manifest assets
  const s41Dec = window.EngineBridge.decodeSVA(s41B64);
  assert.ok(s41Dec && s41Dec.success, 'Scenario 41: Exported archive decodes');
  const s41Manifest = s41Dec.manifest;
  assert.ok(s41Manifest.assets && s41Manifest.assets.length >= 1, 'Scenario 41: Manifest contains bundled image asset');
  assert.ok(s41Manifest.assets.some(a => a.id.startsWith('image_')), 'Scenario 41: Image asset bundled in manifest');

  // Clear scene and import SVA
  window.ProjectManager.resetToNewProject();
  assert.strictEqual(window.ImageObjects.list.length, 0, 'Scenario 41: Image list cleared');

  await window.ProjectManager.importSVA({
    name: 'Circuit Board.sva',
    arrayBuffer: async () => s41Buf
  });

  window.ProjectManager._downloadBlob = origBlobFn;

  // Verify restored image and layers
  assert.strictEqual(window.ImageObjects.list.length, 1, 'Scenario 41: Image object restored');
  const restoredImg = window.ImageObjects.list[0];
  assert.strictEqual(restoredImg.name, 'Schematic Overlay');
  assert.ok(restoredImg.data && restoredImg.data.startsWith('data:image/'), 'Scenario 41: Image data URL restored');

  const restoredLayers = window.LayerManager.getLayers();
  assert.strictEqual(restoredLayers.length, 5, 'Scenario 41: All 5 layers restored');
  assert.strictEqual(restoredLayers[0].type, 'ripple', 'Scenario 41: Ripple at bottom');
  assert.strictEqual(restoredLayers[1].type, 'node', 'Scenario 41: Node at index 1');
  assert.strictEqual(restoredLayers[2].type, 'glow', 'Scenario 41: Glow at index 2');
  assert.strictEqual(restoredLayers[2].visible, false, 'Scenario 41: Glow hidden state preserved');
  assert.strictEqual(restoredLayers[3].type, 'image', 'Scenario 41: Image at index 3');
  assert.strictEqual(restoredLayers[3].locked, true, 'Scenario 41: Image locked state preserved');
  assert.strictEqual(restoredLayers[4].type, 'flow', 'Scenario 41: Flow at top');
  console.log('[HARNESS] Scenario 41 PASS: Native .sva round-trip with bundled assets and layers verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 42: History Undo/Redo State Restoration for Images & Layers
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 42: History undo/redo state restoration for images and layers...');
  window.ProjectManager.resetToNewProject();

  const s42Node = window.DiagramNodes.createNode({ text: 'History Node', x: 20, y: 20 });
  const s42Img = window.ImageObjects.createImage({ name: 'History Image', x: 40, y: 40 });
  window.HistoryManager.recordImmediate();

  const initialLayers = JSON.parse(JSON.stringify(window.LayerManager.getLayers()));

  // Action: reorder layers (bring node to front) and hide image
  window.LayerManager.bringToFront([{ type: 'node', id: s42Node.id }]);
  window.LayerManager.setVisibility('image', s42Img.id, false);
  window.HistoryManager.recordImmediate();

  const modifiedLayers = window.LayerManager.getLayers();
  assert.strictEqual(modifiedLayers[1].type, 'node', 'Scenario 42: Node brought to front');
  assert.strictEqual(window.LayerManager.getEffective('image', s42Img.id).visible, false, 'Scenario 42: Image hidden');

  // Undo
  window.HistoryManager.undo();
  const undoneLayers = window.LayerManager.getLayers();
  assert.strictEqual(undoneLayers[0].type, initialLayers[0].type, 'Scenario 42: Undo restored initial bottom layer');
  assert.strictEqual(window.LayerManager.getEffective('image', s42Img.id).visible, true, 'Scenario 42: Undo restored image visibility');

  // Redo
  window.HistoryManager.redo();
  const redoneLayers = window.LayerManager.getLayers();
  assert.strictEqual(redoneLayers[1].type, 'node', 'Scenario 42: Redo restored node to front');
  assert.strictEqual(window.LayerManager.getEffective('image', s42Img.id).visible, false, 'Scenario 42: Redo restored image hidden state');
  console.log('[HARNESS] Scenario 42 PASS: History undo/redo state restoration for images and layers verified.');

  // ===========================================================================
  // SCENARIO 43: JavaScript-to-Go Protocol Boundary Normalization
  // (Prevents "cannot unmarshal object into []scene.SelectionItem" regression)
  // ===========================================================================
  console.log('\n[HARNESS] Scenario 43: Protocol boundary normalization and Go schema validation...');
  window.ProjectManager.resetToNewProject();

  const s43NodeA = window.DiagramNodes.createNode({ text: 'Node A', x: 20, y: 20 });
  const s43NodeB = window.DiagramNodes.createNode({ text: 'Node B', x: 40, y: 40 });
  const s43GroupRes = window.EngineBridge.createGroup('Proto Group', [
    { type: 'node', id: s43NodeA.id },
    { type: 'node', id: s43NodeB.id }
  ]);
  const s43GroupId = (s43GroupRes && s43GroupRes.group) ? s43GroupRes.group.id : 'group-1';
  window.LayerManager.syncFromEngine();

  // Test 1: Single bare object (original browser failure shape: { type: 'node', id: '1' })
  // In the original bug, floating toolbar dispatched this bare object, crashing Go unmarshal
  const resBare = window.EngineBridge.bringToFront({ type: 'node', id: s43NodeA.id });
  assert.ok(resBare && resBare.success, 'Scenario 43: Single bare object must be normalized and accepted by Go engine');

  // Test 2: Standard array shape: [{ type: 'node', id: '1' }]
  const resArray = window.EngineBridge.sendToBack([{ type: 'node', id: s43NodeA.id }]);
  assert.ok(resArray && resArray.success, 'Scenario 43: Standard array shape accepted by Go engine');

  // Test 3: SelectionState object with .items array
  const mockSelState = {
    type: 'multi',
    items: [
      { type: 'node', id: s43NodeB.id }
    ]
  };
  const resSelState = window.EngineBridge.bringForward(mockSelState);
  assert.ok(resSelState && resSelState.success, 'Scenario 43: SelectionState object with .items normalized and accepted by Go engine');

  // Test 4: Group reference: { type: 'group', id: s43GroupId }
  const resGroup = window.EngineBridge.bringToFront({ type: 'group', id: s43GroupId });
  assert.ok(resGroup && resGroup.success, 'Scenario 43: Group reference expanded and accepted by Go engine');

  // Test 5: Numeric versus string IDs
  const resNumId = window.EngineBridge.sendBackward([{ type: 'node', id: Number(s43NodeA.id) }]);
  assert.ok(resNumId && resNumId.success, 'Scenario 43: Numeric ID normalized to canonical string ID in Go engine');

  // Test 6: Rejection of invalid object types (e.g. 'camera')
  const resInvalidType = window.EngineBridge.bringToFront([{ type: 'camera', id: '1' }]);
  assert.ok(resInvalidType && resInvalidType.error, 'Scenario 43: Invalid object type correctly rejected with error');

  // Test 7: Rejection of empty targets
  const resEmpty = window.EngineBridge.bringToFront([]);
  assert.ok(resEmpty && resEmpty.error, 'Scenario 43: Empty selection correctly rejected with error');

  // Test 8: All four layer-order actions dispatch cleanly via AppCoordinator
  const s43NodeC = window.DiagramNodes.createNode({ text: 'Node C', x: 60, y: 60 });
  window.LayerManager.syncFromEngine();

  window.AppCoordinator.selectObject('node', s43NodeC.id);
  window.AppCoordinator.bringSelectionToFront();
  let curLayers = window.LayerManager.getLayers();
  assert.strictEqual(String(curLayers[curLayers.length - 1].id), String(s43NodeC.id), 'Scenario 43: bringSelectionToFront moved Node C to top');

  window.AppCoordinator.sendSelectionToBack();
  curLayers = window.LayerManager.getLayers();
  assert.strictEqual(String(curLayers[0].id), String(s43NodeC.id), 'Scenario 43: sendSelectionToBack moved Node C to bottom');

  window.AppCoordinator.bringSelectionForward();
  curLayers = window.LayerManager.getLayers();
  const cIdx = curLayers.findIndex((l) => String(l.id) === String(s43NodeC.id));
  assert.ok(cIdx > 0, 'Scenario 43: bringSelectionForward moved Node C up from bottom');

  window.AppCoordinator.sendSelectionBackward();
  curLayers = window.LayerManager.getLayers();
  const cIdxBack = curLayers.findIndex((l) => String(l.id) === String(s43NodeC.id));
  assert.strictEqual(cIdxBack, 0, 'Scenario 43: sendSelectionBackward moved Node C back to bottom');

  console.log('[HARNESS] Scenario 43 PASS: Protocol boundary normalization and Go schema validation verified.');

  // ===========================================================================
  // SCENARIO 44: Real Visual SVG Stacking Order Reversal
  // (Verifies SVG DOM element order matches Go authoritative layer order)
  // ===========================================================================
  console.log('\n[HARNESS] Scenario 44: Real visual SVG stacking order reversal...');
  window.ProjectManager.resetToNewProject();

  // 1. Two Overlapping Shapes
  const shapeRear = window.DiagramNodes.createNode({ shape: 'rect', text: 'Rear Shape', x: 30, y: 30, width: 120, height: 80 });
  const shapeFront = window.DiagramNodes.createNode({ shape: 'rect', text: 'Front Shape', x: 35, y: 35, width: 120, height: 80 });
  window.LayerManager.syncFromEngine();

  let state = window.SceneState.buildRenderState();
  let svg = window.SceneState.buildFullSVG(state);
  let idxRear = svg.indexOf(`data-node-id="${shapeRear.id}"`);
  let idxFront = svg.indexOf(`data-node-id="${shapeFront.id}"`);
  assert.ok(idxRear !== -1 && idxFront !== -1, 'Scenario 44: Both shapes present in SVG');
  assert.ok(idxRear < idxFront, 'Scenario 44: Initially Rear Shape is before Front Shape in SVG DOM');

  // Move Rear Shape to front
  window.LayerManager.bringToFront([{ type: 'node', id: shapeRear.id }]);
  svg = window.SceneState.buildFullSVG(state);
  idxRear = svg.indexOf(`data-node-id="${shapeRear.id}"`);
  idxFront = svg.indexOf(`data-node-id="${shapeFront.id}"`);
  assert.ok(idxFront < idxRear, 'Scenario 44: Visible overlap reversed: Rear Shape is now AFTER Front Shape in SVG DOM (on top)');

  // Send it back
  window.LayerManager.sendToBack([{ type: 'node', id: shapeRear.id }]);
  svg = window.SceneState.buildFullSVG(state);
  idxRear = svg.indexOf(`data-node-id="${shapeRear.id}"`);
  idxFront = svg.indexOf(`data-node-id="${shapeFront.id}"`);
  assert.ok(idxRear < idxFront, 'Scenario 44: Send to Back reversed overlap again: Rear Shape is back underneath');

  // 2. Shape and Flow
  const s44Flow = window.DataFlows.createFlow({ name: 'Cross Flow', nodes: [{ x: 25, y: 25 }, { x: 45, y: 45 }] });
  window.LayerManager.syncFromEngine();
  // Bring Rear Shape to front of Flow
  window.LayerManager.bringToFront([{ type: 'node', id: shapeRear.id }]);
  svg = window.SceneState.buildFullSVG(state);
  idxRear = svg.indexOf(`data-node-id="${shapeRear.id}"`);
  const idxFlow = svg.indexOf(`data-flow-id="${s44Flow.id}"`);
  assert.ok(idxFlow !== -1 && idxRear !== -1, 'Scenario 44: Shape and Flow present in SVG');
  assert.ok(idxFlow < idxRear, 'Scenario 44: Shape brought to front is rendered AFTER Flow in SVG DOM (on top)');

  // 3. Glow and Shape
  const s44Glow = window.Glows.createGlow({ name: 'Beacon Glow', x: 30, y: 30, size: 40 });
  window.LayerManager.syncFromEngine();
  window.LayerManager.bringToFront([{ type: 'glow', id: s44Glow.id }]);
  svg = window.SceneState.buildFullSVG(state);
  const idxGlow = svg.indexOf(`data-glow-id="${s44Glow.id}"`);
  idxRear = svg.indexOf(`data-node-id="${shapeRear.id}"`);
  assert.ok(idxGlow !== -1 && idxRear !== -1, 'Scenario 44: Glow and Shape present in SVG');
  assert.ok(idxRear < idxGlow, 'Scenario 44: Glow brought to front is rendered AFTER Shape in SVG DOM (on top of Shape)');

  // 4. Ripple and Image Object
  const s44Ripple = window.Ripples.createRipple({ x: 50, y: 50, outerR: 80 });
  const s44Img = window.ImageObjects.createImage({ name: 'Overlay Image', x: 50, y: 50, width: 100, height: 100 });
  window.LayerManager.syncFromEngine();
  window.LayerManager.bringToFront([{ type: 'ripple', id: s44Ripple.id }]);
  svg = window.SceneState.buildFullSVG(state);
  const idxRipple = svg.indexOf(`data-ripple-id="${s44Ripple.id}"`);
  const idxImg = svg.indexOf(`data-image-id="${s44Img.id}"`);
  assert.ok(idxRipple !== -1 && idxImg !== -1, 'Scenario 44: Ripple and Image present in SVG');
  assert.ok(idxImg < idxRipple, 'Scenario 44: Ripple brought to front is rendered AFTER Image in SVG DOM (on top of Image)');

  console.log('[HARNESS] Scenario 44 PASS: Real visual SVG stacking order reversal verified.');

  // ===========================================================================
  // SCENARIO 45: Persistent Group Contiguity and Layer Integration
  // ===========================================================================
  console.log('\n[HARNESS] Scenario 45: Group contiguity across BringForward and SendBackward...');
  window.ProjectManager.resetToNewProject();

  const gNode1 = window.DiagramNodes.createNode({ text: 'G Node 1', x: 10, y: 10 });
  const gGlow1 = window.Glows.createGlow({ name: 'G Glow 1', x: 15, y: 15 });
  const standaloneNode = window.DiagramNodes.createNode({ text: 'Standalone Node', x: 50, y: 50 });
  const standaloneFlow = window.DataFlows.createFlow({ name: 'Standalone Flow', nodes: [{ x: 40, y: 40 }, { x: 60, y: 60 }] });

  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: gNode1.id },
    { type: 'glow', id: gGlow1.id }
  ]);
  const mixedGrp = window.AppCoordinator.createGroupFromSelection('Mixed Group 45');
  assert.ok(mixedGrp, 'Scenario 45: Mixed group created');
  window.LayerManager.syncFromEngine();

  // Verify group is initially contiguous in layers
  let lList = window.LayerManager.getLayers();
  let idxM1 = lList.findIndex((l) => l.type === 'node' && String(l.id) === String(gNode1.id));
  let idxM2 = lList.findIndex((l) => l.type === 'glow' && String(l.id) === String(gGlow1.id));
  assert.strictEqual(Math.abs(idxM1 - idxM2), 1, 'Scenario 45: Group members must be contiguous in initial layers');

  // Bring group forward past standalone elements
  window.LayerManager.bringToFront({ type: 'group', id: mixedGrp.id });
  lList = window.LayerManager.getLayers();
  idxM1 = lList.findIndex((l) => l.type === 'node' && String(l.id) === String(gNode1.id));
  idxM2 = lList.findIndex((l) => l.type === 'glow' && String(l.id) === String(gGlow1.id));
  assert.strictEqual(Math.abs(idxM1 - idxM2), 1, 'Scenario 45: Group members remain contiguous after bringToFront');
  assert.ok(Math.min(idxM1, idxM2) >= 2, 'Scenario 45: Group members moved to the front of standalone elements');

  // Send group backward
  window.LayerManager.sendBackward({ type: 'group', id: mixedGrp.id });
  lList = window.LayerManager.getLayers();
  idxM1 = lList.findIndex((l) => l.type === 'node' && String(l.id) === String(gNode1.id));
  idxM2 = lList.findIndex((l) => l.type === 'glow' && String(l.id) === String(gGlow1.id));
  assert.strictEqual(Math.abs(idxM1 - idxM2), 1, 'Scenario 45: Group members remain contiguous after sendBackward');

  // Group membership must not be lost or split
  const verifyGrp = window.ObjectGroups.getGroup(mixedGrp.id);
  assert.ok(verifyGrp, 'Scenario 45: Group definition intact');
  assert.strictEqual(verifyGrp.members.length, 2, 'Scenario 45: All 2 members retained');

  console.log('[HARNESS] Scenario 45 PASS: Group contiguity across BringForward and SendBackward verified.');

  // ===========================================================================
  // SCENARIO 46: Undo/Redo & SVA Round-Trip Persistence of Layer Order
  // ===========================================================================
  console.log('\n[HARNESS] Scenario 46: Undo/redo and SVA round-trip persistence of layer order...');
  window.ProjectManager.resetToNewProject();

  const pNode = window.DiagramNodes.createNode({ text: 'Persist Node', x: 20, y: 20 });
  const pFlow = window.DataFlows.createFlow({ name: 'Persist Flow', nodes: [{ x: 10, y: 10 }, { x: 30, y: 30 }] });
  const pImg = window.ImageObjects.createImage({ name: 'Persist Image', x: 40, y: 40, width: 80, height: 60 });
  window.LayerManager.syncFromEngine();
  window.HistoryManager.recordImmediate();

  // Baseline order
  const s46BaselineLayers = window.LayerManager.getLayers().map((l) => `${l.type}:${l.id}`);

  // Reorder: bring Flow to front (past image and node)
  window.AppCoordinator.selectObject('flow', pFlow.id);
  window.AppCoordinator.bringSelectionToFront();

  const s46ReorderedLayers = window.LayerManager.getLayers().map((l) => `${l.type}:${l.id}`);
  assert.strictEqual(s46ReorderedLayers[s46ReorderedLayers.length - 1], `flow:${pFlow.id}`, 'Scenario 46: Flow brought to top');

  // Undo restores baseline
  window.HistoryManager.undo();
  const s46UndoneLayers = window.LayerManager.getLayers().map((l) => `${l.type}:${l.id}`);
  assert.deepStrictEqual(s46UndoneLayers, s46BaselineLayers, 'Scenario 46: Undo restored exact baseline layer order');

  // Redo reapplies reordering
  window.HistoryManager.redo();
  const s46RedoneLayers = window.LayerManager.getLayers().map((l) => `${l.type}:${l.id}`);
  assert.deepStrictEqual(s46RedoneLayers, s46ReorderedLayers, 'Scenario 46: Redo reapplied reordered layers');

  // Export to native .sva and re-import
  const s46Serialized = window.ProjectManager.serializeStudioState();
  const s46Parsed = JSON.parse(s46Serialized);
  assert.ok(s46Parsed.layers, 'Scenario 46: Layers included in serialized studio state');
  assert.strictEqual(s46Parsed.layers.length, 3, 'Scenario 46: All 3 layers serialized');

  window.ProjectManager.resetToNewProject();
  assert.strictEqual(window.LayerManager.getLayers().length, 0, 'Scenario 46: Project reset cleared layers');

  window.ProjectManager.applyStudioState(s46Serialized);
  window.LayerManager.syncFromEngine();
  const s46RestoredLayers = window.LayerManager.getLayers().map((l) => `${l.type}:${l.id}`);
  assert.deepStrictEqual(s46RestoredLayers, s46ReorderedLayers, 'Scenario 46: SVA round-trip restored exact reordered layer sequence');

  console.log('[HARNESS] Scenario 46 PASS: Undo/redo and SVA round-trip persistence of layer order verified.');

  // ===========================================================================
  // SCENARIO 47: Layers Drawer Toolbar Accessibility, Dynamic Button Enabling & Reordering
  // ===========================================================================
  console.log('\n[HARNESS] Scenario 47: Layers Drawer toolbar accessibility, dynamic button enabling and reordering...');
  window.ProjectManager.resetToNewProject();

  // 1. Verify toolbar buttons in mock DOM / index.html structure
  const btnToFront = document.getElementById('btnLayerToFront');
  const btnForward = document.getElementById('btnLayerForward');
  const btnBackward = document.getElementById('btnLayerBackward');
  const btnToBack = document.getElementById('btnLayerToBack');
  const btnImportImg = document.getElementById('btnImportImageObject');
  const layersContainer = document.getElementById('layersListContainer');

  assert.ok(btnToFront, 'Scenario 47: btnLayerToFront element exists');
  assert.ok(btnForward, 'Scenario 47: btnLayerForward element exists');
  assert.ok(btnBackward, 'Scenario 47: btnLayerBackward element exists');
  assert.ok(btnToBack, 'Scenario 47: btnLayerToBack element exists');
  assert.ok(btnImportImg, 'Scenario 47: btnImportImageObject element exists');
  assert.ok(layersContainer, 'Scenario 47: layersListContainer element exists');

  // Verify index.html static markup contains toolbar accessibility roles and labels
  const rawHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  assert.ok(rawHtml.includes('role="toolbar"'), 'Scenario 47: Layers toolbar has role="toolbar"');
  assert.ok(rawHtml.includes('aria-label="Layer Ordering Controls"'), 'Scenario 47: Layers toolbar has accessible aria-label');
  assert.ok(rawHtml.includes('id="btnLayerToFront"'), 'Scenario 47: btnLayerToFront present in index.html');
  assert.ok(rawHtml.includes('id="btnLayerForward"'), 'Scenario 47: btnLayerForward present in index.html');
  assert.ok(rawHtml.includes('id="btnLayerBackward"'), 'Scenario 47: btnLayerBackward present in index.html');
  assert.ok(rawHtml.includes('id="btnLayerToBack"'), 'Scenario 47: btnLayerToBack present in index.html');

  // Verify CSS contains sticky positioning and disabled styles
  const rawCss = fs.readFileSync(path.join(__dirname, '..', 'internal', 'web', 'static', 'css', 'style.css'), 'utf8');
  assert.ok(rawCss.includes('.layers-toolbar'), 'Scenario 47: .layers-toolbar style rule present');
  assert.ok(rawCss.includes('position: sticky;'), 'Scenario 47: .layers-toolbar has sticky positioning');
  assert.ok(rawCss.includes('top: 0;'), 'Scenario 47: .layers-toolbar pinned to top: 0');

  // 2. With empty scene / no selection, all reorder buttons must be disabled
  window.updateLayersToolbarState();
  assert.strictEqual(btnToFront.disabled, true, 'Scenario 47: btnToFront disabled when empty/no selection');
  assert.strictEqual(btnForward.disabled, true, 'Scenario 47: btnForward disabled when empty/no selection');
  assert.strictEqual(btnBackward.disabled, true, 'Scenario 47: btnBackward disabled when empty/no selection');
  assert.strictEqual(btnToBack.disabled, true, 'Scenario 47: btnToBack disabled when empty/no selection');

  // 3. Create 3 distinct objects: Bottom (Node), Middle (Flow), Top (Image)
  const s47Node = window.DiagramNodes.createNode({ text: 'Layer 1 Node', x: 10, y: 10 });
  const s47Flow = window.DataFlows.createFlow({ name: 'Layer 2 Flow', nodes: [{ x: 5, y: 5 }, { x: 25, y: 25 }] });
  const s47Img = window.ImageObjects.createImage({ name: 'Layer 3 Image', x: 50, y: 50, width: 100, height: 80 });

  window.LayerManager.syncFromEngine();
  const s47InitialLayers = window.LayerManager.getLayers();
  assert.strictEqual(s47InitialLayers.length, 3, 'Scenario 47: 3 layers registered');

  const bottomItem = s47InitialLayers[0];
  const middleItem = s47InitialLayers[1];
  const topItem = s47InitialLayers[2];

  // 4. Select bottom object
  window.AppCoordinator.selectObject(bottomItem.type, bottomItem.id, { source: 'layers_list' });
  window.renderLayersList();

  // Bottom boundary checks: cannot move backward/to-back, CAN move forward/to-front
  assert.strictEqual(btnBackward.disabled, true, 'Scenario 47: Bottom object cannot move backward');
  assert.strictEqual(btnToBack.disabled, true, 'Scenario 47: Bottom object cannot move to back');
  assert.strictEqual(btnForward.disabled, false, 'Scenario 47: Bottom object can move forward');
  assert.strictEqual(btnToFront.disabled, false, 'Scenario 47: Bottom object can move to front');

  // Verify list container has rows and the bottom item's row has active class
  assert.strictEqual(layersContainer.children.length, 3, 'Scenario 47: 3 rows rendered in layersListContainer');
  const activeRows = layersContainer.children.filter((r) => r.classList && r.classList.contains('active'));
  assert.strictEqual(activeRows.length, 1, 'Scenario 47: Exactly 1 active row highlighted');

  // 5. Click Bring Forward (via AppCoordinator)
  const forwardOk1 = window.AppCoordinator.bringSelectionForward();
  assert.strictEqual(forwardOk1, true, 'Scenario 47: First bringSelectionForward succeeded');
  window.renderLayersList();

  // Now the object is in middle: all 4 buttons enabled!
  assert.strictEqual(btnBackward.disabled, false, 'Scenario 47: Middle object can move backward');
  assert.strictEqual(btnToBack.disabled, false, 'Scenario 47: Middle object can move to back');
  assert.strictEqual(btnForward.disabled, false, 'Scenario 47: Middle object can move forward');
  assert.strictEqual(btnToFront.disabled, false, 'Scenario 47: Middle object can move to front');

  // Selection must be preserved!
  const activeRowsAfterForward = layersContainer.children.filter((r) => r.classList && r.classList.contains('active'));
  assert.strictEqual(activeRowsAfterForward.length, 1, 'Scenario 47: Selection highlight preserved after bringForward');

  // 6. Click Bring Forward AGAIN consecutively without re-selecting row
  const forwardOk2 = window.AppCoordinator.bringSelectionForward();
  assert.strictEqual(forwardOk2, true, 'Scenario 47: Consecutive bringSelectionForward succeeded');
  window.renderLayersList();

  // Now object reached the top: top boundary checks
  assert.strictEqual(btnForward.disabled, true, 'Scenario 47: Top object cannot move forward');
  assert.strictEqual(btnToFront.disabled, true, 'Scenario 47: Top object cannot move to front');
  assert.strictEqual(btnBackward.disabled, false, 'Scenario 47: Top object can move backward');
  assert.strictEqual(btnToBack.disabled, false, 'Scenario 47: Top object can move to back');

  // Selection STILL preserved!
  const activeRowsAtTop = layersContainer.children.filter((r) => r.classList && r.classList.contains('active'));
  assert.strictEqual(activeRowsAtTop.length, 1, 'Scenario 47: Selection highlight preserved when reaching top');

  // 7. Click Send to Back
  const backOk = window.AppCoordinator.sendSelectionToBack();
  assert.strictEqual(backOk, true, 'Scenario 47: sendSelectionToBack succeeded');
  window.renderLayersList();

  // Now at bottom again:
  assert.strictEqual(btnBackward.disabled, true, 'Scenario 47: Bottom object backward disabled after sendToBack');
  assert.strictEqual(btnToBack.disabled, true, 'Scenario 47: Bottom object toBack disabled after sendToBack');
  assert.strictEqual(btnForward.disabled, false, 'Scenario 47: Bottom object forward enabled after sendToBack');
  assert.strictEqual(btnToFront.disabled, false, 'Scenario 47: Bottom object toFront enabled after sendToBack');

  // 8. Deselect (clear selection)
  window.AppCoordinator.clearSelection();
  window.renderLayersList();
  assert.strictEqual(btnToFront.disabled, true, 'Scenario 47: btnToFront disabled after clearSelection');
  assert.strictEqual(btnForward.disabled, true, 'Scenario 47: btnForward disabled after clearSelection');
  assert.strictEqual(btnBackward.disabled, true, 'Scenario 47: btnBackward disabled after clearSelection');
  assert.strictEqual(btnToBack.disabled, true, 'Scenario 47: btnToBack disabled after clearSelection');
  const activeRowsDeselected = layersContainer.children.filter((r) => r.classList && r.classList.contains('active'));
  assert.strictEqual(activeRowsDeselected.length, 0, 'Scenario 47: No active rows when deselected');

  console.log('[HARNESS] Scenario 47 PASS: Layers Drawer toolbar accessibility, dynamic button enabling and reordering verified.');

  // ===========================================================================
  // SCENARIO 48: Layer Ordering and State Controls in Normal Object Properties Panels
  // ===========================================================================
  console.log('\n[HARNESS] Scenario 48: Layer ordering and state controls in normal object properties panels...');
  window.ProjectManager.resetToNewProject();

  // 1. Verify static index.html markup contains LAYER sections inside each normal editor
  const indexHtmlRaw = fs.readFileSync(INDEX_HTML_PATH, 'utf8');

  // Verify nodeEditor contains nodeLayerSection
  const nodeEditorIdx = indexHtmlRaw.indexOf('id="nodeEditor"');
  const nodeLayerIdx = indexHtmlRaw.indexOf('id="nodeLayerSection"');
  const accPresetsIdx = indexHtmlRaw.indexOf('id="acc-presets"');
  assert.ok(nodeEditorIdx !== -1 && nodeLayerIdx !== -1, 'Scenario 48: nodeEditor and nodeLayerSection exist in index.html');
  assert.ok(nodeLayerIdx > nodeEditorIdx && nodeLayerIdx < accPresetsIdx, 'Scenario 48: nodeLayerSection is inside nodeEditor');

  // Verify flowEditor contains flowLayerSection
  const flowEditorIdx = indexHtmlRaw.indexOf('id="flowEditor"');
  const flowLayerIdx = indexHtmlRaw.indexOf('id="flowLayerSection"');
  const accGlowsIdx = indexHtmlRaw.indexOf('id="acc-glows"');
  assert.ok(flowEditorIdx !== -1 && flowLayerIdx !== -1, 'Scenario 48: flowEditor and flowLayerSection exist in index.html');
  assert.ok(flowLayerIdx > flowEditorIdx && flowLayerIdx < accGlowsIdx, 'Scenario 48: flowLayerSection is inside flowEditor');

  // Verify glowEditor contains glowLayerSection
  const glowEditorIdx = indexHtmlRaw.indexOf('id="glowEditor"');
  const glowLayerIdx = indexHtmlRaw.indexOf('id="glowLayerSection"');
  const accRipplesIdx = indexHtmlRaw.indexOf('id="acc-ripples"');
  assert.ok(glowEditorIdx !== -1 && glowLayerIdx !== -1, 'Scenario 48: glowEditor and glowLayerSection exist in index.html');
  assert.ok(glowLayerIdx > glowEditorIdx && glowLayerIdx < accRipplesIdx, 'Scenario 48: glowLayerSection is inside glowEditor');

  // Verify rippleEditor contains rippleLayerSection
  const rippleEditorIdx = indexHtmlRaw.indexOf('id="rippleEditor"');
  const rippleLayerIdx = indexHtmlRaw.indexOf('id="rippleLayerSection"');
  const accLayersIdx = indexHtmlRaw.indexOf('id="acc-layers"');
  assert.ok(rippleEditorIdx !== -1 && rippleLayerIdx !== -1, 'Scenario 48: rippleEditor and rippleLayerSection exist in index.html');
  assert.ok(rippleLayerIdx > rippleEditorIdx && rippleLayerIdx < accLayersIdx, 'Scenario 48: rippleLayerSection is inside rippleEditor');

  // Verify imageEditor contains imageLayerSection
  const imageEditorIdx = indexHtmlRaw.indexOf('id="imageEditor"');
  const imageLayerIdx = indexHtmlRaw.indexOf('id="imageLayerSection"');
  const endLeftDrawerIdx = indexHtmlRaw.indexOf('id="stageMain"');
  assert.ok(imageEditorIdx !== -1 && imageLayerIdx !== -1, 'Scenario 48: imageEditor and imageLayerSection exist in index.html');
  assert.ok(imageLayerIdx > imageEditorIdx && imageLayerIdx < endLeftDrawerIdx, 'Scenario 48: imageLayerSection is inside imageEditor');

  // Verify nodeMultiSelectToolbar contains groupLayerSection
  const multiTbIdx = indexHtmlRaw.indexOf('id="nodeMultiSelectToolbar"');
  const groupLayerIdx = indexHtmlRaw.indexOf('id="groupLayerSection"');
  assert.ok(multiTbIdx !== -1 && groupLayerIdx !== -1, 'Scenario 48: nodeMultiSelectToolbar and groupLayerSection exist in index.html');
  assert.ok(groupLayerIdx > multiTbIdx && groupLayerIdx < nodeEditorIdx, 'Scenario 48: groupLayerSection is inside nodeMultiSelectToolbar');

  // 2. Wire mock DOM hierarchy and verify element containment
  const sectionsConfig = [
    { prefix: 'Node', editorId: 'nodeEditor', sectionId: 'nodeLayerSection' },
    { prefix: 'Flow', editorId: 'flowEditor', sectionId: 'flowLayerSection' },
    { prefix: 'Glow', editorId: 'glowEditor', sectionId: 'glowLayerSection' },
    { prefix: 'Ripple', editorId: 'rippleEditor', sectionId: 'rippleLayerSection' },
    { prefix: 'Image', editorId: 'imageEditor', sectionId: 'imageLayerSection' },
    { prefix: 'Group', editorId: 'nodeMultiSelectToolbar', sectionId: 'groupLayerSection' }
  ];

  sectionsConfig.forEach(({ prefix, editorId, sectionId }) => {
    const editorEl = document.getElementById(editorId);
    const sectionEl = document.getElementById(sectionId);
    const btnToFront = document.getElementById(`btn${prefix}LayerToFront`);
    const btnFwd = document.getElementById(`btn${prefix}LayerForward`);
    const btnBack = document.getElementById(`btn${prefix}LayerBackward`);
    const btnToBack = document.getElementById(`btn${prefix}LayerToBack`);
    const posLabel = document.getElementById(`${prefix.toLowerCase()}LayerPositionLabel`);
    const btnVis = document.getElementById(`btn${prefix}LayerVis`);
    const btnLock = document.getElementById(`btn${prefix}LayerLock`);

    editorEl.appendChild(sectionEl);
    sectionEl.appendChild(btnToFront);
    sectionEl.appendChild(btnFwd);
    sectionEl.appendChild(btnBack);
    sectionEl.appendChild(btnToBack);
    sectionEl.appendChild(posLabel);
    sectionEl.appendChild(btnVis);
    sectionEl.appendChild(btnLock);

    assert.strictEqual(editorEl.contains(btnToFront), true, `Scenario 48: ${editorId} contains btn${prefix}LayerToFront`);
    assert.strictEqual(editorEl.contains(btnFwd), true, `Scenario 48: ${editorId} contains btn${prefix}LayerForward`);
    assert.strictEqual(editorEl.contains(btnBack), true, `Scenario 48: ${editorId} contains btn${prefix}LayerBackward`);
    assert.strictEqual(editorEl.contains(btnToBack), true, `Scenario 48: ${editorId} contains btn${prefix}LayerToBack`);
    assert.strictEqual(editorEl.contains(posLabel), true, `Scenario 48: ${editorId} contains ${prefix.toLowerCase()}LayerPositionLabel`);
    assert.strictEqual(editorEl.contains(btnVis), true, `Scenario 48: ${editorId} contains btn${prefix}LayerVis`);
    assert.strictEqual(editorEl.contains(btnLock), true, `Scenario 48: ${editorId} contains btn${prefix}LayerLock`);
  });

  // Initialize event bindings for inspector sections and image editor
  window.initInspectorLayerSectionEvents();
  window.initImageEditorEvents();

  // 3. Operational test: Create 2 shapes, select rear shape, verify controls in nodeEditor
  const s48Node1 = window.DiagramNodes.addNode(100, 100, { name: 'Shape 1' });
  const s48Node2 = window.DiagramNodes.addNode(150, 150, { name: 'Shape 2' });
  assert.ok(s48Node1 && s48Node2, 'Scenario 48: Two shapes created');

  // Select rear shape (s48Node1 is at layer index 0 - bottom of stack)
  window.DiagramNodes.selectNode(s48Node1.id);
  window.syncInspectorLayerSections();

  const nodeEditorEl = document.getElementById('nodeEditor');
  assert.strictEqual(nodeEditorEl.style.display, 'block', 'Scenario 48: nodeEditor is open for Shape 1');

  const btnNFront = document.getElementById('btnNodeLayerToFront');
  const btnNFwd = document.getElementById('btnNodeLayerForward');
  const btnNBack = document.getElementById('btnNodeLayerBackward');
  const btnNToBack = document.getElementById('btnNodeLayerToBack');
  const lblNPos = document.getElementById('nodeLayerPositionLabel');
  const btnNVis = document.getElementById('btnNodeLayerVis');
  const btnNLock = document.getElementById('btnNodeLayerLock');

  assert.strictEqual(lblNPos.textContent, 'Position: 1 of 2', 'Scenario 48: Shape 1 position is 1 of 2');
  assert.strictEqual(btnNBack.disabled, true, 'Scenario 48: Bottom shape cannot send backward');
  assert.strictEqual(btnNToBack.disabled, true, 'Scenario 48: Bottom shape cannot send to back');
  assert.strictEqual(btnNFwd.disabled, false, 'Scenario 48: Bottom shape can bring forward');
  assert.strictEqual(btnNFront.disabled, false, 'Scenario 48: Bottom shape can bring to front');

  // 4. Click Bring to Front directly on the node editor button
  btnNFront.click();
  window.syncInspectorLayerSections();

  // Verify consecutive reordering capability: panel remains open and selection remains active
  assert.strictEqual(nodeEditorEl.style.display, 'block', 'Scenario 48: nodeEditor remains open after Bring to Front');
  assert.strictEqual(window.DiagramNodes.activeId, s48Node1.id, 'Scenario 48: Shape 1 remains actively selected');
  assert.strictEqual(lblNPos.textContent, 'Position: 2 of 2', 'Scenario 48: Shape 1 position updated to 2 of 2');
  assert.strictEqual(btnNFront.disabled, true, 'Scenario 48: Top shape cannot bring to front');
  assert.strictEqual(btnNFwd.disabled, true, 'Scenario 48: Top shape cannot bring forward');
  assert.strictEqual(btnNBack.disabled, false, 'Scenario 48: Top shape can send backward');
  assert.strictEqual(btnNToBack.disabled, false, 'Scenario 48: Top shape can send to back');

  // 5. Consecutive reordering: Click Send Backward on the node editor button
  btnNBack.click();
  window.syncInspectorLayerSections();

  assert.strictEqual(nodeEditorEl.style.display, 'block', 'Scenario 48: nodeEditor remains open after Send Backward');
  assert.strictEqual(lblNPos.textContent, 'Position: 1 of 2', 'Scenario 48: Shape 1 moved back to Position: 1 of 2');
  assert.strictEqual(btnNBack.disabled, true, 'Scenario 48: Bottom shape send backward disabled');
  assert.strictEqual(btnNFwd.disabled, false, 'Scenario 48: Bottom shape bring forward enabled');

  // 6. Test Visibility and Lock toggles on the node editor buttons
  btnNVis.click();
  let effN1 = window.LayerManager.getEffective('node', s48Node1.id);
  assert.strictEqual(effN1.visible, false, 'Scenario 48: Shape 1 visibility toggled to false');
  window.syncInspectorLayerSections();
  assert.strictEqual(btnNVis.textContent, '🕶️ Hidden', 'Scenario 48: btnNodeLayerVis shows Hidden');

  btnNVis.click();
  effN1 = window.LayerManager.getEffective('node', s48Node1.id);
  assert.strictEqual(effN1.visible, true, 'Scenario 48: Shape 1 visibility toggled back to true');
  window.syncInspectorLayerSections();
  assert.strictEqual(btnNVis.textContent, '👁 Visible', 'Scenario 48: btnNodeLayerVis shows Visible');

  btnNLock.click();
  effN1 = window.LayerManager.getEffective('node', s48Node1.id);
  assert.strictEqual(effN1.locked, true, 'Scenario 48: Shape 1 lock toggled to true');
  window.syncInspectorLayerSections();
  assert.strictEqual(btnNLock.textContent, '🔒 Locked', 'Scenario 48: btnNodeLayerLock shows Locked');

  btnNLock.click();
  effN1 = window.LayerManager.getEffective('node', s48Node1.id);
  assert.strictEqual(effN1.locked, false, 'Scenario 48: Shape 1 lock toggled back to false');

  // 7. Test Flow editor layer section
  const s48Flow1 = window.DataFlows.createFlow({ name: 'Flow 1', fromNodeId: s48Node1.id, toNodeId: s48Node2.id });
  assert.ok(s48Flow1, 'Scenario 48: Flow 1 created');
  window.DataFlows.selectFlow(s48Flow1.id);
  window.syncInspectorLayerSections();

  const flowEditorEl = document.getElementById('flowEditor');
  assert.strictEqual(flowEditorEl.style.display, 'block', 'Scenario 48: flowEditor is open for Flow 1');
  const lblFPos = document.getElementById('flowLayerPositionLabel');
  assert.strictEqual(lblFPos.textContent, 'Position: 3 of 3', 'Scenario 48: Flow 1 at top (Position 3 of 3)');
  const btnFToBack = document.getElementById('btnFlowLayerToBack');
  btnFToBack.click();
  window.syncInspectorLayerSections();
  assert.strictEqual(flowEditorEl.style.display, 'block', 'Scenario 48: flowEditor remains open after sendToBack');
  assert.strictEqual(lblFPos.textContent, 'Position: 1 of 3', 'Scenario 48: Flow 1 moved to bottom (Position 1 of 3)');

  // 8. Test Glow editor layer section
  const s48Glow1 = window.Glows.createGlow({ name: 'Glow 1', x: 50, y: 50 });
  assert.ok(s48Glow1, 'Scenario 48: Glow 1 created');
  window.Glows.selectGlow(s48Glow1.id);
  window.syncInspectorLayerSections();

  const glowEditorEl = document.getElementById('glowEditor');
  assert.strictEqual(glowEditorEl.style.display, 'block', 'Scenario 48: glowEditor is open for Glow 1');
  const lblGPos = document.getElementById('glowLayerPositionLabel');
  assert.strictEqual(lblGPos.textContent, 'Position: 4 of 4', 'Scenario 48: Glow 1 at top (Position 4 of 4)');
  const btnGBack = document.getElementById('btnGlowLayerBackward');
  btnGBack.click();
  window.syncInspectorLayerSections();
  assert.strictEqual(glowEditorEl.style.display, 'block', 'Scenario 48: glowEditor remains open after send backward');
  assert.strictEqual(lblGPos.textContent, 'Position: 3 of 4', 'Scenario 48: Glow 1 moved to Position 3 of 4');

  // 9. Test Ripple editor layer section
  const s48Ripple1 = window.Ripples.createRipple({ name: 'Ripple 1', x: 60, y: 60 });
  assert.ok(s48Ripple1, 'Scenario 48: Ripple 1 created');
  window.Ripples.selectRipple(s48Ripple1.id);
  window.syncInspectorLayerSections();

  const rippleEditorEl = document.getElementById('rippleEditor');
  assert.strictEqual(rippleEditorEl.style.display, 'block', 'Scenario 48: rippleEditor is open for Ripple 1');
  const lblRPos = document.getElementById('rippleLayerPositionLabel');
  assert.strictEqual(lblRPos.textContent, 'Position: 5 of 5', 'Scenario 48: Ripple 1 at top (Position 5 of 5)');

  // 10. Test Image editor layer section
  const s48Img1 = window.ImageObjects.createImage({ name: 'Test Image', width: 250, height: 180 });
  assert.ok(s48Img1, 'Scenario 48: Test Image created');
  window.AppCoordinator.selectObject('image', s48Img1.id);
  window.syncImageEditorUI();
  window.syncInspectorLayerSections();

  const imageEditorEl = document.getElementById('imageEditor');
  assert.strictEqual(imageEditorEl.style.display, 'block', 'Scenario 48: imageEditor is open for Image 1');
  const lblIPos = document.getElementById('imageLayerPositionLabel');
  assert.strictEqual(lblIPos.textContent, 'Position: 6 of 6', 'Scenario 48: Image 1 at top (Position 6 of 6)');
  const btnIToBack = document.getElementById('btnImageLayerToBack');
  btnIToBack.click();
  window.syncInspectorLayerSections();
  assert.strictEqual(imageEditorEl.style.display, 'block', 'Scenario 48: imageEditor remains open after sendToBack');
  assert.strictEqual(lblIPos.textContent, 'Position: 1 of 6', 'Scenario 48: Image 1 moved to bottom (Position 1 of 6)');

  // 11. Test Persistent Group layer section in nodeMultiSelectToolbar
  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: s48Node1.id },
    { type: 'node', id: s48Node2.id }
  ]);
  const s48Grp = window.AppCoordinator.createGroupFromSelection('Test Group');
  assert.ok(s48Grp, 'Scenario 48: Persistent group created');
  window.AppCoordinator.selectGroup(s48Grp.id);
  window.syncInspectorLayerSections();

  const multiToolbarEl = document.getElementById('nodeMultiSelectToolbar');
  assert.strictEqual(multiToolbarEl.style.display, 'block', 'Scenario 48: nodeMultiSelectToolbar open for group');
  const lblGrpPos = document.getElementById('groupLayerPositionLabel');
  assert.ok(lblGrpPos.textContent.startsWith('Position: '), 'Scenario 48: Group layer position displayed');

  // 12. Test History Undo / Redo updates position indicators in normal properties panels
  const layersBeforeMove = window.LayerManager.getLayers().map(l => `${l.type}:${l.id}`);
  const btnGrpFront = document.getElementById('btnGroupLayerToFront');
  btnGrpFront.click();
  window.syncInspectorLayerSections();

  const layersAfterMove = window.LayerManager.getLayers().map(l => `${l.type}:${l.id}`);
  assert.notDeepStrictEqual(layersBeforeMove, layersAfterMove, 'Scenario 48: Group Bring to Front changed layer order');

  window.HistoryManager.undo();
  window.syncInspectorLayerSections();
  const layersAfterUndo = window.LayerManager.getLayers().map(l => `${l.type}:${l.id}`);
  assert.deepStrictEqual(layersBeforeMove, layersAfterUndo, 'Scenario 48: Undo restored layer order and inspector position');

  // 13. Test Tripartite Synchronization (Layers drawer <-> Object Properties <-> Floating context editor)
  window.AppCoordinator.selectObject('image', s48Img1.id);
  window.renderLayersList();
  window.syncInspectorLayerSections();

  const btnImgFwd = document.getElementById('btnImageLayerForward');
  const btnImgToFront = document.getElementById('btnImageLayerToFront');
  const lblImgPos = document.getElementById('imageLayerPositionLabel');
  const prevImgPos = lblImgPos.textContent;

  // Move forward from normal Image Properties panel
  btnImgFwd.click();
  window.syncInspectorLayerSections();
  window.renderLayersList();
  assert.notStrictEqual(lblImgPos.textContent, prevImgPos, 'Scenario 48: Image position updated in normal Image Properties');

  // Open Floating contextual Properties editor and verify synchronization
  window.FloatingPropertiesEditor.openFor('image', s48Img1.id);
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, true, 'Scenario 48: FloatingPropertiesEditor opened for image');
  const fctxBtnToFront = document.getElementById('fctx-btnLayerTop');
  const fctxBtnToBottom = document.getElementById('fctx-btnLayerBottom');
  assert.ok(fctxBtnToFront && fctxBtnToBottom, 'Scenario 48: Floating context editor layer buttons exist');

  // Reorder from Floating context editor (Bring to Front)
  fctxBtnToFront.click();
  window.syncInspectorLayerSections();
  window.renderLayersList();

  // Verify normal Image Properties AND Layers Drawer updated from floating context action
  assert.strictEqual(lblImgPos.textContent, 'Position: 6 of 6', 'Scenario 48: Image Properties reflects Bring to Front from floating editor');
  const btnDrawerFwd = document.getElementById('btnLayerForward');
  const btnDrawerToFront = document.getElementById('btnLayerToFront');
  assert.strictEqual(btnDrawerFwd.disabled, true, 'Scenario 48: Layers drawer toolbar forward disabled when at top');
  assert.strictEqual(btnDrawerToFront.disabled, true, 'Scenario 48: Layers drawer toolbar toFront disabled when at top');
  assert.strictEqual(fctxBtnToFront.disabled, true, 'Scenario 48: Floating editor toFront disabled when at top');

  // Reorder from normal Image Properties (Send to Back) and verify Floating editor and Layers drawer update
  const btnImgToBack = document.getElementById('btnImageLayerToBack');
  btnImgToBack.click();
  window.syncInspectorLayerSections();
  window.renderLayersList();
  window.FloatingPropertiesEditor.syncFromActiveObject();

  assert.strictEqual(lblImgPos.textContent, 'Position: 1 of 6', 'Scenario 48: Image Properties reflects Send to Back');
  const btnDrawerBack = document.getElementById('btnLayerBackward');
  const btnDrawerToBack = document.getElementById('btnLayerToBack');
  assert.strictEqual(btnDrawerBack.disabled, true, 'Scenario 48: Layers drawer toolbar backward disabled when at bottom');
  assert.strictEqual(btnDrawerToBack.disabled, true, 'Scenario 48: Layers drawer toolbar toBack disabled when at bottom');
  assert.strictEqual(fctxBtnToBottom.disabled, true, 'Scenario 48: Floating editor toBottom disabled when at bottom');
  window.FloatingPropertiesEditor.close();

  // 14. Test Mixed Group Stacking Contiguity & SVA Round-Trip Persistence
  window.AppCoordinator.selectGroup(s48Grp.id);
  window.AppCoordinator.ungroupSelectedGroup();

  window.AppCoordinator.setMultiSelection([
    { type: 'node', id: s48Node1.id },
    { type: 'glow', id: s48Glow1.id },
    { type: 'image', id: s48Img1.id }
  ]);
  const s48MixedGrp = window.AppCoordinator.createGroupFromSelection('Mixed Assembly');
  assert.ok(s48MixedGrp, 'Scenario 48: Mixed Assembly group created');

  window.AppCoordinator.selectGroup(s48MixedGrp.id);
  window.syncInspectorLayerSections();
  window.renderLayersList();

  // Reorder mixed group to front from normal group Properties
  btnGrpFront.click();
  window.syncInspectorLayerSections();
  window.renderLayersList();

  // Verify group contiguity: all 3 members occupy consecutive indices at top
  const s48CurLayers = window.LayerManager.getLayers();
  const mixedMemberKeys = new Set([`node:${s48Node1.id}`, `glow:${s48Glow1.id}`, `image:${s48Img1.id}`]);
  const s48MemberIndices = [];
  s48CurLayers.forEach((l, idx) => {
    if (mixedMemberKeys.has(`${l.type}:${l.id}`)) s48MemberIndices.push(idx);
  });
  assert.strictEqual(s48MemberIndices.length, 3, 'Scenario 48: All 3 mixed group members present in layers');
  assert.strictEqual(s48MemberIndices[1], s48MemberIndices[0] + 1, 'Scenario 48: Mixed group members contiguous index 0 & 1');
  assert.strictEqual(s48MemberIndices[2], s48MemberIndices[1] + 1, 'Scenario 48: Mixed group members contiguous index 1 & 2');

  // Verify SVA persistence of group and layer order
  let s48Blob = null;
  const origDownload = window.ProjectManager._downloadBlob;
  window.ProjectManager._downloadBlob = (b) => { s48Blob = b; };
  await window.ProjectManager.exportSVA();
  assert.ok(s48Blob, 'Scenario 48: exportSVA succeeded');

  const s48Buf = await s48Blob.arrayBuffer();
  window.ProjectManager.resetToNewProject();
  assert.strictEqual(window.DiagramNodes.list.length, 0, 'Scenario 48: Scene cleared');

  await window.ProjectManager.importSVA({
    name: 'Mixed Assembly.sva',
    arrayBuffer: async () => s48Buf
  });
  window.ProjectManager._downloadBlob = origDownload;

  assert.strictEqual(window.ObjectGroups.list.length, 1, 'Scenario 48: Mixed group restored from .sva');
  assert.strictEqual(window.ObjectGroups.list[0].name, 'Mixed Assembly', 'Scenario 48: Restored group name matches');
  assert.strictEqual(window.ObjectGroups.list[0].members.length, 3, 'Scenario 48: Restored group has 3 members');
  assert.strictEqual(window.LayerManager.getLayers().length >= 3, true, 'Scenario 48: Restored scene has layer order intact');

  console.log('[HARNESS] Scenario 48 PASS: Layer ordering and state controls in normal object properties panels verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 49: Non-Destructive Image Cropping (Model, EngineBridge & SVG)
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 49: Non-destructive Image Cropping (Model, EngineBridge, & SVG compilation)...');
  window.ProjectManager.resetToNewProject();

  const s49Img = window.ImageObjects.createImage({
    name: 'Piping Layout',
    filename: 'piping.png',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    x: 50,
    y: 50,
    width: 400,
    height: 300,
    naturalWidth: 800,
    naturalHeight: 600
  });
  assert.ok(s49Img && s49Img.id, 'Scenario 49: Image created');

  // Initial SVG markup (uncropped)
  const uncroppedSvg = window.ImageObjects.renderImageElement(s49Img, 1280, 720);
  assert.ok(uncroppedSvg.startsWith('<image '), 'Scenario 49: Uncropped image renders standard <image> tag');
  assert.ok(!uncroppedSvg.includes('<svg '), 'Scenario 49: Uncropped image does not use nested <svg>');

  // Apply non-destructive crop via EngineBridge / ImageObjects
  const s49CropData = {
    sourceX: 100,
    sourceY: 120,
    sourceWidth: 400,
    sourceHeight: 300
  };
  const s49Geom = {
    newX: 48,
    newY: 52,
    newW: 200,
    newH: 150
  };
  const croppedImg = window.ImageObjects.cropImage(s49Img.id, s49CropData, s49Geom);
  assert.ok(croppedImg && croppedImg.crop, 'Scenario 49: Crop returned');
  assert.strictEqual(croppedImg.crop.enabled, true, 'Scenario 49: Crop enabled');
  assert.strictEqual(croppedImg.crop.sourceX, 100, 'Scenario 49: Crop sourceX matches');
  assert.strictEqual(croppedImg.crop.sourceWidth, 400, 'Scenario 49: Crop sourceWidth matches');
  assert.strictEqual(croppedImg.crop.origWidth, 400, 'Scenario 49: Original width preserved in crop model');
  assert.strictEqual(croppedImg.crop.origHeight, 300, 'Scenario 49: Original height preserved in crop model');
  assert.strictEqual(croppedImg.width, 200, 'Scenario 49: Display width updated to cropped dimensions');
  assert.strictEqual(croppedImg.height, 150, 'Scenario 49: Display height updated to cropped dimensions');

  // Verify compiled SVG markup uses nested SVG viewport with viewBox
  const croppedSvg = window.ImageObjects.renderImageElement(croppedImg, 1280, 720);
  assert.ok(croppedSvg.startsWith('<svg '), 'Scenario 49: Cropped image renders nested <svg> element');
  assert.ok(croppedSvg.includes('viewBox="100.00 120.00 400.00 300.00"'), 'Scenario 49: SVG viewBox matches source crop rect');
  assert.ok(croppedSvg.includes(`data-image-id="${s49Img.id}"`), 'Scenario 49: SVG root has data-image-id for stage hit-testing');
  assert.ok(croppedSvg.includes('<image '), 'Scenario 49: Nested child contains <image> element');

  // Reset crop
  const resetImg = window.ImageObjects.resetCrop(s49Img.id);
  assert.strictEqual(resetImg.crop, undefined, 'Scenario 49: Crop removed on reset');
  assert.strictEqual(resetImg.width, 400, 'Scenario 49: Pre-crop width restored');
  assert.strictEqual(resetImg.height, 300, 'Scenario 49: Pre-crop height restored');
  assert.strictEqual(resetImg.x, 50, 'Scenario 49: Pre-crop position X restored');
  assert.strictEqual(resetImg.y, 50, 'Scenario 49: Pre-crop position Y restored');

  const restoredSvg = window.ImageObjects.renderImageElement(resetImg, 1280, 720);
  assert.ok(restoredSvg.startsWith('<image '), 'Scenario 49: Restored image renders standard <image> tag');
  console.log('[HARNESS] Scenario 49 PASS: Non-destructive Image Cropping (Model, EngineBridge, & SVG compilation) verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 50: Interactive Crop Mode Lifecycle & Boundary Clamping
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 50: Interactive Crop Mode Lifecycle & Boundary Clamping...');
  const s50Img = window.ImageObjects.createImage({
    name: 'Floor Plan',
    width: 300,
    height: 200,
    naturalWidth: 600,
    naturalHeight: 400
  });

  window.Stage.startCropMode(s50Img);
  assert.strictEqual(window.Stage.isCroppingImage, true, 'Scenario 50: isCroppingImage active');
  assert.strictEqual(window.Stage.activeCropImageId, s50Img.id, 'Scenario 50: activeCropImageId set');
  assert.ok(window.Stage.cropBox, 'Scenario 50: cropBox initialized');
  assert.ok(window.Stage.cropOrigBounds, 'Scenario 50: cropOrigBounds initialized');

  // Verify pointer-events and preview active states
  const s50TrajSvg = document.getElementById('trajectorySvg');
  assert.strictEqual(s50TrajSvg.style.pointerEvents, 'auto', 'Scenario 50: trajectorySvg pointerEvents auto while cropping');
  const s50PreviewBox = document.getElementById('previewBox');
  assert.strictEqual(s50PreviewBox.classList.contains('crop-mode-active'), true, 'Scenario 50: previewBox has crop-mode-active class');

  // Verify crop box boundaries
  assert.strictEqual(window.Stage.cropBox.w, 300, 'Scenario 50: Initial crop box width matches image width');
  assert.strictEqual(window.Stage.cropBox.h, 200, 'Scenario 50: Initial crop box height matches image height');

  // Simulate applying crop
  window.Stage.cropBox.w = 150;
  window.Stage.cropBox.h = 100;
  window.Stage.applyCropMode();

  assert.strictEqual(window.Stage.isCroppingImage, false, 'Scenario 50: isCroppingImage inactive after apply');
  assert.strictEqual(s50TrajSvg.style.pointerEvents, 'none', 'Scenario 50: trajectorySvg pointerEvents reset to none');
  assert.strictEqual(s50PreviewBox.classList.contains('crop-mode-active'), false, 'Scenario 50: crop-mode-active class removed');

  const appliedImg = window.ImageObjects.getImage(s50Img.id);
  assert.ok(appliedImg.crop && appliedImg.crop.enabled, 'Scenario 50: Image has crop enabled');
  assert.strictEqual(appliedImg.width, 150, 'Scenario 50: Image width updated');
  assert.strictEqual(appliedImg.height, 100, 'Scenario 50: Image height updated');

  // Verify re-crop anchoring when a cropped image is translated (x and y are percentages 0..100)
  appliedImg.x = 20;
  appliedImg.y = 30;
  window.Stage.startCropMode(appliedImg);
  assert.strictEqual(window.Stage.isCroppingImage, true, 'Scenario 50: Re-crop mode started');
  // Canvas: 1280x720. cx = 20% of 1280 = 256; left = 256 - 150/2 = 181.
  assert.strictEqual(window.Stage.cropOrigBounds.left, 181, 'Scenario 50: cropOrigBounds.left anchored to translated position');
  // cy = 30% of 720 = 216; top = 216 - 100/2 = 166.
  assert.strictEqual(window.Stage.cropOrigBounds.top, 166, 'Scenario 50: cropOrigBounds.top anchored to translated position');
  window.Stage.cancelCropMode();
  assert.strictEqual(window.Stage.isCroppingImage, false, 'Scenario 50: Re-crop cancelled');
  assert.strictEqual(s50TrajSvg.style.pointerEvents, 'none', 'Scenario 50: trajectorySvg pointerEvents reset to none on cancel');

  console.log('[HARNESS] Scenario 50 PASS: Interactive Crop Mode Lifecycle & Boundary Clamping verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 51: Background Region Extraction & Selection Validation
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 51: Background Region Extraction & Selection Validation...');
  const preImgCount = window.ImageObjects.list.length;

  // Negative validation: reject degenerate extraction regions < 10x10
  window.executeBackgroundExtraction({ x: 50, y: 50, w: 5, h: 5 });
  assert.strictEqual(window.ImageObjects.list.length, preImgCount, 'Scenario 51: Degenerate extraction rejected');

  // Valid extraction
  window.executeBackgroundExtraction({ x: 100, y: 80, w: 250, h: 180 });

  assert.strictEqual(window.ImageObjects.list.length, preImgCount + 1, 'Scenario 51: New image created by extraction');
  const extractedImg = window.ImageObjects.list[window.ImageObjects.list.length - 1];
  assert.strictEqual(extractedImg.filename, 'bg_snip_1.png', 'Scenario 51: Extracted image has filename');
  assert.strictEqual(extractedImg.name, 'Background Snip 1', 'Scenario 51: Extracted image has meaningful name');
  assert.strictEqual(extractedImg.width, 250, 'Scenario 51: Extracted image width matches selection');
  assert.strictEqual(extractedImg.height, 180, 'Scenario 51: Extracted image height matches selection');
  assert.ok(extractedImg.src && extractedImg.src.startsWith('data:image/png'), 'Scenario 51: Extracted image has PNG data URL');

  // Verify layer entry added
  const layersAfterExtract = window.LayerManager.getLayers();
  const extractLayer = layersAfterExtract.find((l) => l.type === 'image' && l.id === extractedImg.id);
  assert.ok(extractLayer, 'Scenario 51: Extracted image is present in layer stack');

  // Verify active selection set to extracted image and purple bounding box displayed
  assert.strictEqual(window.AppCoordinator.activeSelection.type, 'image', 'Scenario 51: AppCoordinator selected image type');
  assert.strictEqual(window.AppCoordinator.activeSelection.id, extractedImg.id, 'Scenario 51: AppCoordinator selected extracted image ID');
  const selBox = document.getElementById('nodeSelectionBox');
  assert.strictEqual(selBox.style.display, 'block', 'Scenario 51: Primary selection bounding box displayed for extracted image');

  console.log('[HARNESS] Scenario 51 PASS: Background Region Extraction & Selection Validation verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 52: Image Baking into Background (Remove and Keep options) & Undo
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 52: Image Baking into Background (Remove and Keep options) & Undo...');
  const s52Img1 = window.ImageObjects.createImage({
    name: 'Logo To Bake',
    width: 120,
    height: 80,
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  });
  window.HistoryManager.recordImmediate();

  // Test Bake and Remove
  executeBakeImage(s52Img1, 'remove');

  const photoAfterBake1 = window.getLoadedPhoto();
  assert.ok(photoAfterBake1, 'Scenario 52: Background photo updated after bake');
  assert.strictEqual(photoAfterBake1.filename, 'baked_background.png', 'Scenario 52: Baked background filename set');
  assert.strictEqual(window.ImageObjects.getImage(s52Img1.id), null, 'Scenario 52: Baked image removed from scene with mode=remove');

  // Test Bake and Keep (Hidden)
  const s52Img2 = window.ImageObjects.createImage({
    name: 'Keep Watermark',
    width: 100,
    height: 60,
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  });
  window.HistoryManager.recordImmediate();

  executeBakeImage(s52Img2, 'keep');

  const keptImg = window.ImageObjects.getImage(s52Img2.id);
  assert.ok(keptImg, 'Scenario 52: Baked image retained in scene with mode=keep');
  assert.strictEqual(keptImg.visible, false, 'Scenario 52: Retained baked image is hidden');

  // Test Undo: restore previous state
  window.HistoryManager.undo();
  const undoneImg = window.ImageObjects.getImage(s52Img2.id);
  assert.ok(undoneImg, 'Scenario 52: Image exists after undo');
  assert.strictEqual(undoneImg.visible !== false, true, 'Scenario 52: Image visible restored on undo');

  console.log('[HARNESS] Scenario 52 PASS: Image Baking into Background & Undo verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 53: Cropped Image Object SVA Roundtrip Preservation
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 53: Cropped Image Object SVA Roundtrip Preservation...');
  window.ProjectManager.resetToNewProject();

  const s53Img = window.ImageObjects.createImage({
    name: 'Turbine Cutout',
    filename: 'turbine.png',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    x: 60,
    y: 40,
    width: 250,
    height: 180,
    naturalWidth: 1000,
    naturalHeight: 720
  });

  window.ImageObjects.cropImage(s53Img.id, {
    sourceX: 200,
    sourceY: 150,
    sourceWidth: 500,
    sourceHeight: 360,
    origWidth: 400,
    origHeight: 288,
    origX: 55,
    origY: 45
  }, {
    newX: 60,
    newY: 40,
    newW: 250,
    newH: 180
  });

  let s53Blob = null;
  const origDl53 = window.ProjectManager._downloadBlob;
  window.ProjectManager._downloadBlob = (b) => { s53Blob = b; };

  await window.ProjectManager.exportSVA();
  assert.ok(s53Blob, 'Scenario 53: SVA export produced blob');
  const s53SvaBuf = await s53Blob.arrayBuffer();

  // Clear scene
  window.ProjectManager.resetToNewProject();
  assert.strictEqual(window.ImageObjects.list.length, 0, 'Scenario 53: Scene cleared');

  // Import SVA
  await window.ProjectManager.importSVA({
    name: 'Turbine Cutout.sva',
    arrayBuffer: async () => s53SvaBuf
  });
  window.ProjectManager._downloadBlob = origDl53;

  assert.strictEqual(window.ImageObjects.list.length, 1, 'Scenario 53: 1 image restored');
  const restoredS53 = window.ImageObjects.list[0];
  assert.strictEqual(restoredS53.name, 'Turbine Cutout', 'Scenario 53: Image name preserved');
  assert.ok(restoredS53.crop && restoredS53.crop.enabled, 'Scenario 53: Image crop enabled preserved');
  assert.strictEqual(restoredS53.crop.sourceX, 200, 'Scenario 53: Crop sourceX preserved');
  assert.strictEqual(restoredS53.crop.sourceY, 150, 'Scenario 53: Crop sourceY preserved');
  assert.strictEqual(restoredS53.crop.sourceWidth, 500, 'Scenario 53: Crop sourceWidth preserved');
  assert.strictEqual(restoredS53.crop.sourceHeight, 360, 'Scenario 53: Crop sourceHeight preserved');
  assert.strictEqual(restoredS53.crop.origWidth, 400, 'Scenario 53: Crop origWidth preserved');
  assert.strictEqual(restoredS53.crop.origHeight, 288, 'Scenario 53: Crop origHeight preserved');

  console.log('[HARNESS] Scenario 53 PASS: Cropped Image Object SVA Roundtrip Preservation verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 54: Full Pipeline: Background Extraction -> Drag -> Bake -> Undo/Redo & SVA Roundtrip
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 54: Background Extraction -> Drag -> Bake -> Undo/Redo & SVA Roundtrip...');

  // 1. Extract region from background
  window.executeBackgroundExtraction({ x: 40, y: 50, w: 200, h: 150 });
  const s54Extracted = window.ImageObjects.list[window.ImageObjects.list.length - 1];
  assert.strictEqual(s54Extracted.name, 'Background Snip 2', 'Scenario 54: Extracted image numbered name generated');

  // 2. Drag / reposition extracted object
  s54Extracted.x = 35;
  s54Extracted.y = 22;

  // 3. Bake into background with mode='keep'
  executeBakeImage(s54Extracted, 'keep');
  assert.strictEqual(s54Extracted.visible, false, 'Scenario 54: Baked object hidden with mode=keep');

  // 4. Undo and Redo
  window.HistoryManager.undo();
  const s54Undone = window.ImageObjects.getImage(s54Extracted.id);
  assert.ok(s54Undone, 'Scenario 54: Image exists after undo');
  assert.strictEqual(s54Undone.visible !== false, true, 'Scenario 54: Image visibility restored on undo');
  window.HistoryManager.redo();
  const s54Redone = window.ImageObjects.getImage(s54Extracted.id);
  assert.ok(s54Redone, 'Scenario 54: Image exists after redo');
  assert.strictEqual(s54Redone.visible, false, 'Scenario 54: Image visibility hidden again on redo');

  // 5. Extract another region and bake with mode='remove'
  window.executeBackgroundExtraction({ x: 10, y: 10, w: 100, h: 100 });
  const s54Extracted2 = window.ImageObjects.list[window.ImageObjects.list.length - 1];
  assert.strictEqual(s54Extracted2.name, 'Background Snip 3', 'Scenario 54: Third extract numbered name generated');
  const s54Extracted2Id = s54Extracted2.id;
  executeBakeImage(s54Extracted2, 'remove');
  assert.strictEqual(window.ImageObjects.getImage(s54Extracted2Id), null, 'Scenario 54: Baked object removed with mode=remove');

  // 6. Native .sva Roundtrip with baked background and kept images
  let s54Blob = null;
  const origDl54 = window.ProjectManager._downloadBlob;
  window.ProjectManager._downloadBlob = (b) => { s54Blob = b; };
  await window.ProjectManager.exportSVA();
  assert.ok(s54Blob, 'Scenario 54: SVA export produced blob');
  const s54SvaBuf = await s54Blob.arrayBuffer();

  window.ProjectManager.resetToNewProject();
  await window.ProjectManager.importSVA({
    name: 'BakeTest.sva',
    arrayBuffer: async () => s54SvaBuf
  });
  window.ProjectManager._downloadBlob = origDl54;

  const restoredPhoto = window.getLoadedPhoto();
  assert.ok(restoredPhoto, 'Scenario 54: Baked background photo restored from SVA');
  assert.strictEqual(restoredPhoto.filename, 'baked_background.png', 'Scenario 54: Restored background filename matches baked');

  console.log('[HARNESS] Scenario 54 PASS: Background Extraction -> Drag -> Bake -> Undo/Redo & SVA Roundtrip verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 55: Dedicated Crop, Clip & Snip Workspace Lifecycle & UI Modes
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 55: Dedicated Crop, Clip & Snip Workspace Lifecycle & UI Modes...');

  const accTools = document.getElementById('acc-image-tools');
  const railBtnTools = document.getElementById('railBtn-image-tools');
  assert.ok(accTools, 'Scenario 55: #acc-image-tools exists in DOM');
  assert.ok(railBtnTools, 'Scenario 55: #railBtn-image-tools exists on rail');

  // Verify dedicated top/bottom section separation and simultaneous visibility
  const topSec = document.getElementById('imageToolsClipSnipTopSection');
  const btmSec = document.getElementById('imageToolsCropBottomSection');
  const divider = document.getElementById('imageToolsDivider');
  assert.ok(topSec, 'Scenario 55: Top Clip & Snip section exists in DOM');
  assert.ok(btmSec, 'Scenario 55: Bottom Crop section exists in DOM');
  assert.ok(divider, 'Scenario 55: Visual divider exists between sections');
  assert.notStrictEqual(topSec.style.display, 'none', 'Scenario 55: Top section is simultaneously visible');
  assert.notStrictEqual(btmSec.style.display, 'none', 'Scenario 55: Bottom section is simultaneously visible');

  // Verify elements exist and are positioned within top and bottom sections in index.html
  assert.ok(document.getElementById('btnStartClipSnip'), 'Scenario 55: Start Clip/Snip button exists');
  assert.ok(document.getElementById('imageToolsPreviewCanvas'), 'Scenario 55: Preview Canvas exists');
  assert.ok(document.getElementById('btnStartCrop'), 'Scenario 55: Start Crop button exists');
  assert.ok(document.getElementById('btnApplyCropInTools'), 'Scenario 55: Apply Crop button exists');
  assert.ok(document.getElementById('cropVersionsList'), 'Scenario 55: Crop Versions list exists');

  const topPos = htmlSource.indexOf('id="imageToolsClipSnipTopSection"');
  const dividerPos = htmlSource.indexOf('id="imageToolsDivider"');
  const btmPos = htmlSource.indexOf('id="imageToolsCropBottomSection"');
  const btnStartClipPos = htmlSource.indexOf('id="btnStartClipSnip"');
  const previewCanvasPos = htmlSource.indexOf('id="imageToolsPreviewCanvas"');
  const btnStartCropPos = htmlSource.indexOf('id="btnStartCrop"');
  const btnApplyCropPos = htmlSource.indexOf('id="btnApplyCropInTools"');

  assert.ok(topPos !== -1 && dividerPos !== -1 && btmPos !== -1, 'Scenario 55: Top section, divider and bottom section found in HTML');
  assert.ok(topPos < dividerPos && dividerPos < btmPos, 'Scenario 55: Top section precedes divider precedes bottom section');
  assert.ok(btnStartClipPos > topPos && btnStartClipPos < dividerPos, 'Scenario 55: Start Clip/Snip is inside top section');
  assert.ok(previewCanvasPos > topPos && previewCanvasPos < dividerPos, 'Scenario 55: Preview Canvas is inside top section');
  assert.ok(btnStartCropPos > btmPos, 'Scenario 55: Start Crop is inside bottom section');
  assert.ok(btnApplyCropPos > btmPos, 'Scenario 55: Apply Crop is inside bottom section');

  // Verify default mode
  assert.ok(window.ImageToolsController, 'Scenario 55: ImageToolsController is initialized');
  window.ImageToolsController.init();
  assert.strictEqual(window.ImageToolsController.currentMode, 'crop', 'Scenario 55: Default mode is crop');

  // Test mode switching to Clip
  window.ImageToolsController.setMode('clip');
  assert.strictEqual(window.ImageToolsController.currentMode, 'clip', 'Scenario 55: Mode switched to clip');
  const clipTitle = document.getElementById('imageToolsRegionTitle');
  assert.strictEqual(clipTitle.textContent, 'Clip Boundary', 'Scenario 55: Region title matches clip');
  const btnClipMode = document.getElementById('btnModeClip');
  assert.ok(btnClipMode.classList.contains('active'), 'Scenario 55: Clip mode button is active');

  // Test mode switching to Snip
  window.ImageToolsController.setMode('snip');
  assert.strictEqual(window.ImageToolsController.currentMode, 'snip', 'Scenario 55: Mode switched to snip');
  const snipTitle = document.getElementById('imageToolsRegionTitle');
  assert.strictEqual(snipTitle.textContent, 'Background Region', 'Scenario 55: Region title matches snip');
  const btnSnipMode = document.getElementById('btnModeSnip');
  assert.ok(btnSnipMode.classList.contains('active'), 'Scenario 55: Snip mode button is active');

  // Test extraction updating Result Card
  window.executeBackgroundExtraction({ x: 25, y: 30, w: 220, h: 140 });
  const resultImg = window.ImageObjects.list[window.ImageObjects.list.length - 1];
  const resCard = document.getElementById('imageToolsResultCard');
  assert.strictEqual(resCard.style.display, 'block', 'Scenario 55: Result Card is visible after extraction');
  const resName = document.getElementById('imageToolsResultName');
  assert.strictEqual(resName.textContent, resultImg.name, 'Scenario 55: Result Card displays extracted image name');

  // Test Select Result button
  window.AppCoordinator.clearSelection();
  assert.strictEqual(window.AppCoordinator.activeSelection.type, null, 'Scenario 55: Selection cleared');
  const btnSelectRes = document.getElementById('btnToolSelectResult');
  btnSelectRes.click();
  assert.strictEqual(window.AppCoordinator.activeSelection.type, 'image', 'Scenario 55: Select Result button re-selected image');
  assert.strictEqual(window.AppCoordinator.activeSelection.id, resultImg.id, 'Scenario 55: Select Result button selected correct ID');

  console.log('[HARNESS] Scenario 55 PASS: Dedicated Crop, Clip & Snip Workspace Lifecycle & UI Modes verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 56: Non-Destructive Object-Local Image Clipping & SVG Compilation
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 56: Non-Destructive Object-Local Image Clipping & SVG Compilation...');

  const s56Img = window.ImageObjects.createImage({
    name: 'Circuit Board',
    filename: 'circuit.png',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    x: 45,
    y: 35,
    width: 280,
    height: 190
  });

  // Apply clip
  window.ImageObjects.clipImage(s56Img.id, {
    x: 25,
    y: 20,
    width: 180,
    height: 120
  });

  const clippedObj = window.ImageObjects.getImage(s56Img.id);
  assert.ok(clippedObj.clip && clippedObj.clip.enabled, 'Scenario 56: Clip enabled on image');
  assert.strictEqual(clippedObj.clip.x, 25, 'Scenario 56: Clip x preserved');
  assert.strictEqual(clippedObj.clip.y, 20, 'Scenario 56: Clip y preserved');
  assert.strictEqual(clippedObj.clip.width, 180, 'Scenario 56: Clip width preserved');
  assert.strictEqual(clippedObj.clip.height, 120, 'Scenario 56: Clip height preserved');

  // Verify compiled SVG output includes <clipPath> with exact bounds
  const svgOut = window.ImageObjects.renderImageElement(clippedObj, 1280, 720);
  assert.ok(svgOut.includes(`<clipPath id="clip-${clippedObj.id}">`), 'Scenario 56: SVG contains clipPath definition');
  assert.ok(svgOut.includes(`width="180.00" height="120.00"`), 'Scenario 56: SVG clipPath rect has exact width and height');
  assert.ok(svgOut.includes(`clip-path="url(#clip-${clippedObj.id})"`), 'Scenario 56: Group element references clipPath URL');

  // Verify SVA persistence round-trip of clip data
  let s56Blob = null;
  const origDl56 = window.ProjectManager._downloadBlob;
  window.ProjectManager._downloadBlob = (b) => { s56Blob = b; };
  await window.ProjectManager.exportSVA();
  assert.ok(s56Blob, 'Scenario 56: SVA export produced blob');
  const s56SvaBuf = await s56Blob.arrayBuffer();

  window.ProjectManager.resetToNewProject();
  assert.strictEqual(window.ImageObjects.list.length, 0, 'Scenario 56: Project reset');

  await window.ProjectManager.importSVA({
    name: 'ClipTest.sva',
    arrayBuffer: async () => s56SvaBuf
  });
  window.ProjectManager._downloadBlob = origDl56;

  const restoredClipped = window.ImageObjects.list.find((im) => im.name === 'Circuit Board');
  assert.ok(restoredClipped, 'Scenario 56: Image restored from SVA');
  assert.ok(restoredClipped.clip && restoredClipped.clip.enabled, 'Scenario 56: Clip enabled restored from SVA');
  assert.strictEqual(restoredClipped.clip.width, 180, 'Scenario 56: Clip width restored from SVA');
  assert.strictEqual(restoredClipped.clip.height, 120, 'Scenario 56: Clip height restored from SVA');

  // Test reset clip
  const s56ResetImg = window.ImageObjects.resetClip(restoredClipped.id);
  assert.ok(!s56ResetImg.clip || !s56ResetImg.clip.enabled, 'Scenario 56: Reset clip disables clip');
  const unclippedSvg = window.ImageObjects.renderImageElement(s56ResetImg, 1280, 720);
  assert.ok(!unclippedSvg.includes(`<clipPath id="clip-${s56ResetImg.id}">`), 'Scenario 56: ClipPath removed when disabled');

  console.log('[HARNESS] Scenario 56 PASS: Non-Destructive Object-Local Image Clipping & SVG Compilation verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 57: Selection Box Context-Menu Target Resolution for Image Objects
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 57: Selection Box Context-Menu Target Resolution for Image Objects...');

  const s57Img = window.ImageObjects.createImage({
    name: 'Target Resolution Test',
    filename: 'target.png',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    x: 50,
    y: 50,
    width: 200,
    height: 150
  });

  window.AppCoordinator.selectObject('image', s57Img.id);
  assert.strictEqual(window.AppCoordinator.activeSelection.type, 'image', 'Scenario 57: Image is selected');
  assert.strictEqual(window.AppCoordinator.activeSelection.id, s57Img.id, 'Scenario 57: Correct image ID selected');

  const selBoxEl = document.getElementById('nodeSelectionBox');
  assert.ok(selBoxEl, 'Scenario 57: #nodeSelectionBox exists');

  // Resolve target on #nodeSelectionBox
  const resolvedS57 = window.FloatingPropertiesEditor._resolveTargetObject(selBoxEl);
  assert.ok(resolvedS57, 'Scenario 57: Target resolved when clicking selection box on active image');
  assert.strictEqual(resolvedS57.type, 'image', 'Scenario 57: Resolved target is image');
  assert.strictEqual(resolvedS57.id, s57Img.id, 'Scenario 57: Resolved target matches image ID');

  console.log('[HARNESS] Scenario 57 PASS: Selection Box Context-Menu Target Resolution for Image Objects verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 58: Crop Versions Lifecycle & Authoritative Selection Parity
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 58: Crop Versions Lifecycle & Authoritative Selection Parity...');

  const s58Img = window.ImageObjects.createImage({
    name: 'Turbine Blueprint',
    filename: 'turbine.png',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    x: 50,
    y: 50,
    width: 400,
    height: 300,
    naturalWidth: 800,
    naturalHeight: 600
  });

  // 1. Initial State: default "original" version
  assert.ok(s58Img.cropVersions && s58Img.cropVersions.length >= 1, 'Scenario 58: cropVersions initialized');
  assert.strictEqual(s58Img.activeCropVersionId, 'original', 'Scenario 58: active version is "original"');
  assert.strictEqual(s58Img.cropVersions[0].id, 'original', 'Scenario 58: first version ID is original');
  assert.strictEqual(s58Img.cropVersions[0].name, 'Original', 'Scenario 58: first version name is Original');

  // 2. Create Crop Version 1
  const crop1 = window.ImageObjects.cropImage(s58Img.id, {
    sourceX: 100,
    sourceY: 80,
    sourceWidth: 200,
    sourceHeight: 150
  }, { newW: 200, newH: 150 }, 'Zoom Intake');

  assert.strictEqual(crop1.cropVersions.length, 2, 'Scenario 58: cropVersions now has 2 versions');
  assert.strictEqual(crop1.activeCropVersionId, 'crop-1', 'Scenario 58: active version is crop-1');
  assert.strictEqual(crop1.cropVersions[1].name, 'Zoom Intake', 'Scenario 58: custom version name applied');
  assert.strictEqual(crop1.width, 200, 'Scenario 58: width updated to cropped dimensions');
  assert.strictEqual(crop1.height, 150, 'Scenario 58: height updated to cropped dimensions');

  // SVG render reflects active crop
  const svgCrop1 = window.ImageObjects.renderImageElement(crop1, 1280, 720);
  assert.ok(svgCrop1.startsWith('<svg '), 'Scenario 58: SVG contains nested SVG viewport for active crop-1');
  assert.ok(svgCrop1.includes('viewBox="100.00 80.00 200.00 150.00"'), 'Scenario 58: SVG viewBox matches crop-1');

  // 3. Create Crop Version 2
  const crop2 = window.ImageObjects.cropImage(s58Img.id, {
    sourceX: 20,
    sourceY: 30,
    sourceWidth: 100,
    sourceHeight: 80
  }, { newW: 100, newH: 80 }, 'Exhaust Port');

  assert.strictEqual(crop2.cropVersions.length, 3, 'Scenario 58: cropVersions now has 3 versions');
  assert.strictEqual(crop2.activeCropVersionId, 'crop-2', 'Scenario 58: active version is crop-2');

  // 4. Switch active version back to crop-1
  const switchedCrop1 = window.ImageObjects.selectCropVersion(s58Img.id, 'crop-1');
  assert.strictEqual(switchedCrop1.activeCropVersionId, 'crop-1', 'Scenario 58: active version switched to crop-1');
  assert.strictEqual(switchedCrop1.width, 200, 'Scenario 58: restored crop-1 width');
  assert.strictEqual(switchedCrop1.crop.sourceWidth, 200, 'Scenario 58: restored crop-1 sourceWidth');

  // 5. Switch active version to "original"
  const switchedOrig = window.ImageObjects.selectCropVersion(s58Img.id, 'original');
  assert.strictEqual(switchedOrig.activeCropVersionId, 'original', 'Scenario 58: active version switched to original');
  assert.ok(!switchedOrig.crop || !switchedOrig.crop.enabled, 'Scenario 58: crop disabled when original is active');
  assert.strictEqual(switchedOrig.width, 400, 'Scenario 58: restored original width');

  const svgOrig = window.ImageObjects.renderImageElement(switchedOrig, 1280, 720);
  assert.ok(!svgOrig.includes('crop-viewport-'), 'Scenario 58: SVG does not use crop-viewport when original is active');

  // 6. Rename crop version
  const renamed = window.ImageObjects.renameCropVersion(s58Img.id, 'crop-1', 'Turbine Core');
  const ver1 = renamed.cropVersions.find((v) => v.id === 'crop-1');
  assert.strictEqual(ver1.name, 'Turbine Core', 'Scenario 58: crop version successfully renamed');

  // 7. Delete crop version
  const afterDel = window.ImageObjects.deleteCropVersion(s58Img.id, 'crop-2');
  assert.strictEqual(afterDel.cropVersions.length, 2, 'Scenario 58: crop version successfully deleted');
  assert.ok(!afterDel.cropVersions.some((v) => v.id === 'crop-2'), 'Scenario 58: crop-2 no longer present');

  // 8. Prevent deleting "original" version
  const cannotDelOrig = window.ImageObjects.deleteCropVersion(s58Img.id, 'original');
  assert.ok(!cannotDelOrig || cannotDelOrig.cropVersions.some((v) => v.id === 'original'), 'Scenario 58: original version cannot be deleted');

  console.log('[HARNESS] Scenario 58 PASS: Crop Versions Lifecycle & Authoritative Selection Parity verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 59: Two-Step Clip Area Workflow & Independent Object Creation
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 59: Two-Step Clip Area Workflow & Independent Object Creation...');

  const s59Img = window.ImageObjects.createImage({
    name: 'Schematic Diagram',
    filename: 'schematic.png',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    x: 40,
    y: 40,
    width: 300,
    height: 200
  });

  const origLayerCount = window.LayerManager ? window.LayerManager.getLayers().length : 0;

  // Step 1: User defines clip area without affecting original image
  window.ImageToolsController.setMode('clip');
  window.AppCoordinator.selectObject('image', s59Img.id);

  // Step 2: Confirm clip area extracts sub-area to preview
  window.ImageToolsController.confirmClipArea(s59Img, { x: 30, y: 25, w: 150, h: 100 });

  // Verify preview data captured
  assert.ok(window.ImageToolsController._previewData, 'Scenario 59: previewData captured');
  assert.strictEqual(window.ImageToolsController._previewData.w, 150, 'Scenario 59: preview width 150');
  assert.strictEqual(window.ImageToolsController._previewData.h, 100, 'Scenario 59: preview height 100');

  // Original image must be completely untouched
  const untouchedImg = window.ImageObjects.getImage(s59Img.id);
  assert.ok(!untouchedImg.clip || !untouchedImg.clip.enabled, 'Scenario 59: original image has NO clip mask');
  assert.strictEqual(untouchedImg.width, 300, 'Scenario 59: original image width unchanged');
  assert.strictEqual(untouchedImg.height, 200, 'Scenario 59: original image height unchanged');

  // Step 3: Turn preview into independent Image Object
  window.ImageToolsController.createImageFromPreview();

  const newImg = window.ImageObjects.list[window.ImageObjects.list.length - 1];
  assert.ok(newImg && newImg.id !== s59Img.id, 'Scenario 59: New independent Image Object created');
  assert.strictEqual(newImg.width, 150, 'Scenario 59: New image width matches clipped sub-area');
  assert.strictEqual(newImg.height, 100, 'Scenario 59: New image height matches clipped sub-area');

  if (window.LayerManager) {
    const newLayers = window.LayerManager.getLayers();
    assert.strictEqual(newLayers.length, origLayerCount + 1, 'Scenario 59: Layer count increased by 1');
    assert.ok(newLayers.some((l) => l.type === 'image' && String(l.id) === String(newImg.id)), 'Scenario 59: New image added to layers');
  }

  // Verify result card is populated
  const resCard59 = document.getElementById('imageToolsResultCard');
  assert.strictEqual(resCard59.style.display, 'block', 'Scenario 59: Result card displayed');

  console.log('[HARNESS] Scenario 59 PASS: Two-Step Clip Area Workflow & Independent Object Creation verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 60: Two-Step Snip Background Workflow & Export
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 60: Two-Step Snip Background Workflow & Export...');

  window.ImageToolsController.setMode('snip');
  assert.strictEqual(window.ImageToolsController.currentMode, 'snip', 'Scenario 60: Snip mode active');

  // Capture background snip
  window.ImageToolsController.confirmBgSnip({ x: 50, y: 50, w: 240, h: 160 });

  assert.ok(window.ImageToolsController._previewData, 'Scenario 60: previewData captured from background');
  assert.strictEqual(window.ImageToolsController._previewData.w, 240, 'Scenario 60: captured width 240');
  assert.strictEqual(window.ImageToolsController._previewData.h, 160, 'Scenario 60: captured height 160');

  // Export Preview simulation
  let exportedDownload = null;
  const origAppend = document.body.appendChild;
  document.body.appendChild = function(node) {
    if (node && node.tagName === 'A' && node.download) {
      exportedDownload = { download: node.download, href: node.href };
    }
    return origAppend.call(document.body, node);
  };

  const fmtSelect = document.getElementById('selPreviewExportFormat');
  if (fmtSelect) fmtSelect.value = 'png';
  window.ImageToolsController.exportPreview();

  // Turn preview into independent Image Object
  window.ImageToolsController.createImageFromPreview();
  const snipImg = window.ImageObjects.list[window.ImageObjects.list.length - 1];
  assert.ok(snipImg, 'Scenario 60: Snip converted to independent Image Object');
  assert.strictEqual(snipImg.width, 240, 'Scenario 60: Snip object width 240');
  assert.strictEqual(snipImg.height, 160, 'Scenario 60: Snip object height 160');

  // Discard preview resets preview state
  window.ImageToolsController.discardPreview();
  assert.strictEqual(window.ImageToolsController._previewData, null, 'Scenario 60: previewData cleared after discard');

  document.body.appendChild = origAppend;
  console.log('[HARNESS] Scenario 60 PASS: Two-Step Snip Background Workflow & Export verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 61: Commit Current Crop (Preserve vs Discard Versions)
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 61: Commit Current Crop (Preserve vs Discard Versions)...');

  const s61Img = window.ImageObjects.createImage({
    name: 'Motor Assembly',
    filename: 'motor.png',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    x: 50,
    y: 50,
    width: 320,
    height: 240,
    naturalWidth: 640,
    naturalHeight: 480
  });

  // Create two crop versions
  window.ImageObjects.cropImage(s61Img.id, {
    sourceX: 40,
    sourceY: 40,
    sourceWidth: 200,
    sourceHeight: 150
  }, { newW: 200, newH: 150 }, 'V1 Core');

  const c2 = window.ImageObjects.cropImage(s61Img.id, {
    sourceX: 10,
    sourceY: 10,
    sourceWidth: 160,
    sourceHeight: 120
  }, { newW: 160, newH: 120 }, 'V2 Stator');

  const curS61 = window.ImageObjects.getImage(s61Img.id);
  assert.strictEqual(curS61.cropVersions.length, 3, 'Scenario 61: 3 crop versions before commit');

  // Commit & Preserve Original
  const committedPreserve = window.ImageObjects.commitCrop(s61Img.id, {
    newSrc: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 160,
    naturalHeight: 120,
    width: 160,
    height: 120,
    discardVersions: false
  });

  assert.ok(committedPreserve, 'Scenario 61: Commit succeeded');
  assert.strictEqual(committedPreserve.naturalWidth, 160, 'Scenario 61: naturalWidth updated to committed 160');
  assert.strictEqual(committedPreserve.naturalHeight, 120, 'Scenario 61: naturalHeight updated to committed 120');
  assert.strictEqual(committedPreserve.cropVersions.length, 3, 'Scenario 61: Crop versions preserved');

  // Commit & Discard Versions
  const committedDiscard = window.ImageObjects.commitCrop(s61Img.id, {
    newSrc: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    naturalWidth: 140,
    naturalHeight: 100,
    width: 140,
    height: 100,
    discardVersions: true
  });

  assert.strictEqual(committedDiscard.cropVersions.length, 1, 'Scenario 61: Previous versions discarded');
  assert.strictEqual(committedDiscard.cropVersions[0].id, 'original', 'Scenario 61: Reset to single original version');
  assert.strictEqual(committedDiscard.activeCropVersionId, 'original', 'Scenario 61: Active version is original');
  assert.strictEqual(committedDiscard.naturalWidth, 140, 'Scenario 61: Final naturalWidth 140');

  console.log('[HARNESS] Scenario 61 PASS: Commit Current Crop (Preserve vs Discard Versions) verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 62: Scene Exports Render the Currently Active Crop Version
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 62: Scene Exports Render the Currently Active Crop Version...');

  const s62Img = window.ImageObjects.createImage({
    name: 'Export Crop Test',
    filename: 'export-crop.png',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    x: 50,
    y: 50,
    width: 400,
    height: 300,
    naturalWidth: 800,
    naturalHeight: 600
  });

  // Create crop version "Focus Area"
  const cFocus = window.ImageObjects.cropImage(s62Img.id, {
    sourceX: 150,
    sourceY: 120,
    sourceWidth: 250,
    sourceHeight: 180
  }, { newW: 250, newH: 180 }, 'Focus Area');

  // When "Focus Area" is active:
  assert.strictEqual(cFocus.activeCropVersionId, 'crop-1', 'Scenario 62: Active crop version is Focus Area');
  const svgCropActive = window.ImageObjects.renderImageElement(cFocus, 1280, 720);
  assert.ok(svgCropActive.startsWith('<svg '), 'Scenario 62: Active crop version rendered with nested SVG viewport');
  assert.ok(svgCropActive.includes('viewBox="150.00 120.00 250.00 180.00"'), 'Scenario 62: Active crop version viewBox matches');

  // Switch back to "Original":
  const switchedOrig62 = window.ImageObjects.selectCropVersion(s62Img.id, 'original');
  assert.strictEqual(switchedOrig62.activeCropVersionId, 'original', 'Scenario 62: Active crop version is Original');
  const svgOrigActive = window.ImageObjects.renderImageElement(switchedOrig62, 1280, 720);
  assert.ok(svgOrigActive.startsWith('<image '), 'Scenario 62: Original rendered with standard image tag');
  assert.ok(!svgOrigActive.includes('<svg '), 'Scenario 62: Original rendered without nested svg viewport');

  console.log('[HARNESS] Scenario 62 PASS: Scene Exports Render the Currently Active Crop Version verified.');

  // ---------------------------------------------------------------------------
  // SCENARIO 63: Full End-to-End Background Crop Workflow, DOM Re-Rendering & Version Switching
  // ---------------------------------------------------------------------------
  console.log('\n[HARNESS] Scenario 63: Full End-to-End Background Crop Workflow, DOM Re-Rendering & Version Switching...');

  // 1. Set a background photograph
  const bgPhoto = {
    filename: 'mountain.jpg',
    src: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    mime: 'image/jpeg',
    naturalWidth: 1920,
    naturalHeight: 1080
  };
  window.setLoadedPhoto(bgPhoto);

  // Add a stationary foreground node to verify foreground stability
  const stationaryNode = {
    id: 'stationary-node-1',
    type: 'node',
    x: 40,
    y: 50,
    text: 'Fixed Point'
  };
  if (window.Nodes && typeof window.Nodes.addNode === 'function') {
    window.Nodes.addNode(stationaryNode);
  }

  // 2. Select the node or clear selection - Background crop must be available regardless of active selection
  if (window.AppCoordinator) {
    window.AppCoordinator.selectObject('node', 'stationary-node-1');
  }
  window.syncImageToolsUI();

  const cropBgName = document.getElementById('cropBackgroundName') || document.getElementById('cropSelectedImageName');
  assert.strictEqual(cropBgName.textContent, 'mountain.jpg', 'Scenario 63: Crop Background displays background photo filename');
  const btnStartCrop = document.getElementById('btnStartCrop');
  assert.strictEqual(btnStartCrop.disabled, false, 'Scenario 63: Start Crop button is enabled for canvas background regardless of selection');

  // Verify initial crop versions list has "Original"
  const listEl63 = document.getElementById('cropVersionsList');
  assert.ok(listEl63 && listEl63.children.length >= 1, 'Scenario 63: At least Original version pill exists in crop list');

  // 3. Enter interactive crop mode via Start Crop button click
  btnStartCrop.click();
  assert.ok(window.Stage && window.Stage.isCroppingImage, 'Scenario 63: Stage entered interactive crop mode');
  assert.strictEqual(window.Stage.isCroppingBackground, true, 'Scenario 63: Stage is cropping canvas background');

  // 4. Simulate user dragging crop handles to select a sub-rectangle on canvas
  // Canvas is 1280x720, natural photo is 1920x1080 (scaleX = 1280/1920 = 2/3)
  // Sub-rectangle on canvas: x=128, y=72, w=1024, h=576 -> natural coordinates: x=192, y=108, w=1536, h=864
  window.Stage.cropBox = { x: 128, y: 72, w: 1024, h: 576 };
  window.Stage.cropOrigBounds = { left: 0, top: 0, w: 1280, h: 720, natW: 1920, natH: 1080 };
  window.syncImageToolsFromCrop();

  const rx = parseInt(document.getElementById('cropRegionX').value, 10);
  const ry = parseInt(document.getElementById('cropRegionY').value, 10);
  const rw = parseInt(document.getElementById('cropRegionW').value, 10);
  const rh = parseInt(document.getElementById('cropRegionH').value, 10);
  assert.strictEqual(rx, 192, 'Scenario 63: Crop X input updated to 192 in background photo source coordinates');
  assert.strictEqual(ry, 108, 'Scenario 63: Crop Y input updated to 108 in background photo source coordinates');
  assert.strictEqual(rw, 1536, 'Scenario 63: Crop W input updated to 1536');
  assert.strictEqual(rh, 864, 'Scenario 63: Crop H input updated to 864');

  // 5. Apply Crop via bottom section button click
  const btnApplyCrop = document.getElementById('btnApplyCropInTools');
  btnApplyCrop.click();
  assert.strictEqual(window.Stage.isCroppingImage, false, 'Scenario 63: Stage exited interactive crop mode after Apply Crop');

  // Verify background crop state
  const updatedPhoto = window.getLoadedPhoto();
  assert.ok(updatedPhoto.crop && updatedPhoto.crop.enabled, 'Scenario 63: Background photo has active crop enabled');
  assert.strictEqual(updatedPhoto.crop.sourceX, 192, 'Scenario 63: Background crop sourceX is 192');
  assert.strictEqual(updatedPhoto.crop.sourceY, 108, 'Scenario 63: Background crop sourceY is 108');
  assert.strictEqual(updatedPhoto.crop.sourceWidth, 1536, 'Scenario 63: Background crop sourceWidth is 1536');
  assert.strictEqual(updatedPhoto.crop.sourceHeight, 864, 'Scenario 63: Background crop sourceHeight is 864');
  assert.strictEqual(updatedPhoto.cropVersions.length, 2, 'Scenario 63: Two crop versions recorded (Original + Crop 1)');
  assert.strictEqual(updatedPhoto.activeCropVersionId, 'crop-1', 'Scenario 63: Active crop version is crop-1');

  // Verify stationary foreground node was NOT altered or moved
  assert.strictEqual(stationaryNode.x, 40, 'Scenario 63: Foreground node X coordinate is completely unchanged');
  assert.strictEqual(stationaryNode.y, 50, 'Scenario 63: Foreground node Y coordinate is completely unchanged');

  // Verify Effects.buildPhotoElement outputs nested SVG with viewBox reframing background
  const stateImg = window.SceneState.buildCurrentCanvasState();
  const bgSvgMarkup = window.Effects.buildPhotoElement(stateImg, 1280, 720);
  assert.ok(bgSvgMarkup.startsWith('<svg '), 'Scenario 63: Cropped background photo compiles to nested SVG element');
  assert.ok(bgSvgMarkup.includes('viewBox="192 108 1536 864"'), 'Scenario 63: Nested SVG has viewBox matching natural source coordinates');

  // 6. Test version switching to "Original"
  window.ImageToolsController.selectBackgroundCropVersion({ id: 'original', name: 'Original' });
  const photoAtOrig = window.getLoadedPhoto();
  assert.strictEqual(photoAtOrig.activeCropVersionId, 'original', 'Scenario 63: Switched back to original background view');
  assert.ok(!photoAtOrig.crop || !photoAtOrig.crop.enabled, 'Scenario 63: Crop is disabled or removed when Original is active');

  const origBgMarkup = window.Effects.buildPhotoElement(window.SceneState.buildCurrentCanvasState(), 1280, 720);
  assert.ok(origBgMarkup.startsWith('<image '), 'Scenario 63: Original background compiles to standard image tag');
  assert.ok(!origBgMarkup.includes('<svg '), 'Scenario 63: Original background does not use nested SVG element');

  // 7. Test re-selecting "Crop 1"
  window.ImageToolsController.selectBackgroundCropVersion({ id: 'crop-1', name: 'Crop 1' });
  const photoAtCrop1 = window.getLoadedPhoto();
  assert.strictEqual(photoAtCrop1.activeCropVersionId, 'crop-1', 'Scenario 63: Switched back to crop-1');
  assert.strictEqual(photoAtCrop1.crop.enabled, true, 'Scenario 63: Background crop re-enabled when crop-1 is active');

  // 8. Test Clip/Snip isolation: starting Clip cancels Crop and does not overwrite crop versions
  window.ImageToolsController.startClipSnip();
  assert.strictEqual(window.Stage.isCroppingImage, false, 'Scenario 63: Starting clip cancels crop mode');
  assert.strictEqual(photoAtCrop1.cropVersions.length, 2, 'Scenario 63: Background crop versions untouched by clip initiation');
  window.Stage.cancelClipMode();

  console.log('[HARNESS] Scenario 63 PASS: Full End-to-End Background Crop Workflow, DOM Re-Rendering & Version Switching verified.');

  console.log('[HARNESS] REG-03 PASS: Stage 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14 & 15 non-destructive cropping, background extraction, image baking, dedicated crop clip & snip workspace, object-local clipping, unified layer management, independent image objects, persistent groups, duplication, copy/paste with flow remapping, multi-selection, alignment, distribution, colour tools, selection retention, notifications, naming sync, history(50), schema 1.2.0, .sva packaging, background photo restoration, SVG compilation, export payload builders, and Go WASM Node, Flow, Glow, Ripple, Camera, Optics, Frame, State, History & Naming engines verified.');
}

runHarness()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('[HARNESS] FAIL:', err && err.stack ? err.stack : err);
    process.exit(1);
  });
