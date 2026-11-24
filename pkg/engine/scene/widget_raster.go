package scene

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"math"
	"regexp"
	"strconv"
	"strings"
)

var (
	reImageTag         = regexp.MustCompile(`(?is)<image\b[^>]*>`)
	reImageWidthAttr   = regexp.MustCompile(`(?i)\bwidth\s*=\s*["']([0-9]+(?:\.[0-9]+)?)["']`)
	reImageHeightAttr  = regexp.MustCompile(`(?i)\bheight\s*=\s*["']([0-9]+(?:\.[0-9]+)?)["']`)
	reImageHrefDataURI = regexp.MustCompile(`(?i)\bhref\s*=\s*(["'])(data:image/[a-zA-Z0-9.+_-]+;base64,[^"']+)["']`)
	reImageXlinkData   = regexp.MustCompile(`(?i)\s+\bxlink:href\s*=\s*["']data:image/[^"']+["']`)
	reImageOnlyXlink   = regexp.MustCompile(`(?i)\bxlink:href\s*=\s*(["'])(data:image/[^"']+)(["'])`)
)

// ValidateSafeImageSource validates that a candidate image/icon source string is safe
// for SVG <image href="..."> substitution (rejecting javascript:, vbscript:, file:, and non-image data: URIs).
func ValidateSafeImageSource(raw string) error {
	s := strings.TrimSpace(raw)
	if s == "" {
		return fmt.Errorf("image source cannot be empty")
	}
	if strings.ContainsAny(s, "<>\"'`\x00\r\n") {
		return fmt.Errorf("image source contains forbidden characters")
	}
	compact := strings.ToLower(strings.Map(func(r rune) rune {
		if r <= 0x20 {
			return -1
		}
		return r
	}, s))
	if strings.HasPrefix(compact, "javascript:") ||
		strings.HasPrefix(compact, "vbscript:") ||
		strings.HasPrefix(compact, "file:") {
		return fmt.Errorf("unsafe image source scheme in %q", raw)
	}
	if strings.HasPrefix(compact, "data:") {
		allowedDataPrefixes := []string{
			"data:image/png;",
			"data:image/png,",
			"data:image/jpeg;",
			"data:image/jpeg,",
			"data:image/jpg;",
			"data:image/jpg,",
			"data:image/webp;",
			"data:image/webp,",
			"data:image/gif;",
			"data:image/gif,",
			"data:image/bmp;",
			"data:image/bmp,",
			"data:image/avif;",
			"data:image/avif,",
			"data:image/svg+xml;",
			"data:image/svg+xml,",
		}
		okData := false
		for _, pfx := range allowedDataPrefixes {
			if strings.HasPrefix(compact, pfx) {
				okData = true
				break
			}
		}
		if !okData {
			return fmt.Errorf("unsupported or unsafe data URI in image source")
		}
	}
	return nil
}

// OptimizeSVGWidgetRasterImages deduplicates redundant xlink:href base64 payloads on <image> elements
// and downsamples oversized embedded raster images according to policy:
//   - "1x": downsample embedded rasters to 1x display width/height (never upscales)
//   - "2x" or "": downsample embedded rasters to 2x display width/height (default HiDPI policy; never upscales)
//   - "3x": downsample embedded rasters to 3x display width/height (never upscales)
//   - "original" / "preserve": preserve original pixel resolution while removing duplicate xlink:href data URIs
//   - "none": return rawSVG unchanged
func OptimizeSVGWidgetRasterImages(rawSVG string, policy string) string {
	normPolicy := strings.ToLower(strings.TrimSpace(policy))
	if normPolicy == "none" {
		return rawSVG
	}
	mult := 2.0
	downsample := true
	switch normPolicy {
	case "1x", "1":
		mult = 1.0
	case "2x", "2", "", "default", "auto":
		mult = 2.0
	case "3x", "3":
		mult = 3.0
	case "original", "preserve", "full":
		downsample = false
	default:
		mult = 2.0
	}

	return reImageTag.ReplaceAllStringFunc(rawSVG, func(tag string) string {
		updated := tag
		// 1. If both href="data:image/..." and xlink:href="data:image/..." exist, remove duplicate xlink:href
		if reImageHrefDataURI.MatchString(updated) && reImageXlinkData.MatchString(updated) {
			updated = reImageXlinkData.ReplaceAllString(updated, "")
		} else if !reImageHrefDataURI.MatchString(updated) && reImageOnlyXlink.MatchString(updated) {
			// Promote standalone xlink:href="data:image/..." to standard href="data:image/..."
			updated = reImageOnlyXlink.ReplaceAllString(updated, `href=${1}${2}${3}`)
		}

		if !downsample {
			return updated
		}

		// Skip inner <image> inside non-destructive crop <svg viewBox="..."> wrappers that set preserveAspectRatio="none"
		// without data-image-id or data-semantic-target, unless it has explicit display dimensions.
		wMatch := reImageWidthAttr.FindStringSubmatch(updated)
		hMatch := reImageHeightAttr.FindStringSubmatch(updated)
		if len(wMatch) < 2 || len(hMatch) < 2 {
			return updated
		}
		dispW, errW := strconv.ParseFloat(wMatch[1], 64)
		dispH, errH := strconv.ParseFloat(hMatch[1], 64)
		if errW != nil || errH != nil || dispW < 1 || dispH < 1 {
			return updated
		}

		targetW := int(math.Ceil(dispW * mult))
		targetH := int(math.Ceil(dispH * mult))
		if targetW < 1 || targetH < 1 {
			return updated
		}

		hrefMatch := reImageHrefDataURI.FindStringSubmatch(updated)
		if len(hrefMatch) < 3 {
			return updated
		}
		quote := hrefMatch[1]
		dataURI := hrefMatch[2]

		newURI, changed := downsampleDataURI(dataURI, targetW, targetH)
		if !changed || len(newURI) >= len(dataURI) {
			return updated
		}

		return reImageHrefDataURI.ReplaceAllString(updated, `href=`+quote+newURI+quote)
	})
}

func downsampleDataURI(dataURI string, targetW, targetH int) (string, bool) {
	commaIdx := strings.IndexByte(dataURI, ',')
	if commaIdx <= 0 {
		return dataURI, false
	}
	header := strings.ToLower(dataURI[:commaIdx])
	b64Payload := dataURI[commaIdx+1:]

	isPNG := strings.Contains(header, "image/png")
	isJPEG := strings.Contains(header, "image/jpeg") || strings.Contains(header, "image/jpg")
	if !isPNG && !isJPEG {
		return dataURI, false
	}

	rawBytes, err := base64.StdEncoding.DecodeString(strings.TrimSpace(b64Payload))
	if err != nil || len(rawBytes) == 0 {
		return dataURI, false
	}

	var srcImg image.Image
	if isPNG {
		srcImg, err = png.Decode(bytes.NewReader(rawBytes))
	} else {
		srcImg, err = jpeg.Decode(bytes.NewReader(rawBytes))
	}
	if err != nil || srcImg == nil {
		return dataURI, false
	}

	b := srcImg.Bounds()
	srcW := b.Dx()
	srcH := b.Dy()
	if srcW <= 0 || srcH <= 0 {
		return dataURI, false
	}

	// Never upscale an image that is already at or below the target pixel dimensions
	if srcW <= targetW && srcH <= targetH {
		return dataURI, false
	}

	scale := math.Min(float64(targetW)/float64(srcW), float64(targetH)/float64(srcH))
	if scale >= 1.0 {
		return dataURI, false
	}

	dstW := int(math.Round(float64(srcW) * scale))
	dstH := int(math.Round(float64(srcH) * scale))
	if dstW < 1 {
		dstW = 1
	}
	if dstH < 1 {
		dstH = 1
	}

	dstImg := resampleAreaAverageNRGBA(srcImg, dstW, dstH)

	var outBuf bytes.Buffer
	var mime string
	if isPNG {
		mime = "image/png"
		enc := png.Encoder{CompressionLevel: png.BestCompression}
		if err := enc.Encode(&outBuf, dstImg); err != nil {
			return dataURI, false
		}
	} else {
		mime = "image/jpeg"
		if err := jpeg.Encode(&outBuf, dstImg, &jpeg.Options{Quality: 90}); err != nil {
			return dataURI, false
		}
	}

	newB64 := base64.StdEncoding.EncodeToString(outBuf.Bytes())
	newURI := "data:" + mime + ";base64," + newB64
	if len(newURI) >= len(dataURI) {
		return dataURI, false
	}
	return newURI, true
}

// resampleAreaAverageNRGBA downsamples src to dstW x dstH using box/area averaging in premultiplied alpha space,
// preserving crisp anti-aliased edges and full alpha transparency without colour haloing.
func resampleAreaAverageNRGBA(src image.Image, dstW, dstH int) *image.NRGBA {
	sb := src.Bounds()
	srcW := sb.Dx()
	srcH := sb.Dy()
	dst := image.NewNRGBA(image.Rect(0, 0, dstW, dstH))

	scaleX := float64(srcW) / float64(dstW)
	scaleY := float64(srcH) / float64(dstH)

	for dy := 0; dy < dstH; dy++ {
		sy0 := float64(dy) * scaleY
		sy1 := float64(dy+1) * scaleY
		iy0 := int(math.Floor(sy0))
		iy1 := int(math.Ceil(sy1))
		if iy0 < 0 {
			iy0 = 0
		}
		if iy1 > srcH {
			iy1 = srcH
		}

		for dx := 0; dx < dstW; dx++ {
			sx0 := float64(dx) * scaleX
			sx1 := float64(dx+1) * scaleX
			ix0 := int(math.Floor(sx0))
			ix1 := int(math.Ceil(sx1))
			if ix0 < 0 {
				ix0 = 0
			}
			if ix1 > srcW {
				ix1 = srcW
			}

			var sumR, sumG, sumB, sumA, totalWeight float64
			for sy := iy0; sy < iy1; sy++ {
				wy := math.Min(sy1, float64(sy+1)) - math.Max(sy0, float64(sy))
				if wy <= 0 {
					continue
				}
				for sx := ix0; sx < ix1; sx++ {
					wx := math.Min(sx1, float64(sx+1)) - math.Max(sx0, float64(sx))
					if wx <= 0 {
						continue
					}
					w := wx * wy
					r16, g16, b16, a16 := src.At(sb.Min.X+sx, sb.Min.Y+sy).RGBA()
					// RGBA() returns premultiplied 16-bit [0..65535]
					sumR += float64(r16) * w
					sumG += float64(g16) * w
					sumB += float64(b16) * w
					sumA += float64(a16) * w
					totalWeight += w
				}
			}

			if totalWeight > 0 && sumA > 0 {
				avgA := sumA / totalWeight
				// Un-premultiply to 8-bit NRGBA
				alphaFrac := avgA / 65535.0
				r8 := clampUint8((sumR / totalWeight / alphaFrac) / 257.0)
				g8 := clampUint8((sumG / totalWeight / alphaFrac) / 257.0)
				b8 := clampUint8((sumB / totalWeight / alphaFrac) / 257.0)
				a8 := clampUint8(avgA / 257.0)
				dst.SetNRGBA(dx, dy, color.NRGBA{R: r8, G: g8, B: b8, A: a8})
			} else {
				dst.SetNRGBA(dx, dy, color.NRGBA{R: 0, G: 0, B: 0, A: 0})
			}
		}
	}
	return dst
}

func clampUint8(v float64) uint8 {
	n := int(math.Round(v))
	if n < 0 {
		return 0
	}
	if n > 255 {
		return 255
	}
	return uint8(n)
}
