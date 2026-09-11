// Dashboard / Home page
import { icons } from '../icons.js';
import { createRingProgress, createLineChart } from '../utils/charts.js';
import { computeHealthScore, getHealthInsights } from '../utils/health-score.js';
import { isOuraConnected, refreshOuraStatus } from '../utils/oura.js';
import { profile, dailyNutrition, meals, bodyScans, sleepLog, exerciseLog, habits, getUserId } from '../lib/db.js';
import { supabase } from '../lib/supabase.js';
import { apiFetch } from '../utils/api.js';
import { esc } from '../utils/esc.js';
import { todayLocalISO } from '../utils/dates.js';

function plainReason(err) {
  const msg = String(err?.message || '');
  if (/not authenticated|jwt|session|sign(ed)? in/i.test(msg)) return 'You need to be signed in to see your dashboard.';
  if (/failed to fetch|networkerror|load failed|network|timeout/i.test(msg)) return 'Check your connection and try again.';
  return 'Something went wrong on our side. Your data is safe — please try again.';
}

export async function renderDashboard() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="dashboard stagger-children">
      <div class="card" style="text-align:center;padding:var(--space-8);" role="status" aria-label="Loading"><div class="spinner"></div></div>
    </div>`;

  try {
    const [profileData, nutritionToday, recentMeals, recentBodyScans, recentSleep, recentExercise, habitsToday, weekly, mealsForStreak, exerciseForStreak, sleepForStreak, targets] = await Promise.all([
      profile.get(),
      dailyNutrition.get(),
      meals.getRecent(5),
      bodyScans.getRecent(5),   // pulse check-ins carry no score; the score domain needs a scored scan
      sleepLog.getRecent(1),
      exerciseLog.getRecent(5),
      habits.getToday?.(),
      getWeeklyScores(),
      meals.getRecent(90),      // streaks need a real window, not the 5 most recent rows
      exerciseLog.getRecent(90),
      sleepLog.getRecent(90),
      fetchTargets(),
      getUserId().then(refreshOuraStatus).catch(() => false),
    ]);

    const nutrition = nutritionToday || {};
    const weeklyScoreRecords = Array.isArray(weekly.records) ? weekly.records : [];
    const weeklyScores = weeklyScoreRecords
      .map((row) => Number(row.score))
      .filter((value) => !Number.isNaN(value));
    const weeklyLabels = weeklyScoreRecords.map((row) => {
      const d = new Date(row.date);
      return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString([], { weekday: 'short' });
    });
    const healthPayload = {
      dailyNutrition: nutrition,
      exerciseLog: recentExercise,
      sleepLog: recentSleep,
      bodyScans: recentBodyScans,
      habits: normalizeHabits(habitsToday),
      weeklyScores,
    };

    const health = computeHealthScore(healthPayload, targets);
    const insights = getHealthInsights(healthPayload, targets);
    const greeting = getGreeting();
    const name = profileData?.name || 'there';
    const latestSleepQuality = recentSleep?.[0]?.quality || null;
    // Targets come from health_profile (set in onboarding/Profile). No target = no fake goal.
    const calorieGoal = Number(targets?.target_calories) || null;
    const proteinGoal = Number(targets?.target_protein) || null;
    const carbsGoal = Number(targets?.target_carbs) || null;
    const fatGoal = Number(targets?.target_fat) || null;
    const streaks = {
      logging: calculateStreak((mealsForStreak || []).map((item) => item.logged_at || item.date || item.created_at)),
      exercise: calculateStreak((exerciseForStreak || []).map((item) => item.date || item.logged_at)),
      sleep: calculateStreak((sleepForStreak || []).map((item) => item.date)),
    };
    const latestBodyScan = recentBodyScans[0] || null;
    const latestSleep = recentSleep[0] || null;
    const activityItems = buildRecentActivity(recentMeals, recentExercise, latestSleep, latestBodyScan, weeklyScores);
    const stepsToday = habitsToday?.steps != null ? Number(habitsToday.steps) : null;

    const quickActions = [
      { route: '/food-scanner', icon: icons.scan, label: 'Scan food' },
      { route: '/body-scanner', icon: icons.body, label: 'Body scan' },
      { route: '/health-input', icon: icons.clipboard, label: 'Log data' },
      { route: '/eastern-medicine', icon: icons.lotus, label: 'Ayurveda' },
      { route: '/analytics', icon: icons.chart, label: 'Analytics' },
      { route: '/hygiene-scanner', icon: icons.shield, label: 'Hygiene scan' },
    ];

    content.innerHTML = `
      <div class="dashboard stagger-children">
        <!-- Header -->
        <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-3);">
          <div>
            <p style="font-size:var(--text-sm);color:var(--text-tertiary);margin-bottom:var(--space-1);">${greeting}</p>
            <h1 style="font-size:var(--text-2xl);">
              <span class="text-gradient">${esc(name)}</span>
            </h1>
          </div>
          <button type="button" data-route="/profile" aria-label="Open your profile" style="cursor:pointer;padding:0;width:42px;height:42px;flex-shrink:0;border-radius:var(--radius-full);background:var(--bg-chip);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);border:1px solid var(--border);">
            ${icons.user}
          </button>
        </div>

        <!-- Wellness Score Ring — only rendered from logged data -->
        ${health.state === 'ok' ? `
        <div class="card card-glow" style="text-align:center;padding:var(--space-6);">
          <div class="health-ring" style="margin:0 auto var(--space-4);" role="img" aria-label="Wellness score ${health.overall} out of 100">
            ${createRingProgress(health.overall, 100, 160, 10)}
            <div class="ring-label">
              <div class="ring-score text-gradient">${health.overall}</div>
              <div class="ring-text">Wellness score</div>
            </div>
          </div>
          <div style="display:flex;justify-content:center;gap:var(--space-4);flex-wrap:wrap;">
            ${renderTrendBadge(health.trend, 'this week')}
            <div class="badge badge-purple"><span>Grade: ${health.grade}</span></div>
          </div>
          <p class="disclaimer mt-3">Based on ${health.domainsLogged.length} logged areas. A wellness reflection, not a medical measure.</p>
        </div>` : `
        <div class="card" style="text-align:center;padding:var(--space-6);">
          <h3 class="mb-2">Your wellness score appears after a little logging</h3>
          <p class="disclaimer">Log at least two areas — for example a meal and a night of sleep — and your score will be computed from your own data. Nothing here is estimated or made up.</p>
          <button type="button" class="btn btn-glass" style="margin-top:var(--space-4);" data-route="/food-scanner">Log your first meal</button>
        </div>`}

        <!-- Quick Stats Row -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);margin-bottom:var(--space-6);">
          <!-- Daily Steps Card — reads today's logged habits (manual or wearable sync) -->
          <button type="button" class="card card-sm step-card" data-route="/health-input" style="margin-bottom:0;width:100%;text-align:left;cursor:pointer;">
            <!-- No step goal exists in the profile, so no progress ring or percent — just today's count. -->
            <span class="step-ring-container" style="display:block;" aria-hidden="true">
              <span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--text-secondary);display:flex;">${icons.steps}</span>
            </span>
            <span class="step-card-info" style="display:block;">
              <span style="display:block;font-size:var(--text-sm);color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">Steps</span>
              <span class="step-card-value" style="display:block;">${stepsToday != null ? stepsToday.toLocaleString() : '<span style="font-size:var(--text-xs);color:var(--text-tertiary);font-weight:400;">Tap to log</span>'}</span>
            </span>
          </button>

          <!-- Sleep / wearable card — shows logged sleep quality; wearable sync lives in Profile -->
          <div class="card card-sm oura-card" style="margin-bottom:0;">
            <div class="oura-hub-header">
              <div class="oura-ring-icon" aria-hidden="true">${icons.moon}</div>
              <div class="oura-sync-status">${isOuraConnected() ? 'Wearable synced' : 'Last night'}</div>
            </div>
            ${latestSleepQuality ? `
              <div class="oura-scores-grid">
                <div class="oura-score-item">
                  <div class="oura-score-value">${esc(latestSleepQuality)}</div>
                  <div class="oura-score-label">Sleep quality</div>
                </div>
              </div>
            ` : `
              <button type="button" class="oura-connect-btn" data-route="/health-input">Log last night's sleep</button>
            `}
          </div>
        </div>

        <!-- Quick Actions Grid -->
        <div class="section-heading">
          <h3>Quick actions</h3>
        </div>
        <div class="grid-3" style="margin-bottom:var(--space-6);">
          ${quickActions.map((a) => `
          <button type="button" class="quick-action" data-route="${a.route}" style="width:100%;">
            <span class="action-icon" style="background:var(--bg-chip);color:var(--text-secondary);" aria-hidden="true">${a.icon}</span>
            <span class="action-label">${a.label}</span>
          </button>`).join('')}
        </div>

        <!-- Daily Nutrition Summary -->
        <div class="section-heading">
          <h3>Today's nutrition</h3>
          <button type="button" class="see-all" data-route="/food-scanner">View all</button>
        </div>
        <div class="card" style="margin-bottom:var(--space-6);">
          <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-4);">
            ${renderMacro('Calories', nutrition.calories, calorieGoal, 'kcal', 'var(--text-primary)')}
            ${renderMacro('Protein', nutrition.protein, proteinGoal, 'g', 'var(--text-primary)')}
            ${renderMacro('Carbs', nutrition.carbs, carbsGoal, 'g', 'var(--text-primary)')}
            ${renderMacro('Fat', nutrition.fat, fatGoal, 'g', 'var(--text-primary)')}
          </div>
          ${calorieGoal ? `
          <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${calorieGoal}" aria-valuenow="${Math.round(nutrition.calories || 0)}" aria-label="Calories today">
            <div class="progress-fill" style="width:${Math.min(100, Math.round(((nutrition.calories || 0) / calorieGoal) * 100))}%"></div>
          </div>
          <p class="mt-2 text-center text-secondary text-sm">
            ${Math.max(0, Math.round(calorieGoal - (nutrition.calories || 0)))} kcal remaining of your ${calorieGoal} target
          </p>` : targets?.error ? `
          <p role="alert" class="mt-2 text-center text-secondary text-sm">
            Couldn't load your targets. <button type="button" class="btn btn-sm" id="dashboard-retry-targets">Try again</button>
          </p>` : `
          <p class="mt-2 text-center text-secondary text-sm">
            <a href="#/profile" style="color:var(--accent);">Set your targets in Profile</a> to see progress toward them.
          </p>`}
        </div>

        <!-- Health Trend -->
        <div class="section-heading">
          <h3>Weekly trend</h3>
          <button type="button" class="see-all" data-route="/analytics">Details</button>
        </div>
        <div class="card" style="margin-bottom:var(--space-6);">
          <div class="flex-between mb-2">
            <span class="text-secondary text-sm">Wellness score</span>
            ${health.state === 'ok' ? renderTrendBadge(health.trend, 'pts', 'font-size:var(--text-xs);') : ''}
          </div>
          ${weekly.error ? `
            <div role="alert" style="height:80px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--space-2);font-size:var(--text-sm);color:var(--text-secondary);text-align:center;">
              Couldn't load your weekly trend.
              <button type="button" class="btn btn-sm" id="dashboard-retry-trend">Try again</button>
            </div>` : weeklyScores.length >= 2 ? `
            ${createLineChart(weeklyScores, 340, 80)}
            <div style="display:flex;justify-content:space-between;margin-top:var(--space-2);" aria-hidden="true">
              ${weeklyLabels.map((d) => `<span class="text-tertiary text-xs">${esc(d)}</span>`).join('')}
            </div>` : `
            <div style="height:80px;display:flex;align-items:center;justify-content:center;font-size:var(--text-sm);color:var(--text-secondary);">Your trend appears after a few days of logging.</div>`}
        </div>

        <!-- Insights -->
        <div class="section-heading">
          <h3>Observations from your logs</h3>
        </div>
        <div style="display:flex;flex-direction:column;gap:var(--space-3);margin-bottom:var(--space-6);">
          ${insights.slice(0, 3).map((insight) => `
            <div class="card card-sm">
              <div class="insight-card">
                <div class="insight-icon" style="background:var(--bg-chip);color:var(--text-secondary);" aria-hidden="true">
                  <span>${icons.sparkle}</span>
                </div>
                <div class="insight-content">
                  <h4>${esc(insight.title)}</h4>
                  <p>${esc(insight.text)}</p>
                </div>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Recent Activity -->
        <div class="section-heading">
          <h3>Recent activity</h3>
        </div>
        <div class="card" style="margin-bottom:var(--space-6);">
          ${activityItems.length > 0 ? activityItems.join('<div class="divider" style="margin:0;"></div>') : '<div class="empty-state" style="padding:var(--space-6);"><p>Nothing logged yet. Your meals, workouts, sleep and scans will show up here.</p></div>'}
        </div>

        <!-- Streaks -->
        <div class="section-heading">
          <h3>Your streaks</h3>
        </div>
        <div class="grid-3" style="margin-bottom:var(--space-8);">
          ${renderStreak(icons.zap, 'Logging', streaks.logging, 'var(--text-primary)')}
          ${renderStreak(icons.activity, 'Exercise', streaks.exercise, 'var(--text-primary)')}
          ${renderStreak(icons.moon, 'Sleep', streaks.sleep, 'var(--text-primary)')}
        </div>
      </div>
    `;

    // main.js only wires the bottom nav; the dashboard's own shortcuts route here.
    content.querySelectorAll('[data-route]').forEach((el) => {
      el.addEventListener('click', () => { location.hash = '#' + el.dataset.route; });
    });
    document.getElementById('dashboard-retry-targets')?.addEventListener('click', () => renderDashboard());
    document.getElementById('dashboard-retry-trend')?.addEventListener('click', () => renderDashboard());
  } catch (error) {
    console.error('[Dashboard] Failed to load dashboard', error);
    content.innerHTML = `
      <div class="dashboard stagger-children">
        <div class="empty-state" role="alert">
          <h3>Couldn't load your dashboard</h3>
          <p>${plainReason(error)}</p>
          <button type="button" class="btn btn-sm" id="dashboard-retry">Try again</button>
        </div>
      </div>`;
    document.getElementById('dashboard-retry')?.addEventListener('click', () => renderDashboard());
  }
}

// Resolves to the health_profile row, null when no targets are set yet, or the
// `{ error: true }` sentinel when the load failed — so the page and health-score
// can tell "no targets set" from "couldn't load".
async function fetchTargets() {
  try {
    const userId = await getUserId();
    const res = await apiFetch(`/api/health-profile?userId=${encodeURIComponent(userId)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    const json = await res.json();
    return json.profile || null;
  } catch (error) {
    console.warn('[Dashboard] targets load failed', error?.message);
    return { error: true };
  }
}

// Resolves to { records, error } — an empty week and a failed query look different.
async function getWeeklyScores() {
  try {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('weekly_scores')
      .select('score,date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(7);

    if (error) {
      console.warn('[Dashboard] weekly_scores query failed', error.message);
      return { records: [], error };
    }
    return { records: (data || []).reverse(), error: null };
  } catch (error) {
    console.warn('[Dashboard] weekly_scores fallback', error.message);
    return { records: [], error };
  }
}

function normalizeHabits(habitRow) {
  if (!habitRow) return null;
  return {
    smoking: habitRow.smoking || false,
    alcohol: habitRow.alcohol || 'none',
    water: habitRow.water_glasses ?? habitRow.water ?? 0,
    stress_level: habitRow.stress_level ?? null,
    mood: habitRow.mood ?? null,
  };
}

function calculateStreak(dateValues) {
  const days = Array.from(new Set((dateValues || []).map(normalizeDateString).filter(Boolean)));
  if (!days.length) return 0;
  let streak = 0;
  let current = todayLocalISO();

  while (days.includes(current)) {
    streak += 1;
    current = addDays(current, -1);
  }

  return streak;
}

function normalizeDateString(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split('T')[0];
}

function addDays(dateString, days) {
  const date = new Date(dateString + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

// Unknown values render as a dash — never as a made-up zero.
const numOr = (value, suffix) => (value != null && value !== '' && Number.isFinite(Number(value))) ? `${Number(value)}${suffix}` : '—';

function buildRecentActivity(recentMeals, recentExercise, latestSleep, latestBodyScan, weeklyScores) {
  const items = [];

  if (recentMeals && recentMeals.length > 0) {
    const meal = recentMeals[0];
    items.push({
      icon: icons.leaf,
      bg: 'var(--bg-chip)',
      title: meal.name || 'Meal logged',
      detail: `${numOr(meal.calories, ' kcal')} • ${formatRelativeTime(meal.logged_at || meal.date || meal.created_at)}`,
      value: meal.protein != null ? `${numOr(meal.protein, 'g')} protein` : '—',
    });
  }

  if (recentExercise && recentExercise.length > 0) {
    const ex = recentExercise[0];
    items.push({
      icon: icons.activity,
      bg: 'var(--bg-chip)',
      title: ex.name || ex.type || 'Exercise logged',
      detail: `${numOr(ex.duration, ' min')} • ${formatRelativeTime(ex.date || ex.logged_at)}`,
      value: numOr(ex.calories, ' kcal'),
    });
  }

  if (latestSleep) {
    items.push({
      icon: icons.moon,
      bg: 'var(--bg-chip)',
      title: 'Sleep logged',
      detail: `${numOr(latestSleep.hours, 'h')}${latestSleep.quality ? ` • ${latestSleep.quality}` : ''} • ${formatRelativeTime(latestSleep.date)}`,
      value: latestSleep.quality || '—',
    });
  }

  if (latestBodyScan) {
    // Pulse check-ins have no score (only a pulse estimate) — never show "Score —".
    const isPulse = latestBodyScan.scan_type === 'heart';
    const scored = latestBodyScan.overall_score != null;
    items.push({
      icon: isPulse ? icons.heart : icons.body,
      bg: 'var(--bg-chip)',
      title: isPulse ? 'Pulse check-in' : 'Body scan',
      detail: `${isPulse ? numOr(latestBodyScan.hr, ' BPM') : scored ? `Score ${numOr(latestBodyScan.overall_score, '')}` : 'No score'} • ${formatRelativeTime(latestBodyScan.scanned_at || latestBodyScan.created_at)}`,
      value: latestBodyScan.risk_tier ? capitalize(latestBodyScan.risk_tier) : '—',
    });
  }

  if (items.length === 0 && weeklyScores.length) {
    items.push({
      icon: icons.trending,
      bg: 'var(--bg-chip)',
      title: 'Weekly score',
      detail: 'From your recent weekly summaries',
      value: `${weeklyScores[weeklyScores.length - 1]} pts`,
    });
  }

  return items.map((a) => `
    <div class="activity-item">
      <div class="activity-icon" style="background:${a.bg};color:var(--text-secondary);" aria-hidden="true">${a.icon}</div>
      <div class="activity-text">
        <div class="title">${esc(a.title)}</div>
        <div class="time">${esc(a.detail)}</div>
      </div>
      <div class="activity-value text-secondary">${esc(a.value)}</div>
    </div>
  `);
}

function formatRelativeTime(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'time unknown';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${Math.max(0, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function capitalize(value) {
  return String(value || '').replace(/(^|\s)(\S)/g, (match, prefix, char) => `${prefix}${char.toUpperCase()}`);
}

function renderMacro(label, value, target, unit, color) {
  const rounded = Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
  const pct = target > 0 ? Math.min(100, Math.round((rounded / target) * 100)) : null;
  return `
    <div class="flex-1 text-center">
      <div style="font-family:var(--font-heading);font-size:var(--text-md);font-weight:var(--weight-bold);color:${color};">${rounded}${unit}</div>
      <div class="text-tertiary text-xs">${label}</div>
      <div class="text-tertiary text-xs">${pct !== null ? `${pct}% of target` : 'no target'}</div>
    </div>`;
}

// Trend is null until two weekly scores exist: say so, never "Up 0".
function renderTrendBadge(trend, suffix, style = '') {
  if (trend == null) return `<span class="badge" style="${style}">No trend yet</span>`;
  const up = trend >= 0;
  return `<span class="badge ${up ? 'badge-green' : 'badge-amber'}" style="${style}">${up ? icons.trending : icons.trendingDown} <span>${up ? 'Up' : 'Down'} ${Math.abs(trend)} ${suffix}</span></span>`;
}

function renderStreak(icon, label, count, color) {
  return `
    <div class="card card-sm text-center">
      <div style="margin-bottom:var(--space-1);color:var(--text-secondary);display:flex;justify-content:center;" aria-hidden="true">${icon}</div>
      <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:var(--weight-bold);color:${color};">${count}</div>
      <div class="text-tertiary text-xs">${label} day${count === 1 ? '' : 's'}</div>
    </div>`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
