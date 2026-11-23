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
		ok, err := chromedp.Run(ctx, chromedp.Evaluate[bool](`Boolean(window.EngineBridge && window.EngineBridge.isReady && window.EngineBridge.isReady() && window.ComponentBuilder)`))
		if err == nil && ok {
			return nil
		}
		time.Sleep(150 * time.Millisecond)
	}
	return fmt.Errorf("timed out waiting for WASM EngineBridge and ComponentBuilder")
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

	portAddr := "127.0.0.1:18089"
	studioURL := "http://127.0.0.1:18089/"
	demoURL := "http://127.0.0.1:18089/component-builder-demo.html"
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

	tunCmd := exec.Command("ssh", "-N", "-o", "ExitOnForwardFailure=yes", "-o", "StrictHostKeyChecking=no", "-R", "18089:127.0.0.1:18089", "nigel@192.168.100.40")
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

		return JSON.stringify({
			ok: demo1Ok && demo2Ok && demo3Ok && demo4Ok && demo5Ok && demo6Ok,
			demo1Ok, demo2Ok, demo3Ok, demo4Ok, demo5Ok, demo6Ok
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

	allPassed := len(results) == 2
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
