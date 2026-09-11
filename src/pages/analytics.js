import { createBarChart, createInteractiveTrendChart } from '../utils/charts.js';
import { mountReact } from '../components/mountReact.js';
import WellnessScoreCard from '../components/WellnessScoreCard.jsx';
import PatternDiscoveryHero from '../components/PatternDiscoveryHero.jsx';
import NutritionTracker from '../components/NutritionTracker.jsx';
import { apiFetch } from '../utils/api.js';
import { esc } from '../utils/esc.js';

// ── Shared helpers ──────────────────────────────────────────────
function plainReason(err) {
  const msg = String(err?.message || '');
  if (/not authenticated|jwt|session|sign(ed)? in/i.test(msg)) return 'You need to be signed in to see this.';
  if (/failed to fetch|networkerror|load failed|network|timeout/i.test(msg)) return 'Check your connection and try again.';
  return 'Something went wrong on our side. Your data is safe — please try again.';
}

// ERROR state for a sub-section. `section` maps to a re-render in reloadSection().
function sectionErrorState(what, err, section) {
  return `<div class="empty-state" role="alert"><h3>Couldn't load ${what}</h3><p>${plainReason(err)}</p><button type="button" class="btn btn-sm" id="${section}-retry" data-retry-section="${section}">Try again</button></div>`;
}

// ERROR state for a block whose retry reloads the whole page.
function pageErrorState(what, err, retryId) {
  return `<div class="empty-state" role="alert"><h3>Couldn't load ${what}</h3><p>${plainReason(err)}</p><button type="button" class="btn btn-sm" id="${retryId}" data-retry-page>Try again</button></div>`;
}

const loadingBlock = (text) => `<div style="text-align:center;padding:var(--space-6);" role="status"><div class="spinner" style="margin:0 auto;"></div><p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-3);">${text}</p></div>`;

const listify = (items) => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

export async function renderAnalytics() {
  const content = document.getElementById('page-content');

  content.innerHTML = `
    <div class="analytics stagger-children">
      <div class="page-header"><h1>Analytics</h1><p>Trends and patterns from your own logs</p></div>
      <div style="display:flex;align-items:center;justify-content:center;padding:var(--space-8);" role="status" aria-label="Loading">
        <div class="spinner"></div>
      </div>
    </div>`;

  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Not authenticated');

    const userId = user.id;
    const uid = encodeURIComponent(userId);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const [mealsRes, biomarkerRes, suppRes, envRes, weeklyRes, profileRes] = await Promise.allSettled([
      supabase.from('meals').select('name, calories, protein, carbs, fat, fiber, logged_at').eq('user_id', userId).gte('logged_at', sevenDaysAgo).order('logged_at', { ascending: true }),
      apiFetch(`/api/biomarker-history?userId=${uid}&limit=20`),
      apiFetch(`/api/supplements?userId=${uid}`),
      apiFetch(`/api/environment/latest?userId=${uid}`),
      supabase.from('daily_nutrition').select('date, calories, protein, carbs, fat, fiber').eq('user_id', userId).gte('date', sevenDaysAgo).order('date', { ascending: true }),
      apiFetch(`/api/health-profile?userId=${uid}`),
    ]);

    // Every source is tracked separately so a failure renders as a failure —
    // never as "0 check-ins" or an empty chart.
    const failed = [];
    const fromQuery = (settled, label) => {
      if (settled.status === 'fulfilled' && !settled.value?.error) return settled.value.data || [];
      console.warn(`[Analytics] ${label} query failed`, settled.reason || settled.value?.error);
      failed.push(label);
      return null;
    };
    const fromApi = async (settled, label) => {
      if (settled.status !== 'fulfilled') { console.warn(`[Analytics] ${label} request failed`, settled.reason); failed.push(label); return null; }
      const res = settled.value;
      if (res.status === 404) return {};
      if (!res.ok) { console.warn(`[Analytics] ${label} responded ${res.status}`); failed.push(label); return null; }
      try { return await res.json(); } catch (err) { console.warn(`[Analytics] ${label} unreadable`, err); failed.push(label); return null; }
    };

    const meals = fromQuery(mealsRes, 'meals');
    const nutrition = fromQuery(weeklyRes, 'nutrition');
    const biomarkerData = await fromApi(biomarkerRes, 'wellness check-ins');
    const suppData = await fromApi(suppRes, 'supplements');
    const envData = await fromApi(envRes, 'environment');
    const profileData = await fromApi(profileRes, 'targets');

    const scans = biomarkerData ? (biomarkerData.scans || []) : null;
    const supplements = suppData ? (suppData.supplements || []) : null;
    const environment = envData ? (envData.environment || null) : null;
    const environmentFailed = !envData;
    const profile = profileData ? (profileData.profile || null) : null;
    const targetsFailed = !profileData;

    if (meals === null && nutrition === null && scans === null) {
      throw new Error('Nothing could be loaded');
    }

    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const last7 = nutrition ? Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 86400000);
      const dateStr = d.toISOString().split('T')[0];
      const dayData = nutrition.find(n => n.date === dateStr);
      return {
        label: dayLabels[d.getDay() === 0 ? 6 : d.getDay() - 1],
        date: dateStr,
        calories: dayData?.calories || 0,
        protein: dayData?.protein || 0,
        fiber: dayData?.fiber || 0,
      };
    }) : null;

    // Targets come only from the user's profile. No target = no made-up target.
    const calTarget = Number(profile?.target_calories) || null;
    const protTarget = Number(profile?.target_protein) || null;
    const calDays = last7 ? last7.filter(d => d.calories > 0) : [];
    const protDays = last7 ? last7.filter(d => d.protein > 0) : [];
    const daysLogged = calDays.length;
    const avgCal = daysLogged ? calDays.reduce((s, d) => s + d.calories, 0) / daysLogged : null;
    const avgProt = protDays.length ? protDays.reduce((s, d) => s + d.protein, 0) / protDays.length : null;
    const logStreak = (() => {
      if (!last7) return 0;
      let streak = 0;
      for (let i = last7.length - 1; i >= 0; i--) {
        if (last7[i].calories > 0) streak++;
        else break;
      }
      return streak;
    })();

    const scanTypes = scans ? [...new Set(scans.map(s => s.scan_type))] : [];
    const latestByType = scanTypes.map(type => {
      const ofType = scans.filter(s => s.scan_type === type);
      const latest = ofType[0];
      const prev = ofType[1];
      return { type, score: latest?.score, date: latest?.scanned_at, delta: prev && latest ? latest.score - prev.score : null };
    });

    const targetNote = (target, unit) => target
      ? `Target: ${target}${unit}/day`
      : targetsFailed
        ? "Couldn't load your target."
        : '<a href="#/profile" style="color:var(--accent);">Set a target in Profile</a> to compare against it.';

    const vsTarget = (avg, target) => {
      if (avg == null) return '<div style="font-size:var(--text-sm);color:var(--text-tertiary);">Nothing logged</div>';
      if (!target) return '<div style="font-size:var(--text-sm);color:var(--text-tertiary);">No target set</div>';
      const pct = Math.round((avg / target) * 100);
      const onTrack = avg >= target * 0.9;
      return `<div style="font-size:var(--text-sm);font-weight:600;color:${onTrack ? 'var(--viz-green)' : 'var(--viz-amber)'};">${pct}% ${onTrack ? '· near target' : '· below target'}</div>`;
    };

    content.innerHTML = `
    <div class="analytics stagger-children">
      <div class="page-header"><h1>Analytics</h1><p>Trends and patterns from your own logs</p></div>

      ${failed.length ? `
      <div class="empty-state" role="alert" style="padding:var(--space-4);margin-bottom:var(--space-4);">
        <h3>Couldn't load your ${esc(listify(failed))}</h3>
        <p>Those sections show a dash below. Everything else is up to date, and your data is safe.</p>
        <button type="button" class="btn btn-sm" id="analytics-retry" data-retry-page>Try again</button>
      </div>` : ''}

      <!-- Pattern Discovery Hero -->
      <div id="pattern-discovery-hero" style="margin-bottom:var(--space-6);">
        <div id="pattern-hero-react"></div>
      </div>

      <!-- Summary Stats -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-2);margin-bottom:var(--space-5);">
        ${renderStatBox(last7 ? `${daysLogged}/7` : null, 'Days logged', 'var(--text-primary)')}
        ${renderStatBox(last7 ? `${logStreak} day${logStreak !== 1 ? 's' : ''}` : null, 'Log streak', 'var(--viz-green)')}
        ${renderStatBox(scans ? scans.length : null, 'Check-ins', 'var(--accent)')}
        ${renderStatBox(supplements ? supplements.length : null, 'Supplements', 'var(--viz-amber)')}
      </div>

      <div id="nutrition-tracker-react" style="margin-bottom:var(--space-4);"></div>

      <!-- 7-Day Calorie Trend -->
      <div class="section-heading"><h3>Calories — last 7 days</h3></div>
      ${last7 ? `
      <div class="card" style="margin-bottom:var(--space-5);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3);gap:var(--space-3);">
          <div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">7-day average (logged days)</div>
            <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:700;color:var(--text-primary);">${avgCal != null ? `${Math.round(avgCal)} kcal` : '—'}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">vs target</div>
            ${vsTarget(avgCal, calTarget)}
          </div>
        </div>
        ${createInteractiveTrendChart(last7.map(d => ({
          label: d.label,
          value: Math.round(d.calories),
        })), 340, 100, 'var(--viz-green)', 'calorie-chart')}
        <div style="display:flex;justify-content:space-between;margin-top:var(--space-1);" aria-hidden="true">
          ${last7.map(d => `<span style="font-size:var(--text-xs);color:var(--text-tertiary);">${d.label}</span>`).join('')}
        </div>
        <p class="disclaimer" style="margin-top:var(--space-2);">${targetNote(calTarget, ' kcal')} Days with no logged meals are shown in grey.</p>
      </div>` : pageErrorState('your calorie trend', null, 'analytics-retry-calories')}

      <!-- 7-Day Protein Trend -->
      <div class="section-heading"><h3>Protein — last 7 days</h3></div>
      ${last7 ? `
      <div class="card" style="margin-bottom:var(--space-5);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3);gap:var(--space-3);">
          <div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">7-day average (logged days)</div>
            <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:700;color:var(--text-primary);">${avgProt != null ? `${Math.round(avgProt)}g` : '—'}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">vs target</div>
            ${vsTarget(avgProt, protTarget)}
          </div>
        </div>
        ${createBarChart(last7.map(d => ({
          label: d.label,
          value: Math.round(d.protein),
          color: d.protein <= 0 ? 'var(--surface-3)' : (!protTarget || d.protein >= protTarget * 0.9) ? 'var(--accent)' : 'var(--viz-amber)',
        })), 340, 100)}
        <div style="display:flex;justify-content:space-between;margin-top:var(--space-1);" aria-hidden="true">
          ${last7.map(d => `<span style="font-size:var(--text-xs);color:var(--text-tertiary);">${d.label}</span>`).join('')}
        </div>
        <p class="disclaimer" style="margin-top:var(--space-2);">${targetNote(protTarget, 'g')}${protTarget ? ' Amber bars are days below 90% of it.' : ''}</p>
      </div>` : pageErrorState('your protein trend', null, 'analytics-retry-protein')}

      <!-- Wellness Check-in Summary -->
      ${scans === null ? `
      <div class="section-heading"><h3>Wellness check-in history</h3></div>
      ${pageErrorState('your wellness check-ins', null, 'analytics-retry-checkins')}` : scans.length > 0 ? `
      <div class="section-heading"><h3>Wellness check-in history</h3></div>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-bottom:var(--space-5);">
        ${latestByType.map(s => {
          const scoreColor = s.score >= 80 ? 'var(--viz-green)' : s.score >= 55 ? 'var(--viz-amber)' : 'var(--error)';
          const deltaStr = s.delta !== null && Number.isFinite(s.delta) ? (s.delta > 0 ? `+${s.delta}` : `${s.delta}`) : null;
          const deltaColor = s.delta > 0 ? 'var(--viz-green)' : s.delta < 0 ? 'var(--error)' : 'var(--text-tertiary)';
          return `
          <div class="card card-sm" style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);">
            <div>
              <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);text-transform:capitalize;">${esc(s.type)} check-in</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${s.date ? esc(new Date(s.date).toLocaleDateString()) : ''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:var(--space-3);">
              ${deltaStr ? `<span style="font-size:var(--text-xs);color:${deltaColor};font-weight:600;">${deltaStr} vs previous</span>` : ''}
              <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:700;color:${scoreColor};">${esc(s.score ?? '—')}</div>
            </div>
          </div>`;
        }).join('')}
      </div>` : ''}

      <!-- Supplement Stack -->
      ${supplements === null ? `
      <div class="section-heading"><h3>Active supplements</h3></div>
      ${pageErrorState('your supplements', null, 'analytics-retry-supplements')}` : supplements.length > 0 ? `
      <div class="section-heading"><h3>Active supplements</h3></div>
      <div class="card" style="margin-bottom:var(--space-5);">
        <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);">
          ${supplements.map(s => `
          <div style="padding:var(--space-2) var(--space-3);background:var(--surface-2);border-radius:var(--radius-md);border:1px solid var(--border);">
            <div style="font-size:var(--text-xs);font-weight:600;">${esc(s.name)}</div>
            ${s.dose ? `<div style="font-size:var(--text-xs);color:var(--text-tertiary);">${esc(s.dose)}${s.frequency ? ` · ${esc(String(s.frequency).replace(/_/g, ' '))}` : ''}</div>` : ''}
          </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Environment -->
      ${environmentFailed ? `
      <div class="section-heading"><h3>Environment</h3></div>
      ${pageErrorState('your environment data', null, 'analytics-retry-environment')}` : environment ? `
      <div class="section-heading"><h3>Environment</h3></div>
      <div class="card" style="margin-bottom:var(--space-5);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);">
          <div>
            <div style="font-size:var(--text-sm);font-weight:600;">${esc(environment.location ? String(environment.location).split(',').slice(0, 2).join(',') : 'Location not recorded')}</div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${(environment.fetched_at || environment.logged_at) ? `Last checked ${esc(new Date(environment.fetched_at || environment.logged_at).toLocaleDateString())}` : ''}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:700;color:${environment.aqi == null ? 'var(--text-tertiary)' : environment.aqi <= 50 ? 'var(--viz-green)' : environment.aqi <= 100 ? 'var(--viz-amber)' : 'var(--error)'};">${environment.aqi != null ? esc(environment.aqi) : '—'}</div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">AQI${environment.aqi_category ? ` · ${esc(environment.aqi_category)}` : ''}</div>
          </div>
        </div>
      </div>` : ''}

      <!-- Trend Patterns -->
      <div class="section-heading" style="margin-top:var(--space-4);"><h3>Where your logs may be heading</h3></div>
      <p class="disclaimer" style="margin-bottom:var(--space-3);">Written by an AI model from your own entries. Observations to consider, not medical advice.</p>
      <div id="predictions-section">
        ${await renderPredictionsSection(userId)}
      </div>

      <!-- Wellness Patterns -->
      <div class="section-heading"><h3>Possible patterns in your logs</h3></div>
      <p class="disclaimer" style="margin-bottom:var(--space-3);">Connections an AI model noticed across your entries. They may be coincidence — treat them as questions, not answers.</p>
      <div id="correlation-section">
        ${await renderCorrelationSection(userId)}
      </div>

      <!-- Weekly Summary -->
      <div class="section-heading" style="margin-top:var(--space-4);"><h3>Your week, summarized</h3></div>
      <p class="disclaimer" style="margin-bottom:var(--space-3);">An AI-written recap of what you logged this week.</p>
      <div id="weekly-score-react"></div>
      <div id="weekly-report-section">${loadingBlock('Loading your weekly summary…')}</div>

      <!-- Data Counts -->
      <div class="section-heading"><h3>Data collected</h3></div>
      <div class="grid-2" style="margin-bottom:var(--space-8);">
        ${renderStatBox(meals ? meals.length : null, 'Meals (7 days)', 'var(--text-primary)')}
        ${renderStatBox(scans ? scans.length : null, 'Wellness check-ins', 'var(--accent)')}
        ${renderStatBox(supplements ? supplements.length : null, 'Supplements', 'var(--viz-green)')}
      </div>
    </div>`;

    mountReact(WellnessScoreCard, 'weekly-score-react', { userId });
    mountReact(PatternDiscoveryHero, 'pattern-hero-react', { userId });
    mountReact(NutritionTracker, 'nutrition-tracker-react', { userId });
    // Rendered from the server on load (previously only reachable from its own button)
    const weeklyEl = document.getElementById('weekly-report-section');
    if (weeklyEl) weeklyEl.innerHTML = await renderWeeklyReportSection(userId);
    setupAnalyticsHandlers(userId);

  } catch (err) {
    console.error('[Analytics]', err);
    content.innerHTML = `<div class="analytics"><div class="page-header"><h1>Analytics</h1></div>${pageErrorState('your analytics', err, 'analytics-retry')}</div>`;
    document.getElementById('analytics-retry')?.addEventListener('click', () => renderAnalytics());
  }
}

// ── Trend patterns (AI predictions) ─────────────────────────────
const TRAJECTORY_STYLE = {
  improving: { color: 'var(--viz-green)', bg: 'var(--viz-green-dim)' },
  declining: { color: 'var(--error)', bg: 'var(--error-dim)' },
  default: { color: 'var(--viz-amber)', bg: 'var(--viz-amber-dim)' },
};

async function renderPredictionsSection(userId) {
  let prediction = null;
  try {
    const res = await apiFetch(`/api/predictions/latest?userId=${encodeURIComponent(userId)}`);
    if (res.status === 404) return renderPredictionsEmpty();
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    ({ prediction } = await res.json());
  } catch (err) {
    console.error('[Analytics] predictions load failed', err);
    return sectionErrorState('your trend patterns', err, 'predictions');
  }
  if (!prediction) return renderPredictionsEmpty();

  const traj = TRAJECTORY_STYLE[prediction.overall_trajectory] || TRAJECTORY_STYLE.default;
  const confColor = c => c === 'high' ? 'var(--viz-green)' : c === 'moderate' ? 'var(--viz-amber)' : 'var(--text-tertiary)';
  const effortColor = e => e === 'low' ? 'var(--viz-green)' : e === 'medium' ? 'var(--viz-amber)' : 'var(--error)';
  const directionColor = d => d === 'improving' ? 'var(--viz-green)' : d === 'declining' ? 'var(--error)' : 'var(--text-secondary)';

  const trends = Array.isArray(prediction.trend_extrapolations) ? prediction.trend_extrapolations : [];
  const interventions = Array.isArray(prediction.intervention_ranking) ? prediction.intervention_ranking : [];

  return `
      <div class="card" style="border-left:3px solid ${traj.color};margin-bottom:var(--space-3);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:var(--space-2);">
          <div style="font-size:var(--text-xs);color:var(--text-tertiary);">Recent direction, from your logs</div>
          <span style="font-size:var(--text-xs);padding:1px 8px;border-radius:20px;background:${traj.bg};color:${traj.color};font-weight:600;text-transform:capitalize;">${esc(prediction.overall_trajectory || 'unclear')}</span>
        </div>
        <div style="font-size:var(--text-xs);color:var(--text-secondary);">${esc(prediction.trajectory_summary || '')}</div>
        ${prediction.data_sufficiency === 'sparse' ? `<div style="font-size:var(--text-xs);color:var(--viz-amber);margin-top:var(--space-2);">Still early — more logging will make this more reliable. ${esc(prediction.minimum_data_needed || '')}</div>` : ''}
      </div>

      ${trends.length > 0 ? `
      <div style="font-size:var(--text-xs);font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:var(--space-2);">If recent trends continue (next 7 days)</div>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-bottom:var(--space-3);">
        ${trends.slice(0, 5).map(t => `
        <div class="card card-sm">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2px;gap:var(--space-2);">
            <div style="font-size:var(--text-xs);font-weight:600;">${esc(t.metric)}</div>
            <span style="font-size:var(--text-xs);color:${confColor(t.confidence)};">${esc(t.confidence || 'limited')} data support</span>
          </div>
          <div style="display:flex;gap:var(--space-3);align-items:center;margin-bottom:4px;flex-wrap:wrap;">
            <span style="font-size:var(--text-xs);color:var(--text-tertiary);">Now: ${esc(t.current_value)}</span>
            <span style="color:var(--text-tertiary);" aria-hidden="true">→</span>
            <span style="font-size:var(--text-xs);font-weight:600;color:${directionColor(t.direction)};">${t.direction ? `${esc(t.direction)} — ` : ''}if this continues: ${esc(t.projected_7d)}</span>
          </div>
          ${t.worth_watching ? `<div style="font-size:var(--text-xs);color:var(--viz-amber);">${esc(t.worth_watching)}</div>` : ''}
          ${t.alert ? `<div style="font-size:var(--text-xs);color:var(--viz-amber);">${esc(t.alert)}</div>` : ''}
          ${t.positive ? `<div style="font-size:var(--text-xs);color:var(--viz-green);">${esc(t.positive)}</div>` : ''}
        </div>`).join('')}
      </div>` : ''}

      ${interventions.length > 0 ? `
      <div style="font-size:var(--text-xs);font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:var(--space-2);">Suggestions based on your logs</div>
      <p class="disclaimer" style="margin-bottom:var(--space-2);">Observations from your own entries — not medical advice.</p>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-bottom:var(--space-3);">
        ${interventions.slice(0, 5).map(iv => `
        <div class="card card-sm">
          <div style="display:flex;gap:var(--space-2);align-items:flex-start;">
            <div style="width:22px;height:22px;border-radius:50%;background:var(--accent);color:var(--text-inverse);display:flex;align-items:center;justify-content:center;font-size:var(--text-xs);font-weight:700;flex-shrink:0;" aria-label="Rank ${esc(iv.rank)}">${esc(iv.rank)}</div>
            <div style="flex:1;">
              <div style="font-size:var(--text-xs);font-weight:600;margin-bottom:2px;">${esc(iv.intervention)}</div>
              <div style="font-size:var(--text-xs);color:var(--viz-green);margin-bottom:2px;">${esc(iv.expected_impact)}</div>
              <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;">
                <span style="font-size:var(--text-xs);color:${effortColor(iv.effort)};">Effort: ${esc(iv.effort)}</span>
                <span style="font-size:var(--text-xs);color:var(--text-tertiary);">${esc(iv.timeframe)}</span>
              </div>
            </div>
          </div>
        </div>`).join('')}
      </div>` : ''}

      <button type="button" id="run-predictions-btn" class="btn" style="width:100%;font-size:var(--text-xs);background:var(--surface-2);border:1px solid var(--border);">
        Re-run trend analysis
      </button>`;
}

function renderPredictionsEmpty() {
  return `
    <div class="empty-state">
      <p>No trend analysis yet. Run one to see where your recent logs may be heading and which habits might matter most.</p>
      <button type="button" id="run-predictions-btn" class="btn btn-primary" style="font-size:var(--text-xs);">Run trend analysis</button>
    </div>`;
}

// ── Wellness patterns (AI correlations) ─────────────────────────
const DIRECTION_STYLE = {
  positive: { color: 'var(--viz-green)', bg: 'var(--viz-green-dim)', word: 'move together' },
  negative: { color: 'var(--error)', bg: 'var(--error-dim)', word: 'move opposite' },
  default: { color: 'var(--viz-neutral)', bg: 'var(--viz-neutral-dim)', word: 'unclear direction' },
};

async function renderCorrelationSection(userId) {
  let correlations = [];
  try {
    const res = await apiFetch(`/api/correlate/latest?userId=${encodeURIComponent(userId)}&limit=8`);
    if (res.status === 404) return renderCorrelationEmpty();
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    const json = await res.json();
    correlations = Array.isArray(json.correlations) ? json.correlations : [];
  } catch (err) {
    console.error('[Analytics] correlations load failed', err);
    return sectionErrorState('your wellness patterns', err, 'correlations');
  }

  const meaningful = correlations.filter(c => c.correlation_type !== 'summary');
  const summary = correlations.find(c => c.correlation_type === 'summary');
  if (meaningful.length === 0) return renderCorrelationEmpty();

  const confidenceLabel = c => c >= 0.8 ? 'Consistent' : c >= 0.5 ? 'Emerging' : 'Early hint';

  // Check age of correlations for persistent pattern escalation
  const oldestCorrelation = meaningful.reduce((oldest, c) => {
    const date = new Date(c.generated_at || 0);
    return date < oldest ? date : oldest;
  }, new Date());
  const daysSinceFirst = Math.floor((Date.now() - oldestCorrelation) / 86400000);
  const showEscalation = daysSinceFirst >= 14;

  return `
      ${summary ? `<div class="card" style="border-left:3px solid var(--viz-green);margin-bottom:var(--space-3);">
        <div style="font-size:var(--text-xs);color:var(--viz-green);font-weight:600;margin-bottom:4px;">The pattern that stood out most</div>
        <div style="font-size:var(--text-sm);">${esc(summary.actionable || summary.description || '')}</div>
      </div>` : ''}
      <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-bottom:var(--space-3);">
        ${meaningful.slice(0, 6).map(c => {
          const dir = DIRECTION_STYLE[c.direction] || DIRECTION_STYLE.default;
          return `
        <div class="card card-sm" style="border-left:3px solid ${dir.color};">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;gap:var(--space-2);">
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${esc(String(c.correlation_type || '').replace(/-/g, ' → '))}</div>
            <span style="font-size:var(--text-xs);padding:1px 6px;border-radius:4px;background:${dir.bg};color:${dir.color};white-space:nowrap;">${confidenceLabel(c.confidence)} · ${dir.word}</span>
          </div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:${c.actionable ? 'var(--space-1)' : '0'};">${esc(c.description || '')}</div>
          ${c.actionable ? `<div style="font-size:var(--text-xs);color:var(--viz-green);">Something to explore: ${esc(c.actionable)}</div>` : ''}
        </div>`;
        }).join('')}
      </div>
      ${showEscalation ? `
      <div class="card" style="border-left:3px solid var(--viz-amber);margin-bottom:var(--space-3);background:var(--viz-amber-dim);">
        <div style="font-size:var(--text-xs);color:var(--viz-amber);font-weight:600;margin-bottom:4px;">Some patterns have been showing up for 14+ days</div>
        <div style="font-size:var(--text-xs);color:var(--text-secondary);">If anything feels persistent or concerning, it may be worth mentioning to a healthcare provider.</div>
      </div>` : ''}
      <p class="disclaimer" style="margin-bottom:var(--space-3);font-style:italic;">Pattern observations only — not medical advice.</p>
      <button type="button" id="run-correlation-btn" class="btn" style="width:100%;font-size:var(--text-xs);background:var(--surface-2);border:1px solid var(--border);">
        Run a new pattern analysis
      </button>`;
}

function renderCorrelationEmpty() {
  return `
    <div class="empty-state">
      <p>No patterns yet. Log meals, sleep and check-ins for a few days, then run an analysis to look for connections across your entries.</p>
      <button type="button" id="run-correlation-btn" class="btn btn-primary" style="font-size:var(--text-xs);">Run pattern analysis</button>
    </div>`;
}

// ── Weekly summary (AI narrative + report) ──────────────────────
async function renderWeeklyReportSection(userId) {
  const uid = encodeURIComponent(userId);
  let narrative = null;
  let reports = null;
  try {
    const [narrativeRes, reportRes] = await Promise.allSettled([
      apiFetch(`/api/weekly-report/narrative?userId=${uid}`),
      apiFetch(`/api/weekly-report/latest?userId=${uid}`),
    ]);

    // The narrative is optional garnish — if it fails we still show the report.
    if (narrativeRes.status === 'fulfilled' && narrativeRes.value.ok) {
      const narrativeData = await narrativeRes.value.json().catch(() => null);
      narrative = narrativeData?.narrative || null;
    }

    if (reportRes.status !== 'fulfilled') throw reportRes.reason || new Error('Request failed');
    const res = reportRes.value;
    if (res.status === 404) return renderReportEmpty();
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    ({ reports } = await res.json());
  } catch (err) {
    console.error('[Analytics] weekly report load failed', err);
    return sectionErrorState('your weekly summary', err, 'weekly');
  }
  if (!reports || reports.length === 0) return renderReportEmpty();

  const r = reports[0];
  const scoreColor = r.week_score >= 80 ? 'var(--viz-green)' : r.week_score >= 60 ? 'var(--viz-amber)' : 'var(--error)';
  const gaps = Array.isArray(r.gaps) ? r.gaps : Array.isArray(r.report_data?.patterns_to_explore) ? r.report_data.patterns_to_explore : [];
  const wins = Array.isArray(r.wins) ? r.wins : [];
  const connection = r.top_correlation || r.report_data?.top_connection;

  const narrativeCard = narrative ? `
    <div class="card" style="margin-bottom:var(--space-3);background:var(--surface-2);border:1px solid var(--border);">
      <div style="font-size:var(--text-xs);font-weight:700;color:var(--viz-green);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:var(--space-2);">Looking back${narrative.weeks_analyzed ? ` · ${esc(narrative.weeks_analyzed)} weeks of logs` : ''}</div>
      <div style="font-size:var(--text-sm);color:var(--text-primary);line-height:1.6;margin-bottom:var(--space-3);">${esc(narrative.story || '')}</div>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);">
        ${narrative.strongest_trend ? `
        <div style="padding:var(--space-2);background:var(--surface-1);border-radius:var(--radius-md);border-left:3px solid var(--viz-green);">
          <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:2px;">Seemed most consistent</div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);">${esc(narrative.strongest_trend)}</div>
        </div>` : ''}
        ${narrative.biggest_shift ? `
        <div style="padding:var(--space-2);background:var(--surface-1);border-radius:var(--radius-md);border-left:3px solid var(--viz-amber);">
          <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:2px;">Biggest change noticed</div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);">${esc(narrative.biggest_shift)}</div>
        </div>` : ''}
        ${narrative.next_chapter ? `
        <div style="padding:var(--space-2);background:var(--viz-green-dim);border-radius:var(--radius-md);">
          <div style="font-size:var(--text-xs);color:var(--viz-green);margin-bottom:2px;">Something to consider next</div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);">${esc(narrative.next_chapter)}</div>
        </div>` : ''}
      </div>
      <p class="disclaimer" style="margin-top:var(--space-2);font-style:italic;">Pattern observations only — not medical advice.</p>
    </div>` : '';

  return `${narrativeCard}
      <div class="card" style="margin-bottom:var(--space-3);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-3);gap:var(--space-3);">
          <div style="flex:1;">
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:2px;">Week of ${esc(r.week_of || '')}</div>
            <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${esc(r.headline || '')}</div>
          </div>
          <div style="text-align:center;margin-left:var(--space-3);">
            <div style="font-family:var(--font-heading);font-size:var(--text-2xl);font-weight:800;color:${scoreColor};">${r.week_score != null ? esc(r.week_score) : '—'}</div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">week score</div>
          </div>
        </div>
        ${wins.length > 0 ? `
        <div style="margin-bottom:var(--space-3);">
          <div style="font-size:var(--text-xs);font-weight:600;color:var(--viz-green);margin-bottom:var(--space-1);">What seemed to go well</div>
          ${wins.map(w => `<div style="font-size:var(--text-xs);color:var(--text-secondary);padding:2px 0;">+ ${esc(w)}</div>`).join('')}
        </div>` : ''}
        ${gaps.length > 0 ? `
        <div style="margin-bottom:var(--space-3);">
          <div style="font-size:var(--text-xs);font-weight:600;color:var(--viz-amber);margin-bottom:var(--space-1);">Patterns you might explore</div>
          ${gaps.map(g => `<div style="font-size:var(--text-xs);color:var(--text-secondary);padding:2px 0;">${esc(g)}</div>`).join('')}
        </div>` : ''}
        ${connection ? `
        <div style="padding:var(--space-2);background:var(--viz-green-dim);border-radius:var(--radius-md);margin-bottom:var(--space-3);">
          <div style="font-size:var(--text-xs);font-weight:600;color:var(--viz-green);margin-bottom:2px;">A possible connection</div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);">${esc(connection)}</div>
        </div>` : ''}
        ${r.focus ? `
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:var(--text-xs);font-weight:600;color:var(--text-secondary);margin-bottom:2px;">A suggested focus</div>
          <div style="font-size:var(--text-xs);color:var(--text-primary);">${esc(r.focus)}</div>
        </div>` : ''}
        <p class="disclaimer" style="margin-top:var(--space-3);font-style:italic;">Pattern observations only — not medical advice.</p>
      </div>
      <button type="button" id="generate-report-btn" class="btn" style="width:100%;font-size:var(--text-xs);background:var(--surface-2);border:1px solid var(--border);">
        Generate a new summary
      </button>`;
}

function renderReportEmpty() {
  return `
    <div class="empty-state">
      <p>No weekly summary yet. Generate one to get a short recap of what you logged this week.</p>
      <button type="button" id="generate-report-btn" class="btn btn-primary" style="font-size:var(--text-xs);">Generate weekly summary</button>
    </div>`;
}

// ── Handlers ────────────────────────────────────────────────────
const SECTIONS = {
  predictions: { el: 'predictions-section', render: renderPredictionsSection, loading: 'Loading your trend patterns…' },
  correlations: { el: 'correlation-section', render: renderCorrelationSection, loading: 'Loading your patterns…' },
  weekly: { el: 'weekly-report-section', render: renderWeeklyReportSection, loading: 'Loading your weekly summary…' },
};

async function reloadSection(key, userId) {
  const spec = SECTIONS[key];
  const section = spec && document.getElementById(spec.el);
  if (!section) return;
  section.innerHTML = loadingBlock(spec.loading);
  section.innerHTML = await spec.render(userId);
  setupAnalyticsHandlers(userId);
}

// Runs a server-side analysis, then re-renders its section. Failure renders a
// retryable error state in place — never a dead end.
async function runAnalysis({ userId, btnId, sectionKey, url, working, failedTitle }) {
  const btn = document.getElementById(btnId);
  const spec = SECTIONS[sectionKey];
  const section = document.getElementById(spec.el);
  if (!btn || !section) return;
  btn.disabled = true;
  btn.textContent = working;
  section.innerHTML = loadingBlock(working);
  try {
    const res = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    section.innerHTML = await spec.render(userId);
  } catch (err) {
    console.error(`[Analytics] ${sectionKey} run failed`, err);
    section.innerHTML = `<div class="empty-state" role="alert"><h3>${failedTitle}</h3><p>${plainReason(err)}</p><button type="button" class="btn btn-sm" id="${btnId}">Try again</button></div>`;
  }
  setupAnalyticsHandlers(userId);
}

function bindOnce(el, handler) {
  if (!el || el.dataset.bound === '1') return;
  el.dataset.bound = '1';
  el.addEventListener('click', handler);
}

function setupAnalyticsHandlers(userId) {
  document.querySelectorAll('[data-retry-page]').forEach(btn => bindOnce(btn, () => renderAnalytics()));
  document.querySelectorAll('[data-retry-section]').forEach(btn => bindOnce(btn, () => reloadSection(btn.dataset.retrySection, userId)));

  bindOnce(document.getElementById('run-predictions-btn'), () => runAnalysis({
    userId, btnId: 'run-predictions-btn', sectionKey: 'predictions',
    url: '/api/predictions/run', working: 'Looking at your trends…', failedTitle: "Couldn't run the trend analysis",
  }));

  bindOnce(document.getElementById('run-correlation-btn'), () => runAnalysis({
    userId, btnId: 'run-correlation-btn', sectionKey: 'correlations',
    url: '/api/correlate/run', working: 'Looking for patterns…', failedTitle: "Couldn't run the pattern analysis",
  }));

  bindOnce(document.getElementById('generate-report-btn'), () => runAnalysis({
    userId, btnId: 'generate-report-btn', sectionKey: 'weekly',
    url: '/api/weekly-report/generate', working: 'Writing your weekly summary…', failedTitle: "Couldn't write the weekly summary",
  }));
}

// value === null means the source failed to load; render a dash, not a zero.
function renderStatBox(value, label, color) {
  const failed = value === null || value === undefined;
  return `
  <div class="card card-sm" style="text-align:center;" ${failed ? 'role="alert"' : ''}>
    <div style="font-family:var(--font-heading);font-size:var(--text-2xl);font-weight:var(--weight-bold);color:${failed ? 'var(--text-tertiary)' : color};" ${failed ? 'aria-label="Not loaded"' : ''}>${failed ? '—' : esc(value)}</div>
    <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${label}${failed ? ' (couldn\'t load)' : ''}</div>
  </div>`;
}
