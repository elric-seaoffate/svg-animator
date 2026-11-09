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
    const classes = new Set();
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
  assert.strictEqual(scriptTagsInHtml.length, 15, 'index.html must contain exactly 15 script tags');
  const expectedScriptOrder = [
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
  assert.deepStrictEqual(scriptTagsInHtml, expectedScriptOrder, '15 script tags must be in exact dependency order');

  // 14. Phase 4: Floating Contextual Object Properties Editor Verification
  assert.ok(window.FloatingPropertiesEditor, 'window.FloatingPropertiesEditor must be defined');
  window.FloatingPropertiesEditor.init();
  assert.strictEqual(window.FloatingPropertiesEditor._initialized, true);
  window.FloatingPropertiesEditor.init(); // Idempotency check
  assert.strictEqual(window.FloatingPropertiesEditor._initialized, true);

  const floatingEditorEl = document.getElementById('floatingContextEditor');
  assert.ok(floatingEditorEl, '#floatingContextEditor must exist in DOM');

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

  // Re-bind FloatingPropertiesEditor controls & events with the full previewBox tree
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

  // Test 3: Right-Click on Glow reticle
  const testGlow = window.Glows.createGlow({ color: '#ff5533', size: 30 });
  const glowTargetEl = document.getElementById('glowReticleTarget');
  const glowX = window.Glows.getGlow(testGlow.id).x;
  const glowY = window.Glows.getGlow(testGlow.id).y;
  const historyLenBeforeGlow = window.HistoryManager.undoStack.length;
  preventDefaultCalled = false;
  stopPropagationCalled = false;

  const glowRightClickEvt = {
    type: 'contextmenu',
    button: 2,
    clientX: 400,
    clientY: 250,
    target: glowTargetEl,
    preventDefault: () => { preventDefaultCalled = true; },
    stopPropagation: () => { stopPropagationCalled = true; }
  };
  previewBoxEl.dispatchEvent(glowRightClickEvt);

  assert.strictEqual(preventDefaultCalled, true, 'Right-clicking glow reticle must call preventDefault()');
  assert.strictEqual(stopPropagationCalled, true, 'Right-clicking glow reticle must call stopPropagation()');
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, true, 'Editor must open for glow');
  assert.strictEqual(window.FloatingPropertiesEditor.activeType, 'glow', 'Editor must switch to glow');
  assert.strictEqual(window.FloatingPropertiesEditor.activeId, testGlow.id);
  assert.strictEqual(window.Glows.getGlow(testGlow.id).x, glowX, 'Glow X must remain unchanged');
  assert.strictEqual(window.Glows.getGlow(testGlow.id).y, glowY, 'Glow Y must remain unchanged');
  assert.strictEqual(window.HistoryManager.undoStack.length, historyLenBeforeGlow, 'Glow right-click must not pollute history');

  // Test 4: Right-Click on Ripple reticle
  const testRipple = window.Ripples.createRipple({ color: '#44aaff', refraction: 35 });
  const rippleTargetEl = document.getElementById('rippleReticleTarget');
  const rippleX = window.Ripples.getRipple(testRipple.id).x;
  const rippleY = window.Ripples.getRipple(testRipple.id).y;
  const historyLenBeforeRipple = window.HistoryManager.undoStack.length;
  preventDefaultCalled = false;
  stopPropagationCalled = false;

  const rippleRightClickEvt = {
    type: 'contextmenu',
    button: 2,
    clientX: 450,
    clientY: 280,
    target: rippleTargetEl,
    preventDefault: () => { preventDefaultCalled = true; },
    stopPropagation: () => { stopPropagationCalled = true; }
  };
  previewBoxEl.dispatchEvent(rippleRightClickEvt);

  assert.strictEqual(preventDefaultCalled, true, 'Right-clicking ripple reticle must call preventDefault()');
  assert.strictEqual(stopPropagationCalled, true, 'Right-clicking ripple reticle must call stopPropagation()');
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, true, 'Editor must open for ripple');
  assert.strictEqual(window.FloatingPropertiesEditor.activeType, 'ripple', 'Editor must switch to ripple');
  assert.strictEqual(window.FloatingPropertiesEditor.activeId, testRipple.id);
  assert.strictEqual(window.Ripples.getRipple(testRipple.id).x, rippleX, 'Ripple X must remain unchanged');
  assert.strictEqual(window.Ripples.getRipple(testRipple.id).y, rippleY, 'Ripple Y must remain unchanged');
  assert.strictEqual(window.HistoryManager.undoStack.length, historyLenBeforeRipple, 'Ripple right-click must not pollute history');

  window.FloatingPropertiesEditor.close();
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, false);

  // Test 5: Right-Click on blank / empty canvas space suppresses native context menu,
  // does not open Properties, does not change selection, and dispatches to extension point handleCanvasContextMenu
  window.FloatingPropertiesEditor.close();
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, false);

  // Set active selection to testNode to verify selection is preserved on empty canvas right-click
  window.AppCoordinator.selectObject('node', testNode.id);
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
  assert.strictEqual(window.FloatingPropertiesEditor.isOpen, false, 'Right-clicking empty canvas must NOT open Properties editor');
  assert.strictEqual(window.AppCoordinator.getActiveSelection().id, testNode.id, 'Right-clicking empty canvas must NOT alter selection');
  assert.strictEqual(window.Stage.isDragging, false, 'Right-clicking empty canvas must NOT initiate stage dragging');
  assert.strictEqual(window.HistoryManager.undoStack.length, historyLenBeforeBlank, 'Right-clicking empty canvas must NOT alter history');
  assert.strictEqual(canvasContextHookCalled, true, 'Extension point handleCanvasContextMenu must be called on empty canvas right-click');

  window.FloatingPropertiesEditor.handleCanvasContextMenu = origHandleCanvasContext;

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

  console.log('[HARNESS] REG-03 PASS: Stage 3 & 4 selection, history(50), schema 1.2.0, SVG compilation, export payload builders, and Stage 3.1 & 3.2 workspace foundation & refinement verified.');
}

runHarness()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('[HARNESS] FAIL:', err && err.stack ? err.stack : err);
    process.exit(1);
  });
