/**
 * SVG Animator Studio — Shape Dropdown Presentation Module (`shape-dropdown.js`)
 *
 * Responsibilities:
 *   - Populate shape dropdown menus from the authoritative ShapeRegistry
 *   - Display unknown/legacy shapes safely as temporary disabled options
 *   - Clean up temporary options when user selects a known shape
 *
 * Layer 1 (UI Presentation) — Depends on ShapeRegistry (Layer 3).
 */

(function() {
  'use strict';

  function ensureShapeInDropdown(selectEl, shapeId) {
    if (!selectEl) return;
    if (!window.ShapeRegistry || typeof window.ShapeRegistry.has !== 'function') return;

    // Remove any previous temporary unknown shape option
    const existingTemp = selectEl.querySelector ? selectEl.querySelector('option[data-unknown-shape="true"]') : null;
    if (existingTemp) {
      if (typeof existingTemp.remove === 'function') {
        existingTemp.remove();
      } else if (existingTemp.parentElement) {
        existingTemp.parentElement.removeChild(existingTemp);
      }
    }

    if (window.ShapeRegistry.has(shapeId)) {
      selectEl.value = shapeId;
    } else if (shapeId) {
      // Add temporary disabled option to represent the unknown/legacy shape
      // without mutating the underlying data
      const tempOpt = document.createElement('option');
      tempOpt.value = shapeId;
      tempOpt.textContent = 'Unknown Shape: ' + shapeId;
      tempOpt.disabled = true;
      tempOpt.selected = true;
      tempOpt.setAttribute('data-unknown-shape', 'true');
      if (tempOpt.dataset) {
        tempOpt.dataset.unknownShape = 'true';
      }
      if (selectEl.firstChild) {
        selectEl.insertBefore(tempOpt, selectEl.firstChild);
      } else {
        selectEl.appendChild(tempOpt);
      }
      selectEl.value = shapeId;
    }
  }

  function populateShapeDropdowns() {
    if (!window.ShapeRegistry || typeof window.ShapeRegistry.getAll !== 'function') {
      return; // Preserve existing HTML fallback options
    }

    const shapes = window.ShapeRegistry.getAll();
    const dropdownIds = ['nodeShapeSelect', 'presetVal-shape'];

    dropdownIds.forEach((id) => {
      const selectEl = document.getElementById(id);
      if (!selectEl) return;

      const currentVal = selectEl.value;
      selectEl.innerHTML = '';
      if (Array.isArray(selectEl.children)) {
        selectEl.children.length = 0;
      }

      shapes.forEach((shape) => {
        const opt = document.createElement('option');
        opt.value = shape.id;
        opt.textContent = shape.displayName;
        selectEl.appendChild(opt);
      });

      // Clean up temporary unknown option on user change to a supported shape
      if (!selectEl._shapeChangeCleanupAttached && typeof selectEl.addEventListener === 'function') {
        selectEl._shapeChangeCleanupAttached = true;
        selectEl.addEventListener('change', (e) => {
          if (window.ShapeRegistry && window.ShapeRegistry.has(e.target.value)) {
            const temp = selectEl.querySelector ? selectEl.querySelector('option[data-unknown-shape="true"]') : null;
            if (temp) {
              if (typeof temp.remove === 'function') temp.remove();
              else if (temp.parentElement) temp.parentElement.removeChild(temp);
            }
          }
        });
      }

      ensureShapeInDropdown(selectEl, currentVal);
    });
  }

  window.ensureShapeInDropdown = ensureShapeInDropdown;
  window.populateShapeDropdowns = populateShapeDropdowns;
})();
