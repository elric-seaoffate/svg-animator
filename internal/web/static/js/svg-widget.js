/**
 * SVG Animator Studio — Reusable SVG Widget Runtime & Mounting Library (`svg-widget.js`)
 *
 * Stage 16B: External Widget Controls, Runtime Parameters and Independent Host Integration.
 *
 * Responsibilities:
 *   - Parse and namespace SVG documents for safe multi-instance embedding on host pages.
 *   - Scope all element IDs, internal references (url(#...), href="#...", xlink:href="#...").
 *   - Remap SMIL animation targets (<mpath>, event timing begin/end).
 *   - Scope embedded <style> selectors to widget root element.
 *   - Prefix @keyframes and remap animation/animation-name properties to prevent stylesheet collisions.
 *   - Safely preserve data URLs (data:image/...) and text content containing '#'.
 *   - Manifest parsing and runtime parameter binding with atomic validation.
 *   - Semantic target resolution (semantic target name -> scoped element in instance DOM).
 *   - Per-instance independent animation control (play, pause, resume, stop, speed).
 *   - Universal UMD module: Browser window global, CommonJS (Node.js), and ES module environments.
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SVGWidget = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  let widgetCounter = 0;

  function generateInstanceId() {
    widgetCounter += 1;
    const rnd = Math.random().toString(36).slice(2, 7);
    const ts = (Date.now() % 1000000).toString(36);
    return `sva-w-${ts}-${rnd}-${widgetCounter}`;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  const COLOR_REGEX = /^(?:#[0-9a-fA-F]{3,8}|(?:rgb|hsl)a?\([^)]+\)|[a-zA-Z]+|transparent|currentColor)$/;

  /**
   * Scopes CSS rules to the widget root ID and prefixes keyframes.
   */
  function scopeCSSRules(css, rootId, idMap, keyframeMap) {
    let transformedCSS = css;

    // 1. Rename @keyframes definitions and usages
    for (const [oldKF, newKF] of Object.entries(keyframeMap)) {
      const reKF = new RegExp(`@keyframes\\s+${escapeRegex(oldKF)}\\b`, 'g');
      transformedCSS = transformedCSS.replace(reKF, `@keyframes ${newKF}`);

      const reAnim = new RegExp(`\\b(animation(?:-name)?\\s*:\\s*[^;}]*?)\\b${escapeRegex(oldKF)}\\b`, 'g');
      transformedCSS = transformedCSS.replace(reAnim, `$1${newKF}`);
    }

    // 2. Rewrite url(#oldId) inside CSS rules
    for (const [oldId, newId] of Object.entries(idMap)) {
      const reUrl = new RegExp(`url\\(\\s*["']?#${escapeRegex(oldId)}["']?\\s*\\)`, 'g');
      transformedCSS = transformedCSS.replace(reUrl, `url(#${newId})`);
    }

    // 3. Temporarily stash @keyframes blocks so their nested rules are not mangled
    const kfBlocks = [];
    const reKFBlock = /@keyframes\s+[^{]+\{(?:[^{}]*\{[^{}]*\}[^{}]*)*\}/g;
    const cssWithoutKF = transformedCSS.replace(reKFBlock, (m) => {
      kfBlocks.push(m);
      return `/*__SVA_KF_BLOCK_${kfBlocks.length - 1}__*/`;
    });

    // 4. Scope remaining rule selectors to #rootId
    const reRule = /([^{}/]+)\{([^{}]+)\}/g;
    let scoped = cssWithoutKF.replace(reRule, (match, rawSel, body) => {
      const sel = rawSel.trim();
      if (sel.startsWith('@') || sel.startsWith('/*')) return match;

      const parts = sel.split(',');
      const scopedParts = [];
      for (let s of parts) {
        let clean = s.trim();
        if (!clean) continue;

        // Replace any #oldId in selector
        for (const [oldId, newId] of Object.entries(idMap)) {
          clean = clean.replace(new RegExp(`#${escapeRegex(oldId)}\\b`, 'g'), `#${newId}`);
        }
        scopedParts.push(`#${rootId} ${clean}`);
      }

      if (scopedParts.length === 0) return match;
      return `\n    ${scopedParts.join(', ')} {${body}}`;
    });

    // 5. Restore @keyframes blocks
    kfBlocks.forEach((kf, idx) => {
      scoped = scoped.replace(`/*__SVA_KF_BLOCK_${idx}__*/`, kf);
    });

    return scoped;
  }

  /**
   * Core string/regex-based SVG widget isolator.
   * Works identically in browser DOM and Node.js headless environments.
   */
  function isolateSVGString(rawSvg, options = {}) {
    if (!rawSvg || typeof rawSvg !== 'string') {
      throw new Error('SVGWidget.isolate requires a non-empty SVG string.');
    }

    let instanceId = (options.instanceId && String(options.instanceId).trim()) || generateInstanceId();
    instanceId = instanceId.replace(/[^a-zA-Z0-9_-]/g, '-');
    const prefix = (options.prefix && String(options.prefix).trim()) || `${instanceId}__`;
    const rootId = `sva-widget-${instanceId}`;
    const scopeCss = options.scopeCss !== false;

    // 0. Temporarily strip embedded <script id="...sva-widget-manifest"> blocks so regex attribute
    // transforms do not match '>' characters inside JSON descriptions before re-injecting at the end.
    const embeddedManifestBlocks = [];
    const reManifestScript = new RegExp(/<script\b[^>]*\bid=["'](?:[^"']*__)?sva-widget-manifest["'][^>]*>[\s\S]*?<\//.source + 'script>', 'gi');
    const svgWithoutManifest = rawSvg.replace(reManifestScript, (block) => {
      embeddedManifestBlocks.push(block);
      return '';
    });

    // 1. Scan and collect declared IDs: id="VALUE" or id='VALUE'
    const idMap = {};
    const reIDDecl = /\bid\s*=\s*(["'])([^"']+)\1/g;
    let m;
    while ((m = reIDDecl.exec(svgWithoutManifest)) !== null) {
      const oldId = m[2];
      if (oldId && !idMap[oldId]) {
        idMap[oldId] = `${prefix}${oldId}`;
      }
    }

    // 2. Scan and collect @keyframes in <style>
    const keyframeMap = {};
    const reKF = /@keyframes\s+([a-zA-Z0-9_-]+)/g;
    while ((m = reKF.exec(svgWithoutManifest)) !== null) {
      const oldKF = m[1];
      if (oldKF && !keyframeMap[oldKF]) {
        keyframeMap[oldKF] = `${prefix}${oldKF}`;
      }
    }

    // 3. Transform CSS in <style> blocks
    let transformed = svgWithoutManifest.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (match, attrs, css) => {
      let scopedCSS = css;
      if (scopeCss) {
        scopedCSS = scopeCSSRules(css, rootId, idMap, keyframeMap);
      }
      return `<style${attrs}>${scopedCSS}</style>`;
    });

    // 4. Transform tag attributes
    let isFirstSVG = true;
    const reTag = /<([a-zA-Z0-9:_-]+)((?:\s+[^>]+)?)>/g;

    transformed = transformed.replace(reTag, (tagMatch, tagName, tagAttrs) => {
      if (tagName.startsWith('/')) return tagMatch;

      if (tagName.toLowerCase() === 'svg' && isFirstSVG) {
        isFirstSVG = false;
        // Set root ID and instance attribute
        if (/\bid\s*=\s*["'][^"']*["']/i.test(tagAttrs)) {
          tagAttrs = tagAttrs.replace(/\bid\s*=\s*["'][^"']*["']/i, `id="${rootId}"`);
        } else {
          tagAttrs = ` id="${rootId}"` + tagAttrs;
        }

        if (!/data-sva-widget-instance/i.test(tagAttrs)) {
          tagAttrs += ` data-sva-widget-instance="${instanceId}"`;
        }
      } else {
        // Remap declared id attributes on non-root elements
        tagAttrs = tagAttrs.replace(/\bid\s*=\s*(["'])([^"']+)\1/g, (match, q, oldId) => {
          if (idMap[oldId]) {
            return `id=${q}${idMap[oldId]}${q}`;
          }
          return match;
        });
      }

      // Remap href and xlink:href if starting with # (fragment reference only)
      tagAttrs = tagAttrs.replace(/\b(xlink:href|href)\s*=\s*(["'])(#)([^"']+)\2/g, (match, attr, q, hash, targetId) => {
        if (idMap[targetId]) {
          return `${attr}=${q}#${idMap[targetId]}${q}`;
        }
        return match;
      });

      // Remap url(#oldId) in attributes (fill, stroke, filter, clip-path, mask, marker-*, style)
      tagAttrs = tagAttrs.replace(/url\(\s*["']?#([a-zA-Z0-9:_-]+)["']?\s*\)/g, (match, targetId) => {
        if (idMap[targetId]) {
          return `url(#${idMap[targetId]})`;
        }
        return match;
      });

      // Remap aria-labelledby and aria-describedby
      tagAttrs = tagAttrs.replace(/\b(aria-labelledby|aria-describedby)\s*=\s*(["'])([^"']+)\2/g, (match, attr, q, rawTokens) => {
        const tokens = rawTokens.split(/\s+/).filter(Boolean);
        const mapped = tokens.map((t) => idMap[t] || t);
        return `${attr}=${q}${mapped.join(' ')}${q}`;
      });

      // Remap SMIL begin/end event targets: begin="anim1.begin" / end="anim1.end+2s"
      tagAttrs = tagAttrs.replace(/\b(begin|end)\s*=\s*(["'])([^"']+)\2/g, (match, attr, q, val) => {
        let timing = val;
        for (const [oldId, newId] of Object.entries(idMap)) {
          timing = timing.replace(new RegExp(`\\b${escapeRegex(oldId)}\\.`, 'g'), `${newId}.`);
        }
        return `${attr}=${q}${timing}${q}`;
      });

      // Remap @keyframes animation-name references inside inline style="..." attributes
      if (Object.keys(keyframeMap).length > 0 && /\bstyle\s*=/i.test(tagAttrs)) {
        tagAttrs = tagAttrs.replace(/\bstyle\s*=\s*(["'])([^"']*)\1/gi, (match, q, styleVal) => {
          let updatedStyle = styleVal;
          for (const [oldKF, newKF] of Object.entries(keyframeMap)) {
            const reInlineAnim = new RegExp(`(\\b(?:animation|animation-name)\\s*:\\s*[^;]*?)\\b${escapeRegex(oldKF)}\\b`, 'g');
            updatedStyle = updatedStyle.replace(reInlineAnim, `$1${newKF}`);
          }
          return `style=${q}${updatedStyle}${q}`;
        });
      }

      return `<${tagName}${tagAttrs}>`;
    });

    // 5. Re-inject stripped embedded manifest block or inject options.manifest if provided
    if (options.manifest && Array.isArray(options.manifest.parameters) && options.manifest.parameters.length > 0) {
      const manifestJson = JSON.stringify(options.manifest);
      const manifestTag = '\n  <script type="application/json" id="' + prefix + 'sva-widget-manifest">' + manifestJson + '<' + '/script>\n';
      const lastSvgIdx = transformed.lastIndexOf('</svg>');
      if (lastSvgIdx !== -1) {
        transformed = transformed.slice(0, lastSvgIdx) + manifestTag + transformed.slice(lastSvgIdx);
      } else {
        transformed += manifestTag;
      }
      idMap['sva-widget-manifest'] = `${prefix}sva-widget-manifest`;
    } else if (embeddedManifestBlocks.length > 0) {
      const restoredBlock = embeddedManifestBlocks[0].replace(
        /\bid\s*=\s*(["'])(?:[^"']*__)?sva-widget-manifest\1/i,
        `id="${prefix}sva-widget-manifest"`
      );
      const lastSvgIdx = transformed.lastIndexOf('</svg>');
      if (lastSvgIdx !== -1) {
        transformed = transformed.slice(0, lastSvgIdx) + '\n  ' + restoredBlock + '\n' + transformed.slice(lastSvgIdx);
      } else {
        transformed += '\n  ' + restoredBlock + '\n';
      }
      idMap['sva-widget-manifest'] = `${prefix}sva-widget-manifest`;
    }

    if (options.rawDetails) {
      return {
        success: true,
        isolatedSvg: transformed,
        instanceId,
        prefix,
        rootId,
        idMap
      };
    }

    return transformed;
  }

  /**
   * Extracts embedded widget manifest from raw SVG string.
   */
  function extractManifestFromSVG(rawSvg) {
    if (!rawSvg || typeof rawSvg !== 'string') return null;
    const re = new RegExp(/<script\b[^>]*\bid=["'](?:[^"']*__)?sva-widget-manifest["'][^>]*>([\s\S]*?)<\//.source + 'script>', 'i');
    const match = re.exec(rawSvg);
    if (match && match[1]) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed && Array.isArray(parsed.parameters)) {
          return parsed;
        }
      } catch (e) {
        console.warn('[SVGWidget] Failed to parse embedded manifest JSON:', e);
      }
    }
    return null;
  }

  /**
   * Validates a candidate value against a parameter definition.
   */
  function validateParameterValue(paramDef, value) {
    if (value === undefined || value === null) {
      return { valid: false, error: `Value for parameter '${paramDef.name}' cannot be null or undefined.` };
    }
    switch (paramDef.type) {
      case 'color': {
        const str = String(value).trim();
        if (!COLOR_REGEX.test(str)) {
          return { valid: false, error: `Invalid color value '${value}' for parameter '${paramDef.name}'. Must be a valid hex, rgb, hsl, or named color.` };
        }
        return { valid: true, value: str };
      }
      case 'number':
      case 'speed': {
        const num = Number(value);
        if (isNaN(num) || !isFinite(num)) {
          return { valid: false, error: `Value '${value}' for parameter '${paramDef.name}' must be a finite number.` };
        }
        if (paramDef.min !== undefined && paramDef.min !== null && num < paramDef.min) {
          return { valid: false, error: `Value ${num} is below minimum allowed (${paramDef.min}) for parameter '${paramDef.name}'.` };
        }
        if (paramDef.max !== undefined && paramDef.max !== null && num > paramDef.max) {
          return { valid: false, error: `Value ${num} is above maximum allowed (${paramDef.max}) for parameter '${paramDef.name}'.` };
        }
        return { valid: true, value: num };
      }
      case 'boolean': {
        return { valid: true, value: Boolean(value) };
      }
      case 'enum': {
        const strVal = String(value);
        if (Array.isArray(paramDef.options) && paramDef.options.length > 0) {
          if (!paramDef.options.includes(strVal)) {
            return {
              valid: false,
              error: `Value '${strVal}' is not a permitted option for enum parameter '${paramDef.name}'. Permitted options: [${paramDef.options.join(', ')}]`
            };
          }
        }
        return { valid: true, value: strVal };
      }
      case 'text': {
        if (paramDef.property === 'samples') {
          let tokens = [];
          if (Array.isArray(value)) {
            tokens = value.map(String);
          } else {
            let trimmed = String(value).trim();
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
              trimmed = trimmed.slice(1, -1).trim();
            }
            if (!trimmed) {
              return { valid: false, error: `Oscilloscope samples for parameter '${paramDef.name}' cannot be empty.` };
            }
            tokens = trimmed.split(/[\s,;]+/).filter(Boolean);
          }
          if (tokens.length < 2 || tokens.length > 64) {
            return { valid: false, error: `Oscilloscope samples for parameter '${paramDef.name}' must contain between 2 and 64 numeric values (got ${tokens.length}).` };
          }
          const nums = [];
          for (let i = 0; i < tokens.length; i++) {
            const n = Number(tokens[i]);
            if (!Number.isFinite(n)) {
              return { valid: false, error: `Invalid oscilloscope sample '${tokens[i]}' at index ${i} for parameter '${paramDef.name}'.` };
            }
            nums.push(n);
          }
          return { valid: true, value: nums.join(', ') };
        }
        return { valid: true, value: String(value) };
      }
      default:
        return { valid: true, value };
    }
  }

  /**
   * Resolves semantic target name to a DOM element inside the mounted SVG.
   * Handles authored IDs, isolated IDs (prefix__id), semantic targets and stable entity IDs.
   */
  function resolveTargetElement(svgEl, idMap, targetName) {
    if (!svgEl) return null;
    if (!targetName || targetName === 'root' || targetName === 'svg' || targetName === 'global') {
      return svgEl;
    }

    // 1. Exact data-semantic-target match (e.g. data-semantic-target="flow-1")
    let el = svgEl.querySelector(`[data-semantic-target="${targetName}"]`);
    if (el) return el;

    // 2. Exact data-semantic-name match (e.g. data-semantic-name="mail-flow")
    el = svgEl.querySelector(`[data-semantic-name="${targetName}"]`);
    if (el) return el;

    // 3. idMap direct lookup (authored ID -> isolated ID)
    if (idMap && idMap[targetName]) {
      const mappedId = idMap[targetName];
      el = svgEl.querySelector(`#${mappedId}`) || (svgEl.ownerDocument && svgEl.ownerDocument.getElementById(mappedId));
      if (el) return el;
    }

    // 4. idMap suffix lookup (handles multi-stage isolation e.g. target "flow-1" matching idMap key "mail__flow-1")
    if (idMap) {
      for (const [authoredKey, isolatedVal] of Object.entries(idMap)) {
        if (authoredKey === targetName || authoredKey.endsWith('__' + targetName) || authoredKey.endsWith('-' + targetName)) {
          el = svgEl.querySelector(`#${isolatedVal}`) || (svgEl.ownerDocument && svgEl.ownerDocument.getElementById(isolatedVal));
          if (el) return el;
        }
      }
    }

    // 5. Stable entity data attributes (data-node-id, data-flow-id, data-image-id, data-glow-id, data-ripple-id, data-lite-id, data-group-id)
    el = svgEl.querySelector(`[data-node-id="${targetName}"], [data-flow-id="${targetName}"], [data-image-id="${targetName}"], [data-glow-id="${targetName}"], [data-ripple-id="${targetName}"], [data-lite-id="${targetName}"], [data-group-id="${targetName}"]`);
    if (el) return el;

    // Stripped prefix fallback (e.g. "node-1" -> "1", "group-1" -> "1")
    const strippedId = String(targetName).replace(/^(node|flow|glow|ripple|image|lite|group)-/, '');
    if (strippedId !== targetName) {
      el = svgEl.querySelector(`[data-node-id="${strippedId}"], [data-flow-id="${strippedId}"], [data-image-id="${strippedId}"], [data-glow-id="${strippedId}"], [data-ripple-id="${strippedId}"], [data-lite-id="${strippedId}"], [data-group-id="${strippedId}"], [data-group-id="group-${strippedId}"]`);
      if (el) return el;
    }

    // 6. Direct or isolated ID query (exact match or endsWith __targetName)
    try {
      el = svgEl.querySelector(`#${targetName}`);
      if (el) return el;
      el = svgEl.querySelector(`[id$="__${targetName}"], [id$="-${targetName}"]`);
      if (el) return el;
    } catch (e) {}

    // 7. CSS selector fallback
    try {
      el = svgEl.querySelector(targetName);
      if (el) return el;
    } catch (e) {}

    return null;
  }

  function getEffectiveLocalSpeedFactor(node, fallbackEl) {
    let factor = 1.0;
    const startEl = node || fallbackEl;
    if (!startEl) return factor;
    const groupEl = (typeof startEl.closest === 'function' && startEl.closest('[data-group-id], .scene-group')) ||
      ((fallbackEl && typeof fallbackEl.hasAttribute === 'function' && (fallbackEl.hasAttribute('data-group-id') || fallbackEl.classList?.contains('scene-group'))) ? fallbackEl : null);
    const memberEl = (typeof startEl.closest === 'function' && startEl.closest('[data-lite-id], [data-flow-id], [data-node-id], [data-glow-id], [data-ripple-id]')) ||
      ((fallbackEl && fallbackEl !== groupEl) ? fallbackEl : null);
    if (groupEl && typeof groupEl.getAttribute === 'function') {
      const gSpd = parseFloat(groupEl.getAttribute('data-local-speed'));
      if (Number.isFinite(gSpd) && gSpd > 0) factor *= gSpd;
    }
    if (memberEl && memberEl !== groupEl && typeof memberEl.getAttribute === 'function') {
      const mSpd = parseFloat(memberEl.getAttribute('data-local-speed'));
      if (Number.isFinite(mSpd) && mSpd > 0) factor *= mSpd;
    }
    return factor;
  }

  /**
   * Applies targeted animation speed multiplier to element sub-animations,
   * respecting the formula: Effective Speed = Master Playback Rate × Group Speed × Member Speed.
   */
  function applyTargetedSpeed(el, localRate, masterRate) {
    if (!el) return;
    const lRate = Number(localRate);
    const mRate = Number(masterRate);
    const validLocal = (!isNaN(lRate) && lRate > 0) ? lRate : 1.0;
    const validMaster = (!isNaN(mRate) && mRate >= 0) ? mRate : 1.0;
    if (typeof el.setAttribute === 'function') {
      el.setAttribute('data-local-speed', String(validLocal));
    }

    const computeNodeSpeed = (node) => {
      const localFactor = getEffectiveLocalSpeedFactor(node, el);
      return Math.max(0.001, validMaster * localFactor);
    };

    // 1. Web Animations API within target element subtree only
    if (typeof el.getAnimations === 'function') {
      const anims = el.getAnimations({ subtree: true });
      if (anims && anims.length > 0) {
        anims.forEach((a) => {
          const targetNode = (a && a.effect && a.effect.target) ? a.effect.target : el;
          const eff = computeNodeSpeed(targetNode);
          try { a.playbackRate = eff; } catch (err) {}
        });
      }
    }

    // 2. SMIL animations (<animate>, <animateMotion>, <animateTransform>) in target element subtree
    if (typeof el.querySelectorAll === 'function') {
      el.querySelectorAll('animate, animateMotion, animateTransform').forEach((animEl) => {
        let baseDur = animEl.getAttribute('data-base-dur');
        if (!baseDur) {
          const curDurStr = animEl.getAttribute('dur') || '2s';
          const curDur = parseFloat(curDurStr) || 2;
          baseDur = String(curDur);
          animEl.setAttribute('data-base-dur', baseDur);
        }
        const eff = computeNodeSpeed(animEl);
        const newDur = (parseFloat(baseDur) / eff).toFixed(3);
        animEl.setAttribute('dur', `${newDur}s`);
      });

      // 3. CSS @keyframes animations on Lite effect payloads
      el.querySelectorAll('.lite-payload').forEach((payEl) => {
        if (!payEl.style) return;
        let baseDur = payEl.getAttribute('data-base-dur') || (payEl.style.getPropertyValue && payEl.style.getPropertyValue('--sva-base-dur'));
        if (!baseDur) {
          baseDur = payEl.style.animationDuration || '3s';
        }
        const parsed = parseFloat(baseDur);
        if (!isNaN(parsed) && parsed > 0) {
          payEl.setAttribute('data-base-dur', String(parsed));
          const eff = computeNodeSpeed(payEl);
          const newDur = parsed / eff;
          payEl.style.animationDuration = `${newDur.toFixed(4)}s`;
          const phaseRatio = parseFloat(payEl.style.getPropertyValue && payEl.style.getPropertyValue('--sva-phase-ratio'));
          if (!isNaN(phaseRatio) && phaseRatio > 0) {
            payEl.style.animationDelay = `${(-phaseRatio * newDur).toFixed(4)}s`;
          }
        }
      });
    }
  }

  function updateGaugeLiteDOM(el) {
    if (!el || el.getAttribute('data-lite-kind') !== 'gauge-lite') return;
    const variant = el.getAttribute('data-gauge-variant') || 'ring';
    const minV = parseFloat(el.getAttribute('data-gauge-min'));
    const maxV = parseFloat(el.getAttribute('data-gauge-max'));
    const val = parseFloat(el.getAttribute('data-gauge-value'));
    const safeMin = Number.isFinite(minV) ? minV : 0;
    const safeMax = (Number.isFinite(maxV) && maxV > safeMin) ? maxV : (safeMin + 100);
    const safeVal = Number.isFinite(val) ? val : safeMin;
    const span = safeMax - safeMin;
    const rawFrac = span > 0 ? (safeVal - safeMin) / span : 0;
    const frac = Math.max(0, Math.min(1, rawFrac));
    el.setAttribute('data-gauge-fraction', frac.toFixed(4));

    const baseColor = el.getAttribute('data-gauge-base-color') || '#38bdf8';
    const bgCol = el.getAttribute('data-gauge-bg-color') || '#1e293b';
    const useThresh = el.getAttribute('data-gauge-use-thresholds') === 'true';
    const warnT = parseFloat(el.getAttribute('data-gauge-warn-threshold'));
    const critT = parseFloat(el.getAttribute('data-gauge-crit-threshold'));
    const warnCol = el.getAttribute('data-gauge-warn-color') || '#f59e0b';
    const critCol = el.getAttribute('data-gauge-crit-color') || '#ef4444';
    const overrideColor = el.getAttribute('data-gauge-override-color') || '';
    const hasOverride = el.getAttribute('data-gauge-color-override') === 'true' && overrideColor !== '';
    const dir = el.getAttribute('data-gauge-direction') === 'reverse' ? 'reverse' : 'forward';

    let activeColor = baseColor;
    if (hasOverride) {
      activeColor = overrideColor;
    } else if (el.hasAttribute('data-gauge-t1-enabled')) {
      const enabledBands = [];
      for (let i = 1; i <= 4; i++) {
        if (el.getAttribute(`data-gauge-t${i}-enabled`) === 'true') {
          const tv = parseFloat(el.getAttribute(`data-gauge-t${i}-value`));
          const tc = el.getAttribute(`data-gauge-t${i}-color`) || baseColor;
          if (Number.isFinite(tv)) {
            enabledBands.push({ idx: i, value: tv, color: tc });
          }
        }
      }
      enabledBands.sort((a, b) => (a.value !== b.value ? (a.value - b.value) : (a.idx - b.idx)));
      for (const band of enabledBands) {
        if (safeVal >= band.value) {
          activeColor = band.color;
        }
      }
    } else if (useThresh) {
      if (Number.isFinite(critT) && safeVal >= critT) activeColor = critCol;
      else if (Number.isFinite(warnT) && safeVal >= warnT) activeColor = warnCol;
    }
    el.setAttribute('data-gauge-active-color', activeColor);

    const x = parseFloat(el.getAttribute('data-gauge-x')) || 0;
    const y = parseFloat(el.getAttribute('data-gauge-y')) || 0;
    const w = parseFloat(el.getAttribute('data-gauge-w')) || 96;
    const h = parseFloat(el.getAttribute('data-gauge-h')) || 96;
    const cr = parseFloat(el.getAttribute('data-gauge-cr')) || 6;

    if (variant === 'ring') {
      const arc = el.querySelector('.lite-gauge-arc');
      const track = el.querySelector('.lite-gauge-track');
      if (track) {
        track.setAttribute('stroke', bgCol);
        if (track.style) track.style.stroke = bgCol;
      }
      if (arc) {
        const arcLen = Number((frac * 100).toFixed(3));
        arc.setAttribute('stroke-dasharray', arcLen <= 0.001 ? '0 200' : `${arcLen} 200`);
        arc.setAttribute('stroke-linecap', arcLen <= 0.001 ? 'butt' : 'round');
        arc.setAttribute('stroke', activeColor);
        if (arc.style) arc.style.stroke = activeColor;
      }
    } else if (variant === 'hbar') {
      const track = el.querySelector('.lite-gauge-track');
      const fillRect = el.querySelector('.lite-gauge-hbar');
      if (track) {
        track.setAttribute('fill', bgCol);
        track.setAttribute('stroke', bgCol);
      }
      if (fillRect) {
        const barR = Math.min(cr, h / 2, w / 2);
        const fillW = Number((w * frac).toFixed(2));
        const fillX = dir === 'reverse' ? (x + w - fillW) : x;
        const fillR = fillW > 0.5 ? Math.min(barR, fillW / 2) : 0;
        fillRect.setAttribute('x', fillX.toFixed(2));
        fillRect.setAttribute('width', fillW.toFixed(2));
        fillRect.setAttribute('rx', fillR.toFixed(2));
        fillRect.setAttribute('fill', activeColor);
        if (fillRect.style) fillRect.style.fill = activeColor;
      }
    } else if (variant === 'vbar') {
      const track = el.querySelector('.lite-gauge-track');
      const fillRect = el.querySelector('.lite-gauge-vbar');
      if (track) {
        track.setAttribute('fill', bgCol);
        track.setAttribute('stroke', bgCol);
      }
      if (fillRect) {
        const barR = Math.min(cr, w / 2, h / 2);
        const fillH = Number((h * frac).toFixed(2));
        const fillY = dir === 'reverse' ? y : (y + h - fillH);
        const fillR = fillH > 0.5 ? Math.min(barR, fillH / 2) : 0;
        fillRect.setAttribute('y', fillY.toFixed(2));
        fillRect.setAttribute('height', fillH.toFixed(2));
        fillRect.setAttribute('rx', fillR.toFixed(2));
        fillRect.setAttribute('fill', activeColor);
        if (fillRect.style) fillRect.style.fill = activeColor;
      }
    } else if (variant === 'segmented') {
      const cells = Array.from(el.querySelectorAll('.lite-gauge-cell'));
      const segCount = cells.length || parseInt(el.getAttribute('data-gauge-segments') || '10', 10) || 10;
      const activeSegs = frac <= 0 ? 0 : Math.min(segCount, Math.round(frac * segCount));
      cells.forEach((cell, idx) => {
        const logicalIdxAttr = cell.getAttribute('data-cell-index');
        const logicalIdx = logicalIdxAttr !== null ? parseInt(logicalIdxAttr, 10) : (dir === 'reverse' ? (segCount - 1 - idx) : idx);
        const isLit = logicalIdx < activeSegs;
        const cCol = isLit ? activeColor : bgCol;
        cell.setAttribute('data-cell-lit', isLit ? 'true' : 'false');
        cell.setAttribute('fill', cCol);
        if (cell.style) cell.style.fill = cCol;
      });
    } else if (variant === 'level') {
      const vessel = el.querySelector('.lite-gauge-vessel');
      const fillRect = el.querySelector('.lite-gauge-level');
      if (vessel) {
        vessel.setAttribute('fill', bgCol);
        vessel.setAttribute('stroke', activeColor);
        if (vessel.style) vessel.style.stroke = activeColor;
      }
      if (fillRect) {
        const innerY = parseFloat(fillRect.getAttribute('data-inner-y')) || (y + 4);
        const innerH = parseFloat(fillRect.getAttribute('data-inner-h')) || Math.max(2, h - 8);
        const fillH = Number((innerH * frac).toFixed(2));
        const fillY = dir === 'reverse' ? innerY : (innerY + innerH - fillH);
        fillRect.setAttribute('y', fillY.toFixed(2));
        fillRect.setAttribute('height', fillH.toFixed(2));
        fillRect.setAttribute('fill', activeColor);
        if (fillRect.style) fillRect.style.fill = activeColor;
      }
    }

    const unitStr = el.getAttribute('data-gauge-unit') || '';
    const labelStr = el.getAttribute('data-gauge-label') || '';
    const formattedVal = Number.isInteger(safeVal) ? String(safeVal) : String(Math.round(safeVal * 100) / 100);
    const displayStr = `${formattedVal}${unitStr}`;
    const valTxtEl = el.querySelector('.lite-gauge-value-text');
    if (valTxtEl) {
      valTxtEl.textContent = ((variant === 'hbar' || variant === 'segmented') && labelStr) ? `${labelStr}: ${displayStr}` : displayStr;
    }
  }

  function buildOscilloscopeLitePath(el) {
    const variant = el.getAttribute('data-osc-variant') || 'ecg';
    const mode = el.getAttribute('data-osc-mode') || 'animated';
    const x = parseFloat(el.getAttribute('data-osc-x')) || 0;
    const y = parseFloat(el.getAttribute('data-osc-y')) || 0;
    const w = Math.max(5, parseFloat(el.getAttribute('data-osc-w')) || 180);
    const h = Math.max(5, parseFloat(el.getAttribute('data-osc-h')) || 76);
    const cycles = Math.max(1, Math.min(12, parseInt(el.getAttribute('data-osc-cycles') || '2', 10) || 2));
    const ampFrac = Math.max(0.05, Math.min(1.0, parseFloat(el.getAttribute('data-osc-amplitude')) || 0.75));
    const basePct = Math.max(10, Math.min(90, parseFloat(el.getAttribute('data-osc-baseline')) || 50));
    const yBase = y + h * (basePct / 100);
    const maxRoom = Math.max(2, Math.min(yBase - y - 4, (y + h) - yBase - 4));
    const ampPx = maxRoom * ampFrac;

    if (mode === 'sampled') {
      const rawSamples = el.getAttribute('data-osc-samples') || '0, 0.4, 0.9, 0.3, -0.5, -0.9, -0.2, 0.6, 1.0, 0.2, -0.4, 0';
      const tokens = String(rawSamples).replace(/^\[|\]$/g, '').trim().split(/[\s,;]+/).filter(Boolean);
      const samples = tokens.map(Number).filter(Number.isFinite);
      if (samples.length < 2) return `M ${x.toFixed(2)} ${yBase.toFixed(2)} L ${(x + w).toFixed(2)} ${yBase.toFixed(2)}`;
      let maxAbs = 0;
      for (let i = 0; i < samples.length; i++) {
        const a = Math.abs(samples[i]);
        if (a > maxAbs) maxAbs = a;
      }
      const normDiv = maxAbs > 1.0 ? maxAbs : 1.0;
      const pts = samples.map((v, i) => {
        const px = x + (i / (samples.length - 1)) * w;
        const py = yBase - (v / normDiv) * ampPx;
        return { x: Number(px.toFixed(2)), y: Number(py.toFixed(2)) };
      });
      if (variant === 'bezier' && pts.length >= 3) {
        let d = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i];
          const p1 = pts[i + 1];
          const cpx1 = Number((p0.x + (p1.x - p0.x) * 0.45).toFixed(2));
          const cpx2 = Number((p0.x + (p1.x - p0.x) * 0.55).toFixed(2));
          d += ` C ${cpx1} ${p0.y} ${cpx2} ${p1.y} ${p1.x} ${p1.y}`;
        }
        return d;
      }
      return pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    }

    const tileCount = mode === 'animated' ? 2 : 1;
    const totalCycles = cycles * tileCount;
    const periodW = w / cycles;
    let d = `M ${x.toFixed(2)} ${yBase.toFixed(2)}`;

    for (let c = 0; c < totalCycles; c++) {
      const x0 = x + c * periodW;
      if (variant === 'sine') {
        const steps = 16;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const px = x0 + t * periodW;
          const py = yBase - Math.sin(t * Math.PI * 2) * ampPx;
          d += ` L ${px.toFixed(2)} ${py.toFixed(2)}`;
        }
      } else if (variant === 'square') {
        const xMid = x0 + periodW * 0.5;
        const xEnd = x0 + periodW;
        const yHigh = yBase - ampPx;
        const yLow = yBase + ampPx;
        d += ` L ${x0.toFixed(2)} ${yHigh.toFixed(2)} L ${xMid.toFixed(2)} ${yHigh.toFixed(2)} L ${xMid.toFixed(2)} ${yLow.toFixed(2)} L ${xEnd.toFixed(2)} ${yLow.toFixed(2)} L ${xEnd.toFixed(2)} ${yBase.toFixed(2)}`;
      } else if (variant === 'triangle') {
        const x1 = x0 + periodW * 0.25;
        const x2 = x0 + periodW * 0.75;
        const x3 = x0 + periodW;
        d += ` L ${x1.toFixed(2)} ${(yBase - ampPx).toFixed(2)} L ${x2.toFixed(2)} ${(yBase + ampPx).toFixed(2)} L ${x3.toFixed(2)} ${yBase.toFixed(2)}`;
      } else if (variant === 'sawtooth') {
        const xPeak = x0 + periodW * 0.5;
        const xEnd = x0 + periodW;
        d += ` L ${xPeak.toFixed(2)} ${(yBase - ampPx).toFixed(2)} L ${xPeak.toFixed(2)} ${(yBase + ampPx).toFixed(2)} L ${xEnd.toFixed(2)} ${yBase.toFixed(2)}`;
      } else if (variant === 'polyline') {
        const anchors = [
          [0.15, 0.45],
          [0.32, -0.35],
          [0.50, 0.95],
          [0.68, -0.75],
          [0.85, 0.30],
          [1.00, 0.00]
        ];
        for (let i = 0; i < anchors.length; i++) {
          const px = x0 + anchors[i][0] * periodW;
          const py = yBase - anchors[i][1] * ampPx;
          d += ` L ${px.toFixed(2)} ${py.toFixed(2)}`;
        }
      } else if (variant === 'bezier') {
        const xMid = x0 + periodW * 0.5;
        const xEnd = x0 + periodW;
        const cp1x = x0 + periodW * 0.18;
        const cp2x = x0 + periodW * 0.32;
        const cp3x = x0 + periodW * 0.68;
        const cp4x = x0 + periodW * 0.82;
        const yHigh = yBase - ampPx;
        const yLow = yBase + ampPx;
        d += ` C ${cp1x.toFixed(2)} ${yHigh.toFixed(2)} ${cp2x.toFixed(2)} ${yHigh.toFixed(2)} ${xMid.toFixed(2)} ${yBase.toFixed(2)}`;
        d += ` C ${cp3x.toFixed(2)} ${yLow.toFixed(2)} ${cp4x.toFixed(2)} ${yLow.toFixed(2)} ${xEnd.toFixed(2)} ${yBase.toFixed(2)}`;
      } else {
        const ecgPts = [
          [0.18, 0.00],
          [0.24, 0.18],
          [0.30, 0.00],
          [0.38, 0.00],
          [0.42, -0.22],
          [0.48, 1.00],
          [0.54, -0.45],
          [0.60, 0.00],
          [0.70, 0.00],
          [0.78, 0.32],
          [0.86, 0.00],
          [1.00, 0.00]
        ];
        for (let i = 0; i < ecgPts.length; i++) {
          const px = x0 + ecgPts[i][0] * periodW;
          const py = yBase - ecgPts[i][1] * ampPx;
          d += ` L ${px.toFixed(2)} ${py.toFixed(2)}`;
        }
      }
    }
    return d;
  }

  function updateOscilloscopeLiteDOM(el) {
    if (!el || el.getAttribute('data-lite-kind') !== 'oscilloscope-lite') return;
    const waveEl = el.querySelector('.lite-osc-wave');
    if (waveEl) {
      waveEl.setAttribute('d', buildOscilloscopeLitePath(el));
    }
  }

  let _graphemeSegmenter = null;
  function segmentGraphemes(str) {
    const s = String(str === undefined || str === null ? '' : str);
    if (!s) return [];
    if (!_graphemeSegmenter && typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      try {
        _graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      } catch (e) {}
    }
    if (_graphemeSegmenter) {
      try {
        const out = [];
        for (const seg of _graphemeSegmenter.segment(s)) {
          out.push(seg.segment);
        }
        return out;
      } catch (e) {}
    }
    return Array.from(s);
  }

  function getTextLiteTargetNode(el) {
    if (!el) return null;
    const txtEl = el.querySelector('.lite-text-element') || el.querySelector('text');
    if (!txtEl) return null;
    const tp = txtEl.querySelector('.lite-text-path-link') || txtEl.querySelector('textPath');
    return tp || txtEl;
  }

  function measureTextLiteWidth(el, txtEl, textStr) {
    const fs = Math.max(8, parseFloat(el.getAttribute('data-text-font-size')) || 18);
    const ls = parseFloat(el.getAttribute('data-text-letter-spacing')) || 0;
    const graphemes = segmentGraphemes(textStr);
    const estW = Math.max(0, graphemes.length * (fs * 0.56 + ls));
    if (txtEl && typeof txtEl.getComputedTextLength === 'function') {
      try {
        const m = txtEl.getComputedTextLength();
        if (Number.isFinite(m) && m > 0) return m;
      } catch (e) {}
    }
    return estW;
  }

  let _widgetMeasureCtx = null;
  function measureWidgetTextStringWidth(str, fontFamily, fontSize, fontWeight, letterSpacing) {
    const s = String(str === undefined || str === null ? '' : str);
    if (!s) return 0;
    const gs = segmentGraphemes(s);
    const estW = Math.max(0, gs.length * (fontSize * 0.56 + letterSpacing));
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      try {
        if (!_widgetMeasureCtx) {
          const c = document.createElement('canvas');
          _widgetMeasureCtx = c && typeof c.getContext === 'function' ? c.getContext('2d') : null;
        }
        if (_widgetMeasureCtx) {
          _widgetMeasureCtx.font = `${fontWeight || '600'} ${fontSize}px ${fontFamily || 'sans-serif'}`;
          const m = _widgetMeasureCtx.measureText(s);
          if (m && Number.isFinite(m.width) && m.width > 0) {
            return m.width + Math.max(0, gs.length - 1) * letterSpacing;
          }
        }
      } catch (e) {}
    }
    return estW;
  }

  function computeWidgetTextLiteLines(el, txtEl, textStr) {
    const raw = String(textStr === undefined || textStr === null ? '' : textStr).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let anim = el.getAttribute('data-text-anim') || 'none';
    if (anim === 'overtype') anim = 'typewriter';
    if (anim === 'stacked-v') {
      const gs = segmentGraphemes(raw.replace(/\n/g, ' '));
      return gs.length > 0 ? gs : [''];
    }
    const explicitLines = raw.split('\n');
    const wordWrap = el.getAttribute('data-text-word-wrap') !== 'false';
    const w = Math.max(5, parseFloat(el.getAttribute('data-text-w')) || 220);
    const pad = Math.max(0, parseFloat(el.getAttribute('data-text-padding')) || 12);
    const availW = Math.max(5, w - pad * 2);
    const fs = Math.max(8, parseFloat(el.getAttribute('data-text-font-size')) || 18);
    const fw = el.getAttribute('data-text-font-weight') || '600';
    const ls = parseFloat(el.getAttribute('data-text-letter-spacing')) || 0;
    const ff = (txtEl && txtEl.getAttribute('font-family')) || 'sans-serif';

    if (!(wordWrap && anim === 'ticker-v' && availW > fs)) {
      return explicitLines.length > 0 ? explicitLines : [''];
    }
    const wrapped = [];
    for (let i = 0; i < explicitLines.length; i++) {
      const line = explicitLines[i];
      if (!line.trim()) {
        wrapped.push(line);
        continue;
      }
      const words = line.split(/(\s+)/).filter((tok) => tok.length > 0);
      let current = '';
      for (let wIdx = 0; wIdx < words.length; wIdx++) {
        const tok = words[wIdx];
        if (/^\s+$/.test(tok)) {
          if (current.length > 0) current += ' ';
          continue;
        }
        const candidate = current ? (current + tok) : tok;
        const candW = measureWidgetTextStringWidth(candidate, ff, fs, fw, ls);
        if (current && candW > availW) {
          wrapped.push(current.trimEnd());
          current = tok;
        } else {
          current = candidate;
        }
      }
      if (current || wrapped.length === 0) {
        wrapped.push(current.trimEnd());
      }
    }
    return wrapped.length > 0 ? wrapped : [''];
  }

  function renderWidgetTextLiteLinesToDOM(el, textStr) {
    if (!el) return { lineCount: 1, blockH: 18 };
    const txtEl = el.querySelector('.lite-text-element') || el.querySelector('text');
    const tp = txtEl ? (txtEl.querySelector('.lite-text-path-link') || txtEl.querySelector('textPath')) : null;
    const fs = Math.max(8, parseFloat(el.getAttribute('data-text-font-size')) || 18);
    const lineSpacing = Math.max(0.8, Math.min(3.0, parseFloat(el.getAttribute('data-text-line-spacing')) || 1.25));
    const lineAdvance = fs * lineSpacing;
    if (!txtEl) return { lineCount: 1, blockH: fs };
    if (tp) {
      tp.textContent = String(textStr === undefined || textStr === null ? '' : textStr).replace(/\r?\n/g, ' ');
      return { lineCount: 1, blockH: fs };
    }
    let anim = el.getAttribute('data-text-anim') || 'none';
    if (anim === 'overtype') anim = 'typewriter';
    const lines = computeWidgetTextLiteLines(el, txtEl, textStr);
    const lineCount = Math.max(1, lines.length);
    const blockH = fs + (lineCount - 1) * lineAdvance;
    el.setAttribute('data-text-line-count', String(lineCount));
    el.setAttribute('data-text-block-h', blockH.toFixed(2));

    const x = parseFloat(el.getAttribute('data-text-x')) || 0;
    const y = parseFloat(el.getAttribute('data-text-y')) || 0;
    const w = Math.max(5, parseFloat(el.getAttribute('data-text-w')) || 220);
    const h = Math.max(5, parseFloat(el.getAttribute('data-text-h')) || 56);
    const cx = parseFloat(el.getAttribute('data-text-cx')) || (x + w / 2);
    const cy = parseFloat(el.getAttribute('data-text-cy')) || (y + h / 2);
    const pad = Math.max(0, parseFloat(el.getAttribute('data-text-padding')) || 12);
    const hAlign = el.getAttribute('data-text-align') || 'center';
    const vAlign = el.getAttribute('data-text-valign') || 'middle';

    let textX = cx;
    if (anim === 'ticker-h') {
      textX = x;
    } else if (hAlign === 'left') {
      textX = x + pad;
    } else if (hAlign === 'right') {
      textX = x + w - pad;
    }

    let firstLineY = cy - ((lineCount - 1) * lineAdvance) / 2 + fs * 0.35;
    if (anim === 'ticker-v' || anim === 'stacked-v') {
      firstLineY = y + fs * 0.85;
    } else if (vAlign === 'top') {
      firstLineY = y + pad + fs * 0.82;
    } else if (vAlign === 'bottom') {
      firstLineY = y + h - pad - fs * 0.18 - (lineCount - 1) * lineAdvance;
    }

    txtEl.setAttribute('x', textX.toFixed(2));
    txtEl.setAttribute('y', firstLineY.toFixed(2));

    if (lines.length <= 1) {
      txtEl.textContent = lines[0] || '';
    } else {
      const ns = 'http://www.w3.org/2000/svg';
      txtEl.textContent = '';
      for (let i = 0; i < lines.length; i++) {
        const tspan = (txtEl.ownerDocument || document).createElementNS(ns, 'tspan');
        tspan.setAttribute('class', 'lite-text-line');
        tspan.setAttribute('x', textX.toFixed(2));
        tspan.setAttribute('y', (firstLineY + i * lineAdvance).toFixed(2));
        tspan.textContent = lines[i].length > 0 ? lines[i] : '\u00A0';
        txtEl.appendChild(tspan);
      }
    }
    return { lineCount, blockH, lineAdvance };
  }

  function configureTextLiteTicker(el, ctrl) {
    if (!el) return;
    let anim = el.getAttribute('data-text-anim') || 'none';
    if (anim === 'overtype') anim = 'typewriter';
    if (anim !== 'ticker-h' && anim !== 'ticker-v' && anim !== 'stacked-v') return;
    const txtEl = el.querySelector('.lite-text-element') || el.querySelector('text');
    if (!txtEl) return;
    const currentStr = ctrl ? ctrl.currentText : (el.getAttribute('data-text-content') || '');
    const layoutInfo = renderWidgetTextLiteLinesToDOM(el, currentStr);
    const w = Math.max(5, parseFloat(el.getAttribute('data-text-w')) || 220);
    const h = Math.max(5, parseFloat(el.getAttribute('data-text-h')) || 56);
    const pad = Math.max(0, parseFloat(el.getAttribute('data-text-padding')) || 12);
    const fs = Math.max(8, parseFloat(el.getAttribute('data-text-font-size')) || 18);
    const spd = Math.max(10, Math.min(600, parseFloat(el.getAttribute('data-text-scroll-speed')) || 90));
    const linesPerSec = Math.max(0.1, Math.min(20, parseFloat(el.getAttribute('data-text-lines-per-sec')) || 1.2));
    const lineSpacing = Math.max(0.8, Math.min(3.0, parseFloat(el.getAttribute('data-text-line-spacing')) || 1.25));
    const typeSpeed = Math.max(1, Math.min(120, parseFloat(el.getAttribute('data-text-type-speed')) || 14));
    const dir = el.getAttribute('data-text-direction') === 'reverse' ? 'reverse' : 'forward';
    const pMode = el.getAttribute('data-text-playback-mode') || 'loop';

    if (anim === 'ticker-h') {
      const tw = measureTextLiteWidth(el, txtEl, currentStr);
      const dist = Math.max(20, w + tw);
      const baseDur = Math.max(0.15, dist / spd);
      const localSpdFactor = getEffectiveLocalSpeedFactor(txtEl, el);
      const dur = Math.max(0.05, baseDur / Math.max(0.001, localSpdFactor));
      const startPx = dir === 'reverse' ? (-tw) : w;
      const endPx = pMode === 'once' ? pad : (dir === 'reverse' ? w : (-tw));
      txtEl.setAttribute('data-ticker-measured-w', tw.toFixed(2));
      txtEl.setAttribute('data-base-dur', baseDur.toFixed(4));
      txtEl.setAttribute('data-ticker-duration-s', dur.toFixed(4));
      el.setAttribute('data-ticker-duration-s', dur.toFixed(4));
      if (txtEl.style && typeof txtEl.style.setProperty === 'function') {
        txtEl.style.setProperty('--sva-ticker-start', `${startPx.toFixed(2)}px`);
        txtEl.style.setProperty('--sva-ticker-end', `${endPx.toFixed(2)}px`);
        txtEl.style.setProperty('--sva-base-dur', `${baseDur.toFixed(4)}s`);
        txtEl.style.animationDuration = `${dur.toFixed(4)}s`;
      }
    } else if (anim === 'ticker-v' || anim === 'stacked-v') {
      const lineAdvance = fs * lineSpacing;
      const blockH = layoutInfo.blockH || fs;
      const effLinearSpd = anim === 'stacked-v'
        ? (typeSpeed * lineAdvance)
        : (linesPerSec * lineAdvance);
      const dist = Math.max(16, h + blockH);
      const baseDur = Math.max(0.15, dist / Math.max(1, effLinearSpd));
      const localSpdFactor = getEffectiveLocalSpeedFactor(txtEl, el);
      const dur = Math.max(0.05, baseDur / Math.max(0.001, localSpdFactor));
      const startPx = dir === 'reverse' ? (-blockH - 4) : (h + 4);
      const endPx = pMode === 'once' ? pad : (dir === 'reverse' ? (h + 4) : (-blockH - 4));
      txtEl.setAttribute('data-base-dur', baseDur.toFixed(4));
      txtEl.setAttribute('data-ticker-duration-s', dur.toFixed(4));
      el.setAttribute('data-ticker-duration-s', dur.toFixed(4));
      if (txtEl.style && typeof txtEl.style.setProperty === 'function') {
        txtEl.style.setProperty('--sva-ticker-start', `${startPx.toFixed(2)}px`);
        txtEl.style.setProperty('--sva-ticker-end', `${endPx.toFixed(2)}px`);
        txtEl.style.setProperty('--sva-base-dur', `${baseDur.toFixed(4)}s`);
        txtEl.style.animationDuration = `${dur.toFixed(4)}s`;
      }
    }
  }

  const TARGET_PROPERTY_CONSTRAINTS = {
    color: { type: 'color' },
    fill: { type: 'color' },
    stroke: { type: 'color' },
    bgColor: { type: 'color' },
    borderColor: { type: 'color' },
    visibility: { type: 'boolean' },
    play: { type: 'boolean' },
    showGuide: { type: 'boolean' },
    repeat: { type: 'boolean' },
    typeRepeat: { type: 'boolean' },
    text: { type: 'text' },
    textContent: { type: 'text' },
    labelText: { type: 'text' },
    unit: { type: 'text' },
    lineGapRatio: { type: 'text' },
    samples: { type: 'text', isSamples: true },
    opacity: { type: 'number', min: 0, max: 1 },
    bgOpacity: { type: 'number', min: 0, max: 1 },
    value: { type: 'number' },
    minValue: { type: 'number' },
    maxValue: { type: 'number' },
    speed: { type: 'number', min: 0, max: 30 },
    playbackRate: { type: 'number', min: 0.1, max: 10 },
    period: { type: 'number', min: 0.2, max: 30 },
    scrollSpeed: { type: 'number', min: 10, max: 600 },
    typeSpeed: { type: 'number', min: 1, max: 120 },
    strokeWidth: { type: 'number', min: 0, max: 32 },
    dashLength: { type: 'number', min: 2, max: 400 },
    gapLength: { type: 'number', min: 2, max: 300 },
    dotSize: { type: 'number', min: 1, max: 32 },
    delay: { type: 'number', min: 0, max: 30 },
    endDelay: { type: 'number', min: 0, max: 30 },
    segments: { type: 'number', min: 1, max: 32 },
    rings: { type: 'number', min: 1, max: 6 },
    curvature: { type: 'number', min: -100, max: 100 },
    startOffset: { type: 'number', min: 0, max: 100 },
    burstCycles: { type: 'number', min: 0, max: 100 },
    pauseSeconds: { type: 'number', min: 0, max: 300 },
    scale: { type: 'number', min: 0.1, max: 3.0 },
    minScale: { type: 'number', min: 0.05, max: 2.0 },
    intensity: { type: 'number', min: 0, max: 1.0 },
    armThickness: { type: 'number', min: 1, max: 20 },
    trigger: { type: 'number', min: 0, max: 1000000 },
    duration: { type: 'number', min: 20, max: 1000 },
    repeatInterval: { type: 'number', min: 0.2, max: 60 },
    fontSize: { type: 'number', min: 8, max: 120 },
    letterSpacing: { type: 'number', min: -2, max: 20 },
    padding: { type: 'number', min: 0, max: 60 },
    linesPerSec: { type: 'number', min: 0.1, max: 20 },
    lineSpacing: { type: 'number', min: 0.8, max: 3.0 },
    holdDelay: { type: 'number', min: 0, max: 30 },
    clearDuration: { type: 'number', min: 0, max: 30 },
    direction: { type: 'enum', options: ['cw', 'ccw', 'forward', 'reverse'] },
    playbackMode: { type: 'enum', options: ['loop', 'pingpong', 'once', 'static', 'animated', 'sampled'] },
    pauseVisibility: { type: 'enum', options: ['hide', 'hold'] },
    startMode: { type: 'enum', options: ['tunnel', 'abrupt'] },
    endMode: { type: 'enum', options: ['tunnel', 'abrupt'] },
    segmentStyle: { type: 'enum', options: ['solid', 'rounded', 'dashed', 'dots', 'fading-tail'] },
    typeMode: { type: 'enum', options: ['once', 'hold', 'delete', 'delete-forward'] },
    textAnim: { type: 'enum', options: ['none', 'ticker-h', 'ticker-v', 'stacked-v', 'typewriter', 'fade', 'flash', 'slide', 'blur-in', 'blur-out', 'scramble'] },
    state: { type: 'enum', options: ['running', 'paused', 'stopped'] },
    operatingState: { type: 'enum', options: ['running', 'paused', 'stopped'] }
  };

  function validateTargetActionAndValue(paramName, memberEl, targetName, propName, actionName, candidateVal) {
    const act = (actionName && String(actionName).trim().toLowerCase()) || '';
    if (act && act !== 'set') {
      const validActions = ['play', 'pause', 'resume', 'stop_reset', 'enable', 'disable'];
      if (!validActions.includes(act)) {
        return { valid: false, error: `Unsupported animation action '${actionName}' on target '${targetName}' for parameter '${paramName}'.` };
      }
      if (act === 'pause' || act === 'resume') {
        const isGroup = Boolean(memberEl.classList?.contains('scene-group')) ||
                        Boolean(typeof memberEl.hasAttribute === 'function' && memberEl.hasAttribute('data-group-id'));
        const isLite = Boolean(memberEl.classList?.contains('diagram-lite-instance')) ||
                       Boolean(typeof memberEl.hasAttribute === 'function' && (memberEl.hasAttribute('data-lite-id') || memberEl.hasAttribute('data-lite-kind'))) ||
                       Boolean(memberEl.querySelector?.('.lite-payload'));
        if (!isGroup && !isLite) {
          return {
            valid: false,
            error: `Animation action '${act}' is not supported on SMIL target '${targetName}' for parameter '${paramName}' (only CSS/JS Low-Load Effects and groups support mid-cycle pause/resume; use 'play' or 'stop_reset' for SMIL targets).`
          };
        }
      }
      return { valid: true, value: candidateVal };
    }
    const constraint = TARGET_PROPERTY_CONSTRAINTS[propName];
    if (!constraint) {
      return { valid: true, value: candidateVal };
    }
    const syntheticDef = {
      name: `${paramName} -> ${targetName}.${propName}`,
      type: constraint.type,
      property: propName,
      min: constraint.min,
      max: constraint.max,
      options: constraint.options
    };
    if (propName === 'value' && memberEl && typeof memberEl.getAttribute === 'function' && memberEl.getAttribute('data-lite-kind') === 'gauge-lite') {
      const gMin = parseFloat(memberEl.getAttribute('data-gauge-min'));
      const gMax = parseFloat(memberEl.getAttribute('data-gauge-max'));
      if (Number.isFinite(gMin)) syntheticDef.min = gMin;
      if (Number.isFinite(gMax) && (!Number.isFinite(gMin) || gMax > gMin)) syntheticDef.max = gMax;
    }
    return validateParameterValue(syntheticDef, candidateVal);
  }

  function applyLifecycleAction(el, svgEl, action, isInitialMount, instance) {
    if (!el || typeof el.getAttribute !== 'function') return;
    const act = String(action || '').trim().toLowerCase();
    const isGroup = Boolean(el.classList?.contains('scene-group')) ||
                    Boolean(typeof el.hasAttribute === 'function' && el.hasAttribute('data-group-id'));
    if (isGroup && typeof el.querySelectorAll === 'function') {
      if (act === 'enable') {
        el.style.visibility = 'visible';
        el.setAttribute('visibility', 'visible');
      } else if (act === 'disable') {
        el.style.visibility = 'hidden';
        el.setAttribute('visibility', 'hidden');
      }
      const members = el.querySelectorAll('[data-lite-kind], [data-lite-id], [data-node-id], [data-flow-id], [data-glow-id], [data-ripple-id], .diagram-node-instance, .diagram-flow-instance, .diagram-glow-instance, .diagram-ripple-instance, .diagram-lite-instance');
      members.forEach((m) => {
        if (m.tagName && m.tagName.toLowerCase() === 'g') {
          applyLifecycleAction(m, svgEl, act, isInitialMount, instance);
        }
      });
      return;
    }

    if (act === 'play') {
      applyPlayAnimationState(el, svgEl, true, isInitialMount, instance);
      return;
    }
    if (act === 'stop_reset') {
      applyPlayAnimationState(el, svgEl, false, isInitialMount, instance);
      return;
    }
    if (act === 'enable') {
      el.style.visibility = 'visible';
      el.setAttribute('visibility', 'visible');
      applyPlayAnimationState(el, svgEl, true, isInitialMount, instance);
      return;
    }
    if (act === 'disable') {
      applyPlayAnimationState(el, svgEl, false, isInitialMount, instance);
      el.style.visibility = 'hidden';
      el.setAttribute('visibility', 'hidden');
      return;
    }
    if (act === 'pause' || act === 'resume') {
      const isPause = act === 'pause';
      el.setAttribute('data-animation-paused', isPause ? 'true' : 'false');
      const liteKind = el.getAttribute('data-lite-kind') || '';
      if (liteKind === 'text-lite') {
        if (instance && typeof instance._pauseOrResumeTextLite === 'function') {
          instance._pauseOrResumeTextLite(el, isPause);
        }
        return;
      }
      if (typeof el.querySelectorAll === 'function') {
        el.querySelectorAll('.lite-payload, .lite-osc-wave').forEach((node) => {
          if (node.style) {
            node.style.animationPlayState = isPause ? 'paused' : 'running';
          }
        });
      }
    }
  }

  function applyPlayAnimationState(el, svgEl, shouldPlay, isInitialMount, instance) {
    if (!el || typeof el.getAttribute !== 'function') return;
    const prevAttr = el.getAttribute('data-play-animation');
    const wasStopped = (prevAttr === 'false' || el.getAttribute('data-lite-play') === 'false');
    el.setAttribute('data-play-animation', shouldPlay ? 'true' : 'false');

    const isGroup = Boolean(el.classList?.contains('scene-group')) ||
                    Boolean(typeof el.hasAttribute === 'function' && el.hasAttribute('data-group-id'));
    if (isGroup && typeof el.querySelectorAll === 'function') {
      const members = el.querySelectorAll('[data-lite-kind], [data-lite-id], [data-node-id], [data-flow-id], [data-glow-id], [data-ripple-id], .diagram-node-instance, .diagram-flow-instance, .diagram-glow-instance, .diagram-ripple-instance, .diagram-lite-instance');
      members.forEach((m) => {
        if (m.tagName && m.tagName.toLowerCase() === 'g') {
          applyPlayAnimationState(m, svgEl, shouldPlay, isInitialMount, instance);
        }
      });
      return;
    }

    const isLite = Boolean(el.classList?.contains('diagram-lite-instance')) ||
                   Boolean(typeof el.hasAttribute === 'function' && (el.hasAttribute('data-lite-id') || el.hasAttribute('data-lite-kind'))) ||
                   Boolean(el.querySelector?.('.lite-payload'));
    if (isLite) {
      el.setAttribute('data-lite-play', shouldPlay ? 'true' : 'false');
      const liteKind = el.getAttribute('data-lite-kind') || '';
      if (liteKind === 'text-lite') {
        if (instance && typeof instance._setTextLitePlayState === 'function') {
          instance._setTextLitePlayState(el, shouldPlay, isInitialMount, wasStopped);
        }
        return;
      }

      if (typeof el.querySelectorAll === 'function') {
        const animNodes = el.querySelectorAll('.lite-payload, .lite-osc-wave');
        const flowMode = el.getAttribute('data-flow-playback-mode') || '';
        animNodes.forEach((node) => {
          if (!node.hasAttribute('data-orig-inline-anim')) {
            const curInline = (node.style && node.style.animationName && node.style.animationName !== 'none')
              ? node.style.animationName
              : '';
            node.setAttribute('data-orig-inline-anim', curInline);
          }
          if (!shouldPlay) {
            node.removeAttribute('data-burst-paused');
            if (node.style) {
              node.style.animationPlayState = 'paused';
              node.style.animationName = 'none';
            }
          } else {
            const nodeStopped = node.style && (node.style.animationName === 'none' || node.style.animationPlayState === 'paused');
            if (!isInitialMount || wasStopped || nodeStopped) {
              const origInline = node.getAttribute('data-orig-inline-anim') || '';
              const mode = node.getAttribute('data-playback-mode') || flowMode || 'loop';
              const cyc = parseInt(node.getAttribute('data-burst-cycles') || '0', 10) || 0;
              const pSec = parseFloat(node.getAttribute('data-pause-seconds') || '0') || 0;
              const hasBurst = mode !== 'once' && cyc > 0 && pSec > 0;
              if (node.style) {
                node.style.animationIterationCount = mode === 'once' ? '1' : (hasBurst ? String(cyc) : 'infinite');
                if (mode === 'once' || hasBurst) {
                  node.style.animationFillMode = 'forwards';
                }
                node.style.animationName = 'none';
                try { void node.getBoundingClientRect(); } catch (e) {}
                node.style.visibility = '';
                node.style.animationPlayState = 'running';
                node.style.animationName = origInline;
              }
            }
          }
        });
      }
      return;
    }

    // Conventional SVG Objects (Node / Flow / Glow / Ripple) using SMIL
    const isFlow = Boolean(el.classList?.contains('diagram-flow-instance')) ||
                   Boolean(typeof el.hasAttribute === 'function' && el.hasAttribute('data-flow-id')) ||
                   Boolean(el.querySelector?.('.flow-track-path'));
    const isRipple = Boolean(el.classList?.contains('diagram-ripple-instance')) ||
                     Boolean(typeof el.hasAttribute === 'function' && el.hasAttribute('data-ripple-id')) ||
                     Boolean(el.querySelector?.('.ripple-hit-target'));
    const smilNodes = (typeof el.querySelectorAll === 'function')
      ? Array.from(el.querySelectorAll('animate, animateTransform, animateMotion, set'))
      : [];

    if (isRipple && svgEl && typeof svgEl.querySelectorAll === 'function') {
      const elId = el.getAttribute('id') || String(el.id || '');
      const rippleId = el.getAttribute('data-ripple-id') || elId.replace(/^.*__ripple-/, '').replace(/^.*ripple-/, '');
      if (rippleId) {
        svgEl.querySelectorAll(`mask[id*="rippleMask-${rippleId}"] animate`).forEach((mAnim) => {
          if (!smilNodes.includes(mAnim)) smilNodes.push(mAnim);
        });
      }
    }

    if (!shouldPlay) {
      smilNodes.forEach((smil) => {
        if (!smil.hasAttribute('data-orig-begin')) {
          smil.setAttribute('data-orig-begin', smil.getAttribute('begin') || '');
        }
        smil.setAttribute('begin', 'indefinite');
        if (typeof smil.endElement === 'function') {
          try { smil.endElement(); } catch (e) {}
        }
      });
      if (isFlow && typeof el.querySelectorAll === 'function') {
        el.querySelectorAll('.flow-payload-instance').forEach((p) => {
          p.setAttribute('data-play-hidden', '1');
          p.setAttribute('visibility', 'hidden');
          if (p.style) p.style.visibility = 'hidden';
        });
      }
    } else {
      if (isFlow && typeof el.querySelectorAll === 'function') {
        el.querySelectorAll('.flow-payload-instance').forEach((p) => {
          if (p.getAttribute('data-play-hidden') === '1') {
            p.removeAttribute('data-play-hidden');
            p.removeAttribute('visibility');
            if (p.style) p.style.visibility = '';
          }
        });
      }
      if (!isInitialMount || wasStopped) {
        smilNodes.forEach((smil) => {
          if (smil.hasAttribute('data-orig-begin')) {
            const ob = smil.getAttribute('data-orig-begin');
            if (ob) smil.setAttribute('begin', ob);
            else smil.removeAttribute('begin');
          } else if (smil.getAttribute('begin') === 'indefinite') {
            smil.removeAttribute('begin');
          }
          if (typeof smil.beginElement === 'function') {
            try { smil.beginElement(); } catch (e) {}
          }
        });
      }
    }
  }

  /**
   * Applies validated property to the resolved DOM element.
   */
  function applyPropertyToElement(el, property, value, paramDef, instance, isInitialMount = false) {
    const svgEl = instance ? (instance.svgElement || (instance.wrapper && instance.wrapper.querySelector('svg'))) : null;

    // Detect specialized entity types
    const isGroup = el && (Boolean(el.classList?.contains('scene-group')) ||
                    Boolean(typeof el.hasAttribute === 'function' && el.hasAttribute('data-group-id')));
    const isFlow = !isGroup && el && (Boolean(el.classList?.contains('diagram-flow-instance')) ||
                   Boolean(typeof el.hasAttribute === 'function' && el.hasAttribute('data-flow-id')) ||
                   Boolean(el.querySelector?.('.flow-track-path')));
    const isGlow = !isGroup && el && (Boolean(el.classList?.contains('diagram-glow-instance')) ||
                   Boolean(typeof el.hasAttribute === 'function' && el.hasAttribute('data-glow-id')) ||
                   Boolean(el.querySelector?.('.glow-hit-target')));
    const isRipple = !isGroup && el && (Boolean(el.classList?.contains('diagram-ripple-instance')) ||
                     Boolean(typeof el.hasAttribute === 'function' && el.hasAttribute('data-ripple-id')) ||
                     Boolean(el.querySelector?.('.ripple-hit-target')));
    const isLite = !isGroup && el && (Boolean(el.classList?.contains('diagram-lite-instance')) ||
                   Boolean(typeof el.hasAttribute === 'function' && el.hasAttribute('data-lite-id')) ||
                   Boolean(el.querySelector?.('.lite-payload')));

    switch (property) {
      case 'stroke':
      case 'color':
      case 'fill': {
        if (!el) break;

        if (isFlow) {
          // Flow: color changes the moving payload only.
          // The invisible guide path remains stroke="none".
          // Do not recolour unrelated path geometry.
          const payloadGroup = el.querySelector('.flow-payload-group') || el.querySelector('.flow-payload-wrapper');
          if (payloadGroup) {
            payloadGroup.querySelectorAll('circle, path, rect, ellipse, line, polygon').forEach(c => {
              const curStroke = c.getAttribute('stroke');
              const curFill = c.getAttribute('fill');
              if (curStroke && curStroke !== 'none') {
                c.setAttribute('stroke', value);
                c.style.stroke = value;
              }
              if (curFill && curFill !== 'none') {
                c.setAttribute('fill', value);
                c.style.fill = value;
              }
              if (!curStroke && !curFill) {
                c.setAttribute('fill', value);
                c.style.fill = value;
              }
            });
          }
          // Check motion guide track paths: if stroke="none", NEVER paint it!
          el.querySelectorAll('path.flow-track-path, .flow-track-path').forEach(p => {
            const trackStroke = p.getAttribute('stroke');
            if (trackStroke === 'none' || p.style.stroke === 'none') {
              p.setAttribute('stroke', 'none');
              p.style.stroke = 'none';
            } else if (property === 'stroke') {
              // Only recolour if it was authored as a visible track line and property is explicitly stroke
              p.setAttribute('stroke', value);
              p.style.stroke = value;
            }
          });
        } else if (isGlow) {
          // Glow: color changes the illuminated effect only.
          // NEVER recolour transparent hit-test elements (.glow-hit-target) or elements with fill="transparent".
          const elId = el.getAttribute('id') || (el.id && el.id.baseVal) || String(el.id || '');
          const glowId = el.getAttribute('data-glow-id') || elId.replace(/^.*__glow-/, '').replace(/^.*glow-/, '');
          if (svgEl) {
            const radGrads = [];
            if (glowId) {
              svgEl.querySelectorAll(`radialGradient[id*="glowGrad-${glowId}"], radialGradient[id*="glow-grad-${glowId}"], radialGradient[id*="glowGrad"], radialGradient[id*="glow"]`).forEach(rg => {
                if (!radGrads.includes(rg)) radGrads.push(rg);
              });
            }
            // Inspect child elements of the glow for referenced gradient URLs
            el.querySelectorAll('circle, path, rect, ellipse').forEach(c => {
              const fill = c.getAttribute('fill') || (c.style && c.style.fill) || '';
              const urlMatch = fill.match(/url\(['"]?#([^'")]+)['"]?\)/);
              if (urlMatch) {
                const gradEl = svgEl.querySelector(`#${urlMatch[1]}`);
                if (gradEl && !radGrads.includes(gradEl)) radGrads.push(gradEl);
              }
            });
            radGrads.forEach(rg => {
              rg.querySelectorAll('stop').forEach(st => {
                st.setAttribute('stop-color', value);
                st.style.stopColor = value;
              });
            });
            const filters = svgEl.querySelectorAll(`filter[id*="glowBlur-${glowId}"] feFlood, filter[id*="glowBlur-${glowId}"] feDropShadow, filter[id*="glow"] feFlood`);
            filters.forEach(f => {
              if (f && typeof f.hasAttribute === 'function' && f.hasAttribute('flood-color')) f.setAttribute('flood-color', value);
            });
          }
          el.querySelectorAll('circle, path, rect, ellipse').forEach(c => {
            if (c.classList?.contains('glow-hit-target') || c.getAttribute('fill') === 'transparent' || c.getAttribute('pointer-events') === 'all') {
              return; // NEVER touch transparent hit-test elements
            }
            const curStroke = c.getAttribute('stroke');
            const curFill = c.getAttribute('fill');
            if (curStroke && curStroke !== 'none' && curStroke !== 'transparent') {
              c.setAttribute('stroke', value);
              c.style.stroke = value;
            }
            if (curFill && curFill !== 'none' && curFill !== 'transparent' && !curFill.startsWith('url(')) {
              c.setAttribute('fill', value);
              c.style.fill = value;
            }
          });
        } else if (isRipple) {
          // Ripple: Colour must target the actual visible ripple output only.
          // Hit-test elements (.ripple-hit-target), shadow rings (black), and image/mask helpers remain untouched.
          el.querySelectorAll('circle, path').forEach(c => {
            if (c.classList?.contains('ripple-hit-target') || c.getAttribute('fill') === 'transparent' || c.getAttribute('pointer-events') === 'all') {
              return; // NEVER touch hit-test element
            }
            const curStroke = c.getAttribute('stroke');
            if (curStroke === 'black' || curStroke === '#000' || curStroke === '#000000' || c.closest?.('g[transform*="scale(0.92)"]')) {
              return; // Keep shadow rings original black semantics
            }
            if (c.closest?.('mask') || c.tagName?.toLowerCase() === 'image') {
              return; // Do not touch mask or raster image elements
            }
            c.setAttribute('stroke', value);
            c.style.stroke = value;
          });
        } else if (isLite) {
          if (el.getAttribute('data-lite-kind') === 'gauge-lite') {
            if (isInitialMount) {
              el.setAttribute('data-gauge-base-color', value);
            } else {
              el.setAttribute('data-gauge-color-override', 'true');
              el.setAttribute('data-gauge-override-color', value);
            }
            updateGaugeLiteDOM(el);
            break;
          }
          if (el.getAttribute('data-lite-kind') === 'oscilloscope-lite') {
            el.setAttribute('data-osc-color', value);
            el.querySelectorAll('.lite-osc-wave, .lite-osc-screen, .lite-osc-grid line').forEach((node) => {
              node.setAttribute('stroke', value);
              if (node.style) node.style.stroke = value;
            });
            break;
          }
          if (el.getAttribute('data-lite-kind') === 'text-lite') {
            el.setAttribute('data-text-color', value);
            el.querySelectorAll('.lite-text-element').forEach((node) => {
              node.setAttribute('fill', value);
              if (node.style) node.style.fill = value;
            });
            break;
          }
          // Lite effects: recolour visible .lite-payload & .lite-guide-track elements, preserving .lite-hit-target
          el.querySelectorAll('.lite-payload').forEach(c => {
            const curStroke = c.getAttribute('stroke');
            const curFill = c.getAttribute('fill');
            if (curStroke && curStroke !== 'none') {
              c.setAttribute('stroke', value);
              if (c.style) c.style.stroke = value;
            }
            if (curFill && curFill !== 'none') {
              c.setAttribute('fill', value);
              if (c.style) c.style.fill = value;
            }
          });
          el.querySelectorAll('.lite-guide-track').forEach(g => {
            const gStroke = g.getAttribute('stroke');
            const gFill = g.getAttribute('fill');
            if (!gStroke || gStroke !== 'none') {
              g.setAttribute('stroke', value);
              if (g.style) g.style.stroke = value;
            }
            if (gFill && gFill !== 'none') {
              g.setAttribute('fill', value);
              if (g.style) g.style.fill = value;
            }
          });
        } else {
          // Generic Node or Element
          if (property === 'fill') {
            el.setAttribute('fill', value);
            el.style.fill = value;
            if (el.tagName && el.tagName.toLowerCase() === 'g') {
              el.querySelectorAll('rect, circle, path, polygon, ellipse').forEach(c => {
                if (!c.classList?.contains('glow-hit-target') && !c.classList?.contains('ripple-hit-target') && c.getAttribute('fill') !== 'transparent' && c.getAttribute('fill') !== 'none') {
                  c.setAttribute('fill', value);
                  c.style.fill = value;
                }
              });
            }
          } else {
            el.setAttribute('stroke', value);
            el.style.stroke = value;
            if (el.tagName && el.tagName.toLowerCase() === 'g') {
              el.querySelectorAll('rect, circle, path, polygon, ellipse, line').forEach(c => {
                if (!c.classList?.contains('glow-hit-target') && !c.classList?.contains('ripple-hit-target') && !c.classList?.contains('flow-track-path')) {
                  const curStroke = c.getAttribute('stroke');
                  if (curStroke !== 'none') {
                    c.setAttribute('stroke', value);
                    c.style.stroke = value;
                  }
                }
              });
            }
          }
        }
        break;
      }
      case 'visibility': {
        const isVisible = value !== false && value !== 'hidden' && value !== 0 && value !== '0';
        const visStr = isVisible ? 'visible' : 'hidden';
        if (el) {
          el.style.visibility = visStr;
          el.setAttribute('visibility', visStr);
        }
        break;
      }
      case 'play': {
        const shouldPlay = value !== false && value !== 'false' && value !== 0 && value !== '0';
        if (el) {
          applyPlayAnimationState(el, svgEl, shouldPlay, isInitialMount, instance);
        }
        break;
      }
      case 'opacity': {
        if (!el) break;
        const num = Math.max(0, Math.min(1, parseFloat(value) || 0));
        if (isGroup) {
          el.setAttribute('opacity', String(num));
          if (el.style) el.style.opacity = String(num);
        } else if (isRipple) {
          // Ripple opacity: target only visible wave crests, never hit-target or background
          el.querySelectorAll('circle, path').forEach(c => {
            if (c.classList?.contains('ripple-hit-target') || c.getAttribute('fill') === 'transparent') return;
            if (c.closest?.('mask') || c.tagName?.toLowerCase() === 'image') return;
            c.style.opacity = String(num);
          });
        } else if (isGlow) {
          // Glow intensity: apply opacity to graphic container
          const gfx = el.querySelector('g[pointer-events="none"]') || el;
          gfx.style.opacity = String(num);
          gfx.setAttribute('opacity', String(num));
        } else if (isLite) {
          el.setAttribute('opacity', String(num));
          if (el.style) el.style.opacity = String(num);
          el.querySelectorAll('.lite-payload').forEach(c => {
            c.removeAttribute('opacity');
            c.removeAttribute('stroke-opacity');
            if (c.style) {
              c.style.opacity = '';
            }
          });
        } else {
          el.setAttribute('opacity', String(num));
          el.style.opacity = String(num);
          if (el.tagName && el.tagName.toLowerCase() === 'g') {
            el.querySelectorAll('rect, circle, path, polygon, ellipse, image').forEach(c => {
              if (!c.classList?.contains('glow-hit-target') && !c.classList?.contains('ripple-hit-target')) {
                c.style.opacity = String(num);
              }
            });
          }
        }
        break;
      }
      case 'text':
      case 'textContent':
        if (el) {
          let valStr = String(value === undefined || value === null ? '' : value);
          const unitHint = (paramDef && typeof paramDef.unit === 'string' && paramDef.unit.trim() !== '') ? paramDef.unit.trim() : '';
          if (unitHint && (typeof value === 'number' || (paramDef && (paramDef.type === 'number' || paramDef.type === 'speed'))) && !valStr.endsWith(unitHint)) {
            valStr = valStr + unitHint;
          }
          if (el.getAttribute && el.getAttribute('data-lite-kind') === 'text-lite') {
            if (instance && typeof instance._updateTextLiteContent === 'function') {
              instance._updateTextLiteContent(el, valStr, isInitialMount);
            } else {
              el.setAttribute('data-text-content', valStr);
              const tNode = getTextLiteTargetNode(el);
              if (tNode) tNode.textContent = valStr;
            }
            break;
          }
          if (el.tagName && el.tagName.toLowerCase() === 'text') {
            el.textContent = valStr;
          } else {
            const textEls = el.querySelectorAll('text');
            if (textEls.length > 0) {
              textEls[0].textContent = valStr;
            } else {
              el.textContent = valStr;
            }
          }
        }
        break;
      case 'playbackRate':
      case 'speed': {
        if (el && paramDef && paramDef.target && paramDef.target !== 'root' && paramDef.target !== 'global') {
          const liteKind = (isLite && typeof el.getAttribute === 'function') ? (el.getAttribute('data-lite-kind') || '') : '';
          const isCycleDurationSpeed = isLite && (
            liteKind === 'flow-lite' ||
            liteKind === 'oscilloscope-lite' ||
            liteKind === 'text-lite' ||
            (paramDef.type === 'number') ||
            (typeof paramDef.max === 'number' && paramDef.max > 10)
          );
          if (isCycleDurationSpeed) {
            if (liteKind === 'text-lite') {
              const numVal = Number(value);
              const sec = Math.max(0, Math.min(30, Number.isFinite(numVal) ? numVal : 2.0));
              el.setAttribute('data-text-speed', String(sec));
              if (sec > 0) {
                el.querySelectorAll('.lite-text-element').forEach((node) => {
                  node.setAttribute('data-base-dur', String(sec));
                  if (node.style) {
                    node.style.animationDuration = `${sec}s`;
                    if (typeof node.style.setProperty === 'function') {
                      node.style.setProperty('--sva-base-dur', `${sec}s`);
                    }
                  }
                });
              }
            } else {
              const sec = Math.max(0.2, Math.min(30, parseFloat(value) || 2.0));
              const masterRate = (instance && typeof instance.getSpeed === 'function') ? instance.getSpeed() : 1.0;
              let totalDur = sec;
              if (liteKind === 'flow-lite') {
                el.setAttribute('data-flow-speed', String(sec));
                const startDelay = parseFloat(el.getAttribute('data-flow-delay') || '0') || 0;
                const endDelay = parseFloat(el.getAttribute('data-flow-end-delay') || '0') || 0;
                const mode = el.getAttribute('data-flow-playback-mode') || 'loop';
                const M = parseInt(el.getAttribute('data-flow-seg-count') || '1', 10) || 1;
                if (mode === 'pingpong' && M === 1) {
                  totalDur = startDelay + sec + endDelay + sec;
                } else if (M === 1 && (startDelay > 0 || endDelay > 0)) {
                  totalDur = startDelay + sec + endDelay;
                }
              } else if (liteKind === 'oscilloscope-lite') {
                el.setAttribute('data-osc-speed', String(sec));
              } else {
                el.setAttribute('data-lite-speed', String(sec));
                el.setAttribute('data-pulse-period', String(sec));
              }
              el.querySelectorAll('.lite-payload').forEach((node) => {
                node.setAttribute('data-pulse-period', String(sec));
                node.setAttribute('data-base-dur', String(totalDur));
                const localFactor = getEffectiveLocalSpeedFactor(node, svgEl);
                const eff = Math.max(0.001, (Number(masterRate) > 0 ? Number(masterRate) : 1.0) * localFactor);
                const effDur = totalDur / eff;
                if (node.style) {
                  node.style.animationDuration = `${effDur.toFixed(4)}s`;
                  if (typeof node.style.setProperty === 'function') {
                    node.style.setProperty('--sva-base-dur', `${totalDur}s`);
                  }
                  const phaseRatioStr = typeof node.style.getPropertyValue === 'function'
                    ? node.style.getPropertyValue('--sva-phase-ratio')
                    : '';
                  if (phaseRatioStr !== '' && phaseRatioStr !== null) {
                    const ratio = parseFloat(phaseRatioStr);
                    if (Number.isFinite(ratio)) {
                      const negDelay = -ratio * effDur;
                      node.style.animationDelay = `${negDelay.toFixed(4)}s`;
                      if (typeof node.style.setProperty === 'function') {
                        node.style.setProperty('--sva-base-delay', `${(-ratio * totalDur).toFixed(4)}s`);
                      }
                    }
                  }
                }
              });
            }
          } else {
            // Object-specific or group-specific targeted animation speed multiplier
            const localRate = Number(value);
            if (!isNaN(localRate) && localRate > 0) {
              const masterRate = (instance && typeof instance.getSpeed === 'function') ? instance.getSpeed() : 1.0;
              applyTargetedSpeed(el, localRate, masterRate);
            }
          }
        } else if (instance && typeof instance.setSpeed === 'function') {
          // Global widget instance playback rate
          instance.setSpeed(value);
        }
        break;
      }
      case 'state':
      case 'operatingState': {
        const stateStr = String(value);
        if (el) el.setAttribute('data-state', stateStr);
        if (instance && instance.wrapper) instance.wrapper.setAttribute('data-state', stateStr);

        // State enum actions
        if (stateStr === 'paused') {
          if (instance) instance.pause();
        } else if (stateStr === 'stopped') {
          if (instance) instance.stop();
        } else if (stateStr === 'running') {
          if (instance) instance.resume();
        }
        break;
      }
      case 'trigger': {
        if (el) {
          el.querySelectorAll('.lite-flash-anim, .sva-lite-flash-anim').forEach(node => {
            node.setAttribute('data-trigger-nonce', String(value));
            if (node.style) {
              const prevAnim = node.style.animationName || '';
              node.style.animationName = 'none';
              try { void node.getBoundingClientRect(); } catch (e) {}
              node.style.animationName = prevAnim;
            }
          });
        }
        break;
      }
      case 'scale': {
        if (el) {
          const sVal = Math.max(0.2, Math.min(4.0, parseFloat(value) || 1.15));
          el.querySelectorAll('.lite-payload').forEach(node => {
            node.setAttribute('data-pulse-scale', String(sVal));
            node.setAttribute('data-radar-max', String(sVal));
            if (node.style && typeof node.style.setProperty === 'function') {
              node.style.setProperty('--sva-pulse-max', String(sVal));
              node.style.setProperty('--sva-radar-max', String(sVal));
            }
          });
        }
        break;
      }
      case 'duration': {
        if (el) {
          const msVal = Math.max(10, Math.min(5000, parseFloat(value) || 100));
          const secVal = (msVal / 1000).toFixed(3);
          el.querySelectorAll('.lite-payload').forEach(node => {
            node.setAttribute('data-flash-duration-ms', String(Math.round(msVal)));
            if (node.style) {
              node.style.animationDuration = `${secVal}s`;
              if (typeof node.style.setProperty === 'function') {
                node.style.setProperty('--sva-base-dur', `${secVal}s`);
              }
            }
          });
        }
        break;
      }
      case 'strokeWidth': {
        if (el) {
          const isTextLite = el.getAttribute('data-lite-kind') === 'text-lite';
          const sw = Math.max(isTextLite ? 0 : 0.5, Math.min(32, parseFloat(value) !== undefined && !isNaN(parseFloat(value)) ? parseFloat(value) : 2.5));
          el.setAttribute('data-flow-stroke-width', String(sw));
          el.setAttribute('data-gauge-sw', String(sw));
          if (isTextLite) {
            el.setAttribute('data-text-border-width', String(sw));
            const box = el.querySelector('.lite-text-box');
            if (box) {
              box.setAttribute('stroke-width', String(sw));
              const bCol = el.getAttribute('data-text-border-color') || '#38bdf8';
              box.setAttribute('stroke', sw > 0 ? bCol : 'none');
            }
            break;
          }
          if (el.getAttribute('data-lite-kind') === 'gauge-lite') {
            const variant = el.getAttribute('data-gauge-variant') || 'ring';
            if (variant === 'ring') {
              el.querySelectorAll('.lite-gauge-track, .lite-gauge-arc').forEach(node => {
                node.setAttribute('stroke-width', String(sw));
              });
            } else if (variant === 'level') {
              const vessel = el.querySelector('.lite-gauge-vessel');
              if (vessel) vessel.setAttribute('stroke-width', String(sw));
            }
            break;
          }
          el.querySelectorAll('.lite-payload').forEach(node => {
            node.setAttribute('stroke-width', String(sw));
            if (node.style && typeof node.style.setProperty === 'function') {
              node.style.setProperty('--sva-base-sw', `${sw}px`);
            }
          });
        }
        break;
      }
      case 'bgColor': {
        if (el && el.getAttribute('data-lite-kind') === 'gauge-lite') {
          el.setAttribute('data-gauge-bg-color', value);
          updateGaugeLiteDOM(el);
        } else if (el && el.getAttribute('data-lite-kind') === 'oscilloscope-lite') {
          el.setAttribute('data-osc-bg-color', value);
          const screen = el.querySelector('.lite-osc-screen');
          if (screen) {
            screen.setAttribute('fill', value);
            if (screen.style) screen.style.fill = value;
          }
        } else if (el && el.getAttribute('data-lite-kind') === 'text-lite') {
          el.setAttribute('data-text-bg-color', value);
          const box = el.querySelector('.lite-text-box');
          if (box) {
            box.setAttribute('fill', value);
            if (box.style) box.style.fill = value;
          }
        }
        break;
      }
      case 'borderColor': {
        if (el && el.getAttribute('data-lite-kind') === 'text-lite') {
          el.setAttribute('data-text-border-color', value);
          const sw = parseFloat(el.getAttribute('data-text-border-width') || '1.5');
          const box = el.querySelector('.lite-text-box');
          if (box && sw > 0) {
            box.setAttribute('stroke', value);
            if (box.style) box.style.stroke = value;
          }
          const guide = el.querySelector('.lite-text-arc-guide');
          if (guide) {
            guide.setAttribute('stroke', value);
            if (guide.style) guide.style.stroke = value;
          }
        }
        break;
      }
      case 'scrollSpeed': {
        if (el && el.getAttribute('data-lite-kind') === 'text-lite') {
          const spd = Math.max(10, Math.min(600, parseFloat(value) || 90));
          el.setAttribute('data-text-scroll-speed', String(spd));
          if (instance && typeof instance._reconfigureTextLiteTicker === 'function') {
            instance._reconfigureTextLiteTicker(el);
          } else {
            configureTextLiteTicker(el, null);
          }
        }
        break;
      }
      case 'typeSpeed': {
        if (el && el.getAttribute('data-lite-kind') === 'text-lite') {
          const rate = Math.max(1, Math.min(120, parseFloat(value) || 14));
          el.setAttribute('data-text-type-speed', String(rate));
        }
        break;
      }
      case 'value':
      case 'minValue':
      case 'maxValue': {
        if (el && el.getAttribute('data-lite-kind') === 'gauge-lite') {
          const numVal = parseFloat(value);
          if (Number.isFinite(numVal)) {
            if (property === 'value') {
              el.setAttribute('data-gauge-value', String(numVal));
            } else if (property === 'minValue') {
              el.setAttribute('data-gauge-min', String(numVal));
            } else if (property === 'maxValue') {
              el.setAttribute('data-gauge-max', String(numVal));
            }
            updateGaugeLiteDOM(el);
          }
        }
        break;
      }
      case 'dashLength':
      case 'gapLength':
      case 'dotSize': {
        if (el && el.getAttribute('data-lite-kind') === 'flow-lite') {
          if (property === 'dashLength') {
            el.setAttribute('data-flow-dash-length', String(Math.max(2, Math.min(400, parseFloat(value) || 18))));
          } else if (property === 'gapLength') {
            el.setAttribute('data-flow-gap-length', String(Math.max(2, Math.min(300, parseFloat(value) || 14))));
          } else if (property === 'dotSize') {
            el.setAttribute('data-flow-dot-size', String(Math.max(1, Math.min(32, parseFloat(value) || 5))));
          }
          const variant = el.getAttribute('data-flow-variant') || 'dashed';
          const dashLenAttr = parseFloat(el.getAttribute('data-flow-dash-length') || '18') || 18;
          const gapLenAttr = parseFloat(el.getAttribute('data-flow-gap-length') || '14') || 14;
          const dotSizeAttr = parseFloat(el.getAttribute('data-flow-dot-size') || '5') || 5;
          const swAttr = parseFloat(el.getAttribute('data-flow-stroke-width') || '3') || 3;
          const L = parseFloat(el.getAttribute('data-flow-length') || '300') || 300;
          const segNodes = Array.from(el.querySelectorAll('.lite-flow-seg'));
          const M = segNodes.length || 1;
          const visLen = variant === 'dotted' ? dotSizeAttr : dashLenAttr;
          const dashDraw = variant === 'dotted' ? 0.2 : dashLenAttr;
          const swDraw = variant === 'dotted' ? dotSizeAttr : swAttr;
          const period = variant === 'single' ? (L + visLen * 2) : (visLen + gapLenAttr);
          const clearGap = L + M * period + 500;
          segNodes.forEach((node) => {
            node.setAttribute('stroke-width', swDraw.toFixed(2));
            node.setAttribute('stroke-dasharray', `${dashDraw.toFixed(2)} ${clearGap.toFixed(2)}`);
          });
          el.setAttribute('data-flow-period', period.toFixed(2));
        }
        break;
      }
      case 'segments':
      case 'lineGapRatio': {
        if (el) {
          const liteKind = el.getAttribute('data-lite-kind') || '';
          if (property === 'segments' && liteKind === 'gauge-lite') {
            const segs = Math.max(2, Math.min(32, parseInt(value, 10) || 10));
            el.setAttribute('data-gauge-segments', String(segs));
            updateGaugeLiteDOM(el);
            break;
          }
          if (property === 'segments' && liteKind === 'oscilloscope-lite') {
            const cyc = Math.max(1, Math.min(12, parseInt(value, 10) || 2));
            el.setAttribute('data-osc-cycles', String(cyc));
            updateOscilloscopeLiteDOM(el);
            break;
          }
          if (property === 'segments') {
            el.setAttribute('data-lite-segments', String(Math.max(1, Math.min(16, parseInt(value, 10) || 2))));
          } else {
            el.setAttribute('data-lite-ratio', String(value || '1:3'));
          }
          const segs = Math.max(1, Math.min(16, parseInt(el.getAttribute('data-lite-segments') || '2', 10) || 2));
          const ratioStr = el.getAttribute('data-lite-ratio') || '1:3';
          const parts = String(ratioStr).split(':');
          const lPart = Math.max(0.1, parseFloat(parts[0]) || 1);
          const gPart = Math.max(0.1, parseFloat(parts[1]) || 3);
          const unit = Math.round((1000 / segs) * 1000) / 1000;
          const dashLen = Math.round((unit * (lPart / (lPart + gPart))) * 1000) / 1000;
          const gapLen = Math.round((unit - dashLen) * 1000) / 1000;
          el.querySelectorAll('.lite-payload').forEach(node => {
            node.setAttribute('stroke-dasharray', `${dashLen} ${gapLen}`);
            if (node.style && typeof node.style.setProperty === 'function') {
              node.style.setProperty('--sva-unit', `${unit}px`);
              node.style.setProperty('--sva-dash', `${dashLen}px`);
              node.style.setProperty('--sva-gap', `${gapLen}px`);
            }
          });
        }
        break;
      }
      case 'direction': {
        if (el) {
          if (el.getAttribute('data-lite-kind') === 'gauge-lite') {
            const rawDir = String(value).toLowerCase();
            const nextDir = (rawDir === 'reverse' || rawDir === 'ccw') ? 'reverse' : 'forward';
            el.setAttribute('data-gauge-direction', nextDir);
            updateGaugeLiteDOM(el);
            break;
          }
          if (el.getAttribute('data-lite-kind') === 'flow-lite') {
            const rawDir = String(value).toLowerCase();
            const nextDir = (rawDir === 'reverse' || rawDir === 'ccw') ? 'reverse' : 'forward';
            const origDir = el.getAttribute('data-flow-orig-dir') || el.getAttribute('data-flow-direction') || 'forward';
            if (!el.hasAttribute('data-flow-orig-dir')) {
              el.setAttribute('data-flow-orig-dir', origDir);
            }
            el.setAttribute('data-flow-direction', nextDir);
            const mode = el.getAttribute('data-flow-playback-mode') || 'loop';
            el.querySelectorAll('.lite-flow-seg').forEach((node) => {
              if (node.style) {
                if (mode === 'pingpong') {
                  node.style.animationDirection = nextDir === origDir ? 'alternate' : 'alternate-reverse';
                } else {
                  node.style.animationDirection = nextDir === origDir ? 'normal' : 'reverse';
                }
              }
            });
            break;
          }
          if (el.getAttribute('data-lite-kind') === 'oscilloscope-lite') {
            const rawDir = String(value).toLowerCase();
            const nextDir = (rawDir === 'reverse' || rawDir === 'ccw') ? 'reverse' : 'forward';
            el.setAttribute('data-osc-direction', nextDir);
            el.querySelectorAll('.lite-osc-wave').forEach((node) => {
              if (node.style) {
                node.style.animationDirection = nextDir === 'reverse' ? 'reverse' : 'normal';
              }
            });
            break;
          }
          if (el.getAttribute('data-lite-kind') === 'text-lite') {
            const rawDir = String(value).toLowerCase();
            const nextDir = (rawDir === 'reverse' || rawDir === 'ccw') ? 'reverse' : 'forward';
            el.setAttribute('data-text-direction', nextDir);
            if (instance && typeof instance._reconfigureTextLiteTicker === 'function') {
              instance._reconfigureTextLiteTicker(el);
            } else {
              configureTextLiteTicker(el, null);
            }
            break;
          }
          const dir = String(value).toLowerCase() === 'ccw' ? 'ccw' : 'cw';
          el.querySelectorAll('.lite-payload').forEach(node => {
            const curAnim = (node.style && node.style.animationName) || '';
            const pfxMatch = curAnim.match(/^(.*__)sva-lite-trace-/);
            const pfx = pfxMatch ? pfxMatch[1] : '';
            const entryExit = node.getAttribute('data-entry-exit') || 'none';
            const suffix = entryExit === 'fade' ? '-fade' : (entryExit === 'grow' ? '-grow' : (entryExit === 'fade-grow' ? '-fadegrow' : ''));
            const newTraceName = `${pfx}sva-lite-trace-${dir}${suffix}`;
            if (node.classList) {
              Array.from(node.classList).forEach(cls => {
                if (cls.includes('sva-lite-trace-')) node.classList.remove(cls);
              });
              node.classList.add(newTraceName);
            }
            if (node.style) {
              node.style.animationName = newTraceName;
            }
            node.setAttribute('data-direction', dir);
          });
        }
        break;
      }
      case 'startOffset': {
        if (el) {
          if (el.getAttribute('data-lite-kind') === 'oscilloscope-lite') {
            const pct = Math.max(10, Math.min(90, parseFloat(value) || 50));
            el.setAttribute('data-osc-baseline', String(pct));
            updateOscilloscopeLiteDOM(el);
            break;
          }
          const pct = Math.max(0, Math.min(100, parseFloat(value) || 0));
          if (el.getAttribute('data-lite-kind') === 'text-lite') {
            el.setAttribute('data-text-start-offset', String(pct));
            const tp = el.querySelector('.lite-text-path-link') || el.querySelector('textPath');
            if (tp) tp.setAttribute('startOffset', `${pct.toFixed(1)}%`);
            break;
          }
          const offsetUnits = -(pct / 100) * 1000;
          el.querySelectorAll('.lite-payload').forEach(node => {
            node.setAttribute('data-start-offset', String(pct));
            if (node.style && typeof node.style.setProperty === 'function') {
              node.style.setProperty('--sva-start-offset', `${offsetUnits}px`);
            }
          });
        }
        break;
      }
      case 'playbackMode': {
        if (el) {
          const raw = String(value).toLowerCase();
          if (el.getAttribute('data-lite-kind') === 'oscilloscope-lite') {
            const oscMode = (raw === 'static' || raw === 'sampled') ? raw : 'animated';
            el.setAttribute('data-osc-mode', oscMode);
            const waveEl = el.querySelector('.lite-osc-wave');
            if (waveEl) {
              if (oscMode === 'animated') {
                if (waveEl.style && waveEl.hasAttribute('data-orig-inline-anim')) {
                  waveEl.style.animationName = waveEl.getAttribute('data-orig-inline-anim') || '';
                }
              } else {
                if (waveEl.style) {
                  if (!waveEl.hasAttribute('data-orig-inline-anim') && waveEl.style.animationName && waveEl.style.animationName !== 'none') {
                    waveEl.setAttribute('data-orig-inline-anim', waveEl.style.animationName);
                  }
                  waveEl.style.animationName = 'none';
                }
              }
            }
            updateOscilloscopeLiteDOM(el);
            break;
          }
          const mode = raw === 'pingpong' ? 'pingpong' : (raw === 'once' ? 'once' : 'loop');
          if (el.getAttribute('data-lite-kind') === 'text-lite') {
            el.setAttribute('data-text-playback-mode', mode);
            if (instance && typeof instance._reconfigureTextLiteTicker === 'function') {
              instance._reconfigureTextLiteTicker(el);
            } else {
              configureTextLiteTicker(el, null);
            }
            break;
          }
          el.setAttribute('data-flow-playback-mode', mode);
          const isFlowLite = el.getAttribute('data-lite-kind') === 'flow-lite';
          const origDir = el.getAttribute('data-flow-orig-dir') || el.getAttribute('data-flow-direction') || 'forward';
          const curDir = el.getAttribute('data-flow-direction') || 'forward';
          const isReversed = isFlowLite && (curDir !== origDir);
          el.querySelectorAll('.lite-payload').forEach(node => {
            const curAnim = (node.style && node.style.animationName) || '';
            const pfxMatch = curAnim.match(/^(.*__)sva-lite-trace-/);
            const pfx = pfxMatch ? pfxMatch[1] : '';
            if (node.classList && !isFlowLite) {
              Array.from(node.classList).forEach(cls => {
                if (cls.includes('sva-lite-mode-')) node.classList.remove(cls);
              });
              node.classList.add(`${pfx}sva-lite-mode-${mode}`);
            }
            if (node.style) {
              node.style.animationIterationCount = mode === 'once' ? '1' : 'infinite';
              if (mode === 'pingpong') {
                node.style.animationDirection = isReversed ? 'alternate-reverse' : 'alternate';
              } else {
                node.style.animationDirection = isReversed ? 'reverse' : 'normal';
              }
              node.style.animationFillMode = mode === 'once' ? 'forwards' : 'none';
            }
            node.setAttribute('data-playback-mode', mode);
          });
        }
        break;
      }
      case 'showGuide': {
        if (el) {
          const show = value !== false && value !== 'false' && value !== 0 && value !== '0';
          el.querySelectorAll('.lite-guide-track').forEach(g => {
            g.style.visibility = show ? 'visible' : 'hidden';
            g.setAttribute('visibility', show ? 'visible' : 'hidden');
          });
        }
        break;
      }
      case 'period': {
        if (el) {
          const sec = Math.max(0.2, Math.min(30, parseFloat(value) || 1.8));
          const liteKind = el.getAttribute('data-lite-kind') || '';
          const masterRate = (instance && typeof instance.getSpeed === 'function') ? instance.getSpeed() : 1.0;
          let totalDur = sec;
          if (liteKind === 'flow-lite') {
            el.setAttribute('data-flow-speed', String(sec));
            const startDelay = parseFloat(el.getAttribute('data-flow-delay') || '0') || 0;
            const endDelay = parseFloat(el.getAttribute('data-flow-end-delay') || '0') || 0;
            const mode = el.getAttribute('data-flow-playback-mode') || 'loop';
            const M = parseInt(el.getAttribute('data-flow-seg-count') || '1', 10) || 1;
            if (mode === 'pingpong' && M === 1) {
              totalDur = startDelay + sec + endDelay + sec;
            } else if (M === 1 && (startDelay > 0 || endDelay > 0)) {
              totalDur = startDelay + sec + endDelay;
            }
          } else if (liteKind === 'oscilloscope-lite') {
            el.setAttribute('data-osc-speed', String(sec));
          } else {
            el.setAttribute('data-pulse-period', String(sec));
          }
          el.querySelectorAll('.lite-payload').forEach(node => {
            node.setAttribute('data-pulse-period', String(sec));
            node.setAttribute('data-base-dur', String(totalDur));
            const localFactor = getEffectiveLocalSpeedFactor(node, svgEl);
            const eff = Math.max(0.001, (Number(masterRate) > 0 ? Number(masterRate) : 1.0) * localFactor);
            const effDur = totalDur / eff;
            if (node.style) {
              node.style.animationDuration = `${effDur.toFixed(4)}s`;
              if (typeof node.style.setProperty === 'function') {
                node.style.setProperty('--sva-base-dur', `${totalDur}s`);
              }
              const phaseRatioStr = typeof node.style.getPropertyValue === 'function'
                ? node.style.getPropertyValue('--sva-phase-ratio')
                : '';
              if (phaseRatioStr !== '' && phaseRatioStr !== null) {
                const ratio = parseFloat(phaseRatioStr);
                if (Number.isFinite(ratio)) {
                  const negDelay = -ratio * effDur;
                  node.style.animationDelay = `${negDelay.toFixed(4)}s`;
                  if (typeof node.style.setProperty === 'function') {
                    node.style.setProperty('--sva-base-delay', `${(-ratio * totalDur).toFixed(4)}s`);
                  }
                }
              }
            }
          });
        }
        break;
      }
      case 'intensity': {
        if (el) {
          const amp = Math.max(0.05, Math.min(1, parseFloat(value) || 0.75));
          if (el.getAttribute('data-lite-kind') === 'oscilloscope-lite') {
            el.setAttribute('data-osc-amplitude', String(amp));
            updateOscilloscopeLiteDOM(el);
            break;
          }
          el.querySelectorAll('.lite-payload').forEach(node => {
            node.setAttribute('data-intensity', String(amp));
            if (node.style && typeof node.style.setProperty === 'function') {
              node.style.setProperty('--sva-pulse-amp', String(amp));
              node.style.setProperty('--sva-flash-int', String(amp));
            }
          });
        }
        break;
      }
      case 'samples': {
        if (el && el.getAttribute('data-lite-kind') === 'oscilloscope-lite') {
          el.setAttribute('data-osc-samples', String(value));
          el.setAttribute('data-osc-mode', 'sampled');
          const waveEl = el.querySelector('.lite-osc-wave');
          if (waveEl) {
            if (waveEl.classList) waveEl.classList.remove('sva-lite-osc-anim');
            if (waveEl.style) waveEl.style.animationName = 'none';
          }
          updateOscilloscopeLiteDOM(el);
        }
        break;
      }
      case 'repeat':
      case 'repeatInterval': {
        if (el) {
          el.querySelectorAll('.lite-payload').forEach(node => {
            if (property === 'repeat') {
              const rep = value === true || value === 'true' || value === 1 || value === '1';
              node.setAttribute('data-repeat', rep ? 'true' : 'false');
            } else {
              const iv = Math.max(0.2, Math.min(60, parseFloat(value) || 2.0));
              node.setAttribute('data-repeat-interval', String(iv));
            }
            const rep = node.getAttribute('data-repeat') === 'true';
            const iv = Math.max(0.2, parseFloat(node.getAttribute('data-repeat-interval') || '2.0') || 2.0);
            const durMs = parseFloat(node.getAttribute('data-flash-duration-ms') || '100') || 100;
            const durSec = durMs / 1000;
            if (rep) {
              const pauseSec = Math.max(0.05, iv - durSec);
              node.setAttribute('data-burst-cycles', '1');
              node.setAttribute('data-pause-seconds', pauseSec.toFixed(3));
              node.setAttribute('data-pause-visibility', 'hide');
              if (node.style) {
                node.style.animationIterationCount = '1';
                if (property === 'repeat') {
                  const prevAnim = node.style.animationName || '';
                  node.style.animationName = 'none';
                  try { void node.getBoundingClientRect(); } catch (e) {}
                  node.style.visibility = '';
                  node.style.animationName = prevAnim;
                }
              }
            } else {
              node.removeAttribute('data-burst-cycles');
              node.removeAttribute('data-pause-seconds');
              node.removeAttribute('data-burst-paused');
              if (node.style) {
                node.style.animationIterationCount = '1';
                node.style.visibility = '';
              }
            }
          });
        }
        break;
      }
      case 'burstCycles':
      case 'pauseSeconds':
      case 'pauseVisibility': {
        if (el) {
          el.querySelectorAll('.lite-payload').forEach(node => {
            if (property === 'burstCycles') {
              const cyc = Math.max(0, Math.min(100, parseInt(value, 10) || 0));
              node.setAttribute('data-burst-cycles', String(cyc));
            } else if (property === 'pauseSeconds') {
              const pSec = Math.max(0, Math.min(300, parseFloat(value) || 0));
              node.setAttribute('data-pause-seconds', String(pSec));
            } else {
              const vis = String(value).toLowerCase() === 'hold' ? 'hold' : 'hide';
              node.setAttribute('data-pause-visibility', vis);
            }
            const cyc = parseInt(node.getAttribute('data-burst-cycles') || '0', 10) || 0;
            const pSec = parseFloat(node.getAttribute('data-pause-seconds') || '0') || 0;
            const mode = node.getAttribute('data-playback-mode') || 'loop';
            const hasBurst = mode !== 'once' && cyc > 0 && pSec > 0;
            if (node.style) {
              node.style.animationIterationCount = mode === 'once' ? '1' : (hasBurst ? String(cyc) : 'infinite');
              node.style.animationFillMode = (mode === 'once' || hasBurst) ? 'forwards' : 'none';
              if (!hasBurst) {
                node.removeAttribute('data-burst-paused');
                node.style.visibility = '';
              }
            }
          });
        }
        break;
      }
      case 'armThickness': {
        if (el) {
          const thick = Math.max(1, Math.min(20, parseFloat(value) || 3));
          el.querySelectorAll('.lite-payload').forEach(node => {
            node.setAttribute('data-arm-thickness', String(thick));
            if (typeof node.getBBox === 'function') {
              try {
                const bb = node.getBBox();
                const cx = bb.x + bb.width / 2;
                const cy = bb.y + bb.height / 2;
                const rx = bb.width / 2;
                const ry = bb.height / 2;
                if (rx > 0 && ry > 0) {
                  if (node.tagName && node.tagName.toLowerCase() === 'path') {
                    const ha = Math.max(0.5, Math.min(rx * 0.9, ry * 0.9, thick / 2));
                    const d = `M ${(cx - ha).toFixed(2)},${(cy - ry).toFixed(2)} L ${(cx + ha).toFixed(2)},${(cy - ry).toFixed(2)} L ${(cx + ha).toFixed(2)},${(cy - ha).toFixed(2)} L ${(cx + rx).toFixed(2)},${(cy - ha).toFixed(2)} L ${(cx + rx).toFixed(2)},${(cy + ha).toFixed(2)} L ${(cx + ha).toFixed(2)},${(cy + ha).toFixed(2)} L ${(cx + ha).toFixed(2)},${(cy + ry).toFixed(2)} L ${(cx - ha).toFixed(2)},${(cy + ry).toFixed(2)} L ${(cx - ha).toFixed(2)},${(cy + ha).toFixed(2)} L ${(cx - rx).toFixed(2)},${(cy + ha).toFixed(2)} L ${(cx - rx).toFixed(2)},${(cy - ha).toFixed(2)} L ${(cx - ha).toFixed(2)},${(cy - ha).toFixed(2)} Z`;
                    node.setAttribute('d', d);
                  } else if (node.tagName && node.tagName.toLowerCase() === 'polygon') {
                    const pts = [];
                    const waist = Math.max(0.5, Math.min(rx * 0.45, ry * 0.45, thick * 0.65));
                    for (let i = 0; i < 8; i++) {
                      const ang = (Math.PI / 4) * i - Math.PI / 2;
                      const radX = i % 2 === 0 ? rx : waist;
                      const radY = i % 2 === 0 ? ry : waist;
                      pts.push(`${(cx + Math.cos(ang) * radX).toFixed(2)},${(cy + Math.sin(ang) * radY).toFixed(2)}`);
                    }
                    node.setAttribute('points', pts.join(' '));
                  }
                }
              } catch (e) {}
            }
          });
        }
        break;
      }
      case 'bgOpacity': {
        if (el && el.getAttribute('data-lite-kind') === 'text-lite') {
          const op = Math.max(0, Math.min(1, parseFloat(value) !== undefined && !isNaN(parseFloat(value)) ? parseFloat(value) : 0.85));
          el.setAttribute('data-text-bg-opacity', String(op));
          const box = el.querySelector('.lite-text-box');
          if (box) {
            box.setAttribute('fill-opacity', String(op));
            if (box.style) box.style.fillOpacity = String(op);
          }
        }
        break;
      }
      case 'fontSize': {
        if (el && el.getAttribute('data-lite-kind') === 'text-lite') {
          const fs = Math.max(8, Math.min(120, parseFloat(value) || 18));
          el.setAttribute('data-text-font-size', String(fs));
          const txtEl = el.querySelector('.lite-text-element') || el.querySelector('text');
          if (txtEl) {
            txtEl.setAttribute('font-size', String(fs));
            if (txtEl.style) txtEl.style.fontSize = `${fs}px`;
          }
          const curStr = el.getAttribute('data-text-content') || (txtEl && txtEl.textContent) || '';
          renderWidgetTextLiteLinesToDOM(el, curStr);
          if (instance && typeof instance._reconfigureTextLiteTicker === 'function') {
            instance._reconfigureTextLiteTicker(el);
          }
        }
        break;
      }
      case 'letterSpacing': {
        if (el && el.getAttribute('data-lite-kind') === 'text-lite') {
          const ls = Math.max(-2, Math.min(20, parseFloat(value) || 0));
          el.setAttribute('data-text-letter-spacing', String(ls));
          const txtEl = el.querySelector('.lite-text-element') || el.querySelector('text');
          if (txtEl) {
            txtEl.setAttribute('letter-spacing', String(ls));
            if (txtEl.style) txtEl.style.letterSpacing = `${ls}px`;
          }
          const curStr = el.getAttribute('data-text-content') || (txtEl && txtEl.textContent) || '';
          renderWidgetTextLiteLinesToDOM(el, curStr);
          if (instance && typeof instance._reconfigureTextLiteTicker === 'function') {
            instance._reconfigureTextLiteTicker(el);
          }
        }
        break;
      }
      case 'padding': {
        if (el && el.getAttribute('data-lite-kind') === 'text-lite') {
          const pad = Math.max(0, Math.min(60, parseFloat(value) !== undefined && !isNaN(parseFloat(value)) ? parseFloat(value) : 12));
          el.setAttribute('data-text-padding', String(pad));
          const curStr = el.getAttribute('data-text-content') || '';
          renderWidgetTextLiteLinesToDOM(el, curStr);
          if (instance && typeof instance._reconfigureTextLiteTicker === 'function') {
            instance._reconfigureTextLiteTicker(el);
          }
        }
        break;
      }
      case 'linesPerSec': {
        if (el && el.getAttribute('data-lite-kind') === 'text-lite') {
          const lps = Math.max(0.1, Math.min(20, parseFloat(value) || 1.2));
          el.setAttribute('data-text-lines-per-sec', String(lps));
          if (instance && typeof instance._reconfigureTextLiteTicker === 'function') {
            instance._reconfigureTextLiteTicker(el);
          }
        }
        break;
      }
      case 'lineSpacing': {
        if (el && el.getAttribute('data-lite-kind') === 'text-lite') {
          const lsp = Math.max(0.8, Math.min(3.0, parseFloat(value) || 1.25));
          el.setAttribute('data-text-line-spacing', String(lsp));
          const curStr = el.getAttribute('data-text-content') || '';
          renderWidgetTextLiteLinesToDOM(el, curStr);
          if (instance && typeof instance._reconfigureTextLiteTicker === 'function') {
            instance._reconfigureTextLiteTicker(el);
          }
        }
        break;
      }
      case 'holdDelay': {
        if (el && el.getAttribute('data-lite-kind') === 'text-lite') {
          const hd = Math.max(0, Math.min(30, parseFloat(value) !== undefined && !isNaN(parseFloat(value)) ? parseFloat(value) : 1.5));
          el.setAttribute('data-text-hold-delay', String(hd));
        }
        break;
      }
      case 'clearDuration': {
        if (el && el.getAttribute('data-lite-kind') === 'text-lite') {
          const cd = Math.max(0, Math.min(30, parseFloat(value) !== undefined && !isNaN(parseFloat(value)) ? parseFloat(value) : 0.6));
          el.setAttribute('data-text-clear-duration', String(cd));
        }
        break;
      }
      case 'typeMode': {
        if (el && el.getAttribute('data-lite-kind') === 'text-lite') {
          const tm = String(value || 'hold');
          el.setAttribute('data-text-type-mode', tm);
        }
        break;
      }
      case 'typeRepeat': {
        if (el && el.getAttribute('data-lite-kind') === 'text-lite') {
          const tr = value !== false && value !== 'false' && value !== 0 && value !== '0';
          el.setAttribute('data-text-type-repeat', tr ? 'true' : 'false');
        }
        break;
      }
      case 'textAnim': {
        if (el && el.getAttribute('data-lite-kind') === 'text-lite') {
          const ta = String(value || 'none');
          el.setAttribute('data-text-anim', ta);
        }
        break;
      }
      case 'minScale': {
        if (el) {
          const ms = Math.max(0.05, Math.min(2.0, parseFloat(value) || 0.15));
          el.setAttribute('data-min-scale', String(ms));
          el.querySelectorAll('.lite-payload').forEach((node) => {
            node.setAttribute('data-min-scale', String(ms));
            if (node.style && typeof node.style.setProperty === 'function') {
              node.style.setProperty('--sva-pulse-min', String(ms));
              node.style.setProperty('--sva-radar-min', String(ms));
            }
          });
        }
        break;
      }
      case 'rings': {
        if (el) {
          const rc = Math.max(1, Math.min(6, parseInt(value, 10) || 3));
          el.setAttribute('data-radar-rings', String(rc));
        }
        break;
      }
      case 'curvature': {
        if (el) {
          const cv = Math.max(-100, Math.min(100, parseFloat(value) || 0));
          el.setAttribute('data-curvature', String(cv));
          if (el.getAttribute('data-lite-kind') === 'text-lite') {
            el.setAttribute('data-text-curvature', String(cv));
          } else if (el.getAttribute('data-lite-kind') === 'flow-lite') {
            el.setAttribute('data-flow-curvature', String(cv));
          }
        }
        break;
      }
      case 'delay':
      case 'endDelay':
      case 'startMode':
      case 'endMode': {
        if (el && el.getAttribute('data-lite-kind') === 'flow-lite') {
          if (property === 'delay') {
            el.setAttribute('data-flow-delay', String(Math.max(0, Math.min(30, parseFloat(value) || 0))));
          } else if (property === 'endDelay') {
            el.setAttribute('data-flow-end-delay', String(Math.max(0, Math.min(30, parseFloat(value) || 0))));
          } else if (property === 'startMode') {
            el.setAttribute('data-flow-start-mode', String(value) === 'abrupt' ? 'abrupt' : 'tunnel');
          } else if (property === 'endMode') {
            el.setAttribute('data-flow-end-mode', String(value) === 'abrupt' ? 'abrupt' : 'tunnel');
          }
        }
        break;
      }
      case 'segmentStyle': {
        if (el) {
          const ss = String(value || 'solid');
          el.setAttribute('data-lite-segment-style', ss);
          el.querySelectorAll('.lite-payload').forEach((node) => {
            node.setAttribute('stroke-linecap', (ss === 'rounded' || ss === 'dots') ? 'round' : 'butt');
          });
        }
        break;
      }
      case 'labelText':
      case 'unit': {
        if (el && el.getAttribute('data-lite-kind') === 'gauge-lite') {
          if (property === 'labelText') {
            el.setAttribute('data-gauge-label', String(value === undefined || value === null ? '' : value));
            const lblNode = el.querySelector('.lite-gauge-label-text');
            if (lblNode) lblNode.textContent = String(value === undefined || value === null ? '' : value);
          } else {
            el.setAttribute('data-gauge-unit', String(value === undefined || value === null ? '' : value));
          }
          updateGaugeLiteDOM(el);
        }
        break;
      }
      default:
        if (el) {
          try { el.setAttribute(property, String(value)); } catch (e) {}
          try { el.style[property] = String(value); } catch (e) {}
          if (el.tagName && el.tagName.toLowerCase() === 'g') {
            const primary = el.querySelector('rect, circle, path, polygon, ellipse');
            if (primary) {
              try { primary.setAttribute(property, String(value)); } catch (e) {}
              try { primary.style[property] = String(value); } catch (e) {}
            }
          }
        }
        break;
    }
  }

  const SVGWidget = {
    version: '1.2.0',

    generateInstanceId,
    resolveTargetElement,
    applyPropertyToElement,
    applyLifecycleAction,

    /**
     * Isolates an SVG string so all IDs, references, CSS, and animations
     * are strictly scoped to the given instanceId.
     */
    isolate(rawSvg, options = {}) {
      return isolateSVGString(rawSvg, options);
    },

    /**
     * Parses an isolated SVG string into a live SVGElement.
     */
    create(rawSvg, options = {}) {
      const isolatedSvg = isolateSVGString(rawSvg, options);
      if (typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        const doc = parser.parseFromString(isolatedSvg, 'image/svg+xml');
        const err = doc.querySelector('parsererror');
        if (err) {
          throw new Error('SVGWidget.create XML parser error: ' + err.textContent);
        }
        return doc.documentElement;
      }
      throw new Error('SVGWidget.create requires a browser DOM environment with DOMParser.');
    },

    /**
     * Mounts an SVG widget instance into a DOM container element.
     * Supports optional Shadow DOM isolation for total encapsulation.
     * Returns an authoritative, fully interactive widget instance handle.
     */
    mount(target, rawSvg, options = {}) {
      if (typeof document === 'undefined') {
        throw new Error('SVGWidget.mount requires a browser document environment.');
      }

      let container = target;
      if (typeof target === 'string') {
        container = document.querySelector(target);
      }
      if (!container || !container.appendChild) {
        throw new Error(`SVGWidget.mount target container not found: ${target}`);
      }

      // 1. Resolve manifest (options.manifest or embedded script in rawSvg)
      let manifest = options.manifest;
      if (!manifest) {
        manifest = extractManifestFromSVG(rawSvg);
      }
      if (!manifest || !Array.isArray(manifest.parameters)) {
        manifest = { schemaVersion: 1, parameters: [] };
      }

      // 2. Isolate SVG markup
      const instanceId = options.instanceId || generateInstanceId();
      const details = isolateSVGString(rawSvg, {
        instanceId,
        prefix: options.prefix,
        scopeCss: options.scopeCss !== false,
        manifest: manifest,
        rawDetails: true
      });

      // 3. Mount in container (Light DOM or Shadow DOM)
      let mountRoot = container;
      let shadowRoot = null;

      if (options.shadowDOM) {
        try {
          shadowRoot = container.attachShadow({ mode: 'open' });
          mountRoot = shadowRoot;
        } catch (err) {
          console.warn('[SVGWidget] Failed to attach shadow root, mounting in light DOM:', err);
          mountRoot = container;
        }
      }

      // Create a wrapper div to contain the SVG
      const wrapper = document.createElement('div');
      wrapper.className = 'sva-widget-wrapper';
      wrapper.setAttribute('data-sva-widget-instance', instanceId);
      wrapper.style.display = 'block';
      wrapper.style.width = options.width ? (typeof options.width === 'number' ? `${options.width}px` : options.width) : '100%';
      wrapper.style.height = options.height ? (typeof options.height === 'number' ? `${options.height}px` : options.height) : '100%';
      wrapper.style.position = 'relative';
      wrapper.style.overflow = 'hidden';

      wrapper.innerHTML = details.isolatedSvg;
      mountRoot.appendChild(wrapper);

      const svgEl = wrapper.querySelector('svg');

      // 4. Parameter state mapping
      const paramMap = {};
      const currentValues = {};
      for (const p of manifest.parameters) {
        if (p && p.name) {
          paramMap[p.name] = p;
          if (p.default !== undefined) {
            currentValues[p.name] = p.default;
          }
        }
      }

      // 5. Event system
      const eventListeners = {};

      // 6. Animation & Visibility-Aware Suspension State
      let isPaused = false;
      let isVisible = true;
      let isReducedMotion = false;
      let isSuspended = false;
      let currentSpeed = 1.0;
      let visibilityObserver = null;
      let reducedMotionQuery = null;
      let reducedMotionHandler = null;

      const visibilityAware = options.visibilityAware !== false;
      const reducedMotionMode = options.reducedMotion || 'auto'; // 'auto' | 'reduce' | 'ignore'

      // Ensure global paused/suspended CSS helper exists once in document
      if (typeof document !== 'undefined' && typeof document.getElementById === 'function' && !document.getElementById('sva-widget-global-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'sva-widget-global-style';
        styleEl.textContent = `
          .sva-widget-wrapper.sva-paused *,
          .sva-widget-wrapper.sva-paused,
          .sva-widget-wrapper.sva-suspended *,
          .sva-widget-wrapper.sva-suspended {
            animation-play-state: paused !important;
          }
        `;
        const targetHost = document.head || document.body;
        if (targetHost && typeof targetHost.appendChild === 'function') {
          targetHost.appendChild(styleEl);
        }
      }

      function setSMILSuspended(svgRoot, suspended) {
        if (!svgRoot || typeof svgRoot.querySelectorAll !== 'function') return;
        const smilEls = svgRoot.querySelectorAll('animate, animateMotion, animateTransform');
        if (!smilEls || smilEls.length === 0) return;
        smilEls.forEach((animEl) => {
          if (suspended) {
            if (animEl.dataset && animEl.dataset.svaOrigBegin === undefined) {
              animEl.dataset.svaOrigBegin = animEl.getAttribute('begin') || '0s';
            }
            animEl.setAttribute('begin', 'indefinite');
            if (typeof animEl.endElement === 'function') {
              try { animEl.endElement(); } catch (e) {}
            }
          } else {
            const origBegin = (animEl.dataset && animEl.dataset.svaOrigBegin !== undefined)
              ? animEl.dataset.svaOrigBegin
              : '0s';
            animEl.setAttribute('begin', origBegin);
            if (animEl.dataset) delete animEl.dataset.svaOrigBegin;
            if (typeof animEl.beginElement === 'function') {
              try { animEl.beginElement(); } catch (e) {}
            }
          }
        });
      }

      const burstTimers = new Set();
      function clearBurstTimers() {
        burstTimers.forEach((tid) => clearTimeout(tid));
        burstTimers.clear();
      }

      // Per-instance Text Box Lite runtime state machine (Stage 16D-C T3/T4)
      const textLiteControllers = new Map();
      const SCRAMBLE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&@*+-=?';

      function clearTextLiteTimer(ctrl) {
        if (ctrl && ctrl.timerId) {
          clearTimeout(ctrl.timerId);
          ctrl.timerId = null;
        }
      }

      function clearAllTextLiteTimers() {
        textLiteControllers.forEach((ctrl) => {
          clearTextLiteTimer(ctrl);
        });
      }

      function applyTextLiteDOMText(el, str) {
        let anim = el.getAttribute('data-text-anim') || 'none';
        if (anim === 'overtype') anim = 'typewriter';
        if (anim === 'typewriter' || anim === 'scramble' || el.getAttribute('data-text-variant') === 'curved') {
          const tNode = getTextLiteTargetNode(el);
          if (tNode) tNode.textContent = str;
        } else {
          renderWidgetTextLiteLinesToDOM(el, str);
        }
      }

      function restartTextLiteCSSElement(txtEl) {
        if (!txtEl || !txtEl.style) return;
        const prevAnim = txtEl.style.animationName || '';
        txtEl.style.animationName = 'none';
        try { void txtEl.getBoundingClientRect(); } catch (e) {}
        txtEl.style.animationName = prevAnim;
      }

      function adoptPendingTextIfAny(el, ctrl) {
        if (!ctrl || ctrl.pendingText === null) return false;
        ctrl.previousText = ctrl.currentText;
        ctrl.currentText = ctrl.pendingText;
        ctrl.pendingText = null;
        ctrl.handoverCount = (ctrl.handoverCount || 0) + 1;
        el.setAttribute('data-text-content', ctrl.currentText);
        el.removeAttribute('data-text-pending');
        el.setAttribute('data-text-handover-count', String(ctrl.handoverCount));
        return true;
      }

      function startTextLiteStepCycle(el, ctrl) {
        if (!el || !ctrl || handle.isDestroyed) return;
        clearTextLiteTimer(ctrl);
        if (ctrl.isPlaying === false || el.getAttribute('data-lite-play') === 'false') {
          applyTextLiteDOMText(el, ctrl.currentText);
          return;
        }
        let anim = el.getAttribute('data-text-anim') || 'none';
        if (anim === 'overtype') anim = 'typewriter';
        if (anim !== 'typewriter' && anim !== 'scramble') return;

        ctrl.cycleCompleted = false;
        el.removeAttribute('data-text-cycle-completed');
        const targetGraphemes = segmentGraphemes(ctrl.currentText);
        const totalSteps = targetGraphemes.length;

        ctrl.phase = 'forward';
        ctrl.stepIndex = 0;

        if (anim === 'typewriter') {
          applyTextLiteDOMText(el, '');
        }

        function scheduleNext(delayMs) {
          if (isSuspended || handle.isDestroyed || ctrl.isPlaying === false) return;
          ctrl.timerId = setTimeout(tickStep, Math.max(8, delayMs));
        }

        function onCycleBoundaryReached() {
          ctrl.timerId = null;
          if (ctrl.isPlaying === false || el.getAttribute('data-lite-play') === 'false') return;
          let typeMode = el.getAttribute('data-text-type-mode') || 'hold';
          if (typeMode === 'loop') typeMode = 'delete';
          const typeRepeat = el.getAttribute('data-text-type-repeat') === 'true';
          const pMode = el.getAttribute('data-text-playback-mode') || 'loop';
          const adopted = adoptPendingTextIfAny(el, ctrl);
          if (adopted) {
            startTextLiteStepCycle(el, ctrl);
            return;
          }
          if (anim === 'typewriter' && !typeRepeat) {
            ctrl.cycleCompleted = true;
            el.setAttribute('data-text-cycle-completed', 'true');
            return;
          }
          if (anim === 'scramble' && pMode === 'once') {
            ctrl.cycleCompleted = true;
            el.setAttribute('data-text-cycle-completed', 'true');
            return;
          }
          ctrl.previousText = ctrl.currentText;
          startTextLiteStepCycle(el, ctrl);
        }

        function tickStep() {
          ctrl.timerId = null;
          if (isSuspended || handle.isDestroyed || ctrl.isPlaying === false || el.getAttribute('data-lite-play') === 'false') return;
          const baseRate = Math.max(1, Math.min(120, parseFloat(el.getAttribute('data-text-type-speed')) || 14));
          const localSpdFactor = getEffectiveLocalSpeedFactor(el, el);
          const masterSpd = (typeof currentSpeed === 'number' && currentSpeed > 0) ? currentSpeed : 1.0;
          const rate = Math.max(0.5, baseRate * localSpdFactor * masterSpd);
          const stepMs = Math.max(8, Math.round(1000 / rate));
          const holdMs = Math.max(0, (parseFloat(el.getAttribute('data-text-hold-delay')) || 1.2) * 1000);
          let typeMode = el.getAttribute('data-text-type-mode') || 'hold';
          if (typeMode === 'loop') typeMode = 'delete';

          if (anim === 'typewriter') {
            const gNow = segmentGraphemes(ctrl.currentText);
            if (ctrl.phase === 'forward') {
              if (ctrl.stepIndex < gNow.length) {
                ctrl.stepIndex += 1;
                applyTextLiteDOMText(el, gNow.slice(0, ctrl.stepIndex).join(''));
                scheduleNext(stepMs);
              } else {
                applyTextLiteDOMText(el, ctrl.currentText);
                if (typeMode === 'once') {
                  onCycleBoundaryReached();
                } else if (typeMode === 'delete') {
                  ctrl.phase = 'hold-before-delete';
                  scheduleNext(Math.max(30, holdMs));
                } else if (typeMode === 'delete-forward') {
                  ctrl.phase = 'hold-before-delete-forward';
                  scheduleNext(Math.max(30, holdMs));
                } else {
                  ctrl.phase = 'hold-end';
                  scheduleNext(Math.max(30, holdMs));
                }
              }
            } else if (ctrl.phase === 'hold-before-delete') {
              ctrl.phase = 'delete';
              scheduleNext(stepMs);
            } else if (ctrl.phase === 'hold-before-delete-forward') {
              ctrl.phase = 'delete-forward';
              ctrl.deleteCount = 0;
              scheduleNext(stepMs);
            } else if (ctrl.phase === 'delete') {
              if (ctrl.stepIndex > 0) {
                ctrl.stepIndex -= 1;
                applyTextLiteDOMText(el, gNow.slice(0, ctrl.stepIndex).join(''));
                scheduleNext(Math.max(8, Math.round(stepMs * 0.7)));
              } else {
                applyTextLiteDOMText(el, '');
                onCycleBoundaryReached();
              }
            } else if (ctrl.phase === 'delete-forward') {
              ctrl.deleteCount = (ctrl.deleteCount || 0) + 1;
              if (ctrl.deleteCount < gNow.length) {
                applyTextLiteDOMText(el, gNow.slice(ctrl.deleteCount).join(''));
                scheduleNext(Math.max(8, Math.round(stepMs * 0.7)));
              } else {
                applyTextLiteDOMText(el, '');
                onCycleBoundaryReached();
              }
            } else {
              onCycleBoundaryReached();
            }
          } else if (anim === 'scramble') {
            const gNow = segmentGraphemes(ctrl.currentText);
            if (ctrl.phase === 'forward') {
              if (ctrl.stepIndex < gNow.length) {
                ctrl.stepIndex += 1;
                let out = gNow.slice(0, ctrl.stepIndex).join('');
                for (let i = ctrl.stepIndex; i < gNow.length; i++) {
                  const ch = gNow[i];
                  if (ch === ' ') out += ' ';
                  else out += SCRAMBLE_ALPHABET[(ctrl.stepIndex * 7 + i * 13) % SCRAMBLE_ALPHABET.length];
                }
                applyTextLiteDOMText(el, out);
                scheduleNext(stepMs);
              } else {
                applyTextLiteDOMText(el, ctrl.currentText);
                ctrl.phase = 'hold-end';
                scheduleNext(Math.max(40, holdMs));
              }
            } else {
              onCycleBoundaryReached();
            }
          }
        }

        if (!isSuspended) {
          const rate = Math.max(1, Math.min(120, parseFloat(el.getAttribute('data-text-type-speed')) || 14));
          const firstStepMs = totalSteps === 0 ? 16 : Math.max(8, Math.round(1000 / rate));
          scheduleNext(firstStepMs);
        }
      }

      function initTextLiteControllers() {
        if (!svgEl || typeof svgEl.querySelectorAll !== 'function') return;
        svgEl.querySelectorAll('[data-lite-kind="text-lite"]').forEach((el) => {
          if (textLiteControllers.has(el)) return;
          const initialText = el.getAttribute('data-text-content') !== null
            ? el.getAttribute('data-text-content')
            : ((getTextLiteTargetNode(el) && getTextLiteTargetNode(el).textContent) || '');
          let anim = el.getAttribute('data-text-anim') || 'none';
          if (anim === 'overtype') {
            anim = 'typewriter';
            el.setAttribute('data-text-anim', 'typewriter');
          }
          const initialPlay = el.getAttribute('data-lite-play') !== 'false' && el.getAttribute('data-play-animation') !== 'false';
          const ctrl = {
            el,
            currentText: initialText,
            previousText: initialText,
            pendingText: null,
            timerId: null,
            phase: 'forward',
            stepIndex: 0,
            deleteCount: 0,
            iterCount: 0,
            cycleCompleted: false,
            handoverCount: 0,
            isPlaying: initialPlay
          };
          textLiteControllers.set(el, ctrl);

          const txtEl = el.querySelector('.lite-text-element') || el.querySelector('text');
          if (txtEl && !txtEl.hasAttribute('data-orig-inline-anim')) {
            const curInline = (txtEl.style && txtEl.style.animationName && txtEl.style.animationName !== 'none')
              ? txtEl.style.animationName
              : '';
            txtEl.setAttribute('data-orig-inline-anim', curInline);
          }
          if (txtEl && typeof txtEl.addEventListener === 'function') {
            txtEl.addEventListener('animationiteration', () => {
              if (handle.isDestroyed || ctrl.isPlaying === false) return;
              let curAnim = el.getAttribute('data-text-anim') || 'none';
              if (curAnim === 'overtype') curAnim = 'typewriter';
              if (curAnim === 'none' || curAnim === 'typewriter' || curAnim === 'scramble') return;
              ctrl.iterCount = (ctrl.iterCount || 0) + 1;
              const pMode = el.getAttribute('data-text-playback-mode') || 'loop';
              // In Ping-Pong mode on alternate CSS animations (ticker-h, ticker-v, stacked-v), a full forward+return cycle is 2 iterations!
              if (pMode === 'pingpong' && (curAnim === 'ticker-h' || curAnim === 'ticker-v' || curAnim === 'stacked-v') && (ctrl.iterCount % 2 !== 0)) {
                return;
              }
              if (adoptPendingTextIfAny(el, ctrl)) {
                applyTextLiteDOMText(el, ctrl.currentText);
                if (curAnim === 'ticker-h' || curAnim === 'ticker-v' || curAnim === 'stacked-v') {
                  configureTextLiteTicker(el, ctrl);
                  ctrl.iterCount = 0;
                  restartTextLiteCSSElement(txtEl);
                }
              }
            });
            txtEl.addEventListener('animationend', () => {
              if (handle.isDestroyed || ctrl.isPlaying === false) return;
              let curAnim = el.getAttribute('data-text-anim') || 'none';
              if (curAnim === 'overtype') curAnim = 'typewriter';
              if (curAnim === 'none' || curAnim === 'typewriter' || curAnim === 'scramble') return;
              if (adoptPendingTextIfAny(el, ctrl)) {
                applyTextLiteDOMText(el, ctrl.currentText);
                if (curAnim === 'ticker-h' || curAnim === 'ticker-v' || curAnim === 'stacked-v') {
                  configureTextLiteTicker(el, ctrl);
                }
                restartTextLiteCSSElement(txtEl);
              } else {
                ctrl.cycleCompleted = true;
                el.setAttribute('data-text-cycle-completed', 'true');
              }
            });
          }

          if (!initialPlay) {
            applyTextLiteDOMText(el, ctrl.currentText);
            if (txtEl && txtEl.style) {
              txtEl.style.animationPlayState = 'paused';
              txtEl.style.animationName = 'none';
            }
          } else if (anim === 'none') {
            applyTextLiteDOMText(el, ctrl.currentText);
          } else if (anim === 'ticker-h' || anim === 'ticker-v' || anim === 'stacked-v') {
            configureTextLiteTicker(el, ctrl);
            if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
              document.fonts.ready.then(() => {
                if (!handle.isDestroyed && ctrl.isPlaying !== false) configureTextLiteTicker(el, ctrl);
              }).catch(() => {});
            }
          } else if (anim === 'typewriter' || anim === 'scramble') {
            startTextLiteStepCycle(el, ctrl);
          } else {
            applyTextLiteDOMText(el, ctrl.currentText);
          }
        });
      }

      function setTextLitePlayState(el, shouldPlay, isInit, wasStopped) {
        if (!el) return;
        initTextLiteControllers();
        let ctrl = textLiteControllers.get(el);
        const txtEl = el.querySelector('.lite-text-element') || el.querySelector('text');
        if (txtEl && !txtEl.hasAttribute('data-orig-inline-anim')) {
          const curInline = (txtEl.style && txtEl.style.animationName && txtEl.style.animationName !== 'none')
            ? txtEl.style.animationName
            : '';
          txtEl.setAttribute('data-orig-inline-anim', curInline);
        }
        if (!ctrl) {
          const initialText = el.getAttribute('data-text-content') !== null
            ? el.getAttribute('data-text-content')
            : ((getTextLiteTargetNode(el) && getTextLiteTargetNode(el).textContent) || '');
          ctrl = {
            el,
            currentText: initialText,
            previousText: initialText,
            pendingText: null,
            timerId: null,
            phase: 'forward',
            stepIndex: 0,
            deleteCount: 0,
            iterCount: 0,
            cycleCompleted: false,
            handoverCount: 0,
            isPlaying: shouldPlay
          };
          textLiteControllers.set(el, ctrl);
        }

        const prevPlaying = ctrl.isPlaying !== false;
        ctrl.isPlaying = shouldPlay;
        el.setAttribute('data-lite-play', shouldPlay ? 'true' : 'false');
        el.setAttribute('data-play-animation', shouldPlay ? 'true' : 'false');

        let anim = el.getAttribute('data-text-anim') || 'none';
        if (anim === 'overtype') anim = 'typewriter';

        if (!shouldPlay) {
          clearTextLiteTimer(ctrl);
          applyTextLiteDOMText(el, ctrl.currentText);
          if (txtEl && txtEl.style) {
            txtEl.style.animationPlayState = 'paused';
            txtEl.style.animationName = 'none';
          }
          return;
        }

        // shouldPlay === true
        if (isInit && prevPlaying && !wasStopped) {
          return;
        }

        adoptPendingTextIfAny(el, ctrl);
        ctrl.cycleCompleted = false;
        ctrl.iterCount = 0;
        el.removeAttribute('data-text-cycle-completed');

        if (anim === 'typewriter' || anim === 'scramble') {
          startTextLiteStepCycle(el, ctrl);
        } else if (anim === 'ticker-h' || anim === 'ticker-v' || anim === 'stacked-v') {
          if (txtEl && txtEl.style) {
            txtEl.style.animationPlayState = 'running';
            txtEl.style.animationName = txtEl.getAttribute('data-orig-inline-anim') || '';
          }
          configureTextLiteTicker(el, ctrl);
          restartTextLiteCSSElement(txtEl);
        } else if (anim !== 'none') {
          applyTextLiteDOMText(el, ctrl.currentText);
          if (txtEl && txtEl.style) {
            const pMode = el.getAttribute('data-text-playback-mode') || 'loop';
            txtEl.style.animationIterationCount = pMode === 'once' ? '1' : 'infinite';
            if (pMode === 'once') txtEl.style.animationFillMode = 'forwards';
            txtEl.style.animationPlayState = 'running';
            txtEl.style.animationName = txtEl.getAttribute('data-orig-inline-anim') || '';
          }
          restartTextLiteCSSElement(txtEl);
        } else {
          applyTextLiteDOMText(el, ctrl.currentText);
        }
      }

      function pauseOrResumeTextLite(el, isPause) {
        if (!el) return;
        initTextLiteControllers();
        const ctrl = textLiteControllers.get(el);
        const txtEl = el.querySelector('.lite-text-element') || el.querySelector('text');
        let anim = el.getAttribute('data-text-anim') || 'none';
        if (anim === 'overtype') anim = 'typewriter';
        if (isPause) {
          if (ctrl) {
            ctrl.isMidCyclePaused = true;
            clearTextLiteTimer(ctrl);
          }
          if (txtEl && txtEl.style) {
            txtEl.style.animationPlayState = 'paused';
          }
        } else {
          if (ctrl) {
            ctrl.isMidCyclePaused = false;
            if (ctrl.isPlaying !== false && (anim === 'typewriter' || anim === 'scramble') && !ctrl.cycleCompleted && !ctrl.timerId) {
              const rate = Math.max(1, Math.min(120, parseFloat(el.getAttribute('data-text-type-speed')) || 14));
              startTextLiteStepCycle(el, ctrl);
            }
          }
          if (txtEl && txtEl.style) {
            txtEl.style.animationPlayState = 'running';
          }
        }
      }

      function updateTextLiteContent(el, newStr, isInit) {
        if (!el) return;
        initTextLiteControllers();
        let ctrl = textLiteControllers.get(el);
        if (!ctrl) {
          ctrl = {
            el,
            currentText: String(newStr),
            previousText: String(newStr),
            pendingText: null,
            timerId: null,
            phase: 'forward',
            stepIndex: 0,
            deleteCount: 0,
            iterCount: 0,
            cycleCompleted: false,
            handoverCount: 0
          };
          textLiteControllers.set(el, ctrl);
        }
        let anim = el.getAttribute('data-text-anim') || 'none';
        if (anim === 'overtype') anim = 'typewriter';
        const strVal = String(newStr === undefined || newStr === null ? '' : newStr);

        // Static mode or initial mount or suspended/paused or play=false: adopt immediately!
        if (isInit || anim === 'none' || isSuspended || isPaused || ctrl.isPlaying === false || el.getAttribute('data-lite-play') === 'false') {
          ctrl.previousText = ctrl.currentText;
          ctrl.currentText = strVal;
          ctrl.pendingText = null;
          el.setAttribute('data-text-content', strVal);
          el.removeAttribute('data-text-pending');
          applyTextLiteDOMText(el, strVal);
          if (ctrl.isPlaying === false || el.getAttribute('data-lite-play') === 'false') {
            return;
          }
          if (anim === 'ticker-h' || anim === 'ticker-v' || anim === 'stacked-v') {
            configureTextLiteTicker(el, ctrl);
            if (!isInit && (isSuspended || isPaused)) {
              const txtEl = el.querySelector('.lite-text-element') || el.querySelector('text');
              restartTextLiteCSSElement(txtEl);
            }
          } else if (!isInit && (anim === 'typewriter' || anim === 'scramble')) {
            if (!isSuspended && !isPaused) {
              startTextLiteStepCycle(el, ctrl);
            }
          }
          return;
        }

        // Non-repeating completed cycle (e.g. Play Once or Typewriter Once / Type Once & Hold after hold finished): start new cycle immediately!
        if (ctrl.cycleCompleted) {
          ctrl.previousText = ctrl.currentText;
          ctrl.currentText = strVal;
          ctrl.pendingText = null;
          ctrl.cycleCompleted = false;
          ctrl.handoverCount = (ctrl.handoverCount || 0) + 1;
          el.setAttribute('data-text-content', strVal);
          el.removeAttribute('data-text-pending');
          el.removeAttribute('data-text-cycle-completed');
          el.setAttribute('data-text-handover-count', String(ctrl.handoverCount));
          if (anim === 'typewriter' || anim === 'scramble') {
            startTextLiteStepCycle(el, ctrl);
          } else {
            applyTextLiteDOMText(el, ctrl.currentText);
            if (anim === 'ticker-h' || anim === 'ticker-v' || anim === 'stacked-v') {
              configureTextLiteTicker(el, ctrl);
            }
            const txtEl = el.querySelector('.lite-text-element') || el.querySelector('text');
            restartTextLiteCSSElement(txtEl);
          }
          return;
        }

        // Active cycle in progress: buffer in single-slot pendingText (overwriting any older pending message)!
        ctrl.pendingText = strVal;
        el.setAttribute('data-text-pending', strVal);
      }

      function restartBurstNode(node) {
        if (!node || !node.style || handle.isDestroyed) return;
        node.removeAttribute('data-burst-paused');
        const prevAnim = node.style.animationName || '';
        node.style.animationName = 'none';
        try { void node.getBoundingClientRect(); } catch (e) {}
        node.style.visibility = '';
        node.style.animationName = prevAnim;
      }

      if (svgEl && typeof svgEl.addEventListener === 'function') {
        svgEl.setAttribute('data-sva-runtime-managed', '1');
        svgEl.addEventListener('animationend', (e) => {
          const node = e && e.target;
          if (!node || !node.getAttribute) return;
          const cyc = parseInt(node.getAttribute('data-burst-cycles') || '0', 10);
          const pSec = parseFloat(node.getAttribute('data-pause-seconds') || '0');
          if (!(cyc > 0 && pSec > 0)) return;
          const vis = node.getAttribute('data-pause-visibility') || 'hide';
          if (vis === 'hide' && node.style) {
            node.style.visibility = 'hidden';
          }
          node.setAttribute('data-burst-paused', '1');
          if (isSuspended) return;
          const tid = setTimeout(() => {
            burstTimers.delete(tid);
            if (isSuspended || handle.isDestroyed) return;
            restartBurstNode(node);
          }, Math.max(10, pSec * 1000));
          burstTimers.add(tid);
        });
      }

      function applySuspensionState() {
        const shouldSuspend = isPaused || isReducedMotion || (visibilityAware && !isVisible);
        if (shouldSuspend === isSuspended) return;
        isSuspended = shouldSuspend;
        if (wrapper && wrapper.classList) {
          if (isSuspended) wrapper.classList.add('sva-suspended');
          else wrapper.classList.remove('sva-suspended');
        }
        setSMILSuspended(svgEl, isSuspended);
        if (isSuspended) {
          clearBurstTimers();
          clearAllTextLiteTimers();
        } else {
          if (svgEl && typeof svgEl.querySelectorAll === 'function') {
            svgEl.querySelectorAll('[data-burst-paused="1"]').forEach((node) => {
              restartBurstNode(node);
            });
          }
          textLiteControllers.forEach((ctrl, el) => {
            if (ctrl.isPlaying === false || el.getAttribute('data-lite-play') === 'false') return;
            adoptPendingTextIfAny(el, ctrl);
            let anim = el.getAttribute('data-text-anim') || 'none';
            if (anim === 'overtype') anim = 'typewriter';
            if (anim === 'typewriter' || anim === 'scramble') {
              if (!ctrl.cycleCompleted) {
                startTextLiteStepCycle(el, ctrl);
              }
            } else if (anim !== 'none') {
              applyTextLiteDOMText(el, ctrl.currentText);
              if (anim === 'ticker-h' || anim === 'ticker-v' || anim === 'stacked-v') {
                configureTextLiteTicker(el, ctrl);
              }
              const txtEl = el.querySelector('.lite-text-element') || el.querySelector('text');
              restartTextLiteCSSElement(txtEl);
            }
          });
        }
        if (typeof handle !== 'undefined' && handle._emit) {
          handle._emit('suspensionChange', {
            instanceId: handle.instanceId,
            suspended: isSuspended,
            visible: isVisible,
            reducedMotion: isReducedMotion
          });
        }
      }

      // 7. Construct instance handle
      const handle = {
        instanceId: details.instanceId,
        prefix: details.prefix,
        rootId: details.rootId,
        idMap: details.idMap,
        container: container,
        wrapper: wrapper,
        svgElement: svgEl,
        shadowRoot: shadowRoot,
        isDestroyed: false,

        // Parameter schema
        getManifest() {
          return JSON.parse(JSON.stringify(manifest));
        },

        getParameter(name) {
          if (currentValues.hasOwnProperty(name)) {
            return currentValues[name];
          }
          return undefined;
        },

        getParameters() {
          return Object.assign({}, currentValues);
        },

        setParameter(name, value) {
          const batch = {};
          batch[name] = value;
          return handle.setParameters(batch);
        },

        setParameters(batch, opts = {}) {
          if (handle.isDestroyed) {
            throw new Error(`Cannot setParameters on destroyed widget instance '${handle.instanceId}'.`);
          }
          if (!batch || typeof batch !== 'object') {
            throw new Error('setParameters expects a key-value object of parameter names and values.');
          }
          const isInit = Boolean(opts && opts._initialMount);
          const isForce = Boolean(opts && opts._force);

          // Phase 1: Full validation check (atomic)
          const validatedUpdates = [];
          for (const [key, val] of Object.entries(batch)) {
            const paramDef = paramMap[key];
            if (!paramDef) {
              throw new Error(`Unknown widget parameter: '${key}'`);
            }
            const valRes = validateParameterValue(paramDef, val);
            if (!valRes.valid) {
              throw new Error(valRes.error);
            }
            const targetEl = resolveTargetElement(svgEl, details.idMap, paramDef.target);
            const isGlobalTarget = !paramDef.target || paramDef.target === 'root' || paramDef.target === 'global';
            if (!targetEl && !isGlobalTarget) {
              throw new Error(`Target element '${paramDef.target}' not found in widget for parameter '${key}'.`);
            }

            const hasMultiTargets = Array.isArray(paramDef.targets) && paramDef.targets.length > 0;
            const resolvedTargets = [];
            let hasConditionalOrActionBinding = false;
            if (hasMultiTargets) {
              for (const tb of paramDef.targets) {
                const mTarget = tb && (tb.target || tb.Target);
                const mProp = tb && (tb.property || tb.Property || '');
                const mWhen = (tb && (tb.when !== undefined ? tb.when : tb.When)) || '';
                const mAction = (tb && (tb.action !== undefined ? tb.action : tb.Action)) || '';
                const mHasExplicitVal = tb && (tb.value !== undefined || tb.Value !== undefined);
                const mExplicitVal = tb && (tb.value !== undefined ? tb.value : tb.Value);

                if (mWhen || (mAction && mAction !== 'set') || (mHasExplicitVal && mExplicitVal !== null)) {
                  hasConditionalOrActionBinding = true;
                }

                if (!mTarget || (!mProp && !mAction)) {
                  throw new Error(`Invalid empty target binding in parameter '${key}'.`);
                }
                const memberEl = resolveTargetElement(svgEl, details.idMap, mTarget);
                if (!memberEl) {
                  throw new Error(`Mapped target element '${mTarget}' not found in widget for parameter '${key}'.`);
                }

                // Filter by When condition if present
                const normWhen = String(mWhen).trim();
                const isActiveBranch = !normWhen || normWhen.toLowerCase() === 'always' || normWhen === String(valRes.value);
                if (!isActiveBranch) {
                  continue;
                }

                const effTargetVal = (mHasExplicitVal && mExplicitVal !== null) ? mExplicitVal : valRes.value;
                const actionValidation = validateTargetActionAndValue(key, memberEl, mTarget, mProp, mAction, effTargetVal);
                if (!actionValidation.valid) {
                  throw new Error(actionValidation.error);
                }

                resolvedTargets.push({
                  el: memberEl,
                  target: mTarget,
                  property: mProp,
                  action: mAction,
                  value: actionValidation.value
                });
              }
            }

            // Idempotent repeated-value guard for conditional/action Component Builder parameters
            if (!isInit && !isForce && hasConditionalOrActionBinding && currentValues.hasOwnProperty(key) && currentValues[key] === valRes.value) {
              continue;
            }

            const isGroupUpdate = hasMultiTargets || (typeof paramDef.target === 'string' && paramDef.target.startsWith('group-'));
            validatedUpdates.push({
              paramDef,
              targetEl,
              cleanVal: valRes.value,
              hasMultiTargets,
              resolvedTargets,
              isGroupUpdate
            });
          }

          // Phase 2: Atomic DOM and state application
          // Precedence contract: Group-level and Component Builder multi-target updates apply first; direct member updates apply second within the same batch
          const orderedUpdates = [
            ...validatedUpdates.filter((u) => u.isGroupUpdate),
            ...validatedUpdates.filter((u) => !u.isGroupUpdate)
          ];

          const changed = {};
          for (const { paramDef, targetEl, cleanVal, hasMultiTargets, resolvedTargets } of orderedUpdates) {
            currentValues[paramDef.name] = cleanVal;
            changed[paramDef.name] = cleanVal;
            if (hasMultiTargets) {
              for (const rt of resolvedTargets) {
                const act = (rt.action && String(rt.action).trim().toLowerCase()) || '';
                if (act && act !== 'set') {
                  applyLifecycleAction(rt.el, svgEl, act, isInit, handle);
                } else {
                  let targetVal = rt.value !== undefined ? rt.value : cleanVal;
                  if ((rt.property === 'text' || rt.property === 'textContent') && typeof targetVal !== 'string') {
                    targetVal = String(targetVal);
                  }
                  const syntheticDef = Object.assign({}, paramDef, {
                    target: rt.target,
                    property: rt.property
                  });
                  applyPropertyToElement(rt.el, rt.property, targetVal, syntheticDef, handle, isInit);
                }
              }
            } else {
              applyPropertyToElement(targetEl, paramDef.property, cleanVal, paramDef, handle, isInit);
            }
          }

          if (Object.keys(changed).length > 0 || isInit) {
            handle._emit('change', { instanceId: handle.instanceId, parameters: changed });
            handle._emit('parametersChanged', { instanceId: handle.instanceId, parameters: handle.getParameters() });
          }
          return handle;
        },

        resetParameters() {
          if (svgEl) {
            svgEl.querySelectorAll('[data-lite-kind="gauge-lite"]').forEach((g) => {
              g.removeAttribute('data-gauge-color-override');
              g.removeAttribute('data-gauge-override-color');
            });
          }
          const defaults = {};
          for (const p of manifest.parameters) {
            if (p.default !== undefined) {
              defaults[p.name] = p.default;
            }
          }
          return handle.setParameters(defaults, { _initialMount: true });
        },

        // Animation playback controls
        play() {
          if (handle.isDestroyed) return handle;
          isPaused = false;
          if (wrapper && wrapper.classList && typeof wrapper.classList.remove === 'function') wrapper.classList.remove('sva-paused');
          applySuspensionState();
          if (svgEl && typeof svgEl.unpauseAnimations === 'function') {
            try { svgEl.unpauseAnimations(); } catch (e) {}
          }
          if (svgEl && typeof svgEl.getAnimations === 'function') {
            try {
              const anims = svgEl.getAnimations({ subtree: true });
              anims.forEach((a) => { try { a.play(); } catch (err) {} });
            } catch (e) {}
          }
          handle._emit('play', { instanceId: handle.instanceId });
          return handle;
        },

        pause() {
          if (handle.isDestroyed) return handle;
          isPaused = true;
          if (wrapper && wrapper.classList && typeof wrapper.classList.add === 'function') wrapper.classList.add('sva-paused');
          applySuspensionState();
          if (svgEl && typeof svgEl.pauseAnimations === 'function') {
            try { svgEl.pauseAnimations(); } catch (e) {}
          }
          if (svgEl && typeof svgEl.getAnimations === 'function') {
            try {
              const anims = svgEl.getAnimations({ subtree: true });
              anims.forEach((a) => { try { a.pause(); } catch (err) {} });
            } catch (e) {}
          }
          handle._emit('pause', { instanceId: handle.instanceId });
          return handle;
        },

        resume() {
          return handle.play();
        },

        stop() {
          handle.pause();
          if (svgEl && typeof svgEl.setCurrentTime === 'function') {
            try { svgEl.setCurrentTime(0); } catch (e) {}
          }
          handle._emit('stop', { instanceId: handle.instanceId });
          return handle;
        },

        isPaused() {
          return isPaused;
        },

        isSuspended() {
          return isSuspended;
        },

        isVisibleInViewport() {
          return isVisible;
        },

        suspendAnimations() {
          isPaused = true;
          applySuspensionState();
          return handle;
        },

        resumeAnimations() {
          isPaused = false;
          applySuspensionState();
          return handle;
        },

        setSpeed(speed) {
          const rate = Number(speed);
          if (isNaN(rate) || rate < 0) {
            throw new Error(`Invalid speed value: ${speed}. Must be a non-negative number.`);
          }
          currentSpeed = rate;
          if (wrapper && wrapper.style && typeof wrapper.style.setProperty === 'function') {
            wrapper.style.setProperty('--sva-speed', String(rate));
          }
          if (svgEl && typeof svgEl.getAnimations === 'function') {
            try {
              const anims = svgEl.getAnimations({ subtree: true });
              anims.forEach((a) => { try { a.playbackRate = rate; } catch (err) {} });
            } catch (e) {}
          }
          // Re-evaluate targeted speeds so: Effective Speed = Master Playback Rate × Group Speed × Member Speed
          if (manifest && Array.isArray(manifest.parameters)) {
            for (const p of manifest.parameters) {
              if (Array.isArray(p.targets) && p.targets.length > 0 && p.type === 'speed') {
                const targetSpeed = Number(currentValues[p.name]);
                if (!isNaN(targetSpeed) && targetSpeed > 0) {
                  for (const tb of p.targets) {
                    const mTarget = tb && (tb.target || tb.Target);
                    const mProp = tb && (tb.property || tb.Property);
                    if (mTarget && (mProp === 'speed' || mProp === 'playbackRate')) {
                      const memberEl = resolveTargetElement(svgEl, details.idMap, mTarget);
                      if (memberEl) applyTargetedSpeed(memberEl, targetSpeed, rate);
                    }
                  }
                }
              } else if ((p.property === 'speed' || p.property === 'playbackRate') && p.target && p.target !== 'root' && p.target !== 'global') {
                const targetSpeed = Number(currentValues[p.name]);
                if (!isNaN(targetSpeed) && targetSpeed > 0) {
                  const targetEl = resolveTargetElement(svgEl, details.idMap, p.target);
                  if (targetEl) {
                    applyTargetedSpeed(targetEl, targetSpeed, rate);
                  }
                }
              }
            }
          }
          handle._emit('speedChange', { instanceId: handle.instanceId, speed: rate });
          return handle;
        },

        getSpeed() {
          return currentSpeed;
        },

        // Events
        on(event, callback) {
          if (typeof callback !== 'function') return handle;
          if (!eventListeners[event]) eventListeners[event] = [];
          eventListeners[event].push(callback);
          return handle;
        },

        off(event, callback) {
          if (!eventListeners[event]) return handle;
          if (!callback) {
            delete eventListeners[event];
          } else {
            eventListeners[event] = eventListeners[event].filter((cb) => cb !== callback);
          }
          return handle;
        },

        _emit(event, data) {
          if (eventListeners[event]) {
            eventListeners[event].forEach((cb) => {
              try { cb(data); } catch (e) { console.error('[SVGWidget listener error]', e); }
            });
          }
        },

        // Unmount & destruction
        unmount() {
          while (hoverCleanups.length > 0) {
            const fn = hoverCleanups.pop();
            try { fn(); } catch (e) {}
          }
          clearBurstTimers();
          clearAllTextLiteTimers();
          textLiteControllers.clear();
          if (visibilityObserver) {
            try { visibilityObserver.disconnect(); } catch (e) {}
            visibilityObserver = null;
          }
          if (reducedMotionQuery && reducedMotionHandler) {
            try {
              if (typeof reducedMotionQuery.removeEventListener === 'function') {
                reducedMotionQuery.removeEventListener('change', reducedMotionHandler);
              } else if (typeof reducedMotionQuery.removeListener === 'function') {
                reducedMotionQuery.removeListener(reducedMotionHandler);
              }
            } catch (e) {}
            reducedMotionQuery = null;
            reducedMotionHandler = null;
          }
          if (wrapper && wrapper.parentNode) {
            wrapper.parentNode.removeChild(wrapper);
          }
          handle.isDestroyed = true;
          return handle;
        },

        destroy() {
          handle.stop();
          handle.unmount();
          handle._emit('destroy', { instanceId: handle.instanceId });
          for (const k in eventListeners) delete eventListeners[k];
          return handle;
        },

        _updateTextLiteContent(el, strVal, isInit) {
          updateTextLiteContent(el, strVal, isInit);
        },

        _setTextLitePlayState(el, shouldPlay, isInit, wasStopped) {
          setTextLitePlayState(el, shouldPlay, isInit, wasStopped);
        },

        _pauseOrResumeTextLite(el, isPause) {
          pauseOrResumeTextLite(el, isPause);
        },

        _reconfigureTextLiteTicker(el) {
          const ctrl = textLiteControllers.get(el) || null;
          configureTextLiteTicker(el, ctrl);
        }
      };

      // 8. Initialize Text Box Lite controllers & apply initial parameters if provided in options or manifest defaults
      const hoverCleanups = [];
      if (options.interactiveTriggers !== false && svgEl && typeof svgEl.addEventListener === 'function' && Array.isArray(manifest.parameters)) {
        for (const p of manifest.parameters) {
          const trig = (p && (p.eventTrigger || p.EventTrigger || '')).toLowerCase();
          if (trig === 'hover' && p.type === 'boolean' && p.name) {
            const onEnter = () => {
              if (!handle.isDestroyed) {
                try { handle.setParameter(p.name, true); } catch (e) {}
              }
            };
            const onLeave = () => {
              if (!handle.isDestroyed) {
                try { handle.setParameter(p.name, false); } catch (e) {}
              }
            };
            svgEl.addEventListener('mouseenter', onEnter);
            svgEl.addEventListener('mouseleave', onLeave);
            hoverCleanups.push(() => {
              try {
                svgEl.removeEventListener('mouseenter', onEnter);
                svgEl.removeEventListener('mouseleave', onLeave);
              } catch (e) {}
            });
          }
        }
      }

      initTextLiteControllers();
      if (svgEl && typeof svgEl.querySelectorAll === 'function') {
        svgEl.querySelectorAll('[data-lite-play="false"], [data-play-animation="false"]').forEach((el) => {
          applyPlayAnimationState(el, svgEl, false, true, handle);
        });
      }
      const hasExplicitInit = Boolean((options.parameters && Object.keys(options.parameters).length > 0) ||
        (options.initialParameters && Object.keys(options.initialParameters).length > 0));
      if (Object.keys(currentValues).length > 0) {
        try {
          handle.setParameters(currentValues, { _initialMount: true });
        } catch (err) {
          console.warn('[SVGWidget] Failed applying initial parameters on mount:', err);
        }
      }
      if (hasExplicitInit) {
        try {
          handle.setParameters(Object.assign({}, options.parameters || {}, options.initialParameters || {}), { _initialMount: false });
        } catch (err) {
          console.warn('[SVGWidget] Failed applying explicit initial parameters on mount:', err);
        }
      }

      // 9. Initialize Reduced-Motion preference & IntersectionObserver visibility-aware suspension
      if (reducedMotionMode === 'reduce') {
        isReducedMotion = true;
      } else if (reducedMotionMode !== 'ignore' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        try {
          reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
          isReducedMotion = Boolean(reducedMotionQuery && reducedMotionQuery.matches);
          reducedMotionHandler = (ev) => {
            isReducedMotion = Boolean(ev && ev.matches);
            applySuspensionState();
          };
          if (typeof reducedMotionQuery.addEventListener === 'function') {
            reducedMotionQuery.addEventListener('change', reducedMotionHandler);
          } else if (typeof reducedMotionQuery.addListener === 'function') {
            reducedMotionQuery.addListener(reducedMotionHandler);
          }
        } catch (e) {}
      }

      if (visibilityAware && typeof IntersectionObserver === 'function' && wrapper) {
        try {
          visibilityObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
              if (entry.target === wrapper) {
                isVisible = Boolean(entry.isIntersecting || entry.intersectionRatio > 0);
                applySuspensionState();
              }
            }
          }, {
            root: options.visibilityRoot || null,
            rootMargin: options.visibilityMargin || '50px',
            threshold: 0.01
          });
          visibilityObserver.observe(wrapper);
        } catch (e) {}
      }

      applySuspensionState();

      return handle;
    },

    createInstance(target, rawSvg, options = {}) {
      return SVGWidget.mount(target, rawSvg, options);
    }
  };

  return SVGWidget;
});
