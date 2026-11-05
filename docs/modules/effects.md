# Module: `effects.js` (`window.Effects`)

## 1. Purpose
`internal/web/static/js/effects.js` is a pure operational module (Layer 3) responsible for generating the base `<svg>` document, background photo or grid pattern markup, optical `<filter>` definitions, CSS `@keyframes` camera rig transforms, and 3D mitered or decorative frame overlays.

## 2. Responsibilities
- **Background Surface & Photo Fitting (`buildPhotoElement`):** Constructs `<image>` elements for uploaded photos supporting `match`, `contain`, `stretch`, and `cover` (with `cropZoom`, `cropX`, `cropY` pan/zoom offsets), or blank canvas patterns (`blueprint`, `dots`, `graph`, `dark-radial`, `solid`).
- **Optical Filters (`Effects.build`):** Constructs SVG `<filter>` and `<mask>` definitions for the supported optical modes (`state.optical.type`):
  - `none` — Unfiltered base surface.
  - `focus-pull` — Animated `<feGaussianBlur>` transitioning between `startBlur` and `endBlur` over `focusDur` (`#opt-focus`).
  - `tilt-shift` — Miniature depth-of-field blur (`#opt-ts-blur`) masked via `#ts-mask` across `horizontal`, `vertical`, or `radial` shapes (`tsPosX`, `tsPos`, `tsWidth`, `tsBlur`).
  - `motion-blur` — Directional `<feGaussianBlur>` computed from angle `mbAng` and intensity `mbInt` (`#opt-mb-blur`).
- **Camera Rig (`Effects.build`):** Generates `.camera-stage-3d` and `.camera-rig` CSS transforms and `@keyframes` (`camKenBurns`, `camHandheld`) for the four camera motion modes (`state.camera.motion`):
  - `static` (`startX`, `startY`, `startZoom`)
  - `ken-burns` (`startX`, `startY`, `startZoom` → `endX`, `endY`, `endZoom` with `once`, `loop`, or `pingpong` playback)
  - `handheld-drift` (8-keyframe organic sway/breathe drift using `sway` and `breathe`)
  - `perspective-tilt` (3D `perspective(1000px) rotateX(...) rotateY(...)` using `tiltX` and `tiltY`)
- **3D Mitered & Technical Frames (`buildMiteredFrame` / `buildFrameMarkup`):** Computes outer/inner bevel polygon coordinates, directional lighting overlays (`tl`, `tr`, `bl`, `br`, `front`), inner fillets, rebate shadows, and decorative HUD/window overlays across the 10 supported frame styles (`state.overlays.frameStyle`):
  - Wood & Metal Mitered Styles: `walnut`, `mahogany`, `gold`, `silver`, `matte`, `obsidian`
  - Technical & Specialty Styles: `blueprint-border`, `cyber-hud`, `mac-window`, `crt-vintage`

## 3. Public Interface (`window.Effects`)
- `Effects.build(state)` — Primary operational builder returning the complete base `<svg>...</svg>` string (with `<!-- INJECT_CAMERA_RIG_ELEMENTS -->` placeholder) for a given `renderState`.
- `Effects.buildPhotoElement(imgInfo, w, h, extraAttrs = '')` — Builds the `<image>` element markup for the given photo fit/crop settings.
- `Effects.buildMiteredFrame(prefix, stopsBright1, stopsBright2, stopsDark1, stopsDark2, filletBrightCols, filletDarkCols, w, h, d, opts = {})` — Computes and returns `{ defs, overlay }` for beveled mitered picture frames.
- `Effects.buildFrameMarkup(overlaysCfg, w, h)` — Dispatches on `overlaysCfg.frameStyle` and returns `{ defs, overlay }` for `#frameAssembly`.

## 4. Dependencies
- **Zero DOM dependencies.** Pure JavaScript string/math functions consuming the `state` object passed by `SceneState.buildFullSVG()`.
