import { icons } from '../icons.js';
import { createBarChart, createInteractiveTrendChart } from '../utils/charts.js';
import { mountReact } from '../components/mountReact.js';
import WellnessScoreCard from '../components/WellnessScoreCard.jsx';
import PatternDiscoveryHero from '../components/PatternDiscoveryHero.jsx';
import NutritionTracker from '../components/NutritionTracker.jsx';
import { apiFetch } from '../utils/api.js';

export async function renderAnalytics() {
  const content = document.getElementById('page-content');

  content.innerHTML = `
    <div class="analytics stagger-children">
      <div class="page-header"><h1>Analytics</h1><p>Trends, patterns and wellness data</p></div>
      <div style="display:flex;align-items:center;justify-content:center;padding:var(--space-8);">
        <div class="spinner"></div>
      </div>
    </div>`;

  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Not authenticated');

    const userId = user.id;
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const [nutritionRes, mealsRes, biomarkerRes, suppRes, envRes] = await Promise.allSettled([
      apiFetch(`/api/daily-nutrition?userId=${userId}&date=${today}`),
      supabase.from('meals').select('name, calories, protein, carbs, fat, fiber, logged_at').eq('user_id', userId).gte('logged_at', sevenDaysAgo).order('logged_at', { ascending: true }),
      apiFetch(`/api/biomarker-history?userId=${userId}&limit=20`),
      apiFetch(`/api/supplements?userId=${userId}`),
      apiFetch(`/api/environment/latest?userId=${userId}`),
    ]);

    const { data: weeklyNutrition } = await supabase
      .from('daily_nutrition')
      .select('date, calories, protein, carbs, fat, fiber')
      .eq('user_id', userId)
      .gte('date', sevenDaysAgo)
      .order('date', { ascending: true });

    const profileRes = await apiFetch(`/api/health-profile?userId=${userId}`);
    const { profile } = profileRes.ok ? await profileRes.json() : { profile: null };

    const meals = mealsRes.status === 'fulfilled' ? mealsRes.value.data || [] : [];
    const biomarkerData = biomarkerRes.status === 'fulfilled' && biomarkerRes.value.ok ? await biomarkerRes.value.json() : { scans: [] };
    const suppData = suppRes.status === 'fulfilled' && suppRes.value.ok ? await suppRes.value.json() : { supplements: [] };
    const envData = envRes.status === 'fulfilled' && envRes.value.ok ? await envRes.value.json() : { environment: null };

    const scans = biomarkerData.scans || [];
    const supplements = suppData.supplements || [];
    const environment = envData.environment;
    const nutrition = weeklyNutrition || [];

    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const last7 = Array.from({ length: 7 }, (_, i) => {
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
    });

    const calTarget = profile?.target_calories || 2000;
    const protTarget = profile?.target_protein || 120;
    const avgCal = last7.filter(d => d.calories > 0).reduce((s, d) => s + d.calories, 0) / (last7.filter(d => d.calories > 0).length || 1);
    const avgProt = last7.filter(d => d.protein > 0).reduce((s, d) => s + d.protein, 0) / (last7.filter(d => d.protein > 0).length || 1);
    const daysLogged = last7.filter(d => d.calories > 0).length;
    const logStreak = (() => {
      let streak = 0;
      for (let i = last7.length - 1; i >= 0; i--) {
        if (last7[i].calories > 0) streak++;
        else break;
      }
      return streak;
    })();

    const scanTypes = [...new Set(scans.map(s => s.scan_type))];
    const latestByType = scanTypes.map(type => {
      const latest = scans.filter(s => s.scan_type === type)[0];
      const prev = scans.filter(s => s.scan_type === type)[1];
      return { type, score: latest?.score, riskTier: latest?.risk_tier, date: latest?.scanned_at, delta: prev ? latest.score - prev.score : null };
    });

    content.innerHTML = `
    <div class="analytics stagger-children">
      <div class="page-header"><h1>Analytics</h1><p>Trends and patterns from your own logs</p></div>

      
      <!-- Pattern Discovery Hero -->
<div id="pattern-discovery-hero" style="margin-bottom:var(--space-6);">
  <div id="pattern-hero-react"></div>
</div>

      <!-- Summary Stats -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-2);margin-bottom:var(--space-5);">
        ${renderStatBox(daysLogged + '/7', 'Days Logged', 'var(--accent-teal)')}
        ${renderStatBox(logStreak + ' day' + (logStreak !== 1 ? 's' : ''), 'Log Streak', 'var(--accent-green)')}
        ${renderStatBox(scans.length, 'Check-ins', 'var(--accent-blue)')}
        ${renderStatBox(supplements.length, 'Supplements', 'var(--accent-amber)')}
      </div>

<div id="nutrition-tracker-react" style="margin-bottom:var(--space-4);"></div>


      <!-- 7-Day Calorie Trend -->
      <div class="section-heading"><h3>Calorie Intake — 7 Days</h3></div>
      <div class="card" style="margin-bottom:var(--space-5);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3);">
          <div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">7-day average</div>
            <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:700;color:var(--accent-teal);">${Math.round(avgCal)} kcal</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">vs target</div>
            <div style="font-size:var(--text-sm);font-weight:600;color:${avgCal >= calTarget * 0.9 ? 'var(--accent-green)' : 'var(--accent-amber)'};">${Math.round((avgCal / calTarget) * 100)}%</div>
          </div>
        </div>
        ${createInteractiveTrendChart(last7.map(d => ({
    label: d.label,
    value: Math.round(d.calories),
})), 340, 100, 'var(--accent-teal)', 'calorie-chart')}
        <div style="display:flex;justify-content:space-between;margin-top:var(--space-1);">
          ${last7.map(d => `<span style="font-size:10px;color:var(--text-tertiary);">${d.label}</span>`).join('')}
        </div>
        <p style="font-size:10px;color:var(--text-tertiary);margin-top:var(--space-2);">Target: ${calTarget} kcal/day · Grey = no data logged</p>
      </div>

      <!-- 7-Day Protein Trend -->
      <div class="section-heading"><h3>Protein Intake — 7 Days</h3></div>
      <div class="card" style="margin-bottom:var(--space-5);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3);">
          <div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">7-day average</div>
            <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:700;color:var(--accent-blue);">${Math.round(avgProt)}g</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">vs target</div>
            <div style="font-size:var(--text-sm);font-weight:600;color:${avgProt >= protTarget * 0.9 ? 'var(--accent-green)' : 'var(--accent-amber)'};">${Math.round((avgProt / protTarget) * 100)}%</div>
          </div>
        </div>
        ${createBarChart(last7.map(d => ({
          label: d.label,
          value: Math.round(d.protein),
          color: d.protein >= protTarget * 0.9 ? 'var(--accent-blue)' : d.protein > 0 ? 'var(--accent-amber)' : 'var(--surface-3)',
        })), 340, 100)}
        <div style="display:flex;justify-content:space-between;margin-top:var(--space-1);">
          ${last7.map(d => `<span style="font-size:10px;color:var(--text-tertiary);">${d.label}</span>`).join('')}
        </div>
        <p style="font-size:10px;color:var(--text-tertiary);margin-top:var(--space-2);">Target: ${protTarget}g/day</p>
      </div>

      <!-- Wellness Check-in Summary -->
      ${scans.length > 0 ? `
      <div class="section-heading"><h3>Wellness Check-in History</h3></div>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-bottom:var(--space-5);">
        ${latestByType.map(s => {
          const scoreColor = s.score >= 80 ? 'var(--accent-green)' : s.score >= 55 ? 'var(--accent-amber)' : 'var(--accent-coral)';
          const deltaStr = s.delta !== null ? (s.delta > 0 ? `+${s.delta}` : `${s.delta}`) : null;
          const deltaColor = s.delta > 0 ? 'var(--accent-green)' : s.delta < 0 ? 'var(--accent-coral)' : 'var(--text-tertiary)';
          return `
          <div class="card card-sm" style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);text-transform:capitalize;">${s.type} check-in</div>
              <div style="font-size:10px;color:var(--text-tertiary);">${s.date ? new Date(s.date).toLocaleDateString() : ''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:var(--space-3);">
              ${deltaStr ? `<span style="font-size:var(--text-xs);color:${deltaColor};font-weight:600;">${deltaStr} vs prev</span>` : ''}
              <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:700;color:${scoreColor};">${s.score}</div>
            </div>
          </div>`;
        }).join('')}
      </div>` : ''}

      <!-- Supplement Stack -->
      ${supplements.length > 0 ? `
      <div class="section-heading"><h3>Active Supplement Stack</h3></div>
      <div class="card" style="margin-bottom:var(--space-5);">
        <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);">
          ${supplements.map(s => `
          <div style="padding:var(--space-2) var(--space-3);background:var(--surface-2);border-radius:var(--radius-md);border:1px solid var(--border);">
            <div style="font-size:var(--text-xs);font-weight:600;">${s.name}</div>
            ${s.dose ? `<div style="font-size:10px;color:var(--text-tertiary);">${s.dose} · ${(s.frequency || '').replace(/_/g, ' ')}</div>` : ''}
          </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Environment -->
      ${environment ? `
      <div class="section-heading"><h3>Environment</h3></div>
      <div class="card" style="margin-bottom:var(--space-5);">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:var(--text-sm);font-weight:600;">${environment.location?.split(',').slice(0,2).join(',') || 'Unknown'}</div>
            <div style="font-size:10px;color:var(--text-tertiary);">Last checked ${environment.logged_at ? new Date(environment.logged_at).toLocaleDateString() : ''}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:700;color:${(environment.aqi || 0) <= 50 ? 'var(--accent-green)' : (environment.aqi || 0) <= 100 ? 'var(--accent-amber)' : 'var(--accent-coral)'};">${environment.aqi || '—'}</div>
            <div style="font-size:10px;color:var(--text-tertiary);">AQI · ${environment.aqi_category || ''}</div>
          </div>
        </div>
      </div>` : ''}

      <!-- Trend Patterns -->
      <div class="section-heading" style="margin-top:var(--space-4);"><h3>Trend Patterns</h3></div>
      <div id="predictions-section">
        ${await renderPredictionsSection(userId)}
      </div>

      <!-- Wellness Patterns -->
      <div class="section-heading"><h3>Wellness Patterns</h3></div>
      <div id="correlation-section">
        ${await renderCorrelationSection(userId)}
      </div>

      <!-- Weekly Summary -->
      <div class="section-heading" style="margin-top:var(--space-4);"><h3>Weekly Summary</h3></div>
      <div id="weekly-report-section">
  <div id="weekly-score-react"></div>
</div>

      <!-- Data Counts -->
      <div class="section-heading"><h3>Data Collected</h3></div>
      <div class="grid-2" style="margin-bottom:var(--space-8);">
        ${renderStatBox(meals.length, 'Meals (7 days)', 'var(--accent-teal)')}
        ${renderStatBox(scans.length, 'Wellness Check-ins', 'var(--accent-blue)')}
        ${renderStatBox(supplements.length, 'Supplements', 'var(--accent-green)')}
      </div>
    </div>`;
mountReact(WellnessScoreCard, 'weekly-score-react', { userId });
    mountReact(PatternDiscoveryHero, 'pattern-hero-react', { userId });
    mountReact(NutritionTracker, 'nutrition-tracker-react', { userId });
    // Sections that render from the server on load (previously only reachable from their own buttons)
    const weeklyEl = document.getElementById('weekly-report-section');
    if (weeklyEl) weeklyEl.innerHTML = await renderWeeklyReportSection(userId);
    setupAnalyticsHandlers(userId);

  } catch (err) {
    console.error('[Analytics]', err);
    content.innerHTML = `<div class="analytics"><div class="page-header"><h1>Analytics</h1></div><div class="empty-state" role="alert"><h3>Couldn't load your analytics</h3><p>Check your connection and try again. Your data is safe.</p><button type="button" class="btn btn-primary" id="analytics-retry">Try again</button></div></div>`;
    document.getElementById('analytics-retry')?.addEventListener('click', () => renderAnalytics());
  }
}

function renderPatternDiscoveryEmpty() {
  return `
  <div style="background:linear-gradient(135deg,var(--surface-2) 0%,var(--surface-3) 100%);border-radius:var(--radius-lg);padding:var(--space-6);border:1px solid var(--border);text-align:center;">
    <div style="margin-bottom:var(--space-3);color:var(--text-tertiary);display:flex;justify-content:center;">${icons.scan}</div>
    <div style="font-size:var(--text-sm);font-weight:600;margin-bottom:var(--space-2);">No patterns discovered yet</div>
    <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-4);">Log meals, sleep, and check-ins for a few days, then run a pattern analysis to see connections in your data.</div>
    <button id="refresh-patterns-btn" class="btn btn-primary" style="font-size:var(--text-xs);">Run Pattern Analysis</button>
  </div>`;
}

async function renderPredictionsSection(userId) {
  try {
    const res = await apiFetch(`/api/predictions/latest?userId=${userId}`);
    if (!res.ok) return renderPredictionsEmpty();
    const { prediction } = await res.json();
    if (!prediction) return renderPredictionsEmpty();

    const trajColor = prediction.overall_trajectory === 'improving' ? 'var(--accent-green)' : prediction.overall_trajectory === 'declining' ? 'var(--accent-coral)' : 'var(--accent-amber)';
    const confColor = c => c === 'high' ? 'var(--accent-green)' : c === 'moderate' ? 'var(--accent-amber)' : 'var(--text-tertiary)';
    const effortColor = e => e === 'low' ? 'var(--accent-green)' : e === 'medium' ? 'var(--accent-amber)' : 'var(--accent-coral)';

    const trends = prediction.trend_extrapolations || [];
    const interventions = prediction.intervention_ranking || [];

    return `
      <div class="card" style="border-left:3px solid ${trajColor};margin-bottom:var(--space-3);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <div style="font-size:var(--text-xs);color:var(--text-tertiary);">Recent direction, from your logs</div>
          <span style="font-size:10px;padding:1px 8px;border-radius:20px;background:${trajColor}22;color:${trajColor};font-weight:600;text-transform:capitalize;">${prediction.overall_trajectory}</span>
        </div>
        <div style="font-size:var(--text-xs);color:var(--text-secondary);">${prediction.trajectory_summary}</div>
        ${prediction.data_sufficiency === 'sparse' ? `<div style="font-size:10px;color:var(--accent-amber);margin-top:var(--space-2);">Pattern emerging — more logging will improve accuracy. ${prediction.minimum_data_needed || ''}</div>` : ''}
      </div>

      ${trends.length > 0 ? `
      <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:var(--space-2);">7-Day Trend Patterns</div>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-bottom:var(--space-3);">
        ${trends.slice(0, 5).map(t => `
        <div class="card card-sm">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2px;">
            <div style="font-size:var(--text-xs);font-weight:600;">${t.metric}</div>
            <span style="font-size:10px;color:${confColor(t.confidence)};">${t.confidence} data support</span>
          </div>
          <div style="display:flex;gap:var(--space-3);align-items:center;margin-bottom:4px;">
            <span style="font-size:10px;color:var(--text-tertiary);">Now: ${t.current_value}</span>
            <span style="color:var(--text-tertiary);">→</span>
            <span style="font-size:10px;font-weight:600;color:${t.direction === 'improving' ? 'var(--accent-green)' : t.direction === 'declining' ? 'var(--accent-coral)' : 'var(--text-secondary)'};">if this continues: ${t.projected_7d}</span>
          </div>
          ${t.worth_watching ? `<div style="font-size:10px;color:var(--accent-amber);">${t.worth_watching}</div>` : ''}
          ${t.alert ? `<div style="font-size:10px;color:var(--accent-amber);">${t.alert}</div>` : ''}
          ${t.positive ? `<div style="font-size:10px;color:var(--accent-green);">${t.positive}</div>` : ''}
        </div>`).join('')}
      </div>` : ''}

      ${interventions.length > 0 ? `
      <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:var(--space-2);">Suggestions based on your logs</div>
      <p class="disclaimer" style="margin-bottom:var(--space-2);">Observations from your own entries — not medical advice.</p>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-bottom:var(--space-3);">
        ${interventions.slice(0, 5).map(iv => `
        <div class="card card-sm">
          <div style="display:flex;gap:var(--space-2);align-items:flex-start;">
            <div style="width:22px;height:22px;border-radius:50%;background:var(--accent-teal);color:#000;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${iv.rank}</div>
            <div style="flex:1;">
              <div style="font-size:var(--text-xs);font-weight:600;margin-bottom:2px;">${iv.intervention}</div>
              <div style="font-size:10px;color:var(--accent-green);margin-bottom:2px;">${iv.expected_impact}</div>
              <div style="display:flex;gap:var(--space-2);">
                <span style="font-size:10px;color:${effortColor(iv.effort)};">Effort: ${iv.effort}</span>
                <span style="font-size:10px;color:var(--text-tertiary);">${iv.timeframe}</span>
              </div>
            </div>
          </div>
        </div>`).join('')}
      </div>` : ''}

      <button id="run-predictions-btn" class="btn" style="width:100%;font-size:var(--text-xs);background:var(--surface-2);border:1px solid var(--border);">
        Re-run Trend Analysis
      </button>`;
  } catch { return renderPredictionsEmpty(); }
}

function renderPredictionsEmpty() {
  return `
    <div class="card" style="text-align:center;padding:var(--space-6);">
      <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-3);">Run trend analysis to see where your wellness patterns are heading and which lifestyle changes would have the most impact.</p>
      <button id="run-predictions-btn" class="btn btn-primary" style="font-size:var(--text-xs);">Run Trend Analysis</button>
    </div>`;
}

async function renderCorrelationSection(userId) {
  try {
    const res = await apiFetch(`/api/correlate/latest?userId=${userId}&limit=8`);
    if (!res.ok) return renderCorrelationEmpty();
    const { correlations } = await res.json();
    const meaningful = correlations.filter(c => c.correlation_type !== 'summary');
    const summary = correlations.find(c => c.correlation_type === 'summary');

    if (meaningful.length === 0) return renderCorrelationEmpty();

    const directionColor = d => d === 'positive' ? 'var(--accent-green)' : d === 'negative' ? 'var(--accent-coral)' : 'var(--text-tertiary)';
    const confidenceLabel = c => c >= 0.8 ? 'Consistent' : c >= 0.5 ? 'Emerging' : 'Early hint';

    // Check age of correlations for persistent pattern escalation
    const oldestCorrelation = meaningful.reduce((oldest, c) => {
      const date = new Date(c.generated_at || 0);
      return date < oldest ? date : oldest;
    }, new Date());
    const daysSinceFirst = Math.floor((Date.now() - oldestCorrelation) / 86400000);
    const showEscalation = daysSinceFirst >= 14;

    return `
      ${summary ? `<div class="card" style="border-left:3px solid var(--accent-teal);margin-bottom:var(--space-3);">
        <div style="font-size:var(--text-xs);color:var(--accent-teal);font-weight:600;margin-bottom:4px;">Top Pattern</div>
        <div style="font-size:var(--text-sm);">${summary.actionable || summary.description}</div>
      </div>` : ''}
      <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-bottom:var(--space-3);">
        ${meaningful.slice(0, 6).map(c => `
        <div class="card card-sm" style="border-left:3px solid ${directionColor(c.direction)};">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
            <div style="font-size:10px;color:var(--text-tertiary);">${c.correlation_type?.replace(/-/g, ' → ')}</div>
            <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:${directionColor(c.direction)}22;color:${directionColor(c.direction)};">${confidenceLabel(c.confidence)}</span>
          </div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:${c.actionable ? 'var(--space-1)' : '0'};">${c.description}</div>
          ${c.actionable ? `<div style="font-size:10px;color:var(--accent-teal);">Something to explore: ${c.actionable}</div>` : ''}
        </div>`).join('')}
      </div>
      ${showEscalation ? `
      <div class="card" style="border-left:3px solid var(--accent-amber);margin-bottom:var(--space-3);background:var(--accent-amber-dim);">
        <div style="font-size:var(--text-xs);color:var(--accent-amber);font-weight:600;margin-bottom:4px;">Pattern ongoing for 14+ days</div>
        <div style="font-size:var(--text-xs);color:var(--text-secondary);">Some of these patterns have been present for a while. If anything feels persistent or concerning, it may be worth mentioning to a healthcare provider.</div>
      </div>` : ''}
      <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:var(--space-3);font-style:italic;">Pattern observations only — not medical advice.</div>
      <button id="run-correlation-btn" class="btn" style="width:100%;font-size:var(--text-xs);background:var(--surface-2);border:1px solid var(--border);">
        Run New Pattern Analysis
      </button>`;
  } catch { return renderCorrelationEmpty(); }
}

function renderCorrelationEmpty() {
  return `
    <div class="card" style="text-align:center;padding:var(--space-6);">
      <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-3);">No patterns yet — run an analysis to find connections across your wellness data.</p>
      <button id="run-correlation-btn" class="btn btn-primary" style="font-size:var(--text-xs);">Run Pattern Analysis</button>
    </div>`;
}

async function renderWeeklyReportSection(userId) {
  try {
    const [narrativeRes, reportRes] = await Promise.allSettled([
      apiFetch(`/api/weekly-report/narrative?userId=${userId}`),
      apiFetch(`/api/weekly-report/latest?userId=${userId}`),
    ]);

    const narrativeData = narrativeRes.status === 'fulfilled' && narrativeRes.value.ok
      ? await narrativeRes.value.json() : null;
    const narrative = narrativeData?.narrative || null;

    const res = reportRes.status === 'fulfilled' ? reportRes.value : null;
    if (!res?.ok) return renderReportEmpty();
    const { reports } = await res.json();
    if (!reports || reports.length === 0) return renderReportEmpty();

    const r = reports[0];
    const scoreColor = r.week_score >= 80 ? 'var(--accent-green)' : r.week_score >= 60 ? 'var(--accent-amber)' : 'var(--accent-coral)';
    const gaps = r.gaps || r.report_data?.patterns_to_explore || [];

    const narrativeCard = narrative ? `
    <div class="card" style="margin-bottom:var(--space-3);background:linear-gradient(135deg,var(--surface-2) 0%,var(--surface-3) 100%);border:1px solid var(--border);">
      <div style="font-size:10px;font-weight:700;color:var(--accent-teal);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:var(--space-2);">Your Wellness Story · ${narrative.weeks_analyzed} weeks</div>
      <div style="font-size:var(--text-sm);color:var(--text-primary);line-height:1.6;margin-bottom:var(--space-3);">${narrative.story}</div>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);">
        ${narrative.strongest_trend ? `
        <div style="padding:var(--space-2);background:var(--surface-1);border-radius:var(--radius-md);border-left:3px solid var(--accent-teal);">
          <div style="font-size:9px;color:var(--text-tertiary);margin-bottom:2px;">CONSISTENT PATTERN</div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);">${narrative.strongest_trend}</div>
        </div>` : ''}
        ${narrative.biggest_shift ? `
        <div style="padding:var(--space-2);background:var(--surface-1);border-radius:var(--radius-md);border-left:3px solid var(--accent-amber);">
          <div style="font-size:9px;color:var(--text-tertiary);margin-bottom:2px;">BIGGEST SHIFT</div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);">${narrative.biggest_shift}</div>
        </div>` : ''}
        ${narrative.next_chapter ? `
        <div style="padding:var(--space-2);background:var(--accent-teal-dim);border-radius:var(--radius-md);">
          <div style="font-size:9px;color:var(--accent-teal);margin-bottom:2px;">NEXT CHAPTER</div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);">${narrative.next_chapter}</div>
        </div>` : ''}
      </div>
      <div style="font-size:9px;color:var(--text-tertiary);margin-top:var(--space-2);font-style:italic;">Pattern observations only — not medical advice</div>
    </div>` : '';

    return `${narrativeCard}
      <div class="card" style="margin-bottom:var(--space-3);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-3);">
          <div style="flex:1;">
            <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:2px;">Week of ${r.week_of}</div>
            <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${r.headline}</div>
          </div>
          <div style="text-align:center;margin-left:var(--space-3);">
            <div style="font-family:var(--font-heading);font-size:var(--text-2xl);font-weight:800;color:${scoreColor};">${r.week_score}</div>
            <div style="font-size:10px;color:var(--text-tertiary);">week score</div>
          </div>
        </div>
        ${r.wins?.length > 0 ? `
        <div style="margin-bottom:var(--space-3);">
          <div style="font-size:10px;font-weight:600;color:var(--accent-green);margin-bottom:var(--space-1);">WINS</div>
          ${r.wins.map(w => `<div style="font-size:var(--text-xs);color:var(--text-secondary);padding:2px 0;">+ ${w}</div>`).join('')}
        </div>` : ''}
        ${gaps.length > 0 ? `
        <div style="margin-bottom:var(--space-3);">
          <div style="font-size:10px;font-weight:600;color:var(--accent-amber);margin-bottom:var(--space-1);">PATTERNS TO EXPLORE</div>
          ${gaps.map(g => `<div style="font-size:var(--text-xs);color:var(--text-secondary);padding:2px 0;">${g}</div>`).join('')}
        </div>` : ''}
        ${r.top_correlation || r.report_data?.top_connection ? `
        <div style="padding:var(--space-2);background:var(--accent-teal-dim);border-radius:var(--radius-md);margin-bottom:var(--space-3);">
          <div style="font-size:10px;font-weight:600;color:var(--accent-teal);margin-bottom:2px;">CONNECTION NOTICED</div>
          <div style="font-size:var(--text-xs);color:var(--text-secondary);">${r.top_correlation || r.report_data?.top_connection}</div>
        </div>` : ''}
        ${r.focus ? `
        <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
          <div style="font-size:10px;font-weight:600;color:var(--text-secondary);margin-bottom:2px;">THIS WEEK FOCUS</div>
          <div style="font-size:var(--text-xs);color:var(--text-primary);">${r.focus}</div>
        </div>` : ''}
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:var(--space-3);font-style:italic;">Pattern observations only — not medical advice.</div>
      </div>
      <button id="generate-report-btn" class="btn" style="width:100%;font-size:var(--text-xs);background:var(--surface-2);border:1px solid var(--border);">
        Generate New Summary
      </button>`;
  } catch { return renderReportEmpty(); }
}

function renderReportEmpty() {
  return `
    <div class="card" style="text-align:center;padding:var(--space-6);">
      <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-3);">No weekly summary yet — generate one to see a snapshot of your wellness patterns this week.</p>
      <button id="generate-report-btn" class="btn btn-primary" style="font-size:var(--text-xs);">Generate Weekly Summary</button>
    </div>`;
}

function setupAnalyticsHandlers(userId) {
  document.getElementById('run-predictions-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('run-predictions-btn');
    const section = document.getElementById('predictions-section');
    btn.disabled = true;
    btn.textContent = 'Analyzing...';
    section.innerHTML = '<div style="text-align:center;padding:var(--space-6);"><div class="spinner" style="margin:0 auto;"></div><p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-3);">Finding trend patterns and ranking suggestions...</p></div>';
    try {
      const res = await apiFetch(`/api/predictions/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
      if (!res.ok) throw new Error('Server error');
      section.innerHTML = await renderPredictionsSection(userId);
      setupAnalyticsHandlers(userId);
    } catch (e) {
      section.innerHTML = '<div class="card"><p style="color:var(--accent-coral);">Analysis failed — try again</p></div>';
    }
  });

  document.getElementById('run-correlation-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('run-correlation-btn');
    const section = document.getElementById('correlation-section');
    btn.disabled = true;
    btn.textContent = 'Analyzing...';
    section.innerHTML = '<div style="text-align:center;padding:var(--space-6);"><div class="spinner" style="margin:0 auto;"></div><p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-3);">Finding patterns across your wellness data...</p></div>';
    try {
      const res = await apiFetch(`/api/correlate/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
      if (!res.ok) throw new Error('Server error');
      section.innerHTML = await renderCorrelationSection(userId);
      setupAnalyticsHandlers(userId);
    } catch (e) {
      section.innerHTML = '<div class="card"><p style="color:var(--accent-coral);">Analysis failed — try again</p></div>';
    }
  });

  document.getElementById('generate-report-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('generate-report-btn');
    const section = document.getElementById('weekly-report-section');
    btn.disabled = true;
    btn.textContent = 'Generating...';
    section.innerHTML = '<div style="text-align:center;padding:var(--space-6);"><div class="spinner" style="margin:0 auto;"></div><p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-3);">Writing your weekly summary...</p></div>';
    try {
      const res = await apiFetch(`/api/weekly-report/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
      if (!res.ok) throw new Error('Server error');
      section.innerHTML = await renderWeeklyReportSection(userId);
      setupAnalyticsHandlers(userId);
    } catch (e) {
      section.innerHTML = '<div class="card"><p style="color:var(--accent-coral);">Report generation failed — try again</p></div>';
    }
  });
}

function renderStatBox(value, label, color) {
  return `
  <div class="card card-sm" style="text-align:center;">
    <div style="font-family:var(--font-heading);font-size:var(--text-2xl);font-weight:var(--weight-bold);color:${color};">${value}</div>
    <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${label}</div>
  </div>`;
}