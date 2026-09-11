// Meal-photo scan flow: upload zone + first-run guide, image compression,
// vision analysis, the meal-memory shortcut, and hand-off to the results view.
import { icons } from '../../icons.js';
import { esc } from '../../utils/esc.js';
import { getMealAnalysis } from '../../services/foodScanApi.js';
import { meals } from '../../lib/db.js';
import { checkMealMemory, saveMealMemory } from '../../services/visionApi.js';
import { trackEvent } from '../../utils/analytics-events.js';
import { showToast } from '../../utils/toast.js';
import { handleBarcodeDetected, renderFoodScanner } from './index.js';
import { loadTCMConstitution } from './tcm-data.js';
import { drawDetectionOverlay, renderFoodResults } from './results.js';
import { applyCorrectionsUI, setupCorrectionHandlers, setupItemActions, setupPortionSliders } from './result-actions.js';

const hasSeenGuide = () => localStorage.getItem('vl_scan_guide_seen') === '1';
const markGuideSeen = () => localStorage.setItem('vl_scan_guide_seen', '1');
let scanAttempts = parseInt(localStorage.getItem('vl_scan_attempts') || '0');
const incrementScanAttempts = () => { scanAttempts++; localStorage.setItem('vl_scan_attempts', scanAttempts); };

// ─── Meal Upload ──────────────────────────────────────────────

export function setupFoodUpload() {
  const zone = document.getElementById('food-upload-zone');
  const input = document.getElementById('food-file-input');

  // First-time scan guide
  const guideModal = document.getElementById('scan-guide-modal');
  const gotItBtn = document.getElementById('guide-got-it-btn');
  if (guideModal && !hasSeenGuide()) {
    const previouslyFocused = document.activeElement;
    const focusables = () => Array.from(guideModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
    const closeGuide = () => {
      guideModal.style.display = 'none';
      markGuideSeen();
      document.removeEventListener('keydown', onGuideKey);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
    const onGuideKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeGuide(); return; }
      if (e.key === 'Tab') {
        const list = focusables();
        if (list.length === 0) return;
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    guideModal.style.display = 'flex';
    document.addEventListener('keydown', onGuideKey);
    gotItBtn?.addEventListener('click', closeGuide);
    // Deferred so it runs after the router moves focus to the page container.
    setTimeout(() => gotItBtn?.focus(), 0);
  } else if (guideModal) {
    guideModal.style.display = 'none';
  }

  // Hand reminder every 5th scan
  input?.addEventListener('click', () => {
    incrementScanAttempts();
    if (scanAttempts % 5 === 0 && scanAttempts > 0) {
      showToast('Tip: Include your hand in the photo for the most accurate calorie estimate');
    }
  });

  ['dragenter', 'dragover'].forEach(e => {
    zone?.addEventListener(e, (ev) => { ev.preventDefault(); zone.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(e => {
    zone?.addEventListener(e, (ev) => { ev.preventDefault(); zone.classList.remove('dragover'); });
  });
  zone?.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer?.files || []).slice(0, 3);
    if (files.length) processFood(files);
  });
  input?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []).slice(0, 3);
    if (files.length) processFood(files);
  });
}

async function compressImage(file, maxDimension = 1536, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("We couldn't read that image. Try a different photo."));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("We couldn't read that image. Try a different photo."));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height / width) * maxDimension);
            width = maxDimension;
          } else {
            width = Math.round((width / height) * maxDimension);
            height = maxDimension;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error("We couldn't process that image. Try a different photo.")); return; }
          const compressed = new File([blob], file.name || 'meal.jpg', { type: 'image/jpeg', lastModified: Date.now() });
          console.log(`[FoodScanner] Image compressed: ${(file.size / 1024).toFixed(0)}KB ${(compressed.size / 1024).toFixed(0)}KB`);
          resolve(compressed);
        }, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function generateMealHash(foods) {
  const labels = (foods || [])
    .map(f => (f.label || f.name || '').toLowerCase().trim())
    .filter(Boolean)
    .sort()
    .join('|');
  return btoa(labels).slice(0, 32);
}

async function processFood(filesOrFile) {
  const files = Array.isArray(filesOrFile) ? filesOrFile : [filesOrFile];
  const file = files[0];
  const card = document.getElementById('food-upload-card');
  const resultsDiv = document.getElementById('food-results');

  card.innerHTML = `
        <div class="scanner-preview">
            <img id="food-preview-img" alt="Food preview" class="w-full" style="height:100%;object-fit:cover;">
            <div class="scanner-line"></div>
            <div class="flex items-center gap-2 rounded-full" style="position:absolute;bottom:var(--space-3);left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.6);padding:var(--space-2) var(--space-4);">
                <div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>
                <span class="text-sm" style="color:white;">Analyzing meal...</span>
            </div>
        </div>
    `;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.getElementById('food-preview-img');
    if (img) img.src = e.target.result;
  };
  reader.readAsDataURL(file);

  try {
    // ── Barcode auto-detection ────────────────────────────
    if ('BarcodeDetector' in window) {
      try {
        const detector = new BarcodeDetector({ formats: ['ean_13', 'upc_a', 'ean_8', 'upc_e', 'code_128', 'code_39', 'qr_code'] });
        const bitmap = await createImageBitmap(file);
        const barcodes = await detector.detect(bitmap);
        if (barcodes.length > 0) {
          const barcode = barcodes[0].rawValue;
          console.log(`[BarcodeAuto] Detected barcode in photo: ${barcode}`);
          showToast(`Barcode detected — looking up product...`);
          // Switch to product scan mode and handle
          card.innerHTML = `<div class="p-6 text-center"><div class="spinner" style="margin:0 auto var(--space-3);"></div><p>Looking up barcode: ${esc(barcode)}...</p></div>`;
          await handleBarcodeDetected(barcode);
          return;
        }
      } catch {
        console.log('[BarcodeAuto] No barcode found, proceeding with meal analysis');
      }
    }

    const selectedPortion = document.getElementById('portion-select')?.value || 'medium';
    const compressedFiles = await Promise.all(files.map(f => compressImage(f)));
    const result = await getMealAnalysis(compressedFiles, selectedPortion);

    // ── Analytics — vision scan completed ─────────────────
    try {
      const { supabase } = await import('../../lib/supabase.js');
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;
      const detections = result.foods || [];
      trackEvent('food_scan_completed', { userId, foodCount: detections.length, source: 'vision' });
    } catch { /* analytics never blocks the scan */ }

    // ── Meal memory check ─────────────────────────────────
    const hash = generateMealHash(result.foods || []);
    const memory = await checkMealMemory(hash);

    if (memory && memory.scan_count >= 2) {
      // Show memory prompt instead of full results
      card.innerHTML = `
                <div class="p-5">
                    <div class="mb-3 text-tertiary">${icons.sparkle}</div>
                    <h4 class="mb-1">Looks familiar!</h4>
                    <p class="mb-1 text-secondary text-sm">
                        This looks like <strong>${esc(memory.meal_name)}</strong>
                    </p>
                    <p class="mb-4 text-tertiary text-xs">
                        You've had this ${Number(memory.scan_count) || 0} times · Avg ${Math.round(Number(memory.avg_calories) || 0)} cal
                    </p>
                    <div class="flex gap-2">
                        <button type="button" id="memory-confirm-btn" class="btn btn-primary flex-1">Log as usual</button>
                        <button type="button" id="memory-edit-btn" class="btn btn-outline flex-1">Edit</button>
                    </div>
                </div>
            `;

      document.getElementById('memory-confirm-btn')?.addEventListener('click', async () => {
        try {
          await meals.log({
            name: memory.meal_name,
            calories: memory.avg_calories,
            protein: result.food?.protein || 0,
            carbs: result.food?.carbs || 0,
            fat: result.food?.fat || 0,
            fiber: result.food?.fiber || 0,
            foods: memory.foods,
          });
          await saveMealMemory(hash, memory.meal_name, result.foods, memory.avg_calories);
          showToast(`${memory.meal_name} logged — ${memory.avg_calories} cal`);
          card.innerHTML = `
                        <div class="p-4 text-center">
                            <div class="mb-2 text-green flex justify-center">${icons.check}</div>
                            <p class="text-secondary text-sm">Logged successfully</p>
                        </div>
                    `;
        } catch (err) {
          console.warn('[MealMemory] Log failed:', err.message);
          showToast("Couldn't log this meal. Check your connection and try again.");
        }
      });

      document.getElementById('memory-edit-btn')?.addEventListener('click', () => {
        showNormalResults(result, hash, reader, resultsDiv, card);
      });

      return;
    }

    // ── Normal flow ───────────────────────────────────────
    showNormalResults(result, hash, reader, resultsDiv, card);

  } catch (err) {
    console.error('[MealScan] Processing error:', err);
    card.innerHTML = `
            <div class="empty-state rounded-xl" role="alert" style="border:2px dashed var(--error);">
                <div class="text-amber flex justify-center">${icons.alert}</div>
                <h3>Couldn't analyze this meal</h3>
                <p>${esc(friendlyScanMessage(err))}</p>
                <button type="button" class="btn btn-sm" id="meal-scan-retry">Try again</button>
            </div>
        `;
    document.getElementById('meal-scan-retry')?.addEventListener('click', () => renderFoodScanner());
    showToast("Couldn't analyze this meal.");
  }
}

// Messages written for people pass through; anything else (status codes,
// upstream error strings) becomes a plain-language fallback.
function friendlyScanMessage(err) {
  const m = err?.message || '';
  if (/try a (clearer|different) photo|no food detected|sufficient confidence|couldn't (read|process) that image/i.test(m)) return m;
  return 'Check your connection and try again with a clear, well-lit photo.';
}

async function showNormalResults(result, hash, reader, resultsDiv, card) {
  card.innerHTML = `
        <div class="scanner-preview p-0 relative" style="aspect-ratio:auto;">
            <img id="food-preview-img-done" alt="Scanned food" class="w-full block" style="height:200px;object-fit:cover;">
            <canvas id="food-box-overlay" class="w-full" style="position:absolute;top:0;left:0;height:200px;pointer-events:none;"></canvas>
            <div style="position:absolute;top:var(--space-3);right:var(--space-3);">
                <div class="badge badge-green">${icons.check} Analyzed</div>
            </div>
        </div>
    `;

  const imgDone = document.getElementById('food-preview-img-done');
  if (imgDone) {
    imgDone.src = reader.result;
    imgDone.onload = () => { drawDetectionOverlay(imgDone, result.foods || []); };
  }

  resultsDiv.classList.remove('hidden');
  resultsDiv.innerHTML = renderFoodResults(result);
  setupPortionSliders(result, hash);
  setupItemActions(result);
  setupCorrectionHandlers(result);
  resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast('Meal analyzed! Adjust portions if needed.');
  applyCorrectionsUI(result.foods || []);

  // TCM toggle
  const tcmToggle = document.getElementById('tcm-toggle');
  tcmToggle?.addEventListener('click', () => {
    const body = document.getElementById('tcm-body');
    const chevron = document.getElementById('tcm-chevron');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    tcmToggle.setAttribute('aria-expanded', String(!isOpen));
    if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
  });

  // Load TCM constitution profile
  loadTCMConstitution();
}
