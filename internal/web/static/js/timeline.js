/**
 * SVG Animator Studio — Timeline Player (`timeline.js`)
 *
 * Responsibilities:
 *   - Browser playback transport state machine (stopped | playing | paused | ended)
 *   - requestAnimationFrame scheduling loop and deterministic time advancement
 *   - Loop mode handling ('once' | 'loop' | 'pingpong')
 *   - UI playhead scrubber, MM:SS.mmm time display, frame-index stepping (-1f / +1f),
 *     preview FPS selector, play/pause toggle, and engine status badge
 *   - Deterministic forward & backward evaluation of the entire authored scene at any timestamp t:
 *       1. Go/WASM camera rig transforms and optical filter parameters via EngineBridge.evaluateSceneAtTime
 *       2. CSS keyframe animations (Web Animations API `getAnimations` pause & currentTime seek)
 *       3. Declarative SVG SMIL animations (`svg.pauseAnimations()` & `svg.setCurrentTime(sec)`)
 *       4. SMIL inside `<filter>` and `<mask>` (`<feGaussianBlur><animate>`, ripple mask rings)
 *       5. Low-Load Effects burst-pause cycles (`perimeter-tracer`, repeating `flash`, multi-segment `flow-lite`)
 *       6. Text Lite horizontal ticker DOM calibration (`ticker-h`) and grapheme-safe deterministic
 *          `typewriter` (`once`, `hold`, `delete`, `delete-forward`, `typeRepeat`) & `scramble`
 *   - Never mutates authored scene models or dirties HistoryManager.
 *
 * Layer 1 (UI Presentation & Playback Transport) — Authoritative evaluation in Go/WASM.
 */

(function() {
  'use strict';

  function solveCubicBezier(x1, y1, x2, y2, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    if (x1 === y1 && x2 === y2) return x;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const cx = 3 * x1;
      const bx = 3 * (x2 - x1) - cx;
      const ax = 1 - cx - bx;
      const currentX = ((ax * t + bx) * t + cx) * t - x;
      if (Math.abs(currentX) < 1e-6) break;
      const dx = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(dx) < 1e-6) break;
      t -= currentX / dx;
    }
    t = Math.max(0, Math.min(1, t));
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    return ((ay * t + by) * t + cy) * t;
  }

  function segmentGraphemes(str) {
    const t = String(str || '');
    if (!t) return [];
    if (typeof window !== 'undefined' && window.LiteEffects && typeof window.LiteEffects.segmentGraphemes === 'function') {
      return window.LiteEffects.segmentGraphemes(t);
    }
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      try {
        return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t), (x) => x.segment);
      } catch (_) {}
    }
    return Array.from(t);
  }

  function isStoppedByPlayFalse(el) {
    if (!el) return false;
    if (typeof el.getAttribute === 'function') {
      if (el.getAttribute('data-lite-play') === 'false' || el.getAttribute('data-play-animation') === 'false') {
        return true;
      }
    }
    if (typeof el.closest === 'function') {
      const ancestor = el.closest('[data-lite-play="false"], [data-play-animation="false"]');
      if (ancestor) return true;
    }
    return false;
  }

  window.TimelinePlayer = {
    status: 'stopped', // 'stopped' | 'playing' | 'paused' | 'ended'
    isPlaying: false,  // legacy boolean matching status === 'playing'
    currentTime: 0.0,
    duration: 7.0,
    previewFps: 30,
    loopMode: 'once',  // 'once' | 'loop' | 'pingpong'
    _isScrubbing: false,
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
      this.evaluateAndApply(this.currentTime);
    },

    formatTime(timeSec) {
      const safe = Math.max(0, Number.isFinite(Number(timeSec)) ? Number(timeSec) : 0);
      const totalMs = Math.round(safe * 1000);
      const mins = Math.floor(totalMs / 60000);
      const secs = Math.floor((totalMs % 60000) / 1000);
      const ms = totalMs % 1000;
      const mmStr = String(mins).padStart(2, '0');
      const ssStr = String(secs).padStart(2, '0');
      const mmmStr = String(ms).padStart(3, '0');
      return `${mmStr}:${ssStr}.${mmmStr}`;
    },

    getDisplayTime(rawTimeSec = this.currentTime) {
      let displayTime = Math.max(0, Number(rawTimeSec) || 0);
      if (this.loopMode === 'pingpong' && this.duration > 0 && displayTime > this.duration) {
        const cycle = displayTime % (2 * this.duration);
        displayTime = cycle > this.duration ? Math.max(0, 2 * this.duration - cycle) : cycle;
      } else if (this.loopMode === 'loop' && this.duration > 0 && displayTime > this.duration) {
        displayTime = displayTime % this.duration;
      } else if (displayTime > this.duration) {
        displayTime = this.duration;
      }
      return displayTime;
    },

    getTotalFrames() {
      const fps = Math.max(1, Number(this.previewFps) || 30);
      return Math.max(1, Math.round(this.duration * fps));
    },

    getCurrentFrameIndex() {
      const fps = Math.max(1, Number(this.previewFps) || 30);
      const disp = this.getDisplayTime(this.currentTime);
      return Math.max(0, Math.min(this.getTotalFrames(), Math.round(disp * fps)));
    },

    setPreviewFps(fps) {
      const parsed = parseInt(fps, 10);
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 120) {
        this.previewFps = parsed;
      }
      const sel = typeof document !== 'undefined' ? document.getElementById('timelinePreviewFpsSelect') : null;
      if (sel && String(sel.value) !== String(this.previewFps)) {
        sel.value = String(this.previewFps);
      }
      this.updateUI();
    },

    syncFromScene() {
      if (window.SceneState && typeof window.SceneState.getNumControl === 'function') {
        this.duration = window.SceneState.getNumControl('durationSlider', 7.0) || 7.0;
        this.loopMode = window.SceneState.getControl('loopSelect', 'once') || 'once';
      }
      if (this.currentTime > this.duration && this.loopMode !== 'pingpong') {
        this.currentTime = this.duration;
        if (this.status === 'playing' && this.loopMode === 'once') {
          this.pause();
          this.status = 'ended';
        }
      }
      const scrubber = typeof document !== 'undefined' ? document.getElementById('timelineScrubber') : null;
      if (scrubber) {
        scrubber.max = String(this.duration);
      }
      this.updateUI();
    },

    // Called whenever the SVG document in #svgContainer is re-rendered (by user edits, presets, project load, etc.)
    onSceneRedrawn() {
      if (window.LiteEffects && typeof window.LiteEffects.stopBurstSchedulers === 'function') {
        window.LiteEffects.stopBurstSchedulers();
      }
      this.syncFromScene();
      this.evaluateAndApply(this.currentTime);
      this.updateUI();
    },

    play() {
      if (this.status === 'playing') return;
      if (this.status === 'ended' || (this.loopMode === 'once' && this.currentTime >= this.duration - 1e-4)) {
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
      this.evaluateAndApply(this.currentTime);
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
      const clamped = Math.max(0, Math.min(this.duration, Number(timeSec) || 0));
      this.currentTime = Math.round(clamped * 10000) / 10000;
      if (this.status === 'ended' && this.currentTime < this.duration) {
        this.status = 'paused';
        this.updatePlayButton();
      }
      this.evaluateAndApply(this.currentTime);
      this.updateUI();
      return this.currentTime;
    },

    stepFrame(deltaFrames) {
      if (this.status === 'playing') {
        this.pause();
      }
      const fps = Math.max(1, Number(this.previewFps) || 30);
      const totalFrames = this.getTotalFrames();
      const dispTime = this.getDisplayTime(this.currentTime);
      const currentFrameIdx = Math.round(dispTime * fps);
      let nextFrameIdx = currentFrameIdx + (Number(deltaFrames) || 0);
      if (nextFrameIdx < 0) nextFrameIdx = 0;
      if (nextFrameIdx > totalFrames) nextFrameIdx = totalFrames;
      const targetTimeSec = nextFrameIdx / fps;
      return this.seek(targetTimeSec);
    },

    nextFrame() {
      return this.stepFrame(1);
    },

    prevFrame() {
      return this.stepFrame(-1);
    },

    _loop(timestamp) {
      if (this.status !== 'playing') return;
      if (this._isScrubbing) {
        this._lastTimestamp = timestamp || null;
        if (typeof requestAnimationFrame === 'function') {
          this._rafId = requestAnimationFrame((ts) => this._loop(ts));
        }
        return;
      }
      if (this._lastTimestamp !== null && timestamp) {
        const dt = (timestamp - this._lastTimestamp) / 1000.0;
        const cappedDt = Math.min(dt, 0.1);
        this.currentTime += cappedDt;

        if (this.currentTime >= this.duration) {
          if (this.loopMode === 'loop') {
            this.currentTime = this.duration > 0 ? (this.currentTime % this.duration) : 0;
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

    evaluateAndApply(rawTimeSec) {
      const evalSec = this.getDisplayTime(rawTimeSec);
      if (window.EngineBridge && typeof window.EngineBridge.evaluateSceneAtTime === 'function') {
        const frame = window.EngineBridge.evaluateSceneAtTime(evalSec);
        if (frame) {
          this.applyFrameToDOM(frame);
        }
      }
      this.evaluateSceneDOMAtTime(evalSec);
    },

    applyFrameToDOM(frame) {
      const container = typeof document !== 'undefined' ? document.getElementById('svgContainer') : null;
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

    _prepareDeterministicLiveDOM(container) {
      if (!container || typeof container.querySelectorAll !== 'function') return;

      // 1. Enforce play:false stopped state on any element or group
      container.querySelectorAll('[data-lite-play="false"], [data-play-animation="false"]').forEach((stEl) => {
        stEl.querySelectorAll('.lite-payload, .lite-osc-wave, .lite-text-element').forEach((ak) => {
          if (ak.style) {
            ak.style.animationPlayState = 'paused';
            ak.style.animationName = 'none';
          }
        });
        stEl.querySelectorAll('animate, animateTransform, animateMotion, set').forEach((sk) => {
          sk.setAttribute('begin', 'indefinite');
          if (typeof sk.endElement === 'function') {
            try { sk.endElement(); } catch (_) {}
          }
        });
      });

      // 2. Calibrate Text Lite ticker-h once per rendered element using real DOM text width
      container.querySelectorAll('[data-lite-kind="text-lite"][data-text-anim="ticker-h"]').forEach((g) => {
        if (isStoppedByPlayFalse(g) || g.getAttribute('data-sva-ticker-calibrated') === 'true') return;
        const txtEl = g.querySelector('.lite-text-element');
        const targetNode = g.querySelector('.lite-text-path') || txtEl;
        if (!txtEl || !targetNode) return;
        const fullStr = g.getAttribute('data-text-content') || targetNode.textContent || '';
        const w = parseFloat(g.getAttribute('data-text-w')) || 220;
        const pad = parseFloat(g.getAttribute('data-text-padding')) || 12;
        const dir = g.getAttribute('data-text-direction') === 'reverse' ? 'reverse' : 'forward';
        const pMode = g.getAttribute('data-text-playback-mode') || 'loop';
        const spd = Math.max(10, parseFloat(g.getAttribute('data-text-scroll-speed')) || 90);
        let tw = 0;
        try { tw = txtEl.getComputedTextLength(); } catch (_) {}
        if (!(tw > 0)) tw = Math.max(18, segmentGraphemes(fullStr).length * 10);
        const dist = w + tw;
        const dur = Math.max(0.15, dist / spd);
        const endPx = pMode === 'once' ? pad : (dir === 'reverse' ? w : -tw);
        txtEl.style.setProperty('--sva-ticker-start', (dir === 'reverse' ? -tw : w).toFixed(2) + 'px');
        txtEl.style.setProperty('--sva-ticker-end', endPx.toFixed(2) + 'px');
        txtEl.style.animationDuration = dur.toFixed(4) + 's';
        g.setAttribute('data-sva-ticker-calibrated', 'true');
      });
    },

    _evaluateTextLiteAtTime(g, ms) {
      if (isStoppedByPlayFalse(g)) return;
      let anim = g.getAttribute('data-text-anim') || 'none';
      if (anim === 'overtype') anim = 'typewriter';
      if (anim !== 'typewriter' && anim !== 'scramble') return;

      const txtEl = g.querySelector('.lite-text-element');
      const targetNode = g.querySelector('.lite-text-path') || txtEl;
      if (!txtEl || !targetNode) return;
      const fullStr = g.getAttribute('data-text-content') || '';
      const gs = segmentGraphemes(fullStr);
      const N = gs.length;
      if (N === 0) {
        targetNode.textContent = '';
        return;
      }

      const rate = Math.max(1, parseFloat(g.getAttribute('data-text-type-speed')) || 14);
      const hold = Math.max(0, parseFloat(g.getAttribute('data-text-hold-delay')) || 1.5);
      const pMode = g.getAttribute('data-text-playback-mode') || 'loop';
      const stepMs = Math.max(12, Math.round(1000 / rate));
      const startDelaySec = Math.max(0, parseFloat(g.getAttribute('data-lite-delay') || g.getAttribute('data-text-delay') || '0') || 0);
      const startDelayMs = startDelaySec * 1000.0;
      if (startDelayMs > 0 && ms < startDelayMs) {
        targetNode.textContent = '';
        return;
      }
      const activeElapsedMs = Math.max(0, ms - startDelayMs);

      if (anim === 'scramble') {
        const cipher = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&*';
        const activeDur = N * stepMs;
        const holdDur = Math.max(200, hold * 1000);
        const cycleDur = activeDur + holdDur;
        let localMs = activeElapsedMs;
        if (pMode !== 'once' && cycleDur > 0) {
          localMs = activeElapsedMs % cycleDur;
        }
        let idx = Math.floor(localMs / stepMs);
        if (idx > N) idx = N;
        if (idx < 0) idx = 0;
        let out = '';
        for (let k = 0; k < N; k++) {
          if (k < idx || gs[k] === ' ') {
            out += gs[k];
          } else {
            out += cipher.charAt((k * 7 + (idx + 1) * 13) % cipher.length);
          }
        }
        targetNode.textContent = out;
        return;
      }

      // Typewriter ('once', 'hold', 'delete', 'delete-forward')
      let mode = g.getAttribute('data-text-type-mode') || 'hold';
      if (mode === 'loop') mode = 'delete';
      const rep = g.getAttribute('data-text-type-repeat') === 'true' || pMode === 'loop';
      const delStepMs = Math.max(10, Math.round(stepMs * 0.75));
      const typeDur = N * stepMs;

      if (mode === 'delete' || mode === 'delete-forward') {
        const holdDur = Math.max(60, hold * 1000);
        const delDur = N * delStepMs;
        const pauseDur = rep ? 250 : 0;
        const cycleDur = typeDur + holdDur + delDur + pauseDur;
        let localMs = activeElapsedMs;
        if (rep && cycleDur > 0) {
          localMs = activeElapsedMs % cycleDur;
        }
        if (localMs < typeDur) {
          const idx = Math.min(N, Math.floor(localMs / stepMs));
          targetNode.textContent = gs.slice(0, idx).join('');
        } else if (localMs < typeDur + holdDur) {
          targetNode.textContent = fullStr;
        } else if (localMs < typeDur + holdDur + delDur) {
          const delElapsed = localMs - (typeDur + holdDur);
          const delSteps = Math.min(N, Math.floor(delElapsed / delStepMs) + 1);
          const rem = Math.max(0, N - delSteps);
          if (mode === 'delete') {
            targetNode.textContent = gs.slice(0, rem).join('');
          } else {
            targetNode.textContent = gs.slice(N - rem).join('');
          }
        } else {
          targetNode.textContent = '';
        }
      } else {
        const holdDur = Math.max(200, hold * 1000);
        const cycleDur = typeDur + holdDur;
        let localMs = activeElapsedMs;
        if (rep && cycleDur > 0) {
          localMs = activeElapsedMs % cycleDur;
        }
        if (localMs < typeDur) {
          const idx = Math.min(N, Math.floor(localMs / stepMs));
          targetNode.textContent = gs.slice(0, idx).join('');
        } else {
          targetNode.textContent = fullStr;
        }
      }
    },

    _evaluateBurstCyclesAtTime(n, ms) {
      if (isStoppedByPlayFalse(n)) return;
      const cyc = parseInt(n.getAttribute('data-burst-cycles') || '0', 10);
      const pSec = parseFloat(n.getAttribute('data-pause-seconds') || '0');
      if (!(cyc > 0 && pSec > 0)) return;
      const anims = (typeof n.getAnimations === 'function') ? n.getAnimations() : [];
      let baseDurSec = parseFloat((n.style && n.style.getPropertyValue('--sva-base-dur')) || (n.style && n.style.animationDuration) || '0');
      if (!(baseDurSec > 0) && anims.length > 0 && anims[0].effect && typeof anims[0].effect.getTiming === 'function') {
        const d = anims[0].effect.getTiming().duration;
        if (typeof d === 'number' && d > 0) baseDurSec = d / 1000.0;
      }
      if (!(baseDurSec > 0) && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
        const cd = parseFloat(window.getComputedStyle(n).animationDuration || '0');
        if (cd > 0) baseDurSec = cd;
      }
      if (!(baseDurSec > 0)) baseDurSec = 1;
      const activeMs = cyc * baseDurSec * 1000.0;
      const pauseMs = pSec * 1000.0;
      const startDelaySec = parseFloat(n.getAttribute('data-flow-start-delay') || '0') || 0;
      const startDelayMs = startDelaySec * 1000.0;
      const totalCycleMs = activeMs + pauseMs;
      if (totalCycleMs <= 0) return;

      const visMode = n.getAttribute('data-pause-visibility') || 'hide';
      const phaseRatio = parseFloat((n.style && n.style.getPropertyValue('--sva-phase-ratio')) || '0') || 0;
      const phaseDelayMs = Math.abs(phaseRatio) * baseDurSec * 1000.0;

      if (ms < startDelayMs) {
        if (visMode === 'hide') {
          n.setAttribute('visibility', 'hidden');
          if (n.style) {
            n.style.visibility = 'hidden';
            n.style.opacity = '0';
          }
        }
        anims.forEach((a) => {
          try { a.pause(); a.currentTime = phaseDelayMs; } catch (_) {}
        });
        return;
      }

      const localMs = (ms - startDelayMs) % totalCycleMs;
      if (localMs < activeMs) {
        n.removeAttribute('visibility');
        if (n.style) {
          n.style.visibility = '';
          n.style.opacity = '';
        }
        anims.forEach((a) => {
          try { a.pause(); a.currentTime = localMs + phaseDelayMs; } catch (_) {}
        });
      } else {
        if (visMode === 'hide') {
          n.setAttribute('visibility', 'hidden');
          if (n.style) {
            n.style.visibility = 'hidden';
            n.style.opacity = '0';
          }
        } else {
          n.removeAttribute('visibility');
          if (n.style) {
            n.style.visibility = '';
            n.style.opacity = '';
          }
        }
        anims.forEach((a) => {
          try { a.pause(); a.currentTime = Math.max(0, activeMs - 0.1) + phaseDelayMs; } catch (_) {}
        });
      }
    },

    _evaluateFilterAndMaskSMILAtTime(container, sec) {
      if (!container || typeof container.querySelectorAll !== 'function') return;
      container.querySelectorAll('filter animate, filter animateTransform, mask animate, mask animateTransform').forEach((anim) => {
        const parent = anim.parentElement;
        if (!parent) return;
        const attr = anim.getAttribute('attributeName');
        if (!attr) return;
        if (!parent.hasAttribute('data-sva-orig-' + attr)) {
          parent.setAttribute('data-sva-orig-' + attr, parent.getAttribute(attr) || '0');
        }
        if (anim.getAttribute('begin') === 'indefinite' || isStoppedByPlayFalse(anim)) return;

        let durAttr = anim.getAttribute('dur') || '';
        let dur = parseFloat(durAttr);
        if (durAttr.endsWith('ms')) dur = dur / 1000.0;
        if (isNaN(dur) || dur <= 0) dur = 1.0;

        let beginAttr = anim.getAttribute('begin') || '';
        let begin = parseFloat(beginAttr) || 0.0;
        if (beginAttr.endsWith('ms')) begin = begin / 1000.0;

        const localSec = sec - begin;
        if (localSec < 0) {
          parent.setAttribute(attr, parent.getAttribute('data-sva-orig-' + attr) || '0');
          return;
        }

        let progress;
        const fill = anim.getAttribute('fill') || 'remove';
        if (anim.getAttribute('repeatCount') === 'indefinite') {
          progress = (localSec % dur) / dur;
        } else {
          if (localSec > dur && fill !== 'freeze') {
            parent.setAttribute(attr, parent.getAttribute('data-sva-orig-' + attr) || '0');
            return;
          }
          progress = localSec / dur;
          if (progress > 1.0) progress = 1.0;
        }
        if (progress < 0.0) progress = 0.0;

        let fromAttr = anim.getAttribute('from');
        let toAttr = anim.getAttribute('to');
        let segProgress = progress;

        const calcMode = anim.getAttribute('calcMode') || 'linear';
        const splinesAttr = anim.getAttribute('keySplines');
        const splines = splinesAttr ? splinesAttr.split(';').map((s) => s.trim()).filter(Boolean) : [];
        const keyTimesAttr = anim.getAttribute('keyTimes');
        const keyTimes = keyTimesAttr ? keyTimesAttr.split(';').map((k) => parseFloat(k.trim())).filter((k) => !isNaN(k)) : [];

        if (anim.hasAttribute('values')) {
          const vals = anim.getAttribute('values').split(';').map((v) => v.trim()).filter((v) => v !== '');
          const numSegments = vals.length - 1;
          if (numSegments > 0) {
            let segIdx = 0;
            if (keyTimes.length === vals.length) {
              for (let i = 0; i < numSegments; i++) {
                if (progress >= keyTimes[i] && progress <= keyTimes[i + 1]) {
                  segIdx = i;
                  const span = keyTimes[i + 1] - keyTimes[i];
                  segProgress = span > 0 ? (progress - keyTimes[i]) / span : 1.0;
                  break;
                } else if (progress > keyTimes[numSegments]) {
                  segIdx = numSegments - 1;
                  segProgress = 1.0;
                }
              }
            } else {
              const scaled = progress * numSegments;
              if (scaled >= numSegments) {
                segIdx = numSegments - 1;
                segProgress = 1.0;
              } else {
                segIdx = Math.floor(scaled);
                segProgress = scaled - segIdx;
              }
            }

            fromAttr = vals[segIdx];
            toAttr = vals[segIdx + 1];

            if (calcMode === 'spline' && splines[segIdx]) {
              const pts = splines[segIdx].split(/[\s,]+/).map(parseFloat);
              if (pts.length === 4 && !pts.some(isNaN)) {
                segProgress = solveCubicBezier(pts[0], pts[1], pts[2], pts[3], segProgress);
              }
            }
          }
        } else if (calcMode === 'spline' && splines[0]) {
          const pts = splines[0].split(/[\s,]+/).map(parseFloat);
          if (pts.length === 4 && !pts.some(isNaN)) {
            segProgress = solveCubicBezier(pts[0], pts[1], pts[2], pts[3], segProgress);
          }
        }

        if (fromAttr != null && toAttr != null) {
          const fromParts = fromAttr.split(/[\s,]+/);
          const toParts = toAttr.split(/[\s,]+/);
          const resultVals = [];
          for (let i = 0; i < fromParts.length; i++) {
            const f = parseFloat(fromParts[i]);
            const t = parseFloat(toParts[i] || toParts[0]);
            if (!isNaN(f) && !isNaN(t)) {
              const val = f + (t - f) * segProgress;
              resultVals.push(val.toFixed(4));
            }
          }
          if (resultVals.length > 0) {
            parent.setAttribute(attr, resultVals.join(' '));
          }
        }
      });
    },

    evaluateSceneDOMAtTime(timeSec) {
      const container = typeof document !== 'undefined' ? document.getElementById('svgContainer') : null;
      if (!container) return;

      const sec = Math.max(0, Number(timeSec) || 0);
      const ms = sec * 1000.0;

      this._prepareDeterministicLiveDOM(container);

      // 1. Seek all CSS / Web Animations inside #svgContainer
      if (typeof container.getAnimations === 'function') {
        container.getAnimations({ subtree: true }).forEach((anim) => {
          try {
            const target = anim.effect && anim.effect.target;
            if (target && isStoppedByPlayFalse(target)) {
              anim.pause();
              return;
            }
            anim.pause();
            anim.currentTime = ms;
          } catch (_) {}
        });
      }

      // 2. Seek all declarative SVG SMIL clocks inside #svgContainer
      if (typeof container.querySelectorAll === 'function') {
        container.querySelectorAll('svg').forEach((svg) => {
          if (typeof svg.setCurrentTime === 'function') {
            try {
              if (typeof svg.pauseAnimations === 'function') {
                svg.pauseAnimations();
              }
              svg.setCurrentTime(sec);
            } catch (_) {}
          }
        });

        // 3. Deterministically evaluate burst-pause Low-Load Effects (perimeter-tracer, flash, flow-lite)
        container.querySelectorAll('[data-burst-cycles]').forEach((n) => {
          this._evaluateBurstCyclesAtTime(n, ms);
        });

        // 4. Deterministically evaluate Text Lite typewriter & scramble forwards and backwards
        container.querySelectorAll('[data-lite-kind="text-lite"]').forEach((g) => {
          this._evaluateTextLiteAtTime(g, ms);
        });

        // 5. Deterministically evaluate SMIL animations inside <filter> and <mask>
        this._evaluateFilterAndMaskSMILAtTime(container, sec);
      }
    },

    updateUI() {
      if (typeof document === 'undefined') return;
      const displayTime = this.getDisplayTime(this.currentTime);
      const timeDisplay = document.getElementById('timelineTimeDisplay');
      if (timeDisplay) {
        timeDisplay.textContent = `${this.formatTime(displayTime)} / ${this.formatTime(this.duration)}`;
      }
      const frameDisplay = document.getElementById('timelineFrameDisplay');
      if (frameDisplay) {
        frameDisplay.textContent = `Frame ${this.getCurrentFrameIndex()} / ${this.getTotalFrames()}`;
      }
      const scrubber = document.getElementById('timelineScrubber');
      if (scrubber && !this._isScrubbing && document.activeElement !== scrubber) {
        scrubber.value = String(displayTime);
      } else if (scrubber && !this._isScrubbing) {
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
      if (typeof document === 'undefined') return;
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
      if (typeof document === 'undefined') return;
      const btnPlay = document.getElementById('btnTimelinePlay');
      if (btnPlay) {
        btnPlay.addEventListener('click', () => this.toggle());
      }
      const btnReset = document.getElementById('btnTimelineReset');
      if (btnReset) {
        btnReset.addEventListener('click', () => this.stop());
      }
      const btnPrevFrame = document.getElementById('btnTimelinePrevFrame');
      if (btnPrevFrame) {
        btnPrevFrame.addEventListener('click', () => this.prevFrame());
      }
      const btnNextFrame = document.getElementById('btnTimelineNextFrame');
      if (btnNextFrame) {
        btnNextFrame.addEventListener('click', () => this.nextFrame());
      }
      const fpsSelect = document.getElementById('timelinePreviewFpsSelect');
      if (fpsSelect) {
        fpsSelect.addEventListener('change', (e) => {
          this.setPreviewFps(parseInt(e.target.value, 10) || 30);
        });
      }
      const scrubber = document.getElementById('timelineScrubber');
      if (scrubber) {
        scrubber.addEventListener('pointerdown', () => {
          this._isScrubbing = true;
          if (this.status === 'playing') {
            this.pause();
          }
        });
        const endScrub = () => {
          this._isScrubbing = false;
        };
        scrubber.addEventListener('pointerup', endScrub);
        scrubber.addEventListener('pointercancel', endScrub);
        scrubber.addEventListener('change', endScrub);
        scrubber.addEventListener('input', (e) => {
          this.seek(parseFloat(e.target.value) || 0);
        });
      }
    }
  };
})();
