package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/chromedp/cdproto/network"
	"github.com/chromedp/chromedp"
	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/animlab"
	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/scene"
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

func evalAsync(ctx context.Context, expr string) (string, error) {
	wrapper := fmt.Sprintf(`(() => { window.__stageEDone = false; window.__stageEResult = ''; Promise.resolve().then(() => (%s)).then(r => { window.__stageEResult = String(r); window.__stageEDone = true; }, e => { window.__stageEResult = JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }); window.__stageEDone = true; }); return true; })()`, expr)
	if _, err := chromedp.Run(ctx, chromedp.Evaluate[bool](wrapper)); err != nil {
		return "", err
	}
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		done, err := chromedp.Run(ctx, chromedp.Evaluate[bool](`Boolean(window.__stageEDone)`))
		if err == nil && done {
			return chromedp.Run(ctx, chromedp.Evaluate[string](`String(window.__stageEResult || '')`))
		}
		time.Sleep(100 * time.Millisecond)
	}
	return "", fmt.Errorf("evalAsync timed out")
}

func waitWasmReady(ctx context.Context) error {
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		ok, err := chromedp.Run(ctx, chromedp.Evaluate[bool](`Boolean(window.EngineBridge && window.EngineBridge.isReady && window.EngineBridge.isReady() && window.ComponentLibrary)`))
		if err == nil && ok {
			return nil
		}
		time.Sleep(150 * time.Millisecond)
	}
	return fmt.Errorf("timed out waiting for WASM EngineBridge and ComponentLibrary")
}

func main() {
	os.Exit(run())
}

func run() int {
	tmpDir, err := os.MkdirTemp("", "sva-stage-e-*")
	if err != nil {
		fmt.Fprintf(os.Stderr, "mkdtemp failed: %v\n", err)
		return 1
	}
	defer os.RemoveAll(tmpDir)

	// 1. Build ephemeral svg-animator binary into tmpDir (does not disturb any running service)
	binPath := filepath.Join(tmpDir, "svg-animator-test")
	buildCmd := exec.Command("go", "build", "-o", binPath, "./cmd/svg-animator")
	buildCmd.Stdout = os.Stdout
	buildCmd.Stderr = os.Stderr
	if err := buildCmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "go build failed: %v\n", err)
		return 1
	}

	// 2. Start ephemeral Studio server on 127.0.0.1:18088 using isolated temp SQLite DB (does not disturb any running service)
	portAddr := "127.0.0.1:18088"
	studioURL := "http://127.0.0.1:18088/"
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

	// Open an ephemeral SSH reverse tunnel so Kiwiberry's headless Chromium reaches Hydrogen's 127.0.0.1:18088 cleanly
	tunCmd := exec.Command("ssh", "-N", "-o", "ExitOnForwardFailure=yes", "-o", "StrictHostKeyChecking=no", "-R", "18088:127.0.0.1:18088", "nigel@192.168.100.40")
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

	// 3. Acquire managed Headless Chromium session via animlab (guaranteed cleanup via defer sess.Close())
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
	record := func(id, name string, ok bool, detail string) {
		results = append(results, gateResult{ID: id, Name: name, Passed: ok, Detail: detail})
		status := "PASS"
		if !ok {
			status = "FAIL"
		}
		fmt.Printf("[%s] %s — %s\n  %s\n", status, id, name, detail)
	}

	// Step 1 & 2: Open Studio, wait for WASM ready, create "Meter Cell" component and save to global SQLite library
	if err := runVoid(taskCtx, chromedp.Navigate(studioURL), chromedp.WaitReady("#compLibListContainer")); err != nil {
		record("CMP-GATE-01", "Boot Studio & WASM Engine", false, err.Error())
		return 1
	}
	if err := waitWasmReady(taskCtx); err != nil {
		record("CMP-GATE-01", "Boot Studio & WASM Engine", false, err.Error())
		return 1
	}

	step1JSON, err := evalAsync(taskCtx, `(async () => {
		try {
			window.confirm = () => true;
			window.alert = () => {};
			window.ProjectManager.resetToNewProject();
			window.EngineBridge.setWidgetParameters([]);

			const g1 = window.LiteEffects.createLiteEffect({
				kind: 'gauge-lite', name: 'cell-gauge', variant: 'hbar',
				x: 190, y: 110, width: 180, height: 22, color: '#38bdf8',
				minValue: 0, maxValue: 100, value: 42
			});
			const t1 = window.LiteEffects.createLiteEffect({
				kind: 'text-lite', name: 'cell-readout', variant: 'rounded',
				labelText: '42%', x: 335, y: 110, width: 74, height: 26,
				color: '#f8fafc', play: false
			});
			const grpRes = window.EngineBridge.createGroup('meter-cell', [
				{ type: 'lite', id: String(g1.id) },
				{ type: 'lite', id: String(t1.id) }
			]);
			const grp = grpRes.group || grpRes;
			window.EngineBridge.setGroupMapping(grp.id, {
				alias: 'level', label: 'Primary Level', type: 'number',
				default: 42, min: 0, max: 100, step: 0.5,
				targets: [
					{ memberType: 'lite', memberId: String(g1.id), property: 'value' },
					{ memberType: 'lite', memberId: String(t1.id), property: 'text' }
				]
			});
			window.AppCoordinator.selectGroup(grp.id);
			window.ComponentLibrary.openSaveModal();
			document.getElementById('saveCompNameInput').value = 'Meter Cell';
			document.getElementById('saveCompDescInput').value = 'Reusable bar meter with numeric readout';
			document.getElementById('saveCompCategorySelect').value = 'meters';
			document.getElementById('saveCompTagsInput').value = 'gauge, meter, animated';
			await window.ComponentLibrary.submitSaveModal();

			const list = await window.ComponentLibrary.fetchList('', 'meters', '');
			const saved = list.find(c => c.name === 'Meter Cell');
			return JSON.stringify({ ok: Boolean(saved && saved.componentId), componentId: saved ? saved.componentId : '', version: saved ? saved.latestVersion : '' });
		} catch (e) {
			return JSON.stringify({ ok: false, error: e.message });
		}
	})()`)
	var s1 map[string]any
	_ = json.Unmarshal([]byte(step1JSON), &s1)
	compID, _ := s1["componentId"].(string)
	s1Detail := step1JSON
	if err != nil {
		s1Detail = fmt.Sprintf("err=%v json=%s", err, step1JSON)
	}
	record("CMP-GATE-01", "Create Component & Save to Persistent Global Library", err == nil && s1["ok"] == true, s1Detail)

	// Step 3 & 4: Simulate closing & reopening SVG-Animator (full page reload into a clean project) and retrieve saved component
	if err := runVoid(taskCtx, chromedp.Navigate("about:blank"), chromedp.Navigate(studioURL), chromedp.WaitReady("#compLibListContainer")); err != nil {
		record("CMP-GATE-02", "Reopen Studio", false, err.Error())
		return 1
	}
	if err := waitWasmReady(taskCtx); err != nil {
		record("CMP-GATE-02", "Reopen Studio WASM", false, err.Error())
		return 1
	}

	step2JSON, err := evalAsync(taskCtx, fmt.Sprintf(`(async () => {
		try {
			window.confirm = () => true;
			window.alert = () => {};
			await window.ComponentLibrary.refreshList();
			const cards = document.querySelectorAll('#compLibListContainer .comp-lib-card');
			const foundCard = Array.from(cards).some(el => el.dataset.componentId === %q);

			// Step 5: Place two independent instances
			const i1 = await window.ComponentLibrary.insertComponent(%q, { instanceName: 'meter-a', offsetX: 0, offsetY: -8 });
			const i2 = await window.ComponentLibrary.insertComponent(%q, { instanceName: 'meter-b', offsetX: 0, offsetY: 16, scaleX: 1.1, scaleY: 1.1 });

			// Step 6: Mutate instance 1 independently and verify instance 2 is untouched
			const m1Gauge = i1.group.members.find(m => m.type === 'lite');
			const m2Gauge = i2.group.members.find(m => m.type === 'lite');
			window.LiteEffects.updateLiteEffect(m1Gauge.id, { color: '#ef4444' });
			const le1 = window.LiteEffects.getLiteEffect(m1Gauge.id);
			const le2 = window.LiteEffects.getLiteEffect(m2Gauge.id);
			const indepOk = le1.color === '#ef4444' && le2.color !== '#ef4444';

			// Step 7: Save revision v1.1.0 of Meter Cell and verify both 1.0.0 and 1.1.0 exist
			const rec10 = await window.ComponentLibrary.fetchComponent(%q);
			const def11 = JSON.parse(rec10.definitionJson);
			def11.version = '1.1.0';
			def11.description = 'Reusable bar meter v1.1';
			await window.ComponentLibrary.saveToServer({
				componentId: def11.componentId,
				name: def11.name,
				description: def11.description,
				category: def11.category,
				tags: def11.tags,
				version: '1.1.0',
				definitionJson: JSON.stringify(def11),
				changelog: 'Minor visual update'
			});
			const revs = await window.ComponentLibrary.fetchRevisions(%q);
			const upRes = await window.ComponentLibrary.updatePlacedInstances(%q);

			// Step 8: Build nested parent component ("Dual Meter Card") from the two instances
			const groupsNow = window.EngineBridge.listGroups().filter(g => g.componentId === %q);
			const nestedCreate = window.EngineBridge.createComponent(
				groupsNow.map(g => ({ type: 'group', id: g.id })),
				'',
				{
					name: 'Dual Meter Card',
					description: 'Nested composite built from two Meter Cell library components',
					category: 'panels',
					tags: ['composite', 'meters', 'dt-ready'],
					version: '1.0.0'
				}
			);
			if (nestedCreate && nestedCreate.success && nestedCreate.composite) {
				await window.ComponentLibrary.saveToServer({
					componentId: nestedCreate.composite.componentId,
					name: nestedCreate.composite.name,
					description: nestedCreate.composite.description,
					category: nestedCreate.composite.category,
					tags: nestedCreate.composite.tags,
					version: '1.0.0',
					definitionJson: JSON.stringify(nestedCreate.composite),
					changelog: 'Initial nested composite'
				});
			}

			// Step 12: Verify delete protection blocks deleting Meter Cell while referenced by Dual Meter Card
			const delRes = await window.ComponentLibrary.deleteComponent(%q, 'Meter Cell');
			const deleteProtected = Boolean(delRes && delRes.blocked === true);

			// Step 10: Export finished flattened widget package ZIP
			const svgMarkup = window.buildFullSVG(window.SceneState.buildRenderState());
			const runtimeJS = await (await fetch('/js/svg-widget.js')).text();
			const pkgRes = window.EngineBridge.buildWidgetPackage('Dual Meter Card', svgMarkup, runtimeJS);

			return JSON.stringify({
				ok: foundCard && indepOk && revs.count === 2 && upRes.updated === 2 && nestedCreate.success && deleteProtected && Boolean(pkgRes && pkgRes.success && pkgRes.zipB64),
				foundCard, indepOk, revCount: revs.count, updatedInstances: upRes.updated,
				nestedDeps: nestedCreate.composite ? nestedCreate.composite.dependencies : [],
				deleteProtected,
				zipB64: pkgRes && pkgRes.zipB64 ? pkgRes.zipB64 : '',
				pkgError: pkgRes ? pkgRes.error : ''
			});
		} catch (e) {
			return JSON.stringify({ ok: false, error: e.message });
		}
	})()`, compID, compID, compID, compID, compID, compID, compID, compID))

	var s2 map[string]any
	_ = json.Unmarshal([]byte(step2JSON), &s2)
	zipB64, _ := s2["zipB64"].(string)
	s2Summary := map[string]any{
		"ok":               s2["ok"],
		"foundCard":        s2["foundCard"],
		"indepOk":          s2["indepOk"],
		"revCount":         s2["revCount"],
		"updatedInstances": s2["updatedInstances"],
		"nestedDeps":       s2["nestedDeps"],
		"deleteProtected":  s2["deleteProtected"],
		"zipB64Len":        len(zipB64),
		"error":            s2["error"],
		"pkgError":         s2["pkgError"],
	}
	s2SummaryBytes, _ := json.Marshal(s2Summary)
	record("CMP-GATE-02", "Reopen Persistence, Independent Instances, Versioning, Nesting, Delete Protection & Export", err == nil && s2["ok"] == true, string(s2SummaryBytes))

	// Step 11: Validate exported ZIP against Digital Twin 840ae5d compatibility contract & save test package
	if zipB64 != "" {
		zipBytes, decErr := base64.StdEncoding.DecodeString(zipB64)
		if decErr != nil {
			record("CMP-GATE-03", "Digital Twin 840ae5d Package Compatibility Validation", false, decErr.Error())
		} else {
			dtRep := scene.ValidateWidgetPackageDTCompatibility(zipBytes)
			repJSON, _ := json.Marshal(dtRep)
			record("CMP-GATE-03", "Digital Twin 840ae5d Package Compatibility Validation", dtRep.Compatible, string(repJSON))

			outDir := filepath.Join("demos", "dt-compat")
			_ = os.MkdirAll(outDir, 0755)
			outZip := filepath.Join(outDir, "dual-meter-card-v1.0.0-package.zip")
			if wErr := os.WriteFile(outZip, zipBytes, 0644); wErr == nil {
				fmt.Printf("Saved DT compatibility test package: %s (%d bytes, sha256=%s)\n", outZip, len(zipBytes), dtRep.PackageSHA256)
			}
		}
	} else {
		record("CMP-GATE-03", "Digital Twin 840ae5d Package Compatibility Validation", false, "no zip exported")
	}

	// Verify dual-instance runtime isolation in browser via SVGWidget.mount()
	step4JSON, err := evalAsync(taskCtx, `(async () => {
		try {
			if (!window.SVGWidget) {
				await new Promise((resolve, reject) => {
					const s = document.createElement('script');
					s.src = '/js/svg-widget.js';
					s.onload = resolve;
					s.onerror = reject;
					document.head.appendChild(s);
				});
			}
			const svgMarkup = window.buildFullSVG(window.SceneState.buildRenderState());
			const params = window.EngineBridge.getWidgetParameters();
			const hostA = document.createElement('div');
			const hostB = document.createElement('div');
			document.body.appendChild(hostA);
			document.body.appendChild(hostB);

			const wA = window.SVGWidget.mount(hostA, svgMarkup, { instanceId: 'dt_unit_a', manifest: { schemaVersion: 1, parameters: params }, visibilityAware: false });
			const wB = window.SVGWidget.mount(hostB, svgMarkup, { instanceId: 'dt_unit_b', manifest: { schemaVersion: 1, parameters: params }, visibilityAware: false });

			const lvlParam = params.find(p => p.property === 'level');
			if (!lvlParam) return JSON.stringify({ ok: false, error: 'level param not found' });

			wA.setParameter(lvlParam.name, 88);
			wB.setParameter(lvlParam.name, 14);
			wA.pause();
			const aPaused = wA.isPaused();
			const bPaused = wB.isPaused();
			wA.resume();

			const ok = wA.getParameters()[lvlParam.name] === 88 &&
				wB.getParameters()[lvlParam.name] === 14 &&
				aPaused === true && bPaused === false;

			wA.destroy();
			wB.destroy();
			hostA.remove();
			hostB.remove();
			return JSON.stringify({ ok, paramName: lvlParam.name, aVal: 88, bVal: 14, aPaused, bPaused });
		} catch (e) {
			return JSON.stringify({ ok: false, error: e.message });
		}
	})()`)
	var s4 map[string]any
	_ = json.Unmarshal([]byte(step4JSON), &s4)
	record("CMP-GATE-04", "Dual-Instance SVGWidget.mount() Isolation & Pause/Resume", err == nil && s4["ok"] == true, step4JSON)

	fmt.Println("================================================================================")
	allOK := true
	for _, r := range results {
		if !r.Passed {
			allOK = false
		}
	}
	if !allOK {
		fmt.Println("RESULT: FAILED")
		return 1
	}
	fmt.Println("RESULT: ALL STAGE E REUSABLE COMPONENT BROWSER GATES PASSED")
	return 0
}
