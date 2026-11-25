package rasterizer

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/chromedp/cdproto/cdp"
	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/cdproto/fetch"
	"github.com/chromedp/cdproto/network"
	"github.com/chromedp/chromedp"
)

// ProgressFunc reports the current frame index, total frame count, and active pipeline stage.
type ProgressFunc func(currentFrame, totalFrames int, phase string)

// AudioInspectResult holds the true decoded duration and header duration of an audio file.
type AudioInspectResult struct {
	DecodedDuration float64 `json:"decodedDuration"`
	HeaderDuration  float64 `json:"headerDuration"`
	HeaderMismatch  bool    `json:"headerMismatch"`
}

var (
	reInputDur = regexp.MustCompile(`Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)`)
	reTimeStat = regexp.MustCompile(`time=(\d+):(\d+):(\d+(?:\.\d+)?)`)
)

func parseHMS(hStr, mStr, sStr string) float64 {
	h, _ := strconv.ParseFloat(hStr, 64)
	m, _ := strconv.ParseFloat(mStr, 64)
	s, _ := strconv.ParseFloat(sStr, 64)
	return h*3600.0 + m*60.0 + s
}

// ProbeAudioFile runs a full FFmpeg null-sink decode to measure the true sample duration vs header duration.
func ProbeAudioFile(ctx context.Context, audioPath string) (AudioInspectResult, error) {
	var res AudioInspectResult

	cmd := exec.CommandContext(ctx, "ffmpeg", "-hide_banner", "-protocol_whitelist", "file", "-i", audioPath, "-f", "null", "-")
	outBytes, err := cmd.CombinedOutput()
	if ctx.Err() != nil {
		return res, fmt.Errorf("audio probe cancelled or timed out: %w", ctx.Err())
	}
	out := string(outBytes)
	if err != nil && len(outBytes) == 0 {
		return res, fmt.Errorf("ffmpeg probe failed: %w", err)
	}

	if m := reInputDur.FindStringSubmatch(out); len(m) == 4 {
		res.HeaderDuration = parseHMS(m[1], m[2], m[3])
	}

	allTimes := reTimeStat.FindAllStringSubmatch(out, -1)
	if len(allTimes) > 0 {
		last := allTimes[len(allTimes)-1]
		res.DecodedDuration = parseHMS(last[1], last[2], last[3])
	}

	if res.DecodedDuration <= 0 && res.HeaderDuration > 0 {
		res.DecodedDuration = res.HeaderDuration
	}
	if res.DecodedDuration <= 0 {
		return res, fmt.Errorf("ffmpeg could not decode valid audio stream from file")
	}

	if res.HeaderDuration > 0 {
		diff := res.DecodedDuration - res.HeaderDuration
		if diff < 0 {
			diff = -diff
		}
		if diff > 0.35 {
			res.HeaderMismatch = true
		}
	}

	return res, nil
}

// FixAudioContainer rewrites the audio container with clean Xing/VBR seek headers so Windows and Linux report identical lengths.
func FixAudioContainer(ctx context.Context, inPath, outPath string) error {
	ext := strings.ToLower(filepath.Ext(outPath))
	args := []string{"-y", "-protocol_whitelist", "file", "-i", inPath, "-vn"}
	if ext == ".mp3" {
		args = append(args, "-c:a", "libmp3lame", "-q:a", "2", "-write_xing", "1")
	} else {
		args = append(args, "-c:a", "copy")
	}
	args = append(args, outPath)

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("ffmpeg audio fix failed: %v\nOutput: %s", err, string(out))
	}
	return nil
}

// normalizeAudioToWAV pre-decodes any uploaded audio into a clean 48kHz stereo PCM WAV so corrupt VBR headers never affect muxing.
func normalizeAudioToWAV(ctx context.Context, rawAudioPath, cleanWavPath string) error {
	cmd := exec.CommandContext(ctx, "ffmpeg", "-y", "-protocol_whitelist", "file", "-i", rawAudioPath, "-vn", "-acodec", "pcm_s16le", "-ar", "48000", "-ac", "2", cleanWavPath)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("audio normalization failed: %v\nOutput: %s", err, string(out))
	}
	return nil
}

type ffmpegPipeEncoder struct {
	name   string
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stderr bytes.Buffer
}

func startFFmpegPipe(ctx context.Context, name string, args []string) (*ffmpegPipeEncoder, error) {
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to open ffmpeg stdin pipe for %s: %w", name, err)
	}
	enc := &ffmpegPipeEncoder{
		name:  name,
		cmd:   cmd,
		stdin: stdin,
	}
	cmd.Stderr = &enc.stderr
	if err := cmd.Start(); err != nil {
		stdin.Close()
		return nil, fmt.Errorf("failed to start ffmpeg for %s: %w", name, err)
	}
	return enc, nil
}

func (e *ffmpegPipeEncoder) finish() error {
	_ = e.stdin.Close()
	if err := e.cmd.Wait(); err != nil {
		return fmt.Errorf("ffmpeg %s encode failed: %v\nOutput: %s", e.name, err, e.stderr.String())
	}
	return nil
}

func (e *ffmpegPipeEncoder) abort() {
	_ = e.stdin.Close()
	if e.cmd.Process != nil {
		_ = e.cmd.Process.Kill()
	}
	_ = e.cmd.Wait()
}

func buildWebPPipeArgs(outPath string, fps int, loopMode string) []string {
	args := []string{
		"-y",
		"-f", "image2pipe",
		"-c:v", "png",
		"-framerate", fmt.Sprintf("%d", fps),
		"-protocol_whitelist", "pipe,fd",
		"-i", "-",
		"-vcodec", "libwebp",
		"-lossless", "0",
		"-qscale", "80",
		"-pix_fmt", "yuva420p",
		"-an",
	}
	if loopMode == "once" {
		args = append(args, "-loop", "1")
	} else {
		args = append(args, "-loop", "0")
	}
	return append(args, outPath)
}

func buildAPNGPipeArgs(outPath string, fps int, loopMode string) []string {
	args := []string{
		"-y",
		"-f", "image2pipe",
		"-c:v", "png",
		"-framerate", fmt.Sprintf("%d", fps),
		"-protocol_whitelist", "pipe,fd",
		"-i", "-",
		"-f", "apng",
		"-pix_fmt", "rgba",
	}
	if loopMode == "once" {
		args = append(args, "-plays", "1")
	} else {
		args = append(args, "-plays", "0")
	}
	return append(args, outPath)
}

func buildMP4PipeArgs(outPath string, fps int, durationSecs float64, effectiveAudioPath, audioFit string) []string {
	args := []string{
		"-y",
		"-f", "image2pipe",
		"-c:v", "png",
		"-framerate", fmt.Sprintf("%d", fps),
		"-protocol_whitelist", "pipe,fd",
		"-i", "-",
	}

	if effectiveAudioPath != "" {
		if audioFit == "" || audioFit == "loop" {
			args = append(args, "-stream_loop", "-1", "-protocol_whitelist", "file", "-i", effectiveAudioPath)
		} else {
			args = append(args, "-protocol_whitelist", "file", "-i", effectiveAudioPath)
		}
		args = append(args, "-map", "0:v:0", "-map", "1:a:0")
	}

	args = append(args,
		"-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
		"-c:v", "libx264",
		"-preset", "medium",
		"-crf", "18",
		"-pix_fmt", "yuv420p",
		"-movflags", "+faststart",
	)

	if effectiveAudioPath != "" {
		switch audioFit {
		case "pad":
			args = append(args, "-af", "apad")
		case "fade":
			fadeStart := durationSecs - 0.5
			if fadeStart < 0 {
				fadeStart = 0
			}
			args = append(args, "-af", fmt.Sprintf("apad,afade=t=out:st=%.2f:d=0.5", fadeStart))
		}
		args = append(args,
			"-c:a", "aac",
			"-b:a", "192k",
			"-t", fmt.Sprintf("%.2f", durationSecs),
		)
	} else {
		args = append(args, "-an")
	}

	return append(args, outPath)
}

// Export preserves backward compatibility for headless CLI invocations.
func Export(htmlPath, outPath, format string, durationSecs float64, fps int, loopMode string, dims ...int) error {
	return ExportContext(context.Background(), htmlPath, outPath, format, durationSecs, fps, loopMode, "", "loop", nil, dims...)
}

// ExportContext streams frames directly from Headless Chrome into FFmpeg via RAM pipe (0 MB disk usage for frames).
func ExportContext(ctx context.Context, htmlPath, outPath, format string, durationSecs float64, fps int, loopMode, audioPath, audioFit string, onProgress ProgressFunc, dims ...int) error {
	switch format {
	case "webp":
		return ExportBundleContext(ctx, htmlPath, outPath, "", "", "", audioFit, durationSecs, fps, loopMode, onProgress, dims...)
	case "mp4":
		return ExportBundleContext(ctx, htmlPath, "", "", outPath, audioPath, audioFit, durationSecs, fps, loopMode, onProgress, dims...)
	default:
		return ExportBundleContext(ctx, htmlPath, "", outPath, "", "", audioFit, durationSecs, fps, loopMode, onProgress, dims...)
	}
}

// ExportBothContext preserves compatibility and delegates to ExportBundleContext.
func ExportBothContext(ctx context.Context, htmlPath, webpOutPath, apngOutPath string, durationSecs float64, fps int, loopMode string, onProgress ProgressFunc, dims ...int) error {
	return ExportBundleContext(ctx, htmlPath, webpOutPath, apngOutPath, "", "", "loop", durationSecs, fps, loopMode, onProgress, dims...)
}

type encoderWorker struct {
	enc *ffmpegPipeEncoder
	ch  chan []byte
	err error
	wg  sync.WaitGroup
}

type fanOutDistributor struct {
	workers []*encoderWorker
	ctx     context.Context
}

func newFanOutDistributor(ctx context.Context, encoders []*ffmpegPipeEncoder) *fanOutDistributor {
	d := &fanOutDistributor{
		ctx: ctx,
	}
	for _, enc := range encoders {
		w := &encoderWorker{
			enc: enc,
			ch:  make(chan []byte, 8),
		}
		w.wg.Add(1)
		go func(worker *encoderWorker) {
			defer worker.wg.Done()
			defer worker.enc.stdin.Close()
			for {
				select {
				case <-ctx.Done():
					return
				case frame, ok := <-worker.ch:
					if !ok {
						return
					}
					if _, err := worker.enc.stdin.Write(frame); err != nil {
						worker.err = fmt.Errorf("write error on %s: %w", worker.enc.name, err)
						return
					}
				}
			}
		}(w)
		d.workers = append(d.workers, w)
	}
	return d
}

func (d *fanOutDistributor) Write(frame []byte) (int, error) {
	for _, w := range d.workers {
		if w.err != nil {
			return 0, w.err
		}
	}
	frameCopy := make([]byte, len(frame))
	copy(frameCopy, frame)

	for _, w := range d.workers {
		select {
		case <-d.ctx.Done():
			return 0, d.ctx.Err()
		case w.ch <- frameCopy:
		}
	}
	return len(frame), nil
}

func (d *fanOutDistributor) Finish() error {
	for _, w := range d.workers {
		close(w.ch)
	}
	for _, w := range d.workers {
		w.wg.Wait()
	}

	var wg sync.WaitGroup
	var errMu sync.Mutex
	var errList []error

	for _, w := range d.workers {
		wg.Add(1)
		go func(worker *encoderWorker) {
			defer wg.Done()
			if worker.err != nil {
				errMu.Lock()
				errList = append(errList, worker.err)
				errMu.Unlock()
				return
			}
			if err := worker.enc.cmd.Wait(); err != nil {
				errMu.Lock()
				errList = append(errList, fmt.Errorf("ffmpeg %s encode failed: %v\nOutput: %s", worker.enc.name, err, worker.enc.stderr.String()))
				errMu.Unlock()
			}
		}(w)
	}
	wg.Wait()

	if len(errList) > 0 {
		return errList[0]
	}
	return nil
}

// ExportBundleContext captures SVG frames once and streams them directly into active FFmpeg pipes in RAM.
func ExportBundleContext(ctx context.Context, htmlPath, webpOutPath, apngOutPath, mp4OutPath, audioPath, audioFit string, durationSecs float64, fps int, loopMode string, onProgress ProgressFunc, dims ...int) error {
	width, height, fps, captureDuration, totalFrames := normalizeParams(durationSecs, fps, loopMode, dims...)

	effectiveAudioPath := ""
	if mp4OutPath != "" && audioPath != "" {
		cleanWav := audioPath + "_norm.wav"
		if err := normalizeAudioToWAV(ctx, audioPath, cleanWav); err == nil {
			effectiveAudioPath = cleanWav
			defer os.Remove(cleanWav)
		} else {
			effectiveAudioPath = audioPath
		}
	}

	var encoders []*ffmpegPipeEncoder

	abortAll := func() {
		for _, enc := range encoders {
			enc.abort()
		}
	}

	if webpOutPath != "" {
		enc, err := startFFmpegPipe(ctx, "WebP", buildWebPPipeArgs(webpOutPath, fps, loopMode))
		if err != nil {
			abortAll()
			return err
		}
		encoders = append(encoders, enc)
	}

	if apngOutPath != "" {
		enc, err := startFFmpegPipe(ctx, "APNG", buildAPNGPipeArgs(apngOutPath, fps, loopMode))
		if err != nil {
			abortAll()
			return err
		}
		encoders = append(encoders, enc)
	}

	if mp4OutPath != "" {
		enc, err := startFFmpegPipe(ctx, "MP4", buildMP4PipeArgs(mp4OutPath, fps, captureDuration, effectiveAudioPath, audioFit))
		if err != nil {
			abortAll()
			return err
		}
		encoders = append(encoders, enc)
	}

	distributor := newFanOutDistributor(ctx, encoders)

	if err := streamFramesToWriter(ctx, htmlPath, distributor, captureDuration, fps, width, height, onProgress); err != nil {
		abortAll()
		return fmt.Errorf("frame capture failed: %w", err)
	}

	if onProgress != nil {
		onProgress(totalFrames, totalFrames, "Finalizing video container & audio streams...")
	}

	if err := distributor.Finish(); err != nil {
		abortAll()
		return err
	}

	return nil
}

func normalizeParams(durationSecs float64, fps int, loopMode string, dims ...int) (int, int, int, float64, int) {
	width := 1920
	height := 1080
	if len(dims) >= 2 && dims[0] > 0 && dims[1] > 0 {
		width = dims[0]
		height = dims[1]
	}
	if width%2 != 0 {
		width++
	}
	if height%2 != 0 {
		height++
	}
	if fps <= 0 {
		fps = 24
	}
	if durationSecs <= 0 {
		durationSecs = 7.0
	}

	captureDuration := durationSecs
	if loopMode == "pingpong" {
		captureDuration = durationSecs * 2.0
	}

	totalFrames := int(captureDuration * float64(fps))
	if totalFrames < 1 {
		totalFrames = 1
	}

	return width, height, fps, captureDuration, totalFrames
}

const scrubberJS = `
		function solveCubicBezier(x1, y1, x2, y2, x) {
			if (x <= 0) return 0;
			if (x >= 1) return 1;
			if (x1 === y1 && x2 === y2) return x;
			let t = x;
			for (let i = 0; i < 8; i++) {
				const cx = 3 * x1;
				const bx = 3 * (x2 - x1) - cx;
				const ax = 1 - cx - bx;
				const currentX = ((ax * t + bx) * t + cx) * t - x;
				if (Math.abs(currentX) < 1e-6) break;
				const deriv = (3 * ax * t + 2 * bx) * t + cx;
				if (Math.abs(deriv) < 1e-6) break;
				t -= currentX / deriv;
			}
			const cy = 3 * y1;
			const by = 3 * (y2 - y1) - cy;
			const ay = 1 - cy - by;
			return ((ay * t + by) * t + cy) * t;
		}

		function segmentGraphemes(str) {
			const t = String(str || '');
			if (!t) return [];
			if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
				try {
					return Array.from((new Intl.Segmenter(undefined, { granularity: 'grapheme' })).segment(t), function(x) { return x.segment; });
				} catch (_) {}
			}
			return Array.from(t);
		}

		function isStoppedByPlayFalse(el) {
			if (!el) return false;
			if (el.getAttribute && (el.getAttribute('data-lite-play') === 'false' || el.getAttribute('data-play-animation') === 'false')) {
				return true;
			}
			if (el.closest && el.closest('[data-lite-play="false"], [data-play-animation="false"]')) {
				return true;
			}
			return false;
		}

		function initDeterministicScene() {
			if (window.__svaDeterministicInitDone) return;
			window.__svaDeterministicInitDone = true;

			// 1. Apply play === false stopping for CSS & SMIL objects
			document.querySelectorAll('[data-lite-play="false"], [data-play-animation="false"]').forEach(stEl => {
				stEl.querySelectorAll('.lite-payload, .lite-osc-wave, .lite-text-element').forEach(node => {
					if (node.style) {
						node.style.animationPlayState = 'paused';
						node.style.animationName = 'none';
					}
				});
				stEl.querySelectorAll('animate, animateTransform, animateMotion, set').forEach(smil => {
					smil.setAttribute('begin', 'indefinite');
					if (typeof smil.endElement === 'function') {
						try { smil.endElement(); } catch (_) {}
					}
					if (smil.parentNode) {
						smil.parentNode.removeChild(smil);
					}
				});
				if (stEl.classList && stEl.classList.contains('diagram-flow-instance')) {
					stEl.querySelectorAll('.flow-payload-wrapper, .flow-payload-group').forEach(p => {
						p.setAttribute('visibility', 'hidden');
						if (p.style) p.style.visibility = 'hidden';
					});
				}
			});

			// 2. Calibrate horizontal tickers (ticker-h) using true rendered DOM text length
			document.querySelectorAll('[data-lite-kind="text-lite"]').forEach(g => {
				if (isStoppedByPlayFalse(g)) return;
				let anim = g.getAttribute('data-text-anim') || 'none';
				if (anim === 'overtype') anim = 'typewriter';
				if (anim !== 'ticker-h') return;
				const txtEl = g.querySelector('.lite-text-element');
				if (!txtEl) return;
				const fullStr = g.getAttribute('data-text-content') || txtEl.textContent || '';
				const w = parseFloat(g.getAttribute('data-text-w')) || 220;
				const pad = parseFloat(g.getAttribute('data-text-padding')) || 12;
				const dir = g.getAttribute('data-text-direction') === 'reverse' ? 'reverse' : 'forward';
				const pMode = g.getAttribute('data-text-playback-mode') || 'loop';
				const spd = Math.max(10, parseFloat(g.getAttribute('data-text-scroll-speed')) || 90);
				let tw = 0;
				try { tw = txtEl.getComputedTextLength(); } catch (_) {}
				if (!(tw > 0)) tw = Math.max(18, segmentGraphemes(fullStr).length * 10);
				const dist = Math.max(20, w + tw);
				const dur = Math.max(0.15, dist / spd);
				const startPx = dir === 'reverse' ? -tw : w;
				const endPx = pMode === 'once' ? pad : (dir === 'reverse' ? w : -tw);
				txtEl.style.setProperty('--sva-ticker-start', startPx.toFixed(2) + 'px');
				txtEl.style.setProperty('--sva-ticker-end', endPx.toFixed(2) + 'px');
				txtEl.style.animationDuration = dur.toFixed(4) + 's';
			});
		}

		function evaluateTextLiteAtTime(g, ms) {
			let anim = g.getAttribute('data-text-anim') || 'none';
			if (anim === 'overtype') anim = 'typewriter';
			if (anim !== 'typewriter' && anim !== 'scramble') return;
			const txtEl = g.querySelector('.lite-text-element');
			const targetNode = g.querySelector('.lite-text-path') || txtEl;
			if (!txtEl || !targetNode) return;
			const fullStr = g.getAttribute('data-text-content') || '';
			if (isStoppedByPlayFalse(g)) {
				targetNode.textContent = fullStr;
				return;
			}
			const gs = segmentGraphemes(fullStr);
			const N = gs.length;
			if (N === 0) {
				targetNode.textContent = '';
				return;
			}
			const rate = Math.max(1, parseFloat(g.getAttribute('data-text-type-speed')) || 14);
			const hold = Math.max(0, parseFloat(g.getAttribute('data-text-hold-delay')) || 1.5);
			const pMode = g.getAttribute('data-text-playback-mode') || 'loop';
			const stepMs = Math.max(12, Math.round(1000 / rate));

			if (anim === 'scramble') {
				const cipher = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&*';
				const activeDur = N * stepMs;
				const holdDur = Math.max(200, hold * 1000);
				const cycleDur = activeDur + holdDur;
				let localMs = ms;
				if (pMode !== 'once' && cycleDur > 0) {
					localMs = ms % cycleDur;
				}
				let idx = Math.floor(localMs / stepMs);
				if (idx > N) idx = N;
				if (idx < 0) idx = 0;
				let out = '';
				for (let k = 0; k < N; k++) {
					if (k < idx || gs[k] === ' ') {
						out += gs[k];
					} else {
						out += cipher.charAt((k * 7 + (idx + 1) * 13) % cipher.length);
					}
				}
				targetNode.textContent = out;
				return;
			}

			// Typewriter
			let mode = g.getAttribute('data-text-type-mode') || 'hold';
			if (mode === 'loop') mode = 'delete';
			const rep = g.getAttribute('data-text-type-repeat') === 'true' || pMode === 'loop';
			const delStepMs = Math.max(10, Math.round(stepMs * 0.75));
			const typeDur = N * stepMs;

			if (mode === 'delete' || mode === 'delete-forward') {
				const holdDur = Math.max(60, hold * 1000);
				const delDur = N * delStepMs;
				const pauseDur = rep ? 250 : 0;
				const cycleDur = typeDur + holdDur + delDur + pauseDur;
				let localMs = ms;
				if (rep && cycleDur > 0) {
					localMs = ms % cycleDur;
				}
				if (localMs < typeDur) {
					const idx = Math.min(N, Math.floor(localMs / stepMs));
					targetNode.textContent = gs.slice(0, idx).join('');
				} else if (localMs < typeDur + holdDur) {
					targetNode.textContent = fullStr;
				} else if (localMs < typeDur + holdDur + delDur) {
					const delElapsed = localMs - (typeDur + holdDur);
					const delSteps = Math.min(N, Math.floor(delElapsed / delStepMs) + 1);
					const rem = Math.max(0, N - delSteps);
					if (mode === 'delete') {
						targetNode.textContent = gs.slice(0, rem).join('');
					} else {
						targetNode.textContent = gs.slice(N - rem).join('');
					}
				} else {
					targetNode.textContent = '';
				}
			} else {
				const holdDur = Math.max(200, hold * 1000);
				const cycleDur = typeDur + holdDur;
				let localMs = ms;
				if (rep && cycleDur > 0) {
					localMs = ms % cycleDur;
				}
				if (localMs < typeDur) {
					const idx = Math.min(N, Math.floor(localMs / stepMs));
					targetNode.textContent = gs.slice(0, idx).join('');
				} else {
					targetNode.textContent = fullStr;
				}
			}
		}

		function evaluateBurstCyclesAtTime(n, ms) {
			if (isStoppedByPlayFalse(n)) return;
			const cyc = parseInt(n.getAttribute('data-burst-cycles') || '0', 10);
			const pSec = parseFloat(n.getAttribute('data-pause-seconds') || '0');
			if (!(cyc > 0 && pSec > 0)) return;
			const anims = (typeof n.getAnimations === 'function') ? n.getAnimations() : [];
			let baseDurSec = parseFloat((n.style && n.style.getPropertyValue('--sva-base-dur')) || (n.style && n.style.animationDuration) || '0');
			if (!(baseDurSec > 0) && anims.length > 0 && anims[0].effect && typeof anims[0].effect.getTiming === 'function') {
				const d = anims[0].effect.getTiming().duration;
				if (typeof d === 'number' && d > 0) baseDurSec = d / 1000.0;
			}
			if (!(baseDurSec > 0) && typeof window.getComputedStyle === 'function') {
				const cd = parseFloat(window.getComputedStyle(n).animationDuration || '0');
				if (cd > 0) baseDurSec = cd;
			}
			if (!(baseDurSec > 0)) baseDurSec = 1;
			const activeMs = cyc * baseDurSec * 1000.0;
			const pauseMs = pSec * 1000.0;
			const startDelaySec = parseFloat(n.getAttribute('data-flow-start-delay') || '0') || 0;
			const startDelayMs = startDelaySec * 1000.0;
			const totalCycleMs = activeMs + pauseMs;
			if (totalCycleMs <= 0) return;

			const visMode = n.getAttribute('data-pause-visibility') || 'hide';
			const phaseRatio = parseFloat((n.style && n.style.getPropertyValue('--sva-phase-ratio')) || '0') || 0;
			const phaseDelayMs = Math.abs(phaseRatio) * baseDurSec * 1000.0;

			if (ms < startDelayMs) {
				if (visMode === 'hide') {
					n.setAttribute('visibility', 'hidden');
					if (n.style) {
						n.style.visibility = 'hidden';
						n.style.opacity = '0';
					}
				}
				anims.forEach(a => {
					try { a.pause(); a.currentTime = phaseDelayMs; } catch (_) {}
				});
				return;
			}

			const localMs = (ms - startDelayMs) % totalCycleMs;
			if (localMs < activeMs) {
				n.removeAttribute('visibility');
				if (n.style) {
					n.style.visibility = '';
					n.style.opacity = '';
				}
				anims.forEach(a => {
					try { a.pause(); a.currentTime = localMs + phaseDelayMs; } catch (_) {}
				});
			} else {
				if (visMode === 'hide') {
					n.setAttribute('visibility', 'hidden');
					if (n.style) {
						n.style.visibility = 'hidden';
						n.style.opacity = '0';
					}
				} else {
					n.removeAttribute('visibility');
					if (n.style) {
						n.style.visibility = '';
						n.style.opacity = '';
					}
				}
				anims.forEach(a => {
					try { a.pause(); a.currentTime = Math.max(0, activeMs - 0.1) + phaseDelayMs; } catch (_) {}
				});
			}
		}

		function setAnimTime(ms) {
			initDeterministicScene();
			const sec = ms / 1000.0;
			
			document.getAnimations({ subtree: true }).forEach(anim => {
				try {
					const target = anim.effect && anim.effect.target;
					if (target && isStoppedByPlayFalse(target)) {
						anim.pause();
						return;
					}
					anim.pause();
					anim.currentTime = ms;
				} catch (_) {}
			});
			
			document.querySelectorAll('svg').forEach(svg => { 
				if (svg.setCurrentTime) { 
					try {
						svg.pauseAnimations(); 
						svg.setCurrentTime(sec); 
					} catch (_) {}
				} 
			});

			document.querySelectorAll('[data-burst-cycles]').forEach(n => {
				evaluateBurstCyclesAtTime(n, ms);
			});

			document.querySelectorAll('[data-lite-kind="text-lite"]').forEach(g => {
				evaluateTextLiteAtTime(g, ms);
			});

			document.querySelectorAll('filter animate, filter animateTransform, mask animate, mask animateTransform').forEach(anim => {
				const parent = anim.parentElement;
				const attr = anim.getAttribute('attributeName');
				if (anim.getAttribute('begin') === 'indefinite' || isStoppedByPlayFalse(anim)) return;
				let durAttr = anim.getAttribute('dur') || '';
				let dur = parseFloat(durAttr);
				if (durAttr.endsWith('ms')) dur = dur / 1000.0;
				if (isNaN(dur) || dur <= 0) dur = 1.0;

				let beginAttr = anim.getAttribute('begin') || '';
				let begin = parseFloat(beginAttr) || 0.0;
				if (beginAttr.endsWith('ms')) begin = begin / 1000.0;

				const localSec = sec - begin;
				if (localSec < 0) return;

				let progress;
				const fill = anim.getAttribute('fill') || 'remove';
				if (anim.getAttribute('repeatCount') === 'indefinite') {
					progress = (localSec % dur) / dur;
				} else {
					if (localSec > dur && fill !== 'freeze') {
						return;
					}
					progress = localSec / dur;
					if (progress > 1.0) progress = 1.0;
				}
				if (progress < 0.0) progress = 0.0;
				
				let fromAttr = anim.getAttribute('from');
				let toAttr = anim.getAttribute('to');
				let segProgress = progress;

				const calcMode = anim.getAttribute('calcMode') || 'linear';
				const splinesAttr = anim.getAttribute('keySplines');
				const splines = splinesAttr ? splinesAttr.split(';').map(s => s.trim()).filter(Boolean) : [];
				const keyTimesAttr = anim.getAttribute('keyTimes');
				const keyTimes = keyTimesAttr ? keyTimesAttr.split(';').map(k => parseFloat(k.trim())).filter(k => !isNaN(k)) : [];

				if (anim.hasAttribute('values')) {
					const vals = anim.getAttribute('values').split(';').map(v => v.trim()).filter(v => v !== '');
					const numSegments = vals.length - 1;
					if (numSegments > 0) {
						let segIdx = 0;
						if (keyTimes.length === vals.length) {
							for (let i = 0; i < numSegments; i++) {
								if (progress >= keyTimes[i] && progress <= keyTimes[i + 1]) {
									segIdx = i;
									const span = keyTimes[i + 1] - keyTimes[i];
									segProgress = span > 0 ? (progress - keyTimes[i]) / span : 1.0;
									break;
								} else if (progress > keyTimes[numSegments]) {
									segIdx = numSegments - 1;
									segProgress = 1.0;
								}
							}
						} else {
							let scaled = progress * numSegments;
							if (scaled >= numSegments) {
								segIdx = numSegments - 1;
								segProgress = 1.0;
							} else {
								segIdx = Math.floor(scaled);
								segProgress = scaled - segIdx;
							}
						}

						fromAttr = vals[segIdx];
						toAttr = vals[segIdx + 1];

						if (calcMode === 'spline' && splines[segIdx]) {
							const pts = splines[segIdx].split(/[\s,]+/).map(parseFloat);
							if (pts.length === 4 && !pts.some(isNaN)) {
								segProgress = solveCubicBezier(pts[0], pts[1], pts[2], pts[3], segProgress);
							}
						}
					}
				} else if (calcMode === 'spline' && splines[0]) {
					const pts = splines[0].split(/[\s,]+/).map(parseFloat);
					if (pts.length === 4 && !pts.some(isNaN)) {
						segProgress = solveCubicBezier(pts[0], pts[1], pts[2], pts[3], segProgress);
					}
				}

				if (fromAttr != null && toAttr != null) {
					const fromParts = fromAttr.split(/[\s,]+/);
					const toParts = toAttr.split(/[\s,]+/);
					
					let resultVals = [];
					for (let i = 0; i < fromParts.length; i++) {
						const f = parseFloat(fromParts[i]);
						const t = parseFloat(toParts[i] || toParts[0]);
						if (!isNaN(f) && !isNaN(t)) {
							const val = f + (t - f) * segProgress;
							resultVals.push(val.toFixed(4));
						}
					}
					if (resultVals.length > 0) {
						parent.setAttribute(attr, resultVals.join(' '));
					}
				}
			});

			const svgEl = document.querySelector('svg');
			if (svgEl) {
				void svgEl.getBoundingClientRect();
			}
			return true;
		}
	`

func streamFramesToWriter(parentCtx context.Context, htmlPath string, frameWriter io.Writer, duration float64, fps, width, height int, onProgress ProgressFunc) error {
	totalFrames := int(duration * float64(fps))
	if totalFrames < 1 {
		totalFrames = 1
	}

	if onProgress != nil {
		onProgress(0, totalFrames, "Initializing vector rasterization pipeline...")
	}

	absPath, err := filepath.Abs(htmlPath)
	if err != nil {
		return fmt.Errorf("failed to get absolute html path: %w", err)
	}

	isTransparent := false
	if rawHTML, readErr := os.ReadFile(absPath); readErr == nil {
		if strings.Contains(string(rawHTML), `data-bg-transparent="true"`) {
			isTransparent = true
		}
	}

	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("headless", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("window-size", fmt.Sprintf("%d,%d", width, height)),
	)

	allocCtx, cancelAlloc := chromedp.NewExecAllocator(parentCtx, opts...)
	defer cancelAlloc()

	ctx, cancel := chromedp.NewContext(allocCtx)
	defer cancel()

	ctx, cancelTimeout := context.WithTimeout(ctx, 30*time.Minute)
	defer cancelTimeout()

	fileURL := "file://" + filepath.ToSlash(absPath)

	// Intercept and strictly block external network requests and unauthorized file reads
	events := chromedp.Events(ctx, fetch.RequestPaused)
	go func() {
		for ev, err := range events {
			if err != nil {
				return
			}
			reqURL := ev.Request.URL
			// Allow main document navigation to fileURL and inline data URIs; block all SSRF / external URLs
			if reqURL == fileURL || strings.HasPrefix(reqURL, "data:") {
				_, _ = chromedp.Call(ctx, fetch.ContinueRequest, fetch.ContinueRequestParams{
					RequestID: ev.RequestID,
				})
			} else {
				_, _ = chromedp.Call(ctx, fetch.FailRequest, fetch.FailRequestParams{
					RequestID:   ev.RequestID,
					ErrorReason: network.ErrorReasonBlockedByClient,
				})
			}
		}
	}()

	cssOverrideJS := `
		var isTrans = document.body.getAttribute('data-bg-transparent') === 'true' ||
			(document.querySelector('svg') && document.querySelector('svg').getAttribute('data-bg-transparent') === 'true');
		var customBg = document.body.getAttribute('data-bg-color') || '';
		if (document.documentElement) {
			document.documentElement.style.background = isTrans ? 'transparent' : (customBg || '#000000');
			document.documentElement.style.backgroundColor = isTrans ? 'transparent' : (customBg || '#000000');
		}
		document.body.style.margin = '0';
		document.body.style.padding = '0';
		document.body.style.overflow = 'hidden';
		if (isTrans) {
			document.body.style.background = 'transparent';
			document.body.style.backgroundColor = 'transparent';
		} else if (customBg) {
			document.body.style.background = customBg;
			document.body.style.backgroundColor = customBg;
		} else {
			document.body.style.background = '#000000';
			document.body.style.backgroundColor = '#000000';
		}
		
		var vp = document.querySelector('.viewport');
		if (vp) {
			vp.style.all = 'unset';
			vp.style.display = 'block';
			vp.style.width = '100vw';
			vp.style.height = '100vh';
			if (isTrans) {
				vp.style.background = 'transparent';
				vp.style.backgroundColor = 'transparent';
			}
		}
		
		var svg = document.querySelector('svg');
		if (svg) {
			svg.style.position = 'absolute';
			svg.style.top = '0';
			svg.style.left = '0';
			svg.style.width = '100vw';
			svg.style.height = '100vh';
			svg.style.margin = '0';
			svg.style.display = 'block';
			if (isTrans) {
				svg.style.background = 'transparent';
				svg.style.backgroundColor = 'transparent';
			}
			var curPreserve = svg.getAttribute('preserveAspectRatio');
			if (!curPreserve || curPreserve === 'none') {
				svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
			}
		}
	`

	fmt.Println(">> Target URL:", fileURL)
	fmt.Println(">> Initializing zero-disk streaming vector rasterizer...")

	if _, err := chromedp.Call(ctx, fetch.Enable, fetch.EnableParams{}); err != nil {
		return fmt.Errorf("failed to enable fetch security filter: %w", err)
	}

	if _, err := chromedp.Run(ctx, chromedp.Navigate(fileURL)); err != nil {
		return fmt.Errorf("failed to navigate: %w", err)
	}

	if _, err := chromedp.Run(ctx, chromedp.WaitReady(`svg`)); err != nil {
		return fmt.Errorf("svg failed to render: %w", err)
	}

	if _, err := chromedp.Call(ctx, emulation.SetDeviceMetricsOverride, emulation.SetDeviceMetricsOverrideParams{
		Width:             int64(width),
		Height:            int64(height),
		DeviceScaleFactor: 1.0,
		Mobile:            false,
	}); err != nil {
		fmt.Printf(">> Notice: failed to set device metrics override (%dx%d): %v\n", width, height, err)
	}

	if isTransparent {
		if _, err := chromedp.Call(ctx, emulation.SetDefaultBackgroundColorOverride, emulation.SetDefaultBackgroundColorOverrideParams{
			Color: &cdp.RGBA{R: 0, G: 0, B: 0, A: 1e-6},
		}); err != nil {
			fmt.Printf(">> Notice: failed to set transparent background override: %v\n", err)
		}
	}

	// Wait for any embedded images or images to fully decode before starting frame capture (H-001)
	waitForImagesJS := `(async () => {
		const imgs = Array.from(document.querySelectorAll('image, img'));
		await Promise.all(imgs.map((img) => {
			if (img.complete) return Promise.resolve();
			if (typeof img.decode === 'function') return img.decode().catch(() => {});
			return new Promise((res) => { img.onload = img.onerror = res; });
		}));
		return true;
	})()`
	if _, err := chromedp.Run(ctx, chromedp.Evaluate[any](waitForImagesJS)); err != nil {
		fmt.Printf(">> Notice: image pre-decode completed or bypassed: %v\n", err)
	}

	if _, err := chromedp.Run(ctx, chromedp.Evaluate[any](cssOverrideJS)); err != nil {
		return fmt.Errorf("failed to inject css overrides: %w", err)
	}

	if isTransparent {
		_, _ = chromedp.Call(ctx, emulation.SetDefaultBackgroundColorOverride, emulation.SetDefaultBackgroundColorOverrideParams{
			Color: &cdp.RGBA{R: 0, G: 0, B: 0, A: 1e-6},
		})
	}

	if _, err := chromedp.Run(ctx, chromedp.Evaluate[any](scrubberJS)); err != nil {
		return fmt.Errorf("failed to inject scrubber: %w", err)
	}

	fmt.Printf(">> Streaming %d frames at %d FPS (%dx%d) directly to FFmpeg pipe...\n", totalFrames, fps, width, height)

	for i := 0; i < totalFrames; i++ {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("render canceled: %w", err)
		}

		ms := float64(i) * (1000.0 / float64(fps))

		if _, err := chromedp.Run(ctx, chromedp.Evaluate[any](fmt.Sprintf("setAnimTime(%f)", ms))); err != nil {
			return fmt.Errorf("failed scrubbing frame %d: %w", i, err)
		}

		if err := ctx.Err(); err != nil {
			return fmt.Errorf("render canceled: %w", err)
		}

		buf, err := chromedp.Run(ctx, chromedp.CaptureScreenshot())
		if err != nil {
			return fmt.Errorf("failed capturing frame %d: %w", i, err)
		}

		if _, err := frameWriter.Write(buf); err != nil {
			return fmt.Errorf("failed piping frame %d to ffmpeg: %w", i, err)
		}

		if onProgress != nil {
			onProgress(i+1, totalFrames, fmt.Sprintf("Streaming & encoding frame %d of %d", i+1, totalFrames))
		}
	}

	fmt.Println(">> Frame streaming complete.")
	return nil
}