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
	outBytes, _ := cmd.CombinedOutput()
	out := string(outBytes)

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
		"-protocol_whitelist", "pipe",
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
		"-protocol_whitelist", "pipe",
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
		"-protocol_whitelist", "pipe",
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

func streamFramesToWriter(parentCtx context.Context, htmlPath string, frameWriter io.Writer, duration float64, fps, width, height int, onProgress ProgressFunc) error {
	totalFrames := int(duration * float64(fps))
	if totalFrames < 1 {
		totalFrames = 1
	}

	if onProgress != nil {
		onProgress(0, totalFrames, "Initializing vector rasterization pipeline...")
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

	absPath, err := filepath.Abs(htmlPath)
	if err != nil {
		return fmt.Errorf("failed to get absolute html path: %w", err)
	}
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

	scrubberJS := `
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

		function setAnimTime(ms) {
			const sec = ms / 1000.0;
			
			document.getAnimations().forEach(anim => {
				anim.pause();
				anim.currentTime = ms;
			});
			
			document.querySelectorAll('svg').forEach(svg => { 
				if (svg.setCurrentTime) { 
					svg.pauseAnimations(); 
					svg.setCurrentTime(sec); 
				} 
			});

			document.querySelectorAll('filter animate, filter animateTransform, mask animate, mask animateTransform').forEach(anim => {
				const parent = anim.parentElement;
				const attr = anim.getAttribute('attributeName');
				let dur = parseFloat(anim.getAttribute('dur'));
				if (isNaN(dur) || dur <= 0) dur = 1.0;
				const begin = parseFloat(anim.getAttribute('begin')) || 0.0;

				const localSec = sec - begin;
				if (localSec < 0) return;

				let progress;
				if (anim.getAttribute('repeatCount') === 'indefinite') {
					progress = (localSec % dur) / dur;
				} else {
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

	cssOverrideJS := `
		var isTrans = document.body.getAttribute('data-bg-transparent') === 'true' ||
			(document.querySelector('svg') && document.querySelector('svg').getAttribute('data-bg-transparent') === 'true');
		var customBg = document.body.getAttribute('data-bg-color') || '';
		document.body.style.margin = '0';
		document.body.style.padding = '0';
		document.body.style.overflow = 'hidden';
		if (isTrans) {
			document.body.style.backgroundColor = 'transparent';
		} else if (customBg) {
			document.body.style.backgroundColor = customBg;
		} else {
			document.body.style.backgroundColor = '#000000';
		}
		
		var vp = document.querySelector('.viewport');
		if (vp) {
			vp.style.all = 'unset';
			vp.style.display = 'block';
			vp.style.width = '100vw';
			vp.style.height = '100vh';
			if (isTrans) {
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

	// Apply transparent screenshot background override in CDP if scene is transparent
	isTransparent, _ := chromedp.Run(ctx, chromedp.Evaluate[bool](`document.body.getAttribute('data-bg-transparent') === 'true' || (document.querySelector('svg') && document.querySelector('svg').getAttribute('data-bg-transparent') === 'true')`))
	if isTransparent {
		if _, err := chromedp.Call(ctx, emulation.SetDefaultBackgroundColorOverride, emulation.SetDefaultBackgroundColorOverrideParams{
			Color: &cdp.RGBA{R: 0, G: 0, B: 0, A: 0},
		}); err != nil {
			fmt.Printf(">> Notice: failed to set transparent background override: %v\n", err)
		}
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

		select {
		case <-ctx.Done():
			return fmt.Errorf("render canceled: %w", ctx.Err())
		case <-time.After(35 * time.Millisecond):
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