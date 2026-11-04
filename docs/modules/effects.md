# Module: `effects.js` (`window.Effects`)

## 1. Purpose
`internal/web/static/js/effects.js` is a pure operational module (Layer 3) responsible for generating the base `<svg>` document, optical `<filter>` definitions, animated camera pan/zoom/rotate transforms, background photo or canvas fill markup, and 3D mitered frame geometry.

## 2. Responsibilities
- **Optical Filters (`buildFilterDefs`):** Constructs SVG `<filter id="optical-grade">` chains combining exposure, contrast, saturation, color temperature, tint, sepia, hue rotation, Gaussian blur, sharpen convolution, chromatic aberration, animated film grain (`<feTurbulence>`), and radial vignette overlays.
- **Camera Rig (`buildCameraRig` / `buildPhotoElement`):** Wraps canvas contents in SMIL `<animateTransform>` groups for pan, zoom, and rotation (`linear`, `ease-in-out`, `cine-swell`, ping-pong loops).
- **3D Mitered Frame (`buildMiteredFrame` / `buildFrameMarkup`):** Computes outer/inner bevel polygon coordinates, lighting gradients (`frameLightAngle`, `frameLightIntensity`, animated light sweep), inner mat borders, and drop shadows across multiple frame styles (`classic`, `modern`, `ornate`, `metallic`, `neon`, `minimal`).

## 3. Public Interface (`window.Effects`)
- `Effects.build(state)` — Primary operational builder returning the complete base `<svg>...</svg>` string for a given `renderState`.
- `Effects.buildPhotoElement(state, innerW, innerH)` — Builds the `<image>` or `<rect>` background markup.
- `Effects.buildMiteredFrame(state, totalW, totalH)` — Computes and returns the 3D mitered frame `<defs>` and `<g>` markup.
- `Effects.buildFrameMarkup(state)` — Compatibility wrapper for frame generation.

## 4. Dependencies
- **Zero DOM dependencies.** Pure JavaScript string/math functions consuming the `state` object passed by `SceneState.buildFullSVG()`.
