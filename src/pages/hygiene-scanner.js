// ─── Hygiene Product Scanner Page ────────────────────────────
import { icons } from '../icons.js';
import { esc } from '../utils/esc.js';
import { initCamera, stopCamera, startBarcodeScanner } from '../utils/product-scanner.js';
import { mountReact } from '../components/mountReact.js';
import HygieneScanResult from '../components/HygieneScanResult.jsx';
import { apiFetch } from '../utils/api.js';
import { showToast } from '../utils/toast.js';

let cameraStream = null;
let stopScanning = null;

// Stops the detection loop and releases the camera. Safe to call repeatedly.
function releaseCamera() {
    if (stopScanning) { try { stopScanning(); } catch { /* already stopped */ } stopScanning = null; }
    if (cameraStream) { stopCamera(cameraStream); cameraStream = null; }
}

let cleanupBound = false;
function bindCleanup() {
    if (cleanupBound) return;
    cleanupBound = true;
    window.addEventListener('hashchange', releaseCamera);
    window.addEventListener('pagehide', releaseCamera);
}

export async function renderHygieneScanner() {
    const content = document.getElementById('page-content');
    bindCleanup();
    releaseCamera();

    const { supabase } = await import('../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    // Load recent scans. A failed request is shown as a failure — never as "no scans yet".
    let recentScans = [];
    let historyError = false;
    try {
        const res = await apiFetch(`/api/hygiene/history?userId=${userId}&limit=10`);
        if (!res.ok) throw new Error(`History request failed (${res.status})`);
        const data = await res.json();
        recentScans = Array.isArray(data.scans) ? data.scans : [];
    } catch (e) {
        historyError = true;
        console.warn('[Hygiene] Could not load history:', e.message);
    }

    content.innerHTML = `
    <div class="stagger-children" style="padding-bottom:var(--space-8);">
      <div class="page-header">
        <h1>Hygiene Scanner</h1>
        <p>Scan personal care products to observe ingredient patterns</p>
      </div>

      <!-- Scanner card -->
      <div class="card mb-4">
        <div id="camera-container" style="position:relative;background:var(--surface-2);border-radius:var(--radius-md);overflow:hidden;aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;margin-bottom:var(--space-3);">
          <video id="hygiene-video" autoplay playsinline muted aria-label="Live camera preview for barcode scanning" style="width:100%;height:100%;object-fit:cover;display:none;"></video>
          <div id="camera-placeholder" class="text-center text-tertiary">
            <div style="margin-bottom:var(--space-2);color:var(--text-tertiary);display:flex;justify-content:center;">${icons.droplet}</div>
            <div class="text-sm">Point camera at product barcode</div>
          </div>
          <div id="scan-overlay" aria-hidden="true" style="display:none;position:absolute;inset:0;border:2px solid var(--accent-teal);border-radius:var(--radius-md);pointer-events:none;">
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:200px;height:60px;border:2px solid var(--accent-teal);border-radius:4px;"></div>
          </div>
        </div>

        <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-3);">
          <button type="button" id="start-camera-btn" class="btn btn-primary flex-1">
            ${icons.camera} Start Camera
          </button>
          <button type="button" id="stop-camera-btn" class="btn" style="flex:1;display:none;background:var(--surface-2);border:1px solid var(--border);">
            Stop Camera
          </button>
        </div>

        <!-- Manual barcode entry -->
        <div style="display:flex;gap:var(--space-2);">
          <label for="manual-barcode" class="visually-hidden">Barcode number</label>
          <input type="text" id="manual-barcode" inputmode="numeric" placeholder="Or enter barcode manually..."
            style="flex:1;padding:var(--space-3);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-size:var(--text-sm);">
          <button type="button" id="manual-scan-btn" class="btn" aria-label="Look up barcode" style="background:var(--surface-2);border:1px solid var(--border);">
            ${icons.scan}
          </button>
        </div>
      </div>

      <!-- Results -->
      <div id="hygiene-results" aria-live="polite" class="mb-4"></div>

      <!-- Recent scans -->
      ${historyError ? `
      <div class="section-heading"><h3>Recent Scans</h3></div>
      <div class="empty-state" role="alert">
        <h3>Couldn't load your recent scans</h3>
        <p>Check your connection and try again. Nothing you've scanned has been lost.</p>
        <button type="button" class="btn btn-sm" id="hygiene-history-retry">Try again</button>
      </div>` : recentScans.length > 0 ? `
      <div class="section-heading"><h3>Recent Scans</h3></div>
      <div class="flex-col gap-2">
        ${recentScans.map(s => renderScanCard(s)).join('')}
      </div>` : `
      <div class="card" style="text-align:center;padding:var(--space-6);">
        <div style="margin-bottom:var(--space-2);color:var(--text-tertiary);display:flex;justify-content:center;">${icons.droplet}</div>
        <div class="text-secondary text-sm">No hygiene scans yet — scan a product to start tracking ingredient patterns.</div>
      </div>`}

      <p class="disclaimer mt-4 text-center">
        Pattern observations only — not medical advice. Consult a dermatologist for any skin concerns.
      </p>
    </div>`;

    document.getElementById('hygiene-history-retry')?.addEventListener('click', () => renderHygieneScanner());
    setupHygieneHandlers(userId);
}

function renderScanCard(scan) {
    const score = Number(scan.safety_score) || 0;
    const scoreColor = score >= 75 ? 'var(--viz-green)' : score >= 50 ? 'var(--viz-amber)' : 'var(--error)';
    const scoreLabel = score >= 75 ? 'Looks clean' : score >= 50 ? 'Some things to explore' : 'Worth reviewing';
    const concerns = Array.isArray(scan.concerns) ? scan.concerns : [];
    const scannedDate = scan.scanned_at && !Number.isNaN(new Date(scan.scanned_at).getTime())
        ? new Date(scan.scanned_at).toLocaleDateString()
        : '';

    return `
    <div class="card card-sm">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-2);">
        <div class="flex-1">
          <div class="font-semibold text-sm">${esc(scan.product_name || 'Unknown Product')}</div>
          <div class="text-tertiary text-xs">${[esc(scan.brand), scannedDate].filter(Boolean).join(' · ')}</div>
        </div>
        <div style="text-align:center;margin-left:var(--space-3);">
          <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:700;color:${scoreColor};">${score}</div>
          <div style="font-size:var(--text-xs);color:${scoreColor};">${scoreLabel}</div>
        </div>
      </div>
      ${concerns.length > 0 ? `
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-1);">
        ${concerns.slice(0, 3).map(c => {
            const high = c.risk === 'high';
            return `
        <span style="font-size:var(--text-xs);padding:2px 6px;border-radius:20px;background:${high ? 'var(--error-dim)' : 'var(--viz-amber-dim)'};color:${high ? 'var(--error)' : 'var(--viz-amber)'};">
          ${esc(c.ingredient)}<span class="visually-hidden"> (${high ? 'worth reviewing' : 'something to explore'})</span>
        </span>`;
        }).join('')}
        ${concerns.length > 3 ? `<span class="text-tertiary text-xs">+${concerns.length - 3} more</span>` : ''}
      </div>` : `<div style="font-size:var(--text-xs);color:var(--viz-green);">No major concerns noticed</div>`}
    </div>`;
}

function setupHygieneHandlers(userId) {
    const video = document.getElementById('hygiene-video');
    const startBtn = document.getElementById('start-camera-btn');
    const stopBtn = document.getElementById('stop-camera-btn');
    const resultsEl = document.getElementById('hygiene-results');
    const placeholder = document.getElementById('camera-placeholder');
    const overlay = document.getElementById('scan-overlay');

    function showCameraUI(on) {
        if (video) video.style.display = on ? 'block' : 'none';
        if (placeholder) placeholder.style.display = on ? 'none' : 'block';
        if (overlay) overlay.style.display = on ? 'block' : 'none';
        if (startBtn) startBtn.style.display = on ? 'none' : 'block';
        if (stopBtn) stopBtn.style.display = on ? 'block' : 'none';
    }

    function stopCameraUI() {
        releaseCamera();
        showCameraUI(false);
    }

    function renderScanError(barcode) {
        resultsEl.innerHTML = `
          <div class="empty-state" role="alert">
            <h3>Couldn't look up this product</h3>
            <p>Check your connection and try again.</p>
            <button type="button" class="btn btn-sm" id="hygiene-scan-retry">Try again</button>
          </div>`;
        document.getElementById('hygiene-scan-retry')?.addEventListener('click', () => scanBarcode(barcode));
    }

    async function scanBarcode(barcode) {
        resultsEl.innerHTML = `<div class="card" style="text-align:center;padding:var(--space-4);"><div class="spinner" style="margin:0 auto;"></div><div class="mt-2 text-tertiary text-xs">Looking up product...</div></div>`;

        try {
            const res = await apiFetch(`/api/hygiene/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ barcode, userId }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const notFound = res.status === 404 || /not found/i.test(err.error || '');
                if (notFound) {
                    // A miss in the product database is a result, not a failure.
                    resultsEl.innerHTML = `
                      <div class="empty-state">
                        <h3>Product not found</h3>
                        <p>Barcode ${esc(barcode)} isn't in the product database yet. Check the number and try again.</p>
                      </div>`;
                    return;
                }
                throw new Error(err.error || `Scan failed (${res.status})`);
            }

            const { product } = await res.json();
            if (!product) throw new Error('Empty product response');
            resultsEl.innerHTML = '<div id="hygiene-result-react"></div>';
            mountReact(HygieneScanResult, 'hygiene-result-react', {
                product,
                onLog: () => showToast('This scan is already saved to your hygiene history'),
            });

        } catch (err) {
            console.warn('[Hygiene] Scan failed:', err.message);
            renderScanError(barcode);
        }
    }

    startBtn?.addEventListener('click', async () => {
        try {
            cameraStream = await initCamera(video);
            showCameraUI(true);

            // startBarcodeScanner is async and resolves to the stop function
            // (or null when live detection isn't supported in this browser).
            stopScanning = await startBarcodeScanner(video, async (barcode) => {
                stopCameraUI();
                try {
                    await scanBarcode(barcode);
                } catch (err) {
                    console.warn('[Hygiene] Detection handler failed:', err.message);
                    renderScanError(barcode);
                }
            });
        } catch (err) {
            console.warn('[Hygiene] Camera unavailable:', err.message);
            stopCameraUI();
            resultsEl.innerHTML = `
              <div class="empty-state" role="alert">
                <h3>Couldn't access the camera</h3>
                <p>Allow camera access in your browser settings, or type the barcode in the box above.</p>
              </div>`;
        }
    });

    stopBtn?.addEventListener('click', stopCameraUI);

    document.getElementById('manual-scan-btn')?.addEventListener('click', async () => {
        const barcode = document.getElementById('manual-barcode')?.value.trim();
        if (!barcode) return;
        await scanBarcode(barcode);
    });

    document.getElementById('manual-barcode')?.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const barcode = e.target.value.trim();
            if (barcode) await scanBarcode(barcode);
        }
    });
}
