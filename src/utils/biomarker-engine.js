// Biomarker Analysis Engine — Evidence-based health signal extraction
// Modules: rPPG Heart Rate, Face Analysis, Eye Analysis, Skin Lesion Triage, Body Composition


import { apiFetch } from '../utils/api.js';

// ═══════════════════════════════════════════════════════
//  1) rPPG HEART RATE — Extract HR from face video
// ═══════════════════════════════════════════════════════

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
        if (!this.isRecording) return;

        const elapsed = performance.now() - this._startTime;
        const progress = Math.min(1, elapsed / this._duration);
        if (this.onProgress) this.onProgress(progress);

        // Extract avg RGB from forehead ROI (top 30-50%, center 40-60%)
        const roi = this._extractForeheadROI(imageData);
        this.buffer.push({ ...roi, timestamp: performance.now() });

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

        return { r: sumR / count, g: sumG / count, b: sumB / count };
    }

    analyze() {
        if (this.buffer.length < 60) {
            return { hr: 0, hrv: 0, confidence: 0, error: 'Insufficient frames' };
        }

        // Use green channel (strongest pulse signal in skin)
        const signal = this.buffer.map(f => f.g);
        const timestamps = this.buffer.map(f => f.timestamp);

        // Calculate sample rate
        const duration = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
        const sampleRate = signal.length / duration;

        // Detrend (remove linear trend)
        const detrended = this._detrend(signal);

        // Bandpass filter: 0.7-3.5 Hz (42-210 BPM)
        const filtered = this._bandpassFilter(detrended, sampleRate, 0.7, 3.5);

        // Find dominant frequency via autocorrelation
        const { hr, confidence: freqConfidence } = this._findHeartRate(filtered, sampleRate);

        // Estimate HRV from peak intervals
        const hrv = this._estimateHRV(filtered, sampleRate);

        // Signal quality assessment
        const signalQuality = this._assessSignalQuality(filtered);
        const confidence = Math.round((freqConfidence * 0.6 + signalQuality * 0.4));

        return {
            hr: Math.round(hr),
            hrv: Math.round(hrv),
            confidence,
            sampleRate: Math.round(sampleRate),
            duration: Math.round(duration),
            quality: confidence >= 70 ? 'Good' : confidence >= 40 ? 'Fair' : 'Poor',
        };
    }

    _detrend(signal) {
        const n = signal.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        for (let i = 0; i < n; i++) {
            sumX += i; sumY += signal[i]; sumXY += i * signal[i]; sumXX += i * i;
        }
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
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
        const minLag = Math.floor(sampleRate / 3.5);
        const maxLag = Math.floor(sampleRate / 0.7);

        let bestLag = minLag, bestCorr = -Infinity;
        for (let lag = minLag; lag <= Math.min(maxLag, n - 1); lag++) {
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

        const hr = (sampleRate / bestLag) * 60;
        const confidence = Math.min(100, Math.max(0, bestCorr * 140));
        const clampedHr = Math.max(42, Math.min(210, hr));

        return { hr: clampedHr, confidence };
    }

    _estimateHRV(signal, sampleRate) {
        const crossings = [];
        for (let i = 1; i < signal.length; i++) {
            if (signal[i - 1] < 0 && signal[i] >= 0) {
                crossings.push(i / sampleRate * 1000);
            }
        }

        if (crossings.length < 3) return 0;
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

export async function analyzeFace(imageData) {
    const blob = await imageDataToBlob(imageData);
    const formData = new FormData();
    formData.append('image', blob, 'face.png');
    formData.append('scanType', 'face');

    const res = await apiFetch(`/api/biomarker-scan`, {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) {
        throw new Error('Face scan failed');
    }
    return res.json();
}

export async function analyzeEye(imageData) {
    const blob = await imageDataToBlob(imageData);
    const formData = new FormData();
    formData.append('image', blob, 'eye.png');
    formData.append('scanType', 'eye');

    const res = await apiFetch(`/api/biomarker-scan`, {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) {
        throw new Error('Eye scan failed');
    }
    return res.json();
}

export async function analyzeSkin(imageData) {
    const blob = await imageDataToBlob(imageData);
    const formData = new FormData();
    formData.append('image', blob, 'skin.png');
    formData.append('scanType', 'skin');

    const res = await apiFetch(`/api/biomarker-scan`, {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) {
        throw new Error('Skin scan failed');
    }
    return res.json();
}

export async function analyzeBodyComposition(imageData) {
    const blob = await imageDataToBlob(imageData);
    const formData = new FormData();
    formData.append('image', blob, 'body.png');
    formData.append('scanType', 'body');

    const res = await apiFetch(`/api/biomarker-scan`, {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) {
        throw new Error('Body composition scan failed');
    }
    return res.json();
}

async function normalizeImageForUpload(imageInput) {
    if (imageInput instanceof Blob) return imageInput;
    if (imageInput instanceof ImageData || (imageInput && typeof imageInput.width === 'number' && typeof imageInput.height === 'number' && imageInput.data)) {
        return await imageDataToBlob(imageInput);
    }
    throw new Error('Unsupported image input for upload');
}

export async function analyzeTongue(imageInput) {
    const blob = await normalizeImageForUpload(imageInput);
    const formData = new FormData();
    formData.append('image', blob, 'tongue.png');
    formData.append('scanType', 'tongue');
    const res = await apiFetch(`/api/biomarker-scan`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Tongue scan failed');
    return res.json();
}

export async function analyzeNail(imageInput) {
    const blob = await normalizeImageForUpload(imageInput);
    const formData = new FormData();
    formData.append('image', blob, 'nail.png');
    formData.append('scanType', 'nail');
    const res = await apiFetch(`/api/biomarker-scan`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Nail scan failed');
    return res.json();
}

export async function imageDataToBlob(imageData) {
    return new Promise((resolve) => {
        const MAX = 1024;
        const scale = Math.min(1, MAX / Math.max(imageData.width, imageData.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(imageData.width * scale);
        canvas.height = Math.round(imageData.height * scale);
        const ctx = canvas.getContext('2d');
        const tmp = document.createElement('canvas');
        tmp.width = imageData.width;
        tmp.height = imageData.height;
        tmp.getContext('2d').putImageData(imageData, 0, 0);
        ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.7);
    });
}
