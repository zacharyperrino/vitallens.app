// ─── Product Scanner Utility ─────────────────────────────────
// Client-side barcode detection and camera management.
// Delegates API calls to the FoodScanApi service.

import { lookupBarcode, parseNutritionLabel, getHealthScore } from '../services/foodScanApi.js';

export { lookupBarcode, parseNutritionLabel, getHealthScore };

/**
 * Start live barcode scanning using the BarcodeDetector API (Chrome 83+)
 * or manual frame analysis as fallback.
 */
export async function startBarcodeScanner(videoElement, onDetected) {
    if ('BarcodeDetector' in window) {
        const detector = new BarcodeDetector({ formats: ['ean_13', 'upc_a', 'ean_8'] });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let scanning = true;

        const scan = async () => {
            if (!scanning || videoElement.readyState < 2) {
                if (scanning) requestAnimationFrame(scan);
                return;
            }

            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            ctx.drawImage(videoElement, 0, 0);

            try {
                const barcodes = await detector.detect(canvas);
                if (barcodes.length > 0) {
                    scanning = false;
                    onDetected(barcodes[0].rawValue);
                    return;
                }
            } catch (e) { /* detection error, continue scanning */ }

            requestAnimationFrame(scan);
        };

        requestAnimationFrame(scan);
        return () => { scanning = false; };
    }

    console.warn('[BarcodeScanner] BarcodeDetector API not available. Using manual entry fallback.');
    import('./toast.js').then(({ showToast }) => showToast('Live barcode scanning isn\'t supported in this browser — type the barcode below instead.')).catch(() => {});
    return null;
}

/**
 * Request camera access for barcode scanning.
 */
export async function initCamera(videoElement) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        videoElement.srcObject = stream;
        await videoElement.play();
        return stream;
    } catch (err) {
        console.error('[Camera] Access denied:', err);
        throw new Error('Camera permission denied. Please allow camera access to scan barcodes.');
    }
}

/**
 * Stop camera stream.
 */
export function stopCamera(stream) {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
}

/**
 * Get score color for a given score value.
 */
export function getScoreColor(score) {
    if (score >= 75) return 'var(--viz-green)';
    if (score >= 50) return 'var(--viz-amber)';
    return 'var(--error)';
}

/**
 * Get score label.
 */
export function getScoreLabel(score) {
    if (score >= 75) return 'Excellent';
    if (score >= 50) return 'Good';
    return 'Poor';
}
