// Sleep and Habits tabs.
import { icons } from '../../icons.js';
import { sleepLog, habits } from '../../lib/db.js';
import { esc } from '../../utils/esc.js';
import { loadErrorState } from './index.js';

// ═══════════════════════════════════════
//  Sleep Tab
// ═══════════════════════════════════════

export async function renderSleep() {
  let log = [];
  let loadError = null;
  try { log = await sleepLog.getRecent(7); } catch (e) { loadError = e; }

  const logList = loadError
    ? loadErrorState('your sleep log', loadError, 'sleep-retry')
    : log.length > 0
      ? log.map(s => `<div class="card card-sm">
      <div class="flex-between gap-3">
        <div class="flex items-center gap-3">
          <div class="rounded-md flex items-center justify-center text-secondary" style="width:36px;height:36px;background:var(--bg-chip);" aria-hidden="true">${icons.moon}</div>
          <div>
            <div class="font-semibold text-sm">${s.hours != null ? `${esc(s.hours)}h` : 'Sleep'}${s.quality ? ` — ${esc(s.quality)}` : ''}</div>
            <div class="text-tertiary text-xs">${esc(s.bedtime || '')} ${esc(s.wake_time || s.wake || '')}</div>
          </div>
        </div>
        <div class="text-tertiary text-xs">${esc(s.date || '')}</div>
      </div>
    </div>`).join('')
      : '<div class="empty-state"><p>No sleep logged yet.</p></div>';

  return `<div class="stagger-children flex-col gap-4">
    <div class="card">
      <h2 class="h4 mb-4">Log sleep</h2>
      <form id="sleep-form" class="flex-col gap-3">
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
    <div class="section-heading"><h2 class="text-md font-semibold">Sleep log</h2></div>
    ${logList}
  </div>`;
}

// ═══════════════════════════════════════
//  Habits Tab
// ═══════════════════════════════════════

export async function renderHabits() {
  let h = null;
  let loadError = null;
  try { h = await habits.getToday(); } catch (e) { loadError = e; }

  // A failed load must not render a blank form — saving it would overwrite today's real entry.
  if (loadError) {
    return `<div class="stagger-children flex-col gap-4">
      <div class="card"><h2 class="h4 mb-2">Lifestyle habits</h2>${loadErrorState("today's habits", loadError, 'habits-retry')}</div>
    </div>`;
  }
  h = h || {};

  const levelOptions = (current) => ['none', 'light', 'moderate', 'heavy']
    .map(v => `<option value="${v}" ${current === v ? 'selected' : ''}>${v.charAt(0).toUpperCase() + v.slice(1)}</option>`).join('');

  return `<div class="stagger-children flex-col gap-4">
    <div class="card">
      <h2 class="h4 mb-4">Lifestyle habits</h2>
      <div class="flex-col gap-4">
        <div class="flex-between">
          <div class="flex items-center gap-3"><span class="text-secondary flex" aria-hidden="true">${icons.wind}</span><span id="smoking-label" class="text-sm">Smoked today</span></div>
          <button type="button" role="switch" aria-checked="${h.smoking ? 'true' : 'false'}" aria-labelledby="smoking-label" class="toggle ${h.smoking ? 'active' : ''} p-0" id="toggle-smoking"></button>
        </div>
        <div class="divider m-0"></div>
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
