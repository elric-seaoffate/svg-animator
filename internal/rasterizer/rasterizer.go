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

// Export processes an HTML file containing the SVG animation and encodes it.
func Export(htmlPath, outPath, format string, durationSecs float64, fps int, loopMode string, dims ...int) error {
	width := 1920
	height := 1080
	if len(dims) >= 2 && dims[0] > 0 && dims[1] > 0 {
		width = dims[0]
		height = dims[1]
	}

	localTemp := filepath.Join(".", "render_workspace")
	os.MkdirAll(localTemp, 0755)

	frameDir, err := os.MkdirTemp(localTemp, "svg-frames-*")
	if err != nil {
		return fmt.Errorf("failed to create temp frame directory: %w", err)
	}
	defer os.RemoveAll(frameDir)

	if err := captureFrames(htmlPath, frameDir, durationSecs, fps, width, height); err != nil {
		return fmt.Errorf("frame capture failed: %w", err)
	}

	if format == "webp" {
		return encodeWebP(frameDir, outPath, fps, loopMode)
	}
	return encodeAPNG(frameDir, outPath, fps, loopMode)
}

func captureFrames(htmlPath, frameDir string, duration float64, fps, width, height int) error {
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("headless", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("allow-file-access-from-files", true),
		chromedp.Flag("window-size", fmt.Sprintf("%d,%d", width, height)),
	)
	
	allocCtx, cancelAlloc := chromedp.NewExecAllocator(context.Background(), opts...)
	defer cancelAlloc()

	ctx, cancel := chromedp.NewContext(allocCtx)
	defer cancel()

	ctx, cancel = context.WithTimeout(ctx, 15*time.Minute)
	defer cancel()

	absPath, err := filepath.Abs(htmlPath)
	if err != nil {
		return fmt.Errorf("failed to get absolute html path: %w", err)
	}
	fileURL := "file://" + filepath.ToSlash(absPath)
	totalFrames := int(duration * float64(fps))

	scrubberJS := `
		function setAnimTime(ms) {
			const sec = ms / 1000.0;
			
			// 1. Scrub CSS Keyframes 
			document.getAnimations().forEach(anim => { anim.pause(); anim.currentTime = ms; });
			
			// 2. Scrub standard SVG animations (glows, data flows, transforms)
			// Chrome handles these natively without the freeze bug.
			document.querySelectorAll('svg').forEach(svg => { 
				if(svg.setCurrentTime) { 
					svg.pauseAnimations(); 
					svg.setCurrentTime(sec); 
				} 
			});

			// 3. Force-override SVG filters ONLY
			// Bypasses the Chrome bug where SMIL tags inside <filter> elements fail to update when paused.
			document.querySelectorAll('filter animate, filter animateTransform').forEach(anim => {
				const parent = anim.parentElement;
				const attr = anim.getAttribute('attributeName');
				let dur = parseFloat(anim.getAttribute('dur'));
				if (isNaN(dur) || dur <= 0) dur = 1.0;
				
				let progress;
				if (anim.getAttribute('repeatCount') === 'indefinite') {
					progress = (sec % dur) / dur;
				} else {
					progress = sec / dur;
					if (progress > 1.0) progress = 1.0;
				}
				if (progress < 0.0) progress = 0.0;
				
				let fromAttr = anim.getAttribute('from');
				let toAttr = anim.getAttribute('to');
				
				if (anim.hasAttribute('values')) {
					const vals = anim.getAttribute('values').split(';').map(v => v.trim()).filter(v => v !== '');
					const numSegments = vals.length - 1;
					if (numSegments > 0) {
						let scaledProgress = progress * numSegments;
						if (scaledProgress > numSegments) scaledProgress = numSegments;
						const index = Math.floor(scaledProgress);
						const segmentProgress = scaledProgress - index;
						
						if (index >= numSegments) {
							fromAttr = vals[numSegments - 1];
							toAttr = vals[numSegments];
							progress = 1.0;
						} else {
							fromAttr = vals[index];
							toAttr = vals[index + 1];
							progress = segmentProgress;
						}
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
							const val = f + (t - f) * progress;
							resultVals.push(val.toFixed(3));
						}
					}
					if (resultVals.length > 0) {
						parent.setAttribute(attr, resultVals.join(' '));
					}
				}
			});
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
	fmt.Println(">> Initializing Chromium headless engine...")

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
		ms := float64(i) * (1000.0 / float64(fps))
		framePath := filepath.Join(frameDir, fmt.Sprintf("frame_%04d.png", i))

		if _, err := chromedp.Run(ctx, chromedp.Evaluate[any](fmt.Sprintf("setAnimTime(%f)", ms))); err != nil {
			return fmt.Errorf("failed scrubbing frame %d: %w", i, err)
		}
		
		time.Sleep(50 * time.Millisecond)
		
		buf, err := chromedp.Run(ctx, chromedp.CaptureScreenshot())
		if err != nil {
			return fmt.Errorf("failed capturing frame %d: %w", i, err)
		}
		if err := os.WriteFile(framePath, buf, 0644); err != nil {
			return err
		}
	}

	fmt.Println(">> Frame capture complete. Encoding...")
	return nil
}

func encodeWebP(frameDir, outPath string, fps int, loopMode string) error {
	inputPattern := filepath.Join(frameDir, "frame_%04d.png")
	args := []string{"-y", "-framerate", fmt.Sprintf("%d", fps), "-i", inputPattern, "-vcodec", "libwebp", "-lossless", "0", "-qscale", "80", "-an"}
	
	if loopMode != "once" {
		args = append(args, "-loop", "0")
	}
	
	args = append(args, outPath)
	cmd := exec.Command("ffmpeg", args...)

	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("ffmpeg WebP encode failed: %v\nOutput: %s", err, string(out))
	}
	return nil
}

func encodeAPNG(frameDir, outPath string, fps int, loopMode string) error {
	inputPattern := filepath.Join(frameDir, "frame_%04d.png")
	
	args := []string{"-y", "-framerate", fmt.Sprintf("%d", fps), "-i", inputPattern, "-f", "apng"}
	
	if loopMode == "once" {
		args = append(args, "-plays", "1")
	} else {
		args = append(args, "-plays", "0")
	}
	
	args = append(args, outPath)
	cmd := exec.Command("ffmpeg", args...)

	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("ffmpeg APNG encode failed: %v\nOutput: %s", err, string(out))
	}
	return nil
}