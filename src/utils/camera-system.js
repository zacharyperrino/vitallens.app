// Camera System — WebRTC capture with quality gates and guided overlays

export class CameraSystem {
    constructor(options = {}) {
        this.videoEl = null;
        this.canvasEl = null;
        this.ctx = null;
        this.stream = null;
        this.isRunning = false;
        this.frameCallbacks = [];
        this.facingMode = options.facingMode || 'user';
        this.resolution = options.resolution || { width: 1280, height: 720 };
        this.frameRate = options.frameRate || 30;
        this._animFrameId = null;
    }

    // ── Start camera ─────────────────────────────────
    async start(containerEl) {
        if (this.isRunning) return;

        // Create video element
        this.videoEl = document.createElement('video');
        this.videoEl.setAttribute('autoplay', '');
        this.videoEl.setAttribute('playsinline', '');
        this.videoEl.setAttribute('muted', '');
        this.videoEl.muted = true;
        this.videoEl.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit;';
        if (this.facingMode === 'user') this.videoEl.style.transform = 'scaleX(-1)';

        // Create offscreen canvas for frame analysis
        this.canvasEl = document.createElement('canvas');
        this.canvasEl.width = this.resolution.width;
        this.canvasEl.height = this.resolution.height;
        this.ctx = this.canvasEl.getContext('2d', { willReadFrequently: true });

        const constraints = {
            video: {
                facingMode: this.facingMode,
                width: { ideal: this.resolution.width },
                height: { ideal: this.resolution.height },
                frameRate: { ideal: this.frameRate },
            },
            audio: false,
        };

        try {
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoEl.srcObject = this.stream;
            containerEl.appendChild(this.videoEl);
            await this.videoEl.play();
            this.isRunning = true;
            this._processFrames();
            return true;
        } catch (err) {
            console.error('Camera access failed:', err);
            return false;
        }
    }

    // ── Stop camera ──────────────────────────────────
    stop() {
        this.isRunning = false;
        if (this._animFrameId) cancelAnimationFrame(this._animFrameId);
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        if (this.videoEl) {
            this.videoEl.srcObject = null;
            this.videoEl.remove();
        }
    }

    // ── Frame processing loop ────────────────────────
    _processFrames() {
        if (!this.isRunning) return;
        if (this.videoEl.readyState >= 2) {
            this.canvasEl.width = this.videoEl.videoWidth || this.resolution.width;
            this.canvasEl.height = this.videoEl.videoHeight || this.resolution.height;
            this.ctx.drawImage(this.videoEl, 0, 0, this.canvasEl.width, this.canvasEl.height);
            const frame = {
                imageData: this.ctx.getImageData(0, 0, this.canvasEl.width, this.canvasEl.height),
                width: this.canvasEl.width,
                height: this.canvasEl.height,
                timestamp: performance.now(),
            };
            this.frameCallbacks.forEach(cb => cb(frame));
        }
        this._animFrameId = requestAnimationFrame(() => this._processFrames());
    }

    // ── Subscribe to frames ──────────────────────────
    onFrame(callback) {
        this.frameCallbacks.push(callback);
    }

    // ── Capture single frame ─────────────────────────
    captureFrame() {
        if (!this.isRunning || !this.videoEl) return null;
        this.ctx.drawImage(this.videoEl, 0, 0, this.canvasEl.width, this.canvasEl.height);
        return {
            imageData: this.ctx.getImageData(0, 0, this.canvasEl.width, this.canvasEl.height),
            dataUrl: this.canvasEl.toDataURL('image/jpeg', 0.92),
            width: this.canvasEl.width,
            height: this.canvasEl.height,
            timestamp: Date.now(),
        };
    }
}

// ═══════════════════════════════════════════════════
//  Quality Gate — Image quality checks
// ═══════════════════════════════════════════════════

export class QualityGate {
    // ── Assess image quality (returns 0-100) ─────────
    static assess(imageData) {
        const results = {
            blur: this.checkBlur(imageData),
            exposure: this.checkExposure(imageData),
            contrast: this.checkContrast(imageData),
        };

        const overall = Math.round(
            results.blur.score * 0.4 +
            results.exposure.score * 0.35 +
            results.contrast.score * 0.25
        );

        return {
            overall,
            pass: overall >= 50,
            ...results,
        };
    }

    // ── Blur detection (Laplacian variance) ──────────
    static checkBlur(imageData) {
        const { data, width, height } = imageData;
        const gray = new Float32Array(width * height);

        // Convert to grayscale
        for (let i = 0; i < gray.length; i++) {
            const j = i * 4;
            gray[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
        }

        // Laplacian kernel convolution (3x3: 0,-1,0 / -1,4,-1 / 0,-1,0)
        let sum = 0, sumSq = 0, count = 0;
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                const laplacian =
                    4 * gray[idx] -
                    gray[idx - 1] - gray[idx + 1] -
                    gray[idx - width] - gray[idx + width];
                sum += laplacian;
                sumSq += laplacian * laplacian;
                count++;
            }
        }

        const mean = sum / count;
        const variance = (sumSq / count) - (mean * mean);

        // Normalize: variance > 500 = sharp, < 100 = blurry
        const score = Math.min(100, Math.max(0, (variance - 50) / 5));
        return {
            score: Math.round(score),
            variance: Math.round(variance),
            label: score >= 70 ? 'Sharp' : score >= 40 ? 'Acceptable' : 'Blurry',
            pass: score >= 40,
        };
    }

    // ── Exposure check ───────────────────────────────
    static checkExposure(imageData) {
        const { data } = imageData;
        let sum = 0;
        const pixels = data.length / 4;
        let underexposed = 0, overexposed = 0;

        for (let i = 0; i < data.length; i += 4) {
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            sum += lum;
            if (lum < 30) underexposed++;
            if (lum > 225) overexposed++;
        }

        const avgLuminance = sum / pixels;
        const underRatio = underexposed / pixels;
        const overRatio = overexposed / pixels;

        // Ideal luminance is ~120, penalty for extreme ratios
        const lumScore = 100 - Math.abs(avgLuminance - 120) * 0.8;
        const ratioScore = 100 - (underRatio + overRatio) * 200;
        const score = Math.min(100, Math.max(0, (lumScore + ratioScore) / 2));

        let label = 'Good';
        if (avgLuminance < 60) label = 'Too Dark';
        else if (avgLuminance > 200) label = 'Too Bright';
        else if (score < 50) label = 'Uneven';

        return { score: Math.round(score), avgLuminance: Math.round(avgLuminance), label, pass: score >= 40 };
    }

    // ── Contrast check ───────────────────────────────
    static checkContrast(imageData) {
        const { data } = imageData;
        let min = 255, max = 0;
        const histogram = new Array(256).fill(0);
        const pixels = data.length / 4;

        for (let i = 0; i < data.length; i += 4) {
            const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            histogram[lum]++;
            if (lum < min) min = lum;
            if (lum > max) max = lum;
        }

        const range = max - min;
        // Calculate standard deviation
        let mean = 0;
        for (let i = 0; i < 256; i++) mean += i * histogram[i];
        mean /= pixels;
        let variance = 0;
        for (let i = 0; i < 256; i++) variance += histogram[i] * (i - mean) * (i - mean);
        variance /= pixels;
        const std = Math.sqrt(variance);

        const score = Math.min(100, Math.max(0, (std - 10) * 2));
        return {
            score: Math.round(score),
            range,
            std: Math.round(std),
            label: score >= 60 ? 'Good' : score >= 30 ? 'Low' : 'Very Low',
            pass: score >= 30,
        };
    }

    // ── Face detection (simple skin-color heuristic) ─
    static detectFaceRegion(imageData) {
        const { data, width, height } = imageData;
        let skinPixels = 0;
        let sumX = 0, sumY = 0;
        let minX = width, maxX = 0, minY = height, maxY = 0;

        // Sample every 4th pixel for speed
        for (let y = 0; y < height; y += 2) {
            for (let x = 0; x < width; x += 2) {
                const i = (y * width + x) * 4;
                const r = data[i], g = data[i + 1], b = data[i + 2];

                // YCbCr skin detection
                const Y = 0.299 * r + 0.587 * g + 0.114 * b;
                const Cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b;
                const Cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b;

                if (Y > 60 && Cb > 77 && Cb < 127 && Cr > 133 && Cr < 173) {
                    skinPixels++;
                    sumX += x;
                    sumY += y;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        const totalSampled = (width / 2) * (height / 2);
        const skinRatio = skinPixels / totalSampled;
        const detected = skinRatio > 0.08;

        if (!detected) return { detected: false, skinRatio };

        return {
            detected: true,
            skinRatio: Math.round(skinRatio * 100) / 100,
            center: { x: Math.round(sumX / skinPixels), y: Math.round(sumY / skinPixels) },
            bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
        };
    }
}
