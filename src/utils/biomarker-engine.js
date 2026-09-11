// Biomarker Analysis Engine — camera-based wellness signal extraction
// Modules: rPPG pulse estimate, Face reflection, Tongue reflection, Body/posture reflection
//
// Honesty rule: if a value cannot actually be measured (no usable pulse
// signal, too few frames, camera too slow) the engine returns `null` for
// that value and a plain-language `reason`. It never emits a number from noise.

import { apiFetch } from '../utils/api.js';

// ═══════════════════════════════════════════════════════
//  1) rPPG PULSE ESTIMATE — from face video
// ═══════════════════════════════════════════════════════

const RPPG_MIN_FRAMES = 60;        // ~2 s at 30 fps
const RPPG_MIN_FPS = 8;            // below this the pulse band can't be resolved
const RPPG_MIN_CORRELATION = 0.35; // autocorrelation peak needed to call a rhythm "found"
const RPPG_MIN_SIGNAL_QUALITY = 15;

export class RPPGEngine {
    constructor() {
        this.buffer = [];          // { r, g, b, timestamp }
        this.bufferSize = 300;     // ~10 seconds at 30fps
        this.isRecording = false;
        this.onProgress = null;
        this.onResult = null;
    }

    start(durationMs = 15000) {
        this.buffer = [];
        this.isRecording = true;
        this._startTime = performance.now();
        this._duration = durationMs;
    }

    addFrame(imageData) {
        if (!this.isRecording) return null;

        const elapsed = performance.now() - this._startTime;
        const progress = Math.min(1, elapsed / this._duration);
        if (this.onProgress) this.onProgress(progress);

        // Extract avg RGB from forehead ROI
        const roi = this._extractForeheadROI(imageData);
        if (roi) this.buffer.push({ ...roi, timestamp: performance.now() });

        if (this.buffer.length > this.bufferSize) this.buffer.shift();

        if (elapsed >= this._duration) {
            this.isRecording = false;
            const result = this.analyze();
            if (this.onResult) this.onResult(result);
            return result;
        }
        return null;
    }

    _extractForeheadROI(imageData) {
        const { data, width, height } = imageData;
        // Forehead region: top 20-40% of image, center 30-70%
        const y1 = Math.floor(height * 0.2);
        const y2 = Math.floor(height * 0.4);
        const x1 = Math.floor(width * 0.3);
        const x2 = Math.floor(width * 0.7);

        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        for (let y = y1; y < y2; y += 2) {
            for (let x = x1; x < x2; x += 2) {
                const i = (y * width + x) * 4;
                sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2];
                count++;
            }
        }
        if (!count) return null;
        return { r: sumR / count, g: sumG / count, b: sumB / count };
    }

    _unmeasured(reason, extra = {}) {
        return {
            hr: null,
            hrv: null,
            confidence: 0,
            sampleRate: null,
            duration: null,
            quality: 'Unusable',
            measurable: false,
            reason,
            ...extra,
        };
    }

    analyze() {
        if (this.buffer.length < RPPG_MIN_FRAMES) {
            return this._unmeasured('Not enough video frames were captured');
        }

        // Use green channel (strongest pulse signal in skin)
        const signal = this.buffer.map(f => f.g);
        const timestamps = this.buffer.map(f => f.timestamp);

        // Calculate sample rate
        const duration = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
        const sampleRate = duration > 0 ? signal.length / duration : 0;
        if (!Number.isFinite(sampleRate) || sampleRate < RPPG_MIN_FPS) {
            return this._unmeasured('The camera frame rate was too low to read a pulse');
        }

        // Detrend (remove linear trend)
        const detrended = this._detrend(signal);

        // Bandpass filter: 0.7-3.5 Hz (42-210 BPM)
        const filtered = this._bandpassFilter(detrended, sampleRate, 0.7, 3.5);

        // Find dominant frequency via autocorrelation
        const { hr, confidence: freqConfidence, correlation, atBoundary } = this._findHeartRate(filtered, sampleRate);

        // Signal quality assessment
        const signalQuality = this._assessSignalQuality(filtered);
        const confidence = Math.round(freqConfidence * 0.6 + signalQuality * 0.4);

        const measurable = Number.isFinite(hr)
            && correlation >= RPPG_MIN_CORRELATION
            && signalQuality >= RPPG_MIN_SIGNAL_QUALITY
            && !atBoundary;

        if (!measurable) {
            return this._unmeasured('No steady pulse rhythm was found in the video', {
                confidence,
                sampleRate: Math.round(sampleRate),
                duration: Math.round(duration),
            });
        }

        // Estimate HRV from peak intervals (null when too few beats were seen)
        const hrv = this._estimateHRV(filtered, sampleRate);

        return {
            hr: Math.round(hr),
            hrv: hrv == null ? null : Math.round(hrv),
            confidence,
            sampleRate: Math.round(sampleRate),
            duration: Math.round(duration),
            quality: confidence >= 70 ? 'Good' : confidence >= 40 ? 'Fair' : 'Poor',
            measurable: true,
            reason: null,
        };
    }

    _detrend(signal) {
        const n = signal.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        for (let i = 0; i < n; i++) {
            sumX += i; sumY += signal[i]; sumXY += i * signal[i]; sumXX += i * i;
        }
        const denom = (n * sumXX - sumX * sumX) || 1;
        const slope = (n * sumXY - sumX * sumY) / denom;
        const intercept = (sumY - slope * sumX) / n;
        return signal.map((v, i) => v - (slope * i + intercept));
    }

    _bandpassFilter(signal, fs, lowFreq, highFreq) {
        const lowN = Math.round(fs / highFreq);
        const highN = Math.round(fs / lowFreq);

        const lowPassed = this._movingAverage(signal, Math.max(2, lowN));
        const slowMA = this._movingAverage(lowPassed, Math.max(3, highN));
        return lowPassed.map((v, i) => v - slowMA[i]);
    }

    _movingAverage(signal, windowSize) {
        const result = new Array(signal.length);
        let sum = 0;
        for (let i = 0; i < signal.length; i++) {
            sum += signal[i];
            if (i >= windowSize) sum -= signal[i - windowSize];
            result[i] = sum / Math.min(i + 1, windowSize);
        }
        return result;
    }

    _findHeartRate(signal, sampleRate) {
        const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
        const std = Math.sqrt(signal.reduce((a, b) => a + (b - mean) ** 2, 0) / signal.length);
        const normalized = signal.map(v => (v - mean) / (std || 1));

        const n = normalized.length;
        const minLag = Math.max(1, Math.floor(sampleRate / 3.5));
        const maxLag = Math.min(Math.floor(sampleRate / 0.7), n - 1);
        if (maxLag <= minLag) {
            return { hr: NaN, confidence: 0, correlation: 0, atBoundary: true };
        }

        let bestLag = minLag, bestCorr = -Infinity;
        for (let lag = minLag; lag <= maxLag; lag++) {
            let corr = 0, norm1 = 0, norm2 = 0;
            for (let i = 0; i < n - lag; i++) {
                corr += normalized[i] * normalized[i + lag];
                norm1 += normalized[i] * normalized[i];
                norm2 += normalized[i + lag] * normalized[i + lag];
            }
            const correlation = corr / (Math.sqrt(norm1 * norm2) || 1);
            if (correlation > bestCorr) {
                bestCorr = correlation;
                bestLag = lag;
            }
        }

        // A peak sitting on the search boundary is usually an edge artefact,
        // not a real rhythm.
        const atBoundary = bestLag === minLag || bestLag === maxLag;
        const hr = (sampleRate / bestLag) * 60;
        const confidence = Math.min(100, Math.max(0, bestCorr * 140)) * (atBoundary ? 0.5 : 1);

        return { hr, confidence, correlation: bestCorr, atBoundary };
    }

    _estimateHRV(signal, sampleRate) {
        const crossings = [];
        for (let i = 1; i < signal.length; i++) {
            if (signal[i - 1] < 0 && signal[i] >= 0) {
                crossings.push(i / sampleRate * 1000);
            }
        }

        if (crossings.length < 3) return null;
        const intervals = [];
        for (let i = 1; i < crossings.length; i++) {
            intervals.push(crossings[i] - crossings[i - 1]);
        }

        const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
        return Math.sqrt(variance);
    }

    _assessSignalQuality(signal) {
        const n = signal.length;
        let totalEnergy = 0;
        for (let i = 0; i < n; i++) totalEnergy += signal[i] * signal[i];
        if (totalEnergy === 0) return 0;

        const rms = Math.sqrt(totalEnergy / n);
        const range = Math.max(...signal) - Math.min(...signal);
        if (range === 0) return 0;
        const quality = (rms / range) * 280;
        return Math.min(100, Math.max(0, quality));
    }
}

// ═══════════════════════════════════════════════════════
//  2) PHOTO REFLECTIONS — server-side AI analysis
// ═══════════════════════════════════════════════════════

const SCAN_TIMEOUT_MS = 40_000;

// Turn an HTTP failure into a plain-language error the UI can show as-is.
async function scanError(res, what) {
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    let message;
    if (res.status === 429) {
        message = body?.upgradeRequired
            ? "You've used all of today's check-ins on your current plan."
            : "You've reached today's check-in limit. Try again tomorrow.";
    } else if (res.status === 413) {
        message = 'That photo is too large to send. Try a smaller photo.';
    } else if (res.status >= 400 && res.status < 500) {
        message = `This photo couldn't be used for a ${what} check-in. Try a clearer, well-lit photo.`;
    } else {
        message = "The check-in service isn't responding right now. Try again in a moment.";
    }
    const err = new Error(message);
    err.status = res.status;
    err.upgradeRequired = Boolean(body?.upgradeRequired);
    err.userFacing = true;
    return err;
}

async function runScan(imageInput, scanType, what) {
    const blob = await normalizeImageForUpload(imageInput);
    const formData = new FormData();
    formData.append('image', blob, `${scanType}.jpg`);
    formData.append('scanType', scanType);

    const res = await apiFetch('/api/biomarker-scan', {
        method: 'POST',
        body: formData,
        timeoutMs: SCAN_TIMEOUT_MS,
    });

    if (!res.ok) throw await scanError(res, what);
    return res.json();
}

export function analyzeFace(imageInput) {
    return runScan(imageInput, 'face', 'face');
}

export function analyzeTongue(imageInput) {
    return runScan(imageInput, 'tongue', 'tongue');
}

export function analyzeBodyComposition(imageInput) {
    return runScan(imageInput, 'body', 'body');
}

async function normalizeImageForUpload(imageInput) {
    if (imageInput instanceof Blob) return imageInput;
    if (imageInput instanceof ImageData || (imageInput && typeof imageInput.width === 'number' && typeof imageInput.height === 'number' && imageInput.data)) {
        return await imageDataToBlob(imageInput);
    }
    const err = new Error("This image couldn't be prepared for upload. Try taking the photo again.");
    err.userFacing = true;
    throw err;
}

// Downscales to ≤1024px on the long side before encoding, so phone photos
// never go over the wire at full resolution.
function imageDataToBlob(imageData) {
    return new Promise((resolve, reject) => {
        const MAX = 1024;
        const scale = Math.min(1, MAX / Math.max(imageData.width, imageData.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(imageData.width * scale));
        canvas.height = Math.max(1, Math.round(imageData.height * scale));
        const ctx = canvas.getContext('2d');
        const tmp = document.createElement('canvas');
        tmp.width = imageData.width;
        tmp.height = imageData.height;
        tmp.getContext('2d').putImageData(imageData, 0, 0);
        ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else {
                const err = new Error("This image couldn't be prepared for upload. Try taking the photo again.");
                err.userFacing = true;
                reject(err);
            }
        }, 'image/jpeg', 0.7);
    });
}
