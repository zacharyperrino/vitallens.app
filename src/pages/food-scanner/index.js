// Food Scanner Page — Meal Scan & Product Scan Modes
// Entry point: page shell, camera/scanner lifecycle, mode toggle and the
// product (barcode / nutrition-label) scan flow. Meal-photo analysis is in meal-scan.js.
import { icons } from '../../icons.js';
import { lookupBarcode, parseNutritionLabel, getHealthScore } from '../../services/foodScanApi.js';
import { initCamera, stopCamera, startBarcodeScanner } from '../../utils/product-scanner.js';
import { meals, productScans, dailyNutrition } from '../../lib/db.js';
import { apiFetch } from '../../utils/api.js';
import { showToast } from '../../utils/toast.js';
import { todayLocalISO } from '../../utils/dates.js';
import { setupFoodUpload } from './meal-scan.js';
import { renderMemoryCard, setupMemoryHandlers } from './memory.js';
import { renderEmptyMeals, renderEmptyScans, renderMealCard, renderProductScanCard } from './cards.js';

let currentMode = 'meal';
let cameraStream = null;
let stopScanning = null;

export async function renderFoodScanner() {
  const content = document.getElementById('page-content');

  bindScannerCleanup();
  releaseScannerResources();

  let recentMeals = [];
  let recentScans = [];
  let todayNutrition = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  let savedMemories = [];
  // A failed load must never be rendered as "nothing logged yet".
  let mealsError = false, scansError = false, nutritionError = false, memoriesError = false;

  try { recentMeals = await meals.getRecent(5); } catch (e) { mealsError = true; console.warn('Could not load meals:', e.message); }
  try { recentScans = await productScans.getRecent(5); } catch (e) { scansError = true; console.warn('Could not load scans:', e.message); }
  try { todayNutrition = await dailyNutrition.get(); } catch (e) { nutritionError = true; console.warn('Could not load nutrition:', e.message); }
  try {
    const { supabase } = await import('../../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      const res = await apiFetch(`/api/meal-memory/list?userId=${user.id}`);
      if (!res.ok) throw new Error(`Meal memory request failed (${res.status})`);
      const j = await res.json();
      savedMemories = j.memories || [];
    }
  } catch (e) { memoriesError = true; console.warn('Could not load meal memories:', e.message); }

  content.innerHTML = `
    <div class="food-scanner stagger-children">
      <div class="page-header">
        <h1>Food Scanner</h1>
        <p>Scan meals or product barcodes for health insights</p>
      </div>

      ${nutritionError ? renderLoadError('nutrition', "Couldn't load today's nutrition") : todayNutrition.calories > 0 ? `
      <div class="card mb-4">
        <h4 class="mb-3">Today's Nutrition</h4>
        <div style="display:flex;justify-content:space-between;text-align:center;">
          <div>
            <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:var(--weight-bold);color:var(--accent-teal);">${Math.round(todayNutrition.calories)}</div>
            <div class="text-tertiary text-xs">calories</div>
          </div>
          <div>
            <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:var(--weight-bold);color:var(--accent-blue);">${Math.round(todayNutrition.protein)}g</div>
            <div class="text-tertiary text-xs">protein</div>
          </div>
          <div>
            <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:var(--weight-bold);color:var(--accent-amber);">${Math.round(todayNutrition.carbs)}g</div>
            <div class="text-tertiary text-xs">carbs</div>
          </div>
          <div>
            <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:var(--weight-bold);color:var(--accent-coral);">${Math.round(todayNutrition.fat)}g</div>
            <div class="text-tertiary text-xs">fat</div>
          </div>
        </div>
      </div>` : ''}

      <div class="scan-mode-toggle" role="tablist" aria-label="Scanner mode">
        <button type="button" role="tab" aria-selected="${currentMode === 'meal'}" aria-controls="meal-scan-view" class="mode-btn ${currentMode === 'meal' ? 'mode-btn-active' : ''}" id="mode-meal">
          ${icons.camera} Meal Scan
        </button>
        <button type="button" role="tab" aria-selected="${currentMode === 'product'}" aria-controls="product-scan-view" class="mode-btn ${currentMode === 'product' ? 'mode-btn-active' : ''}" id="mode-product">
          ${icons.barcode} Product Scan
        </button>
      </div>

      <!-- Meal Scan View -->
      <div id="meal-scan-view" role="tabpanel" aria-labelledby="mode-meal" style="${currentMode !== 'meal' ? 'display:none;' : ''}">
        <div class="card" style="padding:0;overflow:hidden;margin-bottom:var(--space-5);" id="food-upload-card" aria-live="polite">
          <div class="upload-zone" id="food-upload-zone">
            <input type="file" accept="image/*" capture="environment" id="food-file-input" multiple aria-label="Take a photo of your meal, or choose up to 3 photos">
            <div class="text-tertiary">${icons.camera}</div>
            <p><span class="upload-btn-text">Take Photo</span> or drag &amp; drop</p>
            <p style="font-size:var(--text-xs);">Add up to 3 photos for better accuracy</p>
          </div>
          <div style="display:flex;gap:0;border-top:1px solid var(--border);">
            <div style="flex:1;text-align:center;padding:var(--space-2) var(--space-1);border-right:1px solid var(--border);">
              <div style="color:var(--text-secondary);display:flex;justify-content:center;">${icons.user}</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:1px;font-weight:600;">HAND</div>
              <div style="font-size:var(--text-xs);color:var(--accent-teal);">= best accuracy</div>
            </div>
            <div style="flex:1;text-align:center;padding:var(--space-2) var(--space-1);border-right:1px solid var(--border);">
              <div style="color:var(--text-secondary);display:flex;justify-content:center;">${icons.sun}</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:1px;font-weight:600;">LIGHTING</div>
              <div class="text-tertiary text-xs">bright & even</div>
            </div>
            <div style="flex:1;text-align:center;padding:var(--space-2) var(--space-1);border-right:1px solid var(--border);">
              <div style="color:var(--text-secondary);display:flex;justify-content:center;">${icons.camera}</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:1px;font-weight:600;">FULL PLATE</div>
              <div class="text-tertiary text-xs">from above</div>
            </div>
            <div style="flex:1;text-align:center;padding:var(--space-2) var(--space-1);">
              <div style="color:var(--text-secondary);display:flex;justify-content:center;">${icons.coffee}</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:1px;font-weight:600;">UTENSIL</div>
              <div class="text-tertiary text-xs">also works</div>
            </div>
          </div>
        </div>
        <div id="multi-image-preview" style="display:none;padding:var(--space-3);display:flex;gap:var(--space-2);flex-wrap:wrap;"></div>
        <div id="food-results" class="hidden" aria-live="polite">
          <div class="portion-selector">
            <label for="portion-select">Portion Size</label>
            <select id="portion-select">
              <option value="small">Small</option>
              <option value="medium" selected>Medium</option>
              <option value="large">Large</option>
            </select>
          </div>
        </div>
        ${memoriesError ? renderLoadError('memories', "Couldn't load your saved meals") : savedMemories.length > 0 ? `
        <div class="section-heading" style="margin-top:var(--space-6);">
          <h3>Saved Meals</h3>
          <span class="badge badge-teal">${savedMemories.length} saved</span>
        </div>
        <div id="meal-memory-list" class="flex-col gap-3">
          ${savedMemories.map(m => renderMemoryCard(m)).join('')}
        </div>
        ` : ''}

        <div class="section-heading" style="margin-top:var(--space-6);">
          <h3>Recent Meals</h3>
          ${mealsError ? '' : `<span class="badge badge-teal">${recentMeals.length} logged</span>`}
        </div>
        <div id="meal-history" class="flex-col gap-3">
          ${mealsError ? renderLoadError('meals', "Couldn't load your recent meals") : recentMeals.length > 0 ? recentMeals.map(renderMealCard).join('') : renderEmptyMeals()}
        </div>
      </div>

      <!-- Product Scan View -->
      <div id="product-scan-view" role="tabpanel" aria-labelledby="mode-product" style="${currentMode !== 'product' ? 'display:none;' : ''}">
        <div class="card barcode-scanner-card" id="barcode-scanner-card">
          <div class="barcode-viewfinder">
            <video id="barcode-video" autoplay playsinline muted aria-label="Live camera preview for barcode scanning"></video>
            <div class="barcode-overlay">
              <div class="barcode-scan-region">
                <div class="barcode-corner tl"></div>
                <div class="barcode-corner tr"></div>
                <div class="barcode-corner bl"></div>
                <div class="barcode-corner br"></div>
              </div>
              <p class="barcode-hint">Align barcode within the frame</p>
            </div>
          </div>
          <div class="barcode-actions">
            <button type="button" class="btn btn-sm btn-outline" id="btn-start-camera">
              ${icons.camera} Start Camera
            </button>
            <button type="button" class="btn btn-sm btn-outline" id="btn-capture-label">
              Capture Label
            </button>
          </div>
        </div>
        <div class="card mt-3">
          <h4 class="mb-2 text-sm">Manual Barcode Entry</h4>
          <div style="display:flex;gap:var(--space-2);">
            <label for="manual-barcode" class="visually-hidden">Barcode number</label>
            <input type="text" id="manual-barcode" inputmode="numeric" placeholder="e.g. 3017620422003"
              style="flex:1;font-size:var(--text-sm);padding:var(--space-2) var(--space-3);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);">
            <button type="button" class="btn btn-primary btn-sm" id="btn-manual-lookup">
              ${icons.scan} Look Up
            </button>
          </div>
        </div>
        <input type="file" accept="image/*" capture="environment" id="ocr-file-input" aria-label="Photo of a nutrition label" style="display:none;">
        <div id="product-scan-loading" class="hidden" aria-live="polite">
          <div class="card" style="text-align:center;padding:var(--space-6);">
            <div class="spinner" style="margin:0 auto var(--space-3);"></div>
            <p class="text-secondary text-sm" id="scan-status-text">Looking up product...</p>
          </div>
        </div>
        <div id="product-scan-error" class="hidden" role="alert">
          <div class="card" style="text-align:center;padding:var(--space-6);border-left:3px solid var(--error);">
            <div style="margin-bottom:var(--space-2);color:var(--viz-amber);display:flex;justify-content:center;">${icons.alert}</div>
            <p class="text-secondary text-sm" id="scan-error-text">Something went wrong</p>
            <button type="button" class="btn btn-sm btn-outline mt-3" id="btn-try-again">Try Again</button>
          </div>
        </div>
        <div class="section-heading" style="margin-top:var(--space-5);">
          <h3>Recent Scans</h3>
          ${scansError ? '' : `<span class="badge badge-teal">${recentScans.length} scanned</span>`}
        </div>
        <div id="product-scan-history" class="flex-col gap-3">
          ${scansError ? renderLoadError('scans', "Couldn't load your recent scans") : recentScans.length > 0 ? recentScans.map(renderProductScanCard).join('') : renderEmptyScans()}
        </div>
        <p class="disclaimer mt-4 text-center">
          Scores are for informational purposes only. Not medical advice.
        </p>
      </div>
    </div>
  `;

  // ── Append modal to document.body so position:fixed works correctly ──
  document.getElementById('scan-guide-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'scan-guide-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'scan-guide-title');
  modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;align-items:flex-end;justify-content:center;';
  modal.innerHTML = `
    <div style="background:var(--surface-1);border-radius:var(--radius-xl) var(--radius-xl) 0 0;padding:var(--space-6);width:100%;max-width:480px;padding-bottom:40px;">
      <div style="text-align:center;margin-bottom:var(--space-5);">
        <div style="margin-bottom:var(--space-3);color:var(--accent);display:flex;justify-content:center;">${icons.camera}</div>
        <h3 id="scan-guide-title" class="mb-2">Get the most accurate scan</h3>
        <p class="text-secondary text-sm">Follow these tips for calorie estimates close to the real amount</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-3);margin-bottom:var(--space-5);">
        <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--surface-2);border-radius:var(--radius-lg);">
          <div style="flex-shrink:0;color:var(--text-secondary);">${icons.user}</div>
          <div>
            <div class="font-semibold text-sm">Include your hand</div>
            <div class="text-secondary text-xs">Your hand gives the AI a size reference — this is the #1 accuracy factor</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--surface-2);border-radius:var(--radius-lg);">
          <div style="flex-shrink:0;color:var(--text-secondary);">${icons.camera}</div>
          <div>
            <div class="font-semibold text-sm">Show the full plate</div>
            <div class="text-secondary text-xs">Capture everything from above — don't crop any part of the meal</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--surface-2);border-radius:var(--radius-lg);">
          <div style="flex-shrink:0;color:var(--text-secondary);">${icons.sun}</div>
          <div>
            <div class="font-semibold text-sm">Good lighting</div>
            <div class="text-secondary text-xs">Natural light or bright room — avoid shadows across the food</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--surface-2);border-radius:var(--radius-lg);">
          <div style="flex-shrink:0;color:var(--text-secondary);">${icons.coffee}</div>
          <div>
            <div class="font-semibold text-sm">Fork or spoon works too</div>
            <div class="text-secondary text-xs">Any reference object helps — utensils, plates, cups all work</div>
          </div>
        </div>
      </div>
      <button type="button" class="btn btn-primary btn-block" id="guide-got-it-btn" style="font-size:var(--text-base);">Got it — let me scan</button>
    </div>`;
  document.body.appendChild(modal);

  setupModeToggle();
  setupFoodUpload();
  setupProductScan();
  setupMemoryHandlers();
  document.querySelectorAll('[data-retry-page]').forEach(btn => btn.addEventListener('click', () => renderFoodScanner()));
}

function renderLoadError(key, title) {
  return `
    <div class="empty-state" role="alert">
      <h3>${title}</h3>
      <p>Check your connection and try again. Nothing you've logged has been lost.</p>
      <button type="button" class="btn btn-sm" id="${key}-retry" data-retry-page="1">Try again</button>
    </div>`;
}

// ── Camera / scanner lifecycle ────────────────────────────────
// Stops any live camera stream and barcode loop, and removes the
// body-level guide modal. Runs on navigation away and on re-render.
function releaseScannerResources() {
  if (stopScanning) { try { stopScanning(); } catch { /* already stopped */ } stopScanning = null; }
  if (cameraStream) { stopCamera(cameraStream); cameraStream = null; }
  document.getElementById('scan-guide-modal')?.remove();
}

let scannerCleanupBound = false;
function bindScannerCleanup() {
  if (scannerCleanupBound) return;
  scannerCleanupBound = true;
  window.addEventListener('hashchange', releaseScannerResources);
  window.addEventListener('pagehide', releaseScannerResources);
}

function resetCameraButton() {
  const btn = document.getElementById('btn-start-camera');
  if (!btn) return;
  btn.innerHTML = `${icons.camera} Start Camera`;
  btn.disabled = false;
}

// ─── Mode Toggle ─────────────────────────────────────────────

function setupModeToggle() {
  document.getElementById('mode-meal')?.addEventListener('click', () => switchMode('meal'));
  document.getElementById('mode-product')?.addEventListener('click', () => switchMode('product'));
}

function switchMode(mode) {
  currentMode = mode;
  if (mode !== 'product' && cameraStream) {
    stopCamera(cameraStream);
    cameraStream = null;
    if (stopScanning) { stopScanning(); stopScanning = null; }
  }
  document.getElementById('meal-scan-view').style.display = mode === 'meal' ? '' : 'none';
  document.getElementById('product-scan-view').style.display = mode === 'product' ? '' : 'none';
  const mealTab = document.getElementById('mode-meal');
  const productTab = document.getElementById('mode-product');
  if (mealTab) { mealTab.className = `mode-btn ${mode === 'meal' ? 'mode-btn-active' : ''}`; mealTab.setAttribute('aria-selected', String(mode === 'meal')); }
  if (productTab) { productTab.className = `mode-btn ${mode === 'product' ? 'mode-btn-active' : ''}`; productTab.setAttribute('aria-selected', String(mode === 'product')); }
}

// ─── Product Scan ─────────────────────────────────────────────

function setupProductScan() {
  document.getElementById('btn-start-camera')?.addEventListener('click', async () => {
    const video = document.getElementById('barcode-video');
    try {
      cameraStream = await initCamera(video);
      stopScanning = await startBarcodeScanner(video, handleBarcodeDetected);
      const startBtn = document.getElementById('btn-start-camera');
      if (startBtn) { startBtn.textContent = 'Scanning...'; startBtn.disabled = true; }
    } catch (err) {
      console.warn('[ProductScan] Camera unavailable:', err.message);
      releaseScannerResources();
      resetCameraButton();
      showProductError("We couldn't access the camera. Allow camera access in your browser settings, or type the barcode below.");
    }
  });

  document.getElementById('btn-manual-lookup')?.addEventListener('click', () => {
    const input = document.getElementById('manual-barcode');
    const barcode = input?.value?.trim();
    if (barcode && barcode.length >= 8) handleBarcodeDetected(barcode);
  });

  document.getElementById('manual-barcode')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-manual-lookup')?.click();
  });

  document.getElementById('btn-capture-label')?.addEventListener('click', () => {
    document.getElementById('ocr-file-input')?.click();
  });

  document.getElementById('ocr-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await handleOcrCapture(file);
  });

  document.getElementById('btn-try-again')?.addEventListener('click', () => {
    document.getElementById('product-scan-error').classList.add('hidden');
  });
}

export async function handleBarcodeDetected(barcode) {
  if (cameraStream) { stopCamera(cameraStream); cameraStream = null; }
  if (stopScanning) { stopScanning(); stopScanning = null; }
  resetCameraButton();
  showProductLoading(`Looking up barcode: ${barcode}...`);
  try {
    const result = await lookupBarcode(barcode);
    try {
      await productScans.log({ barcode: result.product.barcode, name: result.product.name, brand: result.product.brand, score: result.healthScore.score, rating: result.healthScore.rating, nutrition: result.product.nutrition, additives: result.additives, scanType: 'barcode' });
    } catch (dbErr) {
      console.error('[ProductScan] Failed to save:', dbErr.message);
      showToast("We found the product but couldn't save it to your history.");
    }
    window._lastProductScan = result;
    location.hash = '#/product-results';
  } catch (err) {
    console.warn('[ProductScan] Lookup failed:', err.message);
    const notFound = /not found|404/i.test(err.message || '');
    showProductError(notFound
      ? "We couldn't find this barcode in the product database. Check the number, or capture the nutrition label instead."
      : "Couldn't look up this product right now. Check your connection and try again.");
  }
}

async function handleOcrCapture(file) {
  showProductLoading('Analyzing nutrition label...');
  try {
    const ocrResult = await parseNutritionLabel(file);
    const scoreResult = await getHealthScore(ocrResult.nutrition, []);
    // /api/ocr-parse returns only nutrition/servingSize/rawText/confidence/warnings —
    // no product or brand name — so label the scan by what it is rather than inventing one.
    const scanName = `Label scan · ${todayLocalISO()}`;
    try {
      await productScans.log({ barcode: 'OCR-SCAN', name: scanName, score: scoreResult?.score ?? null, rating: scoreResult?.rating ?? null, nutrition: ocrResult.nutrition, scanType: 'ocr' });
    } catch (dbErr) {
      console.error('[OCR] Failed to save:', dbErr.message);
      showToast("We read the label but couldn't save it to your history.");
    }
    window._lastProductScan = { product: { barcode: 'OCR-SCAN', name: scanName, brand: '', ingredients: '', nutrition: ocrResult.nutrition, nutriscore: null, nova_group: null, image_url: null }, healthScore: scoreResult, additives: { analyzed: [], summary: { total: 0, high: 0, moderate: 0, low: 0 } } };
    location.hash = '#/product-results';
  } catch (err) {
    console.warn('[OCR] Label parse failed:', err.message);
    showProductError("We couldn't read that label. Try a sharper, well-lit photo with the whole nutrition panel in frame.");
  }
}

function showProductLoading(msg) {
  document.getElementById('product-scan-loading')?.classList.remove('hidden');
  document.getElementById('product-scan-error')?.classList.add('hidden');
  const el = document.getElementById('scan-status-text');
  if (el) el.textContent = msg;
}

function showProductError(msg) {
  document.getElementById('product-scan-loading')?.classList.add('hidden');
  document.getElementById('product-scan-error')?.classList.remove('hidden');
  const el = document.getElementById('scan-error-text');
  if (el) el.textContent = msg;
}
