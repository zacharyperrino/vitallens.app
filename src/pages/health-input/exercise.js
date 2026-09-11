// Exercise tab: resistance / cardio forms, the exercise log, and the Strava section.
import { icons } from '../../icons.js';
import { exerciseLog } from '../../lib/db.js';
import { showToast } from '../../utils/toast.js';
import { esc } from '../../utils/esc.js';
import { loadErrorState, plainReason, renderTabContent } from './index.js';

// ═══════════════════════════════════════
//  Exercise Tab + Strava
// ═══════════════════════════════════════

export async function renderExercise() {
  let log = [];
  let loadError = null;
  try { log = await exerciseLog.getRecent(8); } catch (e) { loadError = e; }

  const stravaSection = await renderStravaSection();

  const logList = loadError
    ? loadErrorState('your exercise log', loadError, 'exercise-retry')
    : log.length > 0
      ? log.map(renderExerciseCard).join('')
      : '<div class="empty-state"><p>No exercise logged yet.</p></div>';

  return `<div class="stagger-children flex-col gap-4">
    ${stravaSection}
    <div class="card">
      <h4 class="mb-4">Log resistance training</h4>
      <form id="resistance-form" class="flex-col gap-3">
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
            <input class="input-field flex-1" type="range" min="1" max="10" id="res-rpe" value="5">
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
      <h4 class="mb-4">Log cardio</h4>
      <form id="cardio-form" class="flex-col gap-3">
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
    <div class="flex-between gap-3">
      <div style="display:flex;align-items:center;gap:var(--space-3);">
        <div style="width:36px;height:36px;border-radius:var(--radius-md);background:${isStrava ? 'var(--viz-amber-dim)' : 'var(--accent-dim)'};display:flex;align-items:center;justify-content:center;" aria-hidden="true">
          <span style="color:${isStrava ? 'var(--viz-amber)' : 'var(--text-secondary)'};width:20px;height:20px;">${isStrava ? icons.strava : icons.activity}</span>
        </div>
        <div>
          <div class="font-semibold text-sm">${esc(e.name || e.type || 'Workout')}${isStrava ? ' <span class="badge text-xs">Strava</span>' : ''}</div>
          <div class="text-tertiary text-xs">${details || 'No details logged'}</div>
        </div>
      </div>
      <span style="font-weight:var(--weight-semibold);color:var(--text-secondary);white-space:nowrap;">${e.calories != null ? `${esc(e.calories)} kcal` : '—'}</span>
    </div>
  </div>`;
}

// ═══════════════════════════════════════
//  Strava Section
// ═══════════════════════════════════════

async function renderStravaSection() {
  try {
    const { getStravaConfig, isStravaConnected, isStravaConfigured } = await import('../../utils/strava.js');
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
      <div class="flex-col gap-3">
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
      <h4 class="mb-3">Strava is ready to authorize</h4>
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
      <div class="flex-between gap-3 mb-4">
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
        <button type="button" class="btn btn-secondary flex-1" id="strava-disconnect" aria-label="Disconnect Strava">${icons.unlink}</button>
      </div>
      ${unimported.length > 0 ? `
        <div class="flex-between">
          <span class="text-tertiary text-xs">${unimported.length} ready to import</span>
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
      return `<div class="card card-sm mb-2">
        <div class="flex-between gap-2">
          <div style="display:flex;align-items:center;gap:var(--space-3);flex:1;min-width:0;">
            <div style="width:36px;height:36px;border-radius:var(--radius-md);background:var(--viz-amber-dim);display:flex;align-items:center;justify-content:center;flex-shrink:0;" aria-hidden="true">
              ${icons.activity}
            </div>
            <div style="min-width:0;">
              <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(a.name)}</div>
              <div class="text-tertiary text-xs">
                ${esc(dateStr)} • ${esc(a.duration)} min${a.distanceKm ? ' • ' + esc(a.distanceKm) + ' km' : ''}
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:var(--space-2);flex-shrink:0;">
            <span class="font-semibold text-secondary text-sm">${a.calories != null ? esc(a.calories) + ' kcal' : '—'}</span>
            ${a.imported
          ? '<span class="badge badge-green text-xs">Imported</span>'
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

export function setupStravaHandlers() {
  document.getElementById('strava-save-connect')?.addEventListener('click', async () => {
    const clientId = document.getElementById('strava-client-id')?.value?.trim();
    const clientSecret = document.getElementById('strava-client-secret')?.value?.trim();
    if (!clientId || !clientSecret) { showToast('Enter both the Client ID and Client Secret'); return; }
    try {
      const { saveStravaConfig, getAuthorizationUrl } = await import('../../utils/strava.js');
      saveStravaConfig({ clientId, clientSecret });
      window.location.href = getAuthorizationUrl();
    } catch (err) { console.error('[Strava] connect failed:', err); showToast("Couldn't start the Strava connection. Please try again."); }
  });

  document.getElementById('strava-authorize')?.addEventListener('click', async () => {
    try {
      const { getAuthorizationUrl } = await import('../../utils/strava.js');
      window.location.href = getAuthorizationUrl();
    } catch (err) { console.error('[Strava] authorize failed:', err); showToast("Couldn't open Strava authorization. Please try again."); }
  });

  document.getElementById('strava-reset')?.addEventListener('click', async () => {
    try {
      const { disconnectStrava, saveStravaConfig } = await import('../../utils/strava.js');
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
      const { syncActivities } = await import('../../utils/strava.js');
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
        const { disconnectStrava } = await import('../../utils/strava.js');
        disconnectStrava();
        renderTabContent();
        showToast('Strava disconnected');
      } catch (err) { console.error('[Strava] disconnect failed:', err); showToast("Couldn't disconnect Strava."); }
    }
  });

  document.getElementById('strava-import-all')?.addEventListener('click', async () => {
    try {
      const { importAllActivities } = await import('../../utils/strava.js');
      const count = importAllActivities();
      showToast(`Imported ${count} activities`);
      renderTabContent();
    } catch (err) { console.error('[Strava] import failed:', err); showToast("Couldn't import the activities."); }
  });

  document.querySelectorAll('.strava-import-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const { getStravaConfig, importActivity } = await import('../../utils/strava.js');
        const stravaId = parseInt(btn.dataset.stravaId);
        const cfg = getStravaConfig();
        const activity = cfg.activities?.find(a => a.stravaId === stravaId);
        if (activity) { importActivity(activity); showToast(`Imported "${activity.name}"`); renderTabContent(); }
      } catch (err) { console.error('[Strava] import failed:', err); showToast("Couldn't import that activity."); }
    });
  });
}
