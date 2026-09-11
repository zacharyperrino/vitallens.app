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
        <h3 class="h4">Recent Pulse Trend</h3>
        <span class="text-sm font-semibold text-green">Avg: ${avg} BPM</span>
      </div>
      <div class="flex items-end gap-2" style="height:60px;" role="img" aria-label="Recent pulse estimates, oldest to newest: ${esc(summary)} BPM. Average ${avg} BPM.">
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
      <h2 class="h3">Couldn't load your check-in history</h2>
      <p>Check your connection and try again. Your past check-ins are safe.</p>
      <button type="button" class="btn btn-sm" id="history-retry">Try again</button>
    </div>`;
  }

  if (!history.length) {
    return `<div class="empty-state card">
      <div class="text-tertiary flex justify-center" aria-hidden="true">${icons.body}</div>
      <h2 class="h3">No check-ins yet</h2>
      <p>Pick a type above and take your first one.</p>
    </div>`;
  }

  return history.map(s => {
    const m = MODES.find(x => x.id === s.scan_type) || { icon: icons.body, label: s.scan_type || 'Check-in' };
    const t = s.scanned_at
      ? new Date(s.scanned_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Recently';
    const hasScore = s.overall_score !== null && s.overall_score !== undefined && Number.isFinite(Number(s.overall_score));
    const score = hasScore ? Number(s.overall_score) : null;
    const tone = scoreTone(score ?? 0);
    const isPulse = s.scan_type === 'heart' && Number.isFinite(Number(s.hr));

    return `<div class="card card-sm">
      <div class="flex-between">
        <div class="flex items-center gap-3">
          <div class="rounded-md flex items-center justify-center" style="width:36px;height:36px;background:var(--accent-purple-dim);font-size:18px;" aria-hidden="true">${m.icon}</div>
          <div>
            <div class="font-semibold text-sm">${esc(m.label)}</div>
            <div class="text-tertiary text-xs">${esc(t)}${isPulse ? ` • ${num(s.hr)} BPM` : ''}</div>
          </div>
        </div>
        <div style="font-family:var(--font-heading);font-weight:var(--weight-bold);color:${isPulse ? 'var(--text-primary)' : tone.color};">
          ${isPulse ? `${num(s.hr)}<span class="text-tertiary text-xs"> BPM</span>` : hasScore ? `${score}<span class="text-tertiary text-xs">/100</span>` : '<span class="text-tertiary text-xs">No score</span>'}
        </div>
      </div>
    </div>`;
  }).join('');
}
