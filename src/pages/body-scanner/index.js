// Body Check-In — observational wellness reflections from the camera or a photo.
// Modes: Pulse (rPPG), Face, Tongue, Body/posture.
//
// Honesty rules for this page:
//  - Nothing here detects, screens for, or assesses a condition. Copy stays
//    observational ("worth a look", "something to explore").
//  - If a value can't be measured (no usable pulse signal) the UI says so
//    instead of showing a number.
//  - Every AI/user-controlled string is escaped before it touches innerHTML.
//
// Entry point: owns the camera / rPPG state, the scanner UI, and the analysis
// pipeline. Per-mode result markup is in results.js, pulse output in hr.js.
import { icons } from '../../icons.js';
import { esc } from '../../utils/esc.js';
import { CameraSystem, QualityGate } from '../../utils/camera-system.js';
import { RPPGEngine, analyzeFace, analyzeBodyComposition, analyzeTongue } from '../../utils/biomarker-engine.js';
import { bodyScans, hrReadings } from '../../lib/db.js';
import { apiFetch } from '../../utils/api.js';
import { showToast } from '../../utils/toast.js';
import { MODES, getInstructions, withTimeout } from './shared.js';
import { fetchAndRenderDelta, renderBodyResults, renderFaceResults, renderGenericResults, renderTongueResults } from './results.js';
import { showHeartRateResults, showHeartRateUnmeasured, updateCaptureProgressRing } from './hr.js';
import { renderHRTrend, renderScanHistory } from './history.js';

export let activeMode = 'face';
let camera = null;
let rppgEngine = null;
let isScanning = false;
let lastAnalysis = null;   // { imageData, previewUrl, altText } — lets "Try again" re-run without re-capturing
let cleanupBound = false;

const MAX_IMAGE_EDGE = 1024;       // downscale uploads before getImageData
const ANALYSIS_TIMEOUT_MS = 50_000;
const HR_DURATION_MS = 15_000;

// ═══════════════════════════════════════════════════
//  Lifecycle
// ═══════════════════════════════════════════════════

function stopScanner() {
  if (camera) {
    try { camera.stop(); } catch (e) { console.warn('[BodyScanner] Camera stop failed:', e?.message || e); }
    camera = null;
  }
  if (rppgEngine) {
    rppgEngine.isRecording = false;
    rppgEngine.onProgress = null;
    rppgEngine.onResult = null;
    rppgEngine = null;
  }
  isScanning = false;
}

// The camera must never keep running after the user navigates away.
function bindCleanup() {
  if (cleanupBound) return;
  cleanupBound = true;
  window.addEventListener('hashchange', stopScanner);
  window.addEventListener('pagehide', stopScanner);
}

export async function renderBodyScanner() {
  stopScanner();
  bindCleanup();
  lastAnalysis = null;

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="body-scanner">
      <div class="page-header">
        <h1>Body Check-In</h1>
        <p>Observational wellness reflections from a photo</p>
      </div>
      <div class="card text-center" style="padding:var(--space-8);" role="status" aria-live="polite">
        <div class="spinner" style="margin:0 auto;"></div>
        <p class="visually-hidden">Loading your check-in history</p>
      </div>
    </div>`;

  let history = [];
  let recentHR = [];
  let historyError = false;
  let hrError = false;
  try { history = (await bodyScans.getRecent(8)) || []; } catch (e) { historyError = true; console.warn('[BodyScanner] Could not load scan history:', e?.message || e); }
  try { recentHR = (await hrReadings.getRecent(7)) || []; } catch (e) { hrError = true; console.warn('[BodyScanner] Could not load pulse readings:', e?.message || e); }

  content.innerHTML = `
    <div class="body-scanner stagger-children">
      <div class="page-header">
        <h1>Body Check-In</h1>
        <p>Observational wellness reflections from a photo</p>
      </div>

      <div class="mode-selector flex gap-2" id="mode-selector" role="tablist" aria-label="Check-in type" style="overflow-x:auto;padding-bottom:var(--space-2);">
        ${MODES.map(m => `
          <button type="button" role="tab" class="mode-card ${m.id === activeMode ? 'active' : ''}" data-mode="${m.id}" id="mode-tab-${m.id}" aria-selected="${m.id === activeMode}" aria-controls="scanner-area" style="flex-shrink:0;color:inherit;">
            <div class="mode-icon" aria-hidden="true">${m.icon}</div>
            <div class="mode-label">${esc(m.label)}</div>
          </button>
        `).join('')}
      </div>

      <div id="scanner-area" role="tabpanel" aria-labelledby="mode-tab-${activeMode}" class="mt-4">
        ${renderScannerForMode(activeMode)}
      </div>

      <div id="scan-results" class="hidden" aria-live="polite"></div>

      <p class="disclaimer mt-4">Wellness observations only — <strong>not medical advice and not a diagnosis</strong>. VitalLens does not detect, screen for, or assess any disease or condition. Talk to a licensed healthcare provider about any health concern.</p>

      ${hrError
        ? `<div class="empty-state card mt-4" role="alert"><h2 class="h3">Couldn't load your pulse trend</h2><p>Check your connection and try again. Your readings are safe.</p><button type="button" class="btn btn-sm" id="history-retry-hr">Try again</button></div>`
        : (recentHR.length >= 2 ? renderHRTrend(recentHR) : '')}

      <div class="section-heading mt-5">
        <h2 class="h3">Check-In History</h2>
        ${historyError ? '' : `<span class="badge badge-purple">${history.length}</span>`}
      </div>
      <div id="scan-history" class="flex-col gap-3">
        ${renderScanHistory(history, historyError)}
      </div>
    </div>`;

  setupModeSelector();
  document.getElementById('history-retry')?.addEventListener('click', () => renderBodyScanner());
  document.getElementById('history-retry-hr')?.addEventListener('click', () => renderBodyScanner());
}

// ═══════════════════════════════════════════════════
//  Scanner UI
// ═══════════════════════════════════════════════════

export function renderScannerForMode(mode) {
  const m = MODES.find(x => x.id === mode) || MODES[1];
  const instructions = getInstructions(mode);

  if (mode === 'heart') {
    return `
      <div class="card p-0 overflow-hidden">
        <div class="scanner-viewfinder" id="viewfinder">
          <div class="scanner-guide-overlay" aria-hidden="true"><div class="guide-face"></div></div>
          <div class="capture-progress" id="capture-progress" aria-hidden="true"></div>
          <div class="quality-bar" id="quality-bar" aria-hidden="true"></div>
          <div class="scanner-status" id="scanner-status" role="status" aria-live="polite">
            <div class="scanner-status-dot amber"></div>
            <span>Tap Start to begin</span>
          </div>
        </div>
      </div>
      <div class="card mt-3">
        <div class="flex items-center gap-3 mb-3">
          <span class="text-accent" aria-hidden="true">${icons.heart}</span>
          <div><h2 class="h4">Pulse estimate</h2><p class="text-tertiary text-xs">${esc(instructions)}</p></div>
        </div>
        <div id="hr-live-display" style="display:none;text-align:center;padding:var(--space-4) 0;">
          <div class="hr-display justify-center">
            <div class="hr-pulse text-accent" aria-hidden="true">${icons.heart}</div>
            <div><div class="hr-value" id="hr-value">--</div><div class="hr-label">BPM</div></div>
          </div>
          <div class="mt-3">
            <div class="progress-bar" style="height:6px;" aria-hidden="true"><div class="progress-fill" id="hr-progress" style="width:0%;background:var(--error);"></div></div>
            <p class="mt-2 text-tertiary text-xs" id="hr-status-text" role="status" aria-live="polite">Recording...</p>
          </div>
        </div>
        <button type="button" class="btn btn-primary btn-block" id="start-scan-btn">
          ${icons.camera} Start Pulse Check
        </button>
      </div>`;
  }

  return `
    <div class="card p-0 overflow-hidden">
      <div class="scanner-viewfinder" id="viewfinder">
        <div class="scanner-guide-overlay" aria-hidden="true"><div class="guide-${m.guide}"></div></div>
        <div class="quality-bar" id="quality-bar" aria-hidden="true"></div>
        <div class="scanner-status" id="scanner-status" role="status" aria-live="polite">
          <div class="scanner-status-dot amber"></div>
          <span>Ready when you are</span>
        </div>
      </div>
    </div>
    <div class="card mt-3">
      <div class="flex items-center gap-3 mb-3">
        <span style="font-size:24px;" aria-hidden="true">${m.icon}</span>
        <div><h2 class="h4">${esc(m.label)}</h2><p class="text-tertiary text-xs">${esc(instructions)}</p></div>
      </div>
      <div class="flex gap-3">
        <button type="button" class="btn btn-primary flex-1" id="start-scan-btn">
          ${icons.camera} Start Camera
        </button>
        <button type="button" class="btn btn-secondary flex-1" id="upload-btn">
          ${icons.upload} Upload Photo
        </button>
        <label for="upload-input" class="visually-hidden">Choose a photo to upload</label>
        <input type="file" accept="image/*" id="upload-input" class="visually-hidden" tabindex="-1">
      </div>
    </div>`;
}

function setupModeSelector() {
  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      stopScanner();
      lastAnalysis = null;
      activeMode = card.dataset.mode;
      document.querySelectorAll('.mode-card').forEach(c => {
        c.classList.remove('active');
        c.setAttribute('aria-selected', 'false');
      });
      card.classList.add('active');
      card.setAttribute('aria-selected', 'true');
      const area = document.getElementById('scanner-area');
      area.innerHTML = renderScannerForMode(activeMode);
      area.setAttribute('aria-labelledby', `mode-tab-${activeMode}`);
      const results = document.getElementById('scan-results');
      results.classList.add('hidden');
      results.innerHTML = '';
      attachScanHandlers();
    });
  });
  attachScanHandlers();
}

export function attachScanHandlers() {
  document.getElementById('start-scan-btn')?.addEventListener('click', onStartButton);
  document.getElementById('upload-btn')?.addEventListener('click', () => document.getElementById('upload-input')?.click());
  document.getElementById('upload-input')?.addEventListener('change', (e) => {
    if (e.target.files?.[0]) processUploadedImage(e.target.files[0]);
    e.target.value = '';
  });
}

// One button, two jobs: start the camera, then capture the frame.
function onStartButton() {
  if (camera && isScanning && activeMode !== 'heart') captureAndAnalyze();
  else startCameraScan();
}

function resetStartButton() {
  const startBtn = document.getElementById('start-scan-btn');
  if (!startBtn) return;
  startBtn.disabled = false;
  startBtn.style.display = '';
  startBtn.innerHTML = activeMode === 'heart' ? `${icons.camera} Start Pulse Check` : `${icons.camera} Start Camera`;
}

// ═══════════════════════════════════════════════════
//  Camera Scanning
// ═══════════════════════════════════════════════════

export async function startCameraScan() {
  if (isScanning) return;
  isScanning = true;

  const m = MODES.find(x => x.id === activeMode) || MODES[1];

  // After a finished check-in the viewfinder holds the preview image; rebuild
  // it so the live video isn't appended behind the photo.
  if (document.querySelector('#viewfinder img')) {
    const area = document.getElementById('scanner-area');
    if (area) { area.innerHTML = renderScannerForMode(activeMode); attachScanHandlers(); }
  }

  const viewfinder = document.getElementById('viewfinder');
  const statusEl = document.getElementById('scanner-status');
  const startBtn = document.getElementById('start-scan-btn');

  if (startBtn) {
    startBtn.disabled = true;
    startBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;" aria-hidden="true"></div> Starting camera...';
  }

  camera = new CameraSystem({ facingMode: m.facingMode, frameRate: 30 });
  const started = await camera.start(viewfinder);

  if (!started) {
    showToast("We couldn't access your camera. Check your browser's camera permission, or upload a photo instead.");
    camera = null;
    isScanning = false;
    resetStartButton();
    updateStatus(statusEl, 'amber', 'Camera unavailable');
    return;
  }

  updateStatus(statusEl, 'green', 'Camera active');

  if (activeMode === 'heart') {
    startHeartRateScan();
  } else {
    if (startBtn) {
      startBtn.innerHTML = `${icons.camera} Capture & Reflect`;
      startBtn.disabled = false;
    }
    camera.onFrame(frame => {
      if (!isScanning) return;
      updateQualityIndicators(frame.imageData);
    });
  }
}

function startHeartRateScan() {
  const hrDisplay = document.getElementById('hr-live-display');
  const progressBar = document.getElementById('hr-progress');
  const hrValue = document.getElementById('hr-value');
  const statusText = document.getElementById('hr-status-text');
  const statusEl = document.getElementById('scanner-status');
  const startBtn = document.getElementById('start-scan-btn');

  if (hrDisplay) hrDisplay.style.display = 'block';
  if (startBtn) startBtn.style.display = 'none';
  updateStatus(statusEl, 'red', 'Recording pulse — hold still');

  rppgEngine = new RPPGEngine();

  let lastRemaining = null;
  rppgEngine.onProgress = (progress) => {
    if (progressBar) progressBar.style.width = `${progress * 100}%`;
    // Only touch the live region when the second changes, so it announces
    // a countdown rather than chattering every frame.
    const remaining = Math.ceil((1 - progress) * (HR_DURATION_MS / 1000));
    if (statusText && remaining !== lastRemaining) {
      lastRemaining = remaining;
      statusText.textContent = `Recording... ${remaining}s remaining`;
    }
    updateCaptureProgressRing(progress);
  };

  rppgEngine.onResult = async (result) => {
    stopScanner();

    if (!result || result.hr == null) {
      if (hrValue) hrValue.textContent = '--';
      if (statusText) statusText.textContent = "Couldn't measure a pulse";
      updateStatus(document.getElementById('scanner-status'), 'amber', "Couldn't measure");
      showHeartRateUnmeasured(result);
      return;
    }

    if (hrValue) hrValue.textContent = String(result.hr);
    if (statusText) statusText.textContent = `Estimated ${result.hr} BPM (${result.quality} signal)`;
    updateStatus(document.getElementById('scanner-status'), 'green', `${result.hr} BPM — ${result.quality} signal`);

    try {
      await hrReadings.log({ hr: result.hr, hrv: result.hrv, confidence: result.confidence, quality: result.quality });
      // A pulse check-in has no wellness score: signal confidence is camera
      // signal quality, so it is kept under its own name, not as overall_score.
      await bodyScans.log({
        type: 'heart',
        overallScore: null,
        results: { hr: result.hr, hrv: result.hrv, signal_confidence: result.confidence, signal_quality: result.quality },
        hr: result.hr, hrv: result.hrv, confidence: result.confidence, quality: result.quality,
      });
    } catch (dbErr) {
      console.warn('[BodyScanner] Failed to save pulse reading:', dbErr?.message || dbErr);
      showToast("Couldn't save this reading to your history.");
    }

    showHeartRateResults(result);
  };

  rppgEngine.start(HR_DURATION_MS);
  camera.onFrame(frame => {
    if (!rppgEngine?.isRecording) return;
    rppgEngine.addFrame(frame.imageData);
    updateQualityIndicators(frame.imageData);
  });
}

function captureAndAnalyze() {
  if (!camera || !isScanning) return;
  const frame = camera.captureFrame();
  if (!frame) {
    showToast("The camera didn't return a frame. Try again.");
    return;
  }

  stopScanner();
  runAnalysis(frame.imageData, frame.dataUrl, 'Your captured photo');
}

// ═══════════════════════════════════════════════════
//  Upload-based Scanning
// ═══════════════════════════════════════════════════

function processUploadedImage(file) {
  if (file.type && !file.type.startsWith('image/')) {
    showToast('Please choose an image file.');
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => showToast("Couldn't read that file. Try a different photo.");
  reader.onload = (e) => {
    const img = new Image();
    img.onerror = () => showToast("Couldn't open that image. Try a different photo.");
    img.onload = () => {
      // Downscale before reading pixels: full-resolution phone photos are
      // 12–48 MP and would stall the page (and the quality checks).
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const previewUrl = canvas.toDataURL('image/jpeg', 0.85);

      const quality = QualityGate.assess(imageData);
      if (!quality.pass) showToast(`This photo looks ${quality.blur.label.toLowerCase()} — the reflection may be less reliable.`);

      stopScanner();
      runAnalysis(imageData, previewUrl, 'Your uploaded photo');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ═══════════════════════════════════════════════════
//  Analysis pipeline (shared by camera + upload)
// ═══════════════════════════════════════════════════

function analyzeForMode(mode, imageData) {
  switch (mode) {
    case 'tongue': return analyzeTongue(imageData);
    case 'body': return analyzeBodyComposition(imageData);
    case 'face':
    default: return analyzeFace(imageData);
  }
}

function analyzingMarkup(previewUrl, altText) {
  return `
    <img src="${esc(previewUrl)}" alt="${esc(altText)}" class="w-full" style="height:100%;object-fit:cover;">
    <div class="scanner-line" aria-hidden="true"></div>
    <div class="scanner-status" role="status" aria-live="polite">
      <div class="spinner" style="width:14px;height:14px;border-width:2px;" aria-hidden="true"></div>
      <span>Looking at your photo...</span>
    </div>`;
}

async function runAnalysis(imageData, previewUrl, altText) {
  lastAnalysis = { imageData, previewUrl, altText };

  const viewfinder = document.getElementById('viewfinder');
  if (viewfinder) viewfinder.innerHTML = analyzingMarkup(previewUrl, altText);
  const resultsDiv = document.getElementById('scan-results');
  if (resultsDiv) { resultsDiv.classList.add('hidden'); resultsDiv.innerHTML = ''; }
  const startBtn = document.getElementById('start-scan-btn');
  if (startBtn) { startBtn.disabled = true; startBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;" aria-hidden="true"></div> Reflecting...'; }

  let result;
  try {
    result = await withTimeout(analyzeForMode(activeMode, imageData), ANALYSIS_TIMEOUT_MS);
    if (!result || typeof result !== 'object' || result.error || (result.overallScore == null && !result.results)) {
      const err = new Error("The check-in didn't return a usable result. Try a clearer photo.");
      err.userFacing = true;
      throw err;
    }
  } catch (err) {
    console.warn('[BodyScanner] Analysis failed:', err?.message || err);
    showAnalysisError(err, previewUrl, altText);
    return;
  }

  resetStartButton();
  await saveScanToHistory(result);
  showAnalysisResults(result, previewUrl, altText);
  fetchAndRenderDelta(activeMode, result.overallScore);
}

async function saveScanToHistory(result) {
  let saved = false;
  try {
    await bodyScans.log({
      type: activeMode,
      overallScore: result.overallScore,
      results: result.results || result,
      recommendations: result.recommendations,
      riskTier: null,
    });
    saved = true;
  } catch (dbErr) {
    console.warn('[BodyScanner] Failed to save check-in:', dbErr?.message || dbErr);
  }

  // Long-term biomarker history (powers the "vs previous" comparison).
  try {
    const { supabase } = await import('../../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      const res = await apiFetch('/api/biomarker-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, scanType: activeMode, score: result.overallScore, riskTier: null, result }),
      });
      if (!res.ok) throw new Error(`history save failed (${res.status})`);
    }
  } catch (histErr) {
    console.warn('[BodyScanner] Failed to save history:', histErr?.message || histErr);
    if (!saved) showToast("Couldn't save this check-in to your history.");
  }
}

function showAnalysisError(err, previewUrl, altText) {
  const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
  const reason = timedOut
    ? 'It took too long to get a response. Check your connection and try again.'
    : (err?.userFacing && err.message) ? err.message
    : "Something went wrong while looking at your photo. You can try again with the same photo, or start over.";

  const viewfinder = document.getElementById('viewfinder');
  if (viewfinder) {
    viewfinder.innerHTML = `
      <img src="${esc(previewUrl)}" alt="${esc(altText)}" class="w-full" style="height:100%;object-fit:cover;opacity:0.6;">
      <div class="scanner-status" role="status"><div class="scanner-status-dot amber"></div><span>Not completed</span></div>`;
  }
  resetStartButton();

  const resultsDiv = document.getElementById('scan-results');
  if (!resultsDiv) return;
  resultsDiv.classList.remove('hidden');
  resultsDiv.innerHTML = `
    <div class="empty-state card mt-4" role="alert">
      <h2 class="h3">Couldn't finish this check-in</h2>
      <p>${esc(reason)} Nothing was saved.</p>
      <div class="flex gap-2 flex-wrap justify-center">
        ${err?.upgradeRequired ? '' : '<button type="button" class="btn btn-sm btn-primary" id="scan-retry">Try again</button>'}
        <button type="button" class="btn btn-sm" id="scan-restart">Start over</button>
      </div>
    </div>`;
  resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('scan-retry')?.addEventListener('click', () => {
    if (lastAnalysis) runAnalysis(lastAnalysis.imageData, lastAnalysis.previewUrl, lastAnalysis.altText);
  });
  document.getElementById('scan-restart')?.addEventListener('click', () => renderBodyScanner());
}

function showAnalysisResults(result, previewUrl, altText) {
  const resultsDiv = document.getElementById('scan-results');
  resultsDiv.classList.remove('hidden');

  const viewfinder = document.getElementById('viewfinder');
  if (viewfinder && previewUrl) {
    viewfinder.innerHTML = `
      <img src="${esc(previewUrl)}" alt="${esc(altText || 'Your photo')}" class="w-full" style="height:100%;object-fit:cover;">
      <div style="position:absolute;top:var(--space-3);right:var(--space-3);">
        <div class="badge badge-green">${icons.check} Complete</div>
      </div>`;
  }

  const m = MODES.find(x => x.id === activeMode) || MODES[1];
  let html;

  switch (activeMode) {
    case 'face': html = renderFaceResults(result, m); break;
    case 'tongue': html = renderTongueResults(result, m); break;
    case 'body': html = renderBodyResults(result, m); break;
    default: html = renderGenericResults(result, m);
  }

  resultsDiv.innerHTML = `
    <div class="stagger-children flex-col gap-4 mt-4">
      <div id="scan-delta-card"></div>
      ${html}
      <p class="disclaimer">Wellness observations only — not medical advice and not a diagnosis. These reflections come from a photo and an AI model; they can be wrong. Talk to a licensed provider about any health concern.</p>
      <button type="button" class="btn btn-primary btn-block mb-4" id="new-scan-btn">New Check-In</button>
    </div>`;

  resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('new-scan-btn')?.addEventListener('click', () => renderBodyScanner());
}

// ═══════════════════════════════════════════════════
//  UI Helpers
// ═══════════════════════════════════════════════════

function updateQualityIndicators(imageData) {
  const bar = document.getElementById('quality-bar');
  if (!bar) return;
  const quality = QualityGate.assess(imageData);
  const face = QualityGate.detectFaceRegion(imageData);
  const dot = (pass) => pass ? 'green' : 'red';
  bar.innerHTML = `
    <div class="quality-dot"><div class="scanner-status-dot ${dot(quality.blur.pass)}"></div>${esc(quality.blur.label)}</div>
    <div class="quality-dot"><div class="scanner-status-dot ${dot(quality.exposure.pass)}"></div>${esc(quality.exposure.label)}</div>
    ${activeMode === 'face' || activeMode === 'heart' ? `<div class="quality-dot"><div class="scanner-status-dot ${dot(face.detected)}"></div>${face.detected ? 'Face OK' : 'No face'}</div>` : ''}
  `;
  const statusEl = document.getElementById('scanner-status');
  if (statusEl && activeMode !== 'heart') {
    const allPass = quality.pass && (activeMode !== 'face' || face.detected);
    updateStatus(statusEl, allPass ? 'green' : 'amber', allPass ? 'Ready — tap Capture' : 'Adjust position or lighting');
  }
}

// Status text is throttled: the live region only changes when the message does.
function updateStatus(el, color, text) {
  if (!el) return;
  if (el.dataset.msg === text) return;
  el.dataset.msg = text;
  el.innerHTML = `<div class="scanner-status-dot ${color} ${color === 'red' ? 'pulse' : ''}"></div><span>${esc(text)}</span>`;
}
