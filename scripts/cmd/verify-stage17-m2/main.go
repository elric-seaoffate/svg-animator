package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/chromedp"
)

type CheckResult struct {
	Name   string `json:"name"`
	Passed bool   `json:"passed"`
	Detail string `json:"detail"`
}

func main() {
	url := "http://127.0.0.1:8088/"
	outDir := "/tmp/stage17-m2-verify"
	if len(os.Args) > 1 {
		url = os.Args[1]
	}
	if len(os.Args) > 2 {
		outDir = os.Args[2]
	}
	_ = os.MkdirAll(outDir, 0755)

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
		fmt.Fprintf(os.Stderr, "Navigate failed: %v\n", err)
		os.Exit(1)
	}
	_, _ = chromedp.Call(ctx, emulation.SetDeviceMetricsOverride, emulation.SetDeviceMetricsOverrideParams{
		Width: 1440, Height: 900, DeviceScaleFactor: 1.0,
	})
	if _, err := chromedp.Run(ctx, chromedp.WaitReady(`#btnTimelinePlay`)); err != nil {
		fmt.Fprintf(os.Stderr, "WaitReady failed: %v\n", err)
		os.Exit(1)
	}
	time.Sleep(1200 * time.Millisecond)

	// 1. Verify Node Panel & Left-Panel Spacing / Scrollbar Fix at 1440x900, 1366x700, 1180x700
	panelScanJS := `(() => {
		const panels = [
			{ btn: 'railBtn-nodes', add: 'btnAddNode', acc: 'acc-nodes' },
			{ btn: 'railBtn-flows', add: 'btnAddFlow', acc: 'acc-flows' },
			{ btn: 'railBtn-glows', add: 'btnAddGlow', acc: 'acc-glows' },
			{ btn: 'railBtn-ripples', add: 'btnAddRipple', acc: 'acc-ripples' },
			{ btn: 'railBtn-lite-effects', add: 'btnAddLiteText', acc: 'acc-lite-effects' }
		];
		const out = {};
		panels.forEach(p => {
			document.getElementById(p.btn).click();
			document.getElementById(p.add).click();
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
		document.getElementById('railBtn-nodes').click();
		if (window.DiagramNodes && window.DiagramNodes.list.length > 0) {
			window.DiagramNodes.selectNode(window.DiagramNodes.list[0].id);
		}
		return out;
	})()`

	// Wait 320ms after switching to expanded-inspector so CSS width transition completes
	_, _ = chromedp.Run(ctx, chromedp.Evaluate[any](`document.getElementById('railBtn-nodes').click()`))
	time.Sleep(350 * time.Millisecond)

	panelRes1440, err := chromedp.Run(ctx, chromedp.Evaluate[map[string]any](panelScanJS))
	if err != nil {
		fmt.Fprintf(os.Stderr, "panelScanJS 1440 failed: %v\n", err)
		os.Exit(1)
	}
	// Capture Node panel screenshot at 1440x900
	if buf, err := chromedp.Run(ctx, chromedp.CaptureScreenshot()); err == nil {
		_ = os.WriteFile(filepath.Join(outDir, "node_panel_after_1440.png"), buf, 0644)
	}

	_, _ = chromedp.Call(ctx, emulation.SetDeviceMetricsOverride, emulation.SetDeviceMetricsOverrideParams{
		Width: 1366, Height: 700, DeviceScaleFactor: 1.0,
	})
	time.Sleep(350 * time.Millisecond)
	panelRes1366, _ := chromedp.Run(ctx, chromedp.Evaluate[map[string]any](panelScanJS))
	if buf, err := chromedp.Run(ctx, chromedp.CaptureScreenshot()); err == nil {
		_ = os.WriteFile(filepath.Join(outDir, "node_panel_after_1366x700.png"), buf, 0644)
	}

	_, _ = chromedp.Call(ctx, emulation.SetDeviceMetricsOverride, emulation.SetDeviceMetricsOverrideParams{
		Width: 1180, Height: 700, DeviceScaleFactor: 1.0,
	})
	time.Sleep(350 * time.Millisecond)
	panelRes1180, _ := chromedp.Run(ctx, chromedp.Evaluate[map[string]any](panelScanJS))
	if buf, err := chromedp.Run(ctx, chromedp.CaptureScreenshot()); err == nil {
		_ = os.WriteFile(filepath.Join(outDir, "node_panel_after_1180.png"), buf, 0644)
	}

	// Restore 1440x900 for Stage 17-M2 timeline verification
	_, _ = chromedp.Call(ctx, emulation.SetDeviceMetricsOverride, emulation.SetDeviceMetricsOverrideParams{
		Width: 1440, Height: 900, DeviceScaleFactor: 1.0,
	})
	time.Sleep(150 * time.Millisecond)

	// 2. Run Stage 17-M2 15-check comprehensive live Chromium verification
	timelineVerifyJS := `(() => {
		const checks = [];
		const addCheck = (name, passed, detail) => {
			checks.push({ name, passed: Boolean(passed), detail: String(detail || '') });
		};

		// Build a mixed-animation scene covering all 4 animation families
		window.confirm = () => true;
		window.ProjectManager.resetToNewProject();
		window.EngineBridge.setWidgetParameters([]);
		const durSlider = document.getElementById('durationSlider');
		const durNum = document.getElementById('durationNum');
		if (durSlider) { durSlider.value = '15'; durSlider.dispatchEvent(new Event('input')); }
		if (durNum) { durNum.value = '15'; durNum.dispatchEvent(new Event('input')); }
		const loopSel = document.getElementById('loopSelect');
		if (loopSel) { loopSel.value = 'once'; loopSel.dispatchEvent(new Event('change')); }

		// Family 1: Older SMIL Diagram Objects (Node, Flow, Glow, Ripple)
		const n1 = window.DiagramNodes.addNode({ shape: 'rounded', name: 'smil-node', animation: 'float', x: 25, y: 25 });
		const f1 = window.DataFlows.addFlow();
		window.DataFlows.updateFlow(f1.id, { style: 'marching', payload: 'data-orb', speed: 2.0, delay: 0.5, endDelay: 0.5 });
		const g1 = window.Glows.addGlow();
		window.Glows.updateGlow(g1.id, { shape: 'radar', rings: 3, dur: 2.0, delay: 0.0, endDelay: 0.5 });
		const r1 = window.Ripples.addRipple();
		window.Ripples.updateRipple(r1.id, { rings: 3, dur: 3.0, innerR: 10, outerR: 120, delay: 0.0, endDelay: 1.0 });

		// Family 2: Camera Rig & Optical Filter (Ken Burns + Focus Pull)
		const camSel = document.getElementById('cameraMotionSelect');
		if (camSel) { camSel.value = 'ken-burns'; camSel.dispatchEvent(new Event('change')); }
		const effSel = document.getElementById('effectSelect');
		if (effSel) { effSel.value = 'focus-pull'; effSel.dispatchEvent(new Event('change')); }

		// Family 3: Low-Load Effects (burst-pause perimeter-tracer, multi-segment flow-lite with delay, radar-lite, oscilloscope-lite)
		const leTracer = window.LiteEffects.createLiteEffect({
			kind: 'perimeter-tracer', x: 350, y: 200, width: 160, height: 80,
			speed: 1.0, burstCycles: 2, pauseSeconds: 1.0, pauseVisibility: 'hide'
		});
		const leFlow = window.LiteEffects.createLiteEffect({
			kind: 'flow-lite', x: 350, y: 340, speed: 2.0, delay: 1.0, endDelay: 1.0,
			points: [{ x: 15, y: 55 }, { x: 50, y: 50 }, { x: 85, y: 55 }]
		});
		const leOsc = window.LiteEffects.createLiteEffect({
			kind: 'oscilloscope-lite', x: 650, y: 220, width: 180, height: 76,
			variant: 'ecg', playbackMode: 'animated', speed: 2.0
		});

		// Family 4: Text Lite (Typewriter delete backwards, Typewriter delete-forward, Scramble, Ticker-H, Blur-In)
		const leTwDel = window.LiteEffects.createLiteEffect({
			kind: 'text-lite', x: 250, y: 520, labelText: 'TIMELINE-17',
			textAnim: 'typewriter', typeMode: 'delete', typeSpeed: 10, holdDelay: 0.5, typeRepeat: true
		});
		const leTwFwd = window.LiteEffects.createLiteEffect({
			kind: 'text-lite', x: 550, y: 520, labelText: 'ABCDEF',
			textAnim: 'typewriter', typeMode: 'delete-forward', typeSpeed: 10, holdDelay: 0.4, typeRepeat: false
		});
		const leScramble = window.LiteEffects.createLiteEffect({
			kind: 'text-lite', x: 850, y: 520, labelText: 'SCRAMBLE',
			textAnim: 'scramble', typeSpeed: 10, holdDelay: 1.0, playbackMode: 'loop'
		});
		const leTicker = window.LiteEffects.createLiteEffect({
			kind: 'text-lite', x: 650, y: 360, width: 220, height: 48, labelText: 'LIVE TELEMETRY STREAM',
			textAnim: 'ticker-h', scrollSpeed: 100, playbackMode: 'loop'
		});
		const leBlur = window.LiteEffects.createLiteEffect({
			kind: 'text-lite', x: 950, y: 220, labelText: 'FOCUS TEXT',
			textAnim: 'blur-in', speed: 1.0, holdDelay: 1.0, playbackMode: 'loop'
		});

		window.triggerAppRender();
		window.TimelinePlayer.stop();
		window.TimelinePlayer.setPreviewFps(30);

		const authoredBefore = window.HistoryManager.captureSnapshot();
		const undoBefore = window.HistoryManager.undoStack.length;

		// Measure scrubbing evaluation latency across 20 timestamps
		const t0Perf = performance.now();
		for (let i = 0; i < 20; i++) {
			window.TimelinePlayer.seek((i / 20) * 15.0);
		}
		const avgScrubMs = (performance.now() - t0Perf) / 20.0;
		window.TimelinePlayer.stop();

		// 1. Scrub from start to midpoint (7.5s)
		const scrubber = document.getElementById('timelineScrubber');
		scrubber.value = '7.5';
		scrubber.dispatchEvent(new Event('input'));
		const timeDisp = document.getElementById('timelineTimeDisplay').textContent;
		const frameDisp = document.getElementById('timelineFrameDisplay').textContent;
		addCheck('1. Scrub from start to midpoint',
			window.TimelinePlayer.currentTime === 7.5 && timeDisp === '00:07.500 / 00:15.000' && frameDisp === 'Frame 225 / 450',
			'time=' + timeDisp + ', frame=' + frameDisp + ', avgScrubMs=' + avgScrubMs.toFixed(2) + 'ms');

		// 2. Scrub from midpoint back to start (0.0s)
		scrubber.value = '0';
		scrubber.dispatchEvent(new Event('input'));
		addCheck('2. Scrub from midpoint back to start',
			window.TimelinePlayer.currentTime === 0 && document.getElementById('timelineTimeDisplay').textContent === '00:00.000 / 00:15.000',
			'time=' + document.getElementById('timelineTimeDisplay').textContent);

		// 3. Scrub to the end (15.0s)
		scrubber.value = '15';
		scrubber.dispatchEvent(new Event('input'));
		addCheck('3. Scrub to the end',
			window.TimelinePlayer.currentTime === 15.0 && document.getElementById('timelineFrameDisplay').textContent === 'Frame 450 / 450',
			'frame=' + document.getElementById('timelineFrameDisplay').textContent);

		// 4. Step forward one frame (+1f)
		window.TimelinePlayer.seek(0);
		document.getElementById('btnTimelineNextFrame').click();
		const f1Time = window.TimelinePlayer.currentTime;
		const f1Idx = window.TimelinePlayer.getCurrentFrameIndex();
		addCheck('4. Step forward one frame (+1f)',
			f1Idx === 1 && Math.abs(f1Time - (1 / 30)) < 1e-3,
			'frameIdx=' + f1Idx + ', time=' + f1Time.toFixed(4) + 's');

		// 5. Step backward one frame (-1f)
		document.getElementById('btnTimelinePrevFrame').click();
		addCheck('5. Step backward one frame (-1f)',
			window.TimelinePlayer.getCurrentFrameIndex() === 0 && window.TimelinePlayer.currentTime === 0,
			'frameIdx=' + window.TimelinePlayer.getCurrentFrameIndex() + ', time=' + window.TimelinePlayer.currentTime);

		// 6. Play after scrubbing
		window.TimelinePlayer.seek(2.0);
		window.TimelinePlayer.play();
		const playingFrom2 = window.TimelinePlayer.status === 'playing' && window.TimelinePlayer.currentTime === 2.0;
		window.TimelinePlayer._lastTimestamp = 1000;
		window.TimelinePlayer._loop(1040);
		const advancedFrom2 = window.TimelinePlayer.currentTime > 2.0;
		addCheck('6. Play after scrubbing',
			playingFrom2 && advancedFrom2,
			'startedAt=2.0s, advancedTo=' + window.TimelinePlayer.currentTime.toFixed(3) + 's');

		// 7. Pause and resume
		window.TimelinePlayer.pause();
		const pausedAt = window.TimelinePlayer.currentTime;
		const isPaused = window.TimelinePlayer.status === 'paused';
		window.TimelinePlayer.play();
		const resumedOk = window.TimelinePlayer.status === 'playing' && window.TimelinePlayer.currentTime === pausedAt;
		window.TimelinePlayer.pause();
		addCheck('7. Pause and resume',
			isPaused && resumedOk,
			'pausedAt=' + pausedAt.toFixed(3) + 's, statusAfterResume=playing');

		// 8. Scrub across a loop boundary (burst-pause perimeter-tracer: active 0..2s, pause 2..3s, active 3..5s)
		const tracerNode = document.querySelector('#svgContainer [data-lite-id="' + leTracer.id + '"] [data-burst-cycles]');
		window.TimelinePlayer.seek(1.2);
		const visAt1_2 = tracerNode ? tracerNode.style.visibility : 'missing';
		window.TimelinePlayer.seek(2.5);
		const visAt2_5 = tracerNode ? tracerNode.style.visibility : 'missing';
		window.TimelinePlayer.seek(3.5);
		const visAt3_5 = tracerNode ? tracerNode.style.visibility : 'missing';
		window.TimelinePlayer.seek(2.4); // scrub backward into pause
		const visBackAt2_4 = tracerNode ? tracerNode.style.visibility : 'missing';
		window.TimelinePlayer.seek(1.0); // scrub backward into cycle 1 active
		const visBackAt1_0 = tracerNode ? tracerNode.style.visibility : 'missing';
		addCheck('8. Scrub across a loop boundary',
			visAt1_2 === '' && visAt2_5 === 'hidden' && visAt3_5 === '' && visBackAt2_4 === 'hidden' && visBackAt1_0 === '',
			'vis(1.2s)="' + visAt1_2 + '", vis(2.5s)="' + visAt2_5 + '", vis(3.5s)="' + visAt3_5 + '", visBack(2.4s)="' + visBackAt2_4 + '", visBack(1.0s)="' + visBackAt1_0 + '"');

		// 9. Scrub across a delay or hold (multi-segment flow-lite start delay = 1.0s)
		const flowSegs = Array.from(document.querySelectorAll('#svgContainer [data-lite-id="' + leFlow.id + '"] [data-burst-cycles]'));
		window.TimelinePlayer.seek(0.4); // before 1.0s start delay
		const allHiddenDuringDelay = flowSegs.length >= 2 && flowSegs.every(s => s.style.visibility === 'hidden');
		window.TimelinePlayer.seek(1.6); // active pass
		const allVisibleAfterDelay = flowSegs.every(s => s.style.visibility === '');
		window.TimelinePlayer.seek(0.3); // scrub backwards before delay
		const allHiddenOnBackScrub = flowSegs.every(s => s.style.visibility === 'hidden');
		addCheck('9. Scrub across a delay or hold',
			allHiddenDuringDelay && allVisibleAfterDelay && allHiddenOnBackScrub,
			'segs=' + flowSegs.length + ', hiddenAt0.4s=' + allHiddenDuringDelay + ', visibleAt1.6s=' + allVisibleAfterDelay + ', hiddenBackAt0.3s=' + allHiddenOnBackScrub);

		// 10. Scrub through Typewriter & Scramble forwards and backwards
		const twDelNode = document.querySelector('#svgContainer [data-lite-id="' + leTwDel.id + '"] .lite-text-element');
		const twFwdNode = document.querySelector('#svgContainer [data-lite-id="' + leTwFwd.id + '"] .lite-text-element');
		const scrNode = document.querySelector('#svgContainer [data-lite-id="' + leScramble.id + '"] .lite-text-element');

		window.TimelinePlayer.seek(0.45); // 4 chars typed: "TIME"
		const twAt0_45 = twDelNode ? twDelNode.textContent : '';
		window.TimelinePlayer.seek(1.3); // hold phase: "TIMELINE-17"
		const twAt1_3 = twDelNode ? twDelNode.textContent : '';
		window.TimelinePlayer.seek(1.85); // delete phase: 4 trailing chars deleted -> "TIMELIN"
		const twAt1_85 = twDelNode ? twDelNode.textContent : '';
		window.TimelinePlayer.seek(1.3); // scrub BACKWARDS from delete phase -> "TIMELINE-17" restored!
		const twBackAt1_3 = twDelNode ? twDelNode.textContent : '';
		window.TimelinePlayer.seek(0.45); // scrub BACKWARDS to mid-type -> "TIME" restored!
		const twBackAt0_45 = twDelNode ? twDelNode.textContent : '';

		// delete-forward backward restoration
		window.TimelinePlayer.seek(1.16); // "DEF"
		const twFwdAt1_16 = twFwdNode ? twFwdNode.textContent : '';
		window.TimelinePlayer.seek(0.8); // scrub backwards -> "ABCDEF"
		const twFwdBackAt0_8 = twFwdNode ? twFwdNode.textContent : '';

		// Scramble forward & backward determinism
		window.TimelinePlayer.seek(0.35);
		const scrAt0_35 = scrNode ? scrNode.textContent : '';
		window.TimelinePlayer.seek(0.95);
		const scrAt0_95 = scrNode ? scrNode.textContent : '';
		window.TimelinePlayer.seek(0.35);
		const scrBackAt0_35 = scrNode ? scrNode.textContent : '';

		addCheck('10. Scrub through Typewriter and Scramble (forward & backward)',
			twAt0_45 === 'TIME' && twAt1_3 === 'TIMELINE-17' && twAt1_85 === 'TIMELIN' &&
			twBackAt1_3 === 'TIMELINE-17' && twBackAt0_45 === 'TIME' &&
			twFwdAt1_16 === 'DEF' && twFwdBackAt0_8 === 'ABCDEF' &&
			scrAt0_35.startsWith('SCR') && scrAt0_95 === 'SCRAMBLE' && scrBackAt0_35 === scrAt0_35,
			'tw(0.45->1.3->1.85->1.3->0.45)=[' + [twAt0_45, twAt1_3, twAt1_85, twBackAt1_3, twBackAt0_45].join(', ') + '], scr(0.35->0.95->0.35)=[' + [scrAt0_35, scrAt0_95, scrBackAt0_35].join(', ') + ']');

		// 11. Scrub through older diagram animations (SMIL clock & ripple mask rings)
		const mainSvg = document.querySelector('#svgContainer svg');
		const maskCircle = document.querySelector('#svgContainer mask[id^="rippleMask-"] circle');
		window.TimelinePlayer.seek(0.2);
		const smilAt0_2 = mainSvg && typeof mainSvg.getCurrentTime === 'function' ? mainSvg.getCurrentTime() : -1;
		const rAt0_2 = maskCircle ? parseFloat(maskCircle.getAttribute('r') || '0') : -1;
		window.TimelinePlayer.seek(1.5);
		const smilAt1_5 = mainSvg && typeof mainSvg.getCurrentTime === 'function' ? mainSvg.getCurrentTime() : -1;
		const rAt1_5 = maskCircle ? parseFloat(maskCircle.getAttribute('r') || '0') : -1;
		window.TimelinePlayer.seek(0.2); // scrub backwards
		const smilBackAt0_2 = mainSvg && typeof mainSvg.getCurrentTime === 'function' ? mainSvg.getCurrentTime() : -1;
		const rBackAt0_2 = maskCircle ? parseFloat(maskCircle.getAttribute('r') || '0') : -1;
		addCheck('11. Scrub through older diagram animations (SMIL & Ripple Masks)',
			Math.abs(smilAt0_2 - 0.2) < 0.05 && Math.abs(smilAt1_5 - 1.5) < 0.05 && Math.abs(smilBackAt0_2 - 0.2) < 0.05 &&
			rAt1_5 > rAt0_2 && Math.abs(rBackAt0_2 - rAt0_2) < 0.01,
			'smilTime(0.2->1.5->0.2)=[' + [smilAt0_2.toFixed(2), smilAt1_5.toFixed(2), smilBackAt0_2.toFixed(2)].join(', ') + '], rippleMaskR=[' + [rAt0_2.toFixed(2), rAt1_5.toFixed(2), rBackAt0_2.toFixed(2)].join(', ') + ']');

		// 12. Scrub through mixed CSS, SMIL, and JS effects (Camera rig, Optical focus-pull, Text blur-in filter, Web Animations)
		const camRig = document.querySelector('#svgContainer .camera-rig');
		const optFocusBlur = document.querySelector('#svgContainer #opt-focus feGaussianBlur');
		const textBlurFe = document.querySelector('#svgContainer [data-lite-id="' + leBlur.id + '"] feGaussianBlur');
		window.TimelinePlayer.seek(0.5);
		const camAt0_5 = camRig ? camRig.style.transform : '';
		const optAt0_5 = optFocusBlur ? parseFloat(optFocusBlur.getAttribute('stdDeviation') || '0') : -1;
		const txtBlurAt0_5 = textBlurFe ? parseFloat(textBlurFe.getAttribute('stdDeviation') || '0') : -1;
		window.TimelinePlayer.seek(3.0);
		const camAt3_0 = camRig ? camRig.style.transform : '';
		const optAt3_0 = optFocusBlur ? parseFloat(optFocusBlur.getAttribute('stdDeviation') || '0') : -1;
		window.TimelinePlayer.seek(0.5); // scrub backwards
		const camBackAt0_5 = camRig ? camRig.style.transform : '';
		const optBackAt0_5 = optFocusBlur ? parseFloat(optFocusBlur.getAttribute('stdDeviation') || '0') : -1;
		addCheck('12. Scrub through mixed CSS, SMIL, and JS effects',
			camAt0_5 !== camAt3_0 && camBackAt0_5 === camAt0_5 &&
			Math.abs(optAt0_5 - optAt3_0) > 1.0 && Math.abs(optBackAt0_5 - optAt0_5) < 0.01 && txtBlurAt0_5 >= 0,
			'camRestored=' + (camBackAt0_5 === camAt0_5) + ', optBlur(0.5->3.0->0.5)=[' + [optAt0_5, optAt3_0, optBackAt0_5].join(', ') + ']');

		// 13. Verify authored scene is unchanged after preview
		window.TimelinePlayer.stop();
		const authoredAfter = window.HistoryManager.captureSnapshot();
		const undoAfter = window.HistoryManager.undoStack.length;
		addCheck('13. Authored scene & HistoryManager unchanged after preview',
			authoredAfter === authoredBefore && undoAfter === undoBefore,
			'snapshotIdentical=' + (authoredAfter === authoredBefore) + ', undoDepth=' + undoBefore + '->' + undoAfter);

		// 15. Verify Widget Maker has not regressed
		const wmOk = Boolean(window.ComponentBuilder && window.WidgetExportDialog && window.SVGExportAdapter);
		addCheck('15. Widget Maker & Export as Widget integrity',
			wmOk,
			'ComponentBuilder=' + Boolean(window.ComponentBuilder) + ', WidgetExportDialog=' + Boolean(window.WidgetExportDialog) + ', SVGExportAdapter=' + Boolean(window.SVGExportAdapter));

		// Set playhead to 00:07.500 (Frame 225 / 450) and ensure right drawer timeline panel is open for the screenshot
		if (window.DiagramNodes && window.DiagramNodes.list.length > 0) {
			window.DiagramNodes.selectNode(window.DiagramNodes.list[0].id);
		}
		if (window.WorkspaceController && typeof window.WorkspaceController.showToolPanel === 'function') {
			window.WorkspaceController.showToolPanel('acc-playback');
		}
		window.TimelinePlayer.seek(7.5);

		return {
			avgScrubMs,
			checks
		};
	})()`

	timelineRes, err := chromedp.Run(ctx, chromedp.Evaluate[map[string]any](timelineVerifyJS))
	if err != nil {
		fmt.Fprintf(os.Stderr, "timelineVerifyJS failed: %v\n", err)
		os.Exit(1)
	}
	time.Sleep(350 * time.Millisecond)

	if buf, err := chromedp.Run(ctx, chromedp.CaptureScreenshot()); err == nil {
		_ = os.WriteFile(filepath.Join(outDir, "stage17_m2_timeline_scrub_7_5s.png"), buf, 0644)
	}

	report := map[string]any{
		"panels1440":   panelRes1440,
		"panels1366":   panelRes1366,
		"panels1180":   panelRes1180,
		"timelineM2":   timelineRes,
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(report)
}
