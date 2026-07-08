// Body Scanner — AI Biomarker Detection System
// Scan modes: Heart Rate, Face, Eye, Skin, Body, Tongue, Nail

import { icons } from '../icons.js';
import { CameraSystem, QualityGate } from '../utils/camera-system.js';
import { RPPGEngine, analyzeFace, analyzeEye, analyzeSkin, analyzeBodyComposition, analyzeTongue, analyzeNail } from '../utils/biomarker-engine.js';

import { bodyScans, hrReadings } from '../lib/db.js';
import { apiFetch } from '../utils/api.js';

import { showToast } from '../utils/toast.js';
let activeMode = 'face';
let camera = null;
let rppgEngine = null;
let isScanning = false;

const MODES = [
  { id: 'heart', icon: icons.heart, label: 'Heart Rate', desc: 'rPPG pulse measurement', guide: 'face', facingMode: 'user' },
  { id: 'face', icon: icons.user, label: 'Face Scan', desc: 'Facial mapping & acne analysis', guide: 'face', facingMode: 'user' },
  { id: 'eye', icon: icons.eye, label: 'Eye Check', desc: 'Anemia, jaundice & ocular signals', guide: 'eye', facingMode: 'user' },
  { id: 'skin', icon: icons.sun, label: 'Skin Check', desc: 'Lesion triage (ABCDE criteria)', guide: 'skin', facingMode: 'environment' },
  { id: 'tongue', icon: icons.droplet, label: 'Tongue', desc: 'TCM & nutritional indicators', guide: 'face', facingMode: 'user' },
  { id: 'nail', icon: icons.star, label: 'Nail Scan', desc: 'Systemic health from nails', guide: 'skin', facingMode: 'environment' },
  { id: 'body', icon: icons.body, label: 'Body Scan', desc: 'Posture & composition', guide: 'body', facingMode: 'environment' },
];

export async function renderBodyScanner() {
  if (camera) { camera.stop(); camera = null; }
  isScanning = false;

  const content = document.getElementById('page-content');

  let history = [];
  let recentHR = [];
  try { history = await bodyScans.getRecent(8); } catch (e) { console.warn('Could not load body scans:', e.message); }
  try { recentHR = await hrReadings.getRecent(7); } catch (e) { console.warn('Could not load HR readings:', e.message); }

  content.innerHTML = `
    <div class="body-scanner stagger-children">
      <div class="page-header">
        <h1>Biomarker Scanner</h1>
        <p>AI-powered clinical health signal analysis</p>
      </div>

      <div class="mode-selector" id="mode-selector" style="display:flex;gap:var(--space-2);overflow-x:auto;padding-bottom:var(--space-2);">
        ${MODES.map(m => `
          <div class="mode-card ${m.id === activeMode ? 'active' : ''}" data-mode="${m.id}" style="flex-shrink:0;">
            <div class="mode-icon">${m.icon}</div>
            <div class="mode-label">${m.label}</div>
          </div>
        `).join('')}
      </div>

      <div id="scanner-area" style="margin-top:var(--space-4);">
        ${renderScannerForMode(activeMode)}
      </div>

      <div id="scan-results" class="hidden"></div>

      <div class="disclaimer-banner" style="margin-top:var(--space-4);">
        <span class="icon">${icons.alert}</span>
        <span>Screening signals only — <strong>not a medical diagnosis</strong>. Consult a qualified healthcare provider for clinical evaluation.</span>
      </div>

      ${recentHR.length >= 2 ? renderHRTrend(recentHR) : ''}

      <div class="section-heading" style="margin-top:var(--space-5);">
        <h3>Scan History</h3>
        <span class="badge badge-purple">${history.length}</span>
      </div>
      <div id="scan-history" style="display:flex;flex-direction:column;gap:var(--space-3);">
        ${renderScanHistory(history)}
      </div>
    </div>`;

  setupModeSelector();
}

// ═══════════════════════════════════════════════════
//  Scanner UI
// ═══════════════════════════════════════════════════

function renderScannerForMode(mode) {
  const m = MODES.find(x => x.id === mode);
  const instructions = getInstructions(mode);

  if (mode === 'heart') {
    return `
      <div class="card" style="padding:0;overflow:hidden;">
        <div class="scanner-viewfinder" id="viewfinder">
          <div class="scanner-guide-overlay"><div class="guide-face"></div></div>
          <div class="capture-progress" id="capture-progress"></div>
          <div class="quality-bar" id="quality-bar"></div>
          <div class="scanner-status" id="scanner-status">
            <div class="scanner-status-dot amber"></div>
            <span>Tap Start to begin</span>
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:var(--space-3);">
        <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-3);">
          <span style="color:var(--accent);">${icons.heart}</span>
          <div><h4>Heart Rate Measurement</h4><p style="font-size:var(--text-xs);color:var(--text-tertiary);">${instructions}</p></div>
        </div>
        <div id="hr-live-display" style="display:none;text-align:center;padding:var(--space-4) 0;">
          <div class="hr-display" style="justify-content:center;">
            <div class="hr-pulse" style="color:var(--accent);">${icons.heart}</div>
            <div><div class="hr-value" id="hr-value">--</div><div class="hr-label">BPM</div></div>
          </div>
          <div style="margin-top:var(--space-3);">
            <div class="progress-bar" style="height:6px;"><div class="progress-fill" id="hr-progress" style="width:0%;background:var(--accent-coral);"></div></div>
            <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-2);" id="hr-status-text">Recording...</p>
          </div>
        </div>
        <button class="btn btn-primary btn-block" id="start-scan-btn">
          ${icons.camera} Start Heart Rate Scan
        </button>
      </div>`;
  }

  return `
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="scanner-viewfinder" id="viewfinder">
        <div class="scanner-guide-overlay"><div class="guide-${m.guide}"></div></div>
        <div class="quality-bar" id="quality-bar"></div>
        <div class="scanner-status" id="scanner-status">
          <div class="scanner-status-dot amber"></div>
          <span>Ready to scan</span>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:var(--space-3);">
      <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-3);">
        <span style="font-size:24px;">${m.icon}</span>
        <div><h4>${m.label}</h4><p style="font-size:var(--text-xs);color:var(--text-tertiary);">${instructions}</p></div>
      </div>
      <div style="display:flex;gap:var(--space-3);">
        <button class="btn btn-primary" id="start-scan-btn" style="flex:1;">
          ${icons.camera} Start Camera
        </button>
        <label class="btn btn-secondary" style="flex:1;cursor:pointer;">
          Upload Photo
          <input type="file" accept="image/*" id="upload-input" style="display:none;">
        </label>
      </div>
    </div>`;
}

function getInstructions(mode) {
  const map = {
    heart: 'Hold face still in oval for 15 seconds. Even lighting, no movement.',
    face: 'Position face in oval, good even lighting, remove glasses. Neutral expression.',
    eye: 'Close up on one eye. Pull lower eyelid down gently to show conjunctiva.',
    skin: 'Position area of concern in frame. Close up, sharp focus, good lighting.',
    tongue: 'Open mouth, extend tongue fully. Good lighting, camera level with mouth.',
    nail: 'Hold fingers flat toward camera. Close up, sharp focus, good lighting.',
    body: 'Stand upright, full body visible. Use rear camera. Include front and side views if possible.',
  };
  return map[mode] || '';
}

function setupModeSelector() {
  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      if (camera) { camera.stop(); camera = null; }
      isScanning = false;
      activeMode = card.dataset.mode;
      document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      document.getElementById('scanner-area').innerHTML = renderScannerForMode(activeMode);
      document.getElementById('scan-results').classList.add('hidden');
      document.getElementById('scan-results').innerHTML = '';
      attachScanHandlers();
    });
  });
  attachScanHandlers();
}

function attachScanHandlers() {
  document.getElementById('start-scan-btn')?.addEventListener('click', () => startCameraScan());
  document.getElementById('upload-input')?.addEventListener('change', (e) => {
    if (e.target.files?.[0]) processUploadedImage(e.target.files[0]);
  });
}

// ═══════════════════════════════════════════════════
//  Camera Scanning
// ═══════════════════════════════════════════════════

async function startCameraScan() {
  if (isScanning) return;
  isScanning = true;

  const m = MODES.find(x => x.id === activeMode);
  const viewfinder = document.getElementById('viewfinder');
  const statusEl = document.getElementById('scanner-status');
  const startBtn = document.getElementById('start-scan-btn');

  startBtn.disabled = true;
  startBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div> Starting camera...';

  camera = new CameraSystem({ facingMode: m.facingMode, frameRate: 30 });
  const started = await camera.start(viewfinder);

  if (!started) {
    showToast('Camera access denied. Please grant camera permission.');
    startBtn.disabled = false;
    startBtn.innerHTML = `${icons.camera} Start Camera`;
    isScanning = false;
    return;
  }

  updateStatus(statusEl, 'green', 'Camera active');

  if (activeMode === 'heart') {
    startHeartRateScan();
  } else {
    startBtn.innerHTML = 'Capture & Analyze';
    startBtn.disabled = false;
    startBtn.onclick = () => captureAndAnalyze();
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
  startBtn.style.display = 'none';
  updateStatus(statusEl, 'red', 'Recording HR — hold still');

  rppgEngine = new RPPGEngine();

  rppgEngine.onProgress = (progress) => {
    if (progressBar) progressBar.style.width = `${progress * 100}%`;
    if (statusText) {
      const remaining = Math.ceil((1 - progress) * 15);
      statusText.textContent = `Recording... ${remaining}s remaining`;
    }
    updateCaptureProgressRing(progress);
  };

  rppgEngine.onResult = async (result) => {
    isScanning = false;
    camera.stop(); camera = null;

    if (hrValue) hrValue.textContent = result.hr;
    if (statusText) statusText.textContent = `Measured: ${result.hr} BPM (${result.quality} quality)`;
    updateStatus(document.getElementById('scanner-status'), 'green', `${result.hr} BPM — ${result.quality}`);

    try {
      await hrReadings.log({ hr: result.hr, hrv: result.hrv, confidence: result.confidence, quality: result.quality });
      await bodyScans.log({ type: 'heart', overallScore: result.confidence, hr: result.hr, hrv: result.hrv, confidence: result.confidence, quality: result.quality });
    } catch (dbErr) { console.error('[BodyScanner] Failed to save HR:', dbErr.message); }

    showHeartRateResults(result);
  };

  rppgEngine.start(15000);
  camera.onFrame(frame => {
    if (!rppgEngine?.isRecording) return;
    rppgEngine.addFrame(frame.imageData);
    updateQualityIndicators(frame.imageData);
  });
}

function captureAndAnalyze() {
  if (!camera || !isScanning) return;
  const frame = camera.captureFrame();
  if (!frame) return;

  isScanning = false;
  camera.stop(); camera = null;

  const viewfinder = document.getElementById('viewfinder');
  if (viewfinder) {
    viewfinder.innerHTML = `
      <img src="${frame.dataUrl}" style="width:100%;height:100%;object-fit:cover;">
      <div class="scanner-line"></div>
      <div class="scanner-status">
        <div class="spinner" style="width:14px;height:14px;border-width:2px;"></div>
        <span>Analyzing biomarkers...</span>
      </div>`;
  }

  setTimeout(async () => {
    let result;
    switch (activeMode) {
      case 'face': result = await analyzeFace(frame.imageData); break;
      case 'eye': result = await analyzeEye(frame.imageData); break;
      case 'skin': result = await analyzeSkin(frame.imageData); break;
      case 'tongue': result = await analyzeTongue(frame.imageData); break;
      case 'nail': result = await analyzeNail(frame.imageData); break;
      case 'body': result = await analyzeBodyComposition(frame.imageData); break;
      default: result = await analyzeFace(frame.imageData);
    }

    try {
      await bodyScans.log({
        type: activeMode,
        overallScore: result.overallScore,
        results: result.results || result,
        recommendations: result.recommendations,
        riskTier: result.riskTier || null,
      });
    } catch (dbErr) { console.error('[BodyScanner] Failed to save scan:', dbErr.message); }

    showAnalysisResults(result, frame.dataUrl);
    fetchAndRenderDelta(activeMode, result.overallScore);
  }, 1800);
}

// ═══════════════════════════════════════════════════
//  Upload-based Scanning
// ═══════════════════════════════════════════════════

function processUploadedImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const viewfinder = document.getElementById('viewfinder');
      if (viewfinder) {
        viewfinder.innerHTML = `
          <img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;">
          <div class="scanner-line"></div>
          <div class="scanner-status">
            <div class="spinner" style="width:14px;height:14px;border-width:2px;"></div>
            <span>Analyzing biomarkers...</span>
          </div>`;
      }

      const quality = QualityGate.assess(imageData);
      if (!quality.pass) showToast(`Image quality: ${quality.blur.label} sharpness. Results may be less accurate.`);

      setTimeout(async () => {
        let result;
        switch (activeMode) {
          case 'face': result = await analyzeFace(imageData); break;
          case 'eye': result = await analyzeEye(imageData); break;
          case 'skin': result = await analyzeSkin(imageData); break;
          case 'tongue': result = await analyzeTongue(imageData); break;
          case 'nail': result = await analyzeNail(imageData); break;
          case 'body': result = await analyzeBodyComposition(imageData); break;
          default: result = await analyzeFace(imageData);
        }

        try {
          await bodyScans.log({
            type: activeMode,
            overallScore: result.overallScore,
            results: result.results || result,
            recommendations: result.recommendations,
            riskTier: result.riskTier || null,
          });
        } catch (dbErr) { console.error('[BodyScanner] Failed to save scan:', dbErr.message); }

        // Save full result to biomarker_scans table
        try {
          const { supabase } = await import('../lib/supabase.js');
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            await apiFetch('/api/biomarker-history', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                scanType: activeMode,
                score: result.overallScore,
                riskTier: result.riskTier,
                result,
              }),
            });
            console.log(`[BiomarkerHistory] ${activeMode} scan saved to history`);
          }
        } catch (histErr) { console.warn('[BiomarkerHistory] Failed to save history:', histErr.message); }

        showAnalysisResults(result, e.target.result);
        fetchAndRenderDelta(activeMode, result.overallScore);
      }, 2000);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ═══════════════════════════════════════════════════
//  Results Display — Mode-specific renderers
// ═══════════════════════════════════════════════════

async function fetchAndRenderDelta(scanType, currentScore) {
  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;

    const res = await apiFetch(`/api/biomarker-history/latest?userId=${user.id}&type=${scanType}`);
    if (!res.ok) return;
    const { latest, previous } = await res.json();

    const deltaCard = document.getElementById('scan-delta-card');
    if (!deltaCard) return;

    // latest is the scan we just saved — previous is the one before it
    if (!previous) {
      deltaCard.innerHTML = `
        <div class="card card-sm" style="border-left:3px solid var(--accent-teal);background:var(--accent-teal-dim);">
          <div style="font-size:var(--text-xs);color:var(--accent-teal);font-weight:600;">First ${scanType} scan saved — future scans will show delta comparison</div>
        </div>`;
      return;
    }

    const delta = currentScore - previous.score;
    const deltaColor = delta > 0 ? 'var(--accent-green)' : delta < 0 ? 'var(--accent-coral)' : 'var(--text-tertiary)';
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
    const prevDate = new Date(previous.scanned_at).toLocaleDateString();

    deltaCard.innerHTML = `
      <div class="card card-sm" style="border-left:3px solid ${deltaColor};">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:2px;">vs previous ${scanType} scan · ${prevDate}</div>
            <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">
              Score: <span style="color:${deltaColor};font-weight:700;">${deltaStr} points</span>
              ${delta > 0 ? '— improving' : delta < 0 ? '— declined' : '— unchanged'}
            </div>
          </div>
          <div style="display:flex;gap:var(--space-3);align-items:center;">
            <div style="text-align:center;">
              <div style="font-size:10px;color:var(--text-tertiary);">Previous</div>
              <div style="font-family:var(--font-heading);font-size:var(--text-lg);font-weight:700;color:var(--text-secondary);">${previous.score}</div>
            </div>
            <div style="color:var(--text-tertiary);">→</div>
            <div style="text-align:center;">
              <div style="font-size:10px;color:var(--text-tertiary);">Now</div>
              <div style="font-family:var(--font-heading);font-size:var(--text-lg);font-weight:700;color:${deltaColor};">${currentScore}</div>
            </div>
          </div>
        </div>
      </div>`;
  } catch (e) {
    console.warn('[ScanDelta] Failed to load delta:', e.message);
  }
}

function showAnalysisResults(result, previewUrl) {
  const resultsDiv = document.getElementById('scan-results');
  resultsDiv.classList.remove('hidden');

  const viewfinder = document.getElementById('viewfinder');
  if (viewfinder && previewUrl) {
    viewfinder.innerHTML = `
      <img src="${previewUrl}" style="width:100%;height:100%;object-fit:cover;">
      <div style="position:absolute;top:var(--space-3);right:var(--space-3);">
        <div class="badge badge-green">${icons.check} Complete</div>
      </div>`;
  }

  const m = MODES.find(x => x.id === activeMode);
  let html = '';

  switch (activeMode) {
    case 'face': html = renderFaceResults(result, m); break;
    case 'eye': html = renderEyeResults(result, m); break;
    case 'skin': html = renderSkinResults(result, m); break;
    case 'tongue': html = renderTongueResults(result, m); break;
    case 'nail': html = renderNailResults(result, m); break;
    case 'body': html = renderBodyResults(result, m); break;
    default: html = renderGenericResults(result, m);
  }

  resultsDiv.innerHTML = `
    <div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);margin-top:var(--space-4);">
      <div id="scan-delta-card"></div>
      ${html}
      <div class="disclaimer-banner">
        <span class="icon">${icons.alert}</span>
        <span>${result.disclaimer || 'Screening tool only. Not a medical diagnosis. Consult a physician for clinical evaluation.'}</span>
      </div>
      <button class="btn btn-primary btn-block" id="new-scan-btn" style="margin-bottom:var(--space-4);">New Scan</button>
    </div>`;

  resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('new-scan-btn')?.addEventListener('click', () => renderBodyScanner());
}

// ─── Face Results ─────────────────────────────────

function renderFaceResults(r, m) {
  const scoreColor = r.overallScore >= 80 ? 'var(--accent-green)' : r.overallScore >= 55 ? 'var(--accent-amber)' : 'var(--accent-coral)';
  const severityColors = { clear: 'var(--accent-green)', mild: 'var(--accent-amber)', moderate: 'var(--accent-coral)', severe: 'var(--accent-coral)' };
  const barrierColors = { intact: 'var(--accent-green)', compromised_mild: 'var(--accent-amber)', compromised_moderate: 'var(--accent-coral)', compromised_severe: 'var(--accent-coral)' };

  const zones = r.zones || {};
  const zoneOrder = ['forehead', 'glabella', 'nose_tzone', 'left_cheek', 'right_cheek', 'chin_jawline', 'temples', 'perioral', 'periorbital'];
  const zoneLabels = { forehead: 'Forehead', glabella: 'Between Brows', nose_tzone: 'Nose / T-Zone', left_cheek: 'Left Cheek', right_cheek: 'Right Cheek', chin_jawline: 'Chin & Jawline', temples: 'Temples', perioral: 'Perioral', periorbital: 'Under-Eye (Periorbital)' };

  return `
    <!-- Score Header -->
    <div class="card" style="text-align:center;">
      <h3 style="margin-bottom:var(--space-2);">${m.label} Analysis</h3>
      <div style="font-family:var(--font-heading);font-size:var(--text-4xl);font-weight:var(--weight-extrabold);color:${scoreColor};">${r.overallScore}</div>
      <p style="font-size:var(--text-sm);color:var(--text-secondary);">Skin Health Score</p>
      <div style="display:flex;justify-content:center;gap:var(--space-2);margin-top:var(--space-3);flex-wrap:wrap;">
        ${r.hydration ? `<span class="badge badge-teal">${r.hydration} skin</span>` : ''}
        ${r.primary_breakout_type && r.primary_breakout_type !== 'none' ? `<span class="badge badge-coral">${r.primary_breakout_type} pattern</span>` : '<span class="badge badge-green">No acne detected</span>'}
        ${r.riskTier ? `<span class="badge badge-${r.riskTier === 'Low' ? 'green' : r.riskTier === 'Moderate' ? 'amber' : 'coral'}">${r.riskTier} Risk</span>` : ''}
      </div>
    </div>

    <!-- Fitzpatrick + Skin Barrier -->
    ${r.fitzpatrick_type ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Skin Profile</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-bottom:var(--space-3);">
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:2px;">Fitzpatrick Type</div>
          <div style="font-size:var(--text-lg);font-weight:700;color:var(--accent-teal);">Type ${r.fitzpatrick_type}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:2px;">Skin Barrier</div>
          <div style="font-size:var(--text-sm);font-weight:600;color:${barrierColors[r.skin_barrier] || 'var(--text-secondary)'};">${(r.skin_barrier || 'unknown').replace(/_/g, ' ')}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:2px;">Collagen</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${(r.collagen_density_estimate || '—').replace(/_/g, ' ')}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:2px;">Texture</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${(r.skin_texture || '—').replace(/_/g, ' ')}</div>
        </div>
      </div>
      ${r.fitzpatrick_notes ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;margin-bottom:var(--space-2);">${r.fitzpatrick_notes}</p>` : ''}
      ${r.skin_barrier_notes ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;">${r.skin_barrier_notes}</p>` : ''}
    </div>` : ''}

    <!-- Structural Aging Markers -->
    ${(r.forehead_lines || r.nasolabial_folds || r.jowling || r.temporal_hollowing) ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Structural Assessment</h4>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);">
        ${r.forehead_lines ? `
        <div style="padding:var(--space-2) 0;border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:var(--text-xs);color:var(--text-secondary);">Forehead Lines</span>
            <span style="font-size:var(--text-xs);font-weight:600;">H: ${r.forehead_lines.horizontal || '—'} · V: ${r.forehead_lines.vertical_glabellar || '—'}</span>
          </div>
          ${r.forehead_lines.wellness_note ? `<p style="font-size:10px;color:var(--text-tertiary);">${r.forehead_lines.wellness_note}</p>` : ''}
        </div>` : ''}
        ${r.nasolabial_folds ? `
        <div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px solid var(--border);">
          <span style="font-size:var(--text-xs);color:var(--text-secondary);">Nasolabial Folds</span>
          <span style="font-size:var(--text-xs);font-weight:600;">${r.nasolabial_folds.replace(/_/g, ' ')}</span>
        </div>` : ''}
        ${r.jowling ? `
        <div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px solid var(--border);">
          <span style="font-size:var(--text-xs);color:var(--text-secondary);">Jowling</span>
          <span style="font-size:var(--text-xs);font-weight:600;">${r.jowling.replace(/_/g, ' ')}</span>
        </div>` : ''}
        ${r.temporal_hollowing ? `
        <div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;">
          <span style="font-size:var(--text-xs);color:var(--text-secondary);">Temporal Hollowing</span>
          <span style="font-size:var(--text-xs);font-weight:600;">${r.temporal_hollowing.replace(/_/g, ' ')}</span>
        </div>` : ''}
      </div>
    </div>` : ''}

    <!-- Facial Zones -->
    ${Object.keys(zones).length > 0 ? `
    <div class="section-heading"><h3>Facial Zone Analysis</h3></div>
    ${zoneOrder.filter(z => zones[z]).map(z => {
      const zone = zones[z];
      const sev = zone.severity || (zone.dark_circles !== 'none' ? zone.dark_circles : 'clear');
      const sColor = severityColors[sev] || 'var(--text-tertiary)';
      // periorbital zone has different structure
      if (z === 'periorbital') {
        return `
        <div class="card card-sm" style="border-left:3px solid ${severityColors[zone.dark_circles] || 'var(--accent-green)'};">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2);">
            <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${zoneLabels[z]}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-bottom:var(--space-2);">
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">Dark circles: <strong>${zone.dark_circles || '—'}</strong>${zone.dark_circle_tone && zone.dark_circle_tone !== 'none' ? ` (${zone.dark_circle_tone.replace(/_/g,' ')})` : ''}</div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">Puffiness: <strong>${zone.puffiness || '—'}</strong></div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">Fine lines: <strong>${zone.fine_lines || '—'}</strong></div>
          </div>
          ${zone.wellness_signal ? `<p style="font-size:var(--text-xs);color:var(--accent-teal);">${zone.wellness_signal}</p>` : ''}
        </div>`;
      }
      return `
      <div class="card card-sm" style="border-left:3px solid ${sColor};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-2);">
          <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${zoneLabels[z]}</div>
          <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:${sColor}22;color:${sColor};font-weight:600;">${sev}</span>
        </div>
        <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;margin-bottom:var(--space-1);">${zone.condition || ''}</p>
        ${zone.wellness_signal ? `<p style="font-size:var(--text-xs);color:var(--accent-teal);">${zone.wellness_signal}</p>` : ''}
        ${zone.possible_system ? `<p style="font-size:var(--text-xs);color:var(--accent-teal);">${zone.possible_system}</p>` : ''}
      </div>`;
    }).join('')}` : ''}

    <!-- Skin Tone Findings -->
    ${r.discoloration && Object.values(r.discoloration).some(v => v === true) ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Skin Tone Findings</h4>
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);">
        ${Object.entries(r.discoloration).filter(([k, v]) => v === true).map(([k]) =>
          `<span style="font-size:var(--text-xs);padding:4px 10px;border-radius:var(--radius-full);background:var(--accent-amber-dim);color:var(--accent-amber);">${k.replace(/_/g, ' ')}</span>`
        ).join('')}
        ${r.discoloration.hyperpigmentation_pattern && r.discoloration.hyperpigmentation_pattern !== 'none' ? `<span style="font-size:var(--text-xs);padding:4px 10px;border-radius:var(--radius-full);background:var(--accent-coral-dim);color:var(--accent-coral);">${r.discoloration.hyperpigmentation_pattern.replace(/_/g, ' ')}</span>` : ''}
      </div>
    </div>` : ''}

    <!-- Wellness Signals -->
    ${r.wellness_signals?.length > 0 ? `
    <div class="section-heading"><h3>Wellness Signals</h3></div>
    ${r.wellness_signals.map(sig => {
      const urgencyColor = sig.urgency === 'seek_attention' ? 'var(--accent-coral)' : sig.urgency === 'discuss_with_doctor' ? 'var(--accent-amber)' : 'var(--text-tertiary)';
      return `
      <div class="card card-sm" style="border-left:3px solid ${urgencyColor};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-1);">
          <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${sig.indicator}</span>
          <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:${urgencyColor}22;color:${urgencyColor};">${(sig.urgency || '').replace(/_/g,' ')}</span>
        </div>
        <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;">${sig.significance}</p>
        ${sig.confidence ? `<p style="font-size:10px;color:var(--text-tertiary);margin-top:var(--space-1);">Confidence: ${sig.confidence}</p>` : ''}
      </div>`;
    }).join('')}` : ''}

    <!-- Additional indicators -->
    ${(r.eyebrow_notes && r.eyebrow_notes !== 'normal') || (r.lip_notes && r.lip_notes !== 'normal') || r.facial_puffiness !== 'none' ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Additional Indicators</h4>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);">
        ${r.eyebrow_notes && r.eyebrow_notes !== 'normal' ? `<div style="display:flex;justify-content:space-between;"><span style="font-size:var(--text-xs);color:var(--text-secondary);">Eyebrows</span><span style="font-size:var(--text-xs);font-weight:600;color:var(--accent-amber);">${r.eyebrow_notes.replace(/_/g,' ')}</span></div>` : ''}
        ${r.lip_notes && r.lip_notes !== 'normal' ? `<div style="display:flex;justify-content:space-between;"><span style="font-size:var(--text-xs);color:var(--text-secondary);">Lips</span><span style="font-size:var(--text-xs);font-weight:600;color:var(--accent-amber);">${r.lip_notes.replace(/_/g,' ')}</span></div>` : ''}
        ${r.facial_puffiness && r.facial_puffiness !== 'none' ? `<div style="display:flex;justify-content:space-between;"><span style="font-size:var(--text-xs);color:var(--text-secondary);">Facial Puffiness</span><span style="font-size:var(--text-xs);font-weight:600;color:var(--accent-amber);">${r.facial_puffiness}</span></div>` : ''}
        ${r.facial_symmetry && r.facial_symmetry !== 'normal' ? `<div style="display:flex;justify-content:space-between;"><span style="font-size:var(--text-xs);color:var(--text-secondary);">Symmetry</span><span style="font-size:var(--text-xs);font-weight:600;">${r.facial_symmetry.replace(/_/g,' ')}</span></div>` : ''}
      </div>
    </div>` : ''}

    ${renderRecommendations(r.recommendations)}
    ${renderLabSuggestions(r.suggested_followup || r.suggested_lab_tests)}`;

  return `
    <!-- Score Header -->
    <div class="card" style="text-align:center;">
      <h3 style="margin-bottom:var(--space-2);">${m.icon} ${m.label} Analysis</h3>
      <div style="font-family:var(--font-heading);font-size:var(--text-4xl);font-weight:var(--weight-extrabold);color:${scoreColor};">${r.overallScore}</div>
      <p style="font-size:var(--text-sm);color:var(--text-secondary);">Skin Health Score</p>
      <div style="display:flex;justify-content:center;gap:var(--space-3);margin-top:var(--space-3);flex-wrap:wrap;">
        ${r.hydration ? `<span class="badge badge-teal">${r.hydration} skin</span>` : ''}
        ${r.primary_acne_type && r.primary_acne_type !== 'none' ? `<span class="badge" style="background:${acneColors[r.primary_acne_type]}22;color:${acneColors[r.primary_acne_type]};">${r.primary_acne_type} acne</span>` : '<span class="badge badge-green">No acne detected</span>'}
        ${r.riskTier ? `<span class="badge badge-${r.riskTier === 'Low' ? 'green' : r.riskTier === 'Moderate' ? 'amber' : 'coral'}">${r.riskTier} Risk</span>` : ''}
      </div>
    </div>

    <!-- Facial Zone Map -->
    ${Object.keys(zones).length > 0 ? `
    <div class="section-heading"><h3>Facial Zone Analysis</h3></div>
    ${zoneOrder.filter(z => zones[z]).map(z => {
    const zone = zones[z];
    const sColor = severityColors[zone.severity] || 'var(--text-tertiary)';
    return `
      <div class="card card-sm" style="border-left:3px solid ${sColor};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-2);">
          <div style="display:flex;align-items:center;gap:var(--space-2);">
            <span style="font-size:18px;">${zoneIcons[z] || '•'}</span>
            <div>
              <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${zoneLabels[z]}</div>
              ${zone.acne_type && zone.acne_type !== 'none' ? `<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:${acneColors[zone.acne_type]}22;color:${acneColors[zone.acne_type]};">${zone.acne_type}</span>` : ''}
            </div>
          </div>
          <span style="font-size:var(--text-xs);padding:2px 8px;border-radius:4px;background:${sColor}22;color:${sColor};font-weight:600;">${zone.severity}</span>
        </div>
        <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;margin-bottom:var(--space-1);">${zone.condition}</p>
        ${zone.possible_system ? `<p style="font-size:var(--text-xs);color:var(--accent-teal);">${zone.possible_system}</p>` : ''}
      </div>`;
  }).join('')}` : ''}

    <!-- Skin Discoloration -->
    ${r.discoloration && Object.values(r.discoloration).some(v => v) ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Skin Tone Findings</h4>
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);">
        ${Object.entries(r.discoloration).filter(([k, v]) => v).map(([k]) =>
    `<span style="font-size:var(--text-xs);padding:4px 10px;border-radius:var(--radius-full);background:var(--accent-amber-dim);color:var(--accent-amber);">${k.replace(/_/g, ' ')}</span>`
  ).join('')}
      </div>
    </div>` : ''}

    <!-- Systemic Flags -->
    ${r.systemic_flags?.length > 0 ? `
    <div class="section-heading"><h3>Systemic Signals</h3></div>
    ${r.systemic_flags.map(flag => {
    const urgencyColor = flag.urgency === 'urgent' ? 'var(--accent-coral)' : flag.urgency === 'consult' ? 'var(--accent-amber)' : 'var(--text-tertiary)';
    return `
      <div class="card card-sm" style="border-left:3px solid ${urgencyColor};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-1);">
          <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${flag.indicator}</span>
          <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:${urgencyColor}22;color:${urgencyColor};">${flag.urgency}</span>
        </div>
        <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;">${flag.significance}</p>
        ${flag.confidence ? `<p style="font-size:10px;color:var(--text-tertiary);margin-top:var(--space-1);">Confidence: ${flag.confidence}</p>` : ''}
      </div>`;
  }).join('')}` : ''}

    ${renderRecommendations(r.recommendations)}
    ${renderLabSuggestions(r.suggested_lab_tests)}`;
}

// ─── Eye Results ──────────────────────────────────

function renderEyeResults(r, m) {
  const scoreColor = r.overallScore >= 80 ? 'var(--accent-green)' : r.overallScore >= 55 ? 'var(--accent-amber)' : 'var(--accent-coral)';

  return `
    <div class="card" style="text-align:center;">
      <h3 style="margin-bottom:var(--space-2);">${m.icon} ${m.label} Analysis</h3>
      <div style="font-family:var(--font-heading);font-size:var(--text-4xl);font-weight:var(--weight-extrabold);color:${scoreColor};">${r.overallScore}</div>
      <p style="font-size:var(--text-sm);color:var(--text-secondary);">Ocular Health Score</p>
      ${r.riskTier ? `<div style="margin-top:var(--space-2);"><span class="badge badge-${r.riskTier === 'Low' ? 'green' : r.riskTier === 'Moderate' ? 'amber' : 'coral'}">${r.riskTier} Risk</span></div>` : ''}
    </div>

    <!-- Conjunctiva -->
    ${r.conjunctiva ? `
    <div class="card card-sm" style="border-left:3px solid ${r.conjunctiva.pallor_present ? 'var(--accent-coral)' : 'var(--accent-green)'};">
      <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);margin-bottom:var(--space-2);">Conjunctiva</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-1);">
        <span style="font-size:var(--text-xs);color:var(--text-secondary);">Color</span>
        <span style="font-size:var(--text-xs);font-weight:600;">${r.conjunctiva.color?.replace(/_/g, ' ')}</span>
      </div>
      ${r.conjunctiva.pallor_present ? `
      <div style="padding:var(--space-2);background:var(--accent-coral-dim);border-radius:var(--radius-md);margin-top:var(--space-2);">
        <p style="font-size:var(--text-xs);color:var(--accent-coral);font-weight:600;">Conjunctival pallor detected — ${r.conjunctiva.pallor_severity}</p>
        <p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;">${r.conjunctiva.pallor_notes || ''}</p>
        <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:4px;">May indicate: ${r.conjunctiva.possible_cause || 'iron deficiency anemia, B12 deficiency'}</p>
      </div>` : `<p style="font-size:var(--text-xs);color:var(--accent-green);">No pallor detected</p>`}
    </div>` : ''}

    <!-- Sclera -->
    ${r.sclera ? `
    <div class="card card-sm" style="border-left:3px solid ${r.sclera.icterus_present ? 'var(--accent-amber)' : 'var(--accent-green)'};">
      <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);margin-bottom:var(--space-2);">Sclera</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-1);">
        <span style="font-size:var(--text-xs);color:var(--text-secondary);">Color</span>
        <span style="font-size:var(--text-xs);font-weight:600;">${r.sclera.color?.replace(/_/g, ' ')}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="font-size:var(--text-xs);color:var(--text-secondary);">Vascularity</span>
        <span style="font-size:var(--text-xs);font-weight:600;">${r.sclera.vascularity?.replace(/_/g, ' ')}</span>
      </div>
      ${r.sclera.icterus_present ? `
      <div style="padding:var(--space-2);background:var(--accent-amber-dim);border-radius:var(--radius-md);margin-top:var(--space-2);">
        <p style="font-size:var(--text-xs);color:var(--accent-amber);font-weight:600;">Scleral icterus detected</p>
        <p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;">May indicate elevated bilirubin. Consult a physician.</p>
      </div>` : `<p style="font-size:var(--text-xs);color:var(--accent-green);margin-top:var(--space-2);">No icterus detected</p>`}
    </div>` : ''}

    <!-- Periorbital -->
    ${r.periorbital ? `
    <div class="card card-sm">
      <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);margin-bottom:var(--space-2);">Periorbital Area</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);">
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Puffiness</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${r.periorbital.puffiness}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Dark Circles</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${r.periorbital.dark_circles}</div>
        </div>
      </div>
      ${r.periorbital.xanthelasma_present ? `
      <div style="padding:var(--space-2);background:var(--accent-amber-dim);border-radius:var(--radius-md);margin-top:var(--space-2);">
        <p style="font-size:var(--text-xs);color:var(--accent-amber);font-weight:600;">Xanthelasma detected — may indicate elevated cholesterol</p>
      </div>` : ''}
    </div>` : ''}

    ${renderSystemicFlags(r.systemic_flags)}
    ${renderRecommendations(r.recommendations)}
    ${renderLabSuggestions(r.suggested_lab_tests)}`;
}

// ─── Skin Results ─────────────────────────────────

function renderSkinResults(r, m) {
  const scoreColor = r.overallScore >= 80 ? 'var(--accent-green)' : r.overallScore >= 55 ? 'var(--accent-amber)' : 'var(--accent-coral)';
  const abcde = r.lesion_assessment?.abcde;

  return `
    <div class="card" style="text-align:center;">
      <h3 style="margin-bottom:var(--space-2);">${m.icon} ${m.label} Analysis</h3>
      <div style="font-family:var(--font-heading);font-size:var(--text-4xl);font-weight:var(--weight-extrabold);color:${scoreColor};">${r.overallScore}</div>
      <p style="font-size:var(--text-sm);color:var(--text-secondary);">Skin Health Score</p>
      ${r.riskTier ? `<div style="margin-top:var(--space-2);"><span class="badge badge-${r.riskTier === 'Low' ? 'green' : r.riskTier === 'Moderate' ? 'amber' : 'coral'}">${r.riskTier} Risk</span></div>` : ''}
    </div>

    ${r.lesion_present && abcde ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">ABCDE Lesion Assessment</h4>
      ${[
        { key: 'asymmetry', label: 'A — Asymmetry', good: 'symmetric', value: abcde.asymmetry },
        { key: 'border', label: 'B — Border', good: 'regular', value: abcde.border },
        { key: 'color', label: 'C — Color', good: 'uniform', value: abcde.color },
        { key: 'diameter_estimate', label: 'D — Diameter', good: 'under_6mm', value: abcde.diameter_estimate },
      ].map(item => {
        const isConcerning = item.value !== item.good;
        const color = isConcerning ? 'var(--accent-coral)' : 'var(--accent-green)';
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) 0;border-bottom:1px solid var(--border);">
          <span style="font-size:var(--text-sm);">${item.label}</span>
          <span style="font-size:var(--text-xs);padding:2px 8px;border-radius:4px;background:${color}22;color:${color};font-weight:600;">${item.value?.replace(/_/g, ' ')}</span>
        </div>`;
      }).join('')}
      <div style="margin-top:var(--space-3);padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
        <span style="font-size:var(--text-xs);color:var(--text-tertiary);">Concerning features: </span>
        <span style="font-size:var(--text-xs);font-weight:600;color:${(abcde.concerning_features_count || 0) >= 2 ? 'var(--accent-coral)' : 'var(--accent-green)'};">${abcde.concerning_features_count || 0} of 4</span>
      </div>
      ${r.lesion_assessment?.urgency !== 'routine' ? `
      <div style="margin-top:var(--space-2);padding:var(--space-2);background:var(--accent-coral-dim);border-radius:var(--radius-md);">
        <p style="font-size:var(--text-xs);color:var(--accent-coral);font-weight:600;">${r.lesion_assessment.urgency?.replace(/_/g, ' ')} — ${r.lesion_assessment.likely_classification?.replace(/_/g, ' ')}</p>
      </div>` : ''}
    </div>` : ''}

    ${r.inflammatory_conditions?.present ? `
    <div class="card card-sm" style="border-left:3px solid var(--accent-amber);">
      <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);margin-bottom:var(--space-2);">Inflammatory Conditions</div>
      ${r.inflammatory_conditions.conditions_identified?.map(c =>
        `<span style="font-size:var(--text-xs);padding:2px 8px;border-radius:4px;background:var(--accent-amber-dim);color:var(--accent-amber);margin-right:4px;">${c}</span>`
      ).join('') || ''}
    </div>` : ''}

    ${renderSystemicFlags(r.systemic_flags)}
    ${renderRecommendations(r.recommendations)}
    ${renderLabSuggestions(r.suggested_lab_tests)}`;
}

// ─── Tongue Results ───────────────────────────────

function renderTongueResults(r, m) {
  const scoreColor = r.overallScore >= 80 ? 'var(--accent-green)' : r.overallScore >= 55 ? 'var(--accent-amber)' : 'var(--accent-coral)';
  const bodyColors = { pale: 'var(--accent-blue)', pale_pink: 'var(--accent-blue)', normal_pink_red: 'var(--accent-green)', red: 'var(--accent-coral)', dark_red: 'var(--accent-coral)', purple: 'var(--accent-coral)', bluish: 'var(--accent-coral)', mixed: 'var(--accent-amber)' };

  return `
    <div class="card" style="text-align:center;">
      <h3 style="margin-bottom:var(--space-2);">${m.icon} ${m.label} Analysis</h3>
      <div style="font-family:var(--font-heading);font-size:var(--text-4xl);font-weight:var(--weight-extrabold);color:${scoreColor};">${r.overallScore}</div>
      <p style="font-size:var(--text-sm);color:var(--text-secondary);">Tongue Health Score</p>
      ${r.riskTier ? `<div style="margin-top:var(--space-2);"><span class="badge badge-${r.riskTier === 'Low' ? 'green' : r.riskTier === 'Moderate' ? 'amber' : 'coral'}">${r.riskTier} Risk</span></div>` : ''}
    </div>

    <!-- Body -->
    ${r.body ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Tongue Body</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-bottom:var(--space-3);">
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Color</div>
          <div style="font-size:var(--text-sm);font-weight:600;color:${bodyColors[r.body.color] || 'var(--text-primary)'};">${r.body.color?.replace(/_/g, ' ')}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Size</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${r.body.size?.replace(/_/g, ' ')}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Moisture</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${r.body.moisture?.replace(/_/g, ' ')}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Teeth Marks</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${r.body.teeth_marks ? 'Present' : 'None'}</div>
        </div>
      </div>
      ${r.body.color_significance ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);">${r.body.color_significance}</p>` : ''}
      ${r.body.cracks?.present ? `
      <div style="margin-top:var(--space-2);padding:var(--space-2);background:var(--accent-amber-dim);border-radius:var(--radius-md);">
        <p style="font-size:var(--text-xs);color:var(--accent-amber);font-weight:600;">Cracks detected: ${r.body.cracks.locations?.join(', ')}</p>
        <p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;">${r.body.cracks.significance || ''}</p>
      </div>` : ''}
    </div>` : ''}

    <!-- Coating -->
    ${r.coating ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Tongue Coating</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);">
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Thickness</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${r.coating.thickness?.replace(/_/g, ' ')}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Color</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${r.coating.color?.replace(/_/g, ' ')}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Distribution</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${r.coating.distribution?.replace(/_/g, ' ')}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Texture</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${r.coating.texture?.replace(/_/g, ' ')}</div>
        </div>
      </div>
      ${r.coating.coating_significance ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:var(--space-2);">${r.coating.coating_significance}</p>` : ''}
    </div>` : ''}

    <!-- TCM Interpretation -->
    ${r.tcm_interpretation ? `
    <div class="card" style="border-left:3px solid var(--accent-teal);">
      <h4 style="margin-bottom:var(--space-2);">TCM Interpretation</h4>
      <p style="font-size:var(--text-sm);font-weight:var(--weight-semibold);margin-bottom:var(--space-2);">${r.tcm_interpretation.primary_pattern}</p>
      ${r.tcm_interpretation.organ_systems_implicated?.length > 0 ? `
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-1);margin-bottom:var(--space-2);">
        ${r.tcm_interpretation.organ_systems_implicated.map(o =>
    `<span style="font-size:10px;padding:2px 8px;border-radius:4px;background:var(--accent-teal-dim);color:var(--accent-teal);">${o}</span>`
  ).join('')}
      </div>` : ''}
      ${r.tcm_interpretation.element_imbalance ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);">${r.tcm_interpretation.element_imbalance}</p>` : ''}
    </div>` : ''}

    <!-- Nutritional Deficiencies -->
    ${r.nutritional_deficiency_flags?.length > 0 ? `
    <div class="card card-sm" style="border-left:3px solid var(--accent-amber);">
      <h4 style="margin-bottom:var(--space-2);">Nutritional Flags</h4>
      ${r.nutritional_deficiency_flags.map(d =>
    `<div style="font-size:var(--text-xs);color:var(--text-secondary);padding:var(--space-1) 0;">• ${d}</div>`
  ).join('')}
    </div>` : ''}

    ${renderSystemicFlags(r.systemic_flags)}
    ${renderRecommendations(r.recommendations)}
    ${renderLabSuggestions(r.suggested_lab_tests)}`;
}

// ─── Nail Results ─────────────────────────────────

function renderNailResults(r, m) {
  const scoreColor = r.overallScore >= 80 ? 'var(--accent-green)' : r.overallScore >= 55 ? 'var(--accent-amber)' : 'var(--accent-coral)';

  return `
    <div class="card" style="text-align:center;">
      <h3 style="margin-bottom:var(--space-2);">${m.icon} ${m.label} Analysis</h3>
      <div style="font-family:var(--font-heading);font-size:var(--text-4xl);font-weight:var(--weight-extrabold);color:${scoreColor};">${r.overallScore}</div>
      <p style="font-size:var(--text-sm);color:var(--text-secondary);">Nail Health Score</p>
      ${r.riskTier ? `<div style="margin-top:var(--space-2);"><span class="badge badge-${r.riskTier === 'Low' ? 'green' : r.riskTier === 'Moderate' ? 'amber' : 'coral'}">${r.riskTier} Risk</span></div>` : ''}
    </div>

    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Nail Plate</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);">
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Color</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${r.nail_plate_color?.replace(/_/g, ' ')}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Pattern</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${r.color_pattern?.replace(/_/g, ' ')}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Shape</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${r.shape?.morphology?.replace(/_/g, ' ')}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Surface</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${r.surface_texture?.overall?.replace(/_/g, ' ')}</div>
        </div>
      </div>
      ${r.color_significance ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:var(--space-2);">${r.color_significance}</p>` : ''}
    </div>

    ${r.shape?.clubbing_present ? `
    <div class="card card-sm" style="border-left:3px solid var(--accent-coral);">
      <p style="font-size:var(--text-sm);font-weight:600;color:var(--accent-coral);">Clubbing detected — ${r.shape.clubbing_grade}</p>
      <p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;">${r.shape.clubbing_significance || 'May indicate lung, heart, or liver disease. Consult a physician.'}</p>
    </div>` : ''}

    ${r.fungal_infection?.suspected ? `
    <div class="card card-sm" style="border-left:3px solid var(--accent-amber);">
      <p style="font-size:var(--text-sm);font-weight:600;color:var(--accent-amber);">Fungal infection suspected — ${r.fungal_infection.pattern?.replace(/_/g, ' ')}</p>
      <p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;">Severity: ${r.fungal_infection.severity}. ${r.fungal_infection.nails_affected || ''}</p>
    </div>` : ''}

    ${renderSystemicFlags(r.systemic_flags)}
    ${renderRecommendations(r.recommendations)}
    ${renderLabSuggestions(r.suggested_lab_tests)}`;
}

// ─── Body Results ─────────────────────────────────

function renderBodyResults(r, m) {
  const scoreColor = r.overallScore >= 80 ? 'var(--accent-green)' : r.overallScore >= 55 ? 'var(--accent-amber)' : 'var(--accent-coral)';
  const postureScore = r.posture?.overall_posture_score || r.overallScore;
  const postureColor = postureScore >= 80 ? 'var(--accent-green)' : postureScore >= 55 ? 'var(--accent-amber)' : 'var(--accent-coral)';
  const scoliosisColors = { no_indicators: 'var(--accent-green)', mild_indicators: 'var(--accent-amber)', moderate_indicators: 'var(--accent-coral)', significant_indicators: 'var(--accent-coral)' };
  const imbalanceColors = { none: 'var(--accent-green)', mild: 'var(--accent-amber)', moderate: 'var(--accent-coral)', significant: 'var(--accent-coral)' };

  return `
    <div class="card" style="text-align:center;">
      <h3 style="margin-bottom:var(--space-2);">${m.label} Analysis</h3>
      <div style="font-family:var(--font-heading);font-size:var(--text-4xl);font-weight:var(--weight-extrabold);color:${scoreColor};">${r.overallScore}</div>
      <p style="font-size:var(--text-sm);color:var(--text-secondary);">Wellness Score</p>
      ${r.riskTier ? `<div style="margin-top:var(--space-2);"><span class="badge badge-${r.riskTier === 'Low' ? 'green' : r.riskTier === 'Moderate' ? 'amber' : 'coral'}">${r.riskTier} Risk</span></div>` : ''}
    </div>

    <!-- Postural Assessment -->
    ${r.posture ? `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3);">
        <h4>Postural Assessment</h4>
        <span style="font-family:var(--font-heading);font-weight:700;color:${postureColor};">${r.posture.overall_rating}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-1);">
        ${[
          { label: 'Head Position', value: r.posture.head_position },
          { label: 'Shoulders', value: r.posture.shoulder_position },
          { label: 'Shoulder Level', value: r.posture.shoulder_level },
          { label: 'Scapular', value: r.posture.scapular_position },
          { label: 'Spine', value: r.posture.spinal_pattern },
          { label: 'Lateral Curve', value: r.posture.lateral_curve_type },
          { label: 'Pelvis', value: r.posture.pelvic_position },
          { label: 'Knees', value: r.posture.knee_alignment },
          { label: 'Feet', value: r.posture.foot_position },
        ].filter(i => i.value && i.value !== 'neutral' && i.value !== 'even' && i.value !== 'none' && i.value !== 'cannot_assess').map(item => `
        <div style="display:flex;justify-content:space-between;padding:var(--space-1) 0;border-bottom:1px solid var(--border);">
          <span style="font-size:var(--text-xs);color:var(--text-secondary);">${item.label}</span>
          <span style="font-size:var(--text-xs);font-weight:600;">${item.value.replace(/_/g, ' ')}</span>
        </div>`).join('')}
      </div>
      ${r.posture.primary_observation ? `<p style="font-size:var(--text-xs);color:var(--accent-amber);margin-top:var(--space-3);">${r.posture.primary_observation}</p>` : ''}
    </div>` : ''}

    <!-- Scoliosis Screen -->
    ${r.scoliosis_screen ? `
    <div class="card card-sm" style="border-left:3px solid ${scoliosisColors[r.scoliosis_screen.screen_result] || 'var(--text-tertiary)'};">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2);">
        <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">Scoliosis Screen</span>
        <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:${scoliosisColors[r.scoliosis_screen.screen_result]}22;color:${scoliosisColors[r.scoliosis_screen.screen_result]};">${(r.scoliosis_screen.screen_result || '').replace(/_/g,' ')}</span>
      </div>
      ${r.scoliosis_screen.curve_pattern && r.scoliosis_screen.curve_pattern !== 'none' ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);">Curve pattern: ${r.scoliosis_screen.curve_pattern.replace(/_/g,' ')}</p>` : ''}
      ${r.scoliosis_screen.recommended_action && r.scoliosis_screen.recommended_action !== 'none' ? `<p style="font-size:var(--text-xs);color:var(--accent-amber);margin-top:4px;">Recommended: ${r.scoliosis_screen.recommended_action.replace(/_/g,' ')}</p>` : ''}
    </div>` : ''}

    <!-- Anterior Pelvic Tilt -->
    ${r.anterior_pelvic_tilt?.present ? `
    <div class="card card-sm" style="border-left:3px solid var(--accent-amber);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2);">
        <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">Anterior Pelvic Tilt</span>
        <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:var(--accent-amber-dim);color:var(--accent-amber);">${r.anterior_pelvic_tilt.severity}</span>
      </div>
      ${r.anterior_pelvic_tilt.functional_note ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);">${r.anterior_pelvic_tilt.functional_note}</p>` : ''}
      ${r.anterior_pelvic_tilt.indicators_observed?.length > 0 ? `<p style="font-size:10px;color:var(--text-tertiary);margin-top:4px;">${r.anterior_pelvic_tilt.indicators_observed.join(' · ')}</p>` : ''}
    </div>` : ''}

    <!-- Muscle Imbalance -->
    ${r.muscle_imbalance ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Muscle Imbalance</h4>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);">
        ${[
          { label: 'Upper Crossed Syndrome', value: r.muscle_imbalance.upper_crossed_syndrome },
          { label: 'Lower Crossed Syndrome', value: r.muscle_imbalance.lower_crossed_syndrome },
          { label: 'Dominant Side', value: r.muscle_imbalance.dominant_side_hypertrophy },
          { label: 'Leg Length Diff.', value: r.muscle_imbalance.apparent_leg_length_difference },
        ].filter(i => i.value && i.value !== 'none' && i.value !== 'cannot_assess').map(item => `
        <div style="display:flex;justify-content:space-between;padding:var(--space-1) 0;border-bottom:1px solid var(--border);">
          <span style="font-size:var(--text-xs);color:var(--text-secondary);">${item.label}</span>
          <span style="font-size:var(--text-xs);font-weight:600;color:${imbalanceColors[item.value] || 'var(--text-secondary)'};">${item.value.replace(/_/g, ' ')}</span>
        </div>`).join('')}
      </div>
      ${r.muscle_imbalance.notes ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:var(--space-2);">${r.muscle_imbalance.notes}</p>` : ''}
    </div>` : ''}

    <!-- Breathing Pattern -->
    ${r.breathing_pattern?.observable ? `
    <div class="card card-sm">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">Breathing Pattern</span>
        <span style="font-size:var(--text-xs);font-weight:600;color:${r.breathing_pattern.pattern === 'diaphragmatic' ? 'var(--accent-green)' : 'var(--accent-amber)'};">${(r.breathing_pattern.pattern || '').replace(/_/g, ' ')}</span>
      </div>
      ${r.breathing_pattern.wellness_note ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:var(--space-1);">${r.breathing_pattern.wellness_note}</p>` : ''}
    </div>` : ''}

    <!-- Body Composition -->
    ${r.body_composition ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Body Composition</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);">
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Build Type</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${(r.body_composition.build_type || '—').replace(/_/g, ' ')}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Fat Distribution</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${(r.body_composition.fat_distribution || '—').replace(/_/g, ' ')}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Muscle Development</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${(r.body_composition.muscle_development || '—').replace(/_/g, ' ')}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Android Pattern</div>
          <div style="font-size:var(--text-sm);font-weight:600;color:${r.body_composition.android_pattern_present ? 'var(--accent-amber)' : 'var(--accent-green)'};">${r.body_composition.android_pattern_present ? 'Present' : 'Not detected'}</div>
        </div>
      </div>
      ${r.body_composition.metabolic_note ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:var(--space-2);">${r.body_composition.metabolic_note}</p>` : ''}
    </div>` : ''}

    <!-- Lymphatic Signals -->
    ${r.lymphatic_signals && Object.values(r.lymphatic_signals).some(v => v !== 'none' && v !== undefined) ? `
    <div class="card card-sm">
      <h4 style="margin-bottom:var(--space-2);">Lymphatic Signals</h4>
      <div style="display:flex;flex-direction:column;gap:var(--space-1);">
        ${[
          { label: 'Ankle Puffiness', value: r.lymphatic_signals.ankle_puffiness },
          { label: 'Hand Puffiness', value: r.lymphatic_signals.hand_puffiness },
          { label: 'General Puffiness', value: r.lymphatic_signals.general_puffiness },
        ].filter(i => i.value && i.value !== 'none').map(item => `
        <div style="display:flex;justify-content:space-between;">
          <span style="font-size:var(--text-xs);color:var(--text-secondary);">${item.label}</span>
          <span style="font-size:var(--text-xs);font-weight:600;color:var(--accent-amber);">${item.value}</span>
        </div>`).join('')}
      </div>
      ${r.lymphatic_signals.wellness_note ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:var(--space-2);">${r.lymphatic_signals.wellness_note}</p>` : ''}
    </div>` : ''}

    <!-- Symmetry -->
    ${r.symmetry && r.symmetry.overall !== 'symmetric' ? `
    <div class="card card-sm">
      <h4 style="margin-bottom:var(--space-2);">Symmetry</h4>
      <div style="display:flex;flex-direction:column;gap:var(--space-1);">
        ${[
          { label: 'Overall', value: r.symmetry.overall },
          { label: 'Shoulders', value: r.symmetry.shoulder_level },
          { label: 'Hips', value: r.symmetry.hip_level },
        ].filter(i => i.value && i.value !== 'even' && i.value !== 'symmetric').map(item => `
        <div style="display:flex;justify-content:space-between;">
          <span style="font-size:var(--text-xs);color:var(--text-secondary);">${item.label}</span>
          <span style="font-size:var(--text-xs);font-weight:600;">${item.value.replace(/_/g,' ')}</span>
        </div>`).join('')}
      </div>
    </div>` : ''}

    <!-- Wellness Observations -->
    ${r.wellness_observations?.length > 0 ? `
    <div class="section-heading"><h3>Wellness Observations</h3></div>
    ${r.wellness_observations.map(obs => {
      const urgencyColor = obs.urgency === 'seek_attention' ? 'var(--accent-coral)' : obs.urgency === 'discuss_with_doctor' ? 'var(--accent-amber)' : 'var(--text-tertiary)';
      return `
      <div class="card card-sm" style="border-left:3px solid ${urgencyColor};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-1);">
          <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${obs.finding}</span>
          <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:${urgencyColor}22;color:${urgencyColor};">${(obs.urgency || '').replace(/_/g,' ')}</span>
        </div>
        ${obs.location ? `<p style="font-size:10px;color:var(--text-tertiary);">Location: ${obs.location}</p>` : ''}
        <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;">${obs.significance}</p>
      </div>`;
    }).join('')}` : ''}

    ${renderRecommendations(r.recommendations)}
    ${r.suggested_followup?.length > 0 ? renderLabSuggestions(r.suggested_followup) : renderLabSuggestions(r.suggested_assessments)}`;

  return `
    <div class="card" style="text-align:center;">
      <h3 style="margin-bottom:var(--space-2);">${m.icon} ${m.label} Analysis</h3>
      <div style="font-family:var(--font-heading);font-size:var(--text-4xl);font-weight:var(--weight-extrabold);color:${scoreColor};">${r.overallScore}</div>
      <p style="font-size:var(--text-sm);color:var(--text-secondary);">Wellness Score</p>
      ${r.riskTier ? `<div style="margin-top:var(--space-2);"><span class="badge badge-${r.riskTier === 'Low' ? 'green' : r.riskTier === 'Moderate' ? 'amber' : 'coral'}">${r.riskTier} Risk</span></div>` : ''}
    </div>

    ${r.posture ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Postural Assessment</h4>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3);">
        <span style="font-size:var(--text-sm);">Overall Posture</span>
        <span style="font-family:var(--font-heading);font-weight:700;color:${postureColor};">${r.posture.overall_rating}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);">
        ${[
        { label: 'Head Position', value: r.posture.head_position },
        { label: 'Shoulders', value: r.posture.shoulder_position },
        { label: 'Spine', value: r.posture.spinal_alignment },
        { label: 'Pelvis', value: r.posture.pelvic_tilt },
      ].map(item => `
        <div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px solid var(--border);">
          <span style="font-size:var(--text-xs);color:var(--text-secondary);">${item.label}</span>
          <span style="font-size:var(--text-xs);font-weight:600;">${item.value?.replace(/_/g, ' ') || '—'}</span>
        </div>`).join('')}
      </div>
      ${r.posture.primary_concern ? `<p style="font-size:var(--text-xs);color:var(--accent-amber);margin-top:var(--space-2);">${r.posture.primary_concern}</p>` : ''}
    </div>` : ''}

    ${r.body_composition ? `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Body Composition</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);">
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Build Type</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${r.body_composition.build_type?.replace(/_/g, ' ')}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Fat Distribution</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${r.body_composition.fat_distribution?.replace(/_/g, ' ')}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Muscle Definition</div>
          <div style="font-size:var(--text-sm);font-weight:600;">${r.body_composition.muscle_definition}</div>
        </div>
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;color:var(--text-tertiary);">Central Adiposity</div>
          <div style="font-size:var(--text-sm);font-weight:600;color:${r.body_composition.central_adiposity_present ? 'var(--accent-amber)' : 'var(--accent-green)'};">${r.body_composition.central_adiposity_present ? 'Present' : 'Not detected'}</div>
        </div>
      </div>
    </div>` : ''}

    ${renderSystemicFlags(r.visible_health_flags || r.systemic_flags)}
    ${renderRecommendations(r.recommendations)}
    ${r.suggested_assessments?.length > 0 ? renderLabSuggestions(r.suggested_assessments) : ''}`;
}

// ─── Shared render helpers ────────────────────────

function renderSystemicFlags(flags) {
  if (!flags?.length) return '';
  return `
    <div class="section-heading"><h3>Systemic Signals</h3></div>
    ${flags.map(flag => {
    const urgencyColor = flag.urgency === 'urgent' ? 'var(--accent-coral)' : flag.urgency === 'consult' ? 'var(--accent-amber)' : 'var(--text-tertiary)';
    const label = flag.indicator || flag.finding || '';
    const detail = flag.significance || '';
    return `
      <div class="card card-sm" style="border-left:3px solid ${urgencyColor};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-1);">
          <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${label}</span>
          <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:${urgencyColor}22;color:${urgencyColor};">${flag.urgency || 'monitor'}</span>
        </div>
        <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;">${detail}</p>
        ${flag.confidence ? `<p style="font-size:10px;color:var(--text-tertiary);margin-top:var(--space-1);">Confidence: ${flag.confidence}</p>` : ''}
      </div>`;
  }).join('')}`;
}

function renderRecommendations(recs) {
  if (!recs?.length) return '';
  return `
    <div class="section-heading"><h3>Recommendations</h3></div>
    ${recs.map(rec => {
    const text = typeof rec === 'string' ? rec : rec.text || '';
    const priority = typeof rec === 'object' ? rec.priority : null;
    const color = priority === 'high' ? 'var(--accent-coral)' : priority === 'medium' ? 'var(--accent-amber)' : 'var(--accent-green)';
    return `
      <div class="card card-sm" style="border-left:3px solid ${color};">
        ${priority ? `<span style="font-size:10px;font-weight:600;text-transform:uppercase;color:${color};">${priority} priority</span>` : ''}
        <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;${priority ? 'margin-top:4px;' : ''}">${text}</p>
      </div>`;
  }).join('')}`;
}

function renderLabSuggestions(labs) {
  if (!labs?.length) return '';
  return `
    <div class="card" style="border-left:3px solid var(--accent-teal);">
      <h4 style="margin-bottom:var(--space-2);">Suggested Lab Tests</h4>
      ${labs.map(l => `<div style="font-size:var(--text-xs);color:var(--text-secondary);padding:var(--space-1) 0;">• ${l}</div>`).join('')}
      <p style="font-size:10px;color:var(--text-tertiary);margin-top:var(--space-2);">These tests would help confirm or rule out the visual findings above.</p>
    </div>`;
}

function renderGenericResults(r, m) {
  return `
    <div class="card" style="text-align:center;">
      <h3>${m.icon} ${m.label}</h3>
      <div style="font-size:var(--text-4xl);font-weight:700;color:var(--accent-teal);margin:var(--space-3) 0;">${r.overallScore || '—'}</div>
    </div>
    ${renderRecommendations(r.recommendations)}`;
}

// ═══════════════════════════════════════════════════
//  Heart Rate Results
// ═══════════════════════════════════════════════════

function showHeartRateResults(result) {
  const resultsDiv = document.getElementById('scan-results');
  resultsDiv.classList.remove('hidden');

  const hrZone = result.hr < 60 ? 'Resting' : result.hr < 100 ? 'Normal' : result.hr < 140 ? 'Elevated' : 'High';
  const zoneColor = result.hr < 60 ? 'var(--accent-blue)' : result.hr < 100 ? 'var(--accent-green)' : result.hr < 140 ? 'var(--accent-amber)' : 'var(--accent-coral)';

  resultsDiv.innerHTML = `
    <div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);margin-top:var(--space-4);">
      <div class="card" style="text-align:center;">
        <h3 style="margin-bottom:var(--space-4);">Heart Rate Results</h3>
        <div class="hr-display" style="justify-content:center;margin-bottom:var(--space-4);">
          <div class="hr-pulse" style="color:var(--accent);">${icons.heart}</div>
          <div>
            <div class="hr-value" style="color:${zoneColor};">${result.hr}</div>
            <div class="hr-label">BPM</div>
          </div>
        </div>
        <div style="display:flex;justify-content:center;gap:var(--space-4);">
          <div class="stat-card" style="align-items:center;">
            <div class="stat-value" style="font-size:var(--text-xl);">${result.hrv}</div>
            <div class="stat-label">HRV (ms)</div>
          </div>
          <div class="stat-card" style="align-items:center;">
            <div class="stat-value" style="font-size:var(--text-xl);color:${zoneColor};">${hrZone}</div>
            <div class="stat-label">Zone</div>
          </div>
          <div class="stat-card" style="align-items:center;">
            <div class="stat-value" style="font-size:var(--text-xl);">${result.confidence}%</div>
            <div class="stat-label">Confidence</div>
          </div>
        </div>
      </div>
      <div class="card card-sm">
        <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-2);">
          <span class="badge ${result.quality === 'Good' ? 'badge-green' : result.quality === 'Fair' ? 'badge-amber' : 'badge-coral'}">${result.quality} Signal</span>
          <span style="font-size:var(--text-xs);color:var(--text-tertiary);">${result.sampleRate} fps over ${result.duration}s</span>
        </div>
        <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;">${getHRInterpretation(result.hr)}</p>
      </div>
      <div class="disclaimer-banner">
        <span class="icon">${icons.alert}</span>
        <span>rPPG heart rate measurement is an estimation technique. For clinical accuracy use a dedicated pulse oximeter or medical-grade device.</span>
      </div>
      <button class="btn btn-primary btn-block" id="new-scan-btn">New Scan</button>
    </div>`;

  resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('new-scan-btn')?.addEventListener('click', () => renderBodyScanner());
}

function getHRInterpretation(hr) {
  if (hr < 50) return 'Very low resting heart rate. Common in highly trained athletes. If you experience dizziness or fatigue, consult a doctor.';
  if (hr < 60) return 'Low resting heart rate (bradycardia range). Normal for fit individuals. Monitor for symptoms.';
  if (hr < 80) return 'Excellent resting heart rate. Suggests good cardiovascular fitness and autonomic nervous system health.';
  if (hr < 100) return 'Normal resting heart rate. Within healthy range for most adults.';
  if (hr < 120) return 'Slightly elevated. Could indicate recent activity, stress, caffeine, or dehydration.';
  return 'Elevated heart rate. Monitor stress, hydration, and caffeine. Seek medical advice if persistent at rest.';
}

// ═══════════════════════════════════════════════════
//  HR Trend + Scan History
// ═══════════════════════════════════════════════════

function renderHRTrend(readings) {
  const avg = Math.round(readings.reduce((s, r) => s + r.hr, 0) / readings.length);
  return `
    <div class="card" style="margin-top:var(--space-4);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3);">
        <h4>Recent HR Trend</h4>
        <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);color:var(--accent-teal);">Avg: ${avg} BPM</span>
      </div>
      <div style="display:flex;align-items:flex-end;gap:var(--space-2);height:60px;">
        ${readings.slice().reverse().map(r => {
    const h = Math.max(10, Math.min(100, (r.hr - 40) / 1.2));
    const c = r.hr < 100 ? 'var(--accent-teal)' : 'var(--accent-amber)';
    return `<div style="flex:1;height:${h}%;background:${c};border-radius:var(--radius-sm) var(--radius-sm) 0 0;opacity:0.8;" title="${r.hr} BPM"></div>`;
  }).join('')}
      </div>
      <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-2);">${readings.length} readings</p>
    </div>`;
}

function renderScanHistory(history) {
  if (history.length === 0) {
    return `<div class="card" style="text-align:center;padding:var(--space-8);">
      <div style="margin-bottom:var(--space-3);color:var(--text-tertiary);display:flex;justify-content:center;">${icons.body}</div>
      <h4>No scans yet</h4>
      <p style="font-size:var(--text-sm);color:var(--text-tertiary);">Select a mode above and take your first scan</p>
    </div>`;
  }

  return history.map(s => {
    const m = MODES.find(x => x.id === s.scan_type) || { icon: icons.body, label: s.scan_type };
    const t = s.scanned_at
      ? new Date(s.scanned_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Recently';
    const scoreColor = (s.overall_score || 0) >= 75 ? 'var(--accent-green)' : (s.overall_score || 0) >= 50 ? 'var(--accent-amber)' : 'var(--accent-coral)';

    return `<div class="card card-sm">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;align-items:center;gap:var(--space-3);">
          <div style="width:36px;height:36px;border-radius:var(--radius-md);background:var(--accent-purple-dim);display:flex;align-items:center;justify-content:center;font-size:18px;">${m.icon}</div>
          <div>
            <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${m.label}</div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${t}${s.hr ? ' • ' + s.hr + ' BPM' : ''}${s.risk_tier ? ' • ' + s.risk_tier : ''}</div>
          </div>
        </div>
        <div style="font-family:var(--font-heading);font-weight:var(--weight-bold);color:${scoreColor};">
          ${s.scan_type === 'heart' && s.hr ? s.hr + '<span style="font-size:var(--text-xs);color:var(--text-tertiary);"> BPM</span>' : (s.overall_score || 0) + '%'}
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
    <div class="quality-dot"><div class="scanner-status-dot ${dot(quality.blur.pass)}"></div>${quality.blur.label}</div>
    <div class="quality-dot"><div class="scanner-status-dot ${dot(quality.exposure.pass)}"></div>${quality.exposure.label}</div>
    ${activeMode === 'face' || activeMode === 'heart' ? `<div class="quality-dot"><div class="scanner-status-dot ${dot(face.detected)}"></div>${face.detected ? 'Face OK' : 'No Face'}</div>` : ''}
  `;
  const statusEl = document.getElementById('scanner-status');
  if (statusEl && activeMode !== 'heart') {
    const allPass = quality.pass && (activeMode !== 'face' || face.detected);
    updateStatus(statusEl, allPass ? 'green' : 'amber', allPass ? 'Ready — tap Capture' : 'Adjust position/lighting');
  }
}

function updateStatus(el, color, text) {
  if (!el) return;
  el.innerHTML = `<div class="scanner-status-dot ${color} ${color === 'red' ? 'pulse' : ''}"></div><span>${text}</span>`;
}

function updateCaptureProgressRing(progress) {
  const container = document.getElementById('capture-progress');
  if (!container) return;
  const r = 22, circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - progress);
  container.innerHTML = `
    <svg width="52" height="52">
      <circle cx="26" cy="26" r="${r}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>
      <circle cx="26" cy="26" r="${r}" fill="none" stroke="var(--accent-coral)" stroke-width="3"
        stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
      <text x="26" y="30" text-anchor="middle" fill="white" font-size="11" font-weight="600">${Math.round(progress * 100)}%</text>
    </svg>`;
}

