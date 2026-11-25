package rasterizer

import (
	"bytes"
	"context"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func TestPipeArgs_AlphaFormats(t *testing.T) {
	webpArgs := buildWebPPipeArgs("output.webp", 30, "loop")
	webpStr := strings.Join(webpArgs, " ")
	if !strings.Contains(webpStr, "-pix_fmt yuva420p") {
		t.Fatalf("expected webp args to contain '-pix_fmt yuva420p', got: %s", webpStr)
	}

	apngArgs := buildAPNGPipeArgs("output.png", 30, "loop")
	apngStr := strings.Join(apngArgs, " ")
	if !strings.Contains(apngStr, "-pix_fmt rgba") {
		t.Fatalf("expected apng args to contain '-pix_fmt rgba', got: %s", apngStr)
	}

	mp4Args := buildMP4PipeArgs("output.mp4", 30, 5.0, "", "")
	mp4Str := strings.Join(mp4Args, " ")
	if !strings.Contains(mp4Str, "-pix_fmt yuv420p") {
		t.Fatalf("expected mp4 args to contain '-pix_fmt yuv420p', got: %s", mp4Str)
	}
}

func startMockEncoder(ctx context.Context, name string, fail bool) (*ffmpegPipeEncoder, error) {
	var cmd *exec.Cmd
	if fail {
		cmd = exec.CommandContext(ctx, "sh", "-c", "cat > /dev/null && exit 1")
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", "cat > /dev/null")
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	enc := &ffmpegPipeEncoder{
		name:  name,
		cmd:   cmd,
		stdin: stdin,
	}
	cmd.Stderr = &enc.stderr
	if err := cmd.Start(); err != nil {
		stdin.Close()
		return nil, err
	}
	return enc, nil
}

func TestFanOutDistributor_Normal(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	enc1, err := startMockEncoder(ctx, "mock-1", false)
	if err != nil {
		t.Fatalf("startMockEncoder 1 failed: %v", err)
	}
	enc2, err := startMockEncoder(ctx, "mock-2", false)
	if err != nil {
		t.Fatalf("startMockEncoder 2 failed: %v", err)
	}

	dist := newFanOutDistributor(ctx, []*ffmpegPipeEncoder{enc1, enc2})

	frames := [][]byte{
		bytes.Repeat([]byte{0x01, 0x02, 0x03}, 100),
		bytes.Repeat([]byte{0x04, 0x05, 0x06}, 100),
		bytes.Repeat([]byte{0x07, 0x08, 0x09}, 100),
	}

	for _, f := range frames {
		n, err := dist.Write(f)
		if err != nil {
			t.Fatalf("dist.Write failed: %v", err)
		}
		if n != len(f) {
			t.Fatalf("expected %d written bytes, got %d", len(f), n)
		}
	}

	if err := dist.Finish(); err != nil {
		t.Fatalf("dist.Finish failed: %v", err)
	}
}

func TestFanOutDistributor_EncoderError(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	encOk, err := startMockEncoder(ctx, "mock-ok", false)
	if err != nil {
		t.Fatalf("startMockEncoder ok failed: %v", err)
	}
	encFail, err := startMockEncoder(ctx, "mock-fail", true)
	if err != nil {
		t.Fatalf("startMockEncoder fail failed: %v", err)
	}

	dist := newFanOutDistributor(ctx, []*ffmpegPipeEncoder{encOk, encFail})

	_, _ = dist.Write([]byte("test frame"))
	err = dist.Finish()
	if err == nil {
		t.Fatalf("expected error from dist.Finish() with failing encoder, got nil")
	}
	if !strings.Contains(err.Error(), "mock-fail") {
		t.Fatalf("expected error to mention 'mock-fail', got: %v", err)
	}
}

func TestNormalizeParams_DimensionsAndPingPong(t *testing.T) {
	w, h, fps, capDur, totalFrames := normalizeParams(2.5, 10, "pingpong", 333, 111)
	if w != 334 {
		t.Fatalf("expected even width 334, got %d", w)
	}
	if h != 112 {
		t.Fatalf("expected even height 112, got %d", h)
	}
	if fps != 10 {
		t.Fatalf("expected fps 10, got %d", fps)
	}
	if capDur != 5.0 {
		t.Fatalf("expected pingpong duration to double to 5.0s, got %f", capDur)
	}
	if totalFrames != 50 {
		t.Fatalf("expected 50 total frames (5.0s * 10 fps), got %d", totalFrames)
	}
}

func TestScrubberJS_DeterministicEvaluatorsPresent(t *testing.T) {
	required := []string{
		"function setAnimTime(ms)",
		"function initDeterministicScene()",
		"function evaluateTextLiteAtTime(g, ms)",
		"function evaluateBurstCyclesAtTime(n, ms)",
		"data-play-animation=\"false\"",
		"data-lite-play=\"false\"",
		"getBoundingClientRect()",
	}
	for _, token := range required {
		if !strings.Contains(scrubberJS, token) {
			t.Fatalf("expected scrubberJS to contain deterministic evaluator token %q", token)
		}
	}
}

