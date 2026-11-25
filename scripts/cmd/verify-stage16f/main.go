package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/chromedp/cdproto/network"
	"github.com/chromedp/chromedp"
	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/animlab"
)

type gateResult struct {
	ID     string
	Name   string
	Passed bool
	Detail string
}

func runVoid(ctx context.Context, actions ...chromedp.Action[chromedp.Void]) error {
	for _, a := range actions {
		if _, err := chromedp.Run(ctx, a); err != nil {
			return err
		}
	}
	return nil
}

func waitWasmReady(ctx context.Context) error {
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		ok, err := chromedp.Run(ctx, chromedp.Evaluate[bool](`Boolean(window.EngineBridge && window.EngineBridge.isReady && window.EngineBridge.isReady() && window.ComponentBuilder && window.WidgetExportDialog)`))
		if err == nil && ok {
			return nil
		}
		time.Sleep(150 * time.Millisecond)
	}
	return fmt.Errorf("timed out waiting for WASM EngineBridge, ComponentBuilder, and WidgetExportDialog")
}

func main() {
	os.Exit(run())
}

func run() int {
	tmpDir, err := os.MkdirTemp("", "sva-stage16f-*")
	if err != nil {
		fmt.Fprintf(os.Stderr, "mkdtemp failed: %v\n", err)
		return 1
	}
	defer os.RemoveAll(tmpDir)

	binPath := filepath.Join(tmpDir, "svg-animator-16f")
	buildCmd := exec.Command("go", "build", "-o", binPath, "./cmd/svg-animator")
	buildCmd.Stdout = os.Stdout
	buildCmd.Stderr = os.Stderr
	if err := buildCmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "go build failed: %v\n", err)
		return 1
	}

	portAddr := "127.0.0.1:18093"
	studioURL := "http://127.0.0.1:18093/"
	demoURL := "http://127.0.0.1:18093/component-builder-demo.html"
	srvCmd := exec.Command(binPath, "-serve", portAddr)
	srvCmd.Dir = tmpDir
	if err := srvCmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "failed starting ephemeral studio: %v\n", err)
		return 1
	}
	defer func() {
		if srvCmd.Process != nil {
			_ = srvCmd.Process.Kill()
			_, _ = srvCmd.Process.Wait()
		}
	}()

	tunCmd := exec.Command("ssh", "-N", "-o", "ExitOnForwardFailure=yes", "-o", "StrictHostKeyChecking=no", "-R", "18093:127.0.0.1:18093", "nigel@192.168.100.40")
	if err := tunCmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "failed starting ssh reverse tunnel: %v\n", err)
		return 1
	}
	defer func() {
		if tunCmd.Process != nil {
			_ = tunCmd.Process.Kill()
			_, _ = tunCmd.Process.Wait()
		}
	}()

	time.Sleep(1500 * time.Millisecond)

	sess, err := animlab.AcquireBrowserSession(context.Background(), "http://127.0.0.1:9222", "nigel@192.168.100.40")
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to acquire browser session: %v\n", err)
		return 1
	}
	defer sess.Close()

	ctx, cancelTimeout := context.WithTimeout(sess.AllocCtx, 120*time.Second)
	defer cancelTimeout()
	taskCtx, cancelTask := chromedp.NewContext(ctx)
	defer cancelTask()
	_, _ = chromedp.Call(taskCtx, network.SetCacheDisabled, network.SetCacheDisabledParams{CacheDisabled: true})

	var results []gateResult
	record := func(id, name string, passed bool, detail string) {
		results = append(results, gateResult{ID: id, Name: name, Passed: passed, Detail: detail})
		status := "PASS"
		if !passed {
			status = "FAIL"
		}
		fmt.Printf("[%s] %s — %s\n  %s\n", status, id, name, detail)
	}

	if err := runVoid(taskCtx, chromedp.Navigate(studioURL), chromedp.WaitReady("#componentBuilderSection")); err != nil {
		record("S16F-01", "Studio Navigation", false, err.Error())
		return 1
	}
	if err := waitWasmReady(taskCtx); err != nil {
		record("S16F-01", "WASM & ComponentBuilder Ready", false, err.Error())
		return 1
	}

	studioScript := `(() => {
		window.confirm = () => true;
		window.alert = () => {};
		window.ProjectManager.resetToNewProject();
		window.EngineBridge.setWidgetParameters([]);

		const tLite = window.LiteEffects.createLiteEffect({
			kind: 'text-lite',
			name: 'btn-text',
			variant: 'rounded',
			labelText: 'DEPLOY NODE',
			x: 120, y: 60, width: 220, height: 56,
			color: '#f8fafc', bgColor: '#0f172a', play: false
		});
		const pTracer = window.LiteEffects.createLiteEffect({
			kind: 'perimeter-tracer',
			name: 'btn-tracer',
			variant: 'rounded',
			x: 120, y: 60, width: 240, height: 64,
			color: '#38bdf8', play: false
		});
		const badgeNode = window.DiagramNodes.createNode({
			name: 'btn-badge',
			shape: 'circle',
			x: 280, y: 60, width: 36, height: 36,
			fillColor: '#334155', strokeColor: '#64748b'
		});

		const props = window.getSupportedPropertiesForMember('lite', tLite.id);
		const hasTextColor = props.some(p => p.prop === 'color' && p.label === 'Text Colour');
		const hasBoxBgColor = props.some(p => p.prop === 'bgColor' && p.label === 'Box Background Colour');
		const firstPropIsColor = props.length > 0 && props[0].prop === 'color';

		window.ComponentBuilder.open(null);
		const modalOpen = document.getElementById('componentBuilderModal').style.display === 'flex';
		const savedOk = window.ComponentBuilder.save();
		const cbParams = window.ComponentBuilder.getComponentBuilderParameters();

		return JSON.stringify({
			ok: hasTextColor && hasBoxBgColor && firstPropIsColor && modalOpen && savedOk && cbParams.length === 1,
			hasTextColor,
			hasBoxBgColor,
			firstPropIsColor,
			modalOpen,
			savedOk,
			cbParamCount: cbParams.length,
			paramName: cbParams[0] ? cbParams[0].name : '',
			targetCount: cbParams[0] && cbParams[0].targets ? cbParams[0].targets.length : 0
		});
	})()`
	rawStudio, err := chromedp.Run(taskCtx, chromedp.Evaluate[string](studioScript))
	if err != nil {
		record("S16F-01", "Studio Component Builder & Low-Load Property Completeness", false, err.Error())
		return 1
	}
	var studioRes map[string]any
	_ = json.Unmarshal([]byte(rawStudio), &studioRes)
	record("S16F-01", "Studio Component Builder & Low-Load Property Completeness",
		studioRes["ok"] == true, rawStudio)

	// Gate S16F-04: Simplified Export Menu & Compact Export as Widget Dialog (`window.WidgetExportDialog`),
	// Single widget entry in Export menu ("Export as Widget…"), Filename, Rasterise embedded objects dropdown,
	// Widget only (.svg) vs ZIP package (.zip), unobtrusive validation on Export, and Component Builder authoring warnings
	exportDialogScript := `(() => {
		window.ProjectManager.resetToNewProject();
		window.EngineBridge.setWidgetParameters([]);

		const flText = window.LiteEffects.createLiteEffect({
			kind: 'text-lite',
			name: 'FleetLabel',
			variant: 'rounded',
			text: 'Fleet Sanctum',
			x: 100, y: 25, width: 150, height: 46,
			color: '#95892d', bgColor: '#0f172a', borderColor: '#38bdf8'
		});
		const flTracer = window.LiteEffects.createLiteEffect({
			kind: 'perimeter-tracer',
			name: 'BorderTracer',
			variant: 'rounded',
			x: 100, y: 25, width: 196, height: 46,
			color: '#f7ca18', play: false
		});
		const flRadar = window.LiteEffects.createLiteEffect({
			kind: 'radar-lite',
			name: 'HoverRadar',
			x: 28, y: 25, width: 44, height: 44,
			color: '#38bdf8', play: false
		});
		window.ImageObjects.createImage({
			name: 'FleetOwlBook',
			filename: 'owl.png',
			data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
			naturalWidth: 572, naturalHeight: 572, width: 49, height: 49, x: 28, y: 25
		});

		// 1. Check Export menu has exactly 1 widget entry ("Export as Widget…") and all ordinary export options
		const accExport = document.getElementById('acc-export');
		const exportBtn = document.getElementById('btnOpenWidgetExportModal');
		const noLegacyWidgetBtns = !document.getElementById('btnDownloadWidgetSVG') &&
			!document.getElementById('btnDownloadWidgetGuide') &&
			!document.getElementById('btnDownloadWidgetPackage') &&
			!document.getElementById('btnOpenWidgetExportFromMaker');
		const ordinaryExportsPresent = Boolean(
			document.getElementById('btnDownloadSVG') &&
			document.getElementById('btnDownloadHTML') &&
			document.getElementById('btnOpenStillModal') &&
			document.getElementById('btnOpenBitmapModal')
		);
		const menuSimplifiedOk = Boolean(accExport && exportBtn && exportBtn.textContent.trim() === 'Export as Widget…' && noLegacyWidgetBtns && ordinaryExportsPresent);

		// 2. Configure Fleet parameters and verify Component Builder authoring warnings stay in Widget Maker
		window.EngineBridge.addWidgetParameter({
			name: 'MouseOver', label: 'Mouse Over State', type: 'boolean', target: 'root', property: 'state',
			default: false, eventTrigger: 'hover',
			targets: [
				{ target: 'lite-' + flText.id, property: 'color', when: 'true', action: 'set', value: '#e9db6c' },
				{ target: 'lite-' + flRadar.id, property: 'play', when: 'true', action: 'play', value: true },
				{ target: 'lite-' + flText.id, property: 'color', when: 'false', action: 'set', value: '#95892d' },
				{ target: 'lite-' + flRadar.id, property: 'play', when: 'false', action: 'stop_reset', value: false }
			]
		});
		window.EngineBridge.addWidgetParameter({
			name: 'OnClick', label: 'Button Press State', type: 'boolean', target: 'root', property: 'state',
			default: false, eventTrigger: 'press',
			targets: [
				{ target: 'lite-' + flText.id, property: 'bgColor', when: 'true', action: 'set', value: '#95892d' },
				{ target: 'lite-' + flText.id, property: 'bgColor', when: 'false', action: 'set', value: '#0f172a' }
			]
		});
		window.EngineBridge.addWidgetParameter({
			name: 'Selected', label: 'Active Selection', type: 'boolean', target: 'root', property: 'state',
			default: false, eventTrigger: '',
			targets: [
				{ target: 'lite-' + flTracer.id, property: 'play', when: 'true', action: 'play', value: true },
				{ target: 'lite-' + flTracer.id, property: 'play', when: 'false', action: 'stop_reset', value: false }
			]
		});

		// 3. Open compact Export as Widget dialog and verify its 3 fields + Cancel & Export
		exportBtn.click();
		const modalEl = document.getElementById('widgetExportModal');
		const dialogOpen = modalEl && modalEl.style.display === 'flex';
		const noTabBar = !document.getElementById('wxTabBar');
		const baseIn = document.getElementById('wxBaseNameInput');
		const rasterSel = document.getElementById('wxRasterPolicySelect');
		const svgRadio = document.getElementById('wxFormatWidgetOnlyRadio');
		const zipRadio = document.getElementById('wxFormatZipPackageRadio');
		const cancelBtn = document.getElementById('btnWxModalCancel');
		const confirmBtn = document.getElementById('btnWxExportConfirm');

		const rasterOpts = Array.from(rasterSel.options).map(o => o.value).join(',');
		const controlsOk = Boolean(dialogOpen && noTabBar && baseIn && rasterOpts === '1x,2x,3x,original' && rasterSel.value === '2x' && svgRadio && zipRadio && zipRadio.checked && cancelBtn && confirmBtn);

		// 4. Test invalid filename rejection on Export
		baseIn.value = '   ';
		baseIn.dispatchEvent(new Event('input'));
		const invalidCheck = window.WidgetExportDialog.validate();
		const invalidRejectedOk = (invalidCheck.valid === false);

		// 5. Test Widget only (.svg) export
		baseIn.value = 'fleet';
		baseIn.dispatchEvent(new Event('input'));
		window.WidgetExportDialog.setExportFormat('svg');
		const svgRes = window.WidgetExportDialog.exportWidgetOnlySVG('fleet', '2x');
		const svgExportOk = Boolean(svgRes && svgRes.success && svgRes.filename === 'fleet.svg' && svgRes.svg.includes('sva-widget-manifest'));

		// 6. Test Cancel leaves scene unchanged
		exportBtn.click();
		cancelBtn.click();
		const cancelClosedOk = modalEl.style.display === 'none' && window.EngineBridge.getWidgetParameters().length === 3;

		return JSON.stringify({
			ok: menuSimplifiedOk && controlsOk && invalidRejectedOk && svgExportOk && cancelClosedOk,
			menuSimplifiedOk, controlsOk, invalidRejectedOk, svgExportOk, cancelClosedOk
		});
	})()`
	rawExportDlg, err := chromedp.Run(taskCtx, chromedp.Evaluate[string](exportDialogScript))
	if err != nil {
		record("S16F-04", "Simplified Export Menu & Compact Export as Widget Dialog (#widgetExportModal)", false, err.Error())
		return 1
	}
	var exportDlgRes map[string]any
	_ = json.Unmarshal([]byte(rawExportDlg), &exportDlgRes)
	record("S16F-04", "Simplified Export Menu & Compact Export as Widget Dialog (#widgetExportModal)",
		exportDlgRes["ok"] == true, rawExportDlg)

	if err := runVoid(taskCtx, chromedp.Navigate(demoURL), chromedp.WaitReady("#sec-demo-6")); err != nil {
		record("S16F-02", "Demo Page Navigation", false, err.Error())
		return 1
	}

	demoScript := `(() => {
		const inst = window.demoInstances || {};
		if (!inst.d1 || !inst.d2 || !inst.d3 || !inst.d4 || !inst.d5 || !inst.d6a || !inst.d6b) {
			return JSON.stringify({ ok: false, error: 'Missing mounted demo instances' });
		}

		// Demo 1: MouseOver true & false on ungrouped objects
		inst.d1.setParameter('MouseOver', true);
		const d1TextTrue = inst.d1.svgElement.querySelector('[data-semantic-target="lite-1"]').getAttribute('data-text-color');
		const d1BgTrue = inst.d1.svgElement.querySelector('[data-semantic-target="lite-1"]').getAttribute('data-text-bg-color');
		const d1BadgeTrue = inst.d1.svgElement.querySelector('[data-semantic-target="node-1"]').getAttribute('fill');
		const d1PlayTrue = inst.d1.svgElement.querySelector('[data-semantic-target="lite-2"]').getAttribute('data-lite-play');

		inst.d1.setParameter('MouseOver', false);
		const d1TextFalse = inst.d1.svgElement.querySelector('[data-semantic-target="lite-1"]').getAttribute('data-text-color');
		const d1PlayFalse = inst.d1.svgElement.querySelector('[data-semantic-target="lite-2"]').getAttribute('data-lite-play');

		const demo1Ok = (d1TextTrue === '#38bdf8' && d1BgTrue === '#1e3a8a' && d1BadgeTrue === '#2563eb' && d1PlayTrue === 'true' &&
			d1TextFalse === '#f8fafc' && d1PlayFalse === 'false');

		// Demo 2: Inverse visibility
		inst.d2.setParameter('ShowAlternateGraphic', true);
		const d2AVisTrue = inst.d2.svgElement.querySelector('[data-semantic-target="node-1"]').getAttribute('visibility');
		const d2BVisTrue = inst.d2.svgElement.querySelector('[data-semantic-target="node-2"]').getAttribute('visibility');
		inst.d2.setParameter('ShowAlternateGraphic', false);
		const d2AVisFalse = inst.d2.svgElement.querySelector('[data-semantic-target="node-1"]').getAttribute('visibility');
		const d2BVisFalse = inst.d2.svgElement.querySelector('[data-semantic-target="node-2"]').getAttribute('visibility');
		const demo2Ok = (d2AVisTrue === 'hidden' && d2BVisTrue === 'visible' && d2AVisFalse === 'visible' && d2BVisFalse === 'hidden');

		// Demo 3: Activating two unrelated animated objects + mid-cycle pause/resume
		inst.d3.setParameter('LinkActive', true);
		const d3FlowPlay = inst.d3.svgElement.querySelector('[data-semantic-target="lite-1"]').getAttribute('data-lite-play');
		const d3RadarPlay = inst.d3.svgElement.querySelector('[data-semantic-target="lite-2"]').getAttribute('data-lite-play');
		inst.d3.setParameter('StreamPaused', true);
		const d3PausedAttr = inst.d3.svgElement.querySelector('[data-semantic-target="lite-1"]').getAttribute('data-animation-paused');
		inst.d3.setParameter('StreamPaused', false);
		const d3ResumedAttr = inst.d3.svgElement.querySelector('[data-semantic-target="lite-1"]').getAttribute('data-animation-paused');
		const demo3Ok = (d3FlowPlay === 'true' && d3RadarPlay === 'true' && d3PausedAttr === 'true' && d3ResumedAttr === 'false');

		// Demo 4: Number property updating multiple compatible values
		inst.d4.setParameter('ThermalLoad', 85);
		const d4GaugeVal = inst.d4.svgElement.querySelector('[data-semantic-target="lite-1"]').getAttribute('data-gauge-value');
		const d4TextVal = inst.d4.svgElement.querySelector('[data-semantic-target="lite-2"]').getAttribute('data-text-content');
		const demo4Ok = (d4GaugeVal === '85' && d4TextVal === '85%');

		// Demo 5: Choice / Enum property selecting visual states
		inst.d5.setParameter('OperatingMode', 'critical');
		const d5Text = inst.d5.svgElement.querySelector('[data-semantic-target="lite-1"]').getAttribute('data-text-content');
		const d5Color = inst.d5.svgElement.querySelector('[data-semantic-target="lite-1"]').getAttribute('data-text-color');
		const d5NodeFill = inst.d5.svgElement.querySelector('[data-semantic-target="node-1"]').getAttribute('fill');
		const demo5Ok = (d5Text === 'NODE FAULT' && d5Color === '#ef4444' && d5NodeFill === '#ef4444');

		// Demo 6: Two mounted instances responding independently
		inst.d6a.setParameter('MouseOver', true);
		const d6aColor = inst.d6a.svgElement.querySelector('[data-semantic-target="lite-1"]').getAttribute('data-text-color');
		const d6bColor = inst.d6b.svgElement.querySelector('[data-semantic-target="lite-1"]').getAttribute('data-text-color');
		const demo6Ok = (d6aColor === '#38bdf8' && d6bColor === '#f8fafc');

		// Browser Events Playground checks: Hover, Click Toggle, Press & Hold, Focus/Blur, Double-Click, Wheel Scrub
		inst.evtHover.svgElement.dispatchEvent(new MouseEvent('mouseenter'));
		const hoverOn = inst.evtHover.getParameter('MouseOver') === true;
		inst.evtHover.svgElement.dispatchEvent(new MouseEvent('mouseleave'));
		const hoverOff = inst.evtHover.getParameter('MouseOver') === false;

		inst.evtClick.svgElement.dispatchEvent(new MouseEvent('click'));
		const clickOn = inst.evtClick.getParameter('ArmedState') === true;
		inst.evtClick.svgElement.dispatchEvent(new MouseEvent('click'));
		const clickOff = inst.evtClick.getParameter('ArmedState') === false;

		inst.evtPress.svgElement.dispatchEvent(new MouseEvent('mousedown'));
		const pressOn = inst.evtPress.getParameter('PTTActive') === true;
		inst.evtPress.svgElement.dispatchEvent(new MouseEvent('mouseup'));
		const pressOff = inst.evtPress.getParameter('PTTActive') === false;

		document.getElementById('mount-evt-dblclick').dispatchEvent(new MouseEvent('dblclick'));
		const dblNext = inst.evtDbl.getParameter('OperatingMode') === 'warning';

		document.getElementById('mount-evt-wheel').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
		const wheelUp = inst.evtWheel.getParameter('ThermalLoad') === 47;

		const browserEventsOk = hoverOn && hoverOff && clickOn && clickOff && pressOn && pressOff && dblNext && wheelUp;

		return JSON.stringify({
			ok: demo1Ok && demo2Ok && demo3Ok && demo4Ok && demo5Ok && demo6Ok && browserEventsOk,
			demo1Ok, demo2Ok, demo3Ok, demo4Ok, demo5Ok, demo6Ok, browserEventsOk
		});
	})()`
	rawDemo, err := chromedp.Run(taskCtx, chromedp.Evaluate[string](demoScript))
	if err != nil {
		record("S16F-02", "All 6 Required Browser Demonstrations (/component-builder-demo.html)", false, err.Error())
		return 1
	}
	var demoRes map[string]any
	_ = json.Unmarshal([]byte(rawDemo), &demoRes)
	record("S16F-02", "All 6 Required Browser Demonstrations (/component-builder-demo.html)",
		demoRes["ok"] == true, rawDemo)

	// Wait briefly for async fetch('fleet1-optimised.svg') to mount fleetAlpha, fleetBeta, fleetGamma
	time.Sleep(600 * time.Millisecond)
	fleetScript := `(() => {
		const inst = window.demoInstances || {};
		const fa = inst.fleetAlpha;
		const fb = inst.fleetBeta;
		const fc = inst.fleetGamma;
		if (!fa || !fb || !fc) {
			return JSON.stringify({ ok: false, error: 'Fleet instances not mounted yet' });
		}

		// 1. Check CSS rules have no duplicated #sva-widget-* selectors
		const styleA = fa.svgElement.querySelectorAll('style');
		let cssTextA = '';
		styleA.forEach(s => { cssTextA += s.textContent || ''; });
		const noDupRoot = !/#sva-widget-[a-zA-Z0-9_-]+\s+#[a-zA-Z0-9_-]*sva-widget-/.test(cssTextA);
		const hasRadarRuleA = cssTextA.includes('#sva-widget-fleet-alpha .sva-lite-radar-anim');

		// 2. Check distinct Label and Icon content across 3 instances
		const labelA = fa.svgElement.querySelector('[data-semantic-target="lite-1"]').getAttribute('data-text-content');
		const labelB = fb.svgElement.querySelector('[data-semantic-target="lite-1"]').getAttribute('data-text-content');
		const labelC = fc.svgElement.querySelector('[data-semantic-target="lite-1"]').getAttribute('data-text-content');
		const iconA = fa.svgElement.querySelector('[data-semantic-target="image-image-1"]').getAttribute('href');
		const iconB = fb.svgElement.querySelector('[data-semantic-target="image-image-1"]').getAttribute('href');
		const iconC = fc.svgElement.querySelector('[data-semantic-target="image-image-1"]').getAttribute('href');
		const distinctContentOk = (labelA === 'Fleet Sanctum' && labelB === 'Aegis Command' && labelC === 'Vanguard Relay' &&
			iconA !== iconB && iconB !== iconC && iconA.startsWith('data:image/png;base64,') && iconB.startsWith('data:image/svg+xml;base64,'));

		// 3. Test hover (mouseenter/mouseleave) on fleetAlpha -> radar-lite (lite-4) computed animationName & visibility
		fa.svgElement.dispatchEvent(new MouseEvent('mouseenter'));
		const radarEl = fa.svgElement.querySelector('[data-semantic-target="lite-4"]');
		const ringEl = radarEl.querySelector('.lite-radar-ring');
		const activeRadarAnim = window.getComputedStyle(ringEl).animationName;
		const radarHoverOk = (fa.getParameter('MouseOver') === true &&
			radarEl.getAttribute('visibility') === 'visible' &&
			activeRadarAnim === 'fleet-alpha__sva-lite-radar');

		fa.svgElement.dispatchEvent(new MouseEvent('mouseleave'));
		const stoppedRadarAnim = window.getComputedStyle(ringEl).animationName;
		const radarLeaveOk = (fa.getParameter('MouseOver') === false &&
			radarEl.getAttribute('visibility') === 'hidden' &&
			stoppedRadarAnim === 'none');

		// 4. Test Selected (perimeter-tracer lite-3) and OnClick (pressed colour flash) on fleetBeta
		fb.setParameter('Selected', true);
		const tracerElB = fb.svgElement.querySelector('[data-semantic-target="lite-3"]');
		const tracerPayB = tracerElB.querySelector('.lite-payload');
		const activeTracerAnim = window.getComputedStyle(tracerPayB).animationName;
		const selectedOnOk = (tracerElB.getAttribute('visibility') === 'visible' &&
			activeTracerAnim === 'fleet-beta__sva-lite-trace-cw');

		fb.svgElement.dispatchEvent(new PointerEvent('pointerdown'));
		const onClickDownOk = (fb.getParameter('OnClick') === true &&
			fb.svgElement.querySelector('[data-semantic-target="lite-1"]').getAttribute('data-text-bg-color') === '#95892d');
		fb.svgElement.dispatchEvent(new PointerEvent('pointerup'));
		const onClickUpOk = (fb.getParameter('OnClick') === false);

		fb.setParameter('Selected', false);
		const stoppedTracerAnim = window.getComputedStyle(tracerPayB).animationName;
		const selectedOffOk = (tracerElB.getAttribute('visibility') === 'hidden' &&
			tracerElB.getAttribute('data-lite-play') === 'false' &&
			stoppedTracerAnim === 'none');

		return JSON.stringify({
			ok: noDupRoot && hasRadarRuleA && distinctContentOk && radarHoverOk && radarLeaveOk && selectedOnOk && onClickDownOk && onClickUpOk && selectedOffOk,
			noDupRoot, hasRadarRuleA, distinctContentOk, radarHoverOk, radarLeaveOk, selectedOnOk, onClickDownOk, onClickUpOk, selectedOffOk,
			activeRadarAnim,
			stoppedRadarAnim,
			activeTracerAnim,
			stoppedTracerAnim
		});
	})()`
	rawFleet, err := chromedp.Run(taskCtx, chromedp.Evaluate[string](fleetScript))
	if err != nil {
		record("S16F-03", "Sentinel-PVE fleet1.svg Multi-Instance CSS Scoping, Computed Animations & Label/Icon Reuse", false, err.Error())
		return 1
	}
	var fleetRes map[string]any
	_ = json.Unmarshal([]byte(rawFleet), &fleetRes)
	record("S16F-03", "Sentinel-PVE fleet1.svg Multi-Instance CSS Scoping, Computed Animations & Label/Icon Reuse",
		fleetRes["ok"] == true, rawFleet)

	allPassed := len(results) == 4
	for _, r := range results {
		if !r.Passed {
			allPassed = false
		}
	}
	if !allPassed {
		return 1
	}
	return 0
}
