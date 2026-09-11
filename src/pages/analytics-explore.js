// Analytics → "Early patterns" and "Explore a correlation" cards.
// Both call gated AI routes (free tier: 5/day each), so nothing runs on page
// load — every request is behind a click. Rendered into the container that
// analytics.js places right after #correlation-section.
import { apiFetch } from '../utils/api.js';
import { esc } from '../utils/esc.js';

// Keys and labels mirror VARIABLE_MAP in server/routes/custom-correlation.js.
const VARIABLES = [
  { key: 'sleep', label: 'Sleep (hours)' },
  { key: 'calories', label: 'Calories' },
  { key: 'exercise', label: 'Exercise (minutes)' },
  { key: 'water', label: 'Water (glasses)' },
  { key: 'skin_score', label: 'Skin/face wellness score' },
  { key: 'caffeine', label: 'Caffeine (0–3 scale)' },
  { key: 'mood', label: 'Mood (1–5 scale)' },
  { key: 'steps', label: 'Steps' },
];
const DAY_OPTIONS = [30, 60, 90, 180];
const LIMIT_COPY = 'Daily limit reached — 5 a day on the free plan';
const CONFIDENCE_WORD = { low: 'Low', moderate: 'Moderate', high: 'High' };

const labelOf = (key) => VARIABLES.find(v => v.key === key)?.label || key;

function plainReason(err) {
  const msg = String(err?.message || '');
  if (/not authenticated|jwt|session|sign(ed)? in/i.test(msg)) return 'You need to be signed in to see this.';
  if (/failed to fetch|networkerror|load failed|network|timeout|abort/i.test(msg)) return 'Check your connection and try again.';
  return 'Something went wrong on our side. Your data is safe — please try again.';
}

const loading = (text) => `<div class="text-center"><div class="spinner" style="margin:0 auto;"></div><p class="mt-2 text-tertiary text-xs">${text}</p></div>`;
const limitState = () => `<div class="empty-state"><p>${LIMIT_COPY}.</p></div>`;
const errorState = (title, err, retryAttr) => `<div class="empty-state" role="alert"><h3>${title}</h3><p>${plainReason(err)}</p><button type="button" class="btn btn-sm" ${retryAttr}>Try again</button></div>`;

const variableOptions = () => `<option value="" disabled selected>Select…</option>${VARIABLES.map(v => `<option value="${v.key}">${esc(v.label)}</option>`).join('')}`;

export function renderExploreCards(container, userId) {
  if (!container) return;
  container.innerHTML = `
    <div class="section-heading mt-4"><h2 class="text-md font-semibold">Early patterns</h2></div>
    <p class="disclaimer mb-3">Looks across your last 7 days of meals, sleep and exercise for a first pattern. Low confidence by design — it takes weeks of logging to say more.</p>
    <div class="card mb-5">
      <button type="button" id="early-patterns-btn" class="btn btn-primary text-xs">Look for a pattern</button>
      <div id="early-patterns-result" class="mt-3" role="status" aria-live="polite"></div>
    </div>

    <div class="section-heading"><h2 class="text-md font-semibold">Explore a correlation</h2></div>
    <p class="disclaimer mb-3">Pick two things you log and a window. An AI model describes how they moved together — or didn't — on the days you logged both.</p>
    <div class="card mb-5">
      <div class="flex-col gap-3">
        <div class="grid-2 gap-3">
          <div class="input-group"><label for="explore-var-a">First variable</label>
            <select class="input-field" id="explore-var-a">${variableOptions()}</select>
          </div>
          <div class="input-group"><label for="explore-var-b">Second variable</label>
            <select class="input-field" id="explore-var-b">${variableOptions()}</select>
          </div>
        </div>
        <div class="input-group"><label for="explore-days">Window</label>
          <select class="input-field" id="explore-days">
            ${DAY_OPTIONS.map(d => `<option value="${d}" ${d === 30 ? 'selected' : ''}>Last ${d} days</option>`).join('')}
          </select>
        </div>
        <div id="explore-form-error" class="text-xs text-error" role="alert" hidden></div>
        <button type="button" id="explore-compare-btn" class="btn btn-primary text-xs">Compare</button>
      </div>
      <div id="explore-result" class="mt-3" role="status" aria-live="polite"></div>
    </div>`;

  container.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'early-patterns-btn' || t.hasAttribute('data-early-retry')) runEarlyPatterns(userId);
    if (t.id === 'explore-compare-btn' || t.hasAttribute('data-explore-retry')) runCorrelation(userId);
  });
  container.addEventListener('change', () => { const el = document.getElementById('explore-form-error'); if (el) el.hidden = true; });
}

// GET /api/early-patterns → { ready:false, message } | { ready:true, insight, confidence:'low', dataPoints }
// 429 { error, upgradeRequired:true } when the daily allowance is used up.
async function runEarlyPatterns(userId) {
  const btn = document.getElementById('early-patterns-btn');
  const out = document.getElementById('early-patterns-result');
  if (!out) return;
  if (btn) btn.disabled = true;
  out.innerHTML = loading('Looking across your last 7 days…');
  try {
    const res = await apiFetch(`/api/early-patterns?userId=${encodeURIComponent(userId)}`);
    if (res.status === 429) { out.innerHTML = limitState(); return; }
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    const data = await res.json();
    if (!data.ready) {
      out.innerHTML = `<div class="empty-state"><p>${esc(data.message || 'Keep logging — patterns appear after 3 days')}</p></div>`;
      return;
    }
    const days = Number.isFinite(Number(data.dataPoints)) ? `Based on ${esc(data.dataPoints)} days with entries.` : '';
    out.innerHTML = `
      <div class="flex-between gap-2 mb-2">
        <span class="badge badge-amber">Low confidence</span>
        <span class="text-tertiary text-xs">${days}</span>
      </div>
      <div class="text-sm">${esc(data.insight)}</div>
      <p class="disclaimer mt-2" style="font-style:italic;">An early observation from a few days of logs — not medical advice.</p>`;
  } catch (err) {
    console.error('[Analytics] early patterns failed', err);
    out.innerHTML = errorState("Couldn't look for a pattern", err, 'data-early-retry');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// POST /api/custom-correlation { userId, variableA, variableB, days } →
// { relationship, dataPoints, confidence:'low'|'moderate'|'high' }; dataPoints < 2
// comes back with an explanatory `relationship` and confidence 'low'.
// 400 { error } for a missing/unknown variable, 429 { error, upgradeRequired:true }.
async function runCorrelation(userId) {
  const btn = document.getElementById('explore-compare-btn');
  const out = document.getElementById('explore-result');
  const formError = document.getElementById('explore-form-error');
  const variableA = document.getElementById('explore-var-a')?.value || '';
  const variableB = document.getElementById('explore-var-b')?.value || '';
  const days = Number(document.getElementById('explore-days')?.value) || 30;
  if (!out) return;

  const problem = !variableA || !variableB ? 'Pick two variables to compare.'
    : variableA === variableB ? 'Pick two different variables — comparing one with itself says nothing.' : '';
  if (problem) {
    if (formError) { formError.textContent = problem; formError.hidden = false; }
    return;
  }

  if (btn) btn.disabled = true;
  out.innerHTML = loading('Comparing the days you logged both…');
  const pair = `<div class="text-sm font-semibold">${esc(labelOf(variableA))} <span class="text-tertiary" aria-hidden="true">×</span><span class="visually-hidden">and</span> ${esc(labelOf(variableB))}</div>`;
  try {
    const res = await apiFetch('/api/custom-correlation', { method: 'POST', body: JSON.stringify({ userId, variableA, variableB, days }) });
    if (res.status === 429) { out.innerHTML = limitState(); return; }
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    const data = await res.json();
    const points = Number(data.dataPoints);
    const paired = Number.isFinite(points) ? `${points} paired day${points === 1 ? '' : 's'}` : 'paired days unknown';
    const meta = `<div class="text-tertiary text-xs mb-2">Last ${days} days · ${paired}</div>`;

    if (!Number.isFinite(points) || points < 2) {
      out.innerHTML = `${pair}${meta}
        <div class="empty-state">
          <h3>Not enough overlapping days yet</h3>
          <p>${esc(data.relationship || 'Log both of these on the same days, then try again.')}</p>
        </div>`;
      return;
    }
    const conf = CONFIDENCE_WORD[data.confidence];
    out.innerHTML = `${pair}${meta}
      ${conf ? `<span class="badge badge-amber mb-2">${conf} confidence</span>` : ''}
      <div class="text-sm">${esc(data.relationship)}</div>
      <p class="disclaimer mt-2" style="font-style:italic;">Pattern observations only — not medical advice.</p>`;
  } catch (err) {
    console.error('[Analytics] custom correlation failed', err);
    out.innerHTML = errorState("Couldn't compare those", err, 'data-explore-retry');
  } finally {
    if (btn) btn.disabled = false;
  }
}
