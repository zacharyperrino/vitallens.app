// Dashboard / Home page
import { icons } from '../icons.js';
import { createRingProgress, createLineChart } from '../utils/charts.js';
import { computeHealthScore, getHealthInsights } from '../utils/health-score.js';
import { isOuraConnected } from '../utils/oura.js';
import { profile, dailyNutrition, meals, bodyScans, sleepLog, exerciseLog, habits, getUserId } from '../lib/db.js';
import { supabase } from '../lib/supabase.js';

export async function renderDashboard() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="dashboard stagger-children">
      <div class="card" style="text-align:center;padding:var(--space-8);"><div class="spinner"></div></div>
    </div>`;

  try {
    const [profileData, nutrition, recentMeals, recentBodyScans, recentSleep, recentExercise, habitsToday, weeklyScoreRecords] = await Promise.all([
      profile.get(),
      dailyNutrition.get(),
      meals.getRecent(5),
      bodyScans.getRecent(1),
      sleepLog.getRecent(1),
      exerciseLog.getRecent(5),
      habits.getToday?.(),
      getWeeklyScores(),
    ]);

    const weeklyScores = Array.isArray(weeklyScoreRecords)
      ? weeklyScoreRecords.map((row) => Number(row.score)).filter((value) => !Number.isNaN(value))
      : [];

    const healthPayload = {
      dailyNutrition: nutrition,
      exerciseLog: recentExercise,
      sleepLog: recentSleep,
      bodyScans: recentBodyScans,
      habits: normalizeHabits(habitsToday),
      weeklyScores,
    };

    const health = computeHealthScore(healthPayload);
    const insights = getHealthInsights(healthPayload);
    const greeting = getGreeting();
    const name = profileData?.name || 'Explorer';
    const latestReadiness = isOuraConnected() ? '--' : '--';
    const latestSleepScore = recentSleep?.[0]?.quality || '--';
    const calorieGoal = profileData?.calorieTarget || 2200;
    const proteinGoal = profileData?.proteinTarget || 120;
    const carbsGoal = profileData?.carbsTarget || 250;
    const fatGoal = profileData?.fatTarget || 75;
    const streaks = {
      logging: calculateStreak(recentMeals.map((item) => item.logged_at || item.date || item.created_at)),
      exercise: calculateStreak(recentExercise.map((item) => item.date)),
      sleep: calculateStreak(recentSleep.map((item) => item.date)),
    };
    const latestBodyScan = recentBodyScans[0] || null;
    const latestSleep = recentSleep[0] || null;
    const activityItems = buildRecentActivity(recentMeals, recentExercise, latestSleep, latestBodyScan, weeklyScores);

    content.innerHTML = `
      <div class="dashboard stagger-children">
        <!-- Header -->
        <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <p style="font-size:var(--text-sm);color:var(--text-tertiary);margin-bottom:var(--space-1);">${greeting}</p>
            <h1 style="font-size:var(--text-2xl);">
              <span class="text-gradient">${name}</span>
            </h1>
          </div>
          <div onclick="location.hash='#/profile'" style="cursor:pointer;width:42px;height:42px;border-radius:var(--radius-full);background:var(--bg-glass-heavy);display:flex;align-items:center;justify-content:center;font-size:20px;border:1px solid var(--border-subtle);">
            ${profileData?.avatar || '🧬'}
          </div>
        </div>

        <!-- Health Score Ring -->
        <div class="card card-glow" style="text-align:center;padding:var(--space-6);">
          <div class="health-ring" style="margin:0 auto var(--space-4);">
            ${createRingProgress(health.overall, 100, 160, 10)}
            <div class="ring-label">
              <div class="ring-score text-gradient">${health.overall}</div>
              <div class="ring-text">Health Score</div>
            </div>
          </div>
          <div style="display:flex;justify-content:center;gap:var(--space-4);flex-wrap:wrap;">
            <div class="badge ${health.trend >= 0 ? 'badge-green' : 'badge-coral'}">
              ${health.trend >= 0 ? icons.trending : icons.trendingDown}
              <span>${health.trend >= 0 ? '+' : ''}${health.trend} this week</span>
            </div>
            <div class="badge badge-purple">
              <span>Grade: ${health.grade}</span>
            </div>
          </div>
        </div>

        <!-- Quick Stats Row -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);margin-bottom:var(--space-6);">
          <!-- Daily Steps Card -->
          <div class="card card-sm step-card" onclick="location.hash='#/step-details'" style="margin-bottom:0;">
            <div class="step-ring-container">
              ${createRingProgress(0, 10000, 60, 6, 'var(--accent-teal)')}
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:18px;">${icons.steps}</div>
            </div>
            <div class="step-card-info">
              <h4>Steps</h4>
              <div class="step-card-value">0</div>
            </div>
          </div>

          <!-- Oura Hub Card -->
          <div class="card card-sm oura-card" style="margin-bottom:0;" onclick="location.hash='#/profile'">
            <div class="oura-hub-header">
              <div class="oura-ring-icon">${icons.ring}</div>
              <div class="oura-sync-status">${isOuraConnected() ? 'Synced' : 'Off'}</div>
            </div>
            ${isOuraConnected() ? `
              <div class="oura-scores-grid">
                <div class="oura-score-item">
                  <div class="oura-score-value">${latestReadiness}</div>
                  <div class="oura-score-label">Readiness</div>
                </div>
                <div class="oura-score-item">
                  <div class="oura-score-value">${latestSleepScore}</div>
                  <div class="oura-score-label">Sleep</div>
                </div>
              </div>
            ` : `
              <button class="oura-connect-btn">Connect Oura</button>
            `}
          </div>
        </div>

        <!-- Quick Actions Grid -->
        <div class="section-heading">
          <h3>Quick Actions</h3>
        </div>
        <div class="grid-3" style="margin-bottom:var(--space-6);">
          <div class="quick-action" onclick="location.hash='#/food-scanner'">
            <div class="action-icon" style="background:var(--accent-teal-dim);">🍎</div>
            <span class="action-label">Scan Food</span>
          </div>
          <div class="quick-action" onclick="location.hash='#/body-scanner'">
            <div class="action-icon" style="background:var(--accent-purple-dim);">🔬</div>
            <span class="action-label">Body Scan</span>
          </div>
          <div class="quick-action" onclick="location.hash='#/stool-scanner'">
            <div class="action-icon" style="background:var(--accent-amber-dim);">🧪</div>
            <span class="action-label">Stool Check</span>
          </div>
          <div class="quick-action" onclick="location.hash='#/health-input'">
            <div class="action-icon" style="background:var(--accent-blue-dim);">📋</div>
            <span class="action-label">Log Data</span>
          </div>
          <div class="quick-action" onclick="location.hash='#/eastern-medicine'">
            <div class="action-icon" style="background:var(--accent-coral-dim);">🧘</div>
            <span class="action-label">Ayurveda</span>
          </div>
          <div class="quick-action" onclick="location.hash='#/analytics'">
            <div class="action-icon" style="background:var(--accent-green-dim);">📊</div>
            <span class="action-label">Analytics</span>
          </div>
          <div class="quick-action" onclick="location.hash='#/hygiene-scanner'">
  <div class="action-icon" style="background:var(--accent-teal-dim);">🧴</div>
  <span class="action-label">Hygiene Scan</span>
</div>
        </div>

        <!-- Daily Nutrition Summary -->
        <div class="section-heading">
          <h3>Today's Nutrition</h3>
          <span class="see-all" onclick="location.hash='#/food-scanner'">View All</span>
        </div>
        <div class="card" style="margin-bottom:var(--space-6);">
          <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-4);">
            ${renderMacro('Calories', nutrition.calories, calorieGoal, 'kcal', 'var(--accent-teal)')}
            ${renderMacro('Protein', nutrition.protein, proteinGoal, 'g', 'var(--accent-blue)')}
            ${renderMacro('Carbs', nutrition.carbs, carbsGoal, 'g', 'var(--accent-amber)')}
            ${renderMacro('Fat', nutrition.fat, fatGoal, 'g', 'var(--accent-coral)')}
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${Math.min(100, Math.round((nutrition.calories / calorieGoal) * 100))}%"></div>
          </div>
          <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-2);text-align:center;">
            ${Math.max(0, calorieGoal - nutrition.calories)} kcal remaining today
          </p>
        </div>

        <!-- Health Trend -->
        <div class="section-heading">
          <h3>Weekly Trend</h3>
          <span class="see-all" onclick="location.hash='#/analytics'">Details</span>
        </div>
        <div class="card" style="margin-bottom:var(--space-6);">
          <div style="margin-bottom:var(--space-2);display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:var(--text-sm);color:var(--text-secondary);">Health Score</span>
            <span class="badge badge-green" style="font-size:var(--text-xs);">
              ${icons.trending} ${health.trend >= 0 ? '+' : ''}${health.trend} pts
            </span>
          </div>
          ${createLineChart(weeklyScores.length ? weeklyScores : [72, 74, 71, 76, 78, 75, 78], 340, 80)}
          <div style="display:flex;justify-content:space-between;margin-top:var(--space-2);">
            ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<span style="font-size:var(--text-xs);color:var(--text-tertiary);">${d}</span>`).join('')}
          </div>
        </div>

        <!-- Insights -->
        <div class="section-heading">
          <h3>Insights & Tips</h3>
        </div>
        <div style="display:flex;flex-direction:column;gap:var(--space-3);margin-bottom:var(--space-6);">
          ${insights.slice(0, 3).map((insight) => `
            <div class="card card-sm">
              <div class="insight-card">
                <div class="insight-icon" style="background:${insight.color}22;">
                  <span>${insight.icon}</span>
                </div>
                <div class="insight-content">
                  <h4>${insight.title}</h4>
                  <p>${insight.text}</p>
                </div>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Recent Activity -->
        <div class="section-heading">
          <h3>Recent Activity</h3>
        </div>
        <div class="card" style="margin-bottom:var(--space-6);">
          ${activityItems.length > 0 ? activityItems.join('<div class="divider" style="margin:0;"></div>') : '<div style="padding:var(--space-6);text-align:center;color:var(--text-secondary);">No recent activity available.</div>'}
        </div>

        <!-- Streaks -->
        <div class="section-heading">
          <h3>Your Streaks</h3>
        </div>
        <div class="grid-3" style="margin-bottom:var(--space-8);">
          ${renderStreak('🔥', 'Logging', streaks.logging, 'var(--accent-coral)')}
          ${renderStreak('💪', 'Exercise', streaks.exercise, 'var(--accent-blue)')}
          ${renderStreak('😴', 'Sleep', streaks.sleep, 'var(--accent-purple)')}
        </div>
      </div>
    `;
  } catch (error) {
    console.error('[Dashboard] Failed to load dashboard', error);
    content.innerHTML = `
      <div class="dashboard stagger-children">
        <div class="card" style="text-align:center;padding:var(--space-8);">
          <h3>Unable to load dashboard</h3>
          <p style="font-size:var(--text-sm);color:var(--text-secondary);">${error.message || 'Please refresh the page.'}</p>
        </div>
      </div>`;
  }
}

async function getWeeklyScores() {
  try {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('weekly_scores')
      .select('score,date')
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .limit(7);

    if (error) {
      console.warn('[Dashboard] weekly_scores query failed', error.message);
      return [];
    }
    return data || [];
  } catch (error) {
    console.warn('[Dashboard] weekly_scores fallback', error.message);
    return [];
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
  let current = getTodayString();

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

function getTodayString() {
  return new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

function buildRecentActivity(recentMeals, recentExercise, latestSleep, latestBodyScan, weeklyScores) {
  const items = [];

  if (recentMeals && recentMeals.length > 0) {
    const meal = recentMeals[0];
    items.push({
      icon: '🍎',
      bg: 'var(--accent-teal-dim)',
      title: meal.name || 'Meal logged',
      detail: `${meal.calories || 0} kcal • ${formatRelativeTime(meal.logged_at || meal.date || meal.created_at)}`,
      value: `${meal.protein || 0}g protein`, 
    });
  }

  if (recentExercise && recentExercise.length > 0) {
    const ex = recentExercise[0];
    items.push({
      icon: '🏃',
      bg: 'var(--accent-blue-dim)',
      title: ex.name || ex.type || 'Exercise logged',
      detail: `${ex.duration || 0} min • ${formatRelativeTime(ex.date || ex.logged_at)}`,
      value: `${ex.calories || 0} kcal`, 
    });
  }

  if (latestSleep) {
    items.push({
      icon: '😴',
      bg: 'var(--accent-purple-dim)',
      title: 'Sleep Tracked',
      detail: `${latestSleep.hours || 0}h • ${latestSleep.quality || 'Quality'} • ${formatRelativeTime(latestSleep.date)}`,
      value: `${latestSleep.quality || '--'}%`, 
    });
  }

  if (latestBodyScan) {
    items.push({
      icon: '🔬',
      bg: 'var(--accent-amber-dim)',
      title: 'Body Scan',
      detail: `Score ${latestBodyScan.overall_score || '--'} • ${formatRelativeTime(latestBodyScan.scanned_at || latestBodyScan.created_at)}`,
      value: latestBodyScan.risk_tier ? `${capitalize(latestBodyScan.risk_tier)}` : '--',
    });
  }

  if (items.length === 0 && weeklyScores.length) {
    items.push({
      icon: '📈',
      bg: 'var(--accent-green-dim)',
      title: 'Weekly score data',
      detail: 'Tracked from recent health summaries',
      value: `${weeklyScores[weeklyScores.length - 1]} pts`,
    });
  }

  return items.map((a) => `
    <div class="activity-item">
      <div class="activity-icon" style="background:${a.bg};">${a.icon}</div>
      <div class="activity-text">
        <div class="title">${a.title}</div>
        <div class="time">${a.detail}</div>
      </div>
      <div class="activity-value" style="color:var(--accent-teal);">${a.value}</div>
    </div>
  `);
}

function formatRelativeTime(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function capitalize(value) {
  return String(value || '').replace(/(^|\s)(\S)/g, (match, prefix, char) => `${prefix}${char.toUpperCase()}`);
}

function renderMacro(label, value, target, unit, color) {
  const rounded = Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
  const pct = target > 0 ? Math.min(100, Math.round((rounded / target) * 100)) : 0;
  return `
    <div style="text-align:center;flex:1;">
      <div style="font-family:var(--font-heading);font-size:var(--text-md);font-weight:var(--weight-bold);color:${color};">${rounded}${unit}</div>
      <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${label}</div>
      <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${pct}%</div>
    </div>`;
}

function renderStreak(emoji, label, count, color) {
  return `
    <div class="card card-sm" style="text-align:center;">
      <div style="font-size:24px;margin-bottom:var(--space-1);">${emoji}</div>
      <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:var(--weight-bold);color:${color};">${count}</div>
      <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${label} days</div>
    </div>`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return '☀️ Good morning';
  if (h < 17) return '🌤️ Good afternoon';
  return '🌙 Good evening';
}
