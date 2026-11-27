package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"gitea.seaoffate.net/blackgrape/svg-animator/internal/rasterizer"
	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/chromedp"
)

type Stage17M3Report struct {
	Timestamp             string                    `json:"timestamp"`
	ZeroLeftoverProcesses bool                      `json:"zeroLeftoverProcesses"`
	Panels1440            map[string]any            `json:"panels1440"`
	Panels1280            map[string]any            `json:"panels1280"`
	BrowserChecks         []BrowserCheckResult      `json:"browserChecks"`
	MediaExport           MediaExportResult         `json:"mediaExport"`
	AllPassed             bool                      `json:"allPassed"`
}

type BrowserCheckResult struct {
	Category string `json:"category"`
	Name     string `json:"name"`
	Passed   bool   `json:"passed"`
	Detail   string `json:"detail"`
}

type MediaExportResult struct {
	Width            int               `json:"width"`
	Height           int               `json:"height"`
	FPS              int               `json:"fps"`
	DurationSec      float64           `json:"durationSec"`
	ExpectedFrames   int               `json:"expectedFrames"`
	WebPBytes        int64             `json:"webpBytes"`
	APNGBytes        int64             `json:"apngBytes"`
	MP4Bytes         int64             `json:"mp4Bytes"`
	WebPDecodedCount int               `json:"webpDecodedCount"`
	APNGDecodedCount int               `json:"apngDecodedCount"`
	MP4DecodedCount  int               `json:"mp4DecodedCount"`
	FrameChecks      []FrameDeltaCheck `json:"frameChecks"`
	ElapsedMs        int64             `json:"elapsedMs"`
	Passed           bool              `json:"passed"`
}

type FrameDeltaCheck struct {
	Format      string  `json:"format"`
	Description string  `json:"description"`
	FrameA      int     `json:"frameA"`
	FrameB      int     `json:"frameB"`
	DiffRatio   float64 `json:"diffRatio"`
	ExpectDiff  bool    `json:"expectDiff"`
	Passed      bool    `json:"passed"`
}

func countTargetProcs() int {
	out, err := exec.Command("pgrep", "-f", "svg-chrome-profile|ffmpeg.*image2pipe").Output()
	if err != nil {
		return 0
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	count := 0
	for _, l := range lines {
		if strings.TrimSpace(l) != "" {
			count++
		}
	}
	return count
}

func decodeFrames(mediaPath, outDir string) ([]image.Image, error) {
	if err := os.MkdirAll(outDir, 0755); err != nil {
		return nil, err
	}
	if strings.HasSuffix(strings.ToLower(mediaPath), ".webp") {
		pyScript := `
import sys, os
from PIL import Image, ImageSequence
im = Image.open(sys.argv[1])
out_dir = sys.argv[2]
for i, frame in enumerate(ImageSequence.Iterator(im)):
    frame.convert("RGBA").save(os.path.join(out_dir, f"frame_{i+1:03d}.png"))
`
		cmd := exec.Command("python3", "-c", pyScript, mediaPath, outDir)
		if out, err := cmd.CombinedOutput(); err != nil {
			return nil, fmt.Errorf("pillow decode %s failed: %v (%s)", filepath.Base(mediaPath), err, string(out))
		}
	} else {
		pattern := filepath.Join(outDir, "frame_%03d.png")
		cmd := exec.Command("ffmpeg", "-y", "-i", mediaPath, pattern)
		if out, err := cmd.CombinedOutput(); err != nil {
			return nil, fmt.Errorf("ffmpeg decode %s failed: %v (%s)", filepath.Base(mediaPath), err, string(out))
		}
	}
	matches, err := filepath.Glob(filepath.Join(outDir, "frame_*.png"))
	if err != nil {
		return nil, err
	}
	var imgs []image.Image
	for _, m := range matches {
		f, err := os.Open(m)
		if err != nil {
			return nil, err
		}
		img, err := png.Decode(f)
		f.Close()
		if err != nil {
			return nil, err
		}
		imgs = append(imgs, img)
	}
	return imgs, nil
}

func computeRegionDiffRatio(a, b image.Image, rect image.Rectangle, tol float64) float64 {
	bounds := a.Bounds().Intersect(b.Bounds()).Intersect(rect)
	if bounds.Empty() {
		return 0
	}
	diffPixels := 0
	totalPixels := 0
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			totalPixels++
			r1, g1, b1, a1 := a.At(x, y).RGBA()
			r2, g2, b2, a2 := b.At(x, y).RGBA()
			dr := math.Abs(float64(r1>>8) - float64(r2>>8))
			dg := math.Abs(float64(g1>>8) - float64(g2>>8))
			db := math.Abs(float64(b1>>8) - float64(b2>>8))
			da := math.Abs(float64(a1>>8) - float64(a2>>8))
			if dr > tol || dg > tol || db > tol || da > tol {
				diffPixels++
			}
		}
	}
	if totalPixels == 0 {
		return 0
	}
	return float64(diffPixels) / float64(totalPixels)
}

func computeNonBackgroundRatio(img image.Image, rect image.Rectangle, bgR, bgG, bgB uint8, tol float64) float64 {
	bounds := img.Bounds().Intersect(rect)
	if bounds.Empty() {
		return 0
	}
	fgPixels := 0
	totalPixels := 0
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			totalPixels++
			r, g, b, _ := img.At(x, y).RGBA()
			dr := math.Abs(float64(r>>8) - float64(bgR))
			dg := math.Abs(float64(g>>8) - float64(bgG))
			db := math.Abs(float64(b>>8) - float64(bgB))
			if dr > tol || dg > tol || db > tol {
				fgPixels++
			}
		}
	}
	if totalPixels == 0 {
		return 0
	}
	return float64(fgPixels) / float64(totalPixels)
}

func runLiveBrowserSuite(url, outDir string) (map[string]any, map[string]any, []BrowserCheckResult, string, error) {
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("headless", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("window-size", "1440,900"),
	)
	allocCtx, cancelAlloc := chromedp.NewExecAllocator(context.Background(), opts...)
	defer cancelAlloc()
	ctx, cancel := chromedp.NewContext(allocCtx)
	defer cancel()
	ctx, cancelTimeout := context.WithTimeout(ctx, 90*time.Second)
	defer cancelTimeout()

	if _, err := chromedp.Run(ctx, chromedp.Navigate(url)); err != nil {
		return nil, nil, nil, "", fmt.Errorf("Navigate(%s) failed: %v", url, err)
	}
	_, _ = chromedp.Call(ctx, emulation.SetDeviceMetricsOverride, emulation.SetDeviceMetricsOverrideParams{
		Width: 1440, Height: 900, DeviceScaleFactor: 1.0,
	})
	if _, err := chromedp.Run(ctx, chromedp.WaitReady(`#btnTimelinePlay`)); err != nil {
		return nil, nil, nil, "", fmt.Errorf("WaitReady failed: %v", err)
	}
	time.Sleep(1200 * time.Millisecond)

	// 1. UI Layout & Horizontal Scrollbar Audit at 1440x900 and 1280x800
	panelScanJS := `(() => {
		const panels = [
			{ btn: 'railBtn-nodes', add: 'btnAddNode', acc: 'acc-nodes', animSel: 'nodeAnimSelect', animVal: 'scale-in' },
			{ btn: 'railBtn-flows', add: 'btnAddFlow', acc: 'acc-flows' },
			{ btn: 'railBtn-glows', add: 'btnAddGlow', acc: 'acc-glows' },
			{ btn: 'railBtn-ripples', add: 'btnAddRipple', acc: 'acc-ripples' },
			{ btn: 'railBtn-lite-effects', add: 'btnAddLiteText', acc: 'acc-lite-effects', animSel: 'liteTextAnimSelect', animVal: 'typewriter' }
		];
		const out = {};
		panels.forEach(p => {
			document.getElementById(p.btn).click();
			document.getElementById(p.add).click();
			if (p.animSel) {
				const sel = document.getElementById(p.animSel);
				if (sel) {
					sel.value = p.animVal;
					sel.dispatchEvent(new Event('change'));
				}
			}
			const acc = document.getElementById(p.acc);
			const inputPanel = document.getElementById('inputPanel');
			const detailCol = acc ? acc.querySelector('.inspector-detail-column') : null;
			const masterCol = acc ? acc.querySelector('.inspector-master-column') : null;
			const listEl = acc ? acc.querySelector('.compact-instance-list') : null;
			out[p.acc] = {
				panelHScroll: inputPanel ? (inputPanel.scrollWidth > inputPanel.clientWidth) : false,
				detailHScroll: detailCol ? (detailCol.scrollWidth > detailCol.clientWidth) : false,
				listHScroll: listEl ? (listEl.scrollWidth > listEl.clientWidth) : false,
				panelCW: inputPanel ? inputPanel.clientWidth : 0,
				panelSW: inputPanel ? inputPanel.scrollWidth : 0,
				detailCW: detailCol ? detailCol.clientWidth : 0,
				detailSW: detailCol ? detailCol.scrollWidth : 0,
				masterCW: masterCol ? masterCol.clientWidth : 0,
				masterSW: masterCol ? masterCol.scrollWidth : 0
			};
		});
		return out;
	})()`

	_, _ = chromedp.Run(ctx, chromedp.Evaluate[any](`document.getElementById('railBtn-nodes').click()`))
	time.Sleep(350 * time.Millisecond)
	panels1440, err := chromedp.Run(ctx, chromedp.Evaluate[map[string]any](panelScanJS))
	if err != nil {
		return nil, nil, nil, "", fmt.Errorf("panelScanJS 1440 failed: %v", err)
	}

	_, _ = chromedp.Call(ctx, emulation.SetDeviceMetricsOverride, emulation.SetDeviceMetricsOverrideParams{
		Width: 1280, Height: 800, DeviceScaleFactor: 1.0,
	})
	time.Sleep(350 * time.Millisecond)
	panels1280, err := chromedp.Run(ctx, chromedp.Evaluate[map[string]any](panelScanJS))
	if err != nil {
		return nil, nil, nil, "", fmt.Errorf("panelScanJS 1280 failed: %v", err)
	}

	// Restore 1440x900
	_, _ = chromedp.Call(ctx, emulation.SetDeviceMetricsOverride, emulation.SetDeviceMetricsOverrideParams{
		Width: 1440, Height: 900, DeviceScaleFactor: 1.0,
	})
	time.Sleep(200 * time.Millisecond)

	// 2. Comprehensive Stage 17-M3 Verification in Live Chromium
	verifyM3JS := `(() => {
		const checks = [];
		const addCheck = (category, name, passed, detail) => {
			checks.push({ category, name, passed: Boolean(passed), detail: String(detail || '') });
		};

		window.confirm = () => true;
		window.ProjectManager.resetToNewProject();
		window.EngineBridge.setWidgetParameters([]);

		// Configure 640x360 dark canvas, 2.0s scene duration
		const wIn = document.getElementById('canvasWidthInput');
		const hIn = document.getElementById('canvasHeightInput');
		if (wIn) { wIn.value = '640'; wIn.dispatchEvent(new Event('change')); }
		if (hIn) { hIn.value = '360'; hIn.dispatchEvent(new Event('change')); }
		const patSel = document.getElementById('canvasPatternSelect');
		if (patSel) { patSel.value = 'solid'; patSel.dispatchEvent(new Event('change')); }
		const bgPick = document.getElementById('canvasBgColorPicker');
		if (bgPick) { bgPick.value = '#0d1117'; bgPick.dispatchEvent(new Event('input')); bgPick.dispatchEvent(new Event('change')); }
		const durSlider = document.getElementById('durationSlider');
		const durNum = document.getElementById('durationNum');
		if (durSlider) { durSlider.value = '2.0'; durSlider.dispatchEvent(new Event('input')); }
		if (durNum) { durNum.value = '2.0'; durNum.dispatchEvent(new Event('input')); }

		// =========================================================================
		// Category A: Start Delay & Object Visibility Safeguard (E1)
		// =========================================================================
		// 1. Node idle animation (pulse-border) with Start Delay = 0.5s: MUST remain visible during 0 <= t < 0.5s
		const nIdle = window.DiagramNodes.addNode({
			shape: 'rounded', name: 'Idle-Node', text: 'IDLE',
			x: 18, y: 22, width: 100, height: 48,
			fillColor: '#1f6feb', strokeColor: '#58a6ff',
			anim: 'pulse-border', animDur: 1.0, animDelay: 0.5
		});
		// 2. Node entrance animation (scale-in) with Start Delay = 0.5s, Dur = 0.5s: MUST be hidden (opacity=0) before 0.5s, enter during 0.5..1.0s, and hold full geometry at t >= 1.0s
		const nScaleIn = window.DiagramNodes.addNode({
			shape: 'rounded', name: 'ScaleIn-Node', text: 'SCALE',
			x: 50, y: 22, width: 110, height: 50,
			fillColor: '#238636', strokeColor: '#3fb950',
			anim: 'scale-in', animDur: 0.5, animDelay: 0.5
		});
		// 3. Node entrance animation (slide-up) with Start Delay = 0.4s, Dur = 0.6s
		const nSlideUp = window.DiagramNodes.addNode({
			shape: 'rect', name: 'SlideUp-Node', text: 'SLIDE',
			x: 82, y: 22, width: 100, height: 48,
			fillColor: '#8957e5', strokeColor: '#d2a8ff',
			anim: 'slide-up', animDur: 0.6, animDelay: 0.4
		});
		// 4. Legacy Fade-In Node (default 1.2s duration, 0s delay)
		const nLegacyFade = window.DiagramNodes.addNode({
			shape: 'rounded', name: 'LegacyFade-Node', text: 'FADE',
			x: 18, y: 52, width: 96, height: 44,
			fillColor: '#d29922', strokeColor: '#e3b341',
			anim: 'fade-in'
		});

		// =========================================================================
		// Category B: Data Flow Playback Mode (loop vs once, E2)
		// =========================================================================
		const fOnce = window.DataFlows.addFlow({
			name: 'Once-Flow', type: 'orb', lineStyle: 'marching',
			color: '#00ffcc', lineWidth: 3.5, scale: 1.3,
			speed: 0.6, delay: 0.3, endDelay: 0,
			playbackMode: 'once', hideOnDelay: true,
			nodes: [{ x: 36, y: 52 }, { x: 66, y: 52 }]
		});

		// =========================================================================
		// Category C: Low-Load Effects Start Delay (E1)
		// =========================================================================
		const leTracer = window.LiteEffects.createLiteEffect({
			name: 'Delayed-Tracer', kind: 'perimeter-tracer',
			x: 520, y: 185, width: 110, height: 54,
			color: '#38bdf8', speed: 0.8, delay: 0.4, showGuide: true
		});
		const lePulse = window.LiteEffects.createLiteEffect({
			name: 'Delayed-Pulse', kind: 'pulse',
			x: 115, y: 295, width: 52, height: 52,
			color: '#ec4899', period: 0.8, delay: 0.5
		});
		const leRadar = window.LiteEffects.createLiteEffect({
			name: 'Delayed-Radar', kind: 'radar-lite',
			variant: 'multi', rings: 3,
			x: 250, y: 295, width: 68, height: 68,
			color: '#22c55e', period: 0.9, delay: 0.5, showGuide: true
		});
		const leTextTw = window.LiteEffects.createLiteEffect({
			name: 'Delayed-Text', kind: 'text-lite',
			x: 470, y: 295, width: 220, height: 50,
			labelText: 'STAGE17M3', textAnim: 'typewriter',
			typeSpeed: 20, holdDelay: 0.8, typeMode: 'hold', typeRepeat: false,
			delay: 0.5, color: '#f8fafc', bgColor: '#161b22', borderColor: '#58a6ff'
		});
		window.HistoryManager.recordImmediate();

		window.triggerAppRender();
		window.TimelinePlayer.stop();
		window.TimelinePlayer.setPreviewFps(10);

		// Check 1: Legacy Fade-In Node preserves 1.2s default duration and 0s delay
		const legacyNodeEl = document.querySelector('#svgContainer [data-node-id="' + nLegacyFade.id + '"] animate[attributeName="opacity"]');
		addCheck('Node Entrances', '1. Legacy Fade-In preserves default 1.2s duration & 0s delay',
			legacyNodeEl && legacyNodeEl.getAttribute('dur') === '1.2s' && !legacyNodeEl.hasAttribute('begin'),
			'dur=' + (legacyNodeEl ? legacyNodeEl.getAttribute('dur') : 'null') + ', begin=' + (legacyNodeEl ? legacyNodeEl.getAttribute('begin') : 'null'));

		// Check 2: Pre-delay visibility safeguard — Idle Node (pulse-border) vs Entrance Nodes (scale-in, slide-up)
		const idleGroupEl = document.querySelector('#svgContainer [data-node-id="' + nIdle.id + '"]');
		const scaleGroupEl = document.querySelector('#svgContainer [data-node-id="' + nScaleIn.id + '"]');
		const slideGroupEl = document.querySelector('#svgContainer [data-node-id="' + nSlideUp.id + '"]');
		addCheck('Start Delay', '2. Pre-delay visibility safeguard (idle node visible, delayed entrance nodes opacity=0)',
			idleGroupEl && !idleGroupEl.hasAttribute('opacity') &&
			scaleGroupEl && scaleGroupEl.getAttribute('opacity') === '0' &&
			slideGroupEl && slideGroupEl.getAttribute('opacity') === '0',
			'idleOp=' + (idleGroupEl ? idleGroupEl.getAttribute('opacity') : 'null') +
			', scaleOp=' + (scaleGroupEl ? scaleGroupEl.getAttribute('opacity') : 'null') +
			', slideOp=' + (slideGroupEl ? slideGroupEl.getAttribute('opacity') : 'null'));

		// Check 3: Scrub before, at, and after Start Delay across SMIL, CSS, and JS Text Lite
		const twTextEl = document.querySelector('#svgContainer [data-lite-id="' + leTextTw.id + '"] .lite-text-element');
		const radarRing0 = document.querySelector('#svgContainer [data-lite-id="' + leRadar.id + '"] .lite-radar-ring');
		const radarCenter = document.querySelector('#svgContainer [data-lite-id="' + leRadar.id + '"] .lite-radar-center');
		const tracerGuide = document.querySelector('#svgContainer [data-lite-id="' + leTracer.id + '"] .lite-guide-track');
		const pulsePayload = document.querySelector('#svgContainer [data-lite-id="' + lePulse.id + '"] .lite-payload');

		window.TimelinePlayer.seek(0.2); // Before 0.5s delay
		const twAt0_2 = twTextEl ? twTextEl.textContent : 'missing';
		const radarOpAt0_2 = radarRing0 ? getComputedStyle(radarRing0).opacity : '1';
		const radarDotVisAt0_2 = radarCenter ? getComputedStyle(radarCenter).visibility : 'hidden';
		const tracerGuideVisAt0_2 = tracerGuide ? getComputedStyle(tracerGuide).visibility : 'hidden';
		const pulseOpAt0_2 = pulsePayload ? parseFloat(getComputedStyle(pulsePayload).opacity || '0') : 0;

		window.TimelinePlayer.seek(0.75); // 0.25s after 0.5s delay -> 5 chars typed ("STAGE")
		const twAt0_75 = twTextEl ? twTextEl.textContent : 'missing';
		const radarOpAt0_75 = radarRing0 ? parseFloat(getComputedStyle(radarRing0).opacity || '0') : 0;

		window.TimelinePlayer.seek(1.2); // Full text typed ("STAGE17M3")
		const twAt1_2 = twTextEl ? twTextEl.textContent : 'missing';

		// Scrub BACKWARDS to 0.2s (before Start Delay)
		window.TimelinePlayer.seek(0.2);
		const twBackAt0_2 = twTextEl ? twTextEl.textContent : 'missing';
		const radarOpBackAt0_2 = radarRing0 ? getComputedStyle(radarRing0).opacity : '1';

		addCheck('Start Delay', '3. Scrub before, during, and backwards across Start Delay (Text Lite, Radar Ping, Pulse, Tracer)',
			twAt0_2 === '' && twAt0_75 === 'STAGE' && twAt1_2 === 'STAGE17M3' && twBackAt0_2 === '' &&
			parseFloat(radarOpAt0_2) < 0.05 && radarOpAt0_75 > 0.1 && parseFloat(radarOpBackAt0_2) < 0.05 &&
			radarDotVisAt0_2 === 'visible' && tracerGuideVisAt0_2 === 'visible' && pulseOpAt0_2 >= 0.1,
			'tw(0.2->0.75->1.2->0.2)=[' + [twAt0_2, twAt0_75, twAt1_2, twBackAt0_2].join(',') + '], radarRingOp(0.2->0.75->0.2)=[' + [radarOpAt0_2, radarOpAt0_75.toFixed(2), radarOpBackAt0_2].join(',') + '], pulseOp(0.2)=' + pulseOpAt0_2.toFixed(2));

		// Check 4: Frame stepping (+1f / -1f) across Start Delay boundary (0.4s -> 0.5s -> 0.6s -> 0.5s -> 0.4s)
		window.TimelinePlayer.seek(0.4);
		const twStep0_4 = twTextEl ? twTextEl.textContent : '';
		document.getElementById('btnTimelineNextFrame').click(); // 0.5s
		document.getElementById('btnTimelineNextFrame').click(); // 0.6s (2 chars: "ST")
		const twStep0_6 = twTextEl ? twTextEl.textContent : '';
		document.getElementById('btnTimelinePrevFrame').click(); // 0.5s
		document.getElementById('btnTimelinePrevFrame').click(); // 0.4s (empty)
		const twStepBack0_4 = twTextEl ? twTextEl.textContent : '';
		addCheck('Start Delay', '4. Frame stepping (+1f / -1f) across Start Delay boundary',
			twStep0_4 === '' && twStep0_6 === 'ST' && twStepBack0_4 === '',
			'tw(0.4s->0.6s->0.4s)=[' + [twStep0_4, twStep0_6, twStepBack0_4].join(',') + ']');

		// Check 5: Data Flow Play Once (marching track + travelling payload consistency)
		const flowTrackAnim = document.querySelector('#svgContainer [data-flow-id="' + fOnce.id + '"] animate[attributeName="stroke-dashoffset"]');
		const flowMotionAnim = document.querySelector('#svgContainer [data-flow-id="' + fOnce.id + '"] animateMotion');
		addCheck('Data Flow', '5. Play Once Data Flow sets repeatCount="1" fill="freeze" on both marching track and travelling payload',
			flowTrackAnim && flowTrackAnim.getAttribute('repeatCount') === '1' && flowTrackAnim.getAttribute('fill') === 'freeze' && flowTrackAnim.getAttribute('begin') === '0.3s' &&
			flowMotionAnim && flowMotionAnim.getAttribute('repeatCount') === '1' && flowMotionAnim.getAttribute('fill') === 'freeze',
			'trackRepeat=' + (flowTrackAnim ? flowTrackAnim.getAttribute('repeatCount') : 'null') + ', motionRepeat=' + (flowMotionAnim ? flowMotionAnim.getAttribute('repeatCount') : 'null'));

		// Save standalone export HTML of this visual scene before running E3/E4 mutation tests
		const exportSvgMarkup = document.getElementById('svgContainer').innerHTML;

		// =========================================================================
		// Category D: Set Start Delay from Playhead (E3)
		// =========================================================================
		// 6a. Assign Start Delay at playhead = 1.3s via DOM button click
		window.TimelinePlayer.seek(1.3);
		window.DiagramNodes.selectNode(nScaleIn.id, true);
		document.getElementById('btnNodeDelayFromPlayhead').click();
		const delayAfterPlayhead1_3 = window.DiagramNodes.getNode(nScaleIn.id).animDelay;
		const sliderVal1_3 = parseFloat(document.getElementById('nodeAnimDelayNum').value);
		const goNode1_3 = window.EngineBridge.dispatch('Node.Get', { id: String(nScaleIn.id) });

		// 6b. Test at 0.0s playhead
		window.TimelinePlayer.seek(0.0);
		document.getElementById('btnNodeDelayFromPlayhead').click();
		const delayAfterPlayhead0 = window.DiagramNodes.getNode(nScaleIn.id).animDelay;

		// 6c. Test at scene end (2.0s)
		window.TimelinePlayer.seek(2.0);
		document.getElementById('btnNodeDelayFromPlayhead').click();
		const delayAfterPlayheadEnd = window.DiagramNodes.getNode(nScaleIn.id).animDelay;

		// 6d. Undo / Redo of Set from Playhead
		window.HistoryManager.undo(); // back to 0.0s
		const delayAfterUndo1 = window.DiagramNodes.getNode(nScaleIn.id).animDelay;
		window.HistoryManager.undo(); // back to 1.3s
		const delayAfterUndo2 = window.DiagramNodes.getNode(nScaleIn.id).animDelay;
		window.HistoryManager.redo(); // forward to 0.0s
		const delayAfterRedo = window.DiagramNodes.getNode(nScaleIn.id).animDelay;
		// Restore to 0.5s
		window.HistoryManager.undo();
		window.HistoryManager.undo();

		addCheck('Set from Playhead', '6. Set Start Delay from Playhead (mid-timeline 1.3s, 0.0s, scene end 2.0s, Go authority, Undo & Redo)',
			delayAfterPlayhead1_3 === 1.3 && sliderVal1_3 === 1.3 && goNode1_3.animDelay === 1.3 &&
			delayAfterPlayhead0 === 0 && delayAfterPlayheadEnd === 2.0 &&
			delayAfterUndo1 === 0 && delayAfterUndo2 === 1.3 && delayAfterRedo === 0,
			'1.3s=' + delayAfterPlayhead1_3 + ', 0s=' + delayAfterPlayhead0 + ', 2.0s=' + delayAfterPlayheadEnd + ', undo1=' + delayAfterUndo1 + ', undo2=' + delayAfterUndo2 + ', redo=' + delayAfterRedo);

		// =========================================================================
		// Category E: Multi-Object Stagger (E4) & Save/Load Persistence
		// =========================================================================
		const nStatic = window.DiagramNodes.addNode({
			shape: 'rect', name: 'Static-Node', text: 'STATIC',
			x: 82, y: 52, width: 90, height: 42, anim: 'none'
		});
		// Select in deterministic order: [nIdle (eligible #0), nStatic (static -> skipped), fOnce (eligible #1), lePulse (eligible #2), leRadar (eligible #3)]
		window.AppCoordinator.setMultiSelection([
			{ type: 'node', id: nIdle.id },
			{ type: 'node', id: nStatic.id },
			{ type: 'flow', id: fOnce.id },
			{ type: 'lite', id: lePulse.id },
			{ type: 'lite', id: leRadar.id }
		], nIdle.id);

		const summaryText = document.querySelector('#nodeMultiSelectToolbar .multi-stagger-summary')?.textContent || '';
		const staggerResA = window.AppCoordinator.staggerSelectedObjects({ baseDelay: 0.2, stepDelay: 0.4 });
		const d0 = window.DiagramNodes.getNode(nIdle.id).animDelay;
		const dStatic = window.DiagramNodes.getNode(nStatic.id).animDelay || 0;
		const d1 = window.DataFlows.getFlow(fOnce.id).delay;
		const d2 = window.LiteEffects.getLiteEffect(lePulse.id).delay;
		const d3 = window.LiteEffects.getLiteEffect(leRadar.id).delay;

		// Test different spacing interval (base=0.0, step=0.25)
		const staggerResB = window.AppCoordinator.staggerSelectedObjects({ baseDelay: 0.0, stepDelay: 0.25 });
		const b0 = window.DiagramNodes.getNode(nIdle.id).animDelay;
		const b1 = window.DataFlows.getFlow(fOnce.id).delay;
		const b2 = window.LiteEffects.getLiteEffect(lePulse.id).delay;
		const b3 = window.LiteEffects.getLiteEffect(leRadar.id).delay;

		// Single-step Undo restores staggerResA (0.2, 0.6, 1.0, 1.4)
		window.HistoryManager.undo();
		const u0 = window.DiagramNodes.getNode(nIdle.id).animDelay;
		const u3 = window.LiteEffects.getLiteEffect(leRadar.id).delay;
		window.HistoryManager.redo();
		const r3 = window.LiteEffects.getLiteEffect(leRadar.id).delay;

		addCheck('Multi-Object Stagger', '7. Multi-object stagger in selection order, mixed static skip, interval change & 1-step Undo/Redo',
			summaryText.includes('4 of 5 eligible') &&
			staggerResA.appliedCount === 4 && staggerResA.skippedCount === 1 &&
			d0 === 0.2 && d1 === 0.6 && d2 === 1.0 && d3 === 1.4 && dStatic === 0 &&
			staggerResB.appliedCount === 4 && b0 === 0 && b1 === 0.25 && b2 === 0.5 && b3 === 0.75 &&
			u0 === 0.2 && u3 === 1.4 && r3 === 0.75,
			'summary="' + summaryText + '", passA=[' + [d0, d1, d2, d3].join(',') + '], passB=[' + [b0, b1, b2, b3].join(',') + '], undo=[' + u0 + ',' + u3 + '], redo=' + r3);

		// Check 8: Save & Reload Project Round-Trip preserves all Stage 17-M3 properties
		const snapJson = window.HistoryManager.captureSnapshot();
		window.ProjectManager.resetToNewProject();
		window.HistoryManager.applySnapshot(snapJson);
		const reloadedScale = window.DiagramNodes.getNode(nScaleIn.id);
		const reloadedFlow = window.DataFlows.getFlow(fOnce.id);
		const reloadedRadar = window.LiteEffects.getLiteEffect(leRadar.id);
		addCheck('Persistence', '8. Project snapshot save & reopen round-trip preserves animDur, animDelay, playbackMode, and LiteEffect delay',
			reloadedScale && reloadedScale.anim === 'scale-in' && reloadedScale.animDur === 0.5 &&
			reloadedFlow && reloadedFlow.playbackMode === 'once' && reloadedFlow.delay === 0.25 &&
			reloadedRadar && reloadedRadar.delay === 0.75,
			'scaleAnim=' + (reloadedScale ? reloadedScale.anim : 'null') + ', flowMode=' + (reloadedFlow ? reloadedFlow.playbackMode : 'null') + ', radarDelay=' + (reloadedRadar ? reloadedRadar.delay : 'null'));

		// Select scaleInNode and open left drawer for clean screenshot
		document.getElementById('railBtn-nodes').click();
		window.DiagramNodes.selectNode(nScaleIn.id, true);
		window.TimelinePlayer.seek(0.75);

		return {
			checks,
			exportSvgMarkup
		};
	})()`

	evalOut, err := chromedp.Run(ctx, chromedp.Evaluate[map[string]any](verifyM3JS))
	if err != nil {
		return nil, nil, nil, "", fmt.Errorf("verifyM3JS failed: %v", err)
	}
	time.Sleep(300 * time.Millisecond)

	if buf, err := chromedp.Run(ctx, chromedp.CaptureScreenshot()); err == nil {
		_ = os.WriteFile(filepath.Join(outDir, "stage17_m3_studio_verification.png"), buf, 0644)
	}

	rawChecks, _ := json.Marshal(evalOut["checks"])
	var browserChecks []BrowserCheckResult
	_ = json.Unmarshal(rawChecks, &browserChecks)
	svgMarkup, _ := evalOut["exportSvgMarkup"].(string)

	return panels1440, panels1280, browserChecks, svgMarkup, nil
}

func buildExportHTMLFromSVG(svgMarkup string) string {
	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; padding: 0; background: #0d1117; overflow: hidden; }
</style>
</head>
<body>
` + svgMarkup + `
</body>
</html>`
}

func main() {
	url := "http://127.0.0.1:8088/"
	outDir := "/tmp/stage17-m3-verify"
	if len(os.Args) > 1 {
		url = os.Args[1]
	}
	if len(os.Args) > 2 {
		outDir = os.Args[2]
	}
	_ = os.MkdirAll(outDir, 0755)

	fmt.Printf(">> [Stage 17-M3] Running live headless Chromium verification against %s...\n", url)
	panels1440, panels1280, browserChecks, svgMarkup, err := runLiveBrowserSuite(url, outDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "FAIL: Live browser suite error: %v\n", err)
		os.Exit(1)
	}

	// Verify zero horizontal scrollbars across all 5 left-drawer inspector panels at 1440x900 and 1280x800
	noHScroll1440 := true
	for _, v := range panels1440 {
		if m, ok := v.(map[string]any); ok {
			if m["panelHScroll"] == true || m["detailHScroll"] == true || m["listHScroll"] == true {
				noHScroll1440 = false
			}
		}
	}
	noHScroll1280 := true
	for _, v := range panels1280 {
		if m, ok := v.(map[string]any); ok {
			if m["panelHScroll"] == true || m["detailHScroll"] == true || m["listHScroll"] == true {
				noHScroll1280 = false
			}
		}
	}
	browserChecks = append(browserChecks,
		BrowserCheckResult{
			Category: "Inspector Layout",
			Name:     "9. Zero unwanted horizontal scrollbars across all left-drawer panels at 1440x900",
			Passed:   noHScroll1440,
			Detail:   fmt.Sprintf("noHScroll1440=%v", noHScroll1440),
		},
		BrowserCheckResult{
			Category: "Inspector Layout",
			Name:     "10. Zero unwanted horizontal scrollbars across all left-drawer panels at 1280x800",
			Passed:   noHScroll1280,
			Detail:   fmt.Sprintf("noHScroll1280=%v", noHScroll1280),
		},
	)

	// =========================================================================
	// Multi-Format Export (WebP, APNG, MP4) & Decoded Frame Verification
	// =========================================================================
	fmt.Println(">> [Stage 17-M3] Exporting Stage 17-M3 sequenced scene to WebP, APNG, and MP4 and decoding frames...")
	htmlPath := filepath.Join(outDir, "stage17_m3_scene.html")
	if err := os.WriteFile(htmlPath, []byte(buildExportHTMLFromSVG(svgMarkup)), 0644); err != nil {
		fmt.Fprintf(os.Stderr, "FAIL: WriteFile HTML failed: %v\n", err)
		os.Exit(1)
	}

	webpPath := filepath.Join(outDir, "stage17_m3.webp")
	apngPath := filepath.Join(outDir, "stage17_m3.png")
	mp4Path := filepath.Join(outDir, "stage17_m3.mp4")

	const (
		width       = 640
		height      = 360
		fps         = 10
		durationSec = 2.0
	)
	expectedFrames := int(durationSec * float64(fps)) // 20 frames (t = 0.0s .. 1.9s in 100ms steps)

	startExport := time.Now()
	err = rasterizer.ExportBundleContext(
		context.Background(),
		htmlPath,
		webpPath,
		apngPath,
		mp4Path,
		"",
		"",
		durationSec,
		fps,
		"once",
		nil,
		width,
		height,
	)
	elapsedMs := time.Since(startExport).Milliseconds()
	if err != nil {
		fmt.Fprintf(os.Stderr, "FAIL: ExportBundleContext failed: %v\n", err)
		os.Exit(1)
	}

	webpStat, err1 := os.Stat(webpPath)
	apngStat, err2 := os.Stat(apngPath)
	mp4Stat, err3 := os.Stat(mp4Path)
	if err1 != nil || err2 != nil || err3 != nil {
		fmt.Fprintf(os.Stderr, "FAIL: Missing exported files: webp=%v apng=%v mp4=%v\n", err1, err2, err3)
		os.Exit(1)
	}

	webpFrames, err := decodeFrames(webpPath, filepath.Join(outDir, "frames_webp"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "FAIL: %v\n", err)
		os.Exit(1)
	}
	apngFrames, err := decodeFrames(apngPath, filepath.Join(outDir, "frames_apng"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "FAIL: %v\n", err)
		os.Exit(1)
	}
	mp4Frames, err := decodeFrames(mp4Path, filepath.Join(outDir, "frames_mp4"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "FAIL: %v\n", err)
		os.Exit(1)
	}

	// Regions in 640x360 scene:
	// 1. nIdle (pulse-border, delay=0.5s) at (18%, 22%) -> center=(115, 79), size=100x48 -> rect(65, 55, 165, 103)
	regIdleNode := image.Rect(65, 55, 165, 103)
	// 2. nScaleIn (scale-in, delay=0.5s, dur=0.5s) at (50%, 22%) -> center=(320, 79), size=110x50 -> rect(265, 54, 375, 104)
	regScaleInNode := image.Rect(265, 54, 375, 104)
	// 3. fOnce (Play Once marching flow, delay=0.3s, speed=0.6s -> completes at t=0.9s) from (36%,52%) to (66%,52%) -> (230,187) to (422,187)
	regFlowOnce := image.Rect(225, 170, 430, 204)
	// 4. leTextTw (Delayed Typewriter, delay=0.5s) at (470, 295), size=220x50 -> inner text area rect(375, 275, 565, 315)
	regTextTw := image.Rect(375, 275, 565, 315)

	var frameChecks []FrameDeltaCheck
	addDelta := func(format string, frames []image.Image, desc string, fA, fB int, region image.Rectangle, expectDiff bool) {
		tol := 6.0
		staticThreshold := 0.003
		if format == "WebP" || format == "MP4" {
			tol = 18.0
			staticThreshold = 0.015
		}
		ratio := computeRegionDiffRatio(frames[fA], frames[fB], region, tol)
		passed := false
		if expectDiff {
			passed = ratio > 0.005
		} else {
			passed = ratio < staticThreshold
		}
		frameChecks = append(frameChecks, FrameDeltaCheck{
			Format:      format,
			Description: desc,
			FrameA:      fA,
			FrameB:      fB,
			DiffRatio:   math.Round(ratio*10000) / 10000,
			ExpectDiff:  expectDiff,
			Passed:      passed,
		})
	}

	// Verify Idle Node is visibly rendered in frame 0 (before its 0.5s Start Delay!)
	idleFgRatio := computeNonBackgroundRatio(apngFrames[0], regIdleNode, 13, 17, 23, 15.0)
	// Verify Scale-In Entrance Node is hidden (background only) in frame 1 (t=0.1s < 0.5s Start Delay) and visible in frame 12 (t=1.2s)
	scaleFgBefore := computeNonBackgroundRatio(apngFrames[1], regScaleInNode, 13, 17, 23, 15.0)
	scaleFgAfter := computeNonBackgroundRatio(apngFrames[12], regScaleInNode, 13, 17, 23, 15.0)

	browserChecks = append(browserChecks,
		BrowserCheckResult{
			Category: "Decoded Export Frames",
			Name:     "11. Pre-delay visibility in decoded frames: Idle Node visible at t=0.0s, Delayed Scale-In Node hidden at t=0.1s and visible at t=1.2s",
			Passed:   idleFgRatio > 0.15 && scaleFgBefore < 0.01 && scaleFgAfter > 0.15,
			Detail:   fmt.Sprintf("idleFg(0.0s)=%.3f, scaleInFg(0.1s)=%.3f, scaleInFg(1.2s)=%.3f", idleFgRatio, scaleFgBefore, scaleFgAfter),
		},
	)

	for _, fmtEntry := range []struct {
		name   string
		frames []image.Image
	}{
		{"APNG", apngFrames},
		{"WebP", webpFrames},
		{"MP4", mp4Frames},
	} {
		f := fmtEntry.frames
		// 1. Scale-In Node is static (hidden) during pre-delay (frame 0 vs frame 3, 0.0s..0.3s), animates during entrance (frame 5 vs frame 8, 0.5s..0.8s), and holds steady after completion (frame 12 vs frame 18, 1.2s..1.8s)
		addDelta(fmtEntry.name, f, "Delayed Scale-In Node pre-delay holds hidden (0.0s -> 0.3s)", 0, 3, regScaleInNode, false)
		addDelta(fmtEntry.name, f, "Delayed Scale-In Node entrance animates (0.5s -> 0.8s)", 5, 8, regScaleInNode, true)
		addDelta(fmtEntry.name, f, "Delayed Scale-In Node post-entrance holds final geometry (1.2s -> 1.8s)", 12, 18, regScaleInNode, false)

		// 2. Play Once DataFlow (delay=0.3s, speed=0.6s -> active 0.3s..0.9s): moves between frame 4 (0.4s) and frame 7 (0.7s), and stops completely after t=0.9s (frame 12 vs frame 17 is static!)
		addDelta(fmtEntry.name, f, "Play Once DataFlow active pass moves (0.4s -> 0.7s)", 4, 7, regFlowOnce, true)
		addDelta(fmtEntry.name, f, "Play Once DataFlow stops marching & holds after completion (1.2s -> 1.7s)", 12, 17, regFlowOnce, false)

		// 3. Delayed Typewriter (delay=0.5s): static before delay (frame 0 vs frame 4, 0.0s..0.4s), types characters after delay (frame 5 vs frame 9, 0.5s..0.9s)
		addDelta(fmtEntry.name, f, "Delayed Text Lite Typewriter pre-delay holds empty (0.0s -> 0.4s)", 0, 4, regTextTw, false)
		addDelta(fmtEntry.name, f, "Delayed Text Lite Typewriter active typing after Start Delay (0.5s -> 0.9s)", 5, 9, regTextTw, true)
	}

	mediaPassed := len(webpFrames) == expectedFrames && len(apngFrames) == expectedFrames && len(mp4Frames) == expectedFrames
	for _, fc := range frameChecks {
		if !fc.Passed {
			mediaPassed = false
		}
	}

	mediaRes := MediaExportResult{
		Width:            width,
		Height:           height,
		FPS:              fps,
		DurationSec:      durationSec,
		ExpectedFrames:   expectedFrames,
		WebPBytes:        webpStat.Size(),
		APNGBytes:        apngStat.Size(),
		MP4Bytes:         mp4Stat.Size(),
		WebPDecodedCount: len(webpFrames),
		APNGDecodedCount: len(apngFrames),
		MP4DecodedCount:  len(mp4Frames),
		FrameChecks:      frameChecks,
		ElapsedMs:        elapsedMs,
		Passed:           mediaPassed,
	}

	time.Sleep(250 * time.Millisecond)
	leftover := countTargetProcs()
	zeroLeftover := (leftover == 0)

	allPassed := mediaPassed && zeroLeftover
	for _, bc := range browserChecks {
		if !bc.Passed {
			allPassed = false
		}
	}

	report := Stage17M3Report{
		Timestamp:             time.Now().UTC().Format(time.RFC3339),
		ZeroLeftoverProcesses: zeroLeftover,
		Panels1440:            panels1440,
		Panels1280:            panels1280,
		BrowserChecks:         browserChecks,
		MediaExport:           mediaRes,
		AllPassed:             allPassed,
	}

	var outBuf bytes.Buffer
	enc := json.NewEncoder(&outBuf)
	enc.SetIndent("", "  ")
	_ = enc.Encode(report)
	fmt.Println(outBuf.String())

	if !allPassed {
		fmt.Fprintf(os.Stderr, "FAIL: Stage 17-M3 verification failed (mediaPassed=%v, zeroLeftover=%v)\n", mediaPassed, zeroLeftover)
		os.Exit(1)
	}
	fmt.Println(">> [Stage 17-M3] ALL BROWSER, TIMELINE, STAGGER, LAYOUT & DECODED MEDIA CHECKS PASSED!")
}
