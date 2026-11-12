/**
 * SVG Animator Studio — Custom Color Picker (`color-picker.js`)
 *
 * Responsibilities:
 *   - HSV-based interactive color picker popover
 *   - 2D Saturation/Value gradient canvas with pointer capture
 *   - Hue slider, RGB numeric/slider inputs, and HEX validation
 *   - Quick palette, recent swatches (localStorage), and favourite swatches
 *   - Live transactional input preview and history recording
 *   - Optional HTML EyeDropper API integration
 *
 * Layer 1 (UI Presentation).
 */

(function() {
  'use strict';

  window.CustomColorPicker = {
    isOpen: false,
    activeInput: null,
    initialColor: '#58a6ff',
    currentColor: '#58a6ff',
    currentHsv: { h: 212, s: 0.65, v: 1 },
    recentColors: [],
    favColors: [],
    quickPalette: [
      '#ffffff', '#e6edf3', '#8b949e', '#30363d',
      '#161b22', '#0d1117', '#58a6ff', '#1f6feb',
      '#238636', '#3fb950', '#d29922', '#f0883e',
      '#f85149', '#ff7b72', '#a371f7', '#bc8cff'
    ],
    _initialized: false,

    init() {
      if (this._initialized) {
        this.loadSwatches();
        return;
      }
      this._initialized = true;
      this.loadSwatches();

      const popover = document.getElementById('customColorPickerModal');
      const btnClose = document.getElementById('btnColorPickerClose');
      const btnCancel = document.getElementById('btnColorPickerCancel');
      const btnApply = document.getElementById('btnColorPickerApply');
      const btnAddFav = document.getElementById('btnColorPickerAddFav');
      const curSwatch = document.getElementById('colorPickerCurrentSwatch');
      const hexInput = document.getElementById('colorPickerHexInput');
      const hueSlider = document.getElementById('colorPickerHueSlider');
      const btnPipette = document.getElementById('btnColorPickerPipette');
      const svSquare = document.getElementById('colorPickerSvSquare');

      if (btnClose) btnClose.addEventListener('click', () => this.cancel());
      if (btnCancel) btnCancel.addEventListener('click', () => this.cancel());
      if (btnApply) btnApply.addEventListener('click', () => this.apply());
      if (curSwatch) curSwatch.addEventListener('click', () => this.setColor(this.initialColor));
      if (btnAddFav) btnAddFav.addEventListener('click', () => this.addFavourite(this.currentColor));

      // 1. Saturation / Value square pointer tracking
      if (svSquare) {
        let isDraggingSv = false;
        const updateFromSv = (e) => {
          const rect = svSquare.getBoundingClientRect();
          const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
          const s = rect.width > 0 ? (x / rect.width) : 0;
          const v = rect.height > 0 ? (1 - (y / rect.height)) : 1;
          this.currentHsv.s = Math.max(0, Math.min(1, s));
          this.currentHsv.v = Math.max(0, Math.min(1, v));
          this.syncAllFromHsv({ skipSvHandle: false });
        };

        svSquare.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          isDraggingSv = true;
          try { svSquare.setPointerCapture(e.pointerId); } catch (_) {}
          updateFromSv(e);
        });

        svSquare.addEventListener('pointermove', (e) => {
          if (!isDraggingSv) return;
          updateFromSv(e);
        });

        const stopSv = (e) => {
          if (isDraggingSv) {
            isDraggingSv = false;
            try { svSquare.releasePointerCapture(e.pointerId); } catch (_) {}
          }
        };
        svSquare.addEventListener('pointerup', stopSv);
        svSquare.addEventListener('pointercancel', stopSv);
      }

      // 2. Hue slider band
      if (hueSlider) {
        hueSlider.addEventListener('input', (e) => {
          this.currentHsv.h = parseFloat(e.target.value) || 0;
          this.syncAllFromHsv({ skipHueSlider: true });
        });
      }

      // 3. Eyedropper API
      if (btnPipette) {
        if (!window.EyeDropper) {
          btnPipette.style.display = 'none';
        } else {
          btnPipette.addEventListener('click', async () => {
            try {
              const eyeDropper = new window.EyeDropper();
              const res = await eyeDropper.open();
              if (res && res.sRGBHex) {
                this.setColor(res.sRGBHex);
              }
            } catch (_) {}
          });
        }
      }

      // 4. RGB sliders & numeric inputs
      ['R', 'G', 'B'].forEach((channel) => {
        const slider = document.getElementById('colorPicker' + channel + 'Slider');
        const num = document.getElementById('colorPicker' + channel + 'Num');
        if (slider && num) {
          const onValChange = (val) => {
            slider.value = val;
            num.value = val;
            this.syncFromRgbSliders();
          };
          slider.addEventListener('input', (e) => onValChange(parseInt(e.target.value, 10) || 0));
          num.addEventListener('input', (e) => onValChange(Math.max(0, Math.min(255, parseInt(e.target.value, 10) || 0))));
        }
      });

      // 5. Hex input
      if (hexInput) {
        hexInput.addEventListener('input', (e) => {
          let val = e.target.value.trim();
          if (!val.startsWith('#')) val = '#' + val;
          if (/^#[0-9a-fA-F]{6}$/.test(val)) {
            const rgb = this.hexToRgb(val);
            this.currentHsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
            this.syncAllFromHsv({ skipHexInput: true });
          }
        });
      }

      // 6. Click-outside to cancel & close non-modal popover
      document.addEventListener('pointerdown', (e) => {
        if (!this.isOpen) return;
        if (popover && !popover.contains(e.target)) {
          if (!this.activeInput || !this.activeInput.contains(e.target)) {
            this.cancel();
          }
        }
      });

      // 7. Event delegation for opening custom colour picker on any input[type="color"]
      document.addEventListener('click', (e) => {
        const colorInput = e.target.closest ? e.target.closest('input[type="color"]') : null;
        if (colorInput) {
          e.preventDefault();
          e.stopPropagation();
          this.openFor(colorInput);
        }
      });
    },

    loadSwatches() {
      try {
        const rec = JSON.parse(localStorage.getItem('svg_animator_recent_colors') || '[]');
        this.recentColors = Array.isArray(rec) ? rec : [];
      } catch (_) {
        this.recentColors = [];
      }
      try {
        const fav = JSON.parse(localStorage.getItem('svg_animator_fav_colors') || '[]');
        this.favColors = Array.isArray(fav) ? fav : [];
      } catch (_) {
        this.favColors = [];
      }
    },

    saveSwatches() {
      try {
        localStorage.setItem('svg_animator_recent_colors', JSON.stringify(this.recentColors.slice(0, 12)));
        localStorage.setItem('svg_animator_fav_colors', JSON.stringify(this.favColors));
      } catch (_) {}
    },

    normalizeHex(colorStr) {
      if (!colorStr) return '#58a6ff';
      let c = String(colorStr).trim();
      if (!c.startsWith('#')) c = '#' + c;
      if (c.length === 4) {
        c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
      }
      return c.toLowerCase();
    },

    hexToRgb(hex) {
      const norm = this.normalizeHex(hex).slice(1);
      const num = parseInt(norm, 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
      };
    },

    rgbToHex(r, g, b) {
      const h = ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1);
      return '#' + h.toLowerCase();
    },

    rgbToHsv(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const d = max - min;
      let h = 0;
      const s = max === 0 ? 0 : d / max;
      const v = max;

      if (max !== min) {
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      return { h: Math.round(h * 360), s, v };
    },

    hsvToRgb(h, s, v) {
      let r, g, b;
      const i = Math.floor((h / 60) % 6);
      const f = (h / 60) - Math.floor(h / 60);
      const p = v * (1 - s);
      const q = v * (1 - f * s);
      const t = v * (1 - (1 - f) * s);

      switch (i) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
      }
      return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
      };
    },

    syncFromRgbSliders() {
      const r = parseInt(document.getElementById('colorPickerRSlider')?.value || 0, 10);
      const g = parseInt(document.getElementById('colorPickerGSlider')?.value || 0, 10);
      const b = parseInt(document.getElementById('colorPickerBSlider')?.value || 0, 10);
      this.currentHsv = this.rgbToHsv(r, g, b);
      this.syncAllFromHsv({ skipRgbSliders: true });
    },

    openFor(inputEl) {
      if (!inputEl) return;
      this.activeInput = inputEl;
      this.initialColor = this.normalizeHex(inputEl.value || '#58a6ff');
      this.currentColor = this.initialColor;
      this.isOpen = true;

      const rgb = this.hexToRgb(this.initialColor);
      this.currentHsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);

      // Update Original swatch
      const curSwatch = document.getElementById('colorPickerCurrentSwatch');
      if (curSwatch) curSwatch.style.background = this.initialColor;

      this.renderQuickPalette();
      this.renderRecentSwatches();
      this.renderFavSwatches();
      this.syncAllFromHsv();

      this.positionNear(inputEl);
    },

    positionNear(inputEl) {
      const popover = document.getElementById('customColorPickerModal');
      if (!popover || !inputEl) return;
      popover.style.display = 'flex';
      popover.style.visibility = 'hidden';

      const rect = inputEl.getBoundingClientRect();
      const popW = popover.offsetWidth || 340;
      const popH = popover.offsetHeight || 500;

      let left = rect.left;
      if (left + popW > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - popW - 12);
      }
      if (left < 12) left = 12;

      let top = rect.bottom + 6;
      if (top + popH > window.innerHeight - 12) {
        const topAbove = rect.top - popH - 6;
        if (topAbove >= 12) {
          top = topAbove;
        } else {
          top = Math.max(12, window.innerHeight - popH - 12);
        }
      }

      popover.style.top = top + 'px';
      popover.style.left = left + 'px';
      popover.style.visibility = 'visible';
    },

    syncAllFromHsv(options = {}) {
      const rgb = this.hsvToRgb(this.currentHsv.h, this.currentHsv.s, this.currentHsv.v);
      const hex = this.rgbToHex(rgb.r, rgb.g, rgb.b);
      this.currentColor = hex;

      // 1. SV square background & handle
      const svSquare = document.getElementById('colorPickerSvSquare');
      const svHandle = document.getElementById('colorPickerSvHandle');
      if (svSquare) svSquare.style.backgroundColor = 'hsl(' + this.currentHsv.h + ', 100%, 50%)';
      if (svHandle && !options.skipSvHandle) {
        svHandle.style.left = (this.currentHsv.s * 100).toFixed(1) + '%';
        svHandle.style.top = ((1 - this.currentHsv.v) * 100).toFixed(1) + '%';
      }

      // 2. Hue slider
      if (!options.skipHueSlider) {
        const hueSlider = document.getElementById('colorPickerHueSlider');
        if (hueSlider) hueSlider.value = this.currentHsv.h;
      }

      // 3. New preview swatch
      const pendSwatch = document.getElementById('colorPickerPendingSwatch');
      if (pendSwatch) pendSwatch.style.background = hex;

      // 4. Hex input
      if (!options.skipHexInput) {
        const hexIn = document.getElementById('colorPickerHexInput');
        if (hexIn) hexIn.value = hex.toUpperCase();
      }

      // 5. RGB sliders & nums
      if (!options.skipRgbSliders) {
        ['R', 'G', 'B'].forEach((channel) => {
          const val = rgb[channel.toLowerCase()];
          const slider = document.getElementById('colorPicker' + channel + 'Slider');
          const num = document.getElementById('colorPicker' + channel + 'Num');
          if (slider) slider.value = val;
          if (num) num.value = val;
        });
      }

      // 6. Live transactional preview on active input
      if (this.activeInput) {
        this.activeInput.value = hex;
        this.activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },

    setColor(hex, options = {}) {
      const norm = this.normalizeHex(hex);
      const rgb = this.hexToRgb(norm);
      this.currentHsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
      this.syncAllFromHsv(options);
    },

    renderQuickPalette() {
      const grid = document.getElementById('colorPickerQuickPalette');
      if (!grid) return;
      grid.innerHTML = '';
      this.quickPalette.forEach((hex) => {
        const item = document.createElement('div');
        item.className = 'color-mini-swatch';
        item.style.background = hex;
        item.title = hex.toUpperCase();
        item.onclick = () => this.setColor(hex);
        grid.appendChild(item);
      });
    },

    renderRecentSwatches() {
      const grid = document.getElementById('colorPickerRecentSwatches');
      if (!grid) return;
      grid.innerHTML = '';
      if (this.recentColors.length === 0) {
        grid.innerHTML = '<span style="font-size:0.65rem; color:#8b949e;">None</span>';
        return;
      }
      this.recentColors.forEach((hex) => {
        const item = document.createElement('div');
        item.className = 'color-mini-swatch';
        item.style.background = hex;
        item.title = hex.toUpperCase();
        item.onclick = () => this.setColor(hex);
        grid.appendChild(item);
      });
    },

    renderFavSwatches() {
      const grid = document.getElementById('colorPickerFavSwatches');
      if (!grid) return;
      grid.innerHTML = '';
      if (this.favColors.length === 0) {
        grid.innerHTML = '<span style="font-size:0.65rem; color:#8b949e;">None</span>';
        return;
      }
      this.favColors.forEach((hex, idx) => {
        const item = document.createElement('div');
        item.className = 'color-mini-swatch';
        item.style.background = hex;
        item.title = hex.toUpperCase();
        item.onclick = () => this.setColor(hex);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'swatch-delete-btn';
        delBtn.innerHTML = '&times;';
        delBtn.title = 'Remove favourite';
        delBtn.onclick = (e) => {
          e.stopPropagation();
          this.removeFavourite(idx);
        };
        item.appendChild(delBtn);
        grid.appendChild(item);
      });
    },

    addFavourite(hex) {
      const norm = this.normalizeHex(hex);
      if (!this.favColors.map((c) => c.toLowerCase()).includes(norm)) {
        this.favColors.push(norm);
        this.saveSwatches();
        this.renderFavSwatches();
        if (window.AppCoordinator) window.AppCoordinator.showNotification('Added ' + norm.toUpperCase() + ' to favourites', 'info', 1500);
      }
    },

    removeFavourite(idx) {
      if (idx >= 0 && idx < this.favColors.length) {
        this.favColors.splice(idx, 1);
        this.saveSwatches();
        this.renderFavSwatches();
      }
    },

    apply() {
      const finalColor = this.currentColor;
      if (this.activeInput) {
        this.activeInput.value = finalColor;
        this.activeInput.dispatchEvent(new Event('input', { bubbles: true }));
        this.activeInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      this.recentColors = [finalColor, ...this.recentColors.filter((c) => c.toLowerCase() !== finalColor.toLowerCase())].slice(0, 12);
      this.saveSwatches();
      this.close();
      if (window.AppCoordinator) {
        window.AppCoordinator.recordHistoryImmediate();
      }
    },

    cancel() {
      if (this.activeInput) {
        this.activeInput.value = this.initialColor;
        this.activeInput.dispatchEvent(new Event('input', { bubbles: true }));
        this.activeInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      this.close();
    },

    close() {
      this.isOpen = false;
      this.activeInput = null;
      const popover = document.getElementById('customColorPickerModal');
      if (popover) popover.style.display = 'none';
    }
  };
})();
