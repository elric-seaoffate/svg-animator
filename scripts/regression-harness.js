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
    const el = {
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
      parentElement: null,
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
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
        if (this._listeners && this._listeners[type]) {
          const e = typeof evt === 'object' ? evt : { type, target: this };
          if (!e.target) e.target = this;
          this._listeners[type].forEach((fn) => fn(e));
        }
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
      },
      getAttribute(k) { return this[k] || null; },
      querySelector(sel) {
        if (sel === 'option[data-unknown-shape="true"]') {
          return this.children.find((c) => c.dataset && c.dataset.unknownShape === 'true') || null;
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
