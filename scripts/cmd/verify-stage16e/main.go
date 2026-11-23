package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/chromedp/cdproto/network"
	"github.com/chromedp/chromedp"
	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/animlab"
)

const (
	studioURL        = "http://192.168.100.40:8088/"
	compositeDemoURL = "http://192.168.100.40:8088/composite-widget-demo.html"
	consumerURL      = "http://192.168.100.40:8091/index.html"
	testLabURL       = "http://192.168.100.40:8093/"
	cdpEndpoint      = "http://127.0.0.1:9222"
	cpuHost          = "nigel@192.168.100.40"
)

type GateResult struct {
	ID      string
	Name    string
	Passed  bool
	Details string
}

func runVoid(ctx context.Context, actions ...chromedp.Action[chromedp.Void]) error {
	for _, a := range actions {
		if _, err := chromedp.Run(ctx, a); err != nil {
			return err
		}
	}
	return nil
}

func main() {
	os.Exit(run())
}

func run() int {
	fmt.Println("================================================================================")
	fmt.Println(" Stage 16E: Groups, Semantic Property Mappings & Reusable Composite Objects")
	fmt.Println("================================================================================")

	var results []GateResult
	record := func(id, name string, passed bool, details string) {
		results = append(results, GateResult{ID: id, Name: name, Passed: passed, Details: details})
		status := "PASS"
		if !passed {
			status = "FAIL"
		}
		fmt.Printf("[%s] %-14s %-56s | %s\n", status, id, name, details)
	}

	sess, err := animlab.AcquireBrowserSession(context.Background(), cdpEndpoint, cpuHost)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to acquire browser session: %v\n", err)
		return 1
	}
	defer sess.Close()

	ctx, cancelTimeout := context.WithTimeout(sess.AllocCtx, 180*time.Second)
	defer cancelTimeout()
	taskCtx, cancelTask := chromedp.NewContext(ctx)
	defer cancelTask()

	_, _ = chromedp.Call(taskCtx, network.SetCacheDisabled, network.SetCacheDisabledParams{CacheDisabled: true})

	// =========================================================================
	// GATE 1: Studio Authoring (M1 Group Targets/Speed, M2 Semantic Mappings, M3 Composite Templates & Sequential Instances)
	// =========================================================================
	if err := runVoid(taskCtx,
		chromedp.EmulateViewport(1440, 960),
		chromedp.Navigate(studioURL),
		chromedp.WaitReady("#railBtn-lite-effects"),
	); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to open Studio at %s: %v\n", studioURL, err)
		return 1
	}

	for i := 0; i < 30; i++ {
		ready, _ := chromedp.Run(taskCtx, chromedp.Evaluate[bool](`Boolean(window.EngineBridge && window.EngineBridge.isReady())`))
		if ready {
			break
		}
		_ = runVoid(taskCtx, chromedp.Sleep(300*time.Millisecond))
	}

	g1JSON, err := chromedp.Run(taskCtx, chromedp.Evaluate[string](`(() => {
		try {
			window.confirm = () => true;
			window.alert = () => {};
			window.ProjectManager.resetToNewProject();
			window.EngineBridge.setWidgetParameters([]);

			// 1. Pure Low-Load Effects Grouping & Toolbar Verification
			const pureL1 = window.LiteEffects.createLiteEffect({ kind: 'gauge-lite', variant: 'ring', name: 'PureGauge', x: 180, y: 180, width: 100, height: 100, value: 45 });
			const pureL2 = window.LiteEffects.createLiteEffect({ kind: 'radar-lite', variant: 'multi', name: 'PureRadar', x: 320, y: 180, width: 100, height: 100 });
			window.AppCoordinator.setMultiSelection([
				{ type: 'lite', id: String(pureL1.id) },
				{ type: 'lite', id: String(pureL2.id) }
			]);
			window.DiagramNodes.updateMultiSelectToolbar();
			const liteToolbarVis = document.getElementById('liteMultiSelectToolbar')?.style.display !== 'none';
			const pureGrp = window.AppCoordinator.createGroupFromSelection('pure-lite-grp');
			const pureGrpOk = Boolean(pureGrp && pureGrp.members && pureGrp.members.length === 2);
			window.AppCoordinator.ungroupSelectedGroup();

			// 2. Mixed Group Creation (Nodes + Flow + LiteEffects)
			const nIn = window.DiagramNodes.createNode({ shape: 'rounded', text: 'CoreIn', name: 'CoreIn', x: 18, y: 24, width: 80, height: 40 });
			const nOut = window.DiagramNodes.createNode({ shape: 'rounded', text: 'CoreOut', name: 'CoreOut', x: 30, y: 24, width: 80, height: 40 });
			const fl = window.DataFlows.createFlow({
				fromNodeId: nIn.id,
				toNodeId: nOut.id,
				color: '#38bdf8',
				speed: 1.0,
				nodes: [{ x: 18, y: 24 }, { x: 30, y: 24 }]
			});
			const leGauge = window.LiteEffects.createLiteEffect({
				kind: 'gauge-lite',
				variant: 'ring',
				name: 'CpuGauge',
				x: 300,
				y: 260,
				width: 120,
				height: 120,
				value: 40,
				minValue: 0,
				maxValue: 100
			});
			const leText = window.LiteEffects.createLiteEffect({
				kind: 'text-lite',
				variant: 'rounded',
				name: 'CpuReadout',
				x: 300,
				y: 360,
				width: 150,
				height: 40,
				labelText: '40'
			});

			window.AppCoordinator.setMultiSelection([
				{ type: 'node', id: String(nIn.id) },
				{ type: 'node', id: String(nOut.id) },
				{ type: 'flow', id: String(fl.id) },
				{ type: 'lite', id: String(leGauge.id) },
				{ type: 'lite', id: String(leText.id) }
			]);
			const grp1 = window.AppCoordinator.createGroupFromSelection('cpuwindow-1');
			window.AppCoordinator.selectGroup(grp1.id);

			// Check Right Drawer Widget Authoring Deck is visible for group
			const deckVis = document.getElementById('drawerWidgetAuthoringDeck')?.style.display !== 'none';
			const semanticSecVis = Boolean(document.querySelector('.group-semantic-mappings-section'));

			// 3. Dedicated Add/Edit Mapping Modal Dialog — Layout, Workflow & 18 Focused Checks
			document.querySelector('.btn-add-group-mapping')?.click();
			const modalOpen1 = document.getElementById('groupMappingModal')?.style.display === 'flex';

			// Check 7 & 8: Alias | Label 2-column layout and multiline Description textarea
			const aliasLabelOk = (document.getElementById('gmModalAliasLabel')?.textContent || '').trim().startsWith('Alias');
			const labelLabelOk = (document.getElementById('gmModalLabelLabel')?.textContent || '').trim() === 'Label';
			const identityTwoCols = (document.getElementById('gmModalIdentityRow')?.style.gridTemplateColumns || '').includes('1fr 1fr');
			const descIsTextarea = document.getElementById('gmModalDescInput')?.tagName === 'TEXTAREA';
			const memberLabelText = (document.querySelector('#gmModalTargetsList .gm-member-label')?.textContent || '').trim();
			const memberLabelOk = memberLabelText === 'Group Member';

			// Check 12 & 13: Save Mapping disabled when alias is empty; Add New Binding disabled before initial save
			const saveDisabledWhenEmpty = Boolean(document.getElementById('btnGroupMappingModalSave')?.disabled);
			const addBindingDisabledBeforeSave = Boolean(document.getElementById('btnGmModalAddTarget')?.disabled);

			// Cancel closes modal without changes
			document.getElementById('btnGroupMappingModalCancel')?.click();
			const modalClosedAfterCancel = document.getElementById('groupMappingModal')?.style.display === 'none';

			// Re-open modal and configure primary binding: leGauge.value (1 target initially)
			window.GroupMappingDialog.open(grp1.id, null, document.getElementById('drawerWidgetStatusMsg'));
			document.getElementById('gmModalAliasInput').value = 'cpu';
			document.getElementById('gmModalLabelInput').value = 'CPU Load (%)';
			document.getElementById('gmModalDescInput').value = 'Line 1 description\nLine 2 fan-out details';

			// Check 9 & 10: Selecting Group Member (leGauge) and Property (value) derives type='number' & domain [0..100], default=40
			window.GroupMappingDialog.targetRows[0].memSel.value = 'lite:' + leGauge.id;
			window.GroupMappingDialog.targetRows[0].memSel.dispatchEvent(new Event('change'));
			window.GroupMappingDialog.targetRows[0].propSel.value = 'value';
			window.GroupMappingDialog.targetRows[0].propSel.dispatchEvent(new Event('change'));
			const domainRespondedToTarget = document.getElementById('gmModalTypeSelect')?.value === 'number' &&
				document.getElementById('gmModalDefaultInput')?.value === '40' &&
				document.getElementById('gmModalMinInput')?.value === '0' &&
				document.getElementById('gmModalMaxInput')?.value === '100';

			// Check 11: Validation error on out-of-range default (999) clears immediately when corrected to 40
			document.getElementById('gmModalDefaultInput').value = '999';
			document.getElementById('gmModalDefaultInput').dispatchEvent(new Event('input'));
			const saveDisabledOnInvalidDefault = Boolean(document.getElementById('btnGroupMappingModalSave')?.disabled);
			document.getElementById('gmModalDefaultInput').value = '40';
			document.getElementById('gmModalDefaultInput').dispatchEvent(new Event('input'));
			const saveEnabledAfterCorrection = !document.getElementById('btnGroupMappingModalSave')?.disabled;

			// Save initial 1-target mapping
			const initialSaveSuccess = window.GroupMappingDialog.save();

			// Check 1, 3, 14: Immediately visible in Right Drawer, Floating Context Editor, and modal bottom list; Add New Binding now enabled!
			const addBindingEnabledAfterSave = !document.getElementById('btnGmModalAddTarget')?.disabled;
			const modalExistingCount1 = document.querySelectorAll('#gmModalExistingMappingsList .gm-existing-mapping-item').length;
			const drawerHasCard1 = Boolean(document.querySelector('#drawerWidgetPropertiesList .group-mapping-card[data-alias="cpu"]'));
			const fctxHasCard1 = Boolean(document.querySelector('#fctx-widgetPropertiesList .group-mapping-card[data-alias="cpu"]'));

			// Check 15: Click "+ Add New Binding", select leText.text (with compatibility filtering), and save extended 2-target mapping
			document.getElementById('btnGmModalAddTarget')?.click();
			const hasTwoTargetRows = window.GroupMappingDialog.targetRows.length === 2;
			window.GroupMappingDialog.targetRows[1].memSel.value = 'lite:' + leText.id;
			window.GroupMappingDialog.targetRows[1].memSel.dispatchEvent(new Event('change'));
			// Verify incompatible color property on leText is disabled when mapping type is 'number'
			const colorOptDisabledWhenNumber = Array.from(window.GroupMappingDialog.targetRows[1].propSel.options)
				.some(o => o.value === 'color' && o.disabled);
			window.GroupMappingDialog.targetRows[1].propSel.value = 'text';
			window.GroupMappingDialog.targetRows[1].propSel.dispatchEvent(new Event('change'));
			const valRes = window.GroupMappingDialog.validateForm();
			const saveSuccess = window.GroupMappingDialog.save();
			const savedTwoTargets = (window.AppCoordinator.getGroup(grp1.id).mappings[0].targets || []).length === 2;

			// Check 16: Add an invalid third binding (duplicate target) -> rejected & cancelled without damaging saved 2-target mapping
			document.getElementById('btnGmModalAddTarget')?.click();
			window.GroupMappingDialog.targetRows[2].memSel.value = 'lite:' + leText.id;
			window.GroupMappingDialog.targetRows[2].memSel.dispatchEvent(new Event('change'));
			window.GroupMappingDialog.targetRows[2].propSel.value = 'text';
			window.GroupMappingDialog.targetRows[2].propSel.dispatchEvent(new Event('change'));
			const dupBindingRejected = !window.GroupMappingDialog.validateForm().valid &&
				Boolean(document.getElementById('btnGroupMappingModalSave')?.disabled) &&
				window.GroupMappingDialog.save() === false;
			document.getElementById('btnGroupMappingModalCancel')?.click();
			const preservedAfterInvalidThirdCancel = (window.AppCoordinator.getGroup(grp1.id).mappings[0].targets || []).length === 2;

			// Check 2, 4, 5, 6: Preserved after modal close; Edit reflected immediately; Temp mapping added & removed immediately
			const drawerHasCardAfterClose = Boolean(document.querySelector('#drawerWidgetPropertiesList .group-mapping-card[data-alias="cpu"]'));
			const fctxHasCardAfterClose = Boolean(document.querySelector('#fctx-widgetPropertiesList .group-mapping-card[data-alias="cpu"]'));

			document.querySelector('.btn-edit-group-mapping')?.click();
			const editModalOpen = document.getElementById('groupMappingModal')?.style.display === 'flex' &&
				document.getElementById('gmModalAliasInput')?.value === 'cpu';
			document.getElementById('gmModalLabelInput').value = 'CPU Telemetry (%)';
			window.GroupMappingDialog.save();
			const editReflectedInInspectors = (document.querySelector('#drawerWidgetPropertiesList .group-mapping-card[data-alias="cpu"]')?.textContent || '').includes('CPU Telemetry (%)') &&
				(document.querySelector('#fctx-widgetPropertiesList .group-mapping-card[data-alias="cpu"]')?.textContent || '').includes('CPU Telemetry (%)');

			// Cancel unsaved mutation preserves saved alias
			document.getElementById('gmModalAliasInput').value = 'mutated-unsaved';
			document.getElementById('btnGroupMappingModalCancel')?.click();
			const unchangedAfterEditCancel = window.AppCoordinator.getGroup(grp1.id).mappings[0].alias === 'cpu';

			// Add a temporary second mapping 'temp-col' and remove it via inspector Remove button
			window.GroupMappingDialog.open(grp1.id, null, document.getElementById('drawerWidgetStatusMsg'));
			document.getElementById('gmModalAliasInput').value = 'temp-col';
			window.GroupMappingDialog.targetRows[0].memSel.value = 'lite:' + leGauge.id;
			window.GroupMappingDialog.targetRows[0].memSel.dispatchEvent(new Event('change'));
			window.GroupMappingDialog.targetRows[0].propSel.value = 'color';
			window.GroupMappingDialog.targetRows[0].propSel.dispatchEvent(new Event('change'));
			window.GroupMappingDialog.save();
			window.GroupMappingDialog.close();
			const tempAddedInBoth = Boolean(document.querySelector('#drawerWidgetPropertiesList .group-mapping-card[data-alias="temp-col"]')) &&
				Boolean(document.querySelector('#fctx-widgetPropertiesList .group-mapping-card[data-alias="temp-col"]'));
			document.querySelector('#drawerWidgetPropertiesList .group-mapping-card[data-alias="temp-col"] .btn-remove-group-mapping')?.click();
			const tempRemovedInBoth = !document.querySelector('#drawerWidgetPropertiesList .group-mapping-card[data-alias="temp-col"]') &&
				!document.querySelector('#fctx-widgetPropertiesList .group-mapping-card[data-alias="temp-col"]');

			// Verify Flow Lite 0.2..30.0s cycle duration constraint consistency in live Studio dialog
			const leFlowCheck = window.LiteEffects.createLiteEffect({
				kind: 'flow-lite',
				name: 'CheckFlowLite',
				speed: 2.0,
				points: [{ x: 10, y: 20 }, { x: 40, y: 20 }]
			});
			const leTracerCheck = window.LiteEffects.createLiteEffect({
				kind: 'perimeter-tracer',
				name: 'CheckTracer',
				speed: 3.0,
				segments: 4
			});
			window.AppCoordinator.setMultiSelection([
				{ type: 'lite', id: String(leFlowCheck.id) },
				{ type: 'lite', id: String(leTracerCheck.id) }
			]);
			const flowCheckGrp = window.AppCoordinator.createGroupFromSelection('flow-check-grp');
			window.GroupMappingDialog.open(flowCheckGrp.id, null);
			window.GroupMappingDialog.targetRows[0].memSel.value = 'lite:' + leFlowCheck.id;
			window.GroupMappingDialog.targetRows[0].memSel.dispatchEvent(new Event('change'));
			window.GroupMappingDialog.targetRows[0].propSel.value = 'speed';
			window.GroupMappingDialog.targetRows[0].propSel.dispatchEvent(new Event('change'));
			const flowLiteMinIs02 = Number(document.getElementById('gmModalMinInput')?.value) === 0.2;
			const flowLiteMaxIs30 = Number(document.getElementById('gmModalMaxInput')?.value) === 30;
			document.getElementById('gmModalAliasInput').value = 'flow-cycle';
			document.getElementById('gmModalDefaultInput').value = '30';
			const flowLite30Saved = window.GroupMappingDialog.save();
			window.GroupMappingDialog.close();
			window.AppCoordinator.selectGroup(grp1.id);

			// 4. Whole-Widget Operating State button (#btnAddGlobalStateParam) in Studio
			document.getElementById('btnAddGlobalStateParam')?.click();
			const hasGlobalOperatingState = window.EngineBridge.getWidgetParameters().some(p => p.name === 'operatingState');

			// 5. M3: Save as Composite Template & place 2 more instances
			const comp = window.AppCoordinator.saveSelectedGroupAsComposite('cpuwindow', 'CPU Monitor Template');
			const grp2 = window.AppCoordinator.instantiateComposite(comp.id, '', 30, 0);
			const grp3 = window.AppCoordinator.instantiateComposite(comp.id, '', 60, 0);

			window.renderCompositesList();
			const compListCount = document.querySelectorAll('#compositesListContainer .composite-template-item').length;
			const paramNames = window.EngineBridge.getWidgetParameters().map(p => p.name);

			return JSON.stringify({
				ok: Boolean(liteToolbarVis && pureGrpOk && grp1 && deckVis && semanticSecVis &&
					modalOpen1 && aliasLabelOk && labelLabelOk && identityTwoCols && descIsTextarea && memberLabelOk &&
					saveDisabledWhenEmpty && addBindingDisabledBeforeSave && modalClosedAfterCancel &&
					domainRespondedToTarget && saveDisabledOnInvalidDefault && saveEnabledAfterCorrection &&
					initialSaveSuccess && addBindingEnabledAfterSave && modalExistingCount1 === 1 &&
					drawerHasCard1 && fctxHasCard1 && hasTwoTargetRows &&
					colorOptDisabledWhenNumber && valRes.valid && saveSuccess && savedTwoTargets &&
					dupBindingRejected && preservedAfterInvalidThirdCancel &&
					drawerHasCardAfterClose && fctxHasCardAfterClose &&
					editModalOpen && editReflectedInInspectors && unchangedAfterEditCancel &&
					tempAddedInBoth && tempRemovedInBoth &&
					flowLiteMinIs02 && flowLiteMaxIs30 && flowLite30Saved &&
					hasGlobalOperatingState &&
					comp && grp2 && grp3 &&
					grp2.name === 'cpuwindow-2' && grp3.name === 'cpuwindow-3' && compListCount === 1 &&
					paramNames.includes('cpuwindow-1-group-cpu') &&
					paramNames.includes('cpuwindow-2-group-cpu') &&
					paramNames.includes('cpuwindow-3-group-cpu') &&
					paramNames.includes('operatingState')),
				liteToolbarVis,
				pureGrpOk,
				modalOpen1,
				aliasLabelOk,
				labelLabelOk,
				identityTwoCols,
				descIsTextarea,
				memberLabelOk,
				saveDisabledWhenEmpty,
				addBindingDisabledBeforeSave,
				domainRespondedToTarget,
				saveDisabledOnInvalidDefault,
				saveEnabledAfterCorrection,
				addBindingEnabledAfterSave,
				modalExistingCount1,
				drawerHasCard1,
				fctxHasCard1,
				colorOptDisabledWhenNumber,
				savedTwoTargets,
				dupBindingRejected,
				preservedAfterInvalidThirdCancel,
				editModalOpen,
				editReflectedInInspectors,
				unchangedAfterEditCancel,
				tempAddedInBoth,
				tempRemovedInBoth,
				hasGlobalOperatingState,
				grp1Name: grp1 && grp1.name,
				grp2Name: grp2 && grp2.name,
				grp3Name: grp3 && grp3.name,
				compListCount
			});
		} catch (e) {
			return JSON.stringify({ ok: false, error: e.message });
		}
	})()`))
	if err != nil {
		record("16E-GATE-01", "Studio Authoring (M1 Group Deck, M2 Mappings, M3 Composites)", false, err.Error())
	} else {
		var r map[string]any
		_ = json.Unmarshal([]byte(g1JSON), &r)
		record("16E-GATE-01", "Studio Authoring (M1 Group Deck, M2 Mappings, M3 Composites)", r["ok"] == true, g1JSON)
	}

	// =========================================================================
	// GATE 2: Consolidated Showcase (composite-widget-demo.html) — Multi-Target Fan-Out, Group Speed/Opacity/Visibility
	// =========================================================================
	if err := runVoid(taskCtx,
		chromedp.Navigate(compositeDemoURL),
		chromedp.WaitReady("#compositeClusterHost svg"),
	); err != nil {
		record("16E-GATE-02", "Consolidated Showcase Mount & 3 Placed Composite Instances", false, err.Error())
	} else {
		g2JSON, _ := chromedp.Run(taskCtx, chromedp.Evaluate[string](`(() => {
			try {
				const w = window.clusterWidget;
				if (!w) return JSON.stringify({ ok: false, error: 'clusterWidget not mounted' });

				// 1. Update cpuwindow-1-group-cpu to 77 -> must update both gauge-12 value AND readout-13 text
				w.setParameter('cpuwindow-1-group-cpu', 77);
				const g12Val = document.querySelector('[data-semantic-target="lite-12"]')?.getAttribute('data-gauge-value');
				const r13Txt = document.querySelector('[data-semantic-target="lite-13"] text')?.textContent;

				// 2. Verify cpuwindow-2 and cpuwindow-3 remain independent (68 and 91)
				const g22Val = document.querySelector('[data-semantic-target="lite-22"]')?.getAttribute('data-gauge-value');
				const g32Val = document.querySelector('[data-semantic-target="lite-32"]')?.getAttribute('data-gauge-value');

				// 3. Update cpuwindow-2-group-status-color to #ef4444 -> fans out to tracer-21, flow-2, node-21, ticker-24
				w.setParameter('cpuwindow-2-group-status-color', '#ef4444');
				const tracer21Stroke = document.querySelector('[data-semantic-target="lite-21"] .lite-payload')?.getAttribute('stroke');
				const node21Stroke = document.querySelector('[data-semantic-target="node-21"] rect')?.getAttribute('stroke');

				// 4. Update cpuwindow-3-group-speed to 3.2 -> scales tracer-31 duration from 3.2s to 1.0s
				w.setParameter('cpuwindow-3-group-speed', 3.2);
				const tracer31StyleDur = document.querySelector('[data-semantic-target="lite-31"] .lite-payload')?.style.animationDuration || '';
				const tracer31Dur = parseFloat(tracer31StyleDur || '0');

				// 5. Update cpuwindow-1-group-opacity to 0.45 and cpuwindow-3-group-visibility to false
				w.setParameter('cpuwindow-1-group-opacity', 0.45);
				w.setParameter('cpuwindow-3-group-visibility', false);
				const grp1Op = document.querySelector('[data-semantic-target="group-1"]')?.getAttribute('opacity');
				const grp3Vis = document.querySelector('[data-semantic-target="group-3"]')?.getAttribute('visibility');
				w.setParameter('cpuwindow-3-group-visibility', true);

				return JSON.stringify({
					ok: g12Val === '77' && r13Txt === '77' && g22Val === '68' && g32Val === '91' &&
						tracer21Stroke === '#ef4444' && node21Stroke === '#ef4444' &&
						Math.abs(tracer31Dur - 1.0) < 0.05 && grp1Op === '0.45' && grp3Vis === 'hidden',
					g12Val, r13Txt, g22Val, g32Val, tracer21Stroke, node21Stroke, tracer31Dur, tracer31StyleDur, grp1Op, grp3Vis
				});
			} catch (e) {
				return JSON.stringify({ ok: false, error: e.message });
			}
		})()`))
		var r map[string]any
		_ = json.Unmarshal([]byte(g2JSON), &r)
		record("16E-GATE-02", "Showcase Fan-Out, Independence & Group Speed/Opacity/Vis", r["ok"] == true, g2JSON)
	}

	// =========================================================================
	// GATE 3: Same-Batch Precedence, TextLite Cycle-Boundary Handover & Atomic Invalid Rejection
	// =========================================================================
	g3JSON, _ := chromedp.Run(taskCtx, chromedp.Evaluate[string](`(() => {
		try {
			const w = window.clusterWidget;
			// 1. Same-Batch Precedence: pass member override first, group mapping second in object literal;
			// runtime must apply group mapping first and direct member override second!
			window.runPrecedenceDemo();
			const g12AfterPrec = document.querySelector('[data-semantic-target="lite-12"]')?.getAttribute('data-gauge-value');
			const r13AfterPrec = document.querySelector('[data-semantic-target="lite-13"] text')?.textContent;

			// 2. Atomic Rejection: invalid batch value must throw and leave DOM untouched
			window.runAtomicRejectionDemo();
			const g12AfterReject = document.querySelector('[data-semantic-target="lite-12"]')?.getAttribute('data-gauge-value');

			// 3. Animated TextLite pendingText handover via group semantic mapping
			w.setParameter('cpuwindow-1-group-headline', 'CLUSTER-01: HANDOVER QUEUED');
			const pendingAttr = document.querySelector('[data-semantic-target="lite-14"]')?.getAttribute('data-text-pending');

			// 4. Whole-Widget Operating State controls on showcase (paused -> stopped -> running)
			window.setGlobalOperatingState('paused');
			const isPausedWhenPaused = w.isPaused();
			window.setGlobalOperatingState('running');
			const isRunningWhenRunning = !w.isPaused();

			return JSON.stringify({
				ok: g12AfterPrec === '85' && r13AfterPrec === '85 [OVR]' &&
					g12AfterReject === '85' && pendingAttr === 'CLUSTER-01: HANDOVER QUEUED' &&
					isPausedWhenPaused && isRunningWhenRunning,
				g12AfterPrec, r13AfterPrec, g12AfterReject, pendingAttr, isPausedWhenPaused, isRunningWhenRunning
			});
		} catch (e) {
			return JSON.stringify({ ok: false, error: e.message });
		}
	})()`))
	{
		var r map[string]any
		_ = json.Unmarshal([]byte(g3JSON), &r)
		record("16E-GATE-03", "Same-Batch Precedence, Pending-Text Handover & Atomic Reject", r["ok"] == true, g3JSON)
	}

	// =========================================================================
	// GATE 4: Existing Services Availability (:8091 Consumer & :8093 Test Lab)
	// =========================================================================
	err8091 := runVoid(taskCtx, chromedp.Navigate(consumerURL), chromedp.WaitReady("body"))
	err8093 := runVoid(taskCtx, chromedp.Navigate(testLabURL), chromedp.WaitReady("body"))
	record("16E-GATE-04", "Existing Services (:8091 Consumer & :8093 Test Lab)", err8091 == nil && err8093 == nil,
		fmt.Sprintf("8091=%v, 8093=%v", err8091 == nil, err8093 == nil))

	// =========================================================================
	// GATE 5: Minimum Canvas Size (20x20, 200x50, 50x200) & Small-Widgets Demo
	// =========================================================================
	if err := runVoid(taskCtx, chromedp.Navigate(studioURL), chromedp.WaitReady("#svgContainer")); err != nil {
		record("16E-GATE-05A", "Navigate Studio for Min-Canvas Verification", false, err.Error())
	} else {
		for i := 0; i < 30; i++ {
			ready, _ := chromedp.Run(taskCtx, chromedp.Evaluate[bool](`Boolean(window.EngineBridge && window.EngineBridge.isReady())`))
			if ready {
				break
			}
			_ = runVoid(taskCtx, chromedp.Sleep(200*time.Millisecond))
		}
		g5aJSON, _ := chromedp.Run(taskCtx, chromedp.Evaluate[string](`(() => {
			try {
				window.confirm = () => true;
				window.alert = () => {};
				const wEl = document.getElementById('canvasWidthInput');
				const hEl = document.getElementById('canvasHeightInput');
				const minAttrOk = wEl && wEl.getAttribute('min') === '20' && hEl && hEl.getAttribute('min') === '20';

				const applyDims = (w, h) => {
					wEl.value = String(w);
					hEl.value = String(h);
					wEl.dispatchEvent(new Event('input', { bubbles: true }));
					hEl.dispatchEvent(new Event('input', { bubbles: true }));
					wEl.dispatchEvent(new Event('change', { bubbles: true }));
					hEl.dispatchEvent(new Event('change', { bubbles: true }));
					return window.SceneState.buildRenderState().image;
				};

				const d20x20 = applyDims(20, 20);
				const d200x50 = applyDims(200, 50);
				const d50x200 = applyDims(50, 200);
				const d20x200 = applyDims(20, 200);
				const d200x20 = applyDims(200, 20);
				const dClamped = applyDims(8, 12);
				const rejGo = window.EngineBridge.updateCanvas({ width: 15, height: 15 });

				// Test 20x20 authoring, zoom, save/reload, and SVG export
				window.ProjectManager.resetToNewProject();
				applyDims(20, 20);
				window.Stage.setManualZoomPct(2000);
				const zoom2000Ok = window.Stage.zoomScale === 20;
				const n20 = window.DiagramNodes.addNode({ shape: 'circle', name: 'dot20', text: '' });
				const l20 = window.LiteEffects.addByKind('pulse');
				const saved20 = window.ProjectManager.serializeStudioState();
				const svg20 = window.buildFullSVG(window.SceneState.buildRenderState());
				const svg20Ok = svg20.includes('viewBox="0 0 20 20"') && svg20.includes('width="20"') && svg20.includes('height="20"');

				// Test 200x50 authoring, save/reload, and SVG export
				window.ProjectManager.resetToNewProject();
				applyDims(200, 50);
				const n200 = window.DiagramNodes.addNode({ shape: 'pill', name: 'btn200', text: 'DEPLOY', width: 188, height: 38 });
				const saved200 = window.ProjectManager.serializeStudioState();
				const svg200 = window.buildFullSVG(window.SceneState.buildRenderState());
				const svg200Ok = svg200.includes('viewBox="0 0 200 50"') && svg200.includes('width="200"') && svg200.includes('height="50"');

				// Reload 20x20 and verify dimensions restored
				window.ProjectManager.applyStudioState(saved20);
				const restored20 = window.SceneState.buildRenderState().image;
				window.ProjectManager.applyStudioState(saved200);
				const restored200 = window.SceneState.buildRenderState().image;

				// Existing large canvas (1280x720) works unchanged
				const d1280 = applyDims(1280, 720);

				const ok = Boolean(
					minAttrOk &&
					d20x20.width === 20 && d20x20.height === 20 &&
					d200x50.width === 200 && d200x50.height === 50 &&
					d50x200.width === 50 && d50x200.height === 200 &&
					d20x200.width === 20 && d20x200.height === 200 &&
					d200x20.width === 200 && d200x20.height === 20 &&
					dClamped.width === 20 && dClamped.height === 20 &&
					rejGo === null &&
					zoom2000Ok &&
					n20 && n20.width <= 20 && l20 && l20.x <= 20 &&
					n200 && svg20Ok && svg200Ok &&
					restored20.width === 20 && restored20.height === 20 &&
					restored200.width === 200 && restored200.height === 50 &&
					d1280.width === 1280 && d1280.height === 720
				);
				return JSON.stringify({
					ok, minAttrOk, zoom2000Ok, svg20Ok, svg200Ok,
					restored20: restored20.width + 'x' + restored20.height,
					restored200: restored200.width + 'x' + restored200.height
				});
			} catch (e) {
				return JSON.stringify({ ok: false, error: e.message });
			}
		})()`))
		var r5a map[string]any
		_ = json.Unmarshal([]byte(g5aJSON), &r5a)
		record("16E-GATE-05A", "Studio Min-Canvas (20x20, 200x50, 50x200, Zoom, Persistence & Export)", r5a["ok"] == true, g5aJSON)

		// Gate 6: Play Animation ("play") boolean property across Low-Load Effects, Shapes, Flows, Glows, Ripples & Groups
		_, _ = chromedp.Run(taskCtx, chromedp.Evaluate[bool](`(() => {
			if (!window.SVGWidget && !document.getElementById('gate6-svg-widget-script')) {
				const s = document.createElement('script');
				s.id = 'gate6-svg-widget-script';
				s.src = '/js/svg-widget.js';
				document.head.appendChild(s);
			}
			return true;
		})()`))
		for i := 0; i < 25; i++ {
			hasWidget, _ := chromedp.Run(taskCtx, chromedp.Evaluate[bool](`Boolean(window.SVGWidget && typeof window.SVGWidget.mount === 'function')`))
			if hasWidget {
				break
			}
			_ = runVoid(taskCtx, chromedp.Sleep(100*time.Millisecond))
		}
		g6JSON, _ := chromedp.Run(taskCtx, chromedp.Evaluate[string](`(() => {
			try {
				window.ProjectManager.resetToNewProject();
				window.EngineBridge.setWidgetParameters([]);

				const menuNode = window.DiagramNodes.addNode({
					shape: 'pill',
					name: 'menu-card',
					text: 'ITEM 1',
					animation: 'pulse-border'
				});
				const menuFlow = window.DataFlows.addFlow();
				window.DataFlows.updateFlow(menuFlow.id, { name: 'menu-flow', type: 'orb', lineStyle: 'marching' });
				const menuGlow = window.Glows.addGlow();
				window.Glows.updateGlow(menuGlow.id, { name: 'menu-glow' });
				const menuRipple = window.Ripples.addRipple();
				window.Ripples.updateRipple(menuRipple.id, { name: 'menu-ripple' });

				const menuTracer = window.LiteEffects.createLiteEffect({
					kind: 'perimeter-tracer',
					name: 'menu-border',
					variant: 'rounded',
					playbackMode: 'loop',
					play: false
				});
				const menuText = window.LiteEffects.createLiteEffect({
					kind: 'text-lite',
					name: 'menu-label',
					labelText: 'START',
					textAnim: 'typewriter',
					typeMode: 'once',
					typeRepeat: false,
					typeSpeed: 60,
					play: false
				});

				const menuGrpRes = window.EngineBridge.createGroup('menu-item', [
					{ type: 'lite', id: String(menuTracer.id) },
					{ type: 'lite', id: String(menuText.id) }
				]);
				const menuGrp = menuGrpRes && menuGrpRes.group ? menuGrpRes.group : menuGrpRes;

				const paramsToAdd = [
					{ name: 'menu-card-node-play', type: 'boolean', default: true, target: 'node-' + menuNode.id, property: 'play' },
					{ name: 'menu-flow-flow-play', type: 'boolean', default: true, target: 'flow-' + menuFlow.id, property: 'play' },
					{ name: 'menu-glow-glow-play', type: 'boolean', default: true, target: 'glow-' + menuGlow.id, property: 'play' },
					{ name: 'menu-ripple-ripple-play', type: 'boolean', default: true, target: 'ripple-' + menuRipple.id, property: 'play' },
					{ name: 'menu-border-tracer-play', type: 'boolean', default: false, target: 'lite-' + menuTracer.id, property: 'play' },
					{ name: 'menu-label-text-play', type: 'boolean', default: false, target: 'lite-' + menuText.id, property: 'play' },
					{ name: 'menu-item-group-play', type: 'boolean', default: false, target: menuGrp.id, property: 'play' }
				];
				for (const p of paramsToAdd) {
					window.EngineBridge.addWidgetParameter(p);
				}

				window.EngineBridge.setGroupMapping(menuGrp.id, {
					alias: 'selected',
					label: 'Menu Item Selected',
					type: 'boolean',
					default: false,
					targets: [
						{ memberType: 'lite', memberId: String(menuTracer.id), property: 'play' },
						{ memberType: 'lite', memberId: String(menuText.id), property: 'play' }
					]
				});

				const fullSvgPlay = window.buildFullSVG(window.SceneState.buildRenderState());
				let host = document.getElementById('gate6-widget-host');
				if (!host) {
					host = document.createElement('div');
					host.id = 'gate6-widget-host';
					document.body.appendChild(host);
				}
				const inst = window.SVGWidget.mount(host, fullSvgPlay, {
					instanceId: 'gate6_menu',
					manifest: {
						schemaVersion: 1,
						parameters: window.EngineBridge.getWidgetParameters()
					},
					visibilityAware: false
				});

				const tracerEl = inst.svgElement.querySelector('[data-semantic-target="lite-' + menuTracer.id + '"]');
				const textEl = inst.svgElement.querySelector('[data-semantic-target="lite-' + menuText.id + '"]');
				const nodeEl = inst.svgElement.querySelector('[data-semantic-target="node-' + menuNode.id + '"]');
				const flowEl = inst.svgElement.querySelector('[data-semantic-target="flow-' + menuFlow.id + '"]');
				const glowEl = inst.svgElement.querySelector('[data-semantic-target="glow-' + menuGlow.id + '"]');
				const rippleEl = inst.svgElement.querySelector('[data-semantic-target="ripple-' + menuRipple.id + '"]');
				const tracerPayload = tracerEl.querySelector('.lite-payload');

				const initStoppedOk = tracerEl.getAttribute('data-lite-play') === 'false' &&
					textEl.getAttribute('data-lite-play') === 'false' &&
					tracerPayload.style.animationName === 'none';

				inst.setParameter('menu-item-group-selected', true);
				const groupPlayStartedOk = tracerEl.getAttribute('data-lite-play') === 'true' &&
					textEl.getAttribute('data-lite-play') === 'true' &&
					tracerPayload.style.animationPlayState === 'running' &&
					tracerPayload.style.animationIterationCount === 'infinite';

				inst.setParameter('menu-item-group-selected', false);
				const groupPlayStoppedOk = tracerEl.getAttribute('data-lite-play') === 'false' &&
					textEl.getAttribute('data-lite-play') === 'false' &&
					tracerPayload.style.animationName === 'none' &&
					textEl.querySelector('text').textContent === 'START';

				inst.setParameters({
					'menu-card-node-play': false,
					'menu-flow-flow-play': false,
					'menu-glow-glow-play': false,
					'menu-ripple-ripple-play': false
				});
				const smilStoppedOk = nodeEl.getAttribute('data-play-animation') === 'false' &&
					flowEl.getAttribute('data-play-animation') === 'false' &&
					glowEl.getAttribute('data-play-animation') === 'false' &&
					rippleEl.getAttribute('data-play-animation') === 'false';

				inst.setParameters({
					'menu-card-node-play': true,
					'menu-flow-flow-play': true,
					'menu-glow-glow-play': true,
					'menu-ripple-ripple-play': true
				});
				const smilStartedOk = nodeEl.getAttribute('data-play-animation') === 'true' &&
					flowEl.getAttribute('data-play-animation') === 'true' &&
					glowEl.getAttribute('data-play-animation') === 'true' &&
					rippleEl.getAttribute('data-play-animation') === 'true';

				inst.destroy();
				host.remove();

				// Verify Widget.BuildPackage succeeds when a mapped group member ('lite-2') is authored with visible=false
				window.LiteEffects.updateLiteEffect(menuTracer.id, { visible: false });
				window.EngineBridge.renameGroup(menuGrp.id, 'textplus');
				window.EngineBridge.setGroupMapping(menuGrp.id, {
					alias: 'selected',
					label: 'Selected',
					type: 'boolean',
					default: false,
					targets: [
						{ memberType: 'lite', memberId: String(menuTracer.id), property: 'visibility' },
						{ memberType: 'lite', memberId: String(menuTracer.id), property: 'play' },
						{ memberType: 'lite', memberId: String(menuText.id), property: 'play' }
					]
				});
				const hiddenSvg = window.buildFullSVG(window.SceneState.buildRenderState());
				const pkgHidden = window.EngineBridge.buildWidgetPackage('textplus', hiddenSvg, '// runtime js');
				const hiddenBuildPkgOk = Boolean(pkgHidden && pkgHidden.success && pkgHidden.zipB64 && pkgHidden.zipB64.length > 0);

				const ok = initStoppedOk && groupPlayStartedOk && groupPlayStoppedOk && smilStoppedOk && smilStartedOk && hiddenBuildPkgOk;
				return JSON.stringify({ ok, initStoppedOk, groupPlayStartedOk, groupPlayStoppedOk, smilStoppedOk, smilStartedOk, hiddenBuildPkgOk });
			} catch (e) {
				return JSON.stringify({ ok: false, error: e.message });
			}
		})()`))
		var r6 map[string]any
		_ = json.Unmarshal([]byte(g6JSON), &r6)
		record("16E-GATE-06", "Play Animation ('play') across Lite Effects, Shapes, Flows, Glows, Ripples & Groups", r6["ok"] == true, g6JSON)
	}

	smallDemoURL := strings.TrimRight(studioURL, "/") + "/small-widgets-demo.html"
	if err := runVoid(taskCtx, chromedp.Navigate(smallDemoURL), chromedp.WaitReady("#card-200x50")); err != nil {
		record("16E-GATE-05B", "Navigate /small-widgets-demo.html", false, err.Error())
	} else {
		g5bJSON, _ := chromedp.Run(taskCtx, chromedp.Evaluate[string](`(() => {
			try {
				const d = window.SMALL_WIDGETS_DEMO;
				if (!d) return JSON.stringify({ ok: false, error: 'SMALL_WIDGETS_DEMO missing' });
				const vbBtn = d.btnWidget.svgElement.getAttribute('viewBox');
				const vbInd = d.indNative.svgElement.getAttribute('viewBox');
				const vbVbar = d.vbarWidget.svgElement.getAttribute('viewBox');

				d.btnWidget.setParameters({
					'btn-pill-node-fill': '#052e16',
					'btn-label-text-text': 'ACTIVE OK'
				});
				d.indNative.setParameter('led-core-pulse-color', '#ef4444');
				d.vbarWidget.setParameter('rack-load-gauge-value', 92);

				const btnTextOk = d.btnWidget.getParameters()['btn-label-text-text'] === 'ACTIVE OK';
				const indColorOk = d.indNative.getParameters()['led-core-pulse-color'] === '#ef4444';
				const vbarValOk = d.vbarWidget.getParameters()['rack-load-gauge-value'] === 92;

				const ok = vbBtn === '0 0 200 50' && vbInd === '0 0 20 20' && vbVbar === '0 0 50 200' &&
					btnTextOk && indColorOk && vbarValOk;
				return JSON.stringify({ ok, vbBtn, vbInd, vbVbar, btnTextOk, indColorOk, vbarValOk });
			} catch (e) {
				return JSON.stringify({ ok: false, error: e.message });
			}
		})()`))
		var r5b map[string]any
		_ = json.Unmarshal([]byte(g5bJSON), &r5b)
		record("16E-GATE-05B", "Small-Widgets Demo (/small-widgets-demo.html 200x50, 20x20, 50x200)", r5b["ok"] == true, g5bJSON)
	}

	fmt.Println("================================================================================")
	allPassed := true
	for _, res := range results {
		if !res.Passed {
			allPassed = false
		}
	}
	if !allPassed {
		fmt.Println("RESULT: FAILED")
		return 1
	}
	fmt.Println("RESULT: ALL STAGE 16E BROWSER VERIFICATION GATES PASSED")
	return 0
}
