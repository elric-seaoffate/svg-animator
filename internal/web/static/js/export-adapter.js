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

      if (!svgRoot.hasAttribute('xmlns:xlink')) {
        svgRoot.setAttribute('xmlns:xlink', XLINK_NS);
      }

      const elementsWithHref = xmlDoc.querySelectorAll('[href]');
      elementsWithHref.forEach((el) => {
        const hrefVal = el.getAttribute('href');
        if (hrefVal) {
          el.setAttributeNS(XLINK_NS, 'xlink:href', hrefVal);
        }
      });

      const serializer = new XMLSerializer();
      return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + serializer.serializeToString(svgRoot);
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
})();
