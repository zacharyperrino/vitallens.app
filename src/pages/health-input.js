// ─── Health Input Page — Labs, Exercise, Sleep, Habits, Substances, Background, Goals, Environment ─
import { icons } from '../icons.js';
import { labResults, exerciseLog, sleepLog, habits, getUserId } from '../lib/db.js'; // Supabase
import { apiFetch } from '../utils/api.js';
import { showToast } from '../utils/toast.js';
import { esc } from '../utils/esc.js';

let activeTab = 'labs';
let currentUserId = null;

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
function plainReason(err) {
  const msg = String(err?.message || '');
  if (/not authenticated|jwt|session|sign(ed)? in/i.test(msg)) return 'You need to be signed in to see this.';
  if (/failed to fetch|networkerror|load failed|network|timeout/i.test(msg)) return 'Check your connection and try again.';
  return 'Something went wrong on our side. Your data is safe — please try again.';
}

// ERROR state — distinct from an empty log. Always offers a working retry.
function loadErrorState(what, err, retryId) {
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

async function renderTabContent() {
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
//  Labs Tab
// ═══════════════════════════════════════

function labStatusText(status) {
  if (status === 'high') return '↑ above range';
  if (status === 'low') return '↓ below range';
  if (status === 'critical') return '! well outside range';
  return '';
}

function labStatusColor(status) {
  if (status === 'high' || status === 'critical') return 'var(--error)';
  if (status === 'low') return 'var(--viz-amber)';
  if (status === 'normal') return 'var(--viz-green)';
  return 'var(--text-primary)';
}

async function renderLabs() {
  let labs = [];
  let loadError = null;
  try { labs = await labResults.getAll(); } catch (e) { loadError = e; }

  const savedList = loadError
    ? loadErrorState('your saved lab results', loadError, 'labs-retry')
    : labs.length > 0
      ? labs.slice(0, 10).map(renderLabCard).join('')
      : '<div class="empty-state"><p>No lab results logged yet.</p></div>';

  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">

    <div class="card">
      <h4 style="margin-bottom:var(--space-2);">Upload a lab report</h4>
      <p class="disclaimer" style="margin-bottom:var(--space-3);">
        Upload a PDF or photo of a blood panel, hormone panel, or other lab report. We'll read the markers from it for you to review before anything is saved.
      </p>
      <input type="file" accept=".pdf,image/*" id="lab-pdf-input" class="visually-hidden" tabindex="-1" aria-hidden="true">
      <button type="button" class="upload-zone" id="lab-pdf-zone" style="width:100%;padding:var(--space-4);min-height:0;" aria-describedby="lab-pdf-help">
        <span style="color:var(--text-tertiary);display:flex;justify-content:center;" aria-hidden="true">${icons.droplet}</span>
        <span style="display:block;font-size:var(--text-sm);font-weight:var(--weight-semibold);color:var(--text-primary);">Drop a PDF or photo here, or tap to choose a file</span>
        <span id="lab-pdf-help" style="display:block;font-size:var(--text-xs);color:var(--text-tertiary);">PDF, JPG or PNG up to 20MB</span>
      </button>
      <div id="lab-parse-status" aria-live="polite" style="display:none;margin-top:var(--space-3);"></div>
      <div id="lab-parse-results" aria-live="polite" style="display:none;margin-top:var(--space-3);"></div>
    </div>

    <div class="card">
      <h4 style="margin-bottom:var(--space-4);">Add a single result</h4>
      <form id="lab-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
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

    <div class="section-heading"><h3>Saved results</h3>${loadError ? '' : `<span class="badge badge-teal">${labs.length}</span>`}</div>
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
    <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);">
      <div>
        <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${esc(l.panel_type || displayName)}</div>
        <div style="font-size:var(--text-xs);color:var(--text-tertiary);">
          ${esc(date)}${markerCount > 1 ? ` • ${markerCount} markers` : ''}
          ${hasAbnormal ? ' • <span style="color:var(--viz-amber);">Outside the report\'s reference range</span>' : ''}
        </div>
      </div>
      <div style="text-align:right;">
        ${markerCount === 1 ? `
          <div style="font-family:var(--font-heading);font-weight:var(--weight-bold);color:${labStatusColor(firstMarker.status)};">${esc(displayValue)}</div>
          <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${esc(displayUnit)}${singleStatus ? ` · ${singleStatus}` : ''}</div>
        ` : `
          <div class="badge badge-teal">${markerCount} markers</div>
        `}
      </div>
    </div>
    ${markerCount > 1 ? `
    <div style="margin-top:var(--space-2);display:flex;flex-wrap:wrap;gap:var(--space-1);">
      ${markerKeys.slice(0, 6).map(k => {
        const m = markers[k] || {};
        const status = labStatusText(m.status);
        return `<span style="font-size:var(--text-xs);padding:2px 6px;border-radius:4px;background:var(--surface-2);color:${labStatusColor(m.status)};">${esc(k)}: ${esc(m.value)}${esc(m.unit || '')}${status ? ` ${status.charAt(0)}` : ''}</span>`;
      }).join('')}
      ${markerKeys.length > 6 ? `<span style="font-size:var(--text-xs);padding:2px 6px;color:var(--text-tertiary);">+${markerKeys.length - 6} more</span>` : ''}
    </div>` : ''}
  </div>`;
}

// ═══════════════════════════════════════
//  Exercise Tab + Strava
// ═══════════════════════════════════════

async function renderExercise() {
  let log = [];
  let loadError = null;
  try { log = await exerciseLog.getRecent(8); } catch (e) { loadError = e; }

  const stravaSection = await renderStravaSection();

  const logList = loadError
    ? loadErrorState('your exercise log', loadError, 'exercise-retry')
    : log.length > 0
      ? log.map(renderExerciseCard).join('')
      : '<div class="empty-state"><p>No exercise logged yet.</p></div>';

  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    ${stravaSection}
    <div class="card">
      <h4 style="margin-bottom:var(--space-4);">Log resistance training</h4>
      <form id="resistance-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
        <div class="input-group"><label for="res-ex-name">Exercise name</label>
          <input class="input-field" type="text" id="res-ex-name" placeholder="e.g. Bench press, deadlift, pull-up">
        </div>
        <div class="grid-3">
          <div class="input-group"><label for="res-sets">Sets</label><input class="input-field" type="number" min="1" id="res-sets" placeholder="e.g. 4"></div>
          <div class="input-group"><label for="res-reps">Reps</label><input class="input-field" type="number" min="1" id="res-reps" placeholder="e.g. 8"></div>
          <div class="input-group"><label for="res-weight">Weight (kg)</label><input class="input-field" type="number" min="0" step="0.5" id="res-weight" placeholder="e.g. 90"></div>
        </div>
        <div class="input-group">
          <label for="res-rpe">Effort (rate of perceived exertion, 1–10)</label>
          <div style="display:flex;align-items:center;gap:var(--space-3);">
            <input class="input-field" type="range" min="1" max="10" id="res-rpe" value="5" style="flex:1;">
            <output for="res-rpe" id="res-rpe-display" style="min-width:28px;text-align:center;">5</output>
          </div>
        </div>
        <fieldset class="input-group" style="border:0;padding:0;margin:0;min-width:0;">
          <legend style="font-size:var(--text-sm);font-weight:var(--weight-medium);color:var(--text-secondary);padding:0;margin-bottom:var(--space-2);">Muscle groups</legend>
          <div id="res-muscle-groups" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;">
            ${['Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Legs', 'Glutes', 'Full Body'].map(g => `<button type="button" class="btn btn-sm" data-group="${g}" aria-pressed="false">${g}</button>`).join('')}
          </div>
        </fieldset>
        <div class="input-group"><label for="res-notes">Notes</label>
          <textarea class="input-field" id="res-notes" placeholder="Optional notes about the set, tempo, or form" rows="3"></textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Log resistance workout</button>
      </form>
    </div>

    <div class="card">
      <h4 style="margin-bottom:var(--space-4);">Log cardio</h4>
      <form id="cardio-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
        <div class="input-group"><label for="cardio-type">Activity type</label>
          <select class="input-field" id="cardio-type">
            <option value="">Select a cardio type…</option>
            <option>Run</option>
            <option>Bike</option>
            <option>Swim</option>
            <option>Walk</option>
            <option>Row</option>
            <option>Other</option>
          </select>
        </div>
        <div class="grid-2">
          <div class="input-group"><label for="cardio-duration">Duration (minutes)</label><input class="input-field" type="number" min="1" id="cardio-duration" placeholder="e.g. 30"></div>
          <div class="input-group"><label for="cardio-distance">Distance (km)</label><input class="input-field" type="number" min="0" step="0.1" id="cardio-distance" placeholder="e.g. 5.0"></div>
        </div>
        <div class="input-group"><label for="cardio-calories">Calories burned (optional)</label><input class="input-field" type="number" min="0" id="cardio-calories" placeholder="e.g. 250"></div>
        <div class="input-group"><label for="cardio-notes">Notes</label>
          <textarea class="input-field" id="cardio-notes" placeholder="Optional cardio notes" rows="3"></textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Log cardio</button>
      </form>
    </div>

    <div class="section-heading"><h3>Exercise log</h3>${loadError ? '' : `<span class="badge badge-teal">${log.length}</span>`}</div>
    ${logList}
  </div>`;
}

function renderExerciseCard(e) {
  const isStrava = e.source === 'strava';
  const details = [
    e.duration != null ? `${esc(e.duration)} min` : null,
    e.intensity ? esc(e.intensity) : null,
    e.distance ? esc(e.distance) : null,
    e.heart_rate ? `${Math.round(e.heart_rate)} bpm` : null,
  ].filter(Boolean).join(' • ');
  return `<div class="card card-sm">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);">
      <div style="display:flex;align-items:center;gap:var(--space-3);">
        <div style="width:36px;height:36px;border-radius:var(--radius-md);background:${isStrava ? 'var(--viz-amber-dim)' : 'var(--accent-dim)'};display:flex;align-items:center;justify-content:center;" aria-hidden="true">
          <span style="color:${isStrava ? 'var(--viz-amber)' : 'var(--text-secondary)'};width:20px;height:20px;">${isStrava ? icons.strava : icons.activity}</span>
        </div>
        <div>
          <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${esc(e.name || e.type || 'Workout')}${isStrava ? ' <span class="badge" style="font-size:var(--text-xs);">Strava</span>' : ''}</div>
          <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${details || 'No details logged'}</div>
        </div>
      </div>
      <span style="font-weight:var(--weight-semibold);color:var(--text-secondary);white-space:nowrap;">${e.calories != null ? `${esc(e.calories)} kcal` : '—'}</span>
    </div>
  </div>`;
}

// ═══════════════════════════════════════
//  Sleep Tab
// ═══════════════════════════════════════

async function renderSleep() {
  let log = [];
  let loadError = null;
  try { log = await sleepLog.getRecent(7); } catch (e) { loadError = e; }

  const logList = loadError
    ? loadErrorState('your sleep log', loadError, 'sleep-retry')
    : log.length > 0
      ? log.map(s => `<div class="card card-sm">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);">
        <div style="display:flex;align-items:center;gap:var(--space-3);">
          <div style="width:36px;height:36px;border-radius:var(--radius-md);background:var(--bg-chip);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);" aria-hidden="true">${icons.moon}</div>
          <div>
            <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${s.hours != null ? `${esc(s.hours)}h` : 'Sleep'}${s.quality ? ` — ${esc(s.quality)}` : ''}</div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${esc(s.bedtime || '')} ${esc(s.wake_time || s.wake || '')}</div>
          </div>
        </div>
        <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${esc(s.date || '')}</div>
      </div>
    </div>`).join('')
      : '<div class="empty-state"><p>No sleep logged yet.</p></div>';

  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card">
      <h4 style="margin-bottom:var(--space-4);">Log sleep</h4>
      <form id="sleep-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
        <div class="grid-2">
          <div class="input-group"><label for="sleep-hours">Hours slept</label><input class="input-field" type="number" step="0.5" min="0" max="24" id="sleep-hours" placeholder="e.g. 7.5"></div>
          <div class="input-group"><label for="sleep-quality">Quality</label>
            <select class="input-field" id="sleep-quality">
              <option value="" selected disabled>Select…</option><option>Poor</option><option>Fair</option><option>Good</option><option>Excellent</option>
            </select>
          </div>
        </div>
        <div class="grid-2">
          <div class="input-group"><label for="sleep-bedtime">Bedtime</label><input class="input-field" type="time" id="sleep-bedtime"></div>
          <div class="input-group"><label for="sleep-wake">Wake time</label><input class="input-field" type="time" id="sleep-wake"></div>
        </div>
        <div class="input-group"><label for="sleep-notes">Notes</label><input class="input-field" type="text" id="sleep-notes" placeholder="Any notes…"></div>
        <button type="submit" class="btn btn-primary btn-block">Log sleep</button>
      </form>
    </div>
    <div class="section-heading"><h3>Sleep log</h3></div>
    ${logList}
  </div>`;
}

// ═══════════════════════════════════════
//  Habits Tab
// ═══════════════════════════════════════

async function renderHabits() {
  let h = null;
  let loadError = null;
  try { h = await habits.getToday(); } catch (e) { loadError = e; }

  // A failed load must not render a blank form — saving it would overwrite today's real entry.
  if (loadError) {
    return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
      <div class="card"><h4 style="margin-bottom:var(--space-2);">Lifestyle habits</h4>${loadErrorState("today's habits", loadError, 'habits-retry')}</div>
    </div>`;
  }
  h = h || {};

  const levelOptions = (current) => ['none', 'light', 'moderate', 'heavy']
    .map(v => `<option value="${v}" ${current === v ? 'selected' : ''}>${v.charAt(0).toUpperCase() + v.slice(1)}</option>`).join('');

  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card">
      <h4 style="margin-bottom:var(--space-4);">Lifestyle habits</h4>
      <div style="display:flex;flex-direction:column;gap:var(--space-4);">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:var(--space-3);"><span style="color:var(--text-secondary);display:flex;" aria-hidden="true">${icons.wind}</span><span id="smoking-label" style="font-size:var(--text-sm);">Smoked today</span></div>
          <button type="button" role="switch" aria-checked="${h.smoking ? 'true' : 'false'}" aria-labelledby="smoking-label" class="toggle ${h.smoking ? 'active' : ''}" id="toggle-smoking" style="padding:0;"></button>
        </div>
        <div class="divider" style="margin:0;"></div>
        <div class="input-group"><label for="habit-alcohol">Alcohol today</label>
          <select class="input-field" id="habit-alcohol">
            <option value="" ${!h.alcohol ? 'selected' : ''}>Select…</option>
            ${levelOptions(h.alcohol)}
          </select>
        </div>
        <div class="input-group"><label for="habit-caffeine">Caffeine today</label>
          <select class="input-field" id="habit-caffeine">
            <option value="" ${!h.caffeine ? 'selected' : ''}>Select…</option>
            ${levelOptions(h.caffeine)}
          </select>
        </div>
        <div class="input-group"><label for="habit-water">Water (glasses)</label>
          <input class="input-field" type="number" id="habit-water" value="${h.water_glasses ?? ''}" min="0" max="20" placeholder="e.g. 8">
        </div>
        <div class="input-group"><label for="habit-stress">Stress level (1–10)</label>
          <input class="input-field" type="number" id="habit-stress" value="${h.stress_level || ''}" min="1" max="10" placeholder="1–10">
        </div>
        <div class="input-group"><label for="habit-steps">Steps today</label>
          <input class="input-field" type="number" id="habit-steps" value="${h.steps ?? ''}" min="0" max="100000" placeholder="e.g. 8500">
        </div>
        <div class="input-group"><label for="habit-mood">Mood</label>
          <select class="input-field" id="habit-mood">
            <option value="">Select…</option>
            ${['great', 'good', 'neutral', 'low', 'bad'].map(v => `<option value="${v}" ${h.mood === v ? 'selected' : ''}>${v.charAt(0).toUpperCase() + v.slice(1)}</option>`).join('')}
          </select>
        </div>
        <button type="button" class="btn btn-primary btn-block" id="save-habits">Save today's habits</button>
      </div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════
//  Substances Tab
// ═══════════════════════════════════════

const SUBSTANCE_CATEGORIES = {
  supplement: { bg: 'var(--viz-green-dim)', text: 'var(--viz-green)', label: 'Supplement' },
  prescription: { bg: 'var(--accent-dim)', text: 'var(--accent)', label: 'Prescription' },
  recreational: { bg: 'var(--viz-neutral-dim)', text: 'var(--viz-neutral)', label: 'Recreational' },
};

async function renderSubstances() {
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
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-3);">
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-1);flex-wrap:wrap;">
              <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${esc(s.name)}</div>
              <span class="badge" style="background:${cat.bg};color:${cat.text};font-size:var(--text-xs);">${cat.label}</span>
            </div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">
              ${s.dose ? esc(s.dose) + ' • ' : ''}${esc(s.frequency || 'Frequency not set')}
              ${s.notes ? '<br>' + esc(s.notes) : ''}
            </div>
          </div>
          <button type="button" class="btn btn-sm btn-ghost substance-delete" data-id="${esc(s.id)}" aria-label="Remove ${esc(s.name)}" style="color:var(--text-tertiary);font-size:var(--text-xs);">✕</button>
        </div>
      </div>`;
      }).join('')
      : '<div class="empty-state"><p>No substances logged yet.</p></div>';

  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card">
      <h4 style="margin-bottom:var(--space-4);">Log a substance</h4>
      <form id="substance-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
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

    <div class="section-heading"><h3>Active substances</h3>${loadError ? '' : `<span class="badge badge-teal">${supplements.length}</span>`}</div>
    ${list}
  </div>`;
}

// ═══════════════════════════════════════
//  Background Tab
// ═══════════════════════════════════════

const BACKGROUND_CONDITIONS = [
  'IBS', 'Diabetes', 'Hypertension', 'Anxiety', 'Depression',
  'ADHD', 'Hypothyroid', 'PCOS', 'Acne', 'Eczema',
  'Asthma', 'Arthritis', 'Migraines', 'GERD', 'Celiac',
  'Crohns', 'Sleep Apnea', 'Endometriosis', 'High Cholesterol', 'Chronic Fatigue',
];

function parseConditions(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function renderBackground() {
  let profile = {};
  let loadError = null;
  try {
    const res = await apiFetch(`/api/health-profile?userId=${encodeURIComponent(currentUserId)}`);
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    const data = await res.json();
    profile = data.profile || {};
  } catch (e) {
    loadError = e;
  }

  // Never show a blank form after a failed load — saving it would wipe the saved background.
  if (loadError) {
    return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
      <div class="card"><h4 style="margin-bottom:var(--space-2);">Medical history</h4>${loadErrorState('your health background', loadError, 'background-retry')}</div>
    </div>`;
  }

  const selectedConditions = parseConditions(profile.conditions);

  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card">
      <h4 style="margin-bottom:var(--space-2);">Medical history</h4>
      <p class="disclaimer" style="margin-bottom:var(--space-3);">Anything you note here is kept private and only used to add context to your own patterns.</p>
      <form id="background-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
        <fieldset style="border:0;padding:0;margin:0;min-width:0;">
          <legend style="display:block;margin-bottom:var(--space-2);font-weight:var(--weight-semibold);font-size:var(--text-sm);padding:0;">Health conditions</legend>
          <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:var(--space-2);">
            ${BACKGROUND_CONDITIONS.map((condition, i) => `
              <label for="bg-cond-${i}" style="display:flex;align-items:center;gap:var(--space-2);cursor:pointer;padding:var(--space-2);border-radius:var(--radius-md);border:1px solid var(--border);transition:all 0.2s;">
                <input type="checkbox" class="condition-check" id="bg-cond-${i}" value="${condition}" ${selectedConditions.includes(condition) ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;">
                <span style="font-size:var(--text-sm);">${condition}</span>
              </label>
            `).join('')}
          </div>
        </fieldset>
        <div class="input-group"><label for="bg-allergies">Allergies</label>
          <textarea class="input-field" id="bg-allergies" placeholder="List any allergies (medication, food, environmental, etc.)" style="min-height:100px;resize:vertical;">${esc(profile.allergies || '')}</textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Save health background</button>
      </form>
    </div>
  </div>`;
}

// ═══════════════════════════════════════
//  Goals Tab
// ═══════════════════════════════════════

async function renderGoals() {
  let goals = {};
  let loadError = null;
  try {
    const res = await apiFetch(`/api/user-goals?userId=${encodeURIComponent(currentUserId)}`);
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    const data = await res.json();
    goals = data.goals || {};
  } catch (e) {
    loadError = e;
  }

  if (loadError) {
    return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
      <div class="card"><h4 style="margin-bottom:var(--space-2);">Health goals &amp; preferences</h4>${loadErrorState('your goals', loadError, 'goals-retry')}</div>
    </div>`;
  }

  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card">
      <h4 style="margin-bottom:var(--space-4);">Health goals &amp; preferences</h4>
      <form id="goals-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
        <div class="input-group"><label for="goals-text">Goals</label>
          <textarea class="input-field" id="goals-text" placeholder="What are you working toward? (e.g. more energy, better sleep, less stress)" style="min-height:120px;resize:vertical;">${esc(goals.goals_text || '')}</textarea>
        </div>
        <div class="input-group"><label for="goals-dietary">Dietary restrictions</label>
          <textarea class="input-field" id="goals-dietary" placeholder="Anything you avoid or follow (e.g. vegetarian, gluten-free, keto)" style="min-height:100px;resize:vertical;">${esc(goals.dietary_restrictions || '')}</textarea>
        </div>
        <div class="input-group"><label for="goals-concerns">Health concerns</label>
          <textarea class="input-field" id="goals-concerns" placeholder="Anything you'd like to keep an eye on" style="min-height:100px;resize:vertical;">${esc(goals.health_concerns || '')}</textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Save goals</button>
      </form>
    </div>
  </div>`;
}

// ═══════════════════════════════════════
//  Environment Tab
// ═══════════════════════════════════════

async function renderEnvironment() {
  const { environment: env, error: loadError } = await loadLatestEnvironment();

  const air = env?.air || { aqi: env?.aqi, aqiCategory: env?.aqi_category, pm2_5: env?.pm2_5, uv_index: env?.uv_index ?? env?.raw?.air?.uv_index };
  const waterRisk = env?.water_risk ?? env?.raw?.water?.risk_level ?? null;
  const aqi = air?.aqi ?? null;
  const aqiCategory = air?.aqiCategory || '';
  const pm25 = air?.pm2_5 ?? null;
  const uvIndex = air?.uv_index ?? env?.raw?.air?.uv_index ?? null;
  const locationValue = env?.location || '';
  const fetchedAt = env?.fetched_at ? new Date(env.fetched_at).toLocaleString() : null;
  const aqiNum = Number(aqi);
  const aqiColor = Number.isFinite(aqiNum) && aqi !== null
    ? (aqiNum <= 50 ? 'var(--viz-green)' : aqiNum <= 100 ? 'var(--viz-amber)' : 'var(--error)')
    : 'var(--text-secondary)';
  const show = (v) => (v === null || v === undefined || v === '') ? '<span aria-label="No data">—</span>' : esc(v);

  let readings;
  if (loadError) {
    readings = loadErrorState('your environment data', loadError, 'env-retry');
  } else if (env) {
    readings = `
      ${locationValue ? `<div style="font-size:var(--text-xl);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-3);">${esc(locationValue)}</div>` : ''}
      <div class="card card-sm" style="margin-bottom:var(--space-4);">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
          <div style="padding:var(--space-3);border-radius:var(--radius-sm);background:var(--surface-2);">
            <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-2);">Air quality index (AQI)</div>
            <div style="font-size:var(--text-3xl);font-weight:var(--weight-bold);color:${aqiColor};">${show(aqi)}</div>
            <div style="font-size:var(--text-sm);color:var(--text-secondary);">${aqiCategory ? esc(aqiCategory) : 'No category reported'}</div>
          </div>
          <div style="padding:var(--space-3);border-radius:var(--radius-sm);background:var(--surface-2);">
            <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-2);">PM2.5</div>
            <div style="font-size:var(--text-2xl);font-weight:var(--weight-bold);">${show(pm25)}</div>
            <div style="font-size:var(--text-sm);color:var(--text-secondary);">μg/m³</div>
          </div>
          <div style="padding:var(--space-3);border-radius:var(--radius-sm);background:var(--surface-2);">
            <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-2);">UV index</div>
            <div style="font-size:var(--text-2xl);font-weight:var(--weight-bold);">${show(uvIndex)}</div>
          </div>
          <div style="padding:var(--space-3);border-radius:var(--radius-sm);background:var(--surface-2);">
            <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-2);">Water risk</div>
            <div style="font-size:var(--text-2xl);font-weight:var(--weight-bold);text-transform:capitalize;">${show(waterRisk)}</div>
          </div>
        </div>
        ${fetchedAt ? `<div style="margin-top:var(--space-3);font-size:var(--text-xs);color:var(--text-secondary);">Last updated ${esc(fetchedAt)}</div>` : ''}
      </div>`;
  } else {
    readings = `<div class="empty-state"><p>No environment data yet. Enter your city or zip code below to fetch air quality, UV index and water safety for your area.</p></div>`;
  }

  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card">
      <h4 style="margin-bottom:var(--space-4);">Environmental factors</h4>
      ${readings}
      <form id="env-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
        <div class="input-group"><label for="env-location">Location / city</label>
          <input class="input-field" type="text" id="env-location" value="" placeholder="e.g. Los Angeles, CA" autocomplete="off">
        </div>
        <button type="submit" id="env-refresh" class="btn btn-primary btn-block">Get environment data</button>
      </form>
    </div>
  </div>`;
}

// Resolves to { environment, error } so callers can tell "nothing saved yet" from "couldn't load".
async function loadLatestEnvironment() {
  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    if (!userId) return { environment: null, error: new Error('Not authenticated') };

    const res = await apiFetch(`/api/environment/latest?userId=${encodeURIComponent(userId)}`);
    if (res.status === 404) return { environment: null, error: null };
    if (!res.ok) return { environment: null, error: new Error(`Server responded ${res.status}`) };

    const json = await res.json();
    return { environment: json.environment || null, error: null };
  } catch (err) {
    console.warn('[HealthInput] Failed to load environment data', err);
    return { environment: null, error: err };
  }
}

async function refreshEnvironmentData() {
  const locationInput = document.getElementById('env-location');
  const btn = document.getElementById('env-refresh');
  const location = locationInput?.value?.trim();
  if (!location) {
    showToast('Enter a city or zip code first');
    locationInput?.focus();
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Getting data…'; }
  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    const res = await apiFetch(`/api/environment?userId=${encodeURIComponent(userId || '')}&location=${encodeURIComponent(location)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server responded ${res.status}`);
    }
    await res.json();
    // The server persists a snapshot when userId is provided
    showToast('Environment data saved');
    renderTabContent();
  } catch (err) {
    console.error('[HealthInput] Refresh failed', err);
    showToast(/not found|unknown location|could not find/i.test(err.message) ? "Couldn't find that location — try a city name or zip code." : "Couldn't get environment data. " + plainReason(err));
    if (btn) { btn.disabled = false; btn.textContent = 'Get environment data'; }
  }
}

// ═══════════════════════════════════════
//  Strava Section
// ═══════════════════════════════════════

async function renderStravaSection() {
  try {
    const { getStravaConfig, isStravaConnected, isStravaConfigured } = await import('../utils/strava.js');
    const cfg = getStravaConfig();
    const connected = isStravaConnected();
    const configured = isStravaConfigured();
    if (connected) return renderStravaConnected(cfg);
    if (configured) return renderStravaReady();
  } catch (e) {
    console.warn('Strava module not available:', e.message);
  }
  return renderStravaSetup();
}

function renderStravaSetup() {
  return `
    <div class="card" style="border:1px solid var(--viz-amber);">
      <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-4);">
        <div style="width:44px;height:44px;border-radius:var(--radius-md);background:var(--viz-amber-dim);display:flex;align-items:center;justify-content:center;" aria-hidden="true">
          <span style="color:var(--viz-amber);width:24px;height:24px;">${icons.strava}</span>
        </div>
        <div>
          <h4 style="margin-bottom:2px;">Connect Strava</h4>
          <p class="disclaimer" style="margin:0;">Import workouts automatically</p>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-3);">
        <p class="disclaimer">You'll need a Client ID and Client Secret from your own Strava API settings.</p>
        <div class="input-group"><label for="strava-client-id">Client ID</label>
          <input class="input-field" type="text" id="strava-client-id" placeholder="Your Strava Client ID" autocomplete="off">
        </div>
        <div class="input-group"><label for="strava-client-secret">Client Secret</label>
          <input class="input-field" type="password" id="strava-client-secret" placeholder="Your Strava Client Secret" autocomplete="off">
        </div>
        <button type="button" class="btn btn-block" id="strava-save-connect" style="background:var(--viz-amber);color:var(--text-inverse);">
          ${icons.link} Save &amp; connect to Strava
        </button>
      </div>
    </div>`;
}

function renderStravaReady() {
  return `
    <div class="card" style="border:1px solid var(--viz-amber);">
      <h4 style="margin-bottom:var(--space-3);">Strava is ready to authorize</h4>
      <button type="button" class="btn btn-block" id="strava-authorize" style="background:var(--viz-amber);color:var(--text-inverse);margin-bottom:var(--space-2);">
        Authorize with Strava
      </button>
      <button type="button" class="btn btn-ghost btn-block" id="strava-reset" style="font-size:var(--text-xs);">Reset credentials</button>
    </div>`;
}

function renderStravaConnected(cfg) {
  const lastSync = cfg.lastSync ? timeAgo(cfg.lastSync) : 'never';
  const activities = cfg.activities || [];
  const unimported = activities.filter(a => !a.imported);

  return `
    <div class="card" style="border:1px solid var(--viz-amber);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4);gap:var(--space-3);">
        <div style="display:flex;align-items:center;gap:var(--space-3);">
          <div style="width:44px;height:44px;border-radius:var(--radius-full);background:var(--viz-amber-dim);display:flex;align-items:center;justify-content:center;" aria-hidden="true">
            <span style="color:var(--viz-amber);width:24px;height:24px;">${icons.strava}</span>
          </div>
          <div>
            <h4 style="margin-bottom:2px;">Strava connected</h4>
            <p class="disclaimer" style="margin:0;">${esc(cfg.athleteName || 'Athlete')} • Synced ${esc(lastSync)}</p>
          </div>
        </div>
        <span class="badge" style="background:var(--viz-green-dim);color:var(--viz-green);">Connected</span>
      </div>
      <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-3);">
        <button type="button" class="btn btn-block" id="strava-sync" style="background:var(--viz-amber);color:var(--text-inverse);flex:2;">
          ${icons.refresh} Sync now
        </button>
        <button type="button" class="btn btn-secondary" id="strava-disconnect" style="flex:1;" aria-label="Disconnect Strava">${icons.unlink}</button>
      </div>
      ${unimported.length > 0 ? `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:var(--text-xs);color:var(--text-tertiary);">${unimported.length} ready to import</span>
          <button type="button" class="btn btn-sm" id="strava-import-all" style="background:var(--viz-amber-dim);color:var(--viz-amber);font-size:var(--text-xs);">Import all</button>
        </div>` : ''}
    </div>
    ${activities.length > 0 ? renderStravaActivities(activities) : ''}`;
}

function renderStravaActivities(activities) {
  return `
    <div class="section-heading"><h3>Strava activities</h3><span class="badge" style="background:var(--viz-amber-dim);color:var(--viz-amber);">${activities.length}</span></div>
    ${activities.slice(0, 10).map(a => {
      const dateStr = new Date(a.date).toLocaleDateString([], { month: 'short', day: 'numeric' });
      return `<div class="card card-sm" style="margin-bottom:var(--space-2);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-2);">
          <div style="display:flex;align-items:center;gap:var(--space-3);flex:1;min-width:0;">
            <div style="width:36px;height:36px;border-radius:var(--radius-md);background:var(--viz-amber-dim);display:flex;align-items:center;justify-content:center;flex-shrink:0;" aria-hidden="true">
              ${icons.activity}
            </div>
            <div style="min-width:0;">
              <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(a.name)}</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);">
                ${esc(dateStr)} • ${esc(a.duration)} min${a.distanceKm ? ' • ' + esc(a.distanceKm) + ' km' : ''}
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:var(--space-2);flex-shrink:0;">
            <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);color:var(--text-secondary);">${a.calories != null ? esc(a.calories) + ' kcal' : '—'}</span>
            ${a.imported
          ? '<span class="badge badge-green" style="font-size:var(--text-xs);">Imported</span>'
          : `<button type="button" class="btn btn-sm strava-import-btn" data-strava-id="${esc(a.stravaId)}" aria-label="Import ${esc(a.name)}" style="background:var(--viz-amber-dim);color:var(--viz-amber);font-size:var(--text-xs);padding:4px 10px;">Import</button>`
        }
          </div>
        </div>
      </div>`;
    }).join('')}`;
}

function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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
    const rpe = document.getElementById('res-rpe')?.value;
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
        rpe: rpe ? parseInt(rpe, 10) : null,
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
    try {
      const res = await apiFetch('/api/cycle/log', { method: 'POST', body: JSON.stringify({
        userId: currentUserId,
        event_type: document.getElementById('cycle-type')?.value,
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
        <span style="font-size:var(--text-sm);">Reading your lab report…</span>
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
            <span style="font-size:var(--text-sm);">${esc(name)}</span>
            <div style="display:flex;align-items:center;gap:var(--space-2);">
              ${data.reference_range ? `<span style="font-size:var(--text-xs);color:var(--text-tertiary);">ref: ${esc(data.reference_range)}</span>` : ''}
              <span style="font-family:var(--font-heading);font-weight:var(--weight-bold);color:${statusColor};">${esc(data.value)}</span>
              <span style="font-size:var(--text-xs);color:var(--text-tertiary);">${esc(data.unit || '')}</span>
              <span style="font-size:var(--text-xs);color:${statusColor};" aria-label="${statusLabel}" title="${statusLabel}">${statusIcon}</span>
            </div>
          </div>`;
      }).join('');

      resultsEl.style.display = 'block';
      resultsEl.innerHTML = `
        <div class="card" style="padding:var(--space-3);">
          <h4 style="margin-bottom:var(--space-1);">Markers we found</h4>
          <p class="disclaimer" style="margin-bottom:var(--space-2);">Read automatically from your file — please check the values against the original before saving.</p>
          ${parsed.collected_at ? `<p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:var(--space-3);">Collected: ${esc(parsed.collected_at)}</p>` : ''}
          <div style="max-height:300px;overflow-y:auto;margin-bottom:var(--space-3);">
            ${markerRows}
          </div>
          ${parsed.notes ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-3);">Notes: ${esc(parsed.notes)}</p>` : ''}
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

function setupStravaHandlers() {
  document.getElementById('strava-save-connect')?.addEventListener('click', async () => {
    const clientId = document.getElementById('strava-client-id')?.value?.trim();
    const clientSecret = document.getElementById('strava-client-secret')?.value?.trim();
    if (!clientId || !clientSecret) { showToast('Enter both the Client ID and Client Secret'); return; }
    try {
      const { saveStravaConfig, getAuthorizationUrl } = await import('../utils/strava.js');
      saveStravaConfig({ clientId, clientSecret });
      window.location.href = getAuthorizationUrl();
    } catch (err) { console.error('[Strava] connect failed:', err); showToast("Couldn't start the Strava connection. Please try again."); }
  });

  document.getElementById('strava-authorize')?.addEventListener('click', async () => {
    try {
      const { getAuthorizationUrl } = await import('../utils/strava.js');
      window.location.href = getAuthorizationUrl();
    } catch (err) { console.error('[Strava] authorize failed:', err); showToast("Couldn't open Strava authorization. Please try again."); }
  });

  document.getElementById('strava-reset')?.addEventListener('click', async () => {
    try {
      const { disconnectStrava, saveStravaConfig } = await import('../utils/strava.js');
      disconnectStrava();
      saveStravaConfig({ clientId: null, clientSecret: null });
      renderTabContent();
      showToast('Strava credentials cleared');
    } catch (err) { console.error('[Strava] reset failed:', err); showToast("Couldn't clear the Strava credentials."); }
  });

  document.getElementById('strava-sync')?.addEventListener('click', async () => {
    const btn = document.getElementById('strava-sync');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div> Syncing…';
    try {
      const { syncActivities } = await import('../utils/strava.js');
      const activities = await syncActivities();
      showToast(`Synced ${activities.length} activities from Strava`);
      renderTabContent();
    } catch (err) {
      console.error('[Strava] sync failed:', err);
      showToast("Strava sync didn't complete. " + plainReason(err));
      btn.disabled = false;
      btn.innerHTML = `${icons.refresh} Sync now`;
    }
  });

  document.getElementById('strava-disconnect')?.addEventListener('click', async () => {
    if (confirm('Disconnect Strava?')) {
      try {
        const { disconnectStrava } = await import('../utils/strava.js');
        disconnectStrava();
        renderTabContent();
        showToast('Strava disconnected');
      } catch (err) { console.error('[Strava] disconnect failed:', err); showToast("Couldn't disconnect Strava."); }
    }
  });

  document.getElementById('strava-import-all')?.addEventListener('click', async () => {
    try {
      const { importAllActivities } = await import('../utils/strava.js');
      const count = importAllActivities();
      showToast(`Imported ${count} activities`);
      renderTabContent();
    } catch (err) { console.error('[Strava] import failed:', err); showToast("Couldn't import the activities."); }
  });

  document.querySelectorAll('.strava-import-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const { getStravaConfig, importActivity } = await import('../utils/strava.js');
        const stravaId = parseInt(btn.dataset.stravaId);
        const cfg = getStravaConfig();
        const activity = cfg.activities?.find(a => a.stravaId === stravaId);
        if (activity) { importActivity(activity); showToast(`Imported "${activity.name}"`); renderTabContent(); }
      } catch (err) { console.error('[Strava] import failed:', err); showToast("Couldn't import that activity."); }
    });
  });
}

// ═══════════════════════════════════════
// MEDICATIONS — a log, nothing more. No interaction checks, no dosage advice.
// ═══════════════════════════════════════
async function renderMedications() {
  let meds = []; let loadError = null;
  try {
    const res = await apiFetch(`/api/medications?userId=${encodeURIComponent(currentUserId)}`);
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    meds = (await res.json()).medications || [];
  } catch (e) { loadError = e; }

  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card">
      <h4 style="margin-bottom:var(--space-2);">Log a medication</h4>
      <p class="disclaimer" style="margin-bottom:var(--space-3);">A private record for your own reference. VitalLens does not check interactions or suggest doses — follow your prescriber's instructions.</p>
      <form id="medication-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
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
          <div style="flex:1;">
            <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${esc(m.name)}${m.active === false ? ' <span class="badge">stopped</span>' : ''}</div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${esc(m.dose || '')}${m.dose && m.frequency ? ' • ' : ''}${esc(m.frequency || '')}${m.notes ? '<br>' + esc(m.notes) : ''}</div>
          </div>
          ${m.active !== false ? `<button type="button" class="btn btn-sm btn-ghost med-stop" data-id="${esc(m.id)}" aria-label="Mark ${esc(m.name)} as stopped">Stopped</button>` : ''}
        </div></div>`).join('')
      : '<div class="empty-state"><p>No medications logged.</p></div>'}
  </div>`;
}

// ═══════════════════════════════════════
// CYCLE — observational log that feeds cross-domain patterns.
// ═══════════════════════════════════════
async function renderCycle() {
  let history = []; let loadError = null;
  try {
    const res = await apiFetch(`/api/cycle/history?userId=${encodeURIComponent(currentUserId)}`);
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    const data = await res.json();
    history = data.history || data.entries || data.events || [];
  } catch (e) { loadError = e; }
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];

  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card">
      <h4 style="margin-bottom:var(--space-2);">Log a cycle event</h4>
      <p class="disclaimer" style="margin-bottom:var(--space-3);">Kept private and used only to look for patterns across your own logs.</p>
      <form id="cycle-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
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
          <span style="font-size:var(--text-sm);">${esc((h.event_type || '').replace(/_/g, ' '))}${h.symptom ? ' — ' + esc(h.symptom) : ''}${h.flow ? ' (' + esc(h.flow) + ')' : ''}</span>
          <span style="font-size:var(--text-xs);color:var(--text-tertiary);">${esc(h.date || '')}</span>
        </div>`).join('')
      : '<div class="empty-state"><p>No cycle entries yet.</p></div>'}
  </div>`;
}
