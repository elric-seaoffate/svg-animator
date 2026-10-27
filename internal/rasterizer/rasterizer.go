package rasterizer

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/chromedp/chromedp"
)

// ProgressFunc reports the current frame index, total frame count, and active pipeline stage.
type ProgressFunc func(currentFrame, totalFrames int, phase string)

// Export preserves backward compatibility for headless CLI invocations.
func Export(htmlPath, outPath, format string, durationSecs float64, fps int, loopMode string, dims ...int) error {
	return ExportContext(context.Background(), htmlPath, outPath, format, durationSecs, fps, loopMode, nil, dims...)
}

// ExportContext processes an HTML file containing the SVG animation and encodes a single target format.
func ExportContext(ctx context.Context, htmlPath, outPath, format string, durationSecs float64, fps int, loopMode string, onProgress ProgressFunc, dims ...int) error {
	width, height, fps, captureDuration, totalFrames := normalizeParams(durationSecs, fps, loopMode, dims...)

	localTemp := filepath.Join(".", "render_workspace")
	os.MkdirAll(localTemp, 0755)

	frameDir, err := os.MkdirTemp(localTemp, "svg-frames-*")
	if err != nil {
		return fmt.Errorf("failed to create temp frame directory: %w", err)
	}
	defer os.RemoveAll(frameDir)

	if err := captureFrames(ctx, htmlPath, frameDir, captureDuration, fps, width, height, onProgress); err != nil {
		return fmt.Errorf("frame capture failed: %w", err)
	}

	if format == "webp" {
		if onProgress != nil {
			onProgress(totalFrames, totalFrames, "Encoding Animated WebP via FFmpeg...")
		}
		return encodeWebP(ctx, frameDir, outPath, fps, loopMode)
	}

	if onProgress != nil {
		onProgress(totalFrames, totalFrames, "Encoding APNG via FFmpeg...")
	}
	return encodeAPNG(ctx, frameDir, outPath, fps, loopMode)
}

// ExportBothContext captures the SVG frames once and encodes both Animated WebP and APNG from the same frame buffer.
func ExportBothContext(ctx context.Context, htmlPath, webpOutPath, apngOutPath string, durationSecs float64, fps int, loopMode string, onProgress ProgressFunc, dims ...int) error {
	width, height, fps, captureDuration, totalFrames := normalizeParams(durationSecs, fps, loopMode, dims...)

	localTemp := filepath.Join(".", "render_workspace")
	os.MkdirAll(localTemp, 0755)

	frameDir, err := os.MkdirTemp(localTemp, "svg-frames-*")
	if err != nil {
		return fmt.Errorf("failed to create temp frame directory: %w", err)
	}
	defer os.RemoveAll(frameDir)

	if err := captureFrames(ctx, htmlPath, frameDir, captureDuration, fps, width, height, onProgress); err != nil {
		return fmt.Errorf("frame capture failed: %w", err)
	}

	if onProgress != nil {
		onProgress(totalFrames, totalFrames, "Encoding Animated WebP (1/2)...")
	}
	if err := encodeWebP(ctx, frameDir, webpOutPath, fps, loopMode); err != nil {
		return err
	}

	if onProgress != nil {
		onProgress(totalFrames, totalFrames, "Encoding APNG (2/2)...")
	}
	if err := encodeAPNG(ctx, frameDir, apngOutPath, fps, loopMode); err != nil {
		return err
	}

	return nil
}

func normalizeParams(durationSecs float64, fps int, loopMode string, dims ...int) (int, int, int, float64, int) {
	width := 1920
	height := 1080
	if len(dims) >= 2 && dims[0] > 0 && dims[1] > 0 {
		width = dims[0]
		height = dims[1]
	}
	if fps <= 0 {
		fps = 24
	}
	if durationSecs <= 0 {
		durationSecs = 7.0
	}

	captureDuration := durationSecs
	if loopMode == "pingpong" {
		captureDuration = durationSecs * 2.0
	}

	totalFrames := int(captureDuration * float64(fps))
	if totalFrames < 1 {
		totalFrames = 1
	}

	return width, height, fps, captureDuration, totalFrames
}

func captureFrames(parentCtx context.Context, htmlPath, frameDir string, duration float64, fps, width, height int, onProgress ProgressFunc) error {
	totalFrames := int(duration * float64(fps))
	if totalFrames < 1 {
		totalFrames = 1
	}

	if onProgress != nil {
		onProgress(0, totalFrames, "Initializing vector rasterization pipeline...")
	}

	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("headless", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("allow-file-access-from-files", true),
		chromedp.Flag("window-size", fmt.Sprintf("%d,%d", width, height)),
	)

	allocCtx, cancelAlloc := chromedp.NewExecAllocator(parentCtx, opts...)
	defer cancelAlloc()

	ctx, cancel := chromedp.NewContext(allocCtx)
	defer cancel()

	ctx, cancelTimeout := context.WithTimeout(ctx, 15*time.Minute)
	defer cancelTimeout()

	absPath, err := filepath.Abs(htmlPath)
	if err != nil {
		return fmt.Errorf("failed to get absolute html path: %w", err)
	}
	fileURL := "file://" + filepath.ToSlash(absPath)

	scrubberJS := `
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
				const deriv = (3 * ax * t + 2 * bx) * t + cx;
				if (Math.abs(deriv) < 1e-6) break;
				t -= currentX / deriv;
			}
			const cy = 3 * y1;
			const by = 3 * (y2 - y1) - cy;
			const ay = 1 - cy - by;
			return ((ay * t + by) * t + cy) * t;
		}

		function setAnimTime(ms) {
			const sec = ms / 1000.0;
			
			// 1. Scrub CSS Keyframes (Camera Rig pan/zoom/handheld transforms)
			document.getAnimations().forEach(anim => {
				anim.pause();
				anim.currentTime = ms;
			});
			
			// 2. Scrub standard SVG SMIL animations (glows, data flows, ripples)
			document.querySelectorAll('svg').forEach(svg => { 
				if (svg.setCurrentTime) { 
					svg.pauseAnimations(); 
					svg.setCurrentTime(sec); 
				} 
			});

			// 3. Force-override SVG filters & masks with full keyTimes + keySplines support
			document.querySelectorAll('filter animate, filter animateTransform, mask animate, mask animateTransform').forEach(anim => {
				const parent = anim.parentElement;
				const attr = anim.getAttribute('attributeName');
				let dur = parseFloat(anim.getAttribute('dur'));
				if (isNaN(dur) || dur <= 0) dur = 1.0;
				const begin = parseFloat(anim.getAttribute('begin')) || 0.0;

				const localSec = sec - begin;
				if (localSec < 0) return;

				let progress;
				if (anim.getAttribute('repeatCount') === 'indefinite') {
					progress = (localSec % dur) / dur;
				} else {
					progress = localSec / dur;
					if (progress > 1.0) progress = 1.0;
				}
				if (progress < 0.0) progress = 0.0;
				
				let fromAttr = anim.getAttribute('from');
				let toAttr = anim.getAttribute('to');
				let segProgress = progress;

				const calcMode = anim.getAttribute('calcMode') || 'linear';
				const splinesAttr = anim.getAttribute('keySplines');
				const splines = splinesAttr ? splinesAttr.split(';').map(s => s.trim()).filter(Boolean) : [];
				const keyTimesAttr = anim.getAttribute('keyTimes');
				const keyTimes = keyTimesAttr ? keyTimesAttr.split(';').map(k => parseFloat(k.trim())).filter(k => !isNaN(k)) : [];

				if (anim.hasAttribute('values')) {
					const vals = anim.getAttribute('values').split(';').map(v => v.trim()).filter(v => v !== '');
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
							let scaled = progress * numSegments;
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
					
					let resultVals = [];
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

			// 4. Force synchronous style & layout flush so the frame buffer is up to date before capture
			const svgEl = document.querySelector('svg');
			if (svgEl) {
				void svgEl.getBoundingClientRect();
			}
			return true;
		}
	`

	cssOverrideJS := `
		document.body.style.margin = '0';
		document.body.style.padding = '0';
		document.body.style.overflow = 'hidden';
		document.body.style.backgroundColor = '#000000';
		
		var vp = document.querySelector('.viewport');
		if (vp) {
			vp.style.all = 'unset';
			vp.style.display = 'block';
			vp.style.width = '100vw';
			vp.style.height = '100vh';
		}
		
		var svg = document.querySelector('svg');
		if (svg) {
			svg.style.position = 'absolute';
			svg.style.top = '0';
			svg.style.left = '0';
			svg.style.width = '100vw';
			svg.style.height = '100vh';
			svg.style.margin = '0';
			svg.style.display = 'block';
			svg.setAttribute('preserveAspectRatio', 'none'); 
		}
	`

	fmt.Println(">> Target URL:", fileURL)
	fmt.Println(">> Initializing vector rasterization pipeline...")

	if _, err := chromedp.Run(ctx, chromedp.Navigate(fileURL)); err != nil {
		return fmt.Errorf("failed to navigate: %w", err)
	}

	if _, err := chromedp.Run(ctx, chromedp.WaitReady(`svg`)); err != nil {
		return fmt.Errorf("svg failed to render: %w", err)
	}

	if _, err := chromedp.Run(ctx, chromedp.Evaluate[any](cssOverrideJS)); err != nil {
		return fmt.Errorf("failed to inject css overrides: %w", err)
	}

	if _, err := chromedp.Run(ctx, chromedp.Evaluate[any](scrubberJS)); err != nil {
		return fmt.Errorf("failed to inject scrubber: %w", err)
	}

	fmt.Printf(">> Capturing %d frames at %d FPS (%dx%d)...\n", totalFrames, fps, width, height)

	for i := 0; i < totalFrames; i++ {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("render canceled: %w", err)
		}

		ms := float64(i) * (1000.0 / float64(fps))
		framePath := filepath.Join(frameDir, fmt.Sprintf("frame_%04d.png", i))

		if _, err := chromedp.Run(ctx, chromedp.Evaluate[any](fmt.Sprintf("setAnimTime(%f)", ms))); err != nil {
			return fmt.Errorf("failed scrubbing frame %d: %w", i, err)
		}

		select {
		case <-ctx.Done():
			return fmt.Errorf("render canceled: %w", ctx.Err())
		case <-time.After(35 * time.Millisecond):
		}

		buf, err := chromedp.Run(ctx, chromedp.CaptureScreenshot())
		if err != nil {
			return fmt.Errorf("failed capturing frame %d: %w", i, err)
		}
		if err := os.WriteFile(framePath, buf, 0644); err != nil {
			return err
		}

		if onProgress != nil {
			onProgress(i+1, totalFrames, fmt.Sprintf("Capturing frame %d of %d", i+1, totalFrames))
		}
	}

	fmt.Println(">> Frame capture complete. Encoding...")
	return nil
}

func encodeWebP(ctx context.Context, frameDir, outPath string, fps int, loopMode string) error {
	inputPattern := filepath.Join(frameDir, "frame_%04d.png")
	args := []string{"-y", "-framerate", fmt.Sprintf("%d", fps), "-i", inputPattern, "-vcodec", "libwebp", "-lossless", "0", "-qscale", "80", "-an"}

	if loopMode == "once" {
		args = append(args, "-loop", "1")
	} else {
		args = append(args, "-loop", "0")
	}

	args = append(args, outPath)
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)

	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("ffmpeg WebP encode failed: %v\nOutput: %s", err, string(out))
	}
	return nil
}

func encodeAPNG(ctx context.Context, frameDir, outPath string, fps int, loopMode string) error {
	inputPattern := filepath.Join(frameDir, "frame_%04d.png")

	args := []string{"-y", "-framerate", fmt.Sprintf("%d", fps), "-i", inputPattern, "-f", "apng"}

	if loopMode == "once" {
		args = append(args, "-plays", "1")
	} else {
		args = append(args, "-plays", "0")
	}

	args = append(args, outPath)
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)

	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("ffmpeg APNG encode failed: %v\nOutput: %s", err, string(out))
	}
	return nil
}