// Body Check-In — observational wellness reflections from the camera or a photo.
// Modes: Pulse (rPPG), Face, Tongue, Body/posture.
//
// Honesty rules for this page:
//  - Nothing here detects, screens for, or assesses a condition. Copy stays
//    observational ("worth a look", "something to explore").
//  - If a value can't be measured (no usable pulse signal) the UI says so
//    instead of showing a number.
//  - Every AI/user-controlled string is escaped before it touches innerHTML.

import { icons } from '../icons.js';
import { esc } from '../utils/esc.js';
import { CameraSystem, QualityGate } from '../utils/camera-system.js';
import { RPPGEngine, analyzeFace, analyzeBodyComposition, analyzeTongue } from '../utils/biomarker-engine.js';
import { bodyScans, hrReadings } from '../lib/db.js';
import { apiFetch } from '../utils/api.js';
import { showToast } from '../utils/toast.js';

let activeMode = 'face';
let camera = null;
let rppgEngine = null;
let isScanning = false;
let lastAnalysis = null;   // { imageData, previewUrl, altText } — lets "Try again" re-run without re-capturing
let cleanupBound = false;

const MAX_IMAGE_EDGE = 1024;       // downscale uploads before getImageData
const ANALYSIS_TIMEOUT_MS = 50_000;
const HR_DURATION_MS = 15_000;

// Wellness-observation modes only. Disease/condition-inference modes are
// intentionally NOT exposed — they fall outside a general-wellness framing.
const MODES = [
  { id: 'heart', icon: icons.heart, label: 'Pulse', desc: 'Resting pulse estimate (camera)', guide: 'face', facingMode: 'user' },
  { id: 'face', icon: icons.user, label: 'Face', desc: 'Skin appearance reflection', guide: 'face', facingMode: 'user' },
  { id: 'tongue', icon: icons.droplet, label: 'Tongue', desc: 'Traditional wellness observations', guide: 'face', facingMode: 'user' },
  { id: 'body', icon: icons.body, label: 'Body', desc: 'Posture & proportion', guide: 'body', facingMode: 'environment' },
];

// Colour tokens — every coloured element also carries its meaning in text.
const TONE = {
  good: { color: 'var(--viz-green)', dim: 'var(--viz-green-dim)' },
  watch: { color: 'var(--viz-amber)', dim: 'var(--viz-amber-dim)' },
  note: { color: 'var(--error)', dim: 'var(--error-dim)' },
  neutral: { color: 'var(--text-tertiary)', dim: 'var(--surface-2)' },
};
const scoreTone = (score) => (score >= 80 ? TONE.good : score >= 55 ? TONE.watch : TONE.note);
const SEVERITY_TONE = { clear: TONE.good, none: TONE.good, intact: TONE.good, mild: TONE.watch, compromised_mild: TONE.watch, moderate: TONE.note, compromised_moderate: TONE.note, severe: TONE.note, compromised_severe: TONE.note };
const toneFor = (level) => SEVERITY_TONE[level] || TONE.neutral;

// Human-readable, escaped rendering of an AI enum/label ("dark_red" → "dark red").
const words = (v, fallback = '—') => (v == null || v === '' ? fallback : esc(String(v).replace(/_/g, ' ')));
const num = (v, fallback = '—') => (Number.isFinite(Number(v)) ? String(Math.round(Number(v))) : fallback);

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

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('This took too long to get a response.');
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
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
      <div class="card" style="text-align:center;padding:var(--space-8);" role="status" aria-live="polite">
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

      <div class="mode-selector" id="mode-selector" role="tablist" aria-label="Check-in type" style="display:flex;gap:var(--space-2);overflow-x:auto;padding-bottom:var(--space-2);">
        ${MODES.map(m => `
          <button type="button" role="tab" class="mode-card ${m.id === activeMode ? 'active' : ''}" data-mode="${m.id}" id="mode-tab-${m.id}" aria-selected="${m.id === activeMode}" aria-controls="scanner-area" style="flex-shrink:0;color:inherit;">
            <div class="mode-icon" aria-hidden="true">${m.icon}</div>
            <div class="mode-label">${esc(m.label)}</div>
          </button>
        `).join('')}
      </div>

      <div id="scanner-area" role="tabpanel" aria-labelledby="mode-tab-${activeMode}" style="margin-top:var(--space-4);">
        ${renderScannerForMode(activeMode)}
      </div>

      <div id="scan-results" class="hidden" aria-live="polite"></div>

      <p class="disclaimer" style="margin-top:var(--space-4);">Wellness observations only — <strong>not medical advice and not a diagnosis</strong>. VitalLens does not detect, screen for, or assess any disease or condition. Talk to a licensed healthcare provider about any health concern.</p>

      ${hrError
        ? `<div class="empty-state card" role="alert" style="margin-top:var(--space-4);"><h3>Couldn't load your pulse trend</h3><p>Check your connection and try again. Your readings are safe.</p><button type="button" class="btn btn-sm" id="history-retry-hr">Try again</button></div>`
        : (recentHR.length >= 2 ? renderHRTrend(recentHR) : '')}

      <div class="section-heading" style="margin-top:var(--space-5);">
        <h3>Check-In History</h3>
        ${historyError ? '' : `<span class="badge badge-purple">${history.length}</span>`}
      </div>
      <div id="scan-history" style="display:flex;flex-direction:column;gap:var(--space-3);">
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

function renderScannerForMode(mode) {
  const m = MODES.find(x => x.id === mode) || MODES[1];
  const instructions = getInstructions(mode);

  if (mode === 'heart') {
    return `
      <div class="card" style="padding:0;overflow:hidden;">
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
      <div class="card" style="margin-top:var(--space-3);">
        <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-3);">
          <span style="color:var(--accent);" aria-hidden="true">${icons.heart}</span>
          <div><h4>Pulse estimate</h4><p style="font-size:var(--text-xs);color:var(--text-tertiary);">${esc(instructions)}</p></div>
        </div>
        <div id="hr-live-display" style="display:none;text-align:center;padding:var(--space-4) 0;">
          <div class="hr-display" style="justify-content:center;">
            <div class="hr-pulse" style="color:var(--accent);" aria-hidden="true">${icons.heart}</div>
            <div><div class="hr-value" id="hr-value">--</div><div class="hr-label">BPM</div></div>
          </div>
          <div style="margin-top:var(--space-3);">
            <div class="progress-bar" style="height:6px;" aria-hidden="true"><div class="progress-fill" id="hr-progress" style="width:0%;background:var(--error);"></div></div>
            <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-2);" id="hr-status-text" role="status" aria-live="polite">Recording...</p>
          </div>
        </div>
        <button type="button" class="btn btn-primary btn-block" id="start-scan-btn">
          ${icons.camera} Start Pulse Check
        </button>
      </div>`;
  }

  return `
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="scanner-viewfinder" id="viewfinder">
        <div class="scanner-guide-overlay" aria-hidden="true"><div class="guide-${m.guide}"></div></div>
        <div class="quality-bar" id="quality-bar" aria-hidden="true"></div>
        <div class="scanner-status" id="scanner-status" role="status" aria-live="polite">
          <div class="scanner-status-dot amber"></div>
          <span>Ready when you are</span>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:var(--space-3);">
      <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-3);">
        <span style="font-size:24px;" aria-hidden="true">${m.icon}</span>
        <div><h4>${esc(m.label)}</h4><p style="font-size:var(--text-xs);color:var(--text-tertiary);">${esc(instructions)}</p></div>
      </div>
      <div style="display:flex;gap:var(--space-3);">
        <button type="button" class="btn btn-primary" id="start-scan-btn" style="flex:1;">
          ${icons.camera} Start Camera
        </button>
        <button type="button" class="btn btn-secondary" id="upload-btn" style="flex:1;">
          ${icons.upload} Upload Photo
        </button>
        <label for="upload-input" class="visually-hidden">Choose a photo to upload</label>
        <input type="file" accept="image/*" id="upload-input" class="visually-hidden" tabindex="-1">
      </div>
    </div>`;
}

function getInstructions(mode) {
  const map = {
    heart: 'Hold your face still in the oval for 15 seconds. Even lighting, no movement.',
    face: 'Position your face in the oval with good, even lighting. Remove glasses and keep a neutral expression.',
    tongue: 'Open your mouth and extend your tongue fully. Good lighting, camera level with your mouth.',
    body: 'Stand upright with your full body visible. Use the rear camera. Front and side views help.',
  };
  return map[mode] || '';
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

function attachScanHandlers() {
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

async function startCameraScan() {
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
      await bodyScans.log({ type: 'heart', overallScore: result.confidence, hr: result.hr, hrv: result.hrv, confidence: result.confidence, quality: result.quality });
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

function showHeartRateUnmeasured(result) {
  const resultsDiv = document.getElementById('scan-results');
  if (!resultsDiv) return;
  resultsDiv.classList.remove('hidden');
  const reason = result?.reason || 'No steady pulse rhythm was found in the video';
  resultsDiv.innerHTML = `
    <div class="empty-state card" role="alert" style="margin-top:var(--space-4);">
      <h3>Couldn't measure a pulse</h3>
      <p>${esc(reason)}. Nothing was saved. Try again in even lighting with your face steady inside the oval — camera-based readings are sensitive to movement and shadows.</p>
      <button type="button" class="btn btn-sm btn-primary" id="hr-retry">Try again</button>
    </div>`;
  resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('hr-retry')?.addEventListener('click', () => {
    resultsDiv.classList.add('hidden');
    resultsDiv.innerHTML = '';
    const area = document.getElementById('scanner-area');
    if (area) area.innerHTML = renderScannerForMode(activeMode);
    attachScanHandlers();
    startCameraScan();
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
    <img src="${esc(previewUrl)}" alt="${esc(altText)}" style="width:100%;height:100%;object-fit:cover;">
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
    const { supabase } = await import('../lib/supabase.js');
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
      <img src="${esc(previewUrl)}" alt="${esc(altText)}" style="width:100%;height:100%;object-fit:cover;opacity:0.6;">
      <div class="scanner-status" role="status"><div class="scanner-status-dot amber"></div><span>Not completed</span></div>`;
  }
  resetStartButton();

  const resultsDiv = document.getElementById('scan-results');
  if (!resultsDiv) return;
  resultsDiv.classList.remove('hidden');
  resultsDiv.innerHTML = `
    <div class="empty-state card" role="alert" style="margin-top:var(--space-4);">
      <h3>Couldn't finish this check-in</h3>
      <p>${esc(reason)} Nothing was saved.</p>
      <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;justify-content:center;">
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

// ═══════════════════════════════════════════════════
//  Results Display
// ═══════════════════════════════════════════════════

async function fetchAndRenderDelta(scanType, currentScore) {
  const deltaCard = document.getElementById('scan-delta-card');
  if (!deltaCard) return;
  const m = MODES.find(x => x.id === scanType);
  const modeLabel = m ? m.label : scanType;

  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;

    const res = await apiFetch(`/api/biomarker-history/latest?userId=${encodeURIComponent(user.id)}&type=${encodeURIComponent(scanType)}`);
    if (!res.ok) throw new Error(`history request failed (${res.status})`);
    const { previous } = await res.json();

    // `latest` is the check-in just saved — `previous` is the one before it.
    if (!previous || !Number.isFinite(Number(previous.score))) {
      deltaCard.innerHTML = `
        <div class="card card-sm" style="border-left:3px solid var(--viz-green);background:var(--viz-green-dim);">
          <div style="font-size:var(--text-xs);color:var(--text-secondary);font-weight:600;">First ${esc(modeLabel.toLowerCase())} check-in saved — next time you'll see how it compares.</div>
        </div>`;
      return;
    }

    const prevScore = Math.round(Number(previous.score));
    const delta = Math.round(Number(currentScore)) - prevScore;
    const tone = delta > 0 ? TONE.good : delta < 0 ? TONE.watch : TONE.neutral;
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
    const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'unchanged';
    const prevDate = previous.scanned_at ? new Date(previous.scanned_at).toLocaleDateString() : 'earlier';

    deltaCard.innerHTML = `
      <div class="card card-sm" style="border-left:3px solid ${tone.color};">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:2px;">vs your previous ${esc(modeLabel.toLowerCase())} check-in · ${esc(prevDate)}</div>
            <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">
              Score: <span style="color:${tone.color};font-weight:700;">${deltaStr} points</span> — ${direction}
            </div>
          </div>
          <div style="display:flex;gap:var(--space-3);align-items:center;">
            <div style="text-align:center;">
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);">Previous</div>
              <div style="font-family:var(--font-heading);font-size:var(--text-lg);font-weight:700;color:var(--text-secondary);">${prevScore}</div>
            </div>
            <div style="color:var(--text-tertiary);" aria-hidden="true">→</div>
            <div style="text-align:center;">
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);">Now</div>
              <div style="font-family:var(--font-heading);font-size:var(--text-lg);font-weight:700;color:${tone.color};">${num(currentScore)}</div>
            </div>
          </div>
        </div>
      </div>`;
  } catch (e) {
    console.warn('[ScanDelta] Failed to load comparison:', e?.message || e);
    deltaCard.innerHTML = `
      <div class="empty-state card card-sm" role="alert" style="padding:var(--space-3);">
        <h3 style="font-size:var(--text-sm);">Couldn't compare with your previous check-in</h3>
        <p style="font-size:var(--text-xs);">Your result below is saved. Check your connection to load the comparison.</p>
        <button type="button" class="btn btn-sm" id="delta-retry">Try again</button>
      </div>`;
    document.getElementById('delta-retry')?.addEventListener('click', () => fetchAndRenderDelta(scanType, currentScore));
  }
}

function showAnalysisResults(result, previewUrl, altText) {
  const resultsDiv = document.getElementById('scan-results');
  resultsDiv.classList.remove('hidden');

  const viewfinder = document.getElementById('viewfinder');
  if (viewfinder && previewUrl) {
    viewfinder.innerHTML = `
      <img src="${esc(previewUrl)}" alt="${esc(altText || 'Your photo')}" style="width:100%;height:100%;object-fit:cover;">
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
    <div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);margin-top:var(--space-4);">
      <div id="scan-delta-card"></div>
      ${html}
      <p class="disclaimer">Wellness observations only — not medical advice and not a diagnosis. These reflections come from a photo and an AI model; they can be wrong. Talk to a licensed provider about any health concern.</p>
      <button type="button" class="btn btn-primary btn-block" id="new-scan-btn" style="margin-bottom:var(--space-4);">New Check-In</button>
    </div>`;

  resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('new-scan-btn')?.addEventListener('click', () => renderBodyScanner());
}

function renderScoreHeader(m, score, caption, badges = '') {
  const tone = scoreTone(Number(score));
  return `
    <div class="card" style="text-align:center;">
      <h3 style="margin-bottom:var(--space-2);">${esc(m.label)} Check-In</h3>
      <div style="font-family:var(--font-heading);font-size:var(--text-4xl);font-weight:var(--weight-extrabold);color:${tone.color};">${num(score)}</div>
      <p style="font-size:var(--text-sm);color:var(--text-secondary);">${esc(caption)} <span style="color:var(--text-tertiary);">(out of 100)</span></p>
      ${badges}
    </div>`;
}

function statTile(label, value, color) {
  return `
    <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
      <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:2px;">${esc(label)}</div>
      <div style="font-size:var(--text-sm);font-weight:600;${color ? `color:${color};` : ''}">${value}</div>
    </div>`;
}

// ─── Face Results ─────────────────────────────────

function renderFaceResults(r, m) {
  const zones = r.zones || {};
  const zoneOrder = ['forehead', 'glabella', 'nose_tzone', 'left_cheek', 'right_cheek', 'chin_jawline', 'temples', 'perioral', 'periorbital'];
  const zoneLabels = { forehead: 'Forehead', glabella: 'Between Brows', nose_tzone: 'Nose / T-Zone', left_cheek: 'Left Cheek', right_cheek: 'Right Cheek', chin_jawline: 'Chin & Jawline', temples: 'Temples', perioral: 'Around the Mouth', periorbital: 'Under-Eye' };

  const badges = `
      <div style="display:flex;justify-content:center;gap:var(--space-2);margin-top:var(--space-3);flex-wrap:wrap;">
        ${r.hydration ? `<span class="badge badge-teal">${words(r.hydration)} skin</span>` : ''}
        ${r.primary_breakout_type && r.primary_breakout_type !== 'none' ? `<span class="badge badge-amber">${words(r.primary_breakout_type)} pattern noted</span>` : '<span class="badge badge-green">No breakout pattern noted</span>'}
      </div>`;

  return `
    ${renderScoreHeader(m, r.overallScore, 'Skin appearance score', badges)}

    <!-- Skin profile -->
    ${r.fitzpatrick_type ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Skin Profile</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-bottom:var(--space-3);">
        ${statTile('Fitzpatrick Type', `Type ${words(r.fitzpatrick_type)}`, 'var(--viz-green)')}
        ${statTile('Skin Barrier', words(r.skin_barrier, 'unknown'), toneFor(r.skin_barrier).color)}
        ${statTile('Collagen', words(r.collagen_density_estimate))}
        ${statTile('Texture', words(r.skin_texture))}
      </div>
      ${r.fitzpatrick_notes ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;margin-bottom:var(--space-2);">${esc(r.fitzpatrick_notes)}</p>` : ''}
      ${r.skin_barrier_notes ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;">${esc(r.skin_barrier_notes)}</p>` : ''}
    </div>` : ''}

    <!-- Structure notes -->
    ${(r.forehead_lines || r.nasolabial_folds || r.jowling || r.temporal_hollowing) ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Structure Notes</h4>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);">
        ${r.forehead_lines ? `
        <div style="padding:var(--space-2) 0;border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:var(--text-xs);color:var(--text-secondary);">Forehead Lines</span>
            <span style="font-size:var(--text-xs);font-weight:600;">Horizontal: ${words(r.forehead_lines.horizontal)} · Vertical: ${words(r.forehead_lines.vertical_glabellar)}</span>
          </div>
          ${r.forehead_lines.wellness_note ? `<p style="font-size:var(--text-xs);color:var(--text-tertiary);">${esc(r.forehead_lines.wellness_note)}</p>` : ''}
        </div>` : ''}
        ${r.nasolabial_folds ? `
        <div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px solid var(--border);">
          <span style="font-size:var(--text-xs);color:var(--text-secondary);">Smile Lines</span>
          <span style="font-size:var(--text-xs);font-weight:600;">${words(r.nasolabial_folds)}</span>
        </div>` : ''}
        ${r.jowling ? `
        <div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px solid var(--border);">
          <span style="font-size:var(--text-xs);color:var(--text-secondary);">Jawline Softness</span>
          <span style="font-size:var(--text-xs);font-weight:600;">${words(r.jowling)}</span>
        </div>` : ''}
        ${r.temporal_hollowing ? `
        <div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;">
          <span style="font-size:var(--text-xs);color:var(--text-secondary);">Temple Fullness</span>
          <span style="font-size:var(--text-xs);font-weight:600;">${words(r.temporal_hollowing)}</span>
        </div>` : ''}
      </div>
    </div>` : ''}

    <!-- Facial zones -->
    ${Object.keys(zones).length > 0 ? `
    <div class="section-heading"><h3>Facial Zones</h3></div>
    ${zoneOrder.filter(z => zones[z] && typeof zones[z] === 'object').map(z => {
      const zone = zones[z];
      const sev = zone.severity || (zone.dark_circles && zone.dark_circles !== 'none' ? zone.dark_circles : 'clear');
      const tone = toneFor(sev);
      // The under-eye zone has a different shape.
      if (z === 'periorbital') {
        return `
        <div class="card card-sm" style="border-left:3px solid ${toneFor(zone.dark_circles || 'clear').color};">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2);">
            <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${esc(zoneLabels[z])}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-bottom:var(--space-2);">
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">Dark circles: <strong>${words(zone.dark_circles)}</strong>${zone.dark_circle_tone && zone.dark_circle_tone !== 'none' ? ` (${words(zone.dark_circle_tone)})` : ''}</div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">Puffiness: <strong>${words(zone.puffiness)}</strong></div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">Fine lines: <strong>${words(zone.fine_lines)}</strong></div>
          </div>
          ${zone.wellness_signal ? `<p style="font-size:var(--text-xs);color:var(--viz-green);">${esc(zone.wellness_signal)}</p>` : ''}
        </div>`;
      }
      return `
      <div class="card card-sm" style="border-left:3px solid ${tone.color};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-2);">
          <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${esc(zoneLabels[z])}</div>
          <span style="font-size:var(--text-xs);padding:1px 6px;border-radius:4px;background:${tone.dim};color:${tone.color};font-weight:600;">${words(sev)}</span>
        </div>
        <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;margin-bottom:var(--space-1);">${esc(zone.condition || '')}</p>
        ${zone.wellness_signal ? `<p style="font-size:var(--text-xs);color:var(--viz-green);">${esc(zone.wellness_signal)}</p>` : ''}
        ${zone.possible_system ? `<p style="font-size:var(--text-xs);color:var(--viz-green);">${esc(zone.possible_system)}</p>` : ''}
      </div>`;
    }).join('')}` : ''}

    <!-- Skin tone notes -->
    ${r.discoloration && typeof r.discoloration === 'object' && Object.values(r.discoloration).some(v => v === true) ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Skin Tone Notes</h4>
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);">
        ${Object.entries(r.discoloration).filter(([, v]) => v === true).map(([k]) =>
          `<span style="font-size:var(--text-xs);padding:4px 10px;border-radius:var(--radius-full);background:var(--viz-amber-dim);color:var(--viz-amber);">${words(k)}</span>`
        ).join('')}
        ${r.discoloration.hyperpigmentation_pattern && r.discoloration.hyperpigmentation_pattern !== 'none' ? `<span style="font-size:var(--text-xs);padding:4px 10px;border-radius:var(--radius-full);background:var(--viz-amber-dim);color:var(--viz-amber);">${words(r.discoloration.hyperpigmentation_pattern)}</span>` : ''}
      </div>
    </div>` : ''}

    ${renderSignals(r.wellness_signals, 'Wellness Signals')}

    <!-- Other notes -->
    ${(r.eyebrow_notes && r.eyebrow_notes !== 'normal') || (r.lip_notes && r.lip_notes !== 'normal') || (r.facial_puffiness && r.facial_puffiness !== 'none') || (r.facial_symmetry && r.facial_symmetry !== 'normal') ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Other Notes</h4>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);">
        ${r.eyebrow_notes && r.eyebrow_notes !== 'normal' ? `<div style="display:flex;justify-content:space-between;"><span style="font-size:var(--text-xs);color:var(--text-secondary);">Eyebrows</span><span style="font-size:var(--text-xs);font-weight:600;color:var(--viz-amber);">${words(r.eyebrow_notes)}</span></div>` : ''}
        ${r.lip_notes && r.lip_notes !== 'normal' ? `<div style="display:flex;justify-content:space-between;"><span style="font-size:var(--text-xs);color:var(--text-secondary);">Lips</span><span style="font-size:var(--text-xs);font-weight:600;color:var(--viz-amber);">${words(r.lip_notes)}</span></div>` : ''}
        ${r.facial_puffiness && r.facial_puffiness !== 'none' ? `<div style="display:flex;justify-content:space-between;"><span style="font-size:var(--text-xs);color:var(--text-secondary);">Facial Puffiness</span><span style="font-size:var(--text-xs);font-weight:600;color:var(--viz-amber);">${words(r.facial_puffiness)}</span></div>` : ''}
        ${r.facial_symmetry && r.facial_symmetry !== 'normal' ? `<div style="display:flex;justify-content:space-between;"><span style="font-size:var(--text-xs);color:var(--text-secondary);">Symmetry</span><span style="font-size:var(--text-xs);font-weight:600;">${words(r.facial_symmetry)}</span></div>` : ''}
      </div>
    </div>` : ''}

    ${renderRecommendations(r.recommendations)}`;
}

// ─── Tongue Results ───────────────────────────────

function renderTongueResults(r, m) {
  const bodyTone = { pale: TONE.neutral, pale_pink: TONE.neutral, normal_pink_red: TONE.good, red: TONE.watch, dark_red: TONE.watch, purple: TONE.watch, bluish: TONE.watch, mixed: TONE.watch };
  const body = r.body && typeof r.body === 'object' ? r.body : null;
  const coating = r.coating && typeof r.coating === 'object' ? r.coating : null;
  const tcm = r.tcm_interpretation && typeof r.tcm_interpretation === 'object' ? r.tcm_interpretation : null;

  return `
    ${renderScoreHeader(m, r.overallScore, 'Tongue observation score')}

    ${body ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Tongue Body</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-bottom:var(--space-3);">
        ${statTile('Color', words(body.color), (bodyTone[body.color] || TONE.neutral).color)}
        ${statTile('Size', words(body.size))}
        ${statTile('Moisture', words(body.moisture))}
        ${statTile('Teeth Marks', body.teeth_marks ? 'Present' : 'None noted')}
      </div>
      ${body.color_significance ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);">${esc(body.color_significance)}</p>` : ''}
      ${body.cracks?.present ? `
      <div style="margin-top:var(--space-2);padding:var(--space-2);background:var(--viz-amber-dim);border-radius:var(--radius-md);">
        <p style="font-size:var(--text-xs);color:var(--viz-amber);font-weight:600;">Cracks noted${Array.isArray(body.cracks.locations) && body.cracks.locations.length ? `: ${esc(body.cracks.locations.join(', '))}` : ''}</p>
        ${body.cracks.significance ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;">${esc(body.cracks.significance)}</p>` : ''}
      </div>` : ''}
    </div>` : ''}

    ${coating ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Tongue Coating</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);">
        ${statTile('Thickness', words(coating.thickness))}
        ${statTile('Color', words(coating.color))}
        ${statTile('Distribution', words(coating.distribution))}
        ${statTile('Texture', words(coating.texture))}
      </div>
      ${coating.coating_significance ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:var(--space-2);">${esc(coating.coating_significance)}</p>` : ''}
    </div>` : ''}

    ${tcm ? `
    <div class="card" style="border-left:3px solid var(--viz-green);">
      <h4 style="margin-bottom:var(--space-2);">Traditional (TCM) Pattern</h4>
      <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:var(--space-2);">A cultural framework for reflection, not a medical finding.</p>
      ${tcm.primary_pattern ? `<p style="font-size:var(--text-sm);font-weight:var(--weight-semibold);margin-bottom:var(--space-2);">${esc(tcm.primary_pattern)}</p>` : ''}
      ${Array.isArray(tcm.organ_systems_implicated) && tcm.organ_systems_implicated.length > 0 ? `
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-1);margin-bottom:var(--space-2);">
        ${tcm.organ_systems_implicated.map(o =>
    `<span style="font-size:var(--text-xs);padding:2px 8px;border-radius:4px;background:var(--viz-green-dim);color:var(--viz-green);">${esc(o)}</span>`
  ).join('')}
      </div>` : ''}
      ${tcm.element_imbalance ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);">${esc(tcm.element_imbalance)}</p>` : ''}
    </div>` : ''}

    ${Array.isArray(r.nutritional_deficiency_flags) && r.nutritional_deficiency_flags.length > 0 ? `
    <div class="card card-sm" style="border-left:3px solid var(--viz-amber);">
      <h4 style="margin-bottom:var(--space-2);">Nutrition — something to explore</h4>
      ${r.nutritional_deficiency_flags.map(d =>
    `<div style="font-size:var(--text-xs);color:var(--text-secondary);padding:var(--space-1) 0;">• ${esc(typeof d === 'string' ? d : d?.text || d?.nutrient || '')}</div>`
  ).join('')}
    </div>` : ''}

    ${renderSignals(r.systemic_flags, 'Wellness Signals')}
    ${renderRecommendations(r.recommendations)}`;
}

// ─── Body Results ─────────────────────────────────

function renderBodyResults(r, m) {
  const posture = r.posture && typeof r.posture === 'object' ? r.posture : null;
  const postureScore = Number(posture?.overall_posture_score ?? r.overallScore);
  const postureTone = scoreTone(postureScore);
  const imbalanceTone = { none: TONE.good, mild: TONE.watch, moderate: TONE.note, significant: TONE.note };
  const comp = r.body_composition && typeof r.body_composition === 'object' ? r.body_composition : null;
  const lymph = r.lymphatic_signals && typeof r.lymphatic_signals === 'object' ? r.lymphatic_signals : null;
  const sym = r.symmetry && typeof r.symmetry === 'object' ? r.symmetry : null;
  const muscle = r.muscle_imbalance && typeof r.muscle_imbalance === 'object' ? r.muscle_imbalance : null;
  const apt = r.anterior_pelvic_tilt && typeof r.anterior_pelvic_tilt === 'object' ? r.anterior_pelvic_tilt : null;
  const breathing = r.breathing_pattern && typeof r.breathing_pattern === 'object' ? r.breathing_pattern : null;

  const skip = (v, ...neutral) => !v || neutral.includes(v) || v === 'cannot_assess';

  return `
    ${renderScoreHeader(m, r.overallScore, 'Wellness score')}

    ${posture ? `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3);">
        <h4>Posture Notes</h4>
        ${posture.overall_rating ? `<span style="font-family:var(--font-heading);font-weight:700;color:${postureTone.color};">${words(posture.overall_rating)}</span>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-1);">
        ${[
          { label: 'Head Position', value: posture.head_position },
          { label: 'Shoulders', value: posture.shoulder_position },
          { label: 'Shoulder Level', value: posture.shoulder_level },
          { label: 'Shoulder Blades', value: posture.scapular_position },
          { label: 'Spine', value: posture.spinal_pattern },
          { label: 'Side-to-side Curve', value: posture.lateral_curve_type },
          { label: 'Pelvis', value: posture.pelvic_position },
          { label: 'Knees', value: posture.knee_alignment },
          { label: 'Feet', value: posture.foot_position },
        ].filter(i => !skip(i.value, 'neutral', 'even', 'none')).map(item => `
        <div style="display:flex;justify-content:space-between;padding:var(--space-1) 0;border-bottom:1px solid var(--border);">
          <span style="font-size:var(--text-xs);color:var(--text-secondary);">${esc(item.label)}</span>
          <span style="font-size:var(--text-xs);font-weight:600;">${words(item.value)}</span>
        </div>`).join('')}
      </div>
      ${posture.primary_observation ? `<p style="font-size:var(--text-xs);color:var(--viz-amber);margin-top:var(--space-3);">${esc(posture.primary_observation)}</p>` : ''}
    </div>` : ''}

    ${apt?.present ? `
    <div class="card card-sm" style="border-left:3px solid var(--viz-amber);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2);">
        <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">Forward Pelvic Tilt</span>
        ${apt.severity ? `<span style="font-size:var(--text-xs);padding:1px 6px;border-radius:4px;background:var(--viz-amber-dim);color:var(--viz-amber);">${words(apt.severity)}</span>` : ''}
      </div>
      ${apt.functional_note ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);">${esc(apt.functional_note)}</p>` : ''}
      ${Array.isArray(apt.indicators_observed) && apt.indicators_observed.length > 0 ? `<p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:4px;">${esc(apt.indicators_observed.join(' · '))}</p>` : ''}
    </div>` : ''}

    ${muscle ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Muscle Balance Notes</h4>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);">
        ${[
          { label: 'Forward head / rounded shoulders', value: muscle.upper_crossed_syndrome },
          { label: 'Pelvic tilt pattern', value: muscle.lower_crossed_syndrome },
          { label: 'Dominant Side', value: muscle.dominant_side_hypertrophy },
          { label: 'Apparent leg length difference', value: muscle.apparent_leg_length_difference },
        ].filter(i => !skip(i.value, 'none')).map(item => `
        <div style="display:flex;justify-content:space-between;padding:var(--space-1) 0;border-bottom:1px solid var(--border);">
          <span style="font-size:var(--text-xs);color:var(--text-secondary);">${esc(item.label)}</span>
          <span style="font-size:var(--text-xs);font-weight:600;color:${(imbalanceTone[item.value] || TONE.neutral).color};">${words(item.value)}</span>
        </div>`).join('')}
      </div>
      ${muscle.notes ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:var(--space-2);">${esc(muscle.notes)}</p>` : ''}
    </div>` : ''}

    ${breathing?.observable ? `
    <div class="card card-sm">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">Breathing Pattern</span>
        <span style="font-size:var(--text-xs);font-weight:600;color:${breathing.pattern === 'diaphragmatic' ? 'var(--viz-green)' : 'var(--viz-amber)'};">${words(breathing.pattern)}</span>
      </div>
      ${breathing.wellness_note ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:var(--space-1);">${esc(breathing.wellness_note)}</p>` : ''}
    </div>` : ''}

    ${comp ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Build Notes</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);">
        ${statTile('Build Type', words(comp.build_type))}
        ${statTile('Weight Distribution', words(comp.fat_distribution))}
        ${statTile('Muscle Development', words(comp.muscle_development))}
        ${statTile('Upper-body weight pattern', comp.android_pattern_present ? 'Noted' : 'Not noted', comp.android_pattern_present ? 'var(--viz-amber)' : 'var(--viz-green)')}
      </div>
      ${comp.metabolic_note ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:var(--space-2);">${esc(comp.metabolic_note)}</p>` : ''}
    </div>` : ''}

    ${lymph && Object.entries(lymph).some(([k, v]) => k !== 'wellness_note' && v && v !== 'none') ? `
    <div class="card card-sm">
      <h4 style="margin-bottom:var(--space-2);">Puffiness Notes</h4>
      <div style="display:flex;flex-direction:column;gap:var(--space-1);">
        ${[
          { label: 'Ankles', value: lymph.ankle_puffiness },
          { label: 'Hands', value: lymph.hand_puffiness },
          { label: 'General', value: lymph.general_puffiness },
        ].filter(i => !skip(i.value, 'none')).map(item => `
        <div style="display:flex;justify-content:space-between;">
          <span style="font-size:var(--text-xs);color:var(--text-secondary);">${esc(item.label)}</span>
          <span style="font-size:var(--text-xs);font-weight:600;color:var(--viz-amber);">${words(item.value)}</span>
        </div>`).join('')}
      </div>
      ${lymph.wellness_note ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:var(--space-2);">${esc(lymph.wellness_note)}</p>` : ''}
    </div>` : ''}

    ${sym && sym.overall && sym.overall !== 'symmetric' ? `
    <div class="card card-sm">
      <h4 style="margin-bottom:var(--space-2);">Symmetry</h4>
      <div style="display:flex;flex-direction:column;gap:var(--space-1);">
        ${[
          { label: 'Overall', value: sym.overall },
          { label: 'Shoulders', value: sym.shoulder_level },
          { label: 'Hips', value: sym.hip_level },
        ].filter(i => !skip(i.value, 'even', 'symmetric')).map(item => `
        <div style="display:flex;justify-content:space-between;">
          <span style="font-size:var(--text-xs);color:var(--text-secondary);">${esc(item.label)}</span>
          <span style="font-size:var(--text-xs);font-weight:600;">${words(item.value)}</span>
        </div>`).join('')}
      </div>
    </div>` : ''}

    ${Array.isArray(r.wellness_observations) && r.wellness_observations.length > 0 ? `
    <div class="section-heading"><h3>Wellness Observations</h3></div>
    ${r.wellness_observations.map(obs => `
      <div class="card card-sm" style="border-left:3px solid var(--text-tertiary);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-1);">
          <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${esc(obs?.finding || '')}</span>
        </div>
        ${obs?.location ? `<p style="font-size:var(--text-xs);color:var(--text-tertiary);">Location: ${esc(obs.location)}</p>` : ''}
        <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;">${esc(obs?.significance || '')}</p>
      </div>`).join('')}` : ''}

    ${renderSignals(r.visible_health_flags || r.systemic_flags, 'Wellness Signals')}
    ${renderRecommendations(r.recommendations)}`;
}

// ─── Shared render helpers ────────────────────────

function renderSignals(flags, heading) {
  if (!Array.isArray(flags) || !flags.length) return '';
  return `
    <div class="section-heading"><h3>${esc(heading)}</h3></div>
    ${flags.map(flag => {
    const label = typeof flag === 'string' ? flag : (flag?.indicator || flag?.finding || '');
    const detail = typeof flag === 'string' ? '' : (flag?.significance || '');
    const confidence = typeof flag === 'object' ? flag?.confidence : null;
    return `
      <div class="card card-sm" style="border-left:3px solid var(--text-tertiary);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-1);">
          <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${esc(label)}</span>
        </div>
        ${detail ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;">${esc(detail)}</p>` : ''}
        ${confidence ? `<p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-1);">Confidence: ${esc(confidence)}</p>` : ''}
      </div>`;
  }).join('')}`;
}

// Suggesting lab tests to "confirm or rule out" visual findings would be a
// clinical act, so `suggested_lab_tests` / `suggested_followup` from the
// model are intentionally never rendered.
function renderRecommendations(recs) {
  if (!Array.isArray(recs) || !recs.length) return '';
  const priorityTone = { high: TONE.watch, medium: TONE.watch, low: TONE.good };
  return `
    <div class="section-heading"><h3>Worth a Look</h3></div>
    ${recs.map(rec => {
    const text = typeof rec === 'string' ? rec : rec?.text || '';
    if (!text) return '';
    const priority = typeof rec === 'object' && rec?.priority ? String(rec.priority).toLowerCase() : null;
    const tone = priorityTone[priority] || TONE.good;
    return `
      <div class="card card-sm" style="border-left:3px solid ${tone.color};">
        ${priority ? `<span style="font-size:var(--text-xs);font-weight:600;text-transform:uppercase;color:${tone.color};">${esc(priority)} priority</span>` : ''}
        <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;${priority ? 'margin-top:4px;' : ''}">${esc(text)}</p>
      </div>`;
  }).join('')}`;
}

function renderGenericResults(r, m) {
  return `
    ${renderScoreHeader(m, r.overallScore, 'Wellness score')}
    ${renderRecommendations(r.recommendations)}`;
}

// ═══════════════════════════════════════════════════
//  Pulse Results
// ═══════════════════════════════════════════════════

function showHeartRateResults(result) {
  const resultsDiv = document.getElementById('scan-results');
  resultsDiv.classList.remove('hidden');

  const hr = Number(result.hr);
  const hrZone = hr < 60 ? 'Below typical resting' : hr < 100 ? 'Typical resting range' : hr < 140 ? 'Above typical resting' : 'Well above typical resting';
  const zoneTone = hr < 60 ? TONE.neutral : hr < 100 ? TONE.good : TONE.watch;
  const qualityClass = result.quality === 'Good' ? 'badge-green' : result.quality === 'Fair' ? 'badge-amber' : 'badge-coral';

  resultsDiv.innerHTML = `
    <div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);margin-top:var(--space-4);">
      <div class="card" style="text-align:center;">
        <h3 style="margin-bottom:var(--space-4);">Pulse Estimate</h3>
        <div class="hr-display" style="justify-content:center;margin-bottom:var(--space-4);">
          <div class="hr-pulse" style="color:var(--accent);" aria-hidden="true">${icons.heart}</div>
          <div>
            <div class="hr-value" style="color:${zoneTone.color};">${num(hr)}</div>
            <div class="hr-label">BPM (estimated)</div>
          </div>
        </div>
        <div style="display:flex;justify-content:center;gap:var(--space-4);flex-wrap:wrap;">
          <div class="stat-card" style="align-items:center;">
            <div class="stat-value" style="font-size:var(--text-xl);">${result.hrv == null ? '—' : num(result.hrv)}</div>
            <div class="stat-label">${result.hrv == null ? 'HRV not measurable' : 'HRV (ms, rough)'}</div>
          </div>
          <div class="stat-card" style="align-items:center;">
            <div class="stat-value" style="font-size:var(--text-md);color:${zoneTone.color};">${esc(hrZone)}</div>
            <div class="stat-label">Range</div>
          </div>
          <div class="stat-card" style="align-items:center;">
            <div class="stat-value" style="font-size:var(--text-xl);">${num(result.confidence)}%</div>
            <div class="stat-label">Signal confidence</div>
          </div>
        </div>
      </div>
      <div class="card card-sm">
        <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-2);flex-wrap:wrap;">
          <span class="badge ${qualityClass}">${esc(result.quality)} signal</span>
          <span style="font-size:var(--text-xs);color:var(--text-tertiary);">${num(result.sampleRate)} fps over ${num(result.duration)}s</span>
        </div>
        <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;">${esc(getHRInterpretation(hr))}</p>
      </div>
      <p class="disclaimer">Camera-based pulse readings are rough estimates and can be thrown off by lighting or movement. A dedicated device is more reliable if you want an accurate number. Not medical advice.</p>
      <button type="button" class="btn btn-primary btn-block" id="new-scan-btn">New Check-In</button>
    </div>`;

  resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('new-scan-btn')?.addEventListener('click', () => renderBodyScanner());
}

function getHRInterpretation(hr) {
  if (hr < 50) return 'This estimate is on the lower end of a resting range. Fit people often sit here — worth a look if it surprises you.';
  if (hr < 60) return 'This estimate is a little below a typical resting range, which is common for active people.';
  if (hr < 80) return 'This estimate is in a typical resting range.';
  if (hr < 100) return 'This estimate is in a typical resting range for most adults.';
  if (hr < 120) return 'This estimate is a bit above a typical resting range. Recent movement, stress, caffeine, or dehydration can all do this.';
  return 'This estimate is well above a typical resting range. Camera readings are rough — a proper device is more reliable if you are curious.';
}

// ═══════════════════════════════════════════════════
//  Pulse Trend + Check-In History
// ═══════════════════════════════════════════════════

function renderHRTrend(readings) {
  const valid = readings.filter(r => Number.isFinite(Number(r.hr)));
  if (valid.length < 2) return '';
  const avg = Math.round(valid.reduce((s, r) => s + Number(r.hr), 0) / valid.length);
  const ordered = valid.slice().reverse();
  const summary = ordered.map(r => `${Math.round(Number(r.hr))}`).join(', ');
  return `
    <div class="card" style="margin-top:var(--space-4);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3);">
        <h4>Recent Pulse Trend</h4>
        <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);color:var(--viz-green);">Avg: ${avg} BPM</span>
      </div>
      <div style="display:flex;align-items:flex-end;gap:var(--space-2);height:60px;" role="img" aria-label="Recent pulse estimates, oldest to newest: ${esc(summary)} BPM. Average ${avg} BPM.">
        ${ordered.map(r => {
    const hr = Number(r.hr);
    const h = Math.max(10, Math.min(100, (hr - 40) / 1.2));
    const c = hr < 100 ? 'var(--viz-green)' : 'var(--viz-amber)';
    return `<div style="flex:1;height:${h}%;background:${c};border-radius:var(--radius-sm) var(--radius-sm) 0 0;opacity:0.8;" title="${Math.round(hr)} BPM"></div>`;
  }).join('')}
      </div>
      <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-2);">${valid.length} readings · green = typical resting range, amber = above it</p>
    </div>`;
}

function renderScanHistory(history, loadFailed) {
  if (loadFailed) {
    return `<div class="empty-state card" role="alert">
      <h3>Couldn't load your check-in history</h3>
      <p>Check your connection and try again. Your past check-ins are safe.</p>
      <button type="button" class="btn btn-sm" id="history-retry">Try again</button>
    </div>`;
  }

  if (!history.length) {
    return `<div class="empty-state card">
      <div style="color:var(--text-tertiary);display:flex;justify-content:center;" aria-hidden="true">${icons.body}</div>
      <h3>No check-ins yet</h3>
      <p>Pick a type above and take your first one.</p>
    </div>`;
  }

  return history.map(s => {
    const m = MODES.find(x => x.id === s.scan_type) || { icon: icons.body, label: s.scan_type || 'Check-in' };
    const t = s.scanned_at
      ? new Date(s.scanned_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Recently';
    const score = Number(s.overall_score) || 0;
    const tone = scoreTone(score);
    const isPulse = s.scan_type === 'heart' && Number.isFinite(Number(s.hr));

    return `<div class="card card-sm">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;align-items:center;gap:var(--space-3);">
          <div style="width:36px;height:36px;border-radius:var(--radius-md);background:var(--accent-purple-dim);display:flex;align-items:center;justify-content:center;font-size:18px;" aria-hidden="true">${m.icon}</div>
          <div>
            <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${esc(m.label)}</div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${esc(t)}${isPulse ? ` • ${num(s.hr)} BPM` : ''}</div>
          </div>
        </div>
        <div style="font-family:var(--font-heading);font-weight:var(--weight-bold);color:${isPulse ? 'var(--text-primary)' : tone.color};">
          ${isPulse ? `${num(s.hr)}<span style="font-size:var(--text-xs);color:var(--text-tertiary);"> BPM</span>` : `${score}<span style="font-size:var(--text-xs);color:var(--text-tertiary);">/100</span>`}
        </div>
      </div>
    </div>`;
  }).join('');
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

function updateCaptureProgressRing(progress) {
  const container = document.getElementById('capture-progress');
  if (!container) return;
  const r = 22, circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - progress);
  container.innerHTML = `
    <svg width="52" height="52" aria-hidden="true">
      <circle cx="26" cy="26" r="${r}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>
      <circle cx="26" cy="26" r="${r}" fill="none" stroke="var(--error)" stroke-width="3"
        stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
      <text x="26" y="30" text-anchor="middle" fill="white" font-size="11" font-weight="600">${Math.round(progress * 100)}%</text>
    </svg>`;
}
