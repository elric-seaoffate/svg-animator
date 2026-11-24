/**
 * SVG Animator Studio — SVG Export Adapter (`export-adapter.js`)
 *
 * Responsibilities:
 *   - Browser XML parsing, validation, and XML serialization for SVG export
 *   - Automatic xmlns:xlink namespace injection and xlink:href resolution
 *   - Global adapter `window.serializeSVGForExport`
 *
 * Layer 1 (Export Presentation Adapter).
 */

(function() {
  'use strict';

  window.SVGExportAdapter = {
    serialize(rawSvg) {
      if (!rawSvg) throw new Error('SVG generation returned empty.');
      if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
        throw new Error('SVGExportAdapter requires a browser DOM environment with DOMParser and XMLSerializer.');
      }

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(rawSvg, 'image/svg+xml');

      const parserError = xmlDoc.getElementsByTagName('parsererror');
      if (parserError.length > 0) {
        throw new Error('XML Parsing Failed: ' + parserError[0].textContent);
      }

      const svgRoot = xmlDoc.documentElement;
      const XLINK_NS = 'http://www.w3.org/1999/xlink';

      // Strip editor-only selection/guide markers from exported standalone SVG
      xmlDoc.querySelectorAll('[data-editor-only="true"]').forEach((el) => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });

      if (!svgRoot.hasAttribute('xmlns:xlink')) {
        svgRoot.setAttribute('xmlns:xlink', XLINK_NS);
      }

      const elementsWithHref = xmlDoc.querySelectorAll('[href]');
      elementsWithHref.forEach((el) => {
        const hrefVal = el.getAttribute('href');
        if (!hrefVal) return;
        if (hrefVal.startsWith('data:image/')) {
          // Do not duplicate embedded base64 raster payloads into legacy xlink:href
          el.removeAttribute('xlink:href');
          try { el.removeAttributeNS(XLINK_NS, 'href'); } catch (e) {}
        } else {
          el.setAttributeNS(XLINK_NS, 'xlink:href', hrefVal);
        }
      });

      const serializer = new XMLSerializer();
      return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + serializer.serializeToString(svgRoot);
    },

    isolateWidget(rawSvg, instanceId = '', options = {}) {
      if (!rawSvg) throw new Error('Cannot isolate empty SVG.');
      const prefix = options.prefix || '';
      const scopeCss = options.scopeCss !== false;
      const manifest = options.manifest || null;
      const rasterPolicy = options.rasterPolicy || '2x';

      // 1. Prefer authoritative Go/WASM engine
      if (typeof window !== 'undefined' && window.EngineBridge && typeof window.EngineBridge.isolateSVGWidget === 'function' && window.EngineBridge.isReady()) {
        const res = window.EngineBridge.isolateSVGWidget(rawSvg, instanceId, prefix, scopeCss, manifest, rasterPolicy);
        if (res && res.success && res.isolatedSvg) {
          return options.rawDetails ? res : res.isolatedSvg;
        }
      }

      // 2. Standalone widget library fallback
      if (typeof window !== 'undefined' && window.SVGWidget && typeof window.SVGWidget.isolate === 'function') {
        return window.SVGWidget.isolate(rawSvg, { instanceId, prefix, scopeCss, manifest, rawDetails: options.rawDetails });
      }

      // 3. Fallback parser if SVGWidget is not yet mounted
      return this._fallbackIsolate(rawSvg, instanceId, prefix, scopeCss, options.rawDetails);
    },

    _fallbackIsolate(rawSvg, instanceId = '', prefix = '', scopeCss = true, rawDetails = false) {
      const instId = instanceId || ('sva-w-' + (Date.now() % 1000000) + '-' + Math.random().toString(36).slice(2, 6));
      const pfx = prefix || (instId + '__');
      const rootId = 'sva-widget-' + instId;

      const idMap = {};
      const reIDDecl = /\bid\s*=\s*(["'])([^"']+)\1/g;
      let m;
      while ((m = reIDDecl.exec(rawSvg)) !== null) {
        const oldId = m[2];
        if (oldId && !idMap[oldId]) idMap[oldId] = pfx + oldId;
      }

      let res = rawSvg;
      let isFirst = true;
      res = res.replace(/<([a-zA-Z0-9:_-]+)((?:\s+[^>]+)?)>/g, (tagMatch, tagName, tagAttrs) => {
        if (tagName.startsWith('/')) return tagMatch;
        if (tagName.toLowerCase() === 'svg' && isFirst) {
          isFirst = false;
          if (/\bid\s*=\s*["'][^"']*["']/i.test(tagAttrs)) {
            tagAttrs = tagAttrs.replace(/\bid\s*=\s*["'][^"']*["']/i, `id="${rootId}"`);
          } else {
            tagAttrs = ` id="${rootId}"` + tagAttrs;
          }
          if (!/data-sva-widget-instance/i.test(tagAttrs)) {
            tagAttrs += ` data-sva-widget-instance="${instId}"`;
          }
        } else {
          tagAttrs = tagAttrs.replace(/\bid\s*=\s*(["'])([^"']+)\1/g, (match, q, oldId) => {
            return idMap[oldId] ? `id=${q}${idMap[oldId]}${q}` : match;
          });
        }

        tagAttrs = tagAttrs.replace(/\b(xlink:href|href)\s*=\s*(["'])(#)([^"']+)\2/g, (match, attr, q, hash, targetId) => {
          return idMap[targetId] ? `${attr}=${q}#${idMap[targetId]}${q}` : match;
        });

        tagAttrs = tagAttrs.replace(/url\(\s*["']?#([a-zA-Z0-9:_-]+)["']?\s*\)/g, (match, targetId) => {
          return idMap[targetId] ? `url(#${idMap[targetId]})` : match;
        });

        return `<${tagName}${tagAttrs}>`;
      });

      if (rawDetails) {
        return { success: true, isolatedSvg: res, instanceId: instId, prefix: pfx, rootId, idMap };
      }
      return res;
    }
  };

  window.serializeSVGForExport = function(rawSvg) {
    if (window.SVGExportAdapter && typeof window.SVGExportAdapter.serialize === 'function') {
      return window.SVGExportAdapter.serialize(rawSvg);
    }
    if (window.SceneState && typeof window.SceneState.serializeSVGForExport === 'function') {
      return window.SceneState.serializeSVGForExport(rawSvg);
    }
    throw new Error('SVG export serialization requires SVGExportAdapter in browser environments.');
  };

  window.isolateSVGForWidget = function(rawSvg, instanceId = '', options = {}) {
    if (window.SVGExportAdapter && typeof window.SVGExportAdapter.isolateWidget === 'function') {
      return window.SVGExportAdapter.isolateWidget(rawSvg, instanceId, options);
    }
    if (window.SVGWidget && typeof window.SVGWidget.isolate === 'function') {
      return window.SVGWidget.isolate(rawSvg, { instanceId, ...options });
    }
    throw new Error('Widget isolation requires SVGExportAdapter or SVGWidget in browser environments.');
  };
})();
