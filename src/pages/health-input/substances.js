// Substances tab: supplements, prescriptions and recreational substances.
import { apiFetch } from '../../utils/api.js';
import { esc } from '../../utils/esc.js';
import { currentUserId, loadErrorState } from './index.js';

// ═══════════════════════════════════════
//  Substances Tab
// ═══════════════════════════════════════

const SUBSTANCE_CATEGORIES = {
  supplement: { bg: 'var(--viz-green-dim)', text: 'var(--viz-green)', label: 'Supplement' },
  prescription: { bg: 'var(--accent-dim)', text: 'var(--accent)', label: 'Prescription' },
  recreational: { bg: 'var(--viz-neutral-dim)', text: 'var(--viz-neutral)', label: 'Recreational' },
};

export async function renderSubstances() {
  let supplements = [];
  let loadError = null;
  try {
    const res = await apiFetch(`/api/supplements?userId=${encodeURIComponent(currentUserId)}`);
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    const data = await res.json();
    supplements = data.supplements || [];
  } catch (e) {
    loadError = e;
  }

  const list = loadError
    ? loadErrorState('your substances', loadError, 'substances-retry')
    : supplements.length > 0
      ? supplements.map(s => {
        const cat = SUBSTANCE_CATEGORIES[s.category] || SUBSTANCE_CATEGORIES.supplement;
        return `<div class="card card-sm">
        <div class="flex justify-between items-start gap-3">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <div class="font-semibold text-sm">${esc(s.name)}</div>
              <span class="badge" style="background:${cat.bg};color:${cat.text};font-size:var(--text-xs);">${cat.label}</span>
            </div>
            <div class="text-tertiary text-xs">
              ${s.dose ? esc(s.dose) + ' • ' : ''}${esc(s.frequency || 'Frequency not set')}
              ${s.notes ? '<br>' + esc(s.notes) : ''}
            </div>
          </div>
          <button type="button" class="btn btn-sm btn-ghost substance-delete text-tertiary text-xs" data-id="${esc(s.id)}" aria-label="Remove ${esc(s.name)}">✕</button>
        </div>
      </div>`;
      }).join('')
      : '<div class="empty-state"><p>No substances logged yet.</p></div>';

  return `<div class="stagger-children flex-col gap-4">
    <div class="card">
      <h2 class="h4 mb-4">Log a substance</h2>
      <form id="substance-form" class="flex-col gap-3">
        <div class="input-group"><label for="substance-name">Name</label>
          <input class="input-field" type="text" id="substance-name" placeholder="e.g. Magnesium, Metformin">
        </div>
        <div class="input-group"><label for="substance-category">Category</label>
          <select class="input-field" id="substance-category">
            <option value="">Select a category…</option>
            <option value="supplement">Supplement</option>
            <option value="prescription">Prescription</option>
            <option value="recreational">Recreational</option>
          </select>
        </div>
        <div class="grid-2">
          <div class="input-group"><label for="substance-dose">Dose</label><input class="input-field" type="text" id="substance-dose" placeholder="e.g. 500mg"></div>
          <div class="input-group"><label for="substance-frequency">Frequency</label>
            <select class="input-field" id="substance-frequency">
              <option value="">Select…</option>
              <option>Once daily</option>
              <option>Twice daily</option>
              <option>Three times daily</option>
              <option>As needed</option>
              <option>Weekly</option>
              <option>Monthly</option>
            </select>
          </div>
        </div>
        <div class="input-group"><label for="substance-notes">Notes (optional)</label>
          <input class="input-field" type="text" id="substance-notes" placeholder="Any notes about this substance…">
        </div>
        <button type="submit" class="btn btn-primary btn-block">Add substance</button>
      </form>
    </div>

    <div class="section-heading"><h2 class="text-md font-semibold">Active substances</h2>${loadError ? '' : `<span class="badge badge-teal">${supplements.length}</span>`}</div>
    ${list}
  </div>`;
}
