package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"gitea.seaoffate.net/blackgrape/svg-animator/pkg/engine/scene"
)

func main() {
	jsPath := flag.String("js", "internal/web/static/js/svg-widget.js", "Path to svg-widget.js")
	outPath := flag.String("out", "internal/web/static/widget-runtime-manifest.json", "Output path for widget-runtime-manifest.json")
	version := flag.String("version", scene.DTBaselineRuntimeVersion, "Runtime version string")
	commit := flag.String("commit", "", "Source git commit SHA (defaults to git rev-parse HEAD)")
	flag.Parse()

	jsBytes, err := os.ReadFile(*jsPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error reading %s: %v\n", *jsPath, err)
		os.Exit(1)
	}

	srcCommit := strings.TrimSpace(*commit)
	if srcCommit == "" {
		if out, err := exec.Command("git", "rev-parse", "HEAD").Output(); err == nil {
			srcCommit = strings.TrimSpace(string(out))
		}
	}

	manifest := scene.BuildWidgetRuntimeManifest(jsBytes, *version, srcCommit)
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "error marshaling runtime manifest: %v\n", err)
		os.Exit(1)
	}
	data = append(data, '\n')

	if err := os.WriteFile(*outPath, data, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "error writing %s: %v\n", *outPath, err)
		os.Exit(1)
	}

	fmt.Printf("Generated %s (runtimeVersion=%s, runtimeSha256=%s, properties=%d)\n",
		*outPath, manifest.RuntimeVersion, manifest.RuntimeSha256, len(manifest.Properties))
}
