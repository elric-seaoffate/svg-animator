/**
 * Low-Load Effects Module (`window.LiteEffects`) — Stage 16D-A
 *
 * Implements economical, reusable SVG effects:
 *   - Perimeter Tracer Lite (`perimeter-tracer`: rounded, rect, circle, ellipse)
 *   - Pulse Lite (`pulse`: circle, square, diamond, cross, ring)
 *   - Flash Lite (`flash`: diamond, circle, square, cross, star)
 *
 * Go/WASM (`window.EngineBridge`) is authoritative for object creation,
 * validation, persistence, layer ordering, and perimeter dash math.
 */
window.LiteEffects = {
  list: [],
  activeId: null,
  activePointIndex: 0,
  counter: 0,
  _initialized: false,

  escapeXML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  },

  sanitizeColor(col, fallback = '#38bdf8') {
    if (typeof col !== 'string') return fallback;
    col = col.trim();
    if (/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(col)) return col;
    if (/^rgba?\(/.test(col) || /^hsla?\(/.test(col)) return col;
    return fallback;
  },

  _migrateLiteEffect(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    const le = Object.assign({}, raw);
    if (!le.originMode) {
      if (le.kind === 'perimeter-tracer') {
        const w = Number(le.width) > 0 ? Number(le.width) : 140;
        const h = Number(le.height) > 0 ? Number(le.height) : 80;
        le.x = (Number(le.x) || 100) + w / 2;
        le.y = (Number(le.y) || 100) + h / 2;
        le.width = w;
        le.height = h;
      } else if (le.kind === 'pulse' || le.kind === 'flash') {
        const r = Number(le.radius) > 0 ? Number(le.radius) : 28;
        if (!le.width || (Number(le.width) === 140 && Number(le.height) === 80)) {
          le.width = r * 2;
          le.height = r * 2;
        }
      }
      le.originMode = 'center';
    }
    if (le.kind === 'perimeter-tracer') {
      if (le.showGuide === undefined || le.showGuide === null) le.showGuide = true;
      if (le.maintainAspectRatio === undefined || le.maintainAspectRatio === null) {
        le.maintainAspectRatio = (le.variant === 'circle');
      }
      if (le.burstCycles === undefined || le.burstCycles === null) le.burstCycles = 0;
      if (le.pauseSeconds === undefined || le.pauseSeconds === null) le.pauseSeconds = 0;
      if (!le.pauseVisibility) le.pauseVisibility = 'hide';
    } else if (le.kind === 'pulse') {
      if (!le.minScale || le.minScale <= 0) le.minScale = 0.85;
      if (!le.maxScale || le.maxScale <= 0) le.maxScale = 1.15;
      if (!le.armThickness || le.armThickness <= 0) le.armThickness = 3;
      if (le.maintainAspectRatio === undefined || le.maintainAspectRatio === null) le.maintainAspectRatio = true;
    } else if (le.kind === 'flash') {
      if (!le.dur || le.dur <= 0) le.dur = 0.10;
      if (!le.repeatInterval || le.repeatInterval <= 0) le.repeatInterval = Number(le.period) > 0 ? Number(le.period) : 2.0;
      if (!le.armThickness || le.armThickness <= 0) le.armThickness = 3;
      if (le.maintainAspectRatio === undefined || le.maintainAspectRatio === null) le.maintainAspectRatio = true;
    } else if (le.kind === 'flow-lite') {
      if (!le.variant) le.variant = 'dashed';
      if (!Array.isArray(le.points) || le.points.length < 2) {
        le.points = [
          { x: 25, y: 50 },
          { x: 75, y: 50 }
        ];
      } else {
        le.points = le.points.map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 }));
      }
      if (!Array.isArray(le.bends) || le.bends.length !== le.points.length - 1) {
        const nextBends = new Array(Math.max(1, le.points.length - 1)).fill(0);
        if (Array.isArray(le.bends)) {
          for (let i = 0; i < nextBends.length && i < le.bends.length; i++) {
            nextBends[i] = Math.max(-100, Math.min(100, Number(le.bends[i]) || 0));
          }
        }
        le.bends = nextBends;
      }
      le.curvature = Math.max(-100, Math.min(100, Number(le.curvature) || 0));
      if (!le.dashLength || le.dashLength <= 0) le.dashLength = le.variant === 'single' ? 36 : 18;
      if (!le.gapLength || le.gapLength <= 0) le.gapLength = 14;
      if (!le.dotSize || le.dotSize <= 0) le.dotSize = 5;
      if (!le.strokeWidth || le.strokeWidth <= 0) le.strokeWidth = 3;
      if (!le.segmentStyle) le.segmentStyle = 'rounded';
      if (!le.startMode) le.startMode = 'tunnel';
      if (!le.endMode) le.endMode = 'tunnel';
      if (!le.direction || le.direction === 'cw') le.direction = 'forward';
      else if (le.direction === 'ccw') le.direction = 'reverse';
      if (!le.playbackMode) le.playbackMode = 'loop';
      if (!le.speed || le.speed <= 0) le.speed = 2.0;
      else if (le.speed > 30) le.speed = 30;
      le.delay = Math.max(0, Math.min(60, Number(le.delay) || 0));
      le.endDelay = Math.max(0, Math.min(60, Number(le.endDelay) || 0));
      if (le.showGuide === undefined || le.showGuide === null) le.showGuide = true;
    } else if (le.kind === 'radar-lite') {
      if (!le.variant || !['single', 'multi', 'fading-ping'].includes(le.variant)) le.variant = 'multi';
      if (le.variant === 'single') le.rings = 1;
      else if (!le.rings || le.rings < 1) le.rings = 3;
      else if (le.rings > 6) le.rings = 6;
      if (!le.minScale || le.minScale <= 0) le.minScale = 0.15;
      if (!le.maxScale || le.maxScale <= 0) le.maxScale = 1.0;
      if (le.minScale >= le.maxScale) le.minScale = Math.max(0.05, le.maxScale * 0.5);
      if (!le.period || le.period <= 0) le.period = Number(le.speed) > 0 ? Number(le.speed) : 2.4;
      else if (le.period > 30) le.period = 30;
      le.speed = le.period;
      if (!le.strokeWidth || le.strokeWidth <= 0) le.strokeWidth = 2.0;
      if (!le.width || le.width <= 0) le.width = 80;
      if (!le.height || le.height <= 0) le.height = 80;
      if (le.showGuide === undefined || le.showGuide === null) le.showGuide = true;
      if (le.maintainAspectRatio === undefined || le.maintainAspectRatio === null) le.maintainAspectRatio = true;
    } else if (le.kind === 'gauge-lite') {
      if (!le.variant || !['ring', 'hbar', 'vbar', 'segmented', 'level'].includes(le.variant)) le.variant = 'ring';
      const minV = (le.minValue !== undefined && le.minValue !== null && Number.isFinite(Number(le.minValue))) ? Number(le.minValue) : 0;
      let maxV = (le.maxValue !== undefined && le.maxValue !== null && Number.isFinite(Number(le.maxValue))) ? Number(le.maxValue) : 100;
      if (maxV <= minV) maxV = minV + 100;
      le.minValue = minV;
      le.maxValue = maxV;
      if (le.value === undefined || le.value === null || !Number.isFinite(Number(le.value))) {
        le.value = Math.round((minV + (maxV - minV) * 0.65) * 100) / 100;
      } else {
        le.value = Number(le.value);
      }
      if (!le.bgColor) le.bgColor = '#1e293b';
      if (!le.warnColor) le.warnColor = '#f59e0b';
      if (!le.critColor) le.critColor = '#ef4444';
      if (le.warnThreshold === undefined || le.warnThreshold === null || !Number.isFinite(Number(le.warnThreshold))) {
        le.warnThreshold = Math.round((minV + (maxV - minV) * 0.70) * 100) / 100;
      } else {
        le.warnThreshold = Number(le.warnThreshold);
      }
      if (le.critThreshold === undefined || le.critThreshold === null || !Number.isFinite(Number(le.critThreshold))) {
        le.critThreshold = Math.round((minV + (maxV - minV) * 0.90) * 100) / 100;
      } else {
        le.critThreshold = Number(le.critThreshold);
      }
      if (le.critThreshold < le.warnThreshold) le.critThreshold = le.warnThreshold;
      le.useThresholds = Boolean(le.useThresholds);
      if (!Array.isArray(le.thresholds) || le.thresholds.length !== 4) {
        const span = maxV - minV;
        le.thresholds = [
          { enabled: false, value: Math.round((minV + span * 0.40) * 100) / 100, color: '#22c55e' },
          { enabled: false, value: Math.round((minV + span * 0.60) * 100) / 100, color: '#eab308' },
          { enabled: le.useThresholds, value: le.warnThreshold, color: le.warnColor },
          { enabled: le.useThresholds, value: le.critThreshold, color: le.critColor }
        ];
      } else {
        const defCols = ['#22c55e', '#eab308', le.warnColor || '#f59e0b', le.critColor || '#ef4444'];
        le.thresholds = le.thresholds.map((b, i) => ({
          enabled: Boolean(b && b.enabled),
          value: (b && Number.isFinite(Number(b.value))) ? Number(b.value) : Math.round((minV + (maxV - minV) * (0.4 + i * 0.17)) * 100) / 100,
          color: this.sanitizeColor(b && b.color, defCols[i])
        }));
        le.useThresholds = le.thresholds.some((b) => b.enabled);
        le.warnThreshold = le.thresholds[2].value;
        le.warnColor = le.thresholds[2].color;
        le.critThreshold = le.thresholds[3].value;
        le.critColor = le.thresholds[3].color;
      }
      if (!le.segments || le.segments < 2) le.segments = 10;
      else if (le.segments > 32) le.segments = 32;
      if (!le.direction || le.direction === 'cw') le.direction = 'forward';
      else if (le.direction === 'ccw') le.direction = 'reverse';
      if (le.showGuide === undefined || le.showGuide === null) le.showGuide = true;
      if (!le.strokeWidth || le.strokeWidth <= 0) le.strokeWidth = le.variant === 'ring' ? 8.0 : 2.0;
      if (!le.width || le.width <= 0) {
        le.width = le.variant === 'ring' ? 96 : (le.variant === 'vbar' ? 36 : (le.variant === 'level' ? 84 : 160));
      }
      if (!le.height || le.height <= 0) {
        le.height = le.variant === 'ring' ? 96 : (le.variant === 'vbar' ? 140 : (le.variant === 'level' ? 120 : 32));
      }
      if (le.maintainAspectRatio === undefined || le.maintainAspectRatio === null) {
        le.maintainAspectRatio = le.variant === 'ring';
      }
      le.unit = le.unit !== undefined && le.unit !== null ? String(le.unit) : '%';
      le.labelText = le.labelText !== undefined && le.labelText !== null ? String(le.labelText) : '';
    } else if (le.kind === 'oscilloscope-lite') {
      const validPresets = ['ecg', 'sine', 'square', 'triangle', 'sawtooth', 'polyline', 'bezier'];
      if (!le.variant || !validPresets.includes(le.variant)) le.variant = 'ecg';
      if (!le.playbackMode || !['static', 'animated', 'sampled'].includes(le.playbackMode)) {
        le.playbackMode = 'animated';
      }
      if (!le.bgColor) le.bgColor = '#0b1322';
      if (!le.intensity || le.intensity <= 0) le.intensity = 0.75;
      else le.intensity = Math.max(0.05, Math.min(1.0, Number(le.intensity)));
      if (!le.segments || le.segments < 1) le.segments = 2;
      else le.segments = Math.min(12, Math.round(Number(le.segments)));
      if (le.startOffset === undefined || le.startOffset === null || Number(le.startOffset) <= 0) le.startOffset = 50;
      else le.startOffset = Math.max(10, Math.min(90, Number(le.startOffset)));
      if (!le.speed || le.speed <= 0) le.speed = 2.4;
      else le.speed = Math.max(0.2, Math.min(30, Number(le.speed)));
      le.period = le.speed;
      if (!le.direction || le.direction === 'cw') le.direction = 'forward';
      else if (le.direction === 'ccw') le.direction = 'reverse';
      if (!le.strokeWidth || le.strokeWidth <= 0) le.strokeWidth = 2.2;
      if (!le.width || le.width <= 0) le.width = 180;
      if (!le.height || le.height <= 0) le.height = 76;
      if (le.showGuide === undefined || le.showGuide === null) le.showGuide = true;
      if (le.maintainAspectRatio === undefined || le.maintainAspectRatio === null) le.maintainAspectRatio = false;
      if (!le.samples || typeof le.samples !== 'string' || !le.samples.trim()) {
        le.samples = '0, 0.4, 0.9, 0.3, -0.5, -0.9, -0.2, 0.6, 1.0, 0.2, -0.4, 0';
      }
    } else if (le.kind === 'text-lite') {
      const validVariants = ['none', 'rect', 'rounded', 'pill', 'curved'];
      if (!le.variant || !validVariants.includes(le.variant)) le.variant = 'rounded';
      const validFonts = [
        'modern-sans', 'humanist-sans', 'geometric-sans', 'formal-serif', 'traditional-serif',
        'tech-mono', 'condensed-display', 'casual-lettering', 'informal-hand', 'classic-script'
      ];
      if (!le.fontFamily || !validFonts.includes(le.fontFamily)) le.fontFamily = 'modern-sans';
      if (!le.fontSize || le.fontSize < 8) le.fontSize = 18;
      else if (le.fontSize > 120) le.fontSize = 120;
      if (!le.fontWeight || !['400', '500', '600', '700'].includes(String(le.fontWeight))) le.fontWeight = '600';
      if (le.letterSpacing === undefined || le.letterSpacing === null || !Number.isFinite(Number(le.letterSpacing))) le.letterSpacing = 0;
      else le.letterSpacing = Math.max(-2, Math.min(20, Number(le.letterSpacing)));
      if (!le.textAlign || !['left', 'center', 'right'].includes(le.textAlign)) le.textAlign = 'center';
      if (!le.verticalAlign || !['top', 'middle', 'bottom'].includes(le.verticalAlign)) le.verticalAlign = 'middle';
      if (le.padding === undefined || le.padding === null || !Number.isFinite(Number(le.padding))) le.padding = 12;
      else le.padding = Math.max(0, Math.min(60, Number(le.padding)));
      if (!le.color) le.color = '#f8fafc';
      if (!le.bgColor) le.bgColor = '#0f172a';
      if (!le.borderColor) le.borderColor = '#38bdf8';
      if (le.bgOpacity === undefined || le.bgOpacity === null || !Number.isFinite(Number(le.bgOpacity))) {
        le.bgOpacity = (le.variant === 'none' || le.variant === 'curved') ? 0 : 0.85;
      } else {
        le.bgOpacity = Math.max(0, Math.min(1, Number(le.bgOpacity)));
      }
      if (le.strokeWidth === undefined || le.strokeWidth === null || !Number.isFinite(Number(le.strokeWidth))) {
        le.strokeWidth = (le.variant === 'none' || le.variant === 'curved') ? 0 : 1.5;
      } else {
        le.strokeWidth = Math.max(0, Math.min(24, Number(le.strokeWidth)));
      }
      if (le.cornerRadius === undefined || le.cornerRadius === null || !Number.isFinite(Number(le.cornerRadius))) {
        le.cornerRadius = 8;
      } else {
        le.cornerRadius = Math.max(0, Math.min(100, Number(le.cornerRadius)));
      }
      if (le.rotation === undefined || le.rotation === null || !Number.isFinite(Number(le.rotation))) {
        le.rotation = 0;
      } else {
        le.rotation = Math.max(-360, Math.min(360, Number(le.rotation)));
      }
      if (le.curvature === undefined || le.curvature === null || !Number.isFinite(Number(le.curvature))) {
        le.curvature = 35;
      } else {
        le.curvature = Math.max(-100, Math.min(100, Number(le.curvature)));
      }
      if (le.startOffset === undefined || le.startOffset === null || !Number.isFinite(Number(le.startOffset))) {
        le.startOffset = 50;
      } else {
        le.startOffset = Math.max(0, Math.min(100, Number(le.startOffset)));
      }
      const validAnims = ['none', 'ticker-h', 'ticker-v', 'stacked-v', 'typewriter', 'fade', 'flash', 'slide', 'blur-in', 'blur-out', 'scramble', 'overtype'];
      if (!le.textAnim || !validAnims.includes(le.textAnim)) le.textAnim = 'none';
      if (le.textAnim === 'overtype') le.textAnim = 'typewriter';
      if (le.variant === 'curved' && ['ticker-h', 'ticker-v', 'stacked-v', 'slide', 'scramble', 'overtype'].includes(le.textAnim)) {
        le.textAnim = 'none';
      }
      if (!le.scrollSpeed || le.scrollSpeed < 10) le.scrollSpeed = 90;
      else if (le.scrollSpeed > 600) le.scrollSpeed = 600;
      if (!le.linesPerSec || le.linesPerSec < 0.1) le.linesPerSec = 1.2;
      else if (le.linesPerSec > 20) le.linesPerSec = 20;
      if (!le.lineSpacing || le.lineSpacing < 0.8) le.lineSpacing = 1.25;
      else if (le.lineSpacing > 3.0) le.lineSpacing = 3.0;
      if (le.wordWrap === undefined || le.wordWrap === null) le.wordWrap = true;
      else le.wordWrap = Boolean(le.wordWrap);
      if (!le.typeSpeed || le.typeSpeed < 1) le.typeSpeed = 14;
      else if (le.typeSpeed > 120) le.typeSpeed = 120;
      if (le.holdDelay === undefined || le.holdDelay === null || !Number.isFinite(Number(le.holdDelay))) le.holdDelay = 1.5;
      else le.holdDelay = Math.max(0, Math.min(30, Number(le.holdDelay)));
      if (le.clearDuration === undefined || le.clearDuration === null || !Number.isFinite(Number(le.clearDuration))) le.clearDuration = 0.6;
      else le.clearDuration = Math.max(0, Math.min(30, Number(le.clearDuration)));
      if (le.lockOnOff === undefined || le.lockOnOff === null) le.lockOnOff = false;
      else le.lockOnOff = Boolean(le.lockOnOff);
      if (le.lockOnOff && le.textAnim === 'flash') {
        le.clearDuration = le.holdDelay;
      }
      if (le.typeMode === 'loop') {
        le.typeMode = 'delete';
        le.typeRepeat = true;
      } else if (!le.typeMode || !['once', 'hold', 'delete', 'delete-forward'].includes(le.typeMode)) {
        le.typeMode = 'hold';
      }
      if (le.typeRepeat === undefined || le.typeRepeat === null) {
        le.typeRepeat = (le.typeMode === 'delete' || le.typeMode === 'delete-forward');
      } else {
        le.typeRepeat = Boolean(le.typeRepeat);
      }
      if (!le.playbackMode || !['loop', 'once', 'pingpong'].includes(le.playbackMode)) {
        le.playbackMode = 'loop';
      }
      if (le.speed === undefined || le.speed === null || !Number.isFinite(Number(le.speed))) {
        le.speed = le.textAnim === 'flash' ? 0.15 : 0.8;
      } else {
        le.speed = Math.max(le.textAnim === 'flash' ? 0 : 0.05, Math.min(30, Number(le.speed)));
      }
      le.period = le.speed;
      if (!le.direction || le.direction === 'cw') le.direction = 'forward';
      else if (le.direction === 'ccw') le.direction = 'reverse';
      if (!le.width || le.width <= 0) le.width = 220;
      if (!le.height || le.height <= 0) le.height = 56;
      if (le.showGuide === undefined || le.showGuide === null) le.showGuide = false;
      if (le.maintainAspectRatio === undefined || le.maintainAspectRatio === null) le.maintainAspectRatio = false;
      if (le.labelText === undefined || le.labelText === null) le.labelText = 'System Ready';
      else le.labelText = String(le.labelText);
    }
    le.delay = Math.max(0, Math.min(60, Number(le.delay) || 0));
    return le;
  },

  getLiteEffect(id) {
    const sid = String(id);
    return this.list.find((l) => String(l.id) === sid) || null;
  },

  getAllLiteEffects() {
    return this.list.slice();
  },

  createLiteEffect(initialProps = {}) {
    const kind = initialProps.kind || 'perimeter-tracer';
    const isTracer = kind === 'perimeter-tracer';
    const isFlowLite = kind === 'flow-lite';
    const isRadar = kind === 'radar-lite';
    const isGauge = kind === 'gauge-lite';
    const isOsc = kind === 'oscilloscope-lite';
    const isText = kind === 'text-lite';
    const reqVariant = initialProps.variant || '';
    const defaultVariant = isFlowLite
      ? 'dashed'
      : (isRadar ? 'multi' : (isGauge ? (reqVariant || 'ring') : (isOsc ? (reqVariant || 'ecg') : (isText ? (reqVariant || 'rounded') : (isTracer ? 'rounded' : (kind === 'flash' ? 'diamond' : 'circle'))))));
    const defaultW = isTracer
      ? 140
      : (isRadar ? 80 : (isGauge ? (defaultVariant === 'ring' ? 96 : (defaultVariant === 'vbar' ? 36 : (defaultVariant === 'level' ? 84 : 160))) : (isOsc ? 180 : (isText ? 220 : 56))));
    const defaultH = isTracer
      ? 80
      : (isRadar ? 80 : (isGauge ? (defaultVariant === 'ring' ? 96 : (defaultVariant === 'vbar' ? 140 : (defaultVariant === 'level' ? 120 : 32))) : (isOsc ? 76 : (isText ? 56 : 56))));
    const payload = Object.assign({
      kind,
      originMode: 'center',
      variant: defaultVariant,
      x: 240,
      y: 180,
      width: defaultW,
      height: defaultH,
      radius: isRadar ? 40 : (isGauge ? 48 : 28),
      cornerRadius: (isGauge || isOsc) ? 6 : (isText ? 8 : 10),
      rotation: 0,
      color: isText ? '#f8fafc' : (kind === 'flash' ? '#f59e0b' : ((kind === 'pulse' || isRadar || isOsc) ? '#22c55e' : '#38bdf8')),
      opacity: (isGauge || isOsc || isText) ? 1.0 : 0.9,
      strokeWidth: isFlowLite ? 3.0 : (isRadar ? 2.0 : (isGauge ? (defaultVariant === 'ring' ? 8.0 : 2.0) : (isOsc ? 2.2 : (isText ? ((defaultVariant === 'none' || defaultVariant === 'curved') ? 0 : 1.5) : 2.5)))),
      segments: isGauge ? 10 : 2,
      rings: isRadar ? 3 : undefined,
      lineGapRatio: '1:3',
      segmentStyle: 'rounded',
      startOffset: (isOsc || isText) ? 50 : 0,
      direction: (isFlowLite || isGauge || isOsc || isText) ? 'forward' : 'cw',
      playbackMode: isOsc ? 'animated' : 'loop',
      speed: (isFlowLite || isText) ? 2.0 : ((isRadar || isOsc) ? 2.4 : 3.0),
      period: kind === 'flash' ? 3.0 : ((isRadar || isOsc) ? 2.4 : (isText ? 2.0 : 1.8)),
      dur: 0.10,
      intensity: (kind === 'flash' || isOsc) ? 0.75 : 0.85,
      minScale: isRadar ? 0.15 : 0.85,
      maxScale: isRadar ? 1.0 : 1.15,
      maintainAspectRatio: isGauge ? (defaultVariant === 'ring') : (!isTracer && !isFlowLite && !isOsc && !isText),
      showGuide: isText ? false : true,
      repeat: false,
      triggerNonce: 0,
      points: isFlowLite ? [{ x: 25, y: 50 }, { x: 75, y: 50 }] : undefined,
      bends: isFlowLite ? [0] : undefined,
      curvature: isText ? 35 : 0,
      dashLength: 18,
      gapLength: 14,
      dotSize: 5,
      startMode: 'tunnel',
      endMode: 'tunnel',
      delay: 0,
      endDelay: 0,
      value: isGauge ? 65 : undefined,
      minValue: isGauge ? 0 : undefined,
      maxValue: isGauge ? 100 : undefined,
      bgColor: isGauge ? '#1e293b' : (isOsc ? '#0b1322' : (isText ? '#0f172a' : undefined)),
      bgOpacity: isText ? ((defaultVariant === 'none' || defaultVariant === 'curved') ? 0 : 0.85) : undefined,
      borderColor: isText ? '#38bdf8' : undefined,
      useThresholds: isGauge ? false : undefined,
      warnThreshold: isGauge ? 70 : undefined,
      warnColor: isGauge ? '#f59e0b' : undefined,
      critThreshold: isGauge ? 90 : undefined,
      critColor: isGauge ? '#ef4444' : undefined,
      unit: isGauge ? '%' : undefined,
      labelText: isGauge ? '' : (isText ? 'System Ready' : undefined),
      samples: isOsc ? '0, 0.4, 0.9, 0.3, -0.5, -0.9, -0.2, 0.6, 1.0, 0.2, -0.4, 0' : undefined,
      fontFamily: isText ? 'modern-sans' : undefined,
      fontSize: isText ? 18 : undefined,
      fontWeight: isText ? '600' : undefined,
      letterSpacing: isText ? 0 : undefined,
      textAlign: isText ? 'center' : undefined,
      verticalAlign: isText ? 'middle' : undefined,
      padding: isText ? 12 : undefined,
      textAnim: isText ? 'none' : undefined,
      scrollSpeed: isText ? 90 : undefined,
      linesPerSec: isText ? 1.2 : undefined,
      lineSpacing: isText ? 1.25 : undefined,
      wordWrap: isText ? true : undefined,
      typeSpeed: isText ? 14 : undefined,
      holdDelay: isText ? 1.5 : undefined,
      clearDuration: isText ? 0.6 : undefined,
      lockOnOff: isText ? false : undefined,
      typeMode: isText ? 'hold' : undefined,
      typeRepeat: isText ? false : undefined,
      visible: true
    }, initialProps);

    let created = null;
    if (window.EngineBridge && typeof window.EngineBridge.createLiteEffect === 'function' && window.EngineBridge.isReady()) {
      created = window.EngineBridge.createLiteEffect(payload);
    }
    if (!created) {
      this.counter += 1;
      created = Object.assign({ id: String(this.counter) }, payload);
    } else {
      created = Object.assign({}, payload, created);
      const idNum = parseInt(String(created.id), 10);
      if (!isNaN(idNum) && idNum > this.counter) this.counter = idNum;
    }
    created = this._migrateLiteEffect(created);

    const idx = this.list.findIndex((l) => String(l.id) === String(created.id));
    if (idx >= 0) this.list[idx] = created;
    else this.list.push(created);

    if (window.LayerManager) {
      if (typeof window.LayerManager.syncFromEngine === 'function' && window.EngineBridge && window.EngineBridge.isReady()) {
        window.LayerManager.syncFromEngine();
      } else if (typeof window.LayerManager.addEntry === 'function') {
        window.LayerManager.addEntry('lite', created.id);
      }
    }
    if (window.AppCoordinator && typeof window.AppCoordinator.emit === 'function') {
      window.AppCoordinator.emit('layers:changed');
    }

    return created;
  },

  updateLiteEffect(id, patch = {}) {
    const existing = this.getLiteEffect(id);
    if (!existing) return null;

    const normPatch = Object.assign({}, patch);
    if (normPatch.durationMs !== undefined) {
      const ms = Math.max(10, Math.min(1500, Number(normPatch.durationMs) || 100));
      normPatch.dur = ms / 1000;
      normPatch.duration = ms / 1000;
    }

    let updated = null;
    if (window.EngineBridge && typeof window.EngineBridge.updateLiteEffect === 'function' && window.EngineBridge.isReady()) {
      updated = window.EngineBridge.updateLiteEffect(id, normPatch);
    }
    if (!updated) {
      updated = Object.assign({}, existing, normPatch);
    } else {
      updated = Object.assign({}, existing, normPatch, updated);
      if (normPatch.delay !== undefined) {
        updated.delay = Number(normPatch.delay) || 0;
      }
      if (normPatch.endDelay !== undefined) {
        updated.endDelay = Number(normPatch.endDelay) || 0;
      }
    }
    updated = this._migrateLiteEffect(updated);
    const idx = this.list.findIndex((l) => String(l.id) === String(id));
    if (idx >= 0) this.list[idx] = updated;
    return updated;
  },

  deleteLiteEffect(id) {
    const sid = String(id);
    if (window.EngineBridge && typeof window.EngineBridge.deleteLiteEffect === 'function' && window.EngineBridge.isReady()) {
      window.EngineBridge.deleteLiteEffect(sid);
    }
    this.list = this.list.filter((l) => String(l.id) !== sid);
    if (String(this.activeId) === sid) this.activeId = null;
    if (window.LayerManager && typeof window.LayerManager.removeEntry === 'function') {
      window.LayerManager.removeEntry('lite', sid);
    }
    if (window.AppCoordinator && typeof window.AppCoordinator.emit === 'function') {
      window.AppCoordinator.emit('layers:changed');
    }
    return true;
  },

  getState() {
    return {
      liteEffects: this.list.map((l) => Object.assign({}, l)),
      liteEffectsCounter: this.counter
    };
  },

  setState(data) {
    if (!data) return;
    const arr = Array.isArray(data.liteEffects) ? data.liteEffects : (Array.isArray(data) ? data : []);
    this.list = arr.map((l) => this._migrateLiteEffect(l));
    this.counter = data.liteEffectsCounter || this.list.reduce((m, l) => Math.max(m, parseInt(String(l.id), 10) || 0), 0);
    this.activeId = null;
    this.renderList();
    this.syncEditorUI(null);
  },

  getLiteDefs() {
    if (this.list.length === 0) return '';
    return `<style>
@keyframes sva-lite-trace-cw {
  from { stroke-dashoffset: var(--sva-start-offset, 0px); }
  to { stroke-dashoffset: calc(var(--sva-start-offset, 0px) - 1000px); }
}
@keyframes sva-lite-trace-ccw {
  from { stroke-dashoffset: var(--sva-start-offset, 0px); }
  to { stroke-dashoffset: calc(var(--sva-start-offset, 0px) + 1000px); }
}
@keyframes sva-lite-pulse {
  0%, 100% { transform: scale(var(--sva-pulse-min, 0.85)); opacity: calc(1 - var(--sva-pulse-amp, 0.55)); }
  50% { transform: scale(var(--sva-pulse-max, 1.15)); opacity: 1; }
}
@keyframes sva-lite-flash {
  0% { opacity: 0; transform: scale(0.85); }
  25% { opacity: var(--sva-flash-int, 0.75); transform: scale(1.08); }
  100% { opacity: 0; transform: scale(1.0); }
}
@keyframes sva-lite-radar {
  0% { transform: scale(var(--sva-radar-min, 0.15)); opacity: 1; }
  85% { opacity: 0.35; }
  100% { transform: scale(var(--sva-radar-max, 1.0)); opacity: 0; }
}
@keyframes sva-lite-radar-delayed {
  0% { transform: scale(var(--sva-radar-min, 0.15)); opacity: 0; }
  1% { transform: scale(var(--sva-radar-min, 0.15)); opacity: 1; }
  85% { opacity: 0.35; }
  100% { transform: scale(var(--sva-radar-max, 1.0)); opacity: 0; }
}
@keyframes sva-lite-osc-scroll {
  0% { transform: translateX(0px); }
  100% { transform: translateX(var(--sva-osc-shift, -180px)); }
}
@keyframes sva-lite-text-ticker-h {
  0% { transform: translate(var(--sva-ticker-start, 220px), 0px); }
  100% { transform: translate(var(--sva-ticker-end, -180px), 0px); }
}
@keyframes sva-lite-text-ticker-v {
  0% { transform: translate(0px, var(--sva-ticker-start, 56px)); }
  100% { transform: translate(0px, var(--sva-ticker-end, -36px)); }
}
@keyframes sva-lite-text-fade {
  0%, 100% { opacity: 0; }
  45%, 65% { opacity: 1; }
}
@keyframes sva-lite-text-flash {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
@keyframes sva-lite-text-slide {
  0% { transform: translate(0px, var(--sva-slide-in, 38px)); opacity: 0; }
  20%, 75% { transform: translate(0px, 0px); opacity: 1; }
  100% { transform: translate(0px, var(--sva-slide-out, -38px)); opacity: 0; }
}
@keyframes sva-lite-text-slide-pp {
  0%, 100% { transform: translate(0px, var(--sva-slide-in, 38px)); opacity: 0; }
  25%, 75% { transform: translate(0px, 0px); opacity: 1; }
}
@keyframes sva-lite-text-slide-once {
  0% { transform: translate(0px, var(--sva-slide-in, 38px)); opacity: 0; }
  35%, 100% { transform: translate(0px, 0px); opacity: 1; }
}
.sva-lite-text-ticker-h-anim {
  animation-name: sva-lite-text-ticker-h;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform;
}
.sva-lite-text-ticker-v-anim {
  animation-name: sva-lite-text-ticker-v;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform;
}
.sva-lite-text-fade-anim {
  animation-name: sva-lite-text-fade;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  will-change: opacity;
}
.sva-lite-text-flash-anim {
  animation-name: sva-lite-text-flash;
  animation-timing-function: steps(2, end);
  animation-iteration-count: infinite;
  will-change: opacity;
}
.sva-lite-text-slide-anim {
  animation-name: sva-lite-text-slide;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  will-change: transform, opacity;
}
.sva-lite-osc-anim {
  animation-name: sva-lite-osc-scroll;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform;
}
.sva-lite-tracer-anim {
  animation-timing-function: linear;
}
.sva-lite-trace-cw { animation-name: sva-lite-trace-cw; }
.sva-lite-trace-ccw { animation-name: sva-lite-trace-ccw; }
.sva-lite-mode-loop { animation-iteration-count: infinite; animation-direction: normal; }
.sva-lite-mode-pingpong { animation-iteration-count: infinite; animation-direction: alternate; }
.sva-lite-mode-once { animation-iteration-count: 1; animation-direction: normal; animation-fill-mode: forwards; }
.sva-lite-pulse-anim {
  transform-box: fill-box;
  transform-origin: center;
  will-change: transform, opacity;
  animation-name: sva-lite-pulse;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}
.sva-lite-flash-anim {
  transform-box: fill-box;
  transform-origin: center;
  will-change: transform, opacity;
  animation-name: sva-lite-flash;
  animation-timing-function: ease-out;
  animation-fill-mode: both;
}
.sva-lite-radar-anim {
  transform-box: fill-box;
  transform-origin: center;
  will-change: transform, opacity;
  animation-name: sva-lite-radar;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
[data-sva-widget-instance] .lite-editor-marker {
  display: none !important;
}
@media (prefers-reduced-motion: reduce) {
  .sva-lite-tracer-anim, .sva-lite-pulse-anim, .sva-lite-flash-anim, .sva-lite-radar-anim {
    animation: none !important;
  }
}
</style>`;
  },

  _resolveGeometry(le) {
    let cx = Number(le.x) || 240;
    let cy = Number(le.y) || 180;
    const isTracer = le.kind === 'perimeter-tracer';
    const defDim = isTracer ? 140 : ((Number(le.radius) || 28) * 2);
    let w = Math.max(5, Number(le.width) || defDim);
    let h = Math.max(5, Number(le.height) || (isTracer ? 80 : defDim));
    if (isTracer && le.variant === 'circle') {
      h = w;
    }
    let cr = Math.max(0, Number(le.cornerRadius != null ? le.cornerRadius : 10));

    if (le.targetId && window.DiagramNodes && typeof window.DiagramNodes.getNode === 'function') {
      const cleanNodeId = String(le.targetId).replace(/^node-/, '');
      const node = window.DiagramNodes.getNode(cleanNodeId);
      if (node) {
        w = Number(node.width) || w;
        h = Number(node.height) || h;
        const cw = (window.Stage && window.Stage.canvasWidth) || 1280;
        const ch = (window.Stage && window.Stage.canvasHeight) || 720;
        cx = ((Number(node.x) || 50) / 100) * cw;
        cy = ((Number(node.y) || 50) / 100) * ch;
      }
    }
    const rx = w / 2;
    const ry = h / 2;
    const r = Math.min(rx, ry);
    const rot = Number(le.rotation) || 0;
    return { cx, cy, x: cx - rx, y: cy - ry, w, h, rx, ry, r, cr, rot };
  },

  getBoundingBox(le) {
    if (!le) return { cx: 0, cy: 0, x: 0, y: 0, width: 0, height: 0 };
    if (le.kind === 'flow-lite') {
      const geom = this._computeFlowLiteGeometry(le);
      return {
        cx: geom.minX + geom.width / 2,
        cy: geom.minY + geom.height / 2,
        x: geom.minX,
        y: geom.minY,
        width: Math.max(12, geom.width),
        height: Math.max(12, geom.height)
      };
    }
    const g = this._resolveGeometry(le);
    return {
      cx: g.cx,
      cy: g.cy,
      x: g.x,
      y: g.y,
      width: g.w,
      height: g.h
    };
  },

  _computeFlowLiteGeometry(le, leadIn = 0, leadOut = 0) {
    const cw = (window.Stage && window.Stage.canvasWidth) || 1280;
    const ch = (window.Stage && window.Stage.canvasHeight) || 720;
    const rawPts = (Array.isArray(le.points) && le.points.length >= 2)
      ? le.points
      : [{ x: 25, y: 50 }, { x: 75, y: 50 }];
    const pts = rawPts.map((p) => ({
      x: ((Number(p.x) || 0) / 100) * cw,
      y: ((Number(p.y) || 0) / 100) * ch
    }));
    const bends = Array.isArray(le.bends) ? le.bends : [];
    const globalCurv = Number(le.curvature) || 0;

    const sections = [];
    let totalLen = 0;
    let minX = pts[0].x;
    let maxX = pts[0].x;
    let minY = pts[0].y;
    let maxY = pts[0].y;

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const rawB = Number(bends[i]) || 0;
      const effBend = Math.max(-100, Math.min(100, rawB + globalCurv));
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);
      let ctrl = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      let curved = false;
      let secLen = dist;

      if (Math.abs(effBend) >= 0.01 && dist > 1e-4) {
        curved = true;
        const nx = -dy / dist;
        const ny = dx / dist;
        const offset = dist * (effBend / 100) * 0.5;
        ctrl = {
          x: (p1.x + p2.x) / 2 + nx * offset,
          y: (p1.y + p2.y) / 2 + ny * offset
        };
        secLen = 0;
        let prev = p1;
        const steps = 24;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const u = 1 - t;
          const cur = {
            x: u * u * p1.x + 2 * u * t * ctrl.x + t * t * p2.x,
            y: u * u * p1.y + 2 * u * t * ctrl.y + t * t * p2.y
          };
          secLen += Math.hypot(cur.x - prev.x, cur.y - prev.y);
          if (cur.x < minX) minX = cur.x;
          if (cur.x > maxX) maxX = cur.x;
          if (cur.y < minY) minY = cur.y;
          if (cur.y > maxY) maxY = cur.y;
          prev = cur;
        }
      } else {
        if (p2.x < minX) minX = p2.x;
        if (p2.x > maxX) maxX = p2.x;
        if (p2.y < minY) minY = p2.y;
        if (p2.y > maxY) maxY = p2.y;
      }
      sections.push({ p1, p2, ctrl, curved, length: secLen });
      totalLen += secLen;
    }

    // Start tangent t0 and end tangent tL
    let t0 = { x: 1, y: 0 };
    if (sections.length > 0) {
      const s0 = sections[0];
      const vx = s0.curved ? (s0.ctrl.x - s0.p1.x) : (s0.p2.x - s0.p1.x);
      const vy = s0.curved ? (s0.ctrl.y - s0.p1.y) : (s0.p2.y - s0.p1.y);
      const m = Math.hypot(vx, vy) || 1;
      t0 = { x: vx / m, y: vy / m };
    }
    let tL = { x: 1, y: 0 };
    if (sections.length > 0) {
      const sLast = sections[sections.length - 1];
      const vx = sLast.curved ? (sLast.p2.x - sLast.ctrl.x) : (sLast.p2.x - sLast.p1.x);
      const vy = sLast.curved ? (sLast.p2.y - sLast.ctrl.y) : (sLast.p2.y - sLast.p1.y);
      const m = Math.hypot(vx, vy) || 1;
      tL = { x: vx / m, y: vy / m };
    }

    const p0 = pts[0];
    const pLast = pts[pts.length - 1];
    const parts = [];
    if (leadIn > 0) {
      const pre = { x: p0.x - t0.x * leadIn, y: p0.y - t0.y * leadIn };
      parts.push(`M ${pre.x.toFixed(2)} ${pre.y.toFixed(2)} L ${p0.x.toFixed(2)} ${p0.y.toFixed(2)}`);
    } else {
      parts.push(`M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)}`);
    }
    for (const sec of sections) {
      if (sec.curved) {
        parts.push(`Q ${sec.ctrl.x.toFixed(2)} ${sec.ctrl.y.toFixed(2)} ${sec.p2.x.toFixed(2)} ${sec.p2.y.toFixed(2)}`);
      } else {
        parts.push(`L ${sec.p2.x.toFixed(2)} ${sec.p2.y.toFixed(2)}`);
      }
    }
    if (leadOut > 0) {
      const post = { x: pLast.x + tL.x * leadOut, y: pLast.y + tL.y * leadOut };
      parts.push(`L ${post.x.toFixed(2)} ${post.y.toFixed(2)}`);
    }

    return {
      pathD: parts.join(' '),
      totalLen: Math.max(1, totalLen),
      p0,
      pLast,
      t0,
      tL,
      pts,
      sections,
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  },

  _buildFlowLiteOverhangMaskD(pt, tang, r, isStart) {
    const dir = isStart ? -1 : 1;
    const ux = tang.x * dir;
    const uy = tang.y * dir;
    const nx = -tang.y;
    const ny = tang.x;
    const h = r * 2.5;
    const d = r * 2.5;
    const c1 = { x: pt.x + nx * h, y: pt.y + ny * h };
    const c2 = { x: pt.x + nx * h + ux * d, y: pt.y + ny * h + uy * d };
    const c3 = { x: pt.x - nx * h + ux * d, y: pt.y - ny * h + uy * d };
    const c4 = { x: pt.x - nx * h, y: pt.y - ny * h };
    return `M ${c1.x.toFixed(2)} ${c1.y.toFixed(2)} L ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} L ${c3.x.toFixed(2)} ${c3.y.toFixed(2)} L ${c4.x.toFixed(2)} ${c4.y.toFixed(2)} Z`;
  },

  buildFlowLiteContent(le, idPrefix = '') {
    const color = this.sanitizeColor(le.color, '#38bdf8');
    const variant = le.variant || 'dashed';
    const startMode = le.startMode === 'abrupt' ? 'abrupt' : 'tunnel';
    const endMode = le.endMode === 'abrupt' ? 'abrupt' : 'tunnel';
    const dir = le.direction === 'reverse' ? 'reverse' : 'forward';
    const mode = le.playbackMode === 'pingpong' ? 'pingpong' : (le.playbackMode === 'once' ? 'once' : 'loop');
    const transitDur = Math.max(0.2, Math.min(30.0, Number(le.speed) || 2.0));
    const startDelay = Math.max(0, Math.min(60, Number(le.delay) || 0));
    const endDelay = Math.max(0, Math.min(60, Number(le.endDelay) || 0));

    let dashLen = Math.max(2, Number(le.dashLength) || (variant === 'single' ? 36 : 18));
    let gapLen = Math.max(2, Number(le.gapLength) || 14);
    let sw = Math.max(0.5, Number(le.strokeWidth) || 3.0);
    let linecap = le.segmentStyle === 'solid' ? 'butt' : 'round';
    let leadR = 0;

    if (variant === 'dotted') {
      const dotDia = Math.max(1, Number(le.dotSize) || 5.0);
      sw = dotDia;
      dashLen = 0.2;
      linecap = 'round';
      leadR = dotDia / 2.0;
    } else if (linecap === 'round') {
      leadR = sw / 2.0;
    }

    const baseGeom = this._computeFlowLiteGeometry(le, 0, 0);
    const extGeom = leadR > 0 ? this._computeFlowLiteGeometry(le, leadR, leadR) : baseGeom;
    const L = baseGeom.totalLen;
    const visLen = variant === 'dotted' ? sw : dashLen;
    const period = variant === 'single' ? (L + visLen * 2) : (visLen + gapLen);

    let offStart, offEnd;
    if (dir === 'forward') {
      offStart = startMode === 'tunnel' ? dashLen : -(2 * leadR);
      offEnd = endMode === 'tunnel' ? -(L + 2 * leadR) : -(L - dashLen);
    } else {
      offStart = endMode === 'tunnel' ? -(L + 2 * leadR) : -(L - dashLen);
      offEnd = startMode === 'tunnel' ? dashLen : -(2 * leadR);
    }

    const activeDist = Math.max(1, Math.abs(offEnd - offStart));
    const M = variant === 'single' ? 1 : (Math.ceil(activeDist / period) + 1);
    const totalCycleDist = M === 1 ? activeDist : (M * period);
    const moveDur = M === 1 ? transitDur : (transitDur * (totalCycleDist / activeDist));
    const activeRatio = Math.min(0.999, activeDist / totalCycleDist);

    const trackId = `${idPrefix}lite-flow-track-${le.id}`;
    const clipId = `${idPrefix}lite-flow-clip-${le.id}`;
    const kfName = `${idPrefix}sva-fl-kf-${le.id}`;

    let maskHoles = '';
    if (leadR > 0) {
      if (startMode === 'tunnel') {
        maskHoles += ' ' + this._buildFlowLiteOverhangMaskD(baseGeom.p0, baseGeom.t0, leadR, true);
      }
      if (endMode === 'tunnel') {
        maskHoles += ' ' + this._buildFlowLiteOverhangMaskD(baseGeom.pLast, baseGeom.tL, leadR, false);
      }
    }

    const clearGap = L + totalCycleDist + 500;
    let totalDur = moveDur;
    let kfCss = '';

    if (mode === 'pingpong' && M === 1) {
      // Explicit forward + endDelay + reverse + startDelay cycle
      totalDur = startDelay + moveDur + endDelay + moveDur;
      const p1 = ((startDelay / totalDur) * 100).toFixed(3);
      const p2 = (((startDelay + moveDur) / totalDur) * 100).toFixed(3);
      const p3 = (((startDelay + moveDur + endDelay) / totalDur) * 100).toFixed(3);
      kfCss = `@keyframes ${kfName} {
  0%, ${p1}% { stroke-dashoffset: ${offStart.toFixed(2)}px; opacity: 1; }
  ${p2}%, ${p3}% { stroke-dashoffset: ${offEnd.toFixed(2)}px; opacity: 1; }
  100% { stroke-dashoffset: ${offStart.toFixed(2)}px; opacity: 1; }
}`;
    } else if (M === 1 && (startDelay > 0 || endDelay > 0)) {
      totalDur = startDelay + moveDur + endDelay;
      const pStart = ((startDelay / totalDur) * 100).toFixed(3);
      const pEnd = (((startDelay + moveDur) / totalDur) * 100).toFixed(3);
      const startHoldOp = startDelay > 0 && ((dir === 'forward' && startMode === 'abrupt') || (dir === 'reverse' && endMode === 'abrupt')) ? 0 : 1;
      const endHoldOp = endDelay > 0 && ((dir === 'forward' && endMode === 'abrupt') || (dir === 'reverse' && startMode === 'abrupt')) ? 0 : 1;
      kfCss = `@keyframes ${kfName} {
  0% { stroke-dashoffset: ${offStart.toFixed(2)}px; opacity: ${startHoldOp}; }
  ${pStart}% { stroke-dashoffset: ${offStart.toFixed(2)}px; opacity: 1; }
  ${pEnd}% { stroke-dashoffset: ${offEnd.toFixed(2)}px; opacity: 1; }
  ${(Math.min(99.999, parseFloat(pEnd) + 0.01)).toFixed(3)}%, 100% { stroke-dashoffset: ${offEnd.toFixed(2)}px; opacity: ${endHoldOp}; }
}`;
    } else {
      const pctActive = (activeRatio * 100).toFixed(3);
      const pctHide = (Math.min(99.999, activeRatio * 100 + 0.01)).toFixed(3);
      kfCss = `@keyframes ${kfName} {
  0% { stroke-dashoffset: ${offStart.toFixed(2)}px; opacity: 1; }
  ${pctActive}% { stroke-dashoffset: ${offEnd.toFixed(2)}px; opacity: 1; }
  ${pctHide}%, 100% { stroke-dashoffset: ${offEnd.toFixed(2)}px; opacity: 0; }
}`;
    }

    const iterCss = mode === 'once' ? '1' : 'infinite';
    const dirCss = (mode === 'pingpong' && M > 1) ? 'alternate' : 'normal';
    const fillCss = mode === 'once' ? 'forwards' : 'none';
    const hasCyclePause = M > 1 && mode !== 'once' && (startDelay + endDelay) > 0;
    const pauseSec = hasCyclePause ? (startDelay + endDelay) : 0;

    const uses = [];
    for (let k = 0; k < M; k++) {
      const phaseDelay = -(k / M) * totalDur;
      const burstAttrs = hasCyclePause
        ? ` data-burst-cycles="1" data-pause-seconds="${pauseSec.toFixed(3)}" data-pause-visibility="hide" data-flow-start-delay="${startDelay.toFixed(3)}" data-flow-end-delay="${endDelay.toFixed(3)}"`
        : '';
      const styleStr = `animation-name:${kfName};animation-duration:${totalDur.toFixed(4)}s;animation-timing-function:linear;animation-delay:${phaseDelay.toFixed(4)}s;animation-iteration-count:${iterCss};animation-direction:${dirCss};animation-fill-mode:${fillCss};--sva-base-dur:${totalDur.toFixed(4)}s;--sva-phase-ratio:${(k / M).toFixed(6)};`;
      uses.push(`<use href="#${trackId}" class="lite-payload lite-flow-seg" data-semantic-role="payload" data-seg-index="${k}" data-seg-count="${M}"${burstAttrs} fill="none" stroke="${color}" stroke-width="${sw.toFixed(2)}" stroke-linecap="${linecap}" stroke-dasharray="${dashLen.toFixed(2)} ${clearGap.toFixed(2)}" shape-rendering="geometricPrecision" style="${styleStr}" pointer-events="none" />`);
    }

    const guideAttrs = `class="lite-guide-track" fill="none" stroke="${color}" stroke-width="${Math.max(1, sw * 0.45).toFixed(2)}" stroke-opacity="0.20" shape-rendering="geometricPrecision" pointer-events="none"`;
    const editorGuideAttrs = `fill="none" stroke="${color}" stroke-width="1" stroke-opacity="0.25" stroke-dasharray="4 4" pointer-events="none"`;
    const guideMarkup = le.showGuide !== false
      ? `<path d="${baseGeom.pathD}" ${guideAttrs} />`
      : `<g class="lite-editor-marker" data-editor-only="true"><path d="${baseGeom.pathD}" ${editorGuideAttrs} /></g>`;
    const hitMarkup = `<path d="${baseGeom.pathD}" class="lite-hit-target" data-semantic-role="hit-target" fill="none" stroke="transparent" stroke-width="${Math.max(18, sw + 14).toFixed(2)}" pointer-events="stroke" style="cursor:pointer;" />`;
    const clipAttr = maskHoles ? ` clip-path="url(#${clipId})"` : '';
    const clipDef = maskHoles ? `<clipPath id="${clipId}"><path clip-rule="evenodd" d="M -2000 -2000 H 5000 V 5000 H -2000 Z${maskHoles}" /></clipPath>` : '';

    return {
      innerMarkup: `<defs><path id="${trackId}" d="${extGeom.pathD}" />${clipDef}</defs><style>${kfCss}</style>${hitMarkup}${guideMarkup}<g class="lite-flow-stream"${clipAttr}>${uses.join('')}</g>`,
      dataAttrs: `data-flow-variant="${this.escapeXML(variant)}" data-flow-start-mode="${startMode}" data-flow-end-mode="${endMode}" data-flow-direction="${dir}" data-flow-playback-mode="${mode}" data-flow-dash-length="${dashLen}" data-flow-gap-length="${gapLen}" data-flow-dot-size="${le.dotSize || 5}" data-flow-stroke-width="${sw}" data-flow-cap-style="${le.segmentStyle || 'rounded'}" data-flow-speed="${transitDur}" data-flow-delay="${startDelay}" data-flow-end-delay="${endDelay}" data-flow-length="${L.toFixed(2)}" data-flow-lead-r="${leadR.toFixed(2)}" data-flow-seg-count="${M}" data-flow-off-start="${offStart.toFixed(2)}" data-flow-off-end="${offEnd.toFixed(2)}" data-flow-active-dist="${activeDist.toFixed(2)}" data-flow-period="${period.toFixed(2)}"`
    };
  },

  _buildShapeGeometry(variant, cx, cy, w, h, extraAttrs, armThickness = 3) {
    const rx = w / 2;
    const ry = h / 2;
    if (variant === 'square' || variant === 'rect') {
      return `<rect x="${(cx - rx).toFixed(2)}" y="${(cy - ry).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="3" shape-rendering="geometricPrecision" ${extraAttrs} />`;
    }
    if (variant === 'diamond') {
      const pts = `${cx.toFixed(2)},${(cy - ry).toFixed(2)} ${(cx + rx).toFixed(2)},${cy.toFixed(2)} ${cx.toFixed(2)},${(cy + ry).toFixed(2)} ${(cx - rx).toFixed(2)},${cy.toFixed(2)}`;
      return `<polygon points="${pts}" shape-rendering="geometricPrecision" ${extraAttrs} />`;
    }
    if (variant === 'cross') {
      const halfArm = Math.max(0.5, Math.min(rx * 0.9, ry * 0.9, (Number(armThickness) || 3) / 2));
      const d = `M ${(cx - halfArm).toFixed(2)},${(cy - ry).toFixed(2)} L ${(cx + halfArm).toFixed(2)},${(cy - ry).toFixed(2)} L ${(cx + halfArm).toFixed(2)},${(cy - halfArm).toFixed(2)} L ${(cx + rx).toFixed(2)},${(cy - halfArm).toFixed(2)} L ${(cx + rx).toFixed(2)},${(cy + halfArm).toFixed(2)} L ${(cx + halfArm).toFixed(2)},${(cy + halfArm).toFixed(2)} L ${(cx + halfArm).toFixed(2)},${(cy + ry).toFixed(2)} L ${(cx - halfArm).toFixed(2)},${(cy + ry).toFixed(2)} L ${(cx - halfArm).toFixed(2)},${(cy + halfArm).toFixed(2)} L ${(cx - rx).toFixed(2)},${(cy + halfArm).toFixed(2)} L ${(cx - rx).toFixed(2)},${(cy - halfArm).toFixed(2)} L ${(cx - halfArm).toFixed(2)},${(cy - halfArm).toFixed(2)} Z`;
      return `<path d="${d}" shape-rendering="geometricPrecision" ${extraAttrs} />`;
    }
    if (variant === 'star') {
      const pts = [];
      const waist = Math.max(0.5, Math.min(rx * 0.45, ry * 0.45, (Number(armThickness) || 3) * 0.65));
      for (let i = 0; i < 8; i++) {
        const ang = (Math.PI / 4) * i - Math.PI / 2;
        const radX = i % 2 === 0 ? rx : waist;
        const radY = i % 2 === 0 ? ry : waist;
        pts.push(`${(cx + Math.cos(ang) * radX).toFixed(2)},${(cy + Math.sin(ang) * radY).toFixed(2)}`);
      }
      return `<polygon points="${pts.join(' ')}" shape-rendering="geometricPrecision" ${extraAttrs} />`;
    }
    return `<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" shape-rendering="geometricPrecision" ${extraAttrs} />`;
  },

  renderLiteElement(le, opts = {}) {
    if (!le) return '';
    const isHidden = le.visible === false;
    if (isHidden && (!opts || !opts.includeHidden)) return '';
    const color = this.sanitizeColor(le.color, '#38bdf8');
    const opacity = le.opacity != null ? Math.max(0, Math.min(1, Number(le.opacity))) : 0.9;
    const sw = Number(le.strokeWidth) || 2.5;
    const { cx, cy, x, y, w, h, rx, ry, cr, rot } = this._resolveGeometry(le);
    const nameAttr = le.name ? ` data-semantic-name="${this.escapeXML(le.name)}"` : '';
    const playAttr = le.play === false ? ' data-lite-play="false" data-play-animation="false"' : '';
    const visAttr = isHidden ? ' visibility="hidden" data-lite-visible="false"' : '';
    const visStyle = isHidden ? 'visibility:hidden;' : '';
    const rotAttr = (rot && Math.abs(rot) > 0.001) ? ` transform="rotate(${Number(rot.toFixed(2))}, ${cx.toFixed(2)}, ${cy.toFixed(2)})"` : '';
    const startDelay = Math.max(0, Math.min(60, Number(le.delay) || 0));
    const delayAttr = startDelay > 0 ? ` data-lite-delay="${Number(startDelay.toFixed(3))}"` : '';
    const baseAttrs = `id="lite-${le.id}" class="diagram-lite-instance" data-lite-id="${le.id}" data-lite-kind="${this.escapeXML(le.kind)}" data-semantic-target="lite-${le.id}"${nameAttr}${playAttr}${delayAttr}${visAttr}${rotAttr}`;

    if (le.kind === 'perimeter-tracer') {
      const segs = Math.max(1, Math.min(16, Number(le.segments) || 2));
      const dashInfo = (window.EngineBridge && typeof window.EngineBridge.computePerimeterDash === 'function')
        ? window.EngineBridge.computePerimeterDash(segs, le.lineGapRatio || '1:3')
        : { dashLen: 125, gapLen: 375 };

      let dashArray = `${dashInfo.dashLen} ${dashInfo.gapLen}`;
      if (le.segmentStyle === 'dashed' && dashInfo.dashLen > 12) {
        const subDash = Math.max(4, Math.round(dashInfo.dashLen / 4));
        const subGap = Math.max(3, Math.round(subDash * 0.5));
        const count = Math.max(1, Math.floor(dashInfo.dashLen / (subDash + subGap)));
        const used = count * (subDash + subGap) - subGap;
        const remGap = Math.max(1, dashInfo.gapLen + (dashInfo.dashLen - used));
        const parts = [];
        for (let i = 0; i < count; i++) {
          parts.push(String(subDash));
          parts.push(i === count - 1 ? remGap.toFixed(2) : String(subGap));
        }
        dashArray = parts.join(' ');
      }

      const linecap = le.segmentStyle === 'rounded' ? 'round' : 'butt';
      const dur = Math.max(0.2, Number(le.speed) || 3.0);
      const dir = le.direction === 'ccw' ? 'ccw' : 'cw';
      const traceClass = `sva-lite-trace-${dir}`;
      const mode = le.playbackMode === 'pingpong' ? 'pingpong' : (le.playbackMode === 'once' ? 'once' : 'loop');
      const modeClass = `sva-lite-mode-${mode}`;
      const startOffsetUnits = -((Number(le.startOffset) || 0) / 100) * 1000;
      const burstCycles = Math.max(0, Math.round(Number(le.burstCycles) || 0));
      const pauseSeconds = Math.max(0, Number(le.pauseSeconds) || 0);
      const pauseVisibility = le.pauseVisibility === 'hold' ? 'hold' : 'hide';
      const hasBurst = mode !== 'once' && burstCycles > 0 && pauseSeconds > 0;
      const iterCss = mode === 'once' ? '1' : (hasBurst ? String(burstCycles) : 'infinite');
      const dirCss = mode === 'pingpong' ? 'alternate' : 'normal';
      const fillCss = startDelay > 0 ? 'both' : ((mode === 'once' || hasBurst) ? 'forwards' : 'none');
      const delayCss = startDelay > 0 ? `animation-delay:${startDelay.toFixed(4)}s;` : '';
      const styleStr = `animation-name:${traceClass};animation-duration:${dur}s;${delayCss}animation-iteration-count:${iterCss};animation-direction:${dirCss};animation-fill-mode:${fillCss};--sva-base-dur:${dur}s;--sva-start-offset:${startOffsetUnits}px;`;

      let shapeMarkup = '';
      let guideMarkup = '';
      let hitMarkup = '';
      const variant = le.variant || 'rounded';
      const burstStartDelayAttr = startDelay > 0 ? ` data-flow-start-delay="${startDelay.toFixed(3)}"` : '';
      const burstAttrs = hasBurst ? ` data-burst-cycles="${burstCycles}" data-pause-seconds="${pauseSeconds}" data-pause-visibility="${pauseVisibility}"${burstStartDelayAttr}` : '';
      const payloadAttrs = `class="lite-payload sva-lite-tracer-anim ${traceClass} ${modeClass}" data-semantic-role="payload" data-direction="${dir}" data-playback-mode="${mode}"${burstAttrs} pathLength="1000" fill="none" stroke="${color}" stroke-width="${sw}" stroke-dasharray="${dashArray}" stroke-linecap="${linecap}" shape-rendering="geometricPrecision" style="${styleStr}" pointer-events="none"`;
      const hitAttrs = `class="lite-hit-target" data-semantic-role="hit-target" fill="transparent" stroke="transparent" stroke-width="${Math.max(16, sw + 12)}" pointer-events="stroke" style="cursor:pointer;"`;
      const guideAttrs = `class="lite-guide-track" fill="none" stroke="${color}" stroke-width="${Math.max(1, sw * 0.55).toFixed(2)}" stroke-opacity="0.22" shape-rendering="geometricPrecision" pointer-events="none"`;
      const editorGuideAttrs = `fill="none" stroke="${color}" stroke-width="1" stroke-opacity="0.25" stroke-dasharray="4 4" pointer-events="none"`;

      if (variant === 'circle' || variant === 'ellipse') {
        const erx = variant === 'circle' ? Math.max(2.5, rx) : rx;
        const ery = variant === 'circle' ? Math.max(2.5, rx) : ry;
        shapeMarkup = `<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${erx.toFixed(2)}" ry="${ery.toFixed(2)}" ${payloadAttrs} />`;
        hitMarkup = `<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${erx.toFixed(2)}" ry="${ery.toFixed(2)}" ${hitAttrs} />`;
        guideMarkup = le.showGuide !== false
          ? `<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${erx.toFixed(2)}" ry="${ery.toFixed(2)}" ${guideAttrs} />`
          : `<g class="lite-editor-marker" data-editor-only="true"><ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${erx.toFixed(2)}" ry="${ery.toFixed(2)}" ${editorGuideAttrs} /></g>`;
      } else {
        const cornerR = variant === 'rounded' ? Math.min(cr, rx, ry) : 0;
        shapeMarkup = `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${cornerR}" ${payloadAttrs} />`;
        hitMarkup = `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${cornerR}" ${hitAttrs} />`;
        guideMarkup = le.showGuide !== false
          ? `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${cornerR}" ${guideAttrs} />`
          : `<g class="lite-editor-marker" data-editor-only="true"><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${cornerR}" ${editorGuideAttrs} /></g>`;
      }

      return `<g ${baseAttrs} style="${visStyle}opacity:${opacity};" data-lite-segments="${segs}" data-lite-ratio="${this.escapeXML(le.lineGapRatio || '1:3')}">${hitMarkup}${guideMarkup}${shapeMarkup}</g>`;
    }

    if (le.kind === 'pulse') {
      const period = Math.max(0.2, Number(le.period) || 1.8);
      const amp = Math.max(0.1, Math.min(1, Number(le.intensity) || 0.85));
      const minScale = Math.max(0.2, Math.min(2.0, Number(le.minScale) || 0.85));
      const maxScale = Math.max(minScale, Math.min(3.0, Number(le.maxScale) || 1.15));
      const armThickness = Math.max(1, Math.min(20, Number(le.armThickness) || 3));
      const variant = le.variant || 'circle';
      const isRing = variant === 'ring';
      const fillVal = isRing ? 'none' : color;
      const strokeVal = isRing ? color : 'none';
      const pulseDelayCss = startDelay > 0 ? `animation-delay:${startDelay.toFixed(4)}s;animation-fill-mode:both;` : '';
      const styleStr = `animation-duration:${period}s;${pulseDelayCss}--sva-base-dur:${period}s;--sva-pulse-amp:${amp};--sva-pulse-min:${minScale};--sva-pulse-max:${maxScale};`;
      const payloadAttrs = `class="lite-payload sva-lite-pulse-anim" data-semantic-role="payload" data-pulse-min="${minScale}" data-pulse-max="${maxScale}" fill="${fillVal}" stroke="${strokeVal}" stroke-width="${isRing ? sw : 0}" style="${styleStr}" pointer-events="none"`;
      const hitMarkup = `<rect class="lite-hit-target" data-semantic-role="hit-target" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="transparent" pointer-events="all" style="cursor:pointer;" />`;
      const shapeMarkup = this._buildShapeGeometry(variant, cx, cy, w, h, payloadAttrs, armThickness);
      return `<g ${baseAttrs} style="${visStyle}opacity:${opacity};">${hitMarkup}${shapeMarkup}</g>`;
    }

    if (le.kind === 'flash') {
      const dur = Math.max(0.02, Math.min(1.5, Number(le.dur) || 0.10));
      const durMs = Math.round(dur * 1000);
      const repeatInterval = Math.max(0.2, Math.min(60, Number(le.repeatInterval) || Number(le.period) || 2.0));
      const intensity = Math.max(0.1, Math.min(1, Number(le.intensity) || 0.75));
      const armThickness = Math.max(1, Math.min(20, Number(le.armThickness) || 3));
      const variant = le.variant || 'diamond';
      const hasRepeatSched = Boolean(le.repeat);
      const pauseSec = hasRepeatSched ? Math.max(0.05, repeatInterval - dur) : 0;
      const flashStartDelayAttr = startDelay > 0 ? ` data-flow-start-delay="${startDelay.toFixed(3)}"` : '';
      const schedAttrs = hasRepeatSched
        ? ` data-burst-cycles="1" data-pause-seconds="${pauseSec.toFixed(3)}" data-pause-visibility="hide" data-repeat-interval="${repeatInterval}"${flashStartDelayAttr}`
        : '';
      const flashDelayCss = startDelay > 0 ? `animation-delay:${startDelay.toFixed(4)}s;` : '';
      const styleStr = `animation-duration:${dur}s;${flashDelayCss}animation-iteration-count:1;--sva-base-dur:${dur}s;--sva-flash-int:${intensity};`;
      const payloadAttrs = `class="lite-payload lite-flash-anim sva-lite-flash-anim" data-semantic-role="payload" data-trigger-nonce="${le.triggerNonce || 0}" data-flash-duration-ms="${durMs}" data-repeat="${hasRepeatSched ? 'true' : 'false'}"${schedAttrs} fill="${color}" style="${styleStr}" pointer-events="none"`;
      const hitMarkup = `<rect class="lite-hit-target" data-semantic-role="hit-target" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="transparent" pointer-events="all" style="cursor:pointer;" />`;
      const markerAttrs = `fill="none" stroke="${color}" stroke-opacity="0.58" stroke-width="1.4" stroke-dasharray="4 3" pointer-events="none"`;
      const markerShape = this._buildShapeGeometry(variant, cx, cy, w, h, markerAttrs, armThickness);
      const markerCross = `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="3" fill="${color}" fill-opacity="0.75" pointer-events="none" />`;
      const editorMarker = `<g class="lite-editor-marker" data-editor-only="true" pointer-events="none">${markerShape}${markerCross}</g>`;
      const shapeMarkup = this._buildShapeGeometry(variant, cx, cy, w, h, payloadAttrs, armThickness);
      return `<g ${baseAttrs} style="${visStyle}opacity:${opacity};">${hitMarkup}${editorMarker}${shapeMarkup}</g>`;
    }

    if (le.kind === 'flow-lite') {
      const flowBuilt = this.buildFlowLiteContent(le);
      return `<g ${baseAttrs} ${flowBuilt.dataAttrs} style="${visStyle}opacity:${opacity};">${flowBuilt.innerMarkup}</g>`;
    }

    if (le.kind === 'radar-lite') {
      const variant = le.variant || 'multi';
      const ringCount = variant === 'single' ? 1 : Math.max(1, Math.min(6, Math.round(Number(le.rings) || 3)));
      const minScale = Math.max(0.05, Math.min(2.0, Number(le.minScale) || 0.15));
      const maxScale = Math.max(minScale + 0.05, Math.min(3.0, Number(le.maxScale) || 1.0));
      const period = Math.max(0.2, Math.min(30.0, Number(le.period) || Number(le.speed) || 2.4));
      const isFadingPing = variant === 'fading-ping';
      const fillVal = isFadingPing ? color : 'none';
      const fillOpAttr = isFadingPing ? ' fill-opacity="0.18"' : '';
      const hitMarkup = `<ellipse class="lite-hit-target" data-semantic-role="hit-target" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${Math.max(4, rx).toFixed(2)}" ry="${Math.max(4, ry).toFixed(2)}" fill="transparent" pointer-events="all" style="cursor:pointer;" />`;
      const rings = [];
      for (let k = 0; k < ringCount; k++) {
        const phaseRatio = k / ringCount;
        const phaseDelay = startDelay > 0 ? (startDelay + phaseRatio * period) : (-phaseRatio * period);
        const radarKfOverrides = startDelay > 0 ? 'animation-name:sva-lite-radar-delayed;animation-fill-mode:both;' : '';
        const styleStr = `${radarKfOverrides}animation-duration:${period.toFixed(4)}s;animation-delay:${phaseDelay.toFixed(4)}s;--sva-base-dur:${period.toFixed(4)}s;--sva-phase-ratio:${phaseRatio.toFixed(6)};--sva-radar-min:${minScale};--sva-radar-max:${maxScale};`;
        rings.push(`<ellipse class="lite-payload lite-radar-ring sva-lite-radar-anim" data-semantic-role="payload" data-ring-index="${k}" data-ring-count="${ringCount}" data-radar-min="${minScale}" data-radar-max="${maxScale}" data-radar-period="${period}" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${Math.max(2.5, rx).toFixed(2)}" ry="${Math.max(2.5, ry).toFixed(2)}" fill="${fillVal}"${fillOpAttr} stroke="${color}" stroke-width="${sw.toFixed(2)}" vector-effect="non-scaling-stroke" shape-rendering="geometricPrecision" style="${styleStr}" pointer-events="none" />`);
      }
      const dotR = Math.max(2.0, Math.min(6.0, Math.min(rx, ry) * 0.12));
      const showDot = le.showGuide !== false;
      const guideVis = showDot ? 'visible' : 'hidden';
      const centerDot = `<circle class="lite-guide-track lite-radar-center" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${dotR.toFixed(2)}" fill="${color}" visibility="${guideVis}" style="visibility:${guideVis};" pointer-events="none" />`;
      return `<g ${baseAttrs} data-radar-variant="${this.escapeXML(variant)}" data-radar-rings="${ringCount}" data-radar-min="${minScale}" data-radar-max="${maxScale}" data-radar-period="${period}" style="${visStyle}opacity:${opacity};">${hitMarkup}${rings.join('')}${centerDot}</g>`;
    }

    if (le.kind === 'gauge-lite') {
      const variant = ['ring', 'hbar', 'vbar', 'segmented', 'level'].includes(le.variant) ? le.variant : 'ring';
      const minV = (le.minValue !== undefined && le.minValue !== null && Number.isFinite(Number(le.minValue))) ? Number(le.minValue) : 0;
      let maxV = (le.maxValue !== undefined && le.maxValue !== null && Number.isFinite(Number(le.maxValue))) ? Number(le.maxValue) : 100;
      if (maxV <= minV) maxV = minV + 100;
      const val = (le.value !== undefined && le.value !== null && Number.isFinite(Number(le.value))) ? Number(le.value) : minV;
      const span = maxV - minV;
      const rawFrac = span > 0 ? (val - minV) / span : 0;
      const frac = Math.max(0, Math.min(1, rawFrac));
      const bgCol = this.sanitizeColor(le.bgColor, '#1e293b');
      const warnCol = this.sanitizeColor(le.warnColor, '#f59e0b');
      const critCol = this.sanitizeColor(le.critColor, '#ef4444');
      const warnT = (le.warnThreshold !== undefined && le.warnThreshold !== null && Number.isFinite(Number(le.warnThreshold))) ? Number(le.warnThreshold) : (minV + span * 0.70);
      const critT = (le.critThreshold !== undefined && le.critThreshold !== null && Number.isFinite(Number(le.critThreshold))) ? Number(le.critThreshold) : (minV + span * 0.90);
      const bands = (Array.isArray(le.thresholds) && le.thresholds.length === 4)
        ? le.thresholds
        : [
            { enabled: false, value: minV + span * 0.40, color: '#22c55e' },
            { enabled: false, value: minV + span * 0.60, color: '#eab308' },
            { enabled: Boolean(le.useThresholds), value: warnT, color: warnCol },
            { enabled: Boolean(le.useThresholds), value: critT, color: critCol }
          ];
      const enabledBands = bands
        .map((b, idx) => ({
          idx,
          enabled: Boolean(b && b.enabled),
          value: Number(b && b.value),
          color: this.sanitizeColor(b && b.color, '#f59e0b')
        }))
        .filter((b) => b.enabled && Number.isFinite(b.value))
        .sort((a, b) => (a.value !== b.value ? a.value - b.value : a.idx - b.idx));
      const useThresh = enabledBands.length > 0;
      const dir = (le.direction === 'reverse' || le.direction === 'ccw') ? 'reverse' : 'forward';

      let activeColor = color;
      for (const eb of enabledBands) {
        if (val >= eb.value) {
          activeColor = eb.color;
        }
      }

      const showReadout = le.showGuide !== false;
      const readoutVis = showReadout ? 'visible' : 'hidden';
      const unitStr = le.unit !== undefined && le.unit !== null ? String(le.unit) : '%';
      const labelStr = le.labelText !== undefined && le.labelText !== null ? String(le.labelText) : '';
      const formattedVal = Number.isInteger(val) ? String(val) : String(Math.round(val * 100) / 100);
      const displayStr = `${formattedVal}${unitStr}`;

      const hitMarkup = `<rect class="lite-hit-target" data-semantic-role="hit-target" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="transparent" pointer-events="all" style="cursor:pointer;" />`;
      let gaugeBody = '';
      let textMarkup = '';

      if (variant === 'ring') {
        const ringSw = Math.max(1, Math.min(Math.min(w, h) * 0.42, sw));
        const erx = Math.max(4, rx - ringSw / 2);
        const ery = Math.max(4, ry - ringSw / 2);
        const arcLen = Number((frac * 100).toFixed(3));
        const dashArr = arcLen <= 0.001 ? `0 200` : `${arcLen} 200`;
        const scalePre = dir === 'reverse' ? ` translate(${(2 * cx).toFixed(2)}, 0) scale(-1, 1)` : '';
        const ringTf = `transform="rotate(-90, ${cx.toFixed(2)}, ${cy.toFixed(2)})${scalePre}"`;
        const linecap = arcLen <= 0.001 ? 'butt' : 'round';
        gaugeBody = `<ellipse class="lite-guide-track lite-gauge-track" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${erx.toFixed(2)}" ry="${ery.toFixed(2)}" pathLength="100" fill="none" stroke="${bgCol}" stroke-width="${ringSw.toFixed(2)}" shape-rendering="geometricPrecision" pointer-events="none" />` +
          `<ellipse class="lite-payload lite-gauge-fill lite-gauge-arc" data-semantic-role="payload" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${erx.toFixed(2)}" ry="${ery.toFixed(2)}" pathLength="100" fill="none" stroke="${activeColor}" stroke-width="${ringSw.toFixed(2)}" stroke-dasharray="${dashArr}" stroke-linecap="${linecap}" ${ringTf} shape-rendering="geometricPrecision" pointer-events="none" />`;
        const fontSize = Math.max(10, Math.min(26, Math.round(Math.min(w, h) * 0.21)));
        const lblSize = Math.max(8, Math.round(fontSize * 0.58));
        const valY = labelStr ? (cy - lblSize * 0.35) : (cy + fontSize * 0.34);
        textMarkup = `<g class="lite-guide-track lite-gauge-readout" visibility="${readoutVis}" style="visibility:${readoutVis};" pointer-events="none">` +
          `<text class="lite-gauge-value-text" x="${cx.toFixed(2)}" y="${valY.toFixed(2)}" text-anchor="middle" fill="#f8fafc" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="700">${this.escapeXML(displayStr)}</text>` +
          (labelStr ? `<text class="lite-gauge-label-text" x="${cx.toFixed(2)}" y="${(cy + lblSize * 1.05).toFixed(2)}" text-anchor="middle" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="${lblSize}" font-weight="600">${this.escapeXML(labelStr)}</text>` : '') +
          `</g>`;
      } else if (variant === 'hbar') {
        const barR = Math.min(cr, h / 2, w / 2);
        const fillW = Number((w * frac).toFixed(2));
        const fillX = dir === 'reverse' ? (x + w - fillW) : x;
        const fillR = fillW > 0.5 ? Math.min(barR, fillW / 2) : 0;
        gaugeBody = `<rect class="lite-guide-track lite-gauge-track" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${barR.toFixed(2)}" fill="${bgCol}" stroke="${bgCol}" stroke-width="1" shape-rendering="geometricPrecision" pointer-events="none" />` +
          `<rect class="lite-payload lite-gauge-fill lite-gauge-hbar" data-semantic-role="payload" x="${fillX.toFixed(2)}" y="${y.toFixed(2)}" width="${fillW.toFixed(2)}" height="${h.toFixed(2)}" rx="${fillR.toFixed(2)}" fill="${activeColor}" shape-rendering="geometricPrecision" pointer-events="none" />`;
        const fontSize = Math.max(9, Math.min(18, Math.round(h * 0.48)));
        const fullTxt = labelStr ? `${labelStr}: ${displayStr}` : displayStr;
        textMarkup = `<g class="lite-guide-track lite-gauge-readout" visibility="${readoutVis}" style="visibility:${readoutVis};" pointer-events="none">` +
          `<text class="lite-gauge-value-text" x="${cx.toFixed(2)}" y="${(cy + fontSize * 0.35).toFixed(2)}" text-anchor="middle" fill="#f8fafc" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="700">${this.escapeXML(fullTxt)}</text>` +
          `</g>`;
      } else if (variant === 'vbar') {
        const barR = Math.min(cr, w / 2, h / 2);
        const fillH = Number((h * frac).toFixed(2));
        const fillY = dir === 'reverse' ? y : (y + h - fillH);
        const fillR = fillH > 0.5 ? Math.min(barR, fillH / 2) : 0;
        gaugeBody = `<rect class="lite-guide-track lite-gauge-track" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${barR.toFixed(2)}" fill="${bgCol}" stroke="${bgCol}" stroke-width="1" shape-rendering="geometricPrecision" pointer-events="none" />` +
          `<rect class="lite-payload lite-gauge-fill lite-gauge-vbar" data-semantic-role="payload" x="${x.toFixed(2)}" y="${fillY.toFixed(2)}" width="${w.toFixed(2)}" height="${fillH.toFixed(2)}" rx="${fillR.toFixed(2)}" fill="${activeColor}" shape-rendering="geometricPrecision" pointer-events="none" />`;
        const fontSize = Math.max(9, Math.min(15, Math.round(w * 0.36)));
        textMarkup = `<g class="lite-guide-track lite-gauge-readout" visibility="${readoutVis}" style="visibility:${readoutVis};" pointer-events="none">` +
          `<text class="lite-gauge-value-text" x="${cx.toFixed(2)}" y="${(cy + fontSize * 0.35).toFixed(2)}" text-anchor="middle" fill="#f8fafc" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="700">${this.escapeXML(displayStr)}</text>` +
          `</g>`;
      } else if (variant === 'segmented') {
        const segCount = Math.max(2, Math.min(32, Math.round(Number(le.segments) || 10)));
        const activeSegs = frac <= 0 ? 0 : Math.min(segCount, Math.round(frac * segCount));
        const gap = Math.max(2, Math.min(6, Math.round(w / (segCount * 4.5))));
        const cellW = Math.max(2, (w - gap * (segCount - 1)) / segCount);
        const cellR = Math.min(3, cellW / 2, h / 2);
        const cells = [];
        for (let i = 0; i < segCount; i++) {
          const logicalIdx = dir === 'reverse' ? (segCount - 1 - i) : i;
          const isLit = logicalIdx < activeSegs;
          const cellX = x + i * (cellW + gap);
          const cellCol = isLit ? activeColor : bgCol;
          cells.push(`<rect class="lite-payload lite-gauge-cell" data-semantic-role="payload" data-cell-index="${logicalIdx}" data-cell-lit="${isLit ? 'true' : 'false'}" x="${cellX.toFixed(2)}" y="${y.toFixed(2)}" width="${cellW.toFixed(2)}" height="${h.toFixed(2)}" rx="${cellR.toFixed(2)}" fill="${cellCol}" shape-rendering="geometricPrecision" pointer-events="none" />`);
        }
        gaugeBody = cells.join('');
        const fontSize = Math.max(9, Math.min(14, Math.round(h * 0.42)));
        const fullTxt = labelStr ? `${labelStr}: ${displayStr}` : displayStr;
        textMarkup = `<g class="lite-guide-track lite-gauge-readout" visibility="${readoutVis}" style="visibility:${readoutVis};" pointer-events="none">` +
          `<text class="lite-gauge-value-text" x="${cx.toFixed(2)}" y="${(y - 4).toFixed(2)}" text-anchor="middle" fill="#f8fafc" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="700">${this.escapeXML(fullTxt)}</text>` +
          `</g>`;
      } else if (variant === 'level') {
        const frameSw = Math.max(1.5, Math.min(10, sw));
        const pad = Math.max(3, frameSw + 1.5);
        const innerX = x + pad;
        const innerY = y + pad;
        const innerW = Math.max(2, w - pad * 2);
        const innerH = Math.max(2, h - pad * 2);
        const fillH = Number((innerH * frac).toFixed(2));
        const fillY = dir === 'reverse' ? innerY : (innerY + innerH - fillH);
        const outerR = Math.min(cr, w / 2, h / 2);
        const innerR = Math.max(0, outerR - pad * 0.5);
        gaugeBody = `<rect class="lite-guide-track lite-gauge-track lite-gauge-vessel" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${outerR.toFixed(2)}" fill="${bgCol}" fill-opacity="0.65" stroke="${activeColor}" stroke-width="${frameSw.toFixed(2)}" shape-rendering="geometricPrecision" pointer-events="none" />` +
          `<rect class="lite-payload lite-gauge-fill lite-gauge-level" data-semantic-role="payload" data-inner-x="${innerX.toFixed(2)}" data-inner-y="${innerY.toFixed(2)}" data-inner-w="${innerW.toFixed(2)}" data-inner-h="${innerH.toFixed(2)}" x="${innerX.toFixed(2)}" y="${fillY.toFixed(2)}" width="${innerW.toFixed(2)}" height="${fillH.toFixed(2)}" rx="${(fillH > 0.5 ? Math.min(innerR, fillH / 2) : 0).toFixed(2)}" fill="${activeColor}" fill-opacity="0.88" shape-rendering="geometricPrecision" pointer-events="none" />`;
        const fontSize = Math.max(10, Math.min(20, Math.round(Math.min(w, h) * 0.22)));
        const lblSize = Math.max(8, Math.round(fontSize * 0.65));
        const valY = labelStr ? (cy - lblSize * 0.25) : (cy + fontSize * 0.35);
        textMarkup = `<g class="lite-guide-track lite-gauge-readout" visibility="${readoutVis}" style="visibility:${readoutVis};" pointer-events="none">` +
          `<text class="lite-gauge-value-text" x="${cx.toFixed(2)}" y="${valY.toFixed(2)}" text-anchor="middle" fill="#f8fafc" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="700">${this.escapeXML(displayStr)}</text>` +
          (labelStr ? `<text class="lite-gauge-label-text" x="${cx.toFixed(2)}" y="${(cy + lblSize * 1.1).toFixed(2)}" text-anchor="middle" fill="#cbd5e1" font-family="system-ui, -apple-system, sans-serif" font-size="${lblSize}" font-weight="600">${this.escapeXML(labelStr)}</text>` : '') +
          `</g>`;
      }

      const threshAttrs = bands.map((b, i) => {
        const idx = i + 1;
        const bVal = Number.isFinite(Number(b && b.value)) ? Number(b.value) : 0;
        const bCol = this.sanitizeColor(b && b.color, '#f59e0b');
        return `data-gauge-t${idx}-enabled="${b && b.enabled ? 'true' : 'false'}" data-gauge-t${idx}-value="${bVal}" data-gauge-t${idx}-color="${bCol}"`;
      }).join(' ');
      const gaugeDataAttrs = `data-gauge-variant="${this.escapeXML(variant)}" data-gauge-value="${val}" data-gauge-min="${minV}" data-gauge-max="${maxV}" data-gauge-fraction="${frac.toFixed(4)}" data-gauge-base-color="${color}" data-gauge-active-color="${activeColor}" data-gauge-bg-color="${bgCol}" data-gauge-use-thresholds="${useThresh ? 'true' : 'false'}" data-gauge-warn-threshold="${warnT}" data-gauge-warn-color="${warnCol}" data-gauge-crit-threshold="${critT}" data-gauge-crit-color="${critCol}" ${threshAttrs} data-gauge-segments="${le.segments || 10}" data-gauge-direction="${dir}" data-gauge-unit="${this.escapeXML(unitStr)}" data-gauge-label="${this.escapeXML(labelStr)}" data-gauge-x="${x.toFixed(2)}" data-gauge-y="${y.toFixed(2)}" data-gauge-w="${w.toFixed(2)}" data-gauge-h="${h.toFixed(2)}" data-gauge-cx="${cx.toFixed(2)}" data-gauge-cy="${cy.toFixed(2)}" data-gauge-cr="${cr.toFixed(2)}" data-gauge-sw="${sw.toFixed(2)}"`;
      return `<g ${baseAttrs} ${gaugeDataAttrs} style="${visStyle}opacity:${opacity};">${hitMarkup}${gaugeBody}${textMarkup}</g>`;
    }

    if (le.kind === 'oscilloscope-lite') {
      return this.renderOscilloscopeLiteElement(le, baseAttrs, color, opacity, sw, x, y, w, h, cx, cy, cr, visStyle);
    }

    if (le.kind === 'text-lite') {
      return this.renderTextLiteElement(le, baseAttrs, color, opacity, sw, x, y, w, h, cx, cy, cr, visStyle);
    }

    return '';
  },

  getFontStack(fontKey) {
    const stacks = {
      'modern-sans': "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      'humanist-sans': "'Trebuchet MS', 'Gill Sans', 'Gill Sans MT', 'Lucida Grande', 'DejaVu Sans', sans-serif",
      'geometric-sans': "'Century Gothic', 'Avenir Next', Avenir, 'URW Gothic', 'Liberation Sans', sans-serif",
      'formal-serif': "'Times New Roman', Times, 'Liberation Serif', 'Nimbus Roman', serif",
      'traditional-serif': "Georgia, 'Palatino Linotype', Palatino, 'Book Antiqua', 'URW Bookman', serif",
      'tech-mono': "'JetBrains Mono', 'Fira Code', 'Cascadia Mono', Consolas, 'Liberation Mono', 'Courier New', monospace",
      'condensed-display': "'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue Condensed', Impact, 'Liberation Sans Narrow', sans-serif",
      'casual-lettering': "'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', 'TSCu_Comic', cursive, sans-serif",
      'informal-hand': "'Segoe Print', 'Bradley Hand', 'Marker Felt', 'Lucida Handwriting', cursive",
      'classic-script': "'Palace Script MT', 'Edwardian Script ITC', 'Snell Roundhand', 'Apple Chancery', 'URW Chancery L', 'Z003', 'Monotype Corsiva', cursive"
    };
    return stacks[fontKey] || stacks['modern-sans'];
  },

  segmentGraphemes(str) {
    const s = String(str || '');
    if (!s) return [];
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      try {
        const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        return Array.from(seg.segment(s), (item) => item.segment);
      } catch (_) {}
    }
    return Array.from(s);
  },

  findAtPct(xPct, yPct, canvasW = 1280, canvasH = 720) {
    const px = (Number(xPct) / 100) * canvasW;
    const py = (Number(yPct) / 100) * canvasH;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const le = this.list[i];
      if (!le || le.visible === false || le.locked) continue;
      if (window.LayerManager && typeof window.LayerManager.getEffective === 'function') {
        const effL = window.LayerManager.getEffective('lite', le.id);
        if (effL && (effL.locked || !effL.visible)) continue;
      }
      if (le.kind === 'flow-lite') continue;
      const g = this._resolveGeometry(le);
      let dx = px - g.cx;
      let dy = py - g.cy;
      if (g.rot && Math.abs(g.rot) > 0.001) {
        const rad = (-g.rot * Math.PI) / 180;
        const cosA = Math.cos(rad);
        const sinA = Math.sin(rad);
        const rx = dx * cosA - dy * sinA;
        const ry = dx * sinA + dy * cosA;
        dx = rx;
        dy = ry;
      }
      if (Math.abs(dx) <= g.rx + 4 && Math.abs(dy) <= g.ry + 4) {
        return le;
      }
    }
    return null;
  },

  buildTextLiteArcPath(x, y, w, h, pad, curvature) {
    const p0x = x + Math.min(pad, w * 0.25);
    const p1x = x + w - Math.min(pad, w * 0.25);
    const cx = x + w / 2;
    const cy = y + h / 2;
    const curv = Math.max(-100, Math.min(100, Number(curvature) || 0));
    if (Math.abs(curv) < 0.5) {
      return `M ${p0x.toFixed(2)} ${cy.toFixed(2)} L ${p1x.toFixed(2)} ${cy.toFixed(2)}`;
    }
    // Positive curvature = upward convex arch (bowing toward top of box; endpoints lower, apex higher)
    // Negative curvature = downward convex smile (bowing toward bottom of box; endpoints higher, apex lower)
    const sagitta = (curv / 100) * (h * 0.42);
    const endY = cy + sagitta * 0.5;
    const ctrlY = cy - sagitta * 1.5;
    return `M ${p0x.toFixed(2)} ${endY.toFixed(2)} Q ${cx.toFixed(2)} ${ctrlY.toFixed(2)} ${p1x.toFixed(2)} ${endY.toFixed(2)}`;
  },

  measureTextStringWidth(str, fontStack, fontSize, fontWeight, letterSpacing) {
    const s = String(str === undefined || str === null ? '' : str);
    if (!s) return 0;
    const gs = this.segmentGraphemes(s);
    const estW = Math.max(0, gs.length * (fontSize * 0.56 + letterSpacing));
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      try {
        if (!this._measureCtx) {
          const c = document.createElement('canvas');
          this._measureCtx = c && typeof c.getContext === 'function' ? c.getContext('2d') : null;
        }
        if (this._measureCtx) {
          this._measureCtx.font = `${fontWeight || '600'} ${fontSize}px ${fontStack}`;
          const m = this._measureCtx.measureText(s);
          if (m && Number.isFinite(m.width) && m.width > 0) {
            return m.width + Math.max(0, gs.length - 1) * letterSpacing;
          }
        }
      } catch (_) {}
    }
    return estW;
  },

  computeTextLiteLines(textStr, textAnim, wordWrap, availW, fontStack, fontSize, fontWeight, letterSpacing) {
    const raw = String(textStr === undefined || textStr === null ? '' : textStr).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (textAnim === 'stacked-v') {
      // Stacked-letter vertical column: each grapheme on its own vertical line (ignore newlines as blank gap or skip)
      const gs = this.segmentGraphemes(raw.replace(/\n/g, ' '));
      return gs.length > 0 ? gs : [''];
    }
    const explicitLines = raw.split('\n');
    const allowWrap = Boolean(wordWrap) && textAnim === 'ticker-v' && availW > fontSize;
    if (!allowWrap) {
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
        const candW = this.measureTextStringWidth(candidate, fontStack, fontSize, fontWeight, letterSpacing);
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
  },

  renderTextLiteElement(le, baseAttrs, color, opacity, sw, x, y, w, h, cx, cy, cr, visStyle = '') {
    const validVariants = ['none', 'rect', 'rounded', 'pill', 'curved'];
    const variant = validVariants.includes(le.variant) ? le.variant : 'rounded';
    const textStr = le.labelText !== undefined && le.labelText !== null ? String(le.labelText) : 'System Ready';
    const fontKey = le.fontFamily || 'modern-sans';
    const fontStack = this.getFontStack(fontKey);
    const fontSize = Math.max(8, Math.min(120, Number(le.fontSize) || 18));
    const fontWeight = ['400', '500', '600', '700'].includes(String(le.fontWeight)) ? String(le.fontWeight) : '600';
    const letterSpacing = Math.max(-2, Math.min(20, Number(le.letterSpacing) || 0));
    const textAlign = ['left', 'center', 'right'].includes(le.textAlign) ? le.textAlign : 'center';
    const verticalAlign = ['top', 'middle', 'bottom'].includes(le.verticalAlign) ? le.verticalAlign : 'middle';
    const pad = Math.max(0, Math.min(60, Math.min(w / 2 - 2, h / 2 - 2, Number(le.padding != null ? le.padding : 12))));
    const bgCol = this.sanitizeColor(le.bgColor, '#0f172a');
    const borderCol = this.sanitizeColor(le.borderColor, '#38bdf8');
    const bgOp = (variant === 'none' || variant === 'curved')
      ? 0
      : (le.bgOpacity !== undefined && le.bgOpacity !== null ? Math.max(0, Math.min(1, Number(le.bgOpacity))) : 0.85);
    const borderW = (variant === 'none' || variant === 'curved')
      ? 0
      : Math.max(0, Math.min(24, Number(le.strokeWidth != null ? le.strokeWidth : 1.5)));
    const cornerR = variant === 'pill'
      ? Math.min(w, h) / 2
      : (variant === 'rounded' ? Math.min(cr, w / 2, h / 2) : 0);
    const curv = Math.max(-100, Math.min(100, Number(le.curvature != null ? le.curvature : 35)));
    const arcOffset = Math.max(0, Math.min(100, Number(le.startOffset != null ? le.startOffset : 50)));
    const showGuide = Boolean(le.showGuide);
    let textAnim = le.textAnim || 'none';
    if (textAnim === 'overtype') textAnim = 'typewriter';
    if (variant === 'curved' && ['ticker-h', 'ticker-v', 'stacked-v', 'slide', 'scramble', 'overtype'].includes(textAnim)) {
      textAnim = 'none';
    }
    const playbackMode = ['loop', 'once', 'pingpong'].includes(le.playbackMode) ? le.playbackMode : 'loop';
    const scrollSpeed = Math.max(10, Math.min(600, Number(le.scrollSpeed) || 90));
    const linesPerSec = Math.max(0.1, Math.min(20, Number(le.linesPerSec) || 1.2));
    const lineSpacing = Math.max(0.8, Math.min(3.0, Number(le.lineSpacing) || 1.25));
    const wordWrap = le.wordWrap !== false;
    const typeSpeed = Math.max(1, Math.min(120, Number(le.typeSpeed) || 14));
    const holdDelay = Math.max(0, Math.min(30, Number(le.holdDelay != null ? le.holdDelay : 1.5)));
    const lockOnOff = Boolean(le.lockOnOff);
    const clearDuration = (lockOnOff && textAnim === 'flash')
      ? holdDelay
      : Math.max(0, Math.min(30, Number(le.clearDuration != null ? le.clearDuration : 0.6)));
    const rawTypeMode = le.typeMode || 'hold';
    const typeMode = rawTypeMode === 'loop'
      ? 'delete'
      : (['once', 'hold', 'delete', 'delete-forward'].includes(rawTypeMode) ? rawTypeMode : 'hold');
    const typeRepeat = rawTypeMode === 'loop'
      ? true
      : (le.typeRepeat !== undefined && le.typeRepeat !== null ? Boolean(le.typeRepeat) : (typeMode === 'delete' || typeMode === 'delete-forward'));
    const cycleDur = Math.max(textAnim === 'flash' ? 0 : 0.05, Math.min(30, Number(le.speed != null ? le.speed : (textAnim === 'flash' ? 0.15 : 0.8))));
    const startDelay = Math.max(0, Math.min(60, Number(le.delay) || 0));
    const dir = (le.direction === 'reverse' || le.direction === 'ccw') ? 'reverse' : 'forward';

    const clipId = `lite-text-clip-${le.id}`;
    const arcId = `lite-text-arc-${le.id}`;
    const blurId = `lite-text-blur-${le.id}`;

    // 1. Hit Target (always present so floating text 'none' and 'curved' are easy to click and drag)
    const hitMarkup = `<rect class="lite-hit-target" data-semantic-role="hit-target" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${cornerR.toFixed(2)}" fill="transparent" pointer-events="all" style="cursor:pointer;" />`;

    // 2. Container Box or Curved Guide Path
    let boxMarkup = '';
    if (variant === 'rect' || variant === 'rounded' || variant === 'pill') {
      const strokeAttr = borderW > 0 ? `stroke="${borderCol}" stroke-width="${borderW.toFixed(2)}"` : `stroke="none" stroke-width="0"`;
      const fillAttr = bgOp > 0 ? `fill="${bgCol}" fill-opacity="${bgOp.toFixed(3)}"` : `fill="none" fill-opacity="0"`;
      boxMarkup = `<rect class="lite-text-box" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${cornerR.toFixed(2)}" ${fillAttr} ${strokeAttr} shape-rendering="geometricPrecision" pointer-events="none" />`;
    } else if (variant === 'none') {
      boxMarkup = `<g class="lite-editor-marker" data-editor-only="true"><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="none" stroke="${borderCol}" stroke-opacity="0.28" stroke-width="1" stroke-dasharray="4 4" pointer-events="none" /></g>`;
    }

    let defsContent = `<clipPath id="${clipId}"><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${cornerR.toFixed(2)}" /></clipPath>`;
    if (variant === 'curved') {
      const arcD = this.buildTextLiteArcPath(x, y, w, h, pad, curv);
      defsContent += `<path id="${arcId}" d="${arcD}" fill="none" />`;
      const guideVis = showGuide ? 'visible' : 'hidden';
      const guideSw = Math.max(1, Number(le.strokeWidth) || 1.5);
      boxMarkup = `<path class="lite-guide-track lite-text-arc-guide" d="${arcD}" fill="none" stroke="${borderCol}" stroke-width="${guideSw.toFixed(2)}" stroke-opacity="0.45" stroke-dasharray="3 3" visibility="${guideVis}" style="visibility:${guideVis};" pointer-events="none" />` +
        (!showGuide ? `<g class="lite-editor-marker" data-editor-only="true"><path d="${arcD}" fill="none" stroke="${borderCol}" stroke-width="1" stroke-opacity="0.3" stroke-dasharray="4 4" pointer-events="none" /></g>` : '');
    }

    // 3. Optional Blur Filter for blur-in / blur-out
    let filterAttr = '';
    if (textAnim === 'blur-in' || textAnim === 'blur-out') {
      let vals = textAnim === 'blur-in' ? '6; 0; 0' : '0; 0; 6';
      let kt = '0; 0.45; 1';
      let durBlur = Math.max(0.2, cycleDur + holdDelay);
      let repCnt = playbackMode === 'once' ? '1' : 'indefinite';
      if (playbackMode === 'pingpong') {
        vals = textAnim === 'blur-in' ? '6; 0; 0; 6' : '0; 6; 6; 0';
        kt = '0; 0.35; 0.65; 1';
        durBlur = Math.max(0.3, cycleDur * 2 + holdDelay);
      }
      const initBlur = (textAnim === 'blur-in' && startDelay > 0) ? '6' : '0';
      const blurBeginAttr = startDelay > 0 ? ` begin="${Number(startDelay.toFixed(3))}s"` : '';
      defsContent += `<filter id="${blurId}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceGraphic" stdDeviation="${initBlur}"><animate attributeName="stdDeviation" values="${vals}" keyTimes="${kt}" dur="${durBlur.toFixed(3)}s"${blurBeginAttr} repeatCount="${repCnt}" fill="freeze" /></feGaussianBlur></filter>`;
      filterAttr = ` filter="url(#${blurId})"`;
    }

    // 4. Text Anchor, Multiline / Stacked Layout & Coordinates
    let anchor = 'middle';
    let textX = cx;
    if (textAlign === 'left') {
      anchor = 'start';
      textX = x + pad;
    } else if (textAlign === 'right') {
      anchor = 'end';
      textX = x + w - pad;
    }

    const availW = Math.max(16, w - pad * 2);
    const lineAdvance = fontSize * lineSpacing;
    const lines = variant === 'curved'
      ? [textStr.replace(/\r?\n/g, ' ')]
      : this.computeTextLiteLines(textStr, textAnim, wordWrap, availW, fontStack, fontSize, fontWeight, letterSpacing);
    const lineCount = Math.max(1, lines.length);
    const blockH = fontSize + (lineCount - 1) * lineAdvance;

    let firstLineY = cy - ((lineCount - 1) * lineAdvance) / 2 + fontSize * 0.35;
    if (verticalAlign === 'top') {
      firstLineY = y + pad + fontSize * 0.82;
    } else if (verticalAlign === 'bottom') {
      firstLineY = y + h - pad - fontSize * 0.18 - (lineCount - 1) * lineAdvance;
    }

    // 5. Animation Classes, Dynamic Keyframes & Inline CSS Custom Properties
    const estTextW = Math.max(fontSize, this.measureTextStringWidth(lines[0] || textStr, fontStack, fontSize, fontWeight, letterSpacing));
    let animClass = '';
    let animStyle = '';
    let customKfStyle = '';
    const iterCount = playbackMode === 'once' ? '1' : 'infinite';
    const fillMode = startDelay > 0 ? 'both' : (playbackMode === 'once' ? 'forwards' : 'both');
    const textDelayCss = startDelay > 0 ? `animation-delay:${startDelay.toFixed(4)}s;` : '';

    if (textAnim === 'ticker-h') {
      // Horizontal ticker: preserve configured vertical alignment (firstLineY), anchor='start', textX=x
      anchor = 'start';
      textX = x;
      const dist = Math.max(20, w + estTextW);
      const dur = Math.max(0.15, dist / scrollSpeed);
      const startShift = dir === 'reverse' ? -estTextW : w;
      let endShift = dir === 'reverse' ? w : -estTextW;
      if (playbackMode === 'once') {
        endShift = pad;
      }
      const animDir = playbackMode === 'pingpong' ? 'alternate' : 'normal';
      animClass = ' sva-lite-text-ticker-h-anim';
      animStyle = `animation-duration:${dur.toFixed(4)}s;${textDelayCss}animation-iteration-count:${iterCount};animation-direction:${animDir};animation-fill-mode:${fillMode};--sva-base-dur:${dur.toFixed(4)}s;--sva-ticker-start:${startShift.toFixed(2)}px;--sva-ticker-end:${endShift.toFixed(2)}px;`;
    } else if (textAnim === 'ticker-v' || textAnim === 'stacked-v') {
      // Vertical scroll: anchor first line at top of container (y + fontSize * 0.85) so translate(0, shift) is exact
      firstLineY = y + fontSize * 0.85;
      const effLinearSpd = textAnim === 'stacked-v'
        ? (typeSpeed * lineAdvance)
        : (linesPerSec * lineAdvance);
      const dist = Math.max(16, h + blockH);
      const dur = Math.max(0.15, dist / Math.max(1, effLinearSpd));
      const startShift = dir === 'reverse' ? (-blockH - 4) : (h + 4);
      let endShift = dir === 'reverse' ? (h + 4) : (-blockH - 4);
      if (playbackMode === 'once') {
        endShift = pad;
      }
      const animDir = playbackMode === 'pingpong' ? 'alternate' : 'normal';
      animClass = ' sva-lite-text-ticker-v-anim';
      animStyle = `animation-duration:${dur.toFixed(4)}s;${textDelayCss}animation-iteration-count:${iterCount};animation-direction:${animDir};animation-fill-mode:${fillMode};--sva-base-dur:${dur.toFixed(4)}s;--sva-ticker-start:${startShift.toFixed(2)}px;--sva-ticker-end:${endShift.toFixed(2)}px;`;
    } else if (textAnim === 'fade') {
      const fadeDur = Math.max(0.05, cycleDur);
      const visHold = Math.max(0, holdDelay);
      const clrHold = Math.max(0, clearDuration);
      const kfName = `sva-lite-fade-${le.id}`;
      let totalDur = fadeDur * 2 + visHold + clrHold;
      if (playbackMode === 'once') {
        totalDur = Math.max(0.05, fadeDur + visHold);
        const p1 = Math.min(100, (fadeDur / totalDur) * 100);
        customKfStyle = `<style class="lite-text-phase-style">@keyframes ${kfName} { 0% { opacity: 0; } ${p1.toFixed(2)}%, 100% { opacity: 1; } }</style>`;
      } else {
        totalDur = Math.max(0.1, fadeDur * 2 + visHold + clrHold);
        const p1 = (fadeDur / totalDur) * 100;
        const p2 = ((fadeDur + visHold) / totalDur) * 100;
        const p3 = ((fadeDur * 2 + visHold) / totalDur) * 100;
        customKfStyle = `<style class="lite-text-phase-style">@keyframes ${kfName} { 0% { opacity: 0; } ${p1.toFixed(2)}% { opacity: 1; } ${p2.toFixed(2)}% { opacity: 1; } ${p3.toFixed(2)}%, 100% { opacity: 0; } }</style>`;
      }
      animClass = ' sva-lite-text-fade-anim';
      animStyle = `animation-name:${kfName};animation-duration:${totalDur.toFixed(4)}s;${textDelayCss}animation-timing-function:linear;animation-iteration-count:${iterCount};animation-fill-mode:${fillMode};--sva-base-dur:${totalDur.toFixed(4)}s;`;
    } else if (textAnim === 'flash') {
      const fadeIn = Math.max(0, cycleDur);
      const onHold = Math.max(0.02, holdDelay);
      const offHold = Math.max(0.02, clearDuration);
      const kfName = `sva-lite-flash-${le.id}`;
      let totalDur = fadeIn + onHold + offHold;
      if (playbackMode === 'once') {
        totalDur = Math.max(0.05, fadeIn + onHold);
        if (fadeIn <= 0.005) {
          customKfStyle = `<style class="lite-text-phase-style">@keyframes ${kfName} { 0%, 100% { opacity: 1; } }</style>`;
        } else {
          const p1 = Math.min(100, (fadeIn / totalDur) * 100);
          customKfStyle = `<style class="lite-text-phase-style">@keyframes ${kfName} { 0% { opacity: 0; } ${p1.toFixed(2)}%, 100% { opacity: 1; } }</style>`;
        }
      } else if (playbackMode === 'pingpong') {
        const effFade = Math.max(0.05, fadeIn);
        totalDur = Math.max(0.1, effFade * 2 + onHold + offHold);
        const p1 = (effFade / totalDur) * 100;
        const p2 = ((effFade + onHold) / totalDur) * 100;
        const p3 = ((effFade * 2 + onHold) / totalDur) * 100;
        customKfStyle = `<style class="lite-text-phase-style">@keyframes ${kfName} { 0% { opacity: 0; } ${p1.toFixed(2)}% { opacity: 1; } ${p2.toFixed(2)}% { opacity: 1; } ${p3.toFixed(2)}%, 100% { opacity: 0; } }</style>`;
      } else {
        totalDur = Math.max(0.05, fadeIn + onHold + offHold);
        const p1 = (fadeIn / totalDur) * 100;
        const p2 = ((fadeIn + onHold) / totalDur) * 100;
        const p2Off = Math.min(99.99, p2 + 0.01);
        if (fadeIn <= 0.005) {
          customKfStyle = `<style class="lite-text-phase-style">@keyframes ${kfName} { 0%, ${p2.toFixed(2)}% { opacity: 1; } ${p2Off.toFixed(2)}%, 100% { opacity: 0; } }</style>`;
        } else {
          customKfStyle = `<style class="lite-text-phase-style">@keyframes ${kfName} { 0% { opacity: 0; } ${p1.toFixed(2)}%, ${p2.toFixed(2)}% { opacity: 1; } ${p2Off.toFixed(2)}%, 100% { opacity: 0; } }</style>`;
        }
      }
      animClass = ' sva-lite-text-flash-anim';
      animStyle = `animation-name:${kfName};animation-duration:${totalDur.toFixed(4)}s;${textDelayCss}animation-timing-function:linear;animation-iteration-count:${iterCount};animation-fill-mode:${fillMode};--sva-base-dur:${totalDur.toFixed(4)}s;`;
    } else if (textAnim === 'slide') {
      const dur = Math.max(0.4, cycleDur + holdDelay);
      const slideDist = Math.max(24, h * 0.85);
      const sIn = dir === 'reverse' ? -slideDist : slideDist;
      const sOut = dir === 'reverse' ? slideDist : -slideDist;
      const slideKf = playbackMode === 'once' ? 'sva-lite-text-slide-once' : (playbackMode === 'pingpong' ? 'sva-lite-text-slide-pp' : 'sva-lite-text-slide');
      animClass = ' sva-lite-text-slide-anim';
      animStyle = `animation-name:${slideKf};animation-duration:${dur.toFixed(4)}s;${textDelayCss}animation-iteration-count:${iterCount};animation-fill-mode:${fillMode};--sva-base-dur:${dur.toFixed(4)}s;--sva-slide-in:${sIn.toFixed(2)}px;--sva-slide-out:${sOut.toFixed(2)}px;`;
    }

    const lsAttr = Math.abs(letterSpacing) > 0.01 ? ` letter-spacing="${letterSpacing.toFixed(2)}px"` : '';
    const fontFamilyAttr = this.escapeXML(fontStack);
    let textMarkup = '';

    if (variant === 'curved') {
      let effOffset = arcOffset;
      if (textAlign === 'left' && arcOffset === 50) effOffset = 0;
      else if (textAlign === 'right' && arcOffset === 50) effOffset = 100;
      textMarkup = `<text class="lite-payload lite-text-element${animClass}" data-semantic-role="payload" fill="${color}" font-family="${fontFamilyAttr}" font-size="${fontSize.toFixed(1)}" font-weight="${fontWeight}" text-anchor="${anchor}"${lsAttr}${filterAttr} style="${animStyle}" pointer-events="none"><textPath class="lite-text-path" href="#${arcId}" startOffset="${effOffset.toFixed(1)}%">${this.escapeXML(lines[0] || '')}</textPath></text>`;
    } else {
      let innerTextContent = '';
      if (lines.length <= 1) {
        innerTextContent = this.escapeXML(lines[0] || '');
      } else {
        innerTextContent = lines.map((ln, idx) => {
          const ly = firstLineY + idx * lineAdvance;
          const safeLn = ln.length > 0 ? this.escapeXML(ln) : '&#160;';
          return `<tspan class="lite-text-line" x="${textX.toFixed(2)}" y="${ly.toFixed(2)}">${safeLn}</tspan>`;
        }).join('');
      }
      const rawContent = `<text class="lite-payload lite-text-element${animClass}" data-semantic-role="payload" x="${textX.toFixed(2)}" y="${firstLineY.toFixed(2)}" fill="${color}" font-family="${fontFamilyAttr}" font-size="${fontSize.toFixed(1)}" font-weight="${fontWeight}" text-anchor="${anchor}"${lsAttr}${filterAttr} style="${animStyle}" pointer-events="none">${innerTextContent}</text>`;
      textMarkup = `<g class="lite-text-viewport" clip-path="url(#${clipId})">${rawContent}</g>`;
    }

    const defsMarkup = `<defs>${defsContent}</defs>${customKfStyle}`;
    const textDataAttrs = `data-text-variant="${this.escapeXML(variant)}" data-text-content="${this.escapeXML(textStr)}" data-text-font="${this.escapeXML(fontKey)}" data-text-font-size="${fontSize}" data-text-font-weight="${fontWeight}" data-text-letter-spacing="${letterSpacing}" data-text-align="${textAlign}" data-text-valign="${verticalAlign}" data-text-padding="${pad}" data-text-bg-color="${bgCol}" data-text-bg-opacity="${bgOp}" data-text-border-color="${borderCol}" data-text-border-width="${borderW}" data-text-curvature="${curv}" data-text-start-offset="${arcOffset}" data-text-anim="${textAnim}" data-text-playback-mode="${playbackMode}" data-text-scroll-speed="${scrollSpeed}" data-text-lines-per-sec="${linesPerSec}" data-text-line-spacing="${lineSpacing}" data-text-word-wrap="${wordWrap ? 'true' : 'false'}" data-text-line-count="${lineCount}" data-text-block-h="${blockH.toFixed(2)}" data-text-type-speed="${typeSpeed}" data-text-hold-delay="${holdDelay}" data-text-clear-dur="${clearDuration}" data-text-lock-on-off="${lockOnOff ? 'true' : 'false'}" data-text-type-mode="${typeMode}" data-text-type-repeat="${typeRepeat ? 'true' : 'false'}" data-text-cycle-dur="${cycleDur}" data-text-direction="${dir}" data-text-x="${x.toFixed(2)}" data-text-y="${y.toFixed(2)}" data-text-w="${w.toFixed(2)}" data-text-h="${h.toFixed(2)}" data-text-cx="${cx.toFixed(2)}" data-text-cy="${cy.toFixed(2)}" data-text-cr="${cornerR.toFixed(2)}"`;
    return `<g ${baseAttrs} ${textDataAttrs} style="${visStyle}opacity:${opacity};">${defsMarkup}${hitMarkup}${boxMarkup}${textMarkup}</g>`;
  },

  parseOscilloscopeSamples(rawStr) {
    if (typeof rawStr !== 'string' || !rawStr.trim()) return null;
    const cleaned = rawStr.trim().replace(/^\[|\]$/g, '');
    const tokens = cleaned.split(/[,;\s]+/).filter(Boolean);
    if (tokens.length < 2 || tokens.length > 64) return null;
    const nums = [];
    for (let i = 0; i < tokens.length; i++) {
      const v = Number(tokens[i]);
      if (!Number.isFinite(v)) return null;
      nums.push(Math.max(-1, Math.min(1, v)));
    }
    return nums;
  },

  buildOscilloscopePath(variant, mode, x, y, w, h, cycles, ampFrac, basePct, samplesStr) {
    const safeCycles = Math.max(1, Math.min(12, Math.round(Number(cycles) || 2)));
    const safeAmp = Math.max(0.05, Math.min(1.0, Number(ampFrac) || 0.75));
    const safeBase = Math.max(10, Math.min(90, Number(basePct) || 50));
    const yBase = y + h * (safeBase / 100);
    const ampPx = (h * 0.42) * safeAmp;
    const yFor = (val) => {
      const yy = yBase - Math.max(-1, Math.min(1, val)) * ampPx;
      return Math.max(y + 1.5, Math.min(y + h - 1.5, yy));
    };

    if (mode === 'sampled') {
      const samples = this.parseOscilloscopeSamples(samplesStr) || [0, 0.4, 0.9, 0.3, -0.5, -0.9, -0.2, 0.6, 1.0, 0.2, -0.4, 0];
      const N = samples.length;
      const pts = samples.map((v, i) => ({
        x: x + (i / (N - 1)) * w,
        y: yFor(v)
      }));
      if (variant === 'bezier' && pts.length >= 3) {
        let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[Math.min(pts.length - 1, i + 2)];
          const c1x = p1.x + (p2.x - p0.x) / 6;
          const c1y = p1.y + (p2.y - p0.y) / 6;
          const c2x = p2.x - (p3.x - p1.x) / 6;
          const c2y = p2.y - (p3.y - p1.y) / 6;
          d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
        }
        return d;
      }
      return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    }

    const tileCount = mode === 'animated' ? 2 : 1;
    const totalPeriods = safeCycles * tileCount;
    const periodW = w / safeCycles;
    const cmds = [];

    for (let p = 0; p < totalPeriods; p++) {
      const x0 = x + p * periodW;
      const isFirst = p === 0;
      if (variant === 'ecg') {
        const kfs = [
          [0.00, 0.00],
          [0.14, 0.00],
          [0.20, 0.22],
          [0.26, 0.00],
          [0.34, 0.00],
          [0.38, -0.24],
          [0.44, 1.00],
          [0.50, -0.45],
          [0.56, 0.00],
          [0.68, 0.00],
          [0.76, 0.34],
          [0.86, 0.00],
          [1.00, 0.00]
        ];
        kfs.forEach(([t, v], idx) => {
          if (idx === 0 && !isFirst) return;
          const px = x0 + t * periodW;
          const py = yFor(v);
          cmds.push(`${idx === 0 && isFirst ? 'M' : 'L'} ${px.toFixed(2)} ${py.toFixed(2)}`);
        });
      } else if (variant === 'sine') {
        const steps = 24;
        for (let s = 0; s <= steps; s++) {
          if (s === 0 && !isFirst) continue;
          const t = s / steps;
          const px = x0 + t * periodW;
          const py = yFor(Math.sin(2 * Math.PI * t));
          cmds.push(`${s === 0 && isFirst ? 'M' : 'L'} ${px.toFixed(2)} ${py.toFixed(2)}`);
        }
      } else if (variant === 'square') {
        const kfs = [
          [0.00, 0.00],
          [0.00, 0.85],
          [0.50, 0.85],
          [0.50, -0.85],
          [1.00, -0.85],
          [1.00, 0.00]
        ];
        kfs.forEach(([t, v], idx) => {
          if (idx === 0 && !isFirst) return;
          const px = x0 + t * periodW;
          const py = yFor(v);
          cmds.push(`${idx === 0 && isFirst ? 'M' : 'L'} ${px.toFixed(2)} ${py.toFixed(2)}`);
        });
      } else if (variant === 'triangle') {
        const kfs = [
          [0.00, 0.00],
          [0.25, 0.92],
          [0.75, -0.92],
          [1.00, 0.00]
        ];
        kfs.forEach(([t, v], idx) => {
          if (idx === 0 && !isFirst) return;
          const px = x0 + t * periodW;
          const py = yFor(v);
          cmds.push(`${idx === 0 && isFirst ? 'M' : 'L'} ${px.toFixed(2)} ${py.toFixed(2)}`);
        });
      } else if (variant === 'sawtooth') {
        const kfs = [
          [0.00, 0.00],
          [0.48, 0.92],
          [0.52, -0.92],
          [1.00, 0.00]
        ];
        kfs.forEach(([t, v], idx) => {
          if (idx === 0 && !isFirst) return;
          const px = x0 + t * periodW;
          const py = yFor(v);
          cmds.push(`${idx === 0 && isFirst ? 'M' : 'L'} ${px.toFixed(2)} ${py.toFixed(2)}`);
        });
      } else if (variant === 'polyline') {
        const kfs = [
          [0.00, 0.00],
          [0.15, 0.65],
          [0.32, -0.40],
          [0.50, 0.95],
          [0.68, -0.85],
          [0.84, 0.45],
          [1.00, 0.00]
        ];
        kfs.forEach(([t, v], idx) => {
          if (idx === 0 && !isFirst) return;
          const px = x0 + t * periodW;
          const py = yFor(v);
          cmds.push(`${idx === 0 && isFirst ? 'M' : 'L'} ${px.toFixed(2)} ${py.toFixed(2)}`);
        });
      } else if (variant === 'bezier') {
        const y0 = yFor(0);
        const yPeak1 = yFor(1.05);
        const yTrough1 = yFor(-0.95);
        const yPeak2 = yFor(0.75);
        const yTrough2 = yFor(-0.75);
        if (isFirst) {
          cmds.push(`M ${x0.toFixed(2)} ${y0.toFixed(2)}`);
        }
        const xMid = x0 + periodW * 0.5;
        const xEnd = x0 + periodW;
        cmds.push(`C ${(x0 + periodW * 0.16).toFixed(2)} ${yPeak1.toFixed(2)}, ${(x0 + periodW * 0.34).toFixed(2)} ${yTrough1.toFixed(2)}, ${xMid.toFixed(2)} ${y0.toFixed(2)}`);
        cmds.push(`C ${(x0 + periodW * 0.66).toFixed(2)} ${yPeak2.toFixed(2)}, ${(x0 + periodW * 0.84).toFixed(2)} ${yTrough2.toFixed(2)}, ${xEnd.toFixed(2)} ${y0.toFixed(2)}`);
      }
    }
    return cmds.join(' ');
  },

  renderOscilloscopeLiteElement(le, baseAttrs, color, opacity, sw, x, y, w, h, cx, cy, cr, visStyle = '') {
    const validPresets = ['ecg', 'sine', 'square', 'triangle', 'sawtooth', 'polyline', 'bezier'];
    const variant = validPresets.includes(le.variant) ? le.variant : 'ecg';
    const mode = ['static', 'animated', 'sampled'].includes(le.playbackMode) ? le.playbackMode : 'animated';
    const bgCol = this.sanitizeColor(le.bgColor, '#0b1322');
    const cycles = Math.max(1, Math.min(12, Math.round(Number(le.segments) || 2)));
    const ampFrac = Math.max(0.05, Math.min(1.0, Number(le.intensity) || 0.75));
    const basePct = Math.max(10, Math.min(90, Number(le.startOffset) || 50));
    const dur = Math.max(0.2, Math.min(30, Number(le.speed) || Number(le.period) || 2.4));
    const dir = (le.direction === 'reverse' || le.direction === 'ccw') ? 'reverse' : 'forward';
    const showGrid = le.showGuide !== false;
    const gridVis = showGrid ? 'visible' : 'hidden';
    const samplesStr = (typeof le.samples === 'string' && le.samples.trim())
      ? le.samples.trim()
      : '0, 0.4, 0.9, 0.3, -0.5, -0.9, -0.2, 0.6, 1.0, 0.2, -0.4, 0';
    const cornerR = Math.min(cr, w / 2, h / 2);
    const clipId = `lite-osc-clip-${le.id}`;

    const hitMarkup = `<rect class="lite-hit-target" data-semantic-role="hit-target" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${cornerR.toFixed(2)}" fill="transparent" pointer-events="all" style="cursor:pointer;" />`;
    const screenBg = `<rect class="lite-osc-screen" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${cornerR.toFixed(2)}" fill="${bgCol}" stroke="${color}" stroke-opacity="0.35" stroke-width="1.2" shape-rendering="geometricPrecision" pointer-events="none" />`;

    const yBase = y + h * (basePct / 100);
    const gridLines = [];
    for (let i = 1; i <= 3; i++) {
      const gx = x + (w * i) / 4;
      const gy = y + (h * i) / 4;
      gridLines.push(`<line x1="${gx.toFixed(2)}" y1="${y.toFixed(2)}" x2="${gx.toFixed(2)}" y2="${(y + h).toFixed(2)}" stroke="${color}" stroke-opacity="0.16" stroke-width="0.8" stroke-dasharray="2 3" />`);
      gridLines.push(`<line x1="${x.toFixed(2)}" y1="${gy.toFixed(2)}" x2="${(x + w).toFixed(2)}" y2="${gy.toFixed(2)}" stroke="${color}" stroke-opacity="0.16" stroke-width="0.8" stroke-dasharray="2 3" />`);
    }
    gridLines.push(`<line class="lite-osc-baseline" x1="${x.toFixed(2)}" y1="${yBase.toFixed(2)}" x2="${(x + w).toFixed(2)}" y2="${yBase.toFixed(2)}" stroke="${color}" stroke-opacity="0.32" stroke-width="1" />`);
    const gridMarkup = `<g class="lite-guide-track lite-osc-grid" visibility="${gridVis}" style="visibility:${gridVis};" pointer-events="none">${gridLines.join('')}</g>`;

    const pathD = this.buildOscilloscopePath(variant, mode, x, y, w, h, cycles, ampFrac, basePct, samplesStr);
    const isAnim = mode === 'animated';
    const animClass = isAnim ? ' sva-lite-osc-anim' : '';
    const animDir = dir === 'reverse' ? 'reverse' : 'normal';
    const styleStr = isAnim
      ? `animation-duration:${dur.toFixed(4)}s;animation-direction:${animDir};--sva-base-dur:${dur.toFixed(4)}s;--sva-osc-shift:-${w.toFixed(2)}px;`
      : `--sva-osc-shift:-${w.toFixed(2)}px;`;

    const wavePath = `<path class="lite-payload lite-osc-wave${animClass}" data-semantic-role="payload" d="${pathD}" fill="none" stroke="${color}" stroke-width="${sw.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision" style="${styleStr}" pointer-events="none" />`;
    const clipDefs = `<defs><clipPath id="${clipId}"><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${cornerR.toFixed(2)}" /></clipPath></defs>`;
    const clippedWave = `<g class="lite-osc-viewport" clip-path="url(#${clipId})">${wavePath}</g>`;

    const oscDataAttrs = `data-osc-variant="${this.escapeXML(variant)}" data-osc-mode="${mode}" data-osc-cycles="${cycles}" data-osc-amplitude="${ampFrac}" data-osc-baseline="${basePct}" data-osc-speed="${dur}" data-osc-direction="${dir}" data-osc-bg-color="${bgCol}" data-osc-samples="${this.escapeXML(samplesStr)}" data-osc-x="${x.toFixed(2)}" data-osc-y="${y.toFixed(2)}" data-osc-w="${w.toFixed(2)}" data-osc-h="${h.toFixed(2)}" data-osc-sw="${sw.toFixed(2)}"`;
    return `<g ${baseAttrs} ${oscDataAttrs} style="${visStyle}opacity:${opacity};">${clipDefs}${hitMarkup}${screenBg}${gridMarkup}${clippedWave}</g>`;
  },

  getLiteBurstScript() {
    const needsBurstScript = this.list.some((le) =>
      (le.kind === 'perimeter-tracer' && Number(le.burstCycles) > 0 && Number(le.pauseSeconds) > 0 && le.playbackMode !== 'once') ||
      (le.kind === 'flash' && Boolean(le.repeat)) ||
      (le.kind === 'flow-lite' && ((Number(le.delay) || 0) + (Number(le.endDelay) || 0)) > 0 && le.playbackMode !== 'once') ||
      (le.kind === 'text-lite' && le.textAnim && le.textAnim !== 'none') ||
      (le.play === false)
    );
    if (!needsBurstScript) return '';
    return `\n<script type="application/ecmascript"><![CDATA[
(function(){
  var cs=document.currentScript;
  var s=(cs&&(cs.ownerSVGElement||(cs.closest&&cs.closest('svg'))))||document.documentElement;
  if(!s||s.hasAttribute('data-sva-runtime-managed')||(s.closest&&s.closest('.sva-widget-wrapper')))return;
  var stopped=s.querySelectorAll('[data-lite-play="false"],[data-play-animation="false"]');
  for(var p=0;p<stopped.length;p++){
    var stEl=stopped[p];
    var animKids=stEl.querySelectorAll('.lite-payload,.lite-osc-wave,.lite-text-element');
    for(var ak=0;ak<animKids.length;ak++){
      if(animKids[ak].style){animKids[ak].style.animationPlayState='paused';animKids[ak].style.animationName='none';}
    }
    var smilKids=stEl.querySelectorAll('animate,animateTransform,animateMotion,set');
    for(var sk=0;sk<smilKids.length;sk++){
      smilKids[sk].setAttribute('begin','indefinite');
      if(typeof smilKids[sk].endElement==='function'){try{smilKids[sk].endElement();}catch(_){}}
    }
  }
  var nodes=s.querySelectorAll('[data-burst-cycles]');
  for(var i=0;i<nodes.length;i++){(function(n){
    if(n.closest&&n.closest('[data-lite-play="false"],[data-play-animation="false"]'))return;
    n.addEventListener('animationend',function(){
      var cyc=parseInt(n.getAttribute('data-burst-cycles')||'0',10);
      var pSec=parseFloat(n.getAttribute('data-pause-seconds')||'0');
      if(!(cyc>0&&pSec>0))return;
      var vis=n.getAttribute('data-pause-visibility')||'hide';
      if(vis==='hide')n.style.visibility='hidden';
      setTimeout(function(){
        var anim=n.style.animationName||'';
        n.style.animationName='none';
        try{void n.getBoundingClientRect();}catch(_){}
        n.style.visibility='';
        n.style.animationName=anim;
      },Math.max(10,pSec*1000));
    });
  })(nodes[i]);}
  function segG(str){
    var t=String(str||'');
    if(!t)return[];
    if(typeof Intl!=='undefined'&&typeof Intl.Segmenter==='function'){
      try{return Array.from((new Intl.Segmenter(undefined,{granularity:'grapheme'})).segment(t),function(x){return x.segment;});}catch(_){}
    }
    return Array.from(t);
  }
    const tNodes=s.querySelectorAll('[data-lite-kind="text-lite"]');
    for(var j=0;j<tNodes.length;j++){(function(g){
      if(g.getAttribute('data-lite-play')==='false'||g.getAttribute('data-play-animation')==='false')return;
      var anim=g.getAttribute('data-text-anim')||'none';
      if(anim==='overtype')anim='typewriter';
      if(anim==='none')return;
      var txtEl=g.querySelector('.lite-text-element');
      var targetNode=g.querySelector('.lite-text-path')||txtEl;
      if(!txtEl||!targetNode)return;
      var fullStr=g.getAttribute('data-text-content')||targetNode.textContent||'';
      var w=parseFloat(g.getAttribute('data-text-w'))||220;
      var h=parseFloat(g.getAttribute('data-text-h'))||56;
      var pad=parseFloat(g.getAttribute('data-text-padding'))||12;
      var dir=g.getAttribute('data-text-direction')==='reverse'?'reverse':'forward';
      var pMode=g.getAttribute('data-text-playback-mode')||'loop';
      if(anim==='ticker-h'){
        var spd=Math.max(10,parseFloat(g.getAttribute('data-text-scroll-speed'))||90);
        var tw=0;
        try{tw=txtEl.getComputedTextLength();}catch(_){}
        if(!(tw>0))tw=Math.max(18,segG(fullStr).length*10);
        var dist=w+tw;
        var dur=Math.max(0.15,dist/spd);
        var endPx=pMode==='once'?pad:(dir==='reverse'?w:-tw);
        txtEl.style.setProperty('--sva-ticker-start',(dir==='reverse'?-tw:w).toFixed(2)+'px');
        txtEl.style.setProperty('--sva-ticker-end',endPx.toFixed(2)+'px');
        txtEl.style.animationDuration=dur.toFixed(4)+'s';
      }else if(anim==='typewriter'||anim==='scramble'){
        var rate=Math.max(1,parseFloat(g.getAttribute('data-text-type-speed'))||14);
        var hold=Math.max(0,parseFloat(g.getAttribute('data-text-hold-delay'))||1.5);
        var mode=g.getAttribute('data-text-type-mode')||'hold';
        if(mode==='loop')mode='delete';
        var rep=g.getAttribute('data-text-type-repeat')==='true'||pMode==='loop';
        var gs=segG(fullStr);
        var stepMs=Math.max(12,Math.round(1000/rate));
        var idx=0,phase='type';
        var cipher='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&*';
        function tick(){
          if(!g.isConnected)return;
          if(anim==='scramble'){
            idx++;
            var out='';
            for(var k=0;k<gs.length;k++){
              if(k<idx||gs[k]===' ')out+=gs[k];
              else out+=cipher.charAt((k*7+idx*13)%cipher.length);
            }
            targetNode.textContent=out;
            if(idx<gs.length)setTimeout(tick,stepMs);
            else if(pMode!=='once')setTimeout(function(){idx=0;tick();},Math.max(200,hold*1000));
          }else{
            if(phase==='type'){
              idx++;
              targetNode.textContent=gs.slice(0,idx).join('');
              if(idx<gs.length)setTimeout(tick,stepMs);
              else if(mode==='delete'||mode==='delete-forward'){phase=mode;setTimeout(tick,Math.max(60,hold*1000));}
              else if(rep){setTimeout(function(){idx=0;targetNode.textContent='';tick();},Math.max(200,hold*1000));}
            }else if(phase==='delete'){
              idx--;
              targetNode.textContent=gs.slice(0,Math.max(0,idx)).join('');
              if(idx>0)setTimeout(tick,Math.max(10,Math.round(stepMs*0.75)));
              else if(rep){phase='type';setTimeout(tick,250);}
            }else if(phase==='delete-forward'){
              idx--;
              var startCut=gs.length-Math.max(0,idx);
              targetNode.textContent=gs.slice(startCut).join('');
              if(idx>0)setTimeout(tick,Math.max(10,Math.round(stepMs*0.75)));
              else if(rep){phase='type';setTimeout(tick,250);}
            }
          }
        }
        targetNode.textContent='';
        var startDelayMs=Math.max(0,(parseFloat(g.getAttribute('data-lite-delay')||g.getAttribute('data-text-delay')||'0')||0)*1000);
        setTimeout(tick,startDelayMs+stepMs);
      }
    })(tNodes[j]);}
})();
]]></script>`;
  },

  injectIntoSVG(svgString, options = {}) {
    if (!svgString || this.list.length === 0) return svgString;
    const defs = this.getLiteDefs();
    const elements = this.list.map((le) => this.renderLiteElement(le)).join('\n');
    const burstScript = (options && options.omitEmbeddedBurstScript) ? '' : this.getLiteBurstScript();
    const block = `\n${defs}\n<g id="lite-effects-layer" class="lite-effects-layer">\n${elements}\n</g>${burstScript}\n`;
    if (svgString.includes('<!-- INJECT_CAMERA_RIG_ELEMENTS -->')) {
      return svgString.replace('<!-- INJECT_CAMERA_RIG_ELEMENTS -->', block + '<!-- INJECT_CAMERA_RIG_ELEMENTS -->');
    }
    return svgString.replace('</svg>', block + '</svg>');
  },

  stopBurstSchedulers() {
    if (this._studioBurstTimers) {
      this._studioBurstTimers.forEach((t) => clearTimeout(t));
    }
    this._studioBurstTimers = [];
  },

  bindBurstSchedulers(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return;
    this.stopBurstSchedulers();
    container.querySelectorAll('[data-lite-play="false"], [data-play-animation="false"]').forEach((stEl) => {
      stEl.querySelectorAll('.lite-payload, .lite-osc-wave, .lite-text-element').forEach((node) => {
        if (node.style) {
          node.style.animationPlayState = 'paused';
          node.style.animationName = 'none';
        }
      });
      stEl.querySelectorAll('animate, animateTransform, animateMotion, set').forEach((smil) => {
        smil.setAttribute('begin', 'indefinite');
        if (typeof smil.endElement === 'function') {
          try { smil.endElement(); } catch (_) {}
        }
      });
    });
    // When TimelinePlayer is initialized, it evaluates burst-pause, ticker-h calibration,
    // typewriter, and scramble deterministically at the exact playhead timestamp.
    if (typeof window !== 'undefined' && window.TimelinePlayer && window.TimelinePlayer._initialized) {
      return;
    }
    container.querySelectorAll('[data-burst-cycles]').forEach((node) => {
      if (node.closest && node.closest('[data-lite-play="false"], [data-play-animation="false"]')) return;
      node.addEventListener('animationend', () => {
        const cyc = parseInt(node.getAttribute('data-burst-cycles') || '0', 10);
        const pSec = parseFloat(node.getAttribute('data-pause-seconds') || '0');
        if (!(cyc > 0 && pSec > 0)) return;
        const vis = node.getAttribute('data-pause-visibility') || 'hide';
        if (vis === 'hide') node.style.visibility = 'hidden';
        const tid = setTimeout(() => {
          if (!node.isConnected) return;
          const prev = node.style.animationName || '';
          node.style.animationName = 'none';
          try { void node.getBoundingClientRect(); } catch (_) {}
          node.style.visibility = '';
          node.style.animationName = prev;
        }, Math.max(10, pSec * 1000));
        this._studioBurstTimers.push(tid);
      });
    });

    // Bind live Studio preview controllers for Text Box Lite tickers, typewriters, and scramble
    container.querySelectorAll('[data-lite-kind="text-lite"]').forEach((g) => {
      if (g.getAttribute('data-lite-play') === 'false' || g.getAttribute('data-play-animation') === 'false') return;
      let anim = g.getAttribute('data-text-anim') || 'none';
      if (anim === 'overtype') anim = 'typewriter';
      if (anim === 'none') return;
      const txtEl = g.querySelector('.lite-text-element');
      const targetNode = g.querySelector('.lite-text-path') || txtEl;
      if (!txtEl || !targetNode) return;
      const fullStr = g.getAttribute('data-text-content') || '';
      const w = parseFloat(g.getAttribute('data-text-w')) || 220;
      const pad = parseFloat(g.getAttribute('data-text-padding')) || 12;
      const dir = g.getAttribute('data-text-direction') === 'reverse' ? 'reverse' : 'forward';
      const pMode = g.getAttribute('data-text-playback-mode') || 'loop';
      if (anim === 'ticker-h') {
        const spd = Math.max(10, parseFloat(g.getAttribute('data-text-scroll-speed')) || 90);
        let tw = 0;
        try { tw = txtEl.getComputedTextLength(); } catch (_) {}
        if (!(tw > 0)) tw = Math.max(18, this.segmentGraphemes(fullStr).length * 10);
        const dist = w + tw;
        const dur = Math.max(0.15, dist / spd);
        const endPx = pMode === 'once' ? pad : (dir === 'reverse' ? w : -tw);
        txtEl.style.setProperty('--sva-ticker-start', `${(dir === 'reverse' ? -tw : w).toFixed(2)}px`);
        txtEl.style.setProperty('--sva-ticker-end', `${endPx.toFixed(2)}px`);
        txtEl.style.animationDuration = `${dur.toFixed(4)}s`;
      } else if (anim === 'typewriter' || anim === 'scramble') {
        const rate = Math.max(1, parseFloat(g.getAttribute('data-text-type-speed')) || 14);
        const hold = Math.max(0, parseFloat(g.getAttribute('data-text-hold-delay')) || 1.5);
        let mode = g.getAttribute('data-text-type-mode') || 'hold';
        if (mode === 'loop') mode = 'delete';
        const rep = g.getAttribute('data-text-type-repeat') === 'true';
        const gs = this.segmentGraphemes(fullStr);
        const stepMs = Math.max(12, Math.round(1000 / rate));
        const cipher = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&*';
        let idx = 0;
        let phase = 'type';
        const stepFn = () => {
          if (!g.isConnected) return;
          if (anim === 'scramble') {
            idx++;
            let out = '';
            for (let k = 0; k < gs.length; k++) {
              if (k < idx || gs[k] === ' ') out += gs[k];
              else out += cipher.charAt((k * 7 + idx * 13) % cipher.length);
            }
            targetNode.textContent = out;
            if (idx < gs.length) {
              this._studioBurstTimers.push(setTimeout(stepFn, stepMs));
            } else if (pMode !== 'once') {
              this._studioBurstTimers.push(setTimeout(() => { idx = 0; stepFn(); }, Math.max(250, hold * 1000)));
            }
          } else {
            if (phase === 'type') {
              idx++;
              targetNode.textContent = gs.slice(0, idx).join('');
              if (idx < gs.length) {
                this._studioBurstTimers.push(setTimeout(stepFn, stepMs));
              } else if (mode === 'delete' || mode === 'delete-forward') {
                phase = mode;
                this._studioBurstTimers.push(setTimeout(stepFn, Math.max(60, hold * 1000)));
              } else if (rep) {
                this._studioBurstTimers.push(setTimeout(() => { idx = 0; targetNode.textContent = ''; stepFn(); }, Math.max(250, hold * 1000)));
              }
            } else if (phase === 'delete') {
              idx--;
              targetNode.textContent = gs.slice(0, Math.max(0, idx)).join('');
              if (idx > 0) {
                this._studioBurstTimers.push(setTimeout(stepFn, Math.max(10, Math.round(stepMs * 0.75))));
              } else if (rep) {
                phase = 'type';
                this._studioBurstTimers.push(setTimeout(stepFn, 250));
              }
            } else if (phase === 'delete-forward') {
              idx--;
              const startCut = gs.length - Math.max(0, idx);
              targetNode.textContent = gs.slice(startCut).join('');
              if (idx > 0) {
                this._studioBurstTimers.push(setTimeout(stepFn, Math.max(10, Math.round(stepMs * 0.75))));
              } else if (rep) {
                phase = 'type';
                this._studioBurstTimers.push(setTimeout(stepFn, 250));
              }
            }
          }
        };
        if (gs.length > 0) {
          targetNode.textContent = '';
          const startDelayMs = Math.max(0, (parseFloat(g.getAttribute('data-lite-delay') || g.getAttribute('data-text-delay') || '0') || 0) * 1000);
          this._studioBurstTimers.push(setTimeout(stepFn, startDelayMs + stepMs));
        }
      }
    });
  },

  triggerFlash(id) {
    const le = this.getLiteEffect(id);
    if (!le) return null;
    const nextNonce = (Number(le.triggerNonce) || 0) + 1;
    const updated = this.updateLiteEffect(id, { triggerNonce: nextNonce });
    this.triggerAppRender();
    const el = typeof document !== 'undefined'
      ? document.querySelector(`#svgContainer [data-lite-id="${id}"] .lite-flash-anim`)
      : null;
    if (el && el.style) {
      el.style.animationName = 'none';
      try { void el.getBoundingClientRect(); } catch (_) {}
      el.style.animationName = 'sva-lite-flash';
    }
    return updated;
  },

  triggerAppRender() {
    if (window.AppCoordinator && typeof window.AppCoordinator.requestRender === 'function') {
      window.AppCoordinator.requestRender();
      if (typeof window.AppCoordinator.updateActiveOverlays === 'function') {
        window.AppCoordinator.updateActiveOverlays();
      }
    } else if (typeof window.triggerRender === 'function') {
      window.triggerRender();
    }
  },

  // =========================================================================
  // UI Presentation & Event Bindings
  // =========================================================================

  init() {
    if (this._initialized || typeof document === 'undefined') return;
    this._initialized = true;

    const bindBtn = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };

    bindBtn('btnAddLiteTracer', () => this.addByKind('perimeter-tracer'));
    bindBtn('btnAddLitePulse', () => this.addByKind('pulse'));
    bindBtn('btnAddLiteFlash', () => this.addByKind('flash'));
    bindBtn('btnAddLiteFlow', () => this.addByKind('flow-lite'));
    bindBtn('btnAddLiteRadar', () => this.addByKind('radar-lite'));
    bindBtn('btnAddLiteGauge', () => this.addByKind('gauge-lite'));
    bindBtn('btnAddLiteOsc', () => this.addByKind('oscilloscope-lite'));
    bindBtn('btnAddLiteText', () => this.addByKind('text-lite'));
    bindBtn('btnTriggerLiteFlash', () => {
      if (this.activeId) this.triggerFlash(this.activeId);
    });
    bindBtn('btnAddLiteFlowNode', () => this.addWaypointToActive());
    bindBtn('btnDropLiteFlowNode', () => this.dropWaypointFromActive());

    const bindField = (elId, prop, isNum = false, isBool = false) => {
      const el = document.getElementById(elId);
      if (!el) return;
      const evt = (el.type === 'color' || el.type === 'text' || el.type === 'number' || el.type === 'range') ? 'input' : 'change';
      el.addEventListener(evt, (e) => {
        let val = isBool ? e.target.checked : e.target.value;
        if (isNum) val = parseFloat(val);
        this.updateActive(prop, val);
      });
      if (evt === 'input') {
        el.addEventListener('change', () => {
          if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
        });
      }
    };

    const bindPair = (baseId, prop, isInt = false) => {
      const slider = document.getElementById(baseId + 'Slider');
      const num = document.getElementById(baseId + 'Num');
      const handle = (src, dst) => {
        if (!src) return;
        src.addEventListener('input', (e) => {
          const val = isInt ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
          if (!Number.isFinite(val)) return;
          if (dst) dst.value = val;
          this.updateActive(prop, val);
        });
        src.addEventListener('change', () => {
          if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
        });
      };
      handle(slider, num);
      handle(num, slider);
    };

    const deselectBtn = document.getElementById('btnDeselectLite');
    if (deselectBtn) {
      deselectBtn.addEventListener('click', () => {
        if (window.AppCoordinator && typeof window.AppCoordinator.clearSelection === 'function') {
          window.AppCoordinator.clearSelection({ reason: 'sidebar_deselect_lite' });
        } else {
          this.deselectLite();
        }
      });
    }

    const btnGroupLite = document.getElementById('btnGroupLiteSelection');
    if (btnGroupLite) {
      btnGroupLite.addEventListener('click', () => {
        if (window.AppCoordinator) {
          const sel = window.AppCoordinator.getActiveSelection();
          if (sel && sel.type === 'group' && typeof window.AppCoordinator.ungroupSelectedGroup === 'function') {
            window.AppCoordinator.ungroupSelectedGroup();
          } else if (typeof window.AppCoordinator.createGroupFromSelection === 'function') {
            window.AppCoordinator.createGroupFromSelection();
          }
        }
      });
    }

    const btnDupLite = document.getElementById('btnDuplicateLiteSelection');
    if (btnDupLite) {
      btnDupLite.addEventListener('click', () => {
        if (window.AppCoordinator && typeof window.AppCoordinator.duplicateSelection === 'function') {
          window.AppCoordinator.duplicateSelection();
        }
      });
    }

    const btnDeselectAllLites = document.getElementById('btnDeselectAllLites');
    if (btnDeselectAllLites) {
      btnDeselectAllLites.addEventListener('click', () => {
        if (window.AppCoordinator && typeof window.AppCoordinator.clearSelection === 'function') {
          window.AppCoordinator.clearSelection({ reason: 'lite_multi_toolbar_deselect' });
        } else {
          this.deselectLite();
        }
      });
    }

    bindField('liteNameInput', 'name');
    bindField('liteXNum', 'x', true);
    bindField('liteYNum', 'y', true);
    bindField('liteVariantSelect', 'variant');
    bindField('liteColorPicker', 'color');
    bindPair('liteOpacity', 'opacity');
    bindPair('liteWidth', 'width', true);
    bindPair('liteHeight', 'height', true);
    bindPair('liteRotation', 'rotation');
    bindPair('liteArmThickness', 'armThickness');
    bindField('liteLockAspectChk', 'maintainAspectRatio', false, true);
    bindField('liteShowGuideChk', 'showGuide', false, true);
    bindPair('liteCornerRadius', 'cornerRadius', true);
    bindPair('liteStrokeWidth', 'strokeWidth');
    bindPair('liteSegments', 'segments', true);
    const ratioPresetSel = document.getElementById('liteRatioPresetSelect');
    if (ratioPresetSel) {
      ratioPresetSel.addEventListener('change', (e) => {
        const val = e.target.value;
        const customRow = document.getElementById('liteRatioCustomRow');
        if (val === 'custom') {
          if (customRow) customRow.style.display = '';
        } else {
          if (customRow) customRow.style.display = 'none';
          this.updateActive('lineGapRatio', val);
          if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
        }
      });
    }
    bindField('liteRatioInput', 'lineGapRatio');
    bindField('liteDirectionSelect', 'direction');
    bindField('litePlaybackModeSelect', 'playbackMode');
    bindField('liteStyleSelect', 'segmentStyle');
    bindPair('liteSpeed', 'speed');
    bindField('liteBurstCyclesNum', 'burstCycles', true);
    bindField('litePauseSecondsNum', 'pauseSeconds', true);
    bindField('litePauseVisibilitySelect', 'pauseVisibility');
    bindPair('liteMinScale', 'minScale');
    bindPair('liteMaxScale', 'maxScale');
    bindPair('litePeriod', 'period');
    bindPair('liteIntensity', 'intensity');
    bindPair('liteFlashDur', 'durationMs', true);
    bindField('liteRepeatChk', 'repeat', false, true);
    bindPair('liteFlashRepeatInterval', 'repeatInterval');
    bindField('liteVisibleChk', 'visible', false, true);

    // Flow Lite inspector bindings
    const bindFlowActivePt = (srcId, dstId) => {
      const src = document.getElementById(srcId);
      const dst = document.getElementById(dstId);
      if (!src) return;
      src.addEventListener('input', (e) => {
        const idx = Math.max(0, (parseInt(e.target.value, 10) || 1) - 1);
        if (dst) dst.value = idx + 1;
        this.selectWaypoint(idx);
      });
    };
    bindFlowActivePt('liteFlowActivePtSlider', 'liteFlowActivePtNum');
    bindFlowActivePt('liteFlowActivePtNum', 'liteFlowActivePtSlider');

    const bindFlowPtCoord = (sliderId, numId, axis) => {
      const s = document.getElementById(sliderId);
      const n = document.getElementById(numId);
      const handle = (src, dst) => {
        if (!src) return;
        src.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          if (!Number.isFinite(val)) return;
          if (dst) dst.value = val;
          this.updateActiveWaypointCoord(axis, val);
        });
        src.addEventListener('change', () => {
          if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
        });
      };
      handle(s, n);
      handle(n, s);
    };
    bindFlowPtCoord('liteFlowPtXSlider', 'liteFlowPtXNum', 'x');
    bindFlowPtCoord('liteFlowPtYSlider', 'liteFlowPtYNum', 'y');

    const bindFlowBend = (sliderId, numId) => {
      const s = document.getElementById(sliderId);
      const n = document.getElementById(numId);
      const handle = (src, dst) => {
        if (!src) return;
        src.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          if (!Number.isFinite(val)) return;
          if (dst) dst.value = val;
          this.updateActiveSectionBend(val);
        });
        src.addEventListener('change', () => {
          if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
        });
      };
      handle(s, n);
      handle(n, s);
    };
    bindFlowBend('liteFlowSectionBendSlider', 'liteFlowSectionBendNum');

    bindPair('liteFlowCurvature', 'curvature');
    bindField('liteFlowShowGuideChk', 'showGuide', false, true);
    bindPair('liteFlowDashLength', 'dashLength');
    bindPair('liteFlowGapLength', 'gapLength');
    bindPair('liteFlowDotSize', 'dotSize');
    bindPair('liteFlowStrokeWidth', 'strokeWidth');
    bindField('liteFlowCapStyleSelect', 'segmentStyle');
    bindField('liteFlowStartModeSelect', 'startMode');
    bindField('liteFlowEndModeSelect', 'endMode');
    bindField('liteFlowDirectionSelect', 'direction');
    bindField('liteFlowPlaybackModeSelect', 'playbackMode');
    bindPair('liteFlowSpeed', 'speed');
    bindPair('liteFlowDelay', 'delay');
    bindPair('liteFlowEndDelay', 'endDelay');

    // Radar Ping Lite inspector bindings
    bindField('liteRadarShowGuideChk', 'showGuide', false, true);
    bindPair('liteRadarRings', 'rings', true);
    bindPair('liteRadarMinScale', 'minScale');
    bindPair('liteRadarMaxScale', 'maxScale');
    bindPair('liteRadarPeriod', 'period');
    bindPair('liteRadarStrokeWidth', 'strokeWidth');

    // Gauge / Level Lite inspector bindings
    bindPair('liteGaugeValue', 'value');
    bindField('liteGaugeMinNum', 'minValue', true);
    bindField('liteGaugeMaxNum', 'maxValue', true);
    bindField('liteGaugeBgColorPicker', 'bgColor');
    bindField('liteGaugeDirectionSelect', 'direction');
    bindPair('liteGaugeSegments', 'segments', true);
    bindPair('liteGaugeStrokeWidth', 'strokeWidth');
    bindField('liteGaugeShowGuideChk', 'showGuide', false, true);
    bindField('liteGaugeUnitInput', 'unit');
    bindField('liteGaugeLabelInput', 'labelText');
    bindField('liteGaugeUseThresholdsChk', 'useThresholds', false, true);
    bindField('liteGaugeThresh1Chk', 'threshold1Enabled', false, true);
    bindField('liteGaugeThresh1Num', 'threshold1Value', true);
    bindField('liteGaugeThresh1ColorPicker', 'threshold1Color');
    bindField('liteGaugeThresh2Chk', 'threshold2Enabled', false, true);
    bindField('liteGaugeThresh2Num', 'threshold2Value', true);
    bindField('liteGaugeThresh2ColorPicker', 'threshold2Color');
    bindField('liteGaugeThresh3Chk', 'threshold3Enabled', false, true);
    bindField('liteGaugeWarnThresholdNum', 'threshold3Value', true);
    bindField('liteGaugeWarnColorPicker', 'threshold3Color');
    bindField('liteGaugeThresh4Chk', 'threshold4Enabled', false, true);
    bindField('liteGaugeCritThresholdNum', 'threshold4Value', true);
    bindField('liteGaugeCritColorPicker', 'threshold4Color');

    // Oscilloscope Lite inspector bindings
    bindField('liteOscModeSelect', 'playbackMode');
    bindField('liteOscBgColorPicker', 'bgColor');
    bindField('liteOscShowGuideChk', 'showGuide', false, true);
    bindPair('liteOscAmplitude', 'intensity');
    bindPair('liteOscCycles', 'segments', true);
    bindPair('liteOscBaseline', 'startOffset');
    bindPair('liteOscStrokeWidth', 'strokeWidth');
    bindPair('liteOscSpeed', 'speed');
    bindField('liteOscDirectionSelect', 'direction');
    bindField('liteOscSamplesInput', 'samples');

    // Text Box Lite inspector bindings
    bindField('liteTextContentInput', 'labelText');
    bindField('liteTextFontSelect', 'fontFamily');
    bindPair('liteTextFontSize', 'fontSize');
    bindField('liteTextFontWeightSelect', 'fontWeight');
    bindPair('liteTextLetterSpacing', 'letterSpacing');
    bindField('liteTextAlignSelect', 'textAlign');
    bindField('liteTextVerticalAlignSelect', 'verticalAlign');
    bindPair('liteTextPadding', 'padding');
    bindField('liteTextBgColorPicker', 'bgColor');
    bindPair('liteTextBgOpacity', 'bgOpacity');
    bindField('liteTextBorderColorPicker', 'borderColor');
    bindPair('liteTextStrokeWidth', 'strokeWidth');
    bindPair('liteTextCurvature', 'curvature');
    bindPair('liteTextStartOffset', 'startOffset');
    bindField('liteTextShowGuideChk', 'showGuide', false, true);
    bindField('liteTextAnimSelect', 'textAnim');
    bindField('liteTextPlaybackModeSelect', 'playbackMode');
    bindPair('liteTextScrollSpeed', 'scrollSpeed');
    bindPair('liteTextLinesPerSec', 'linesPerSec');
    bindPair('liteTextLineSpacing', 'lineSpacing');
    bindField('liteTextWordWrapChk', 'wordWrap', false, true);
    bindField('liteTextDirectionSelect', 'direction');
    bindPair('liteTextTypeSpeed', 'typeSpeed');
    bindField('liteTextTypeModeSelect', 'typeMode');
    bindField('liteTextTypeRepeatChk', 'typeRepeat', false, true);
    bindPair('liteTextCycleSpeed', 'speed');
    bindPair('liteTextHoldDelay', 'holdDelay');
    bindField('liteTextLockOnOffChk', 'lockOnOff', false, true);
    bindPair('liteTextClearDuration', 'clearDuration');
    bindPair('liteDelay', 'delay');
    bindField('litePlayChk', 'play', false, true);

    const btnLiteDelayPlayhead = document.getElementById('btnLiteDelayFromPlayhead');
    if (btnLiteDelayPlayhead) {
      btnLiteDelayPlayhead.addEventListener('click', () => {
        if (this.activeId && window.AppCoordinator && typeof window.AppCoordinator.setStartDelayFromPlayhead === 'function') {
          window.AppCoordinator.setStartDelayFromPlayhead('lite', this.activeId);
        }
      });
    }

    const btnLiteFlowDelayPlayhead = document.getElementById('btnLiteFlowDelayFromPlayhead');
    if (btnLiteFlowDelayPlayhead) {
      btnLiteFlowDelayPlayhead.addEventListener('click', () => {
        if (this.activeId && window.AppCoordinator && typeof window.AppCoordinator.setStartDelayFromPlayhead === 'function') {
          window.AppCoordinator.setStartDelayFromPlayhead('lite', this.activeId);
        }
      });
    }
  },

  addWaypointToActive() {
    if (!this.activeId) return null;
    const le = this.getLiteEffect(this.activeId);
    if (!le || le.kind !== 'flow-lite') return null;
    const pts = Array.isArray(le.points) ? le.points.map((p) => ({ x: p.x, y: p.y })) : [{ x: 25, y: 50 }, { x: 75, y: 50 }];
    const bends = Array.isArray(le.bends) ? le.bends.slice() : new Array(Math.max(1, pts.length - 1)).fill(0);
    const insertAfter = Math.max(0, Math.min(pts.length - 2, this.activePointIndex));
    const p1 = pts[insertAfter];
    const p2 = pts[insertAfter + 1] || p1;
    const midPt = {
      x: Math.round(((p1.x + p2.x) / 2) * 100) / 100,
      y: Math.round(((p1.y + p2.y) / 2) * 100) / 100
    };
    pts.splice(insertAfter + 1, 0, midPt);
    bends.splice(insertAfter + 1, 0, 0);
    this.activePointIndex = insertAfter + 1;
    const updated = this.updateLiteEffect(this.activeId, { points: pts, bends });
    if (updated) {
      this.syncEditorUI(updated);
      this.triggerAppRender();
      if (window.FloatingPropertiesEditor && window.FloatingPropertiesEditor.isOpen && window.FloatingPropertiesEditor.activeType === 'lite') {
        window.FloatingPropertiesEditor.syncFromActiveObject();
      }
      if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
    }
    return updated;
  },

  dropWaypointFromActive() {
    if (!this.activeId) return null;
    const le = this.getLiteEffect(this.activeId);
    if (!le || le.kind !== 'flow-lite') return null;
    const pts = Array.isArray(le.points) ? le.points.map((p) => ({ x: p.x, y: p.y })) : [];
    if (pts.length <= 2) return le;
    const bends = Array.isArray(le.bends) ? le.bends.slice() : new Array(pts.length - 1).fill(0);
    const dropIdx = Math.max(0, Math.min(pts.length - 1, this.activePointIndex));
    pts.splice(dropIdx, 1);
    const bendDropIdx = Math.min(bends.length - 1, dropIdx);
    bends.splice(bendDropIdx, 1);
    this.activePointIndex = Math.max(0, Math.min(pts.length - 1, this.activePointIndex));
    const updated = this.updateLiteEffect(this.activeId, { points: pts, bends });
    if (updated) {
      this.syncEditorUI(updated);
      this.triggerAppRender();
      if (window.FloatingPropertiesEditor && window.FloatingPropertiesEditor.isOpen && window.FloatingPropertiesEditor.activeType === 'lite') {
        window.FloatingPropertiesEditor.syncFromActiveObject();
      }
      if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
    }
    return updated;
  },

  selectWaypoint(index) {
    if (!this.activeId) return;
    const le = this.getLiteEffect(this.activeId);
    if (!le || le.kind !== 'flow-lite' || !Array.isArray(le.points)) return;
    this.activePointIndex = Math.max(0, Math.min(le.points.length - 1, Number(index) || 0));
    this.syncEditorUI(le);
    if (window.FloatingPropertiesEditor && window.FloatingPropertiesEditor.isOpen && window.FloatingPropertiesEditor.activeType === 'lite') {
      window.FloatingPropertiesEditor.syncFromActiveObject();
    }
    if (window.AppCoordinator && typeof window.AppCoordinator.updateActiveOverlays === 'function') {
      window.AppCoordinator.updateActiveOverlays();
    }
  },

  updateActiveWaypointCoord(axis, value) {
    if (!this.activeId) return;
    const le = this.getLiteEffect(this.activeId);
    if (!le || le.kind !== 'flow-lite' || !Array.isArray(le.points)) return;
    const idx = Math.max(0, Math.min(le.points.length - 1, this.activePointIndex));
    const pts = le.points.map((p) => ({ x: p.x, y: p.y }));
    pts[idx][axis] = Math.round(Number(value) * 100) / 100;
    this.updateActive('points', pts);
  },

  updateActiveSectionBend(value) {
    if (!this.activeId) return;
    const le = this.getLiteEffect(this.activeId);
    if (!le || le.kind !== 'flow-lite' || !Array.isArray(le.points)) return;
    const secCount = Math.max(1, le.points.length - 1);
    const secIdx = Math.max(0, Math.min(secCount - 1, this.activePointIndex));
    const bends = Array.isArray(le.bends) ? le.bends.slice() : new Array(secCount).fill(0);
    while (bends.length < secCount) bends.push(0);
    bends[secIdx] = Math.max(-100, Math.min(100, Number(value) || 0));
    this.updateActive('bends', bends);
  },

  translateFlowLitePoints(id, deltaXPct, deltaYPct) {
    const le = this.getLiteEffect(id);
    if (!le || le.kind !== 'flow-lite' || !Array.isArray(le.points)) return null;
    const pts = le.points.map((p) => ({
      x: Math.round((p.x + deltaXPct) * 1000) / 1000,
      y: Math.round((p.y + deltaYPct) * 1000) / 1000
    }));
    return this.updateLiteEffect(id, { points: pts });
  },

  addByKind(kind) {
    const dims = (window.AppCoordinator && typeof window.AppCoordinator.getCanvasDimensions === 'function')
      ? window.AppCoordinator.getCanvasDimensions()
      : { width: (window.Stage && window.Stage.canvasWidth) || 1280, height: (window.Stage && window.Stage.canvasHeight) || 720 };
    const cw = Number(dims && dims.width) || 1280;
    const ch = Number(dims && dims.height) || 720;
    const isSmallCanvas = cw < 480 || ch < 360;
    const offset = isSmallCanvas
      ? (this.list.length % 5) * Math.max(1, Math.round(Math.min(cw, ch) * 0.04))
      : (this.list.length % 5) * 28;
    const offsetPct = (this.list.length % 5) * 3;
    const initial = {
      kind,
      x: isSmallCanvas ? Math.round(cw / 2) + offset : 240 + offset,
      y: isSmallCanvas ? Math.round(ch / 2) + offset : 180 + offset
    };
    if (isSmallCanvas && kind !== 'flow-lite') {
      initial.width = Math.min(kind === 'text-lite' ? 220 : 180, Math.max(8, Math.round(cw * 0.8)));
      initial.height = Math.min(kind === 'text-lite' ? 56 : 76, Math.max(8, Math.round(ch * 0.8)));
      if (kind === 'radar-lite') {
        const maxR = Math.max(6, Math.round(Math.min(cw, ch) * 0.42));
        initial.outerRadius = Math.min(90, maxR);
        initial.innerRadius = Math.min(18, Math.max(2, Math.round(maxR * 0.2)));
      }
    }
    if (kind === 'flow-lite') {
      initial.points = [
        { x: 22 + offsetPct, y: 45 + offsetPct },
        { x: 74 + offsetPct, y: 45 + offsetPct }
      ];
      initial.bends = [0];
      this.activePointIndex = 0;
    }
    const created = this.createLiteEffect(initial);
    this.selectLite(created.id);
    this.renderList();
    this.triggerAppRender();
    if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
    return created;
  },

  selectLite(id, opts = {}) {
    this.activeId = String(id);
    const le = this.getLiteEffect(id);
    if (le && le.kind === 'flow-lite') {
      document.body.classList.add('editing-flow');
    } else {
      document.body.classList.remove('editing-flow');
    }
    this.syncEditorUI(le);
    this.renderList();
    this.updateUIOverlay(le);
    if (typeof window.syncInspectorLayerSections === 'function') {
      window.syncInspectorLayerSections();
    }
    if (!opts.skipCoordinator && window.AppCoordinator && typeof window.AppCoordinator.selectObject === 'function') {
      window.AppCoordinator.selectObject('lite', String(id), { openAccordionId: 'acc-lite-effects' });
    }
  },

  updateUIOverlay(targetLite) {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('dynamicFlowReticles');
    const pathEl = document.getElementById('flowCurvePath');
    if (!container || !pathEl) return;

    // Do not clobber main DataFlows reticles when a main Flow is active
    if (window.DataFlows && window.DataFlows.activeId !== null) return;

    const le = targetLite !== undefined ? targetLite : (this.activeId ? this.getLiteEffect(this.activeId) : null);
    if (!le || le.kind !== 'flow-lite' || le.visible === false || !Array.isArray(le.points)) {
      container.innerHTML = '';
      pathEl.style.display = 'none';
      return;
    }

    document.body.classList.add('editing-flow');
    const geom = this._computeFlowLiteGeometry(le, 0, 0);
    if (le.points.length >= 2) {
      pathEl.style.display = 'block';
      pathEl.setAttribute('d', geom.pathD);
      pathEl.setAttribute('stroke', le.color || '#38bdf8');
    } else {
      pathEl.style.display = 'none';
    }

    const safeColor = this.sanitizeColor(le.color, '#38bdf8');
    const existingReticles = container.querySelectorAll('[data-lite-flow-pt-idx]');
    if (existingReticles.length === le.points.length) {
      le.points.forEach((pt, idx) => {
        const isActive = idx === this.activePointIndex;
        const el = existingReticles[idx];
        el.className = 'reticle' + (isActive ? ' active-reticle' : '');
        el.style.left = pt.x + '%';
        el.style.top = pt.y + '%';
        el.style.background = isActive ? (safeColor + '4D') : 'rgba(0,0,0,0.65)';
        el.style.borderColor = safeColor;
        el.style.zIndex = isActive ? '12' : '11';
      });
    } else {
      container.innerHTML = '';
      le.points.forEach((pt, idx) => {
        const isActive = idx === this.activePointIndex;
        const ret = document.createElement('div');
        ret.className = 'reticle' + (isActive ? ' active-reticle' : '');
        ret.setAttribute('data-flow-node-idx', String(idx));
        ret.setAttribute('data-lite-flow-pt-idx', String(idx));
        ret.style.left = (Number(pt.x) || 0) + '%';
        ret.style.top = (Number(pt.y) || 0) + '%';
        ret.style.pointerEvents = 'auto';
        ret.style.background = isActive ? (safeColor + '4D') : 'rgba(0,0,0,0.65)';
        ret.style.borderColor = safeColor;
        ret.style.zIndex = isActive ? '12' : '11';
        ret.style.cursor = 'grab';
        ret.textContent = 'P' + (idx + 1);
        container.appendChild(ret);
      });
    }
  },

  handleStageClick(xPct, yPct, dragMode = null) {
    if (!this.activeId) return false;
    const le = this.getLiteEffect(this.activeId);
    if (!le) return false;
    if (le.kind === 'flow-lite' && Array.isArray(le.points) && le.points.length >= 2) {
      if (dragMode === 'translate' && Array.isArray(this._dragStartPoints) && this._dragStartAnchor) {
        const dx = Number(xPct) - this._dragStartAnchor.x;
        const dy = Number(yPct) - this._dragStartAnchor.y;
        const nextPts = this._dragStartPoints.map((p) => ({
          x: Math.round((p.x + dx) * 100) / 100,
          y: Math.round((p.y + dy) * 100) / 100
        }));
        const updated = this.updateLiteEffect(this.activeId, { points: nextPts });
        if (updated) {
          this.syncEditorUI(updated);
          this.updateUIOverlay(updated);
          this.triggerAppRender();
          return true;
        }
        return false;
      }
      const idx = Math.max(0, Math.min(le.points.length - 1, this.activePointIndex));
      const nextPts = le.points.map((p) => ({ x: p.x, y: p.y }));
      nextPts[idx] = {
        x: Math.round(Number(xPct) * 100) / 100,
        y: Math.round(Number(yPct) * 100) / 100
      };
      const updated = this.updateLiteEffect(this.activeId, { points: nextPts });
      if (updated) {
        this.syncEditorUI(updated);
        this.updateUIOverlay(updated);
        this.triggerAppRender();
        return true;
      }
      return false;
    }
    const cw = (window.Stage && window.Stage.canvasWidth) || 1280;
    const ch = (window.Stage && window.Stage.canvasHeight) || 720;
    const nextX = Math.round((Number(xPct) / 100) * cw);
    const nextY = Math.round((Number(yPct) / 100) * ch);
    const updated = this.updateLiteEffect(this.activeId, { x: nextX, y: nextY });
    if (updated) {
      this.syncEditorUI(updated);
      this.triggerAppRender();
      return true;
    }
    return false;
  },

  deselectLite() {
    this.activeId = null;
    document.body.classList.remove('editing-flow');
    this.updateUIOverlay(null);
    this.syncEditorUI(null);
    this.renderList();
    if (typeof window.syncInspectorLayerSections === 'function') {
      window.syncInspectorLayerSections();
    }
    if (window.AppCoordinator &&
        window.AppCoordinator.activeSelection &&
        window.AppCoordinator.activeSelection.type === 'lite' &&
        !window.AppCoordinator._isCoordinatingSelection) {
      window.AppCoordinator.clearSelection();
    }
  },

  updateActive(key, value) {
    if (!this.activeId) return;
    const existing = this.getLiteEffect(this.activeId);
    if (!existing) return;

    const patch = { [key]: value };
    const isCircleTracer = existing.kind === 'perimeter-tracer' && (key === 'variant' ? value === 'circle' : existing.variant === 'circle');
    const lockAspect = isCircleTracer || (key === 'maintainAspectRatio' ? Boolean(value) : Boolean(existing.maintainAspectRatio));

    if (key === 'width' && lockAspect) {
      if (isCircleTracer || existing.width === existing.height) {
        patch.height = value;
      } else if (existing.width > 0 && existing.height > 0) {
        patch.height = Math.max(5, Math.round(value * (existing.height / existing.width)));
      }
    } else if (key === 'height' && lockAspect) {
      if (isCircleTracer || existing.width === existing.height) {
        patch.width = value;
      } else if (existing.width > 0 && existing.height > 0) {
        patch.width = Math.max(5, Math.round(value * (existing.width / existing.height)));
      }
    } else if (key === 'variant' && existing.kind === 'perimeter-tracer' && value === 'circle') {
      patch.height = existing.width || 140;
      patch.maintainAspectRatio = true;
    }

    if (key === 'minScale' && Number(value) >= (Number(existing.maxScale) || 1.15)) {
      patch.maxScale = Math.round((Number(value) + 0.1) * 100) / 100;
    } else if (key === 'maxScale' && Number(value) <= (Number(existing.minScale) || (existing.kind === 'radar-lite' ? 0.15 : 0.85))) {
      patch.minScale = Math.max(0.05, Math.round((Number(value) - 0.1) * 100) / 100);
    } else if (key === 'variant' && existing.kind === 'radar-lite') {
      if (value === 'single') {
        patch.rings = 1;
      } else if ((value === 'multi' || value === 'fading-ping') && (!existing.rings || existing.rings < 2)) {
        patch.rings = 3;
      }
    } else if (existing.kind === 'gauge-lite') {
      if (key === 'variant') {
        if (value === 'ring') {
          patch.width = 96;
          patch.height = 96;
          patch.maintainAspectRatio = true;
          if (!existing.strokeWidth || existing.strokeWidth < 4) patch.strokeWidth = 8.0;
        } else if (value === 'hbar' || value === 'segmented') {
          patch.width = 160;
          patch.height = 32;
          patch.maintainAspectRatio = false;
        } else if (value === 'vbar') {
          patch.width = 36;
          patch.height = 140;
          patch.maintainAspectRatio = false;
        } else if (value === 'level') {
          patch.width = 84;
          patch.height = 120;
          patch.maintainAspectRatio = false;
          if (existing.strokeWidth > 6) patch.strokeWidth = 2.5;
        }
      } else if (key === 'minValue' && Number(value) >= Number(existing.maxValue)) {
        patch.maxValue = Number(value) + 10;
      } else if (key === 'maxValue' && Number(value) <= Number(existing.minValue)) {
        patch.minValue = Number(value) - 10;
      } else if (key === 'warnThreshold' && Number(value) > Number(existing.critThreshold)) {
        patch.critThreshold = Number(value);
      } else if (key === 'critThreshold' && Number(value) < Number(existing.warnThreshold)) {
        patch.warnThreshold = Number(value);
      } else if (/^threshold([1-4])(Enabled|Value|Color)$/.test(key)) {
        const m = /^threshold([1-4])(Enabled|Value|Color)$/.exec(key);
        const idx = parseInt(m[1], 10) - 1;
        const field = m[2];
        const bands = Array.isArray(existing.thresholds) && existing.thresholds.length === 4
          ? existing.thresholds.map((b) => Object.assign({}, b))
          : [
              { enabled: false, value: 40, color: '#22c55e' },
              { enabled: false, value: 60, color: '#eab308' },
              { enabled: Boolean(existing.useThresholds), value: Number(existing.warnThreshold) || 70, color: existing.warnColor || '#f59e0b' },
              { enabled: Boolean(existing.useThresholds), value: Number(existing.critThreshold) || 90, color: existing.critColor || '#ef4444' }
            ];
        if (field === 'Enabled') bands[idx].enabled = Boolean(value);
        else if (field === 'Value' && Number.isFinite(Number(value))) bands[idx].value = Number(value);
        else if (field === 'Color' && value) bands[idx].color = String(value);
        patch.thresholds = bands;
        patch.useThresholds = bands.some((b) => b.enabled);
        if (idx === 2) {
          patch.warnThreshold = bands[2].value;
          patch.warnColor = bands[2].color;
        } else if (idx === 3) {
          patch.critThreshold = bands[3].value;
          patch.critColor = bands[3].color;
        }
      } else if (key === 'useThresholds') {
        const bands = Array.isArray(existing.thresholds) && existing.thresholds.length === 4
          ? existing.thresholds.map((b) => Object.assign({}, b))
          : [
              { enabled: false, value: 40, color: '#22c55e' },
              { enabled: false, value: 60, color: '#eab308' },
              { enabled: false, value: Number(existing.warnThreshold) || 70, color: existing.warnColor || '#f59e0b' },
              { enabled: false, value: Number(existing.critThreshold) || 90, color: existing.critColor || '#ef4444' }
            ];
        if (!value) {
          bands.forEach((b) => { b.enabled = false; });
        } else if (!bands.some((b) => b.enabled)) {
          bands[2].enabled = true;
          bands[3].enabled = true;
        }
        patch.thresholds = bands;
      }
    } else if (existing.kind === 'text-lite') {
      if (key === 'variant') {
        if (value === 'none' || value === 'curved') {
          patch.bgOpacity = 0;
          patch.strokeWidth = 0;
        } else if (existing.variant === 'none' || existing.variant === 'curved') {
          if (!existing.bgOpacity || existing.bgOpacity <= 0) patch.bgOpacity = 0.85;
          if (!existing.strokeWidth || existing.strokeWidth <= 0) patch.strokeWidth = 1.5;
        }
        if (value === 'curved' && ['ticker-h', 'ticker-v', 'stacked-v', 'slide', 'scramble', 'overtype'].includes(existing.textAnim)) {
          patch.textAnim = 'none';
        }
      } else if (key === 'lockOnOff' && Boolean(value)) {
        patch.clearDuration = existing.holdDelay !== undefined ? existing.holdDelay : 1.5;
      } else if (key === 'holdDelay' && existing.lockOnOff) {
        patch.clearDuration = Number(value);
      } else if (key === 'clearDuration' && existing.lockOnOff) {
        patch.holdDelay = Number(value);
      }
    }

    const updated = this.updateLiteEffect(this.activeId, patch);
    if (updated) {
      this.syncEditorUI(updated);
      this.renderList();
      this.triggerAppRender();
      if (window.AppCoordinator && typeof window.AppCoordinator.emit === 'function') {
        window.AppCoordinator.emit('layers:changed');
      }
      if (typeof window.renderWidgetParametersOverview === 'function') {
        window.renderWidgetParametersOverview();
      }
      if (window.FloatingPropertiesEditor && window.FloatingPropertiesEditor.isOpen && window.FloatingPropertiesEditor.activeType === 'lite') {
        window.FloatingPropertiesEditor.syncFromActiveObject();
      }
    }
  },

  removeLite(id) {
    this.deleteLiteEffect(id);
    this.syncEditorUI(null);
    this.renderList();
    this.triggerAppRender();
    if (window.AppCoordinator) window.AppCoordinator.recordHistoryImmediate();
  },

  syncEditorUI(le) {
    const editor = document.getElementById('liteEditorControls');
    const empty = document.getElementById('liteEmptyHint');
    if (!editor || !empty) return;
    if (!le) {
      editor.style.display = 'none';
      empty.style.display = 'block';
      return;
    }
    editor.style.display = 'block';
    empty.style.display = 'none';

    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el && document.activeElement !== el) el.value = v;
    };
    const setPair = (baseId, v) => { setVal(baseId + 'Slider', v); setVal(baseId + 'Num', v); };
    const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = Boolean(v); };

    const lbl = document.getElementById('editingLiteLabel');
    if (lbl) lbl.textContent = `Editing ${le.name || (le.kind + ' ' + le.id)}`;

    const variantSel = document.getElementById('liteVariantSelect');
    if (variantSel) {
      const optsByKind = {
        'perimeter-tracer': ['rounded', 'rect', 'circle', 'ellipse'],
        'pulse': ['circle', 'square', 'diamond', 'cross', 'ring'],
        'flash': ['diamond', 'circle', 'square', 'cross', 'star'],
        'flow-lite': ['dashed', 'dotted', 'single'],
        'radar-lite': ['multi', 'single', 'fading-ping'],
        'gauge-lite': ['ring', 'hbar', 'vbar', 'segmented', 'level'],
        'oscilloscope-lite': ['ecg', 'sine', 'square', 'triangle', 'sawtooth', 'polyline', 'bezier'],
        'text-lite': ['rounded', 'rect', 'pill', 'none', 'curved']
      };
      const labelsByOpt = {
        'multi': 'Multiple Pings (multi)',
        'single': 'Single Ping (single)',
        'fading-ping': 'Fading Ping (fading-ping)',
        'ring': 'Circular / Ring Gauge (ring)',
        'hbar': 'Horizontal Bar Gauge (hbar)',
        'vbar': 'Vertical Bar Gauge (vbar)',
        'segmented': 'Segmented Bar Gauge (segmented)',
        'level': 'Filled-Level Indicator (level)',
        'ecg': 'ECG / Heartbeat (ecg)',
        'sine': 'Sine Wave (sine)',
        'square': 'Square Wave (square)',
        'triangle': 'Triangle Wave (triangle)',
        'sawtooth': 'Sawtooth Wave (sawtooth)',
        'polyline': 'Angular Polyline (polyline)',
        'bezier': 'Bézier-Smoothed Curve (bezier)',
        'rounded': 'Rounded Box (rounded)',
        'rect': 'Rectangle Box (rect)',
        'pill': 'Pill / Capsule (pill)',
        'none': 'Floating Text / No Box (none)',
        'curved': 'Curved Text on Arc (curved)'
      };
      const opts = optsByKind[le.kind] || ['circle'];
      variantSel.innerHTML = opts.map((o) => `<option value="${o}">${(['radar-lite', 'gauge-lite', 'oscilloscope-lite', 'text-lite'].includes(le.kind)) && labelsByOpt[o] ? labelsByOpt[o] : o}</option>`).join('');
    }

    const durMs = Math.round((Number(le.dur) || 0.10) * 1000);
    setVal('liteNameInput', le.name || '');
    setVal('liteXNum', Math.round(Number(le.x) || 240));
    setVal('liteYNum', Math.round(Number(le.y) || 180));
    setVal('liteVariantSelect', le.variant || '');
    setVal('liteColorPicker', le.color || '#38bdf8');
    setPair('liteOpacity', le.opacity != null ? le.opacity : 0.9);
    setPair('liteWidth', Math.round(Number(le.width) || (le.kind === 'perimeter-tracer' ? 140 : (le.kind === 'text-lite' ? 220 : 56))));
    setPair('liteHeight', Math.round(Number(le.height) || (le.kind === 'perimeter-tracer' ? 80 : 56)));
    setPair('liteRotation', Math.round(Number(le.rotation) || 0));
    setPair('liteArmThickness', le.armThickness != null ? le.armThickness : 3);
    setChk('liteLockAspectChk', le.kind === 'perimeter-tracer' && le.variant === 'circle' ? true : Boolean(le.maintainAspectRatio));
    setChk('liteShowGuideChk', le.showGuide !== false);
    setPair('liteCornerRadius', Math.round(Number(le.cornerRadius != null ? le.cornerRadius : 10)));
    setPair('liteStrokeWidth', le.strokeWidth || 2.5);
    setPair('liteSegments', le.segments || 2);
    const ratioVal = le.lineGapRatio || '1:3';
    const knownRatios = ['1:1', '1:2', '1:3', '1:4', '1:5', '1:6', '2:1', '2:3', '3:1', '3:2'];
    const isKnownRatio = knownRatios.includes(ratioVal);
    setVal('liteRatioPresetSelect', isKnownRatio ? ratioVal : 'custom');
    setVal('liteRatioInput', ratioVal);
    const customRow = document.getElementById('liteRatioCustomRow');
    if (customRow) customRow.style.display = isKnownRatio ? 'none' : '';
    setVal('liteDirectionSelect', le.direction || 'cw');
    setVal('litePlaybackModeSelect', le.playbackMode || 'loop');
    setVal('liteStyleSelect', le.segmentStyle || 'rounded');
    setPair('liteSpeed', le.speed || 3.0);
    setVal('liteBurstCyclesNum', Math.round(Number(le.burstCycles) || 0));
    setVal('litePauseSecondsNum', Number(le.pauseSeconds) || 0);
    setVal('litePauseVisibilitySelect', le.pauseVisibility || 'hide');
    setPair('liteMinScale', le.minScale != null ? le.minScale : 0.85);
    setPair('liteMaxScale', le.maxScale != null ? le.maxScale : 1.15);
    setPair('litePeriod', le.period || 1.8);
    setPair('liteIntensity', le.intensity != null ? le.intensity : (le.kind === 'flash' ? 0.75 : 0.85));
    setPair('liteFlashDur', durMs);
    setChk('liteRepeatChk', le.repeat);
    setPair('liteFlashRepeatInterval', le.repeatInterval || 2.0);
    setChk('liteVisibleChk', le.visible !== false);
    setChk('litePlayChk', le.play !== false);
    setPair('liteDelay', le.delay || 0);

    const startDelayRow = document.getElementById('liteStartDelayRow');
    if (startDelayRow) {
      const showSharedDelay = ['perimeter-tracer', 'pulse', 'flash', 'radar-lite'].includes(le.kind) ||
        (le.kind === 'text-lite' && Boolean(le.textAnim) && le.textAnim !== 'none');
      startDelayRow.style.display = showSharedDelay ? '' : 'none';
    }

    const dimGroup = document.getElementById('liteDimensionsGroup');
    const posRow = document.getElementById('liteXNum') ? document.getElementById('liteXNum').closest('.inspector-prop-row') : null;
    const tracerGroup = document.getElementById('liteTracerGroup');
    const cornerRow = document.getElementById('liteCornerRadiusRow');
    const armRow = document.getElementById('liteArmThicknessRow');
    const pulseGroup = document.getElementById('litePulseGroup');
    const flashGroup = document.getElementById('liteFlashGroup');
    const flowGroup = document.getElementById('liteFlowGroup');
    const radarGroup = document.getElementById('liteRadarGroup');
    const gaugeGroup = document.getElementById('liteGaugeGroup');
    const oscGroup = document.getElementById('liteOscGroup');
    const textGroup = document.getElementById('liteTextGroup');
    const intensityRow = document.getElementById('liteIntensityRow');
    if (dimGroup) dimGroup.style.display = le.kind === 'flow-lite' ? 'none' : '';
    if (posRow) posRow.style.display = le.kind === 'flow-lite' ? 'none' : '';
    if (tracerGroup) tracerGroup.style.display = le.kind === 'perimeter-tracer' ? 'block' : 'none';
    if (cornerRow) cornerRow.style.display = ((le.kind === 'perimeter-tracer' && le.variant === 'rounded') || (le.kind === 'gauge-lite' && ['hbar', 'vbar', 'level'].includes(le.variant)) || le.kind === 'oscilloscope-lite' || (le.kind === 'text-lite' && le.variant === 'rounded')) ? '' : 'none';
    if (armRow) armRow.style.display = ((le.kind === 'pulse' || le.kind === 'flash') && (le.variant === 'cross' || le.variant === 'star')) ? '' : 'none';
    if (pulseGroup) pulseGroup.style.display = le.kind === 'pulse' ? 'block' : 'none';
    if (flashGroup) flashGroup.style.display = le.kind === 'flash' ? 'block' : 'none';
    if (flowGroup) flowGroup.style.display = le.kind === 'flow-lite' ? 'block' : 'none';
    if (radarGroup) radarGroup.style.display = le.kind === 'radar-lite' ? 'block' : 'none';
    if (gaugeGroup) gaugeGroup.style.display = le.kind === 'gauge-lite' ? 'block' : 'none';
    if (oscGroup) oscGroup.style.display = le.kind === 'oscilloscope-lite' ? 'block' : 'none';
    if (textGroup) textGroup.style.display = le.kind === 'text-lite' ? 'block' : 'none';
    if (intensityRow) intensityRow.style.display = (le.kind === 'pulse' || le.kind === 'flash') ? '' : 'none';

    if (le.kind === 'text-lite') {
      const isCurved = le.variant === 'curved';
      const isBoxed = le.variant === 'rect' || le.variant === 'rounded' || le.variant === 'pill';
      const anim = le.textAnim || 'none';
      setVal('liteTextContentInput', le.labelText !== undefined ? le.labelText : 'System Ready');
      setVal('liteTextFontSelect', le.fontFamily || 'modern-sans');
      setPair('liteTextFontSize', le.fontSize || 18);
      setVal('liteTextFontWeightSelect', le.fontWeight || '600');
      setPair('liteTextLetterSpacing', le.letterSpacing !== undefined ? le.letterSpacing : 0);
      setVal('liteTextAlignSelect', le.textAlign || 'center');
      setVal('liteTextVerticalAlignSelect', le.verticalAlign || 'middle');
      setPair('liteTextPadding', le.padding !== undefined ? le.padding : 12);
      setVal('liteTextBgColorPicker', le.bgColor || '#0f172a');
      setPair('liteTextBgOpacity', le.bgOpacity !== undefined ? le.bgOpacity : (isBoxed ? 0.85 : 0));
      setVal('liteTextBorderColorPicker', le.borderColor || '#38bdf8');
      setPair('liteTextStrokeWidth', le.strokeWidth !== undefined ? le.strokeWidth : (isBoxed ? 1.5 : 0));
      setPair('liteTextCurvature', le.curvature !== undefined ? le.curvature : 35);
      setPair('liteTextStartOffset', le.startOffset !== undefined ? le.startOffset : 50);
      setChk('liteTextShowGuideChk', Boolean(le.showGuide));

      const animSel = document.getElementById('liteTextAnimSelect');
      if (animSel) {
        Array.from(animSel.options).forEach((opt) => {
          opt.disabled = isCurved && ['ticker-h', 'ticker-v', 'stacked-v', 'slide', 'scramble'].includes(opt.value);
        });
      }
      const normAnim = anim === 'overtype' ? 'typewriter' : anim;
      setVal('liteTextAnimSelect', normAnim);
      setVal('liteTextPlaybackModeSelect', ['loop', 'once', 'pingpong'].includes(le.playbackMode) ? le.playbackMode : 'loop');
      setPair('liteTextScrollSpeed', le.scrollSpeed || 90);
      setPair('liteTextLinesPerSec', le.linesPerSec || 1.2);
      setPair('liteTextLineSpacing', le.lineSpacing || 1.25);
      setChk('liteTextWordWrapChk', le.wordWrap !== false);
      setVal('liteTextDirectionSelect', (le.direction === 'reverse' || le.direction === 'ccw') ? 'reverse' : 'forward');
      setPair('liteTextTypeSpeed', le.typeSpeed || 14);
      const normTypeMode = le.typeMode === 'loop' ? 'delete' : (le.typeMode || 'hold');
      setVal('liteTextTypeModeSelect', normTypeMode);
      const normRepeat = le.typeMode === 'loop' ? true : (le.typeRepeat !== undefined ? Boolean(le.typeRepeat) : (normTypeMode === 'delete' || normTypeMode === 'delete-forward'));
      setChk('liteTextTypeRepeatChk', normRepeat);
      setPair('liteTextCycleSpeed', le.speed !== undefined ? le.speed : (normAnim === 'flash' ? 0.15 : 0.8));
      setPair('liteTextHoldDelay', le.holdDelay !== undefined ? le.holdDelay : 1.5);
      setChk('liteTextLockOnOffChk', Boolean(le.lockOnOff));
      setPair('liteTextClearDuration', le.lockOnOff && normAnim === 'flash' ? (le.holdDelay !== undefined ? le.holdDelay : 1.5) : (le.clearDuration !== undefined ? le.clearDuration : 0.6));

      const vAlignRow = document.getElementById('liteTextVerticalAlignRow');
      const boxStyleGroup = document.getElementById('liteTextBoxStyleGroup');
      const curvedGroup = document.getElementById('liteTextCurvedGroup');
      const playbackRow = document.getElementById('liteTextPlaybackModeRow');
      const scrollSpdRow = document.getElementById('liteTextScrollSpeedRow');
      const lpsRow = document.getElementById('liteTextLinesPerSecRow');
      const lsRow = document.getElementById('liteTextLineSpacingRow');
      const wwRow = document.getElementById('liteTextWordWrapRow');
      const dirRow = document.getElementById('liteTextDirectionRow');
      const typeSpdRow = document.getElementById('liteTextTypeSpeedRow');
      const typeSpdLbl = document.getElementById('liteTextTypeSpeedLabel');
      const typeModeRow = document.getElementById('liteTextTypeModeRow');
      const typeRepRow = document.getElementById('liteTextTypeRepeatRow');
      const cycleSpdRow = document.getElementById('liteTextCycleSpeedRow');
      const cycleSpdLbl = document.getElementById('liteTextCycleSpeedLabel');
      const holdRow = document.getElementById('liteTextHoldDelayRow');
      const holdLbl = document.getElementById('liteTextHoldDelayLabel');
      const lockRow = document.getElementById('liteTextLockOnOffRow');
      const clearRow = document.getElementById('liteTextClearDurationRow');
      const clearLbl = document.getElementById('liteTextClearDurationLabel');

      if (vAlignRow) vAlignRow.style.display = isCurved ? 'none' : '';
      if (boxStyleGroup) boxStyleGroup.style.display = isBoxed ? '' : 'none';
      if (curvedGroup) curvedGroup.style.display = isCurved ? '' : 'none';
      if (playbackRow) playbackRow.style.display = (normAnim !== 'none' && normAnim !== 'typewriter') ? '' : 'none';
      if (scrollSpdRow) scrollSpdRow.style.display = normAnim === 'ticker-h' ? '' : 'none';
      if (lpsRow) lpsRow.style.display = normAnim === 'ticker-v' ? '' : 'none';
      if (lsRow) lsRow.style.display = (normAnim === 'none' || normAnim === 'ticker-v' || normAnim === 'stacked-v') ? '' : 'none';
      if (wwRow) wwRow.style.display = normAnim === 'ticker-v' ? '' : 'none';
      if (dirRow) dirRow.style.display = (['ticker-h', 'ticker-v', 'stacked-v', 'slide'].includes(normAnim)) ? '' : 'none';
      if (typeSpdRow) typeSpdRow.style.display = (['typewriter', 'scramble', 'stacked-v'].includes(normAnim)) ? '' : 'none';
      if (typeSpdLbl) typeSpdLbl.textContent = normAnim === 'stacked-v' ? 'Scroll Rate (chars/s)' : 'Rate (chars/s)';
      if (typeModeRow) typeModeRow.style.display = normAnim === 'typewriter' ? '' : 'none';
      if (typeRepRow) typeRepRow.style.display = normAnim === 'typewriter' ? '' : 'none';
      if (cycleSpdRow) cycleSpdRow.style.display = (['fade', 'flash', 'slide', 'blur-in', 'blur-out'].includes(normAnim)) ? '' : 'none';
      if (cycleSpdLbl) {
        cycleSpdLbl.textContent = normAnim === 'fade' ? 'Fade Duration (s)' : (normAnim === 'flash' ? 'Fade-In Duration (s)' : 'Transition Duration (s)');
      }
      if (holdRow) holdRow.style.display = (['typewriter', 'fade', 'flash', 'slide', 'blur-in', 'blur-out', 'scramble'].includes(normAnim)) ? '' : 'none';
      if (holdLbl) {
        holdLbl.textContent = normAnim === 'fade' ? 'Visible Hold Duration (s)' : (normAnim === 'flash' ? 'On Hold Duration (s)' : 'Hold Pause (s)');
      }
      if (lockRow) lockRow.style.display = normAnim === 'flash' ? '' : 'none';
      if (clearRow) clearRow.style.display = (normAnim === 'fade' || normAnim === 'flash') ? '' : 'none';
      if (clearLbl) {
        clearLbl.textContent = normAnim === 'flash' ? 'Off Duration (s)' : 'Clear Duration (s)';
      }
    }

    if (le.kind === 'gauge-lite') {
      const minV = le.minValue !== undefined ? le.minValue : 0;
      const maxV = le.maxValue !== undefined ? le.maxValue : 100;
      const valSlider = document.getElementById('liteGaugeValueSlider');
      if (valSlider) {
        valSlider.min = String(minV);
        valSlider.max = String(maxV);
        valSlider.step = String(Math.max(0.01, Math.round(((maxV - minV) / 200) * 100) / 100));
      }
      setPair('liteGaugeValue', le.value !== undefined ? le.value : 65);
      setVal('liteGaugeMinNum', minV);
      setVal('liteGaugeMaxNum', maxV);
      setVal('liteGaugeBgColorPicker', le.bgColor || '#1e293b');
      setVal('liteGaugeDirectionSelect', (le.direction === 'reverse' || le.direction === 'ccw') ? 'reverse' : 'forward');
      setPair('liteGaugeSegments', le.segments || 10);
      setPair('liteGaugeStrokeWidth', le.strokeWidth || (le.variant === 'ring' ? 8.0 : 2.0));
      setChk('liteGaugeShowGuideChk', le.showGuide !== false);
      setVal('liteGaugeUnitInput', le.unit !== undefined ? le.unit : '%');
      setVal('liteGaugeLabelInput', le.labelText || '');
      const bands = (Array.isArray(le.thresholds) && le.thresholds.length === 4)
        ? le.thresholds
        : [
            { enabled: false, value: 40, color: '#22c55e' },
            { enabled: false, value: 60, color: '#eab308' },
            { enabled: Boolean(le.useThresholds), value: le.warnThreshold !== undefined ? le.warnThreshold : 70, color: le.warnColor || '#f59e0b' },
            { enabled: Boolean(le.useThresholds), value: le.critThreshold !== undefined ? le.critThreshold : 90, color: le.critColor || '#ef4444' }
          ];
      setChk('liteGaugeUseThresholdsChk', bands.some((b) => b.enabled));
      setChk('liteGaugeThresh1Chk', Boolean(bands[0].enabled));
      setVal('liteGaugeThresh1Num', bands[0].value);
      setVal('liteGaugeThresh1ColorPicker', bands[0].color || '#22c55e');
      setChk('liteGaugeThresh2Chk', Boolean(bands[1].enabled));
      setVal('liteGaugeThresh2Num', bands[1].value);
      setVal('liteGaugeThresh2ColorPicker', bands[1].color || '#eab308');
      setChk('liteGaugeThresh3Chk', Boolean(bands[2].enabled));
      setVal('liteGaugeWarnThresholdNum', bands[2].value);
      setVal('liteGaugeWarnColorPicker', bands[2].color || '#f59e0b');
      setChk('liteGaugeThresh4Chk', Boolean(bands[3].enabled));
      setVal('liteGaugeCritThresholdNum', bands[3].value);
      setVal('liteGaugeCritColorPicker', bands[3].color || '#ef4444');
      const segRow = document.getElementById('liteGaugeSegmentsRow');
      if (segRow) segRow.style.display = le.variant === 'segmented' ? '' : 'none';
    }

    if (le.kind === 'oscilloscope-lite') {
      const mode = ['static', 'animated', 'sampled'].includes(le.playbackMode) ? le.playbackMode : 'animated';
      setVal('liteOscModeSelect', mode);
      setVal('liteOscBgColorPicker', le.bgColor || '#0b1322');
      setChk('liteOscShowGuideChk', le.showGuide !== false);
      setPair('liteOscAmplitude', le.intensity !== undefined ? le.intensity : 0.75);
      setPair('liteOscCycles', le.segments || 2);
      setPair('liteOscBaseline', le.startOffset !== undefined ? le.startOffset : 50);
      setPair('liteOscStrokeWidth', le.strokeWidth || 2.2);
      setPair('liteOscSpeed', le.speed || le.period || 2.4);
      setVal('liteOscDirectionSelect', (le.direction === 'reverse' || le.direction === 'ccw') ? 'reverse' : 'forward');
      setVal('liteOscSamplesInput', le.samples || '0, 0.4, 0.9, 0.3, -0.5, -0.9, -0.2, 0.6, 1.0, 0.2, -0.4, 0');
      const cycRow = document.getElementById('liteOscCyclesRow');
      const spdRow = document.getElementById('liteOscSpeedRow');
      const dirRow = document.getElementById('liteOscDirectionRow');
      const smpRow = document.getElementById('liteOscSamplesRow');
      if (cycRow) cycRow.style.display = mode === 'sampled' ? 'none' : '';
      if (spdRow) spdRow.style.display = mode === 'animated' ? '' : 'none';
      if (dirRow) dirRow.style.display = mode === 'animated' ? '' : 'none';
      if (smpRow) smpRow.style.display = mode === 'sampled' ? '' : 'none';
    }

    if (le.kind === 'radar-lite') {
      setChk('liteRadarShowGuideChk', le.showGuide !== false);
      setPair('liteRadarRings', le.variant === 'single' ? 1 : (le.rings || 3));
      setPair('liteRadarMinScale', le.minScale != null ? le.minScale : 0.15);
      setPair('liteRadarMaxScale', le.maxScale != null ? le.maxScale : 1.0);
      setPair('liteRadarPeriod', le.period || le.speed || 2.4);
      setPair('liteRadarStrokeWidth', le.strokeWidth || 2.0);
      const ringsRow = document.getElementById('liteRadarRingsRow');
      if (ringsRow) ringsRow.style.display = le.variant === 'single' ? 'none' : '';
    }

    if (le.kind === 'flow-lite') {
      const pts = Array.isArray(le.points) && le.points.length >= 2 ? le.points : [{ x: 25, y: 50 }, { x: 75, y: 50 }];
      const bends = Array.isArray(le.bends) ? le.bends : new Array(pts.length - 1).fill(0);
      if (this.activePointIndex >= pts.length) this.activePointIndex = pts.length - 1;
      if (this.activePointIndex < 0) this.activePointIndex = 0;
      const activePt = pts[this.activePointIndex] || pts[0];
      const secIdx = Math.min(pts.length - 2, this.activePointIndex);
      const secBend = Number(bends[secIdx]) || 0;

      const ptSlider = document.getElementById('liteFlowActivePtSlider');
      const ptNum = document.getElementById('liteFlowActivePtNum');
      if (ptSlider) { ptSlider.max = String(pts.length); ptSlider.value = String(this.activePointIndex + 1); }
      if (ptNum) { ptNum.max = String(pts.length); ptNum.value = String(this.activePointIndex + 1); }
      const dropBtn = document.getElementById('btnDropLiteFlowNode');
      if (dropBtn) dropBtn.disabled = pts.length <= 2;

      setPair('liteFlowPtX', Math.round(activePt.x * 10) / 10);
      setPair('liteFlowPtY', Math.round(activePt.y * 10) / 10);
      setPair('liteFlowSectionBend', secBend);
      setPair('liteFlowCurvature', Number(le.curvature) || 0);
      setChk('liteFlowShowGuideChk', le.showGuide !== false);
      setPair('liteFlowDashLength', le.dashLength || (le.variant === 'single' ? 36 : 18));
      setPair('liteFlowGapLength', le.gapLength || 14);
      setPair('liteFlowDotSize', le.dotSize || 5);
      setPair('liteFlowStrokeWidth', le.strokeWidth || 3);
      setVal('liteFlowCapStyleSelect', le.segmentStyle || 'rounded');
      setVal('liteFlowStartModeSelect', le.startMode || 'tunnel');
      setVal('liteFlowEndModeSelect', le.endMode || 'tunnel');
      setVal('liteFlowDirectionSelect', le.direction === 'reverse' ? 'reverse' : 'forward');
      setVal('liteFlowPlaybackModeSelect', le.playbackMode || 'loop');
      setPair('liteFlowSpeed', le.speed || 2.0);
      setPair('liteFlowDelay', le.delay || 0);
      setPair('liteFlowEndDelay', le.endDelay || 0);

      const isDotted = le.variant === 'dotted';
      const isSingle = le.variant === 'single';
      const dashRow = document.getElementById('liteFlowDashLengthRow');
      const gapRow = document.getElementById('liteFlowGapLengthRow');
      const dotRow = document.getElementById('liteFlowDotSizeRow');
      const swRow = document.getElementById('liteFlowStrokeWidthRow');
      const capRow = document.getElementById('liteFlowCapStyleRow');
      if (dashRow) dashRow.style.display = isDotted ? 'none' : '';
      if (gapRow) gapRow.style.display = isSingle ? 'none' : '';
      if (dotRow) dotRow.style.display = isDotted ? '' : 'none';
      if (swRow) swRow.style.display = isDotted ? 'none' : '';
      if (capRow) capRow.style.display = isDotted ? 'none' : '';
    }

    if (typeof window.syncInspectorLayerSections === 'function') {
      window.syncInspectorLayerSections();
    }
    if (typeof window.renderWidgetParametersOverview === 'function') {
      window.renderWidgetParametersOverview();
    }
  },

  renderList() {
    const listEl = document.getElementById('liteEffectsList');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (this.list.length === 0) {
      listEl.innerHTML = '<div class="stage-hint" id="emptyLiteListHint">No low-load effects active.</div>';
      return;
    }
    const iconByKind = { 'perimeter-tracer': '▭', 'pulse': '◎', 'flash': '✦', 'flow-lite': '↝', 'radar-lite': '◉', 'gauge-lite': '◕', 'oscilloscope-lite': '∿', 'text-lite': 'T' };
    const kindShort = { 'perimeter-tracer': 'Tracer', 'pulse': 'Pulse', 'flash': 'Flash', 'flow-lite': 'Flow', 'radar-lite': 'Radar', 'gauge-lite': 'Gauge', 'oscilloscope-lite': 'Osc', 'text-lite': 'Text' };
    this.list.forEach((le) => {
      const row = document.createElement('div');
      const isSel = (window.AppCoordinator && typeof window.AppCoordinator.isObjectSelected === 'function')
        ? window.AppCoordinator.isObjectSelected('lite', le.id)
        : (String(this.activeId) === String(le.id));
      const isPrimary = String(this.activeId) === String(le.id);
      row.className = 'flow-list-item compact-instance-row' +
        (isPrimary ? ' active primary-selected' : '') +
        (isSel ? ' selected' : '');
      row.dataset.liteListId = String(le.id);
      const label = le.name || `${kindShort[le.kind] || le.kind}-${le.id}`;
      const meta = kindShort[le.kind] || le.kind;
      row.innerHTML = `<span class="instance-icon">${iconByKind[le.kind] || '⚡'}</span>
        <span class="instance-label">${this.escapeXML(label)}</span>
        <span class="compact-meta">${this.escapeXML(meta)}</span>
        <button type="button" class="btn-row-action btn-row-delete" title="Delete">&times;</button>`;
      row.addEventListener('click', (e) => {
        if (e.target.closest('.btn-row-delete')) {
          this.removeLite(le.id);
          return;
        }
        if (e && (e.shiftKey || e.ctrlKey || e.metaKey)) {
          if (window.AppCoordinator && typeof window.AppCoordinator.toggleObjectSelection === 'function') {
            window.AppCoordinator.toggleObjectSelection('lite', String(le.id));
            return;
          }
        }
        if (isPrimary && (!window.AppCoordinator || window.AppCoordinator.getSelectedItems().length <= 1)) {
          if (window.AppCoordinator && typeof window.AppCoordinator.clearSelection === 'function') {
            window.AppCoordinator.clearSelection({ reason: 'sidebar_toggle_lite' });
          } else {
            this.deselectLite();
          }
        } else {
          this.selectLite(le.id);
        }
      });
      listEl.appendChild(row);
    });
  },
};
