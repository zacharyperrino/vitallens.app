// ─── Hygiene Product Scanner Page ────────────────────────────
import { icons } from '../icons.js';
import { initCamera, stopCamera, startBarcodeScanner, getScoreColor } from '../utils/product-scanner.js';
import { mountReact } from '../components/mountReact.js';
import HygieneScanResult from '../components/HygieneScanResult.jsx';

const API = window.API_BASE || '/api';

let cameraStream = null;
let stopScanning = null;

export async function renderHygieneScanner() {
    const content = document.getElementById('page-content');

    const { supabase } = await import('../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    // Load recent scans
    let recentScans = [];
    try {
        const res = await fetch(`${API}/hygiene/history?userId=${userId}&limit=10`);
        if (res.ok) {
            const data = await res.json();
            recentScans = data.scans || [];
        }
    } catch (e) { console.warn('[Hygiene] Could not load history:', e.message); }

    content.innerHTML = `
    <div class="stagger-children" style="padding-bottom:var(--space-8);">
      <div class="page-header">
        <h1>🧴 Hygiene Scanner</h1>
        <p>Scan personal care products to observe ingredient patterns</p>
      </div>

      <!-- Scanner card -->
      <div class="card" style="margin-bottom:var(--space-4);">
        <div id="camera-container" style="position:relative;background:var(--surface-2);border-radius:var(--radius-md);overflow:hidden;aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;margin-bottom:var(--space-3);">
          <video id="hygiene-video" autoplay playsinline style="width:100%;height:100%;object-fit:cover;display:none;"></video>
          <div id="camera-placeholder" style="text-align:center;color:var(--text-tertiary);">
            <div style="font-size:48px;margin-bottom:var(--space-2);">🧴</div>
            <div style="font-size:var(--text-sm);">Point camera at product barcode</div>
          </div>
          <div id="scan-overlay" style="display:none;position:absolute;inset:0;border:2px solid var(--accent-teal);border-radius:var(--radius-md);pointer-events:none;">
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:200px;height:60px;border:2px solid var(--accent-teal);border-radius:4px;"></div>
          </div>
        </div>

        <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-3);">
          <button id="start-camera-btn" class="btn btn-primary" style="flex:1;">
            ${icons.camera} Start Camera
          </button>
          <button id="stop-camera-btn" class="btn" style="flex:1;display:none;background:var(--surface-2);border:1px solid var(--border);">
            Stop Camera
          </button>
        </div>

        <!-- Manual barcode entry -->
        <div style="display:flex;gap:var(--space-2);">
          <input type="text" id="manual-barcode" placeholder="Or enter barcode manually..."
            style="flex:1;padding:var(--space-3);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-size:var(--text-sm);">
          <button id="manual-scan-btn" class="btn" style="background:var(--surface-2);border:1px solid var(--border);">
            ${icons.search || '🔍'}
          </button>
        </div>
      </div>

      <!-- Results -->
      <div id="hygiene-results" style="margin-bottom:var(--space-4);"></div>

      <!-- Recent scans -->
      ${recentScans.length > 0 ? `
      <div class="section-heading"><h3>Recent Scans</h3></div>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);">
        ${recentScans.map(s => renderScanCard(s)).join('')}
      </div>` : `
      <div class="card" style="text-align:center;padding:var(--space-6);">
        <div style="font-size:32px;margin-bottom:var(--space-2);">🧴</div>
        <div style="font-size:var(--text-sm);color:var(--text-secondary);">No hygiene scans yet — scan a product to start tracking ingredient patterns.</div>
      </div>`}

      <div style="font-size:10px;color:var(--text-tertiary);text-align:center;margin-top:var(--space-4);font-style:italic;">
        Pattern observations only — not medical advice. Consult a dermatologist for any skin concerns.
      </div>
    </div>`;

    setupHygieneHandlers(userId);
}

function renderScanCard(scan) {
    const score = scan.safety_score || 0;
    const scoreColor = score >= 75 ? 'var(--accent-green)' : score >= 50 ? 'var(--accent-amber)' : 'var(--accent-coral)';
    const scoreLabel = score >= 75 ? 'Looks clean' : score >= 50 ? 'Some things to explore' : 'Worth reviewing';
    const concerns = scan.concerns || [];

    return `
    <div class="card card-sm">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-2);">
        <div style="flex:1;">
          <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${scan.product_name || 'Unknown Product'}</div>
          <div style="font-size:10px;color:var(--text-tertiary);">${scan.brand || ''} · ${new Date(scan.scanned_at).toLocaleDateString()}</div>
        </div>
        <div style="text-align:center;margin-left:var(--space-3);">
          <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:700;color:${scoreColor};">${score}</div>
          <div style="font-size:9px;color:${scoreColor};">${scoreLabel}</div>
        </div>
      </div>
      ${concerns.length > 0 ? `
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-1);">
        ${concerns.slice(0, 3).map(c => `
        <span style="font-size:9px;padding:2px 6px;border-radius:20px;background:${c.risk === 'high' ? 'var(--accent-coral-dim)' : 'var(--accent-amber-dim)'};color:${c.risk === 'high' ? 'var(--accent-coral)' : 'var(--accent-amber)'};">
          ${c.ingredient}
        </span>`).join('')}
        ${concerns.length > 3 ? `<span style="font-size:9px;color:var(--text-tertiary);">+${concerns.length - 3} more</span>` : ''}
      </div>` : `<div style="font-size:10px;color:var(--accent-green);">No major concerns noticed</div>`}
    </div>`;
}

function renderFullResults(product, userId) {
    const score = product.safetyScore || 0;
    const scoreColor = score >= 75 ? 'var(--accent-green)' : score >= 50 ? 'var(--accent-amber)' : 'var(--accent-coral)';
    const scoreLabel = score >= 75 ? 'Looks clean' : score >= 50 ? 'Some things to explore' : 'Worth reviewing';
    const concerns = product.concerns || [];
    const highConcerns = concerns.filter(c => c.risk === 'high');
    const modConcerns = concerns.filter(c => c.risk === 'moderate');
    const lowConcerns = concerns.filter(c => c.risk === 'low');

    return `
    <div class="card" style="margin-bottom:var(--space-3);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-4);">
        <div style="flex:1;">
          <div style="font-size:var(--text-base);font-weight:var(--weight-bold);">${product.name}</div>
          <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${product.brand}</div>
          ${product.category ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:2px;">${product.category}</div>` : ''}
        </div>
        <div style="text-align:center;margin-left:var(--space-4);">
          <div style="font-family:var(--font-heading);font-size:var(--text-3xl);font-weight:800;color:${scoreColor};">${score}</div>
          <div style="font-size:10px;color:${scoreColor};font-weight:600;">${scoreLabel}</div>
          <div style="font-size:9px;color:var(--text-tertiary);">wellness score</div>
        </div>
      </div>

      ${concerns.length === 0 ? `
      <div style="padding:var(--space-3);background:var(--accent-green-dim);border-radius:var(--radius-md);margin-bottom:var(--space-3);">
        <div style="font-size:var(--text-xs);color:var(--accent-green);">✓ No commonly flagged ingredients noticed in this product.</div>
      </div>` : ''}

      ${highConcerns.length > 0 ? `
      <div style="margin-bottom:var(--space-3);">
        <div style="font-size:10px;font-weight:700;color:var(--accent-coral);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:var(--space-2);">Worth Reviewing</div>
        ${highConcerns.map(c => `
        <div style="padding:var(--space-2);background:var(--accent-coral-dim);border-radius:var(--radius-md);margin-bottom:var(--space-1);">
          <div style="font-size:var(--text-xs);font-weight:600;color:var(--accent-coral);margin-bottom:2px;">${c.ingredient}</div>
          <div style="font-size:10px;color:var(--text-secondary);">${c.note}</div>
        </div>`).join('')}
      </div>` : ''}

      ${modConcerns.length > 0 ? `
      <div style="margin-bottom:var(--space-3);">
        <div style="font-size:10px;font-weight:700;color:var(--accent-amber);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:var(--space-2);">Something to Explore</div>
        ${modConcerns.map(c => `
        <div style="padding:var(--space-2);background:var(--accent-amber-dim);border-radius:var(--radius-md);margin-bottom:var(--space-1);">
          <div style="font-size:var(--text-xs);font-weight:600;color:var(--accent-amber);margin-bottom:2px;">${c.ingredient}</div>
          <div style="font-size:10px;color:var(--text-secondary);">${c.note}</div>
        </div>`).join('')}
      </div>` : ''}

      ${lowConcerns.length > 0 ? `
      <div style="margin-bottom:var(--space-3);">
        <div style="font-size:10px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:var(--space-2);">Some Users Prefer to Avoid</div>
        ${lowConcerns.map(c => `
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);margin-bottom:var(--space-1);">
          <div style="font-size:var(--text-xs);font-weight:600;color:var(--text-secondary);margin-bottom:2px;">${c.ingredient}</div>
          <div style="font-size:10px;color:var(--text-tertiary);">${c.note}</div>
        </div>`).join('')}
      </div>` : ''}

      <div style="font-size:10px;color:var(--text-tertiary);font-style:italic;margin-bottom:var(--space-3);">
        Pattern observations only — not medical advice.
      </div>

      <button id="log-hygiene-btn" class="btn btn-primary btn-block" data-product='${JSON.stringify({ name: product.name, brand: product.brand, score: product.safetyScore })}'>
        Log This Product
      </button>
    </div>`;
}

function setupHygieneHandlers(userId) {
    const video = document.getElementById('hygiene-video');
    const startBtn = document.getElementById('start-camera-btn');
    const stopBtn = document.getElementById('stop-camera-btn');
    const resultsEl = document.getElementById('hygiene-results');

    async function scanBarcode(barcode) {
        resultsEl.innerHTML = `<div class="card" style="text-align:center;padding:var(--space-4);"><div class="spinner" style="margin:0 auto;"></div><div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-2);">Looking up product...</div></div>`;

        try {
            const res = await fetch(`${API}/hygiene/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ barcode, userId }),
            });

            if (!res.ok) {
                const err = await res.json();
                resultsEl.innerHTML = `<div class="card"><p style="color:var(--accent-coral);font-size:var(--text-sm);">${err.error || 'Product not found.'}</p></div>`;
                return;
            }

            const { product } = await res.json();
            resultsEl.innerHTML = '<div id="hygiene-result-react"></div>';
mountReact(HygieneScanResult, 'hygiene-result-react', { 
    product,
    onLog: () => showToast('✅ Product logged to your hygiene history')
});

            // Wire log button
            document.getElementById('log-hygiene-btn')?.addEventListener('click', () => {
                showToast('✅ Product logged to your hygiene history');
            });

        } catch (err) {
            resultsEl.innerHTML = `<div class="card"><p style="color:var(--accent-coral);font-size:var(--text-sm);">Scan failed — try again.</p></div>`;
        }
    }

    startBtn?.addEventListener('click', async () => {
        try {
            cameraStream = await initCamera(video);
            video.style.display = 'block';
            document.getElementById('camera-placeholder').style.display = 'none';
            document.getElementById('scan-overlay').style.display = 'block';
            startBtn.style.display = 'none';
            stopBtn.style.display = 'block';

            stopScanning = startBarcodeScanner(video, async (barcode) => {
                if (stopScanning) { stopScanning(); stopScanning = null; }
                await scanBarcode(barcode);
            });
        } catch (err) {
            resultsEl.innerHTML = `<div class="card"><p style="color:var(--accent-coral);font-size:var(--text-sm);">Camera access denied. Use manual entry below.</p></div>`;
        }
    });

    stopBtn?.addEventListener('click', () => {
        if (stopScanning) { stopScanning(); stopScanning = null; }
        stopCamera(cameraStream);
        video.style.display = 'none';
        document.getElementById('camera-placeholder').style.display = 'block';
        document.getElementById('scan-overlay').style.display = 'none';
        startBtn.style.display = 'block';
        stopBtn.style.display = 'none';
    });

    document.getElementById('manual-scan-btn')?.addEventListener('click', async () => {
        const barcode = document.getElementById('manual-barcode').value.trim();
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

function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--surface-3);border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--space-3) var(--space-4);font-size:var(--text-sm);color:var(--text-primary);z-index:1000;';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}