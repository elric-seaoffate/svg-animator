/**
 * SVG Animator Studio — Shape Registry Core
 * Layer 3: Operational functionality
 *
 * Provides an immutable central registry of built-in SVG node shape definitions
 * and their operational SVG markup builders.
 *
 * Strict architectural boundaries:
 * - NO presentation / DOM manipulation
 * - NO document.getElementById calls
 * - Read-only query API (get, has, getAll, getIds)
 */
(function() {
  'use strict';

  const BUILTIN_SHAPES = [
    {
      id: 'rounded',
      displayName: 'Rounded Card / Service Box',
      category: 'basic',
      defaultWidth: 170,
      defaultHeight: 80,
      buildSVG(eff, w, h, hw, hh, commonStyle, n) {
        return '<rect x="' + (-hw) + '" y="' + (-hh) + '" width="' + w + '" height="' + h + '" rx="12" ' + commonStyle + ' filter="url(#nodeDropShadow)" />';
      }
    },
    {
      id: 'rect',
      displayName: 'Rectangle / Process Box',
      category: 'basic',
      defaultWidth: 170,
      defaultHeight: 80,
      buildSVG(eff, w, h, hw, hh, commonStyle, n) {
        return '<rect x="' + (-hw) + '" y="' + (-hh) + '" width="' + w + '" height="' + h + '" rx="2" ' + commonStyle + ' filter="url(#nodeDropShadow)" />';
      }
    },
    {
      id: 'pill',
      displayName: 'Pill / Stadium Terminal',
      category: 'flowchart',
      defaultWidth: 170,
      defaultHeight: 80,
      buildSVG(eff, w, h, hw, hh, commonStyle, n) {
        const r = Math.min(hw, hh);
        return '<rect x="' + (-hw) + '" y="' + (-hh) + '" width="' + w + '" height="' + h + '" rx="' + r + '" ' + commonStyle + ' filter="url(#nodeDropShadow)" />';
      }
    },
    {
      id: 'textbox',
      displayName: 'Floating Text Label Only',
      category: 'annotation',
      defaultWidth: 170,
      defaultHeight: 80,
      buildSVG(eff, w, h, hw, hh, commonStyle, n) {
        return '<rect x="' + (-hw) + '" y="' + (-hh) + '" width="' + w + '" height="' + h + '" fill="transparent" stroke="none" />';
      }
    },
    {
      id: 'callout',
      displayName: 'Callout Note / Annotation',
      category: 'annotation',
      defaultWidth: 170,
      defaultHeight: 80,
      buildSVG(eff, w, h, hw, hh, commonStyle, n) {
        const fold = 16;
        return (
          '<g filter="url(#nodeDropShadow)">' +
          '<polygon points="' + (-hw) + ',' + (-hh) + ' ' + (hw - fold) + ',' + (-hh) + ' ' + hw + ',' + (-hh + fold) + ' ' + hw + ',' + hh + ' ' + (-hw) + ',' + hh + '" stroke-linejoin="round" ' + commonStyle + ' />' +
          '<polyline points="' + (hw - fold) + ',' + (-hh) + ' ' + (hw - fold) + ',' + (-hh + fold) + ' ' + hw + ',' + (-hh + fold) + '" fill="none" stroke="' + eff.strokeColor + '" stroke-width="' + eff.strokeWidth + '" />' +
          '</g>'
        );
      }
    },
    {
      id: 'diamond',
      displayName: 'Decision Diamond',
      category: 'flowchart',
      defaultWidth: 170,
      defaultHeight: 80,
      buildSVG(eff, w, h, hw, hh, commonStyle, n) {
        return '<polygon points="0,' + (-hh) + ' ' + hw + ',0 0,' + hh + ' ' + (-hw) + ',0" stroke-linejoin="round" ' + commonStyle + ' filter="url(#nodeDropShadow)" />';
      }
    },
    {
      id: 'hexagon',
      displayName: 'Hexagon / Microservice',
      category: 'flowchart',
      defaultWidth: 170,
      defaultHeight: 80,
      buildSVG(eff, w, h, hw, hh, commonStyle, n) {
        const inset = w * 0.22;
        return (
          '<polygon points="' + (-hw + inset) + ',' + (-hh) + ' ' + (hw - inset) + ',' + (-hh) + ' ' + hw + ',0 ' +
          (hw - inset) + ',' + hh + ' ' + (-hw + inset) + ',' + hh + ' ' + (-hw) + ',0" stroke-linejoin="round" ' + commonStyle + ' filter="url(#nodeDropShadow)" />'
        );
      }
    },
    {
      id: 'parallelogram',
      displayName: 'Parallelogram (Data I/O)',
      category: 'flowchart',
      defaultWidth: 170,
      defaultHeight: 80,
      buildSVG(eff, w, h, hw, hh, commonStyle, n) {
        const skew = w * 0.16;
        return (
          '<polygon points="' + (-hw + skew) + ',' + (-hh) + ' ' + hw + ',' + (-hh) + ' ' + (hw - skew) + ',' + hh + ' ' + (-hw) + ',' + hh + '" stroke-linejoin="round" ' + commonStyle + ' filter="url(#nodeDropShadow)" />'
        );
      }
    },
    {
      id: 'cylinder',
      displayName: 'Database / Storage Cylinder',
      category: 'storage',
      defaultWidth: 170,
      defaultHeight: 80,
      buildSVG(eff, w, h, hw, hh, commonStyle, n) {
        const ry = Math.max(8, Math.min(22, h * 0.18));
        const bodyTop = -hh + ry;
        const bodyBot = hh - ry;
        return (
          '<g filter="url(#nodeDropShadow)">' +
          '<path d="M ' + (-hw) + ',' + bodyTop + ' L ' + (-hw) + ',' + bodyBot + ' A ' + hw + ',' + ry + ' 0 0,0 ' + hw + ',' + bodyBot + ' L ' + hw + ',' + bodyTop + ' Z" ' + commonStyle + ' />' +
          '<ellipse cx="0" cy="' + bodyTop + '" rx="' + hw + '" ry="' + ry + '" ' + commonStyle + ' />' +
          '</g>'
        );
      }
    },
    {
      id: 'cloud',
      displayName: 'Cloud Infrastructure Node',
      category: 'infrastructure',
      defaultWidth: 170,
      defaultHeight: 80,
      buildSVG(eff, w, h, hw, hh, commonStyle, n) {
        return (
          '<path d="M ' + (-hw * 0.55) + ',' + (hh * 0.65) +
          ' C ' + (-hw * 0.95) + ',' + (hh * 0.65) + ' ' + (-hw) + ',' + (hh * 0.05) + ' ' + (-hw * 0.72) + ',' + (-hh * 0.2) +
          ' C ' + (-hw * 0.75) + ',' + (-hh * 0.75) + ' ' + (-hw * 0.15) + ',' + (-hh * 0.95) + ' ' + (hw * 0.08) + ',' + (-hh * 0.6) +
          ' C ' + (hw * 0.45) + ',' + (-hh * 0.9) + ' ' + (hw * 0.92) + ',' + (-hh * 0.5) + ' ' + (hw * 0.8) + ',' + (-hh * 0.05) +
          ' C ' + (hw * 1.05) + ',' + (hh * 0.25) + ' ' + (hw * 0.85) + ',' + (hh * 0.65) + ' ' + (hw * 0.5) + ',' + (hh * 0.65) + ' Z"' +
          ' stroke-linejoin="round" ' + commonStyle + ' filter="url(#nodeDropShadow)" />'
        );
      }
    },
    {
      id: 'circle',
      displayName: 'Circle / Hub Node',
      category: 'basic',
      defaultWidth: 100,
      defaultHeight: 100,
      buildSVG(eff, w, h, hw, hh, commonStyle, n) {
        const r = Math.min(hw, hh);
        return '<circle cx="0" cy="0" r="' + r + '" ' + commonStyle + ' filter="url(#nodeDropShadow)" />';
      }
    },
    {
      id: 'axes',
      displayName: 'Graph X/Y Coordinate Axes',
      category: 'dataviz',
      defaultWidth: 170,
      defaultHeight: 80,
      buildSVG(eff, w, h, hw, hh, commonStyle, n) {
        let gridLines = '';
        const steps = 4;
        for (let i = 1; i <= steps; i++) {
          const gx = -hw + (w / steps) * i;
          const gy = hh - (h / steps) * i;
          gridLines += '<line x1="' + gx + '" y1="' + (-hh) + '" x2="' + gx + '" y2="' + hh + '" stroke="' + eff.strokeColor + '" stroke-opacity="0.2" stroke-width="1" stroke-dasharray="4,4" />';
          gridLines += '<line x1="' + (-hw) + '" y1="' + gy + '" x2="' + hw + '" y2="' + gy + '" stroke="' + eff.strokeColor + '" stroke-opacity="0.2" stroke-width="1" stroke-dasharray="4,4" />';
        }
        return (
          '<rect x="' + (-hw) + '" y="' + (-hh) + '" width="' + w + '" height="' + h + '" fill="' + eff.fillColor + '" fill-opacity="' + eff.fillOpacity + '" stroke="none" />' +
          gridLines +
          '<polyline points="' + (-hw) + ',' + (-hh) + ' ' + (-hw) + ',' + hh + ' ' + hw + ',' + hh + '" fill="none" stroke="' + eff.strokeColor + '" stroke-width="' + Math.max(2, eff.strokeWidth) + '" stroke-linecap="round" stroke-linejoin="round" />'
        );
      }
    }
  ];

  const shapeMap = new Map();
  const frozenShapes = BUILTIN_SHAPES.map(function(s) {
    const frozen = Object.freeze(s);
    shapeMap.set(s.id, frozen);
    return frozen;
  });
  const allShapes = Object.freeze(frozenShapes);
  const allIds = Object.freeze(BUILTIN_SHAPES.map(function(s) { return s.id; }));

  window.ShapeRegistry = Object.freeze({
    get(id) {
      if (typeof id !== 'string') return null;
      return shapeMap.get(id) || null;
    },
    has(id) {
      if (typeof id !== 'string') return false;
      return shapeMap.has(id);
    },
    getAll() {
      return allShapes.slice();
    },
    getIds() {
      return allIds.slice();
    }
  });
})();
