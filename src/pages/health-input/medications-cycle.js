// Medications (log only) and Cycle tabs.
import { apiFetch } from '../../utils/api.js';
import { esc } from '../../utils/esc.js';
import { todayLocalISO } from '../../utils/dates.js';
import { currentUserId, loadErrorState } from './index.js';

// ═══════════════════════════════════════
// MEDICATIONS — a log, nothing more. No interaction checks, no dosage advice.
// ═══════════════════════════════════════
export async function renderMedications() {
  let meds = []; let loadError = null;
  try {
    const res = await apiFetch(`/api/medications?userId=${encodeURIComponent(currentUserId)}`);
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    meds = (await res.json()).medications || [];
  } catch (e) { loadError = e; }

  return `<div class="stagger-children flex-col gap-4">
    <div class="card">
      <h4 class="mb-2">Log a medication</h4>
      <p class="disclaimer mb-3">A private record for your own reference. VitalLens does not check interactions or suggest doses — follow your prescriber's instructions.</p>
      <form id="medication-form" class="flex-col gap-3">
        <div class="input-group"><label for="med-name">Name</label><input class="input-field" id="med-name" type="text" required placeholder="e.g. Levothyroxine"></div>
        <div class="grid-2">
          <div class="input-group"><label for="med-dose">Dose (as prescribed)</label><input class="input-field" id="med-dose" type="text" placeholder="e.g. 50 mcg"></div>
          <div class="input-group"><label for="med-frequency">Frequency</label>
            <select class="input-field" id="med-frequency"><option value="">Select…</option><option>Once daily</option><option>Twice daily</option><option>As needed</option><option>Weekly</option></select>
          </div>
        </div>
        <div class="input-group"><label for="med-notes">Notes (optional)</label><input class="input-field" id="med-notes" type="text" placeholder="e.g. take with food"></div>
        <button type="submit" class="btn btn-primary btn-block">Add to log</button>
      </form>
    </div>
    <div class="section-heading"><h3>Current medications</h3>${loadError ? '' : `<span class="badge badge-teal">${meds.filter(m => m.active !== false).length}</span>`}</div>
    ${loadError ? loadErrorState('your medication log', loadError, 'medications-retry')
      : meds.length ? meds.map(m => `<div class="card card-sm">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-3);">
          <div class="flex-1">
            <div class="font-semibold text-sm">${esc(m.name)}${m.active === false ? ' <span class="badge">stopped</span>' : ''}</div>
            <div class="text-tertiary text-xs">${esc(m.dose || '')}${m.dose && m.frequency ? ' • ' : ''}${esc(m.frequency || '')}${m.notes ? '<br>' + esc(m.notes) : ''}</div>
          </div>
          ${m.active !== false ? `<button type="button" class="btn btn-sm btn-ghost med-stop" data-id="${esc(m.id)}" aria-label="Mark ${esc(m.name)} as stopped">Stopped</button>` : ''}
        </div></div>`).join('')
      : '<div class="empty-state"><p>No medications logged.</p></div>'}
  </div>`;
}

// ═══════════════════════════════════════
// CYCLE — observational log that feeds cross-domain patterns.
// ═══════════════════════════════════════
export async function renderCycle() {
  let history = []; let loadError = null;
  try {
    const res = await apiFetch(`/api/cycle/history?userId=${encodeURIComponent(currentUserId)}`);
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    const data = await res.json();
    history = data.history || data.entries || data.events || [];
  } catch (e) { loadError = e; }
  const today = todayLocalISO();

  return `<div class="stagger-children flex-col gap-4">
    <div class="card">
      <h4 class="mb-2">Log a cycle event</h4>
      <p class="disclaimer mb-3">Kept private and used only to look for patterns across your own logs.</p>
      <form id="cycle-form" class="flex-col gap-3">
        <div class="grid-2">
          <div class="input-group"><label for="cycle-type">Event</label>
            <select class="input-field" id="cycle-type"><option value="period_start">Period start</option><option value="period_end">Period end</option><option value="symptom">Symptom</option><option value="ovulation">Ovulation (estimated)</option></select>
          </div>
          <div class="input-group"><label for="cycle-date">Date</label><input class="input-field" id="cycle-date" type="date" value="${today}" max="${today}"></div>
        </div>
        <div class="grid-2">
          <div class="input-group"><label for="cycle-flow">Flow (optional)</label>
            <select class="input-field" id="cycle-flow"><option value="">—</option><option>light</option><option>medium</option><option>heavy</option></select>
          </div>
          <div class="input-group"><label for="cycle-symptom">Symptom (optional)</label><input class="input-field" id="cycle-symptom" type="text" placeholder="e.g. cramps, headache"></div>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Log entry</button>
      </form>
    </div>
    <div class="section-heading"><h3>Recent entries</h3></div>
    ${loadError ? loadErrorState('your cycle history', loadError, 'cycle-retry')
      : history.length ? history.slice(0, 30).map(h => `<div class="card card-sm" style="display:flex;justify-content:space-between;gap:var(--space-3);">
          <span class="text-sm">${esc((h.event_type || '').replace(/_/g, ' '))}${h.symptom ? ' — ' + esc(h.symptom) : ''}${h.flow ? ' (' + esc(h.flow) + ')' : ''}</span>
          <span class="text-tertiary text-xs">${esc(h.date || '')}</span>
        </div>`).join('')
      : '<div class="empty-state"><p>No cycle entries yet.</p></div>'}
  </div>`;
}
