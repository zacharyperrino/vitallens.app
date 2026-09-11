// Recent pulse trend bars and the check-in history list.
import { icons } from '../../icons.js';
import { esc } from '../../utils/esc.js';
import { MODES, num, scoreTone } from './shared.js';

// ═══════════════════════════════════════════════════
//  Pulse Trend + Check-In History
// ═══════════════════════════════════════════════════

export function renderHRTrend(readings) {
  const valid = readings.filter(r => Number.isFinite(Number(r.hr)));
  if (valid.length < 2) return '';
  const avg = Math.round(valid.reduce((s, r) => s + Number(r.hr), 0) / valid.length);
  const ordered = valid.slice().reverse();
  const summary = ordered.map(r => `${Math.round(Number(r.hr))}`).join(', ');
  return `
    <div class="card mt-4">
      <div class="flex-between mb-3">
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
      <p class="mt-2 text-tertiary text-xs">${valid.length} readings · green = typical resting range, amber = above it</p>
    </div>`;
}

export function renderScanHistory(history, loadFailed) {
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
      <div class="flex-between">
        <div style="display:flex;align-items:center;gap:var(--space-3);">
          <div style="width:36px;height:36px;border-radius:var(--radius-md);background:var(--accent-purple-dim);display:flex;align-items:center;justify-content:center;font-size:18px;" aria-hidden="true">${m.icon}</div>
          <div>
            <div class="font-semibold text-sm">${esc(m.label)}</div>
            <div class="text-tertiary text-xs">${esc(t)}${isPulse ? ` • ${num(s.hr)} BPM` : ''}</div>
          </div>
        </div>
        <div style="font-family:var(--font-heading);font-weight:var(--weight-bold);color:${isPulse ? 'var(--text-primary)' : tone.color};">
          ${isPulse ? `${num(s.hr)}<span class="text-tertiary text-xs"> BPM</span>` : `${score}<span class="text-tertiary text-xs">/100</span>`}
        </div>
      </div>
    </div>`;
  }).join('');
}
