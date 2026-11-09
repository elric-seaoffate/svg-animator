//go:build js && wasm
// +build js,wasm

package main

import (
	"encoding/json"
	"fmt"
	"syscall/js"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/protocol"
)

func dispatchBridge(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return map[string]any{
			"success": false,
			"error":   "missing command argument",
		}
	}
	cmd := args[0].String()
	var payloadBytes []byte
	if len(args) >= 2 && !args[1].IsNull() && !args[1].IsUndefined() {
		if args[1].Type() == js.TypeString {
			payloadBytes = []byte(args[1].String())
		} else {
			// If passed as a JS object, stringify via JSON.stringify
			jsonGlobal := js.Global().Get("JSON")
			jsonStr := jsonGlobal.Call("stringify", args[1]).String()
			payloadBytes = []byte(jsonStr)
		}
	}

	respBytes, err := protocol.Dispatch(cmd, payloadBytes)
	if err != nil {
		return map[string]any{
			"success": false,
			"error":   err.Error(),
		}
	}

	// Parse response into interface so JS receives a native JS object
	var result any
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return map[string]any{
			"success": false,
			"error":   fmt.Sprintf("unmarshaling engine response: %v", err),
		}
	}

	return map[string]any{
		"success": true,
		"data":    result,
	}
}

func main() {
	bridge := js.Global().Get("Object").New()
	bridge.Set("version", protocol.ProtocolVersion)
	bridge.Set("isReady", true)
	bridge.Set("dispatch", js.FuncOf(dispatchBridge))

	js.Global().Set("__svgAnimatorWasmBridge", bridge)

	// Emit ready event so the loader knows the engine is mounted
	doc := js.Global().Get("document")
	if !doc.IsUndefined() && !doc.IsNull() {
		evtConstructor := js.Global().Get("CustomEvent")
		dispatchFn := js.Global().Get("dispatchEvent")
		if !evtConstructor.IsUndefined() && !dispatchFn.IsUndefined() {
			detail := js.Global().Get("Object").New()
			detail.Set("version", protocol.ProtocolVersion)
			initObj := js.Global().Get("Object").New()
			initObj.Set("detail", detail)
			evt := evtConstructor.New("svg-animator-wasm-ready", initObj)
			js.Global().Call("dispatchEvent", evt)
		}
	}

	// Keep runtime alive
	select {}
}
