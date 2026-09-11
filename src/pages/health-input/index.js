// ─── Health Input Page — Labs, Exercise, Sleep, Habits, Substances, Background, Goals, Environment ─
// Entry point: tab bar, tab dispatch and the form/event handler wiring.
// Each tab group renders from its own module in this folder.
import { labResults, exerciseLog, sleepLog, habits, getUserId } from '../../lib/db.js';
import { apiFetch } from '../../utils/api.js';
import { showToast } from '../../utils/toast.js';
import { esc } from '../../utils/esc.js';
import { labStatusColor, renderLabs } from './labs.js';
import { renderExercise, setupStravaHandlers } from './exercise.js';
import { renderHabits, renderSleep } from './sleep-habits.js';
import { renderSubstances } from './substances.js';
import { renderBackground, renderGoals } from './background-goals.js';
import { refreshEnvironmentData, renderEnvironment } from './environment.js';
import { renderCycle, renderMedications } from './medications-cycle.js';

let activeTab = 'labs';
export let currentUserId = null;

const TABS = [
  ['labs', 'Labs'],
  ['exercise', 'Exercise'],
  ['sleep', 'Sleep'],
  ['habits', 'Habits'],
  ['substances', 'Substances'],
  ['background', 'Background'],
  ['goals', 'Goals'],
  ['env', 'Environment'],
  ['medications', 'Meds'],
  ['cycle', 'Cycle'],
];

// ── Shared UI helpers ───────────────────────────────────────────
const spinner = () => '<div style="text-align:center;padding:var(--space-8);" role="status" aria-label="Loading"><div class="spinner" style="margin:0 auto;"></div></div>';

// Turns a thrown error into something a person can act on. Never leaks server text.
export function plainReason(err) {
  const msg = String(err?.message || '');
  if (/not authenticated|jwt|session|sign(ed)? in/i.test(msg)) return 'You need to be signed in to see this.';
  if (/failed to fetch|networkerror|load failed|network|timeout/i.test(msg)) return 'Check your connection and try again.';
  return 'Something went wrong on our side. Your data is safe — please try again.';
}

// ERROR state — distinct from an empty log. Always offers a working retry.
export function loadErrorState(what, err, retryId) {
  return `<div class="empty-state" role="alert"><h3>Couldn't load ${what}</h3><p>${plainReason(err)}</p><button type="button" class="btn btn-sm" id="${retryId}" data-retry>Try again</button></div>`;
}

export async function renderHealthInput() {
  const content = document.getElementById('page-content');
  content.innerHTML = `<div class="health-input stagger-children"><div class="page-header"><h1>Health Data</h1></div>${spinner()}</div>`;

  try {
    currentUserId = await getUserId();
  } catch (err) {
    console.error('[HealthInput] Could not resolve user:', err);
    content.innerHTML = `<div class="health-input stagger-children"><div class="page-header"><h1>Health Data</h1></div>${loadErrorState('your health data', err, 'health-input-retry')}</div>`;
    document.getElementById('health-input-retry')?.addEventListener('click', () => renderHealthInput());
    return;
  }

  content.innerHTML = `
    <div class="health-input stagger-children">
      <div class="page-header"><h1>Health Data</h1><p>Log your labs, exercise, sleep, habits and more</p></div>
      <div class="tab-bar" id="health-tabs" role="tablist" aria-label="Health data sections">
        ${TABS.map(([key, label]) => `<button type="button" role="tab" class="tab-item${key === activeTab ? ' active' : ''}" id="health-tab-${key}" data-tab="${key}" aria-selected="${key === activeTab ? 'true' : 'false'}" aria-controls="health-tab-content" tabindex="${key === activeTab ? '0' : '-1'}">${label}</button>`).join('')}
      </div>
      <div id="health-tab-content" role="tabpanel" aria-labelledby="health-tab-${activeTab}" aria-live="polite" tabindex="0">${spinner()}</div>
    </div>`;

  const tablist = document.getElementById('health-tabs');
  tablist.querySelectorAll('.tab-item').forEach(tab => tab.addEventListener('click', () => selectTab(tab)));
  // Arrow keys move between tabs (WAI-ARIA tabs pattern, roving tabindex).
  tablist.addEventListener('keydown', (e) => {
    const tabs = Array.from(tablist.querySelectorAll('.tab-item'));
    const i = tabs.indexOf(document.activeElement);
    if (i === -1) return;
    let next = null;
    if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
    else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
    else if (e.key === 'Home') next = tabs[0];
    else if (e.key === 'End') next = tabs[tabs.length - 1];
    if (next) { e.preventDefault(); next.focus(); selectTab(next); }
  });
  // The 10-tab bar overflows on phones — make sure the selected tab is visible.
  tablist.querySelector('.tab-item.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });

  renderTabContent();
}

function selectTab(tab) {
  document.querySelectorAll('#health-tabs .tab-item').forEach(t => {
    const on = t === tab;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
    t.tabIndex = on ? 0 : -1;
  });
  activeTab = tab.dataset.tab;
  document.getElementById('health-tab-content')?.setAttribute('aria-labelledby', tab.id);
  tab.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  renderTabContent();
}

export async function renderTabContent() {
  const container = document.getElementById('health-tab-content');
  if (!container) return;
  container.innerHTML = spinner();

  const renderers = {
    labs: renderLabs,
    exercise: renderExercise,
    sleep: renderSleep,
    habits: renderHabits,
    substances: renderSubstances,
    background: renderBackground,
    goals: renderGoals,
    env: renderEnvironment,
    medications: renderMedications,
    cycle: renderCycle,
  };

  try {
    container.innerHTML = await (renderers[activeTab] || renderLabs)();
  } catch (err) {
    console.error('[HealthInput] Tab render failed:', err);
    container.innerHTML = loadErrorState('this section', err, 'health-tab-retry');
  }
  setupFormHandlers();
}

// ═══════════════════════════════════════
//  Event Handlers
// ═══════════════════════════════════════

function setupFormHandlers() {
  // Every error state's "Try again" re-runs the current tab's load.
  document.querySelectorAll('#health-tab-content [data-retry]').forEach(btn => {
    btn.addEventListener('click', () => renderTabContent());
  });

  document.getElementById('lab-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('lab-name').value;
    const value = document.getElementById('lab-value').value;
    const unit = document.getElementById('lab-unit').value;
    const date = document.getElementById('lab-date').value;
    if (!name || !value) {
      showToast('Choose a test and enter its value');
      return;
    }

    try {
      await labResults.log({
        panelType: 'manual',
        markers: { [name]: { value: parseFloat(value), unit } },
        collectedAt: date || null,
      });
      showToast('Lab result saved');
      renderTabContent();
    } catch (err) {
      console.error('Lab save failed:', err);
      showToast("Couldn't save the lab result. Please try again.");
    }
  });

  document.getElementById('res-rpe')?.addEventListener('input', event => {
    event.target.dataset.touched = '1';
    const display = document.getElementById('res-rpe-display');
    if (display) display.textContent = event.target.value;
  });

  document.querySelectorAll('#res-muscle-groups button').forEach(btn => {
    btn.addEventListener('click', () => {
      const on = btn.classList.toggle('active');
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  });

  document.getElementById('resistance-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('res-ex-name')?.value.trim();
    const sets = document.getElementById('res-sets')?.value;
    const reps = document.getElementById('res-reps')?.value;
    const weight = document.getElementById('res-weight')?.value;
    // The slider always has a position; only a value the user actually set counts.
    const rpeInput = document.getElementById('res-rpe');
    const rpe = rpeInput?.dataset.touched === '1' ? Number(rpeInput.value) : null;
    const muscleGroups = Array.from(document.querySelectorAll('#res-muscle-groups button.active')).map(btn => btn.dataset.group);
    const notes = document.getElementById('res-notes')?.value.trim();

    if (!name) {
      showToast('Enter the exercise name');
      document.getElementById('res-ex-name')?.focus();
      return;
    }

    const setsValue = sets ? parseInt(sets, 10) : null;
    const repsValue = reps ? parseInt(reps, 10) : null;
    const weightValue = weight ? parseFloat(weight) : null;
    const totalVolume = setsValue && repsValue && weightValue ? setsValue * repsValue * weightValue : null;

    try {
      await exerciseLog.log({
        type: 'Resistance',
        name,
        duration: null,
        intensity: rpe ? `RPE ${rpe}` : null,
        calories: null,
        distance: null,
        sets: setsValue || null,
        reps: repsValue || null,
        weight_kg: weightValue || null,
        rpe,
        muscle_groups: muscleGroups.length ? muscleGroups.join(', ') : null,
        notes: notes || null,
        total_volume_kg: totalVolume,
        source: 'manual',
      });
      showToast('Resistance workout logged');
      renderTabContent();
    } catch (err) {
      console.error('Resistance save failed:', err);
      showToast("Couldn't log the workout. Please try again.");
    }
  });

  document.getElementById('cardio-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const type = document.getElementById('cardio-type')?.value;
    const duration = document.getElementById('cardio-duration')?.value;
    const distance = document.getElementById('cardio-distance')?.value;
    const calories = document.getElementById('cardio-calories')?.value;
    const notes = document.getElementById('cardio-notes')?.value.trim();

    if (!type || !duration) {
      showToast('Choose a cardio type and enter the duration');
      return;
    }

    try {
      await exerciseLog.log({
        type,
        name: `${type} Cardio`,
        duration: parseInt(duration, 10),
        intensity: null,
        calories: calories ? parseInt(calories, 10) : null,
        distance: distance ? parseFloat(distance) : null,
        notes: notes || null,
        source: 'manual',
      });
      showToast('Cardio session logged');
      renderTabContent();
    } catch (err) {
      console.error('Cardio save failed:', err);
      showToast("Couldn't log the cardio session. Please try again.");
    }
  });

  document.getElementById('sleep-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const hours = parseFloat(document.getElementById('sleep-hours').value);
    const quality = document.getElementById('sleep-quality').value;
    const bedtime = document.getElementById('sleep-bedtime').value;
    const wake = document.getElementById('sleep-wake').value;
    const notes = document.getElementById('sleep-notes').value;
    if (!hours) {
      showToast('Enter how many hours you slept');
      document.getElementById('sleep-hours')?.focus();
      return;
    }

    try {
      await sleepLog.log({ hours, quality, bedtime, wakeTime: wake, notes });
      showToast('Sleep logged');
      renderTabContent();
    } catch (err) {
      console.error('Sleep save failed:', err);
      showToast("Couldn't log sleep. Please try again.");
    }
  });

  document.getElementById('toggle-smoking')?.addEventListener('click', function () {
    const on = this.classList.toggle('active');
    this.setAttribute('aria-checked', on ? 'true' : 'false');
  });

  // ── Medications (logging only — no interaction or dosage logic, by design) ──
  document.getElementById('medication-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('med-name')?.value.trim();
    if (!name) return showToast('Enter a medication name');
    try {
      const res = await apiFetch('/api/medications', { method: 'POST', body: JSON.stringify({
        userId: currentUserId, name,
        dose: document.getElementById('med-dose')?.value.trim() || null,
        frequency: document.getElementById('med-frequency')?.value || null,
        notes: document.getElementById('med-notes')?.value.trim() || null,
      }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Save failed');
      showToast('Medication logged'); renderTabContent();
    } catch (err) { console.error('Medication save failed:', err); showToast("Couldn't save the medication. Please try again."); }
  });
  document.querySelectorAll('.med-stop').forEach(btn => btn.addEventListener('click', async () => {
    try {
      const res = await apiFetch(`/api/medications/${encodeURIComponent(btn.dataset.id)}`, { method: 'PATCH', body: JSON.stringify({ userId: currentUserId, active: false }) });
      if (!res.ok) throw new Error('Update failed');
      showToast('Marked as stopped'); renderTabContent();
    } catch (err) { console.error('Medication update failed:', err); showToast("Couldn't update the medication. Please try again."); }
  }));

  // ── Cycle ──
  document.getElementById('cycle-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const cycleType = document.getElementById('cycle-type')?.value;
    if (!cycleType) { showToast('Choose an event type'); return; }
    try {
      const res = await apiFetch('/api/cycle/log', { method: 'POST', body: JSON.stringify({
        userId: currentUserId,
        event_type: cycleType,
        flow: document.getElementById('cycle-flow')?.value || null,
        symptom: document.getElementById('cycle-symptom')?.value.trim() || null,
        date: document.getElementById('cycle-date')?.value || undefined,
      }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Save failed');
      showToast('Cycle entry logged'); renderTabContent();
    } catch (err) { console.error('Cycle save failed:', err); showToast("Couldn't save the entry. Please try again."); }
  });

  document.getElementById('save-habits')?.addEventListener('click', async () => {
    try {
      const waterRaw = document.getElementById('habit-water')?.value ?? '';
      await habits.logToday({
        smoking: document.getElementById('toggle-smoking')?.getAttribute('aria-checked') === 'true',
        alcohol: document.getElementById('habit-alcohol')?.value || null,
        caffeine: document.getElementById('habit-caffeine')?.value || null,
        waterGlasses: waterRaw === '' ? null : parseInt(waterRaw, 10),
        stressLevel: parseInt(document.getElementById('habit-stress')?.value || '0') || null,
        steps: parseInt(document.getElementById('habit-steps')?.value || '') || null,
        mood: document.getElementById('habit-mood')?.value || null,
      });
      showToast('Habits saved');
    } catch (err) {
      console.error('Habits save failed:', err);
      showToast("Couldn't save today's habits. Please try again.");
    }
  });

  document.getElementById('substance-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('substance-name').value.trim();
    const category = document.getElementById('substance-category').value;
    const dose = document.getElementById('substance-dose').value.trim();
    const frequency = document.getElementById('substance-frequency').value;
    const notes = document.getElementById('substance-notes').value.trim();

    if (!name || !category) {
      showToast('Enter a name and choose a category');
      return;
    }

    try {
      const res = await apiFetch(`/api/supplements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, name, category, dose, frequency, notes }),
      });

      if (!res.ok) throw new Error('Failed to save');
      showToast('Substance added');
      renderTabContent();
    } catch (err) {
      console.error('Substance save failed:', err);
      showToast("Couldn't add the substance. Please try again.");
    }
  });

  document.querySelectorAll('.substance-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this substance from your log?')) return;
      const id = btn.dataset.id;
      try {
        const res = await apiFetch(`/api/supplements/${encodeURIComponent(id)}?userId=${encodeURIComponent(currentUserId)}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete');
        showToast('Substance removed');
        renderTabContent();
      } catch (err) {
        console.error('Delete failed:', err);
        showToast("Couldn't remove the substance. Please try again.");
      }
    });
  });

  document.getElementById('background-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const selectedConditions = Array.from(document.querySelectorAll('.condition-check:checked')).map(c => c.value);
    const allergies = document.getElementById('bg-allergies').value.trim();

    try {
      const res = await apiFetch(`/api/health-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, conditions: selectedConditions, allergies }),
      });

      if (!res.ok) throw new Error('Failed to save');
      showToast('Health background saved');
      renderTabContent();
    } catch (err) {
      console.error('Background save failed:', err);
      showToast("Couldn't save your health background. Please try again.");
    }
  });

  document.getElementById('goals-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const goals_text = document.getElementById('goals-text').value.trim();
    const dietary_restrictions = document.getElementById('goals-dietary').value.trim();
    const health_concerns = document.getElementById('goals-concerns').value.trim();

    try {
      const res = await apiFetch(`/api/user-goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, goals_text, dietary_restrictions, health_concerns }),
      });

      if (!res.ok) throw new Error('Failed to save');
      showToast('Goals saved');
      renderTabContent();
    } catch (err) {
      console.error('Goals save failed:', err);
      showToast("Couldn't save your goals. Please try again.");
    }
  });

  document.getElementById('env-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    await refreshEnvironmentData();
  });

  const labPdfZone = document.getElementById('lab-pdf-zone');
  const labPdfInput = document.getElementById('lab-pdf-input');

  if (labPdfZone && labPdfInput) {
    labPdfZone.addEventListener('click', () => labPdfInput.click());
    labPdfZone.addEventListener('dragover', (e) => { e.preventDefault(); labPdfZone.classList.add('dragover'); });
    labPdfZone.addEventListener('dragleave', () => labPdfZone.classList.remove('dragover'));
    labPdfZone.addEventListener('drop', (e) => {
      e.preventDefault();
      labPdfZone.classList.remove('dragover');
      const file = e.dataTransfer?.files[0];
      if (file) parseLabFile(file);
    });
    labPdfInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) parseLabFile(file);
      e.target.value = '';
    });
  }

  async function parseLabFile(file) {
    const statusEl = document.getElementById('lab-parse-status');
    const resultsEl = document.getElementById('lab-parse-results');
    if (!statusEl || !resultsEl) return;

    const showParseError = (message) => {
      statusEl.style.display = 'block';
      statusEl.innerHTML = `
        <div role="alert" style="padding:var(--space-3);background:var(--error-dim);border-radius:var(--radius-md);color:var(--error);font-size:var(--text-sm);">
          ${esc(message)}
        </div>`;
      resultsEl.style.display = 'none';
    };

    if (file.size > 20 * 1024 * 1024) {
      showParseError('That file is over 20MB. Try a smaller file or a photo of the report.');
      return;
    }

    statusEl.style.display = 'block';
    statusEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:var(--space-2);padding:var(--space-3);background:var(--surface-2);border-radius:var(--radius-md);" role="status">
        <div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>
        <span class="text-sm">Reading your lab report…</span>
      </div>`;
    resultsEl.style.display = 'none';

    try {
      const formData = new FormData();
      formData.append('pdf', file, file.name);

      const res = await apiFetch(`/api/parse-labs`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server responded ${res.status}`);
      }

      const parsed = await res.json();
      const markerCount = Object.keys(parsed.markers || {}).length;

      if (markerCount === 0) {
        showParseError("We couldn't find any lab markers in that file. Try a clearer image or a different file.");
        return;
      }

      statusEl.innerHTML = `
        <div style="padding:var(--space-3);background:var(--viz-green-dim);border-radius:var(--radius-md);color:var(--viz-green);font-size:var(--text-sm);">
          Found ${markerCount} markers from ${esc(parsed.panel_type || 'lab report')}${parsed.lab_name ? ` (${esc(parsed.lab_name)})` : ''}. Check them before saving.
        </div>`;

      const markerRows = Object.entries(parsed.markers || {}).map(([name, data]) => {
        const statusColor = labStatusColor(data.status);
        const statusIcon = data.status === 'high' ? '↑' : data.status === 'low' ? '↓' : data.status === 'critical' ? '!' : '✓';
        const statusLabel = data.status === 'high' ? 'above range' : data.status === 'low' ? 'below range' : data.status === 'critical' ? 'well outside range' : 'in range';
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) 0;border-bottom:1px solid var(--border);gap:var(--space-2);">
            <span class="text-sm">${esc(name)}</span>
            <div style="display:flex;align-items:center;gap:var(--space-2);">
              ${data.reference_range ? `<span class="text-tertiary text-xs">ref: ${esc(data.reference_range)}</span>` : ''}
              <span style="font-family:var(--font-heading);font-weight:var(--weight-bold);color:${statusColor};">${esc(data.value)}</span>
              <span class="text-tertiary text-xs">${esc(data.unit || '')}</span>
              <span style="font-size:var(--text-xs);color:${statusColor};" aria-label="${statusLabel}" title="${statusLabel}">${statusIcon}</span>
            </div>
          </div>`;
      }).join('');

      resultsEl.style.display = 'block';
      resultsEl.innerHTML = `
        <div class="card" style="padding:var(--space-3);">
          <h4 class="mb-1">Markers we found</h4>
          <p class="disclaimer mb-2">Read automatically from your file — please check the values against the original before saving.</p>
          ${parsed.collected_at ? `<p class="mb-3 text-tertiary text-xs">Collected: ${esc(parsed.collected_at)}</p>` : ''}
          <div style="max-height:300px;overflow-y:auto;margin-bottom:var(--space-3);">
            ${markerRows}
          </div>
          ${parsed.notes ? `<p class="mb-3 text-secondary text-xs">Notes: ${esc(parsed.notes)}</p>` : ''}
          <button type="button" id="confirm-save-labs" class="btn btn-primary btn-block">
            Save ${markerCount} markers to my health log
          </button>
        </div>`;

      document.getElementById('confirm-save-labs')?.addEventListener('click', async () => {
        const btn = document.getElementById('confirm-save-labs');
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;margin-right:8px;"></div>Saving…';

        try {
          await labResults.log({
            panelType: parsed.panel_type || 'Lab Panel',
            markers: parsed.markers,
            notes: parsed.notes || null,
            labName: parsed.lab_name || null,
            collectedAt: parsed.collected_at || null,
          });

          btn.textContent = 'Saved to your health log';
          btn.style.background = 'var(--viz-green)';
          showToast(`${markerCount} lab markers saved`);
          setTimeout(() => renderTabContent(), 1500);
        } catch (err) {
          console.error('[Labs] Save failed:', err);
          btn.disabled = false;
          btn.textContent = `Save ${markerCount} markers to my health log`;
          showToast("Couldn't save the markers. " + plainReason(err));
        }
      });
    } catch (err) {
      console.error('[Labs] Parse failed:', err);
      showParseError("Couldn't read that lab report. " + plainReason(err));
    }
  }

  setupStravaHandlers();
}
