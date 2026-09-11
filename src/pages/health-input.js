// ─── Health Input Page — Labs, Exercise, Sleep, Habits, Substances, Background, Goals, Environment ─
import { icons } from '../icons.js';
import { labResults, exerciseLog, sleepLog, habits, getUserId } from '../lib/db.js'; // Supabase
import { apiFetch } from '../utils/api.js';


import { showToast } from '../utils/toast.js';
import { esc } from '../utils/esc.js';
let activeTab = 'labs';
let currentUserId = null;

export async function renderHealthInput() {
  // The old localStorage key was never written anywhere, so this was
  // permanently the literal 'default-user' and every request 403'd silently.
  currentUserId = await getUserId();

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="health-input stagger-children">
      <div class="page-header"><h1>Health Data</h1><p>Log your health metrics, labs, habits & more</p></div>
      <div class="tab-bar" id="health-tabs">
        <div class="tab-item active" data-tab="labs">Labs</div>
        <div class="tab-item" data-tab="exercise">Exercise</div>
        <div class="tab-item" data-tab="sleep">Sleep</div>
        <div class="tab-item" data-tab="habits">Habits</div>
        <div class="tab-item" data-tab="substances">Substances</div>
        <div class="tab-item" data-tab="background">Background</div>
        <div class="tab-item" data-tab="goals">Goals</div>
        <div class="tab-item" data-tab="env">Environ.</div>
        <div class="tab-item" data-tab="medications">Meds</div>
        <div class="tab-item" data-tab="cycle">Cycle</div>
      </div>
      <div id="health-tab-content"><div style="text-align:center;padding:var(--space-8);"><div class="spinner" style="margin:0 auto;"></div></div></div>
    </div>`;

  document.querySelectorAll('#health-tabs .tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#health-tabs .tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      renderTabContent();
    });
  });

  renderTabContent();
}

async function renderTabContent() {
  const container = document.getElementById('health-tab-content');
  container.innerHTML = '<div style="text-align:center;padding:var(--space-8);"><div class="spinner" style="margin:0 auto;"></div></div>';

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

  const html = await (renderers[activeTab] || renderLabs)();
  container.innerHTML = html;
  setupFormHandlers();
}

// ═══════════════════════════════════════
//  Labs Tab
// ═══════════════════════════════════════

async function renderLabs() {
  let labs = [];
  try { labs = await labResults.getAll(); } catch (e) { console.warn('Could not load labs:', e.message); }

  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">

    <div class="card">
      <h4 style="margin-bottom:var(--space-2);">Upload Lab Report</h4>
      <p style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-3);">
        Upload a PDF or photo of your blood panel, hormone panel, or any lab report. AI will extract all markers automatically.
      </p>
      <div class="upload-zone" id="lab-pdf-zone" style="padding:var(--space-4);cursor:pointer;">
        <input type="file" accept=".pdf,image/*" id="lab-pdf-input" style="display:none;">
        <div style="margin-bottom:var(--space-2);color:var(--text-tertiary);display:flex;justify-content:center;">${icons.droplet}</div>
        <p style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">Drop PDF or photo here</p>
        <p style="font-size:var(--text-xs);color:var(--text-tertiary);">Supports PDF, JPG, PNG up to 20MB</p>
        <button class="btn btn-sm btn-outline" style="margin-top:var(--space-2);" onclick="document.getElementById('lab-pdf-input').click();event.stopPropagation();">
          Choose File
        </button>
      </div>
      <div id="lab-parse-status" style="display:none;margin-top:var(--space-3);"></div>
      <div id="lab-parse-results" style="display:none;margin-top:var(--space-3);"></div>
    </div>

    <div class="card">
      <h4 style="margin-bottom:var(--space-4);">Add Single Result</h4>
      <form id="lab-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
        <div class="input-group"><label>Test Name</label>
          <select class="input-field" id="lab-name">
            <option value="">Select test...</option>
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
          <div class="input-group"><label>Value</label><input class="input-field" type="number" step="any" id="lab-value" placeholder="e.g. 45"></div>
          <div class="input-group"><label>Unit</label><input class="input-field" type="text" id="lab-unit" placeholder="ng/mL"></div>
        </div>
        <div class="input-group"><label>Date</label><input class="input-field" type="date" id="lab-date"></div>
        <button type="submit" class="btn btn-primary btn-block">Save Result</button>
      </form>
    </div>

    <div class="section-heading"><h3>Saved Results</h3><span class="badge badge-teal">${labs.length}</span></div>
    ${labs.length > 0 ? labs.slice(0, 10).map(l => {
    const markers = l.markers || {};
    const markerKeys = Object.keys(markers);
    const firstName = markerKeys[0];
    const firstMarker = markers[firstName] || {};
    const displayValue = firstMarker.value ?? l.value ?? '—';
    const displayUnit = firstMarker.unit ?? l.unit ?? '';
    const displayName = firstName ?? l.panel_type ?? 'Lab Result';
    const date = l.collected_at || l.uploaded_at?.split('T')[0] || '';
    const markerCount = markerKeys.length;
    const hasAbnormal = markerKeys.some(k => markers[k]?.status === 'high' || markers[k]?.status === 'low' || markers[k]?.status === 'critical');

    return `<div class="card card-sm">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${l.panel_type || displayName}</div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">
              ${date}${markerCount > 1 ? ` • ${markerCount} markers` : ''}
              ${hasAbnormal ? ' • <span style="color:var(--accent-amber);">Outside the report\'s reference range</span>' : ''}
            </div>
          </div>
          <div style="text-align:right;">
            ${markerCount === 1 ? `
              <div style="font-family:var(--font-heading);font-weight:var(--weight-bold);color:${firstMarker.status === 'high' || firstMarker.status === 'low' ? 'var(--accent-coral)' : 'var(--accent-teal)'};">${displayValue}</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${displayUnit}</div>
            ` : `
              <div class="badge badge-teal">${markerCount} markers</div>
            `}
          </div>
        </div>
        ${markerCount > 1 ? `
        <div style="margin-top:var(--space-2);display:flex;flex-wrap:wrap;gap:var(--space-1);">
          ${markerKeys.slice(0, 6).map(k => {
      const m = markers[k];
      const statusColor = m.status === 'high' || m.status === 'critical' ? 'var(--accent-coral)' : m.status === 'low' ? 'var(--accent-amber)' : 'var(--text-tertiary)';
      return `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:var(--surface-2);color:${statusColor};">${k}: ${m.value}${m.unit || ''}</span>`;
    }).join('')}
          ${markerKeys.length > 6 ? `<span style="font-size:10px;padding:2px 6px;color:var(--text-tertiary);">+${markerKeys.length - 6} more</span>` : ''}
        </div>` : ''}
      </div>`;
  }).join('') : '<div class="card" style="text-align:center;padding:var(--space-6);"><p style="font-size:var(--text-sm);">No lab results logged yet</p></div>'}
  </div>`;
}

// ═══════════════════════════════════════
//  Exercise Tab + Strava
// ═══════════════════════════════════════

async function renderExercise() {
  let log = [];
  try { log = await exerciseLog.getRecent(8); } catch (e) { console.warn('Could not load exercise:', e.message); }

  const stravaSection = await renderStravaSection();

  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    ${stravaSection}
    <div class="card">
      <h4 style="margin-bottom:var(--space-4);">Manual Resistance Training Logger</h4>
      <form id="resistance-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
        <div class="input-group"><label>Exercise Name</label>
          <input class="input-field" type="text" id="res-ex-name" placeholder="e.g. Bench Press, Deadlift, Pull-Up">
        </div>
        <div class="grid-3">
          <div class="input-group"><label>Sets</label><input class="input-field" type="number" min="1" id="res-sets" placeholder="4"></div>
          <div class="input-group"><label>Reps</label><input class="input-field" type="number" min="1" id="res-reps" placeholder="8"></div>
          <div class="input-group"><label>Weight (kg)</label><input class="input-field" type="number" min="0" step="0.5" id="res-weight" placeholder="90"></div>
        </div>
        <div class="input-group">
          <label>Rate of Perceived Exertion</label>
          <div style="display:flex;align-items:center;gap:var(--space-3);">
            <input class="input-field" type="range" min="1" max="10" id="res-rpe" value="5" style="flex:1;">
            <span id="res-rpe-display" style="min-width:28px;text-align:center;">5</span>
          </div>
        </div>
        <div class="input-group"><label>Muscle Groups</label>
          <div id="res-muscle-groups" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;">
            <button type="button" class="btn btn-sm" data-group="Chest">Chest</button>
            <button type="button" class="btn btn-sm" data-group="Back">Back</button>
            <button type="button" class="btn btn-sm" data-group="Shoulders">Shoulders</button>
            <button type="button" class="btn btn-sm" data-group="Arms">Arms</button>
            <button type="button" class="btn btn-sm" data-group="Core">Core</button>
            <button type="button" class="btn btn-sm" data-group="Legs">Legs</button>
            <button type="button" class="btn btn-sm" data-group="Glutes">Glutes</button>
            <button type="button" class="btn btn-sm" data-group="Full Body">Full Body</button>
          </div>
        </div>
        <div class="input-group"><label>Notes</label>
          <textarea class="input-field" id="res-notes" placeholder="Optional notes about the set, tempo, or form" rows="3"></textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Log Resistance Workout</button>
      </form>
    </div>

    <div class="card">
      <h4 style="margin-bottom:var(--space-4);">Manual Cardio Logger</h4>
      <form id="cardio-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
        <div class="input-group"><label>Activity Type</label>
          <select class="input-field" id="cardio-type">
            <option value="">Select cardio type...</option>
            <option>Run</option>
            <option>Bike</option>
            <option>Swim</option>
            <option>Walk</option>
            <option>Row</option>
            <option>Other</option>
          </select>
        </div>
        <div class="grid-2">
          <div class="input-group"><label>Duration (minutes)</label><input class="input-field" type="number" min="1" id="cardio-duration" placeholder="30"></div>
          <div class="input-group"><label>Distance (km)</label><input class="input-field" type="number" min="0" step="0.1" id="cardio-distance" placeholder="5.0"></div>
        </div>
        <div class="input-group"><label>Calories Burned (optional)</label><input class="input-field" type="number" min="0" id="cardio-calories" placeholder="250"></div>
        <div class="input-group"><label>Notes</label>
          <textarea class="input-field" id="cardio-notes" placeholder="Optional cardio notes" rows="3"></textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Log Cardio</button>
      </form>
    </div>

    <div class="section-heading"><h3>Exercise Log</h3><span class="badge badge-teal">${log.length}</span></div>
    ${log.length > 0 ? log.map(renderExerciseCard).join('') : '<div class="card" style="text-align:center;padding:var(--space-6);"><p style="font-size:var(--text-sm);">No exercises logged</p></div>'}
  </div>`;
}

function renderExerciseCard(e) {
  const isStrava = e.source === 'strava';
  return `<div class="card card-sm">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div style="display:flex;align-items:center;gap:var(--space-3);">
        <div style="width:36px;height:36px;border-radius:var(--radius-md);background:${isStrava ? 'rgba(252,82,0,0.15)' : 'var(--accent-blue-dim)'};display:flex;align-items:center;justify-content:center;">
          ${isStrava ? `<span style="color:#FC5200;width:20px;height:20px;">${icons.strava}</span>` : `<span style="color:var(--text-secondary);width:20px;height:20px;">${icons.activity}</span>`}
        </div>
        <div>
          <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${e.name || e.type}</div>
          <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${e.duration}min • ${e.intensity}${e.distance ? ' • ' + e.distance : ''}${e.heart_rate ? ' • ' + Math.round(e.heart_rate) + 'bpm' : ''}</div>
        </div>
      </div>
      <span style="font-weight:var(--weight-semibold);color:${isStrava ? '#FC5200' : 'var(--accent-blue)'};">${e.calories || '—'} kcal</span>
    </div>
  </div>`;
}

// ═══════════════════════════════════════
//  Sleep Tab
// ═══════════════════════════════════════

async function renderSleep() {
  let log = [];
  try { log = await sleepLog.getRecent(7); } catch (e) { console.warn('Could not load sleep:', e.message); }

  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card">
      <h4 style="margin-bottom:var(--space-4);">Log Sleep</h4>
      <form id="sleep-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
        <div class="grid-2">
          <div class="input-group"><label>Hours Slept</label><input class="input-field" type="number" step="0.5" id="sleep-hours" placeholder="7.5"></div>
          <div class="input-group"><label>Quality</label>
            <select class="input-field" id="sleep-quality">
              <option value="" selected disabled>Select…</option><option>Poor</option><option>Fair</option><option>Good</option><option>Excellent</option>
            </select>
          </div>
        </div>
        <div class="grid-2">
          <div class="input-group"><label>Bedtime</label><input class="input-field" type="time" id="sleep-bedtime"></div>
          <div class="input-group"><label>Wake Time</label><input class="input-field" type="time" id="sleep-wake"></div>
        </div>
        <div class="input-group"><label>Notes</label><input class="input-field" type="text" id="sleep-notes" placeholder="Any notes..."></div>
        <button type="submit" class="btn btn-primary btn-block">Log Sleep</button>
      </form>
    </div>
    <div class="section-heading"><h3>Sleep Log</h3></div>
    ${log.length > 0 ? log.map(s => `<div class="card card-sm">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;align-items:center;gap:var(--space-3);">
          <div style="width:36px;height:36px;border-radius:var(--radius-md);background:var(--bg-chip);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);">${icons.moon}</div>
          <div>
            <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${s.hours}h — ${s.quality}</div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${s.bedtime || ''} ${s.wake_time || s.wake || ''}</div>
          </div>
        </div>
        <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${s.date || ''}</div>
      </div>
    </div>`).join('') : '<div class="card" style="text-align:center;padding:var(--space-6);"><p style="font-size:var(--text-sm);">No sleep data logged</p></div>'}
  </div>`;
}

// ═══════════════════════════════════════
//  Habits Tab
// ═══════════════════════════════════════

async function renderHabits() {
  let h = {};
  try { h = await habits.getToday() || {}; } catch (e) { console.warn('Could not load habits:', e.message); }

  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card">
      <h4 style="margin-bottom:var(--space-4);">Lifestyle Habits</h4>
      <div style="display:flex;flex-direction:column;gap:var(--space-4);">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:var(--space-3);"><span style="color:var(--text-secondary);display:flex;">${icons.wind}</span><span style="font-size:var(--text-sm);">Smoking</span></div>
          <div class="toggle ${h.smoking ? 'active' : ''}" id="toggle-smoking"></div>
        </div>
        <div class="divider" style="margin:0;"></div>
        <div class="input-group"><label>Alcohol Consumption</label>
          <select class="input-field" id="habit-alcohol">
            <option ${h.alcohol === 'none' ? 'selected' : ''}>none</option>
            <option ${h.alcohol === 'light' ? 'selected' : ''}>light</option>
            <option ${h.alcohol === 'moderate' ? 'selected' : ''}>moderate</option>
            <option ${h.alcohol === 'heavy' ? 'selected' : ''}>heavy</option>
          </select>
        </div>
        <div class="input-group"><label>Caffeine Intake</label>
          <select class="input-field" id="habit-caffeine">
            <option ${h.caffeine === 'none' ? 'selected' : ''}>none</option>
            <option ${h.caffeine === 'light' ? 'selected' : ''}>light</option>
            <option ${h.caffeine === 'moderate' ? 'selected' : ''}>moderate</option>
            <option ${h.caffeine === 'heavy' ? 'selected' : ''}>heavy</option>
          </select>
        </div>
        <div class="input-group"><label>Daily Water (glasses)</label>
          <input class="input-field" type="number" id="habit-water" value="${h.water_glasses ?? ''}" min="0" max="20" placeholder="e.g. 8">
        </div>
        <div class="input-group"><label>Stress Level (1-10)</label>
          <input class="input-field" type="number" id="habit-stress" value="${h.stress_level || ''}" min="1" max="10" placeholder="5">
        </div>
        <div class="input-group"><label>Steps Today</label>
          <input class="input-field" type="number" id="habit-steps" value="${h.steps ?? ''}" min="0" max="100000" placeholder="e.g. 8500">
        </div>
        <div class="input-group"><label>Mood</label>
          <select class="input-field" id="habit-mood">
            <option value="">Select...</option>
            <option ${h.mood === 'great' ? 'selected' : ''}>great</option>
            <option ${h.mood === 'good' ? 'selected' : ''}>good</option>
            <option ${h.mood === 'neutral' ? 'selected' : ''}>neutral</option>
            <option ${h.mood === 'low' ? 'selected' : ''}>low</option>
            <option ${h.mood === 'bad' ? 'selected' : ''}>bad</option>
          </select>
        </div>
        <button class="btn btn-primary btn-block" id="save-habits">Save Today's Habits</button>
      </div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════
//  Substances Tab
// ═══════════════════════════════════════

async function renderSubstances() {
  let supplements = [];
  try {
    const res = await apiFetch(`/api/supplements?userId=${encodeURIComponent(currentUserId)}`);
    if (res.ok) {
      const data = await res.json();
      supplements = data.supplements || [];
    }
  } catch (e) {
    console.warn('Could not load supplements:', e.message);
  }

  const categoryColors = {
    supplement: { bg: 'rgba(34, 197, 94, 0.15)', text: 'var(--accent-green)' },
    prescription: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3B82F6' },
    recreational: { bg: 'rgba(168, 85, 247, 0.15)', text: '#A855F7' },
  };

  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card">
      <h4 style="margin-bottom:var(--space-4);">Log Substance</h4>
      <form id="substance-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
        <div class="input-group"><label>Name</label>
          <input class="input-field" type="text" id="substance-name" placeholder="e.g. Magnesium, Metformin, etc.">
        </div>
        <div class="input-group"><label>Category</label>
          <select class="input-field" id="substance-category">
            <option value="">Select category...</option>
            <option value="supplement">Supplement</option>
            <option value="prescription">Prescription</option>
            <option value="recreational">Recreational</option>
          </select>
        </div>
        <div class="grid-2">
          <div class="input-group"><label>Dose</label><input class="input-field" type="text" id="substance-dose" placeholder="e.g. 500mg"></div>
          <div class="input-group"><label>Frequency</label>
            <select class="input-field" id="substance-frequency">
              <option value="">Select...</option>
              <option>Once daily</option>
              <option>Twice daily</option>
              <option>Three times daily</option>
              <option>As needed</option>
              <option>Weekly</option>
              <option>Monthly</option>
            </select>
          </div>
        </div>
        <div class="input-group"><label>Notes (optional)</label>
          <input class="input-field" type="text" id="substance-notes" placeholder="Any notes about this substance...">
        </div>
        <button type="submit" class="btn btn-primary btn-block">Add Substance</button>
      </form>
    </div>

    <div class="section-heading"><h3>Active Substances</h3><span class="badge badge-teal">${supplements.length}</span></div>
    ${supplements.length > 0 ? supplements.map(s => {
      const categoryStyle = categoryColors[s.category] || categoryColors.supplement;
      const label = s.category === 'prescription' ? 'Rx' : s.category === 'recreational' ? 'Rec' : 'SUPP';
      return `<div class="card card-sm">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-3);">
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-1);">
              <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${s.name}</div>
              <span class="badge" style="background:${categoryStyle.bg};color:${categoryStyle.text};font-size:10px;">${label}</span>
            </div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">
              ${s.dose ? s.dose + ' • ' : ''}${s.frequency || 'Frequency not set'}
              ${s.notes ? '<br>' + s.notes : ''}
            </div>
          </div>
          <button class="btn btn-sm btn-ghost substance-delete" data-id="${s.id}" style="color:var(--text-tertiary);font-size:var(--text-xs);">✕</button>
        </div>
      </div>`;
    }).join('') : '<div class="card" style="text-align:center;padding:var(--space-6);"><p style="font-size:var(--text-sm);">No substances logged yet</p></div>'}
  </div>`;
}

// ═══════════════════════════════════════
//  Background Tab
// ═══════════════════════════════════════

async function renderBackground() {
  let profile = null;
  try {
    const res = await apiFetch(`/api/health-profile?userId=${encodeURIComponent(currentUserId)}`);
    if (res.ok) {
      const data = await res.json();
      profile = data.profile || {};
    }
  } catch (e) {
    console.warn('Could not load profile:', e.message);
  }

  const conditions = [
    'IBS', 'Diabetes', 'Hypertension', 'Anxiety', 'Depression',
    'ADHD', 'Hypothyroid', 'PCOS', 'Acne', 'Eczema',
    'Asthma', 'Arthritis', 'Migraines', 'GERD', 'Celiac',
    'Crohns', 'Sleep Apnea', 'Endometriosis', 'High Cholesterol', 'Chronic Fatigue'
  ];

  const selectedConditions = profile?.conditions ? (typeof profile.conditions === 'string' ? JSON.parse(profile.conditions) : profile.conditions) : [];

  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card">
      <h4 style="margin-bottom:var(--space-4);">Medical History</h4>
      <form id="background-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
        <div>
          <label style="display:block;margin-bottom:var(--space-2);font-weight:var(--weight-semibold);font-size:var(--text-sm);">Health Conditions</label>
          <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:var(--space-2);">
            ${conditions.map(condition => `
              <label style="display:flex;align-items:center;gap:var(--space-2);cursor:pointer;padding:var(--space-2);border-radius:var(--radius-md);border:1px solid var(--border);transition:all 0.2s;">
                <input type="checkbox" class="condition-check" value="${condition}" ${selectedConditions.includes(condition) ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;">
                <span style="font-size:var(--text-sm);">${condition}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="input-group"><label>Allergies</label>
          <textarea class="input-field" id="bg-allergies" placeholder="List any allergies (medication, food, environmental, etc.)..." style="min-height:100px;resize:vertical;">${profile?.allergies || ''}</textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Save Health Background</button>
      </form>
    </div>
  </div>`;
}

// ═══════════════════════════════════════
//  Goals Tab
// ═══════════════════════════════════════

async function renderGoals() {
  let goals = null;
  try {
    const res = await apiFetch(`/api/user-goals?userId=${encodeURIComponent(currentUserId)}`);
    if (res.ok) {
      const data = await res.json();
      goals = data.goals || {};
    }
  } catch (e) {
    console.warn('Could not load goals:', e.message);
  }

  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card">
      <h4 style="margin-bottom:var(--space-4);">Health Goals & Preferences</h4>
      <form id="goals-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
        <div class="input-group"><label>Goals & Objectives</label>
          <textarea class="input-field" id="goals-text" placeholder="What are your health goals? (e.g., lose weight, improve energy, manage stress, etc.)" style="min-height:120px;resize:vertical;">${goals?.goals_text || ''}</textarea>
        </div>
        <div class="input-group"><label>Dietary Restrictions</label>
          <textarea class="input-field" id="goals-dietary" placeholder="Any dietary restrictions, preferences, or requirements (e.g., vegetarian, gluten-free, keto, etc.)" style="min-height:100px;resize:vertical;">${goals?.dietary_restrictions || ''}</textarea>
        </div>
        <div class="input-group"><label>Health Concerns</label>
          <textarea class="input-field" id="goals-concerns" placeholder="Current health concerns or challenges you'd like to address..." style="min-height:100px;resize:vertical;">${goals?.health_concerns || ''}</textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Save Goals</button>
      </form>
    </div>
  </div>`;
}

// ═══════════════════════════════════════
//  Environment Tab
// ═══════════════════════════════════════

async function renderEnvironment() {
  const env = await loadLatestEnvironment(); console.log('[ENV DEBUG]', JSON.stringify(env));
  const air = env?.air || { aqi: env?.aqi, aqiCategory: env?.aqi_category, pm2_5: env?.pm2_5, uv_index: env?.uv_index ?? env?.raw?.air?.uv_index };
  const waterRisk = env?.water_risk ?? env?.raw?.water?.risk_level ?? null;
  const aqi = (air?.aqi != null) ? air.aqi : '--';
  const aqiCategory = air?.aqiCategory || 'Unknown';
  const pm25 = (air?.pm2_5 != null) ? air.pm2_5 : '--';
  const uvIndex = (air?.uv_index != null && air?.uv_index !== undefined) ? air.uv_index : (env?.raw?.air?.uv_index != null ? env.raw.air.uv_index : '--');
  const locationValue = env?.location || '';
  const fetchedAt = env?.fetched_at ? new Date(env.fetched_at).toLocaleString() : null;
  const aqiColor = (typeof aqi === 'number') ? (aqi <= 50 ? 'var(--accent-green)' : aqi <= 100 ? 'var(--accent-amber)' : 'var(--accent-coral)') : 'var(--text-secondary)';

  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card">
      <h4 style="margin-bottom:var(--space-4);">Environmental Factors</h4>
      ${locationValue ? `<div style="font-size:var(--text-xl);font-weight:700;color:var(--accent-teal);margin-bottom:var(--space-3);">${locationValue}</div>` : ''}
      <div class="card card-sm" style="margin-bottom:var(--space-4);">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
          <div style="padding:var(--space-3);border-radius:var(--radius-sm);background:var(--surface-2);">
            <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-2);">AQI</div>
            <div style="font-size:var(--text-3xl);font-weight:var(--weight-bold);color:${aqiColor};">${aqi}</div>
            <div style="font-size:var(--text-sm);color:var(--text-secondary);">${aqiCategory}</div>
          </div>
          <div style="padding:var(--space-3);border-radius:var(--radius-sm);background:var(--surface-2);">
            <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-2);">PM2.5</div>
            <div style="font-size:var(--text-2xl);font-weight:var(--weight-bold);">${pm25}</div>
            <div style="font-size:var(--text-sm);color:var(--text-secondary);">μg/m³</div>
          </div>
          <div style="padding:var(--space-3);border-radius:var(--radius-sm);background:var(--surface-2);">
            <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-2);">UV Index</div>
            <div style="font-size:var(--text-2xl);font-weight:var(--weight-bold);">${uvIndex}</div>
          </div>
          <div style="padding:var(--space-3);border-radius:var(--radius-sm);background:var(--surface-2);">
            <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-2);">Water Risk</div>
            <div style="font-size:var(--text-2xl);font-weight:var(--weight-bold);text-transform:capitalize;">${waterRisk ?? 'No data'}</div>
          </div>
        </div>
        ${fetchedAt ? `<div style="margin-top:var(--space-3);font-size:var(--text-xs);color:var(--text-secondary);">Last updated: ${fetchedAt}</div>` : ''}
      </div>
      <form id="env-form" style="display:flex;flex-direction:column;gap:var(--space-3);">
        <div class="input-group"><label>Location / City</label>
          <input class="input-field" type="text" id="env-location" value="" placeholder="e.g. Los Angeles, CA">
        </div>
        ${!locationValue ? `<div style="font-size:var(--text-sm);color:var(--text-tertiary);">Enter your city or zip code to fetch live air quality,<br>UV index, and water safety data for your area.</div>` : ''}
        <button type="button" id="env-refresh" class="btn btn-primary btn-block">Get Environment Data</button>
      </form>
    </div>
  </div>`;
}

async function loadLatestEnvironment() {
  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    if (!userId) return null;

    const res = await apiFetch(`/api/environment/latest?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return null;

    const json = await res.json();
    return json.environment || null;
  } catch (err) {
    console.warn('[HealthInput] Failed to load environment data', err);
    return null;
  }
}

async function refreshEnvironmentData() {
  const locationInput = document.getElementById('env-location');
  const location = locationInput?.value?.trim();
  if (!location) {
    showToast('Enter a location before refreshing');
    return;
  }

  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    const res = await apiFetch(`/api/environment?userId=${encodeURIComponent(userId || '')}&location=${encodeURIComponent(location)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to refresh environment');
    }

    const json = await res.json();
    // The server persists a snapshot when userId is provided
    showToast('Environment data saved');
    renderTabContent();
  } catch (err) {
    console.error('[HealthInput] Refresh failed', err);
    showToast(`${err.message}`);
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
    <div class="card" style="border:1px solid rgba(252,82,0,0.3);background:linear-gradient(145deg, rgba(252,82,0,0.08), rgba(252,82,0,0.02));">
      <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-4);">
        <div style="width:44px;height:44px;border-radius:var(--radius-md);background:rgba(252,82,0,0.15);display:flex;align-items:center;justify-content:center;">
          <span style="color:#FC5200;width:24px;height:24px;">${icons.strava}</span>
        </div>
        <div>
          <h4 style="color:#FC5200;margin-bottom:2px;">Connect Strava</h4>
          <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin:0;">Import workouts automatically</p>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-3);">
        <div class="input-group"><label>Client ID</label>
          <input class="input-field" type="text" id="strava-client-id" placeholder="Your Strava Client ID">
        </div>
        <div class="input-group"><label>Client Secret</label>
          <input class="input-field" type="password" id="strava-client-secret" placeholder="Your Strava Client Secret">
        </div>
        <button class="btn btn-block" id="strava-save-connect" style="background:linear-gradient(135deg, #FC5200, #FF7A33);color:white;">
          ${icons.link} Save & Connect to Strava
        </button>
      </div>
    </div>`;
}

function renderStravaReady() {
  return `
    <div class="card" style="border:1px solid rgba(252,82,0,0.3);">
      <h4 style="color:#FC5200;margin-bottom:var(--space-3);">Strava Ready</h4>
      <button class="btn btn-block" id="strava-authorize" style="background:linear-gradient(135deg, #FC5200, #FF7A33);color:white;margin-bottom:var(--space-2);">
        Authorize with Strava
      </button>
      <button class="btn btn-ghost btn-block" id="strava-reset" style="font-size:var(--text-xs);">Reset Credentials</button>
    </div>`;
}

function renderStravaConnected(cfg) {
  const lastSync = cfg.lastSync ? timeAgo(cfg.lastSync) : 'Never';
  const activities = cfg.activities || [];
  const unimported = activities.filter(a => !a.imported);

  return `
    <div class="card" style="border:1px solid rgba(252,82,0,0.3);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4);">
        <div style="display:flex;align-items:center;gap:var(--space-3);">
          <div style="width:44px;height:44px;border-radius:var(--radius-full);background:rgba(252,82,0,0.15);display:flex;align-items:center;justify-content:center;">
            <span style="color:#FC5200;width:24px;height:24px;">${icons.strava}</span>
          </div>
          <div>
            <h4 style="color:#FC5200;margin-bottom:2px;">Strava Connected</h4>
            <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin:0;">${cfg.athleteName || 'Athlete'} • Synced ${lastSync}</p>
          </div>
        </div>
        <span class="badge" style="background:rgba(52,211,153,0.15);color:var(--accent-green);">● Live</span>
      </div>
      <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-3);">
        <button class="btn btn-block" id="strava-sync" style="background:linear-gradient(135deg, #FC5200, #FF7A33);color:white;flex:2;">
          ${icons.refresh} Sync Now
        </button>
        <button class="btn btn-secondary" id="strava-disconnect" style="flex:1;">${icons.unlink}</button>
      </div>
      ${unimported.length > 0 ? `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:var(--text-xs);color:var(--text-tertiary);">${unimported.length} ready to import</span>
          <button class="btn btn-sm" id="strava-import-all" style="background:rgba(252,82,0,0.15);color:#FC5200;font-size:var(--text-xs);">Import All</button>
        </div>` : ''}
    </div>
    ${activities.length > 0 ? renderStravaActivities(activities) : ''}`;
}

function renderStravaActivities(activities) {
  return `
    <div class="section-heading"><h3>Strava Activities</h3><span class="badge" style="background:rgba(252,82,0,0.15);color:#FC5200;">${activities.length}</span></div>
    ${activities.slice(0, 10).map(a => {
    const dateStr = new Date(a.date).toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `<div class="card card-sm" style="margin-bottom:var(--space-2);">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:var(--space-3);flex:1;min-width:0;">
            <div style="width:36px;height:36px;border-radius:var(--radius-md);background:rgba(252,82,0,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              ${getActivityEmoji(a.type)}
            </div>
            <div style="min-width:0;">
              <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.name}</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);">
                ${dateStr} • ${a.duration}min${a.distanceKm ? ' • ' + a.distanceKm + 'km' : ''}
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:var(--space-2);flex-shrink:0;">
            <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);color:#FC5200;">${a.calories || '—'}</span>
            ${a.imported
        ? '<span class="badge badge-green" style="font-size:9px;">Imported</span>'
        : `<button class="btn btn-sm strava-import-btn" data-strava-id="${a.stravaId}" style="background:rgba(252,82,0,0.15);color:#FC5200;font-size:10px;padding:4px 10px;">Import</button>`
      }
          </div>
        </div>
      </div>`;
  }).join('')}`;
}

function getActivityEmoji(type) {
  return icons.activity;
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
  document.getElementById('lab-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('lab-name').value;
    const value = document.getElementById('lab-value').value;
    const unit = document.getElementById('lab-unit').value;
    const date = document.getElementById('lab-date').value;
    if (!name || !value) return;

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
      showToast('Failed to save lab result');
    }
  });

  document.getElementById('res-rpe')?.addEventListener('input', event => {
    const display = document.getElementById('res-rpe-display');
    if (display) display.innerText = event.target.value;
  });

  document.querySelectorAll('#res-muscle-groups button').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
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
      showToast('Please enter the exercise name');
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
      showToast('Failed to log resistance workout');
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
      showToast('Please select cardio type and duration');
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
      showToast('Failed to log cardio');
    }
  });

  document.getElementById('sleep-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const hours = parseFloat(document.getElementById('sleep-hours').value);
    const quality = document.getElementById('sleep-quality').value;
    const bedtime = document.getElementById('sleep-bedtime').value;
    const wake = document.getElementById('sleep-wake').value;
    const notes = document.getElementById('sleep-notes').value;
    if (!hours) return;

    try {
      await sleepLog.log({ hours, quality, bedtime, wakeTime: wake, notes });
      showToast('Sleep logged');
      renderTabContent();
    } catch (err) {
      console.error('Sleep save failed:', err);
      showToast('Failed to log sleep');
    }
  });

  document.getElementById('toggle-smoking')?.addEventListener('click', function () {
    this.classList.toggle('active');
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
      showToast('Medication logged'); renderTab();
    } catch (err) { showToast(err.message || 'Could not save medication'); }
  });
  document.querySelectorAll('.med-stop').forEach(btn => btn.addEventListener('click', async () => {
    try {
      const res = await apiFetch(`/api/medications/${btn.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ userId: currentUserId, active: false }) });
      if (!res.ok) throw new Error('Update failed');
      showToast('Marked as stopped'); renderTab();
    } catch (err) { showToast(err.message); }
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
      showToast('Cycle entry logged'); renderTab();
    } catch (err) { showToast(err.message || 'Could not save entry'); }
  });

  document.getElementById('save-habits')?.addEventListener('click', async () => {
    try {
      await habits.logToday({
        smoking: document.getElementById('toggle-smoking')?.classList.contains('active') || false,
        alcohol: document.getElementById('habit-alcohol')?.value || 'none',
        caffeine: document.getElementById('habit-caffeine')?.value || null,
        waterGlasses: document.getElementById('habit-water')?.value === '' ? null : parseInt(document.getElementById('habit-water')?.value, 10),
        stressLevel: parseInt(document.getElementById('habit-stress')?.value || '0') || null,
        steps: parseInt(document.getElementById('habit-steps')?.value || '') || null,
        mood: document.getElementById('habit-mood')?.value || null,
      });
      showToast('Habits saved');
    } catch (err) {
      console.error('Habits save failed:', err);
      showToast('Failed to save habits');
    }
  });

  document.getElementById('substance-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('substance-name').value;
    const category = document.getElementById('substance-category').value;
    const dose = document.getElementById('substance-dose').value;
    const frequency = document.getElementById('substance-frequency').value;
    const notes = document.getElementById('substance-notes').value;

    if (!name || !category) {
      showToast('Please fill in name and category');
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
      showToast('Failed to add substance');
    }
  });

  document.querySelectorAll('.substance-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this substance?')) return;
      const id = btn.dataset.id;
      try {
        const res = await apiFetch(`/api/supplements/${id}?userId=${encodeURIComponent(currentUserId)}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete');
        showToast('Substance removed');
        renderTabContent();
      } catch (err) {
        console.error('Delete failed:', err);
        showToast('Failed to remove substance');
      }
    });
  });

  document.getElementById('background-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const selectedConditions = Array.from(document.querySelectorAll('.condition-check:checked')).map(c => c.value);
    const allergies = document.getElementById('bg-allergies').value;

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
      showToast('Failed to save health background');
    }
  });

  document.getElementById('goals-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const goals_text = document.getElementById('goals-text').value;
    const dietary_restrictions = document.getElementById('goals-dietary').value;
    const health_concerns = document.getElementById('goals-concerns').value;

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
      showToast('Failed to save goals');
    }
  });

  document.getElementById('env-refresh')?.addEventListener('click', async () => {
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
    });
  }

  async function parseLabFile(file) {
    const statusEl = document.getElementById('lab-parse-status');
    const resultsEl = document.getElementById('lab-parse-results');
    if (!statusEl || !resultsEl) return;

    statusEl.style.display = 'block';
    statusEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:var(--space-2);padding:var(--space-3);background:var(--surface-2);border-radius:var(--radius-md);">
        <div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>
        <span style="font-size:var(--text-sm);">Analyzing lab report with AI...</span>
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
        throw new Error(err.error || `Parse failed (${res.status})`);
      }

      const parsed = await res.json();
      const markerCount = Object.keys(parsed.markers || {}).length;

      if (markerCount === 0) {
        statusEl.innerHTML = `
          <div style="padding:var(--space-3);background:var(--accent-coral-dim);border-radius:var(--radius-md);color:var(--accent-coral);font-size:var(--text-sm);">
            No lab markers found. Try a clearer image or different file.
          </div>`;
        return;
      }

      statusEl.innerHTML = `
        <div style="padding:var(--space-3);background:var(--accent-teal-dim);border-radius:var(--radius-md);color:var(--accent-teal);font-size:var(--text-sm);">
          Found ${markerCount} markers from ${esc(parsed.panel_type || 'lab report')}${parsed.lab_name ? ` (${esc(parsed.lab_name)})` : ''}
        </div>`;

      const markerRows = Object.entries(parsed.markers || {}).map(([name, data]) => {
        const statusColor = data.status === 'high' || data.status === 'critical'
          ? 'var(--accent-coral)' : data.status === 'low'
            ? 'var(--accent-amber)' : 'var(--accent-green)';
        const statusIcon = data.status === 'high' ? '↑' : data.status === 'low' ? '↓' : data.status === 'critical' ? '!' : '✓';
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) 0;border-bottom:1px solid var(--border);">
            <span style="font-size:var(--text-sm);">${esc(name)}</span>
            <div style="display:flex;align-items:center;gap:var(--space-2);">
              ${data.reference_range ? `<span style="font-size:var(--text-xs);color:var(--text-tertiary);">ref: ${esc(data.reference_range)}</span>` : ''}
              <span style="font-family:var(--font-heading);font-weight:var(--weight-bold);color:${statusColor};">${esc(data.value)}</span>
              <span style="font-size:var(--text-xs);color:var(--text-tertiary);">${esc(data.unit || '')}</span>
              <span style="font-size:12px;color:${statusColor};">${statusIcon}</span>
            </div>
          </div>`;
      }).join('');

      resultsEl.style.display = 'block';
      resultsEl.innerHTML = `
        <div class="card" style="padding:var(--space-3);">
          <h4 style="margin-bottom:var(--space-1);">Extracted Markers</h4>
          ${parsed.collected_at ? `<p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:var(--space-3);">Collected: ${esc(parsed.collected_at)}</p>` : ''}
          <div style="max-height:300px;overflow-y:auto;margin-bottom:var(--space-3);">
            ${markerRows}
          </div>
          ${parsed.notes ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-3);">Notes: ${esc(parsed.notes)}</p>` : ''}
          <button id="confirm-save-labs" class="btn btn-primary btn-block">
            Save ${markerCount} Markers to Health Log
          </button>
        </div>`;

      document.getElementById('confirm-save-labs')?.addEventListener('click', async () => {
        const btn = document.getElementById('confirm-save-labs');
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;margin-right:8px;"></div>Saving...';

        try {
          await labResults.log({
            panelType: parsed.panel_type || 'Lab Panel',
            markers: parsed.markers,
            notes: parsed.notes || null,
            labName: parsed.lab_name || null,
            collectedAt: parsed.collected_at || null,
          });

          btn.innerHTML = 'Saved to Health Log!';
          btn.style.background = 'var(--accent-green)';
          showToast(`${markerCount} lab markers saved!`);
          setTimeout(() => renderTabContent(), 1500);
        } catch (err) {
          console.error('[Labs] Save failed:', err);
          btn.disabled = false;
          btn.innerHTML = `Save ${markerCount} Markers to Health Log`;
          showToast('Save failed — check connection.');
        }
      });
    } catch (err) {
      console.error('[Labs] Parse failed:', err);
      statusEl.innerHTML = `
        <div style="padding:var(--space-3);background:var(--accent-coral-dim);border-radius:var(--radius-md);color:var(--accent-coral);font-size:var(--text-sm);">
          ${err.message}
        </div>`;
    }
  }

  setupStravaHandlers();
}

function setupStravaHandlers() {
  document.getElementById('strava-save-connect')?.addEventListener('click', async () => {
    const clientId = document.getElementById('strava-client-id')?.value?.trim();
    const clientSecret = document.getElementById('strava-client-secret')?.value?.trim();
    if (!clientId || !clientSecret) { showToast('Please enter both Client ID and Secret'); return; }
    try {
      const { saveStravaConfig, getAuthorizationUrl } = await import('../utils/strava.js');
      saveStravaConfig({ clientId, clientSecret });
      window.location.href = getAuthorizationUrl();
    } catch (err) { showToast(err.message); }
  });

  document.getElementById('strava-authorize')?.addEventListener('click', async () => {
    try {
      const { getAuthorizationUrl } = await import('../utils/strava.js');
      window.location.href = getAuthorizationUrl();
    } catch (err) { showToast(err.message); }
  });

  document.getElementById('strava-reset')?.addEventListener('click', async () => {
    try {
      const { disconnectStrava, saveStravaConfig } = await import('../utils/strava.js');
      disconnectStrava();
      saveStravaConfig({ clientId: null, clientSecret: null });
      renderTabContent();
      showToast('Strava credentials cleared');
    } catch (err) { showToast(err.message); }
  });

  document.getElementById('strava-sync')?.addEventListener('click', async () => {
    const btn = document.getElementById('strava-sync');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div> Syncing...';
    try {
      const { syncActivities } = await import('../utils/strava.js');
      const activities = await syncActivities();
      showToast(`Synced ${activities.length} activities from Strava`);
      renderTabContent();
    } catch (err) {
      showToast('Sync failed: ' + err.message);
      btn.disabled = false;
    }
  });

  document.getElementById('strava-disconnect')?.addEventListener('click', async () => {
    if (confirm('Disconnect Strava?')) {
      try {
        const { disconnectStrava } = await import('../utils/strava.js');
        disconnectStrava();
        renderTabContent();
        showToast('Strava disconnected');
      } catch (err) { showToast(err.message); }
    }
  });

  document.getElementById('strava-import-all')?.addEventListener('click', async () => {
    try {
      const { importAllActivities } = await import('../utils/strava.js');
      const count = importAllActivities();
      showToast(`Imported ${count} activities`);
      renderTabContent();
    } catch (err) { showToast(err.message); }
  });

  document.querySelectorAll('.strava-import-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const { getStravaConfig, importActivity } = await import('../utils/strava.js');
        const stravaId = parseInt(btn.dataset.stravaId);
        const cfg = getStravaConfig();
        const activity = cfg.activities?.find(a => a.stravaId === stravaId);
        if (activity) { importActivity(activity); showToast(`Imported "${activity.name}"`); renderTabContent(); }
      } catch (err) { showToast(err.message); }
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
    <div class="section-heading"><h3>Current medications</h3><span class="badge badge-teal">${meds.filter(m => m.active !== false).length}</span></div>
    ${loadError ? `<div class="card" role="alert"><p style="color:var(--error);margin:0;">Couldn't load your medication log. ${esc(loadError.message)}</p></div>`
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
    ${loadError ? `<div class="card" role="alert"><p style="color:var(--error);margin:0;">Couldn't load your cycle history. ${esc(loadError.message)}</p></div>`
      : history.length ? history.slice(0, 30).map(h => `<div class="card card-sm" style="display:flex;justify-content:space-between;gap:var(--space-3);">
          <span style="font-size:var(--text-sm);">${esc((h.event_type || '').replace(/_/g, ' '))}${h.symptom ? ' — ' + esc(h.symptom) : ''}${h.flow ? ' (' + esc(h.flow) + ')' : ''}</span>
          <span style="font-size:var(--text-xs);color:var(--text-tertiary);">${esc(h.date || '')}</span>
        </div>`).join('')
      : '<div class="empty-state"><p>No cycle entries yet.</p></div>'}
  </div>`;
}
