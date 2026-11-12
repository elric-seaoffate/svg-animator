//go:build js && wasm
// +build js,wasm

package main

import (
	"encoding/json"
	"fmt"
	"syscall/js"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/protocol"
)

func dispatchBridge(this js.Value, args []js.Value) (ret any) {
	defer func() {
		if r := recover(); r != nil {
			ret = map[string]any{
				"success": false,
				"error":   fmt.Sprintf("recovered panic in wasm bridge: %v", r),
			}
		}
	}()

	if len(args) < 1 || args[0].IsNull() || args[0].IsUndefined() {
		return map[string]any{
			"success": false,
			"error":   "missing command argument",
		}
	}
	if args[0].Type() != js.TypeString {
		return map[string]any{
			"success": false,
			"error":   "command argument must be a string",
		}
	}
	cmd := args[0].String()
	if cmd == "" {
		return map[string]any{
			"success": false,
			"error":   "command argument cannot be empty",
		}
	}

	var payloadBytes []byte
	if len(args) >= 2 && !args[1].IsNull() && !args[1].IsUndefined() {
		if args[1].Type() == js.TypeString {
			payloadBytes = []byte(args[1].String())
		} else {
			// If passed as a JS object, stringify via JSON.stringify with exception handling
			jsonGlobal := js.Global().Get("JSON")
			if jsonGlobal.IsUndefined() || jsonGlobal.IsNull() {
				return map[string]any{
					"success": false,
					"error":   "JSON global not available",
				}
			}
			stringifyFn := jsonGlobal.Get("stringify")
			if stringifyFn.IsUndefined() || stringifyFn.IsNull() {
				return map[string]any{
					"success": false,
					"error":   "JSON.stringify not available",
				}
			}

			var jsonVal js.Value
			var stringifyErr error
			func() {
				defer func() {
					if r := recover(); r != nil {
						stringifyErr = fmt.Errorf("failed to serialize payload to JSON: %v", r)
					}
				}()
				jsonVal = jsonGlobal.Call("stringify", args[1])
			}()

			if stringifyErr != nil {
				return map[string]any{
					"success": false,
					"error":   stringifyErr.Error(),
				}
			}
			if jsonVal.IsUndefined() || jsonVal.IsNull() {
				return map[string]any{
					"success": false,
					"error":   "payload cannot be serialized to JSON (undefined or function)",
				}
			}
			payloadBytes = []byte(jsonVal.String())
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

	// If the inner response contains success: false, unwrap the failure to the top-level envelope
	if resMap, ok := result.(map[string]any); ok {
		if s, ok := resMap["success"].(bool); ok && !s {
			errStr, _ := resMap["error"].(string)
			if errStr == "" {
				errStr = fmt.Sprintf("command %s failed", cmd)
			}
			return map[string]any{
				"success": false,
				"error":   errStr,
			}
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
