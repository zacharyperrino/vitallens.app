// Pulse (rPPG) output: the measured / unmeasured result views and the capture ring.
// Capture itself runs in index.js, which owns the camera and rPPG engine state.
import { icons } from '../../icons.js';
import { esc } from '../../utils/esc.js';
import { activeMode, attachScanHandlers, renderBodyScanner, renderScannerForMode, startCameraScan } from './index.js';
import { TONE, num } from './shared.js';

export function showHeartRateUnmeasured(result) {
  const resultsDiv = document.getElementById('scan-results');
  if (!resultsDiv) return;
  resultsDiv.classList.remove('hidden');
  const reason = result?.reason || 'No steady pulse rhythm was found in the video';
  resultsDiv.innerHTML = `
    <div class="empty-state card mt-4" role="alert">
      <h2 class="h3">Couldn't measure a pulse</h2>
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

// ═══════════════════════════════════════════════════
//  Pulse Results
// ═══════════════════════════════════════════════════

export function showHeartRateResults(result) {
  const resultsDiv = document.getElementById('scan-results');
  resultsDiv.classList.remove('hidden');

  const hr = Number(result.hr);
  const hrZone = hr < 60 ? 'Below typical resting' : hr < 100 ? 'Typical resting range' : hr < 140 ? 'Above typical resting' : 'Well above typical resting';
  const zoneTone = hr < 60 ? TONE.neutral : hr < 100 ? TONE.good : TONE.watch;
  const qualityClass = result.quality === 'Good' ? 'badge-green' : result.quality === 'Fair' ? 'badge-amber' : 'badge-coral';

  resultsDiv.innerHTML = `
    <div class="stagger-children flex-col gap-4 mt-4">
      <div class="card text-center">
        <h2 class="h3 mb-4">Pulse Estimate</h2>
        <div class="hr-display justify-center mb-4">
          <div class="hr-pulse text-accent" aria-hidden="true">${icons.heart}</div>
          <div>
            <div class="hr-value" style="color:${zoneTone.color};">${num(hr)}</div>
            <div class="hr-label">BPM (estimated)</div>
          </div>
        </div>
        <div class="flex justify-center gap-4 flex-wrap">
          <div class="stat-card items-center">
            <div class="stat-value text-xl">${result.hrv == null ? '—' : num(result.hrv)}</div>
            <div class="stat-label">${result.hrv == null ? 'HRV not measurable' : 'HRV (ms, rough)'}</div>
          </div>
          <div class="stat-card items-center">
            <div class="stat-value" style="font-size:var(--text-md);color:${zoneTone.color};">${esc(hrZone)}</div>
            <div class="stat-label">Range</div>
          </div>
          <div class="stat-card items-center">
            <div class="stat-value text-xl">${num(result.confidence)}%</div>
            <div class="stat-label">Signal confidence</div>
          </div>
        </div>
      </div>
      <div class="card card-sm">
        <div class="flex items-center gap-2 mb-2 flex-wrap">
          <span class="badge ${qualityClass}">${esc(result.quality)} signal</span>
          <span class="text-tertiary text-xs">${num(result.sampleRate)} fps over ${num(result.duration)}s</span>
        </div>
        <p class="text-xs text-secondary" style="line-height:1.5;">${esc(getHRInterpretation(hr))}</p>
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

export function updateCaptureProgressRing(progress) {
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
