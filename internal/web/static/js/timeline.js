/**
 * SVG Animator Studio — Timeline Player (`timeline.js`)
 *
 * Responsibilities:
 *   - Browser playback transport state machine (stopped | playing | paused | ended)
 *   - requestAnimationFrame scheduling loop and time advancement
 *   - Loop mode handling ('once' | 'loop' | 'pingpong')
 *   - UI scrubber, time display, play/pause toggle, and engine status badge
 *   - Evaluates frame state authoritatively through window.EngineBridge.evaluateSceneAtTime
 *   - Applies camera rig transforms and optical filter parameters to the live SVG DOM
 *
 * Layer 1 (UI Presentation & Playback Transport) — Authoritative evaluation in Go/WASM.
 */

(function() {
  'use strict';

  window.TimelinePlayer = {
    status: 'stopped', // 'stopped' | 'playing' | 'paused' | 'ended'
    isPlaying: false,  // legacy boolean matching status === 'playing'
    currentTime: 0.0,
    duration: 7.0,
    loopMode: 'once',  // 'once' | 'loop' | 'pingpong'
    _lastTimestamp: null,
    _rafId: null,
    _initialized: false,

    init() {
      if (this._initialized) {
        this.syncFromScene();
        return;
      }
      this._initialized = true;
      this._bindUI();
      this.syncFromScene();
    },

    syncFromScene() {
      if (window.SceneState && typeof window.SceneState.getNumControl === 'function') {
        this.duration = window.SceneState.getNumControl('durationSlider', 7.0) || 7.0;
        this.loopMode = window.SceneState.getControl('loopSelect', 'once') || 'once';
      }
      if (this.currentTime > this.duration) {
        this.currentTime = this.duration;
        if (this.status === 'playing' && this.loopMode === 'once') {
          this.pause();
          this.status = 'ended';
        }
      }
      const scrubber = document.getElementById('timelineScrubber');
      if (scrubber) {
        scrubber.max = String(this.duration);
      }
      this.updateUI();
    },

    // Called whenever the SVG document in #svgContainer is re-rendered (by user edits, presets, project load, etc.)
    onSceneRedrawn() {
      this.syncFromScene();
      this.evaluateAndApply(this.currentTime);
      this.updateUI();
    },

    play() {
      if (this.status === 'playing') return;
      if (this.status === 'ended' || this.currentTime >= this.duration) {
        this.currentTime = 0.0;
      }
      this.status = 'playing';
      this.isPlaying = true;
      this._lastTimestamp = null;
      this.updatePlayButton();

      if (this._rafId) {
        if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(this._rafId);
        }
        this._rafId = null;
      }
      this._loop();
    },

    pause() {
      if (this.status !== 'playing' && !this.isPlaying) return;
      this.status = 'paused';
      this.isPlaying = false;
      if (this._rafId) {
        if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(this._rafId);
        }
        this._rafId = null;
      }
      this._lastTimestamp = null;
      this.updatePlayButton();
      this.updateUI();
    },

    stop() {
      this.status = 'stopped';
      this.isPlaying = false;
      if (this._rafId) {
        if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(this._rafId);
        }
        this._rafId = null;
      }
      this._lastTimestamp = null;
      this.currentTime = 0.0;
      this.updatePlayButton();
      this.evaluateAndApply(0.0);
      this.updateUI();
    },

    reset() {
      this.stop();
    },

    restart() {
      this.seek(0.0);
      this.play();
    },

    toggle() {
      if (this.status === 'playing') this.pause();
      else this.play();
    },

    seek(timeSec) {
      this.currentTime = Math.max(0, Math.min(this.duration, Number(timeSec) || 0));
      if (this.status === 'ended' && this.currentTime < this.duration) {
        this.status = 'paused';
        this.updatePlayButton();
      }
      this.evaluateAndApply(this.currentTime);
      this.updateUI();
    },

    _loop(timestamp) {
      if (this.status !== 'playing') return;
      if (this._lastTimestamp !== null && timestamp) {
        const dt = (timestamp - this._lastTimestamp) / 1000.0;
        const cappedDt = Math.min(dt, 0.1);
        this.currentTime += cappedDt;

        if (this.currentTime >= this.duration) {
          if (this.loopMode === 'loop') {
            this.currentTime = this.currentTime % this.duration;
          } else if (this.loopMode === 'pingpong') {
            if (this.currentTime >= 2 * this.duration && this.duration > 0) {
              this.currentTime = this.currentTime % (2 * this.duration);
            }
          } else {
            // 'once' mode: Stop at end, freeze presentation, do not loop
            this.currentTime = this.duration;
            this.status = 'ended';
            this.isPlaying = false;
            if (this._rafId) {
              if (typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(this._rafId);
              }
              this._rafId = null;
            }
            this._lastTimestamp = null;
            this.updatePlayButton();
            this.evaluateAndApply(this.currentTime);
            this.updateUI();
            return;
          }
        }
      }
      this._lastTimestamp = timestamp || null;
      this.evaluateAndApply(this.currentTime);
      this.updateUI();

      if (this.status === 'playing' && typeof requestAnimationFrame === 'function') {
        this._rafId = requestAnimationFrame((ts) => this._loop(ts));
      }
    },

    evaluateAndApply(timeSec) {
      if (!window.EngineBridge || typeof window.EngineBridge.evaluateSceneAtTime !== 'function') return;
      const frame = window.EngineBridge.evaluateSceneAtTime(timeSec);
      if (!frame) return;

      this.applyFrameToDOM(frame);
    },

    applyFrameToDOM(frame) {
      const container = document.getElementById('svgContainer');
      if (!container || !frame) return;

      // 1. Camera (Ken Burns, Pan, Drift, 3D Perspective Tilt)
      if (frame.camera && frame.camera.transform) {
        const camRig = container.querySelector('.camera-rig');
        if (camRig) {
          if (frame.camera.motion && frame.camera.motion !== 'static') {
            camRig.style.animation = 'none';
            camRig.style.transform = frame.camera.transform;
          } else {
            camRig.style.transform = '';
          }
        }
        const camStage = container.querySelector('#cameraStage3D') || container.querySelector('.camera-stage-3d');
        if (camStage && frame.camera.stage3d) {
          camStage.style.transform = frame.camera.stage3d;
        }
      }

      // 2. Optics (Focus Pull, Tilt-Shift, Motion Blur)
      if (frame.optical && (frame.optical.isActive || frame.optical.active)) {
        // Neutralize declarative SMIL animations inside optics filters in the live editor preview
        // so Go/WASM evaluation directly controls feGaussianBlur stdDeviation without SMIL overriding it.
        container.querySelectorAll('#opt-focus animate, #opt-ts-blur animate, #opt-mb-blur animate').forEach((el) => el.remove());

        if (frame.optical.type === 'focus-pull') {
          const fe = container.querySelector('#opt-focus feGaussianBlur');
          if (fe) fe.setAttribute('stdDeviation', String(frame.optical.blur.toFixed(2)));
        } else if (frame.optical.type === 'tilt-shift') {
          const fe = container.querySelector('#opt-ts-blur feGaussianBlur');
          if (fe) fe.setAttribute('stdDeviation', String(frame.optical.blur.toFixed(2)));
        } else if (frame.optical.type === 'motion-blur') {
          const fe = container.querySelector('#opt-mb-blur feGaussianBlur');
          if (fe) fe.setAttribute('stdDeviation', String(frame.optical.blur.toFixed(2)) + ' 0');
        }
      }
    },

    updateUI() {
      const timeDisplay = document.getElementById('timelineTimeDisplay');
      let displayTime = this.currentTime;
      if (this.loopMode === 'pingpong' && this.duration > 0 && this.currentTime > this.duration) {
        displayTime = Math.max(0, 2 * this.duration - this.currentTime);
      }
      if (timeDisplay) {
        timeDisplay.textContent = displayTime.toFixed(2) + 's / ' + this.duration.toFixed(2) + 's';
      }
      const scrubber = document.getElementById('timelineScrubber');
      if (scrubber && document.activeElement !== scrubber) {
        scrubber.value = String(displayTime);
      }
      const badge = document.getElementById('timelineEngineBadge');
      if (badge && window.EngineBridge && typeof window.EngineBridge.getActiveEngineName === 'function') {
        const engineName = window.EngineBridge.getActiveEngineName();
        badge.textContent = 'Engine: ' + engineName;
        if (engineName.startsWith('WASM')) {
          badge.style.background = 'rgba(34, 197, 94, 0.15)';
          badge.style.color = '#4ade80';
          badge.style.borderColor = 'rgba(34, 197, 94, 0.3)';
        } else {
          badge.style.background = 'rgba(234, 179, 8, 0.15)';
          badge.style.color = '#facc15';
          badge.style.borderColor = 'rgba(234, 179, 8, 0.3)';
        }
      }
      const frameCount = document.getElementById('timelineFrameCount');
      if (frameCount && window.EngineBridge && window.EngineBridge._stats) {
        frameCount.textContent = window.EngineBridge._stats.framesEvaluated + ' frames';
      }
    },

    updatePlayButton() {
      const btn = document.getElementById('btnTimelinePlay');
      if (btn) {
        if (this.status === 'playing') {
          btn.textContent = '⏸ Pause Scene';
        } else if (this.status === 'paused') {
          btn.textContent = '▶ Resume Scene';
        } else {
          btn.textContent = '▶ Play Scene';
        }
      }
    },

    _bindUI() {
      const btnPlay = document.getElementById('btnTimelinePlay');
      if (btnPlay) {
        btnPlay.addEventListener('click', () => this.toggle());
      }
      const btnReset = document.getElementById('btnTimelineReset');
      if (btnReset) {
        btnReset.addEventListener('click', () => this.stop());
      }
      const scrubber = document.getElementById('timelineScrubber');
      if (scrubber) {
        scrubber.addEventListener('input', (e) => {
          this.seek(parseFloat(e.target.value) || 0);
        });
      }
    }
  };
})();
