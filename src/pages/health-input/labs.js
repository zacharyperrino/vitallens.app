// Labs tab: report upload zone, single-result form, saved-result cards.
import { icons } from '../../icons.js';
import { labResults } from '../../lib/db.js';
import { esc } from '../../utils/esc.js';
import { loadErrorState } from './index.js';

// ═══════════════════════════════════════
//  Labs Tab
// ═══════════════════════════════════════

function labStatusText(status) {
  if (status === 'high') return '↑ above range';
  if (status === 'low') return '↓ below range';
  if (status === 'critical') return '! well outside range';
  return '';
}

export function labStatusColor(status) {
  if (status === 'high' || status === 'critical') return 'var(--error)';
  if (status === 'low') return 'var(--viz-amber)';
  if (status === 'normal') return 'var(--viz-green)';
  return 'var(--text-primary)';
}

export async function renderLabs() {
  let labs = [];
  let loadError = null;
  try { labs = await labResults.getAll(); } catch (e) { loadError = e; }

  const savedList = loadError
    ? loadErrorState('your saved lab results', loadError, 'labs-retry')
    : labs.length > 0
      ? labs.slice(0, 10).map(renderLabCard).join('')
      : '<div class="empty-state"><p>No lab results logged yet.</p></div>';

  return `<div class="stagger-children flex-col gap-4">

    <div class="card">
      <h2 class="h4 mb-2">Upload a lab report</h2>
      <p class="disclaimer mb-3">
        Upload a PDF or photo of a blood panel, hormone panel, or other lab report. We'll read the markers from it for you to review before anything is saved.
      </p>
      <input type="file" accept=".pdf,image/*" id="lab-pdf-input" class="visually-hidden" tabindex="-1" aria-hidden="true">
      <button type="button" class="upload-zone w-full p-4" id="lab-pdf-zone" style="min-height:0;" aria-describedby="lab-pdf-help">
        <span class="text-tertiary flex justify-center" aria-hidden="true">${icons.droplet}</span>
        <span class="block text-sm font-semibold text-primary">Drop a PDF or photo here, or tap to choose a file</span>
        <span id="lab-pdf-help" class="block text-xs text-tertiary">PDF, JPG or PNG up to 20MB</span>
      </button>
      <div id="lab-parse-status" aria-live="polite" style="display:none;margin-top:var(--space-3);"></div>
      <div id="lab-parse-results" aria-live="polite" style="display:none;margin-top:var(--space-3);"></div>
    </div>

    <div class="card">
      <h2 class="h4 mb-4">Add a single result</h2>
      <form id="lab-form" class="flex-col gap-3">
        <div class="input-group"><label for="lab-name">Test name</label>
          <select class="input-field" id="lab-name">
            <option value="">Select a test…</option>
            <option>Complete Blood Count (CBC)</option>
            <option>Vitamin D</option><option>Vitamin B12</option>
            <option>Iron / Ferritin</option><option>Thyroid Panel (TSH)</option>
            <option>Cholesterol (Total)</option><option>HDL Cholesterol</option>
            <option>LDL Cholesterol</option><option>Triglycerides</option>
            <option>Fasting Glucose</option><option>HbA1c</option>
            <option>Testosterone</option><option>Cortisol</option>
            <option>Magnesium</option><option>Zinc</option>
            <option>CRP (Inflammation)</option>
          </select>
        </div>
        <div class="grid-2">
          <div class="input-group"><label for="lab-value">Value</label><input class="input-field" type="number" step="any" id="lab-value" placeholder="e.g. 45"></div>
          <div class="input-group"><label for="lab-unit">Unit</label><input class="input-field" type="text" id="lab-unit" placeholder="e.g. ng/mL"></div>
        </div>
        <div class="input-group"><label for="lab-date">Date</label><input class="input-field" type="date" id="lab-date"></div>
        <button type="submit" class="btn btn-primary btn-block">Save result</button>
      </form>
    </div>

    <div class="section-heading"><h2 class="text-md font-semibold">Saved results</h2>${loadError ? '' : `<span class="badge badge-teal">${labs.length}</span>`}</div>
    ${savedList}
  </div>`;
}

function renderLabCard(l) {
  const markers = l.markers || {};
  const markerKeys = Object.keys(markers);
  const firstName = markerKeys[0];
  const firstMarker = markers[firstName] || {};
  const displayValue = firstMarker.value ?? l.value ?? '—';
  const displayUnit = firstMarker.unit ?? l.unit ?? '';
  const displayName = firstName ?? l.panel_type ?? 'Lab result';
  const date = l.collected_at || l.uploaded_at?.split('T')[0] || '';
  const markerCount = markerKeys.length;
  const hasAbnormal = markerKeys.some(k => ['high', 'low', 'critical'].includes(markers[k]?.status));
  const singleStatus = markerCount === 1 ? labStatusText(firstMarker.status) : '';

  return `<div class="card card-sm">
    <div class="flex-between gap-3">
      <div>
        <div class="font-semibold text-sm">${esc(l.panel_type || displayName)}</div>
        <div class="text-tertiary text-xs">
          ${esc(date)}${markerCount > 1 ? ` • ${markerCount} markers` : ''}
          ${hasAbnormal ? ' • <span class="text-amber">Outside the report\'s reference range</span>' : ''}
        </div>
      </div>
      <div class="text-right">
        ${markerCount === 1 ? `
          <div style="font-family:var(--font-heading);font-weight:var(--weight-bold);color:${labStatusColor(firstMarker.status)};">${esc(displayValue)}</div>
          <div class="text-tertiary text-xs">${esc(displayUnit)}${singleStatus ? ` · ${singleStatus}` : ''}</div>
        ` : `
          <div class="badge badge-teal">${markerCount} markers</div>
        `}
      </div>
    </div>
    ${markerCount > 1 ? `
    <div class="mt-2 flex flex-wrap gap-1">
      ${markerKeys.slice(0, 6).map(k => {
        const m = markers[k] || {};
        const status = labStatusText(m.status);
        return `<span style="font-size:var(--text-xs);padding:2px 6px;border-radius:4px;background:var(--surface-2);color:${labStatusColor(m.status)};">${esc(k)}: ${esc(m.value)}${esc(m.unit || '')}${status ? ` ${status.charAt(0)}` : ''}</span>`;
      }).join('')}
      ${markerKeys.length > 6 ? `<span class="text-xs text-tertiary" style="padding:2px 6px;">+${markerKeys.length - 6} more</span>` : ''}
    </div>` : ''}
  </div>`;
}
