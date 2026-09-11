// Step details — real step counts from the user's daily habit log.
// Steps are entered manually (Log → Habits) or arrive via a wearable sync.
// Nothing here is estimated: if a day has no entry, it shows as no entry.
import { icons } from '../icons.js';
import { supabase } from '../lib/supabase.js';
import { getUserId } from '../lib/db.js';
import { createInteractiveTrendChart } from '../utils/charts.js';
import { esc } from '../utils/esc.js';
import { todayLocalISO, daysAgoLocalISO, startOfDayISO } from '../utils/dates.js';

// No step goal exists in the profile, so none is shown — steps are reported as logged.
let currentView = 'weekly';

export async function renderStepDetails() {
    const content = document.getElementById('page-content');
    content.innerHTML = `<div class="step-details"><div class="card" style="text-align:center;padding:var(--space-8);" role="status" aria-live="polite"><div class="spinner" style="margin:0 auto;"></div><p class="visually-hidden">Loading your step history</p></div></div>`;

    let history = [];
    let loadError = null;
    try {
        const userId = await getUserId();
        const since = daysAgoLocalISO(30);
        const { data, error } = await supabase
            .from('habits')
            .select('date, steps')
            .eq('user_id', userId)
            .gte('date', since)
            .not('steps', 'is', null)
            .order('date', { ascending: false });
        if (error) throw error;
        history = (data || []).map(r => ({ date: r.date, value: Number(r.steps) || 0 }));
    } catch (err) {
        console.warn('[StepDetails] Could not load step history:', err?.message || err);
        loadError = err;
    }

    const todayStr = todayLocalISO();
    const today = history.find(h => h.date === todayStr);
    const todaySteps = today ? today.value : null;
    const week = history.filter(h => h.date >= daysAgoLocalISO(6));
    const weekTotal = week.reduce((sum, h) => sum + h.value, 0);
    const weekAvg = week.length ? Math.round(weekTotal / week.length) : null;

    const rangeDays = currentView === 'weekly' ? 7 : 30;
    const rangeLabel = currentView === 'weekly' ? 'Last 7 days' : 'Last 30 days';
    const chartData = chartSeries(history, rangeDays);

    content.innerHTML = `
    <div class="step-details stagger-children">
      <div class="page-header">
        <div style="display:flex;align-items:center;gap:var(--space-3);">
          <button type="button" class="back-btn" id="steps-back" aria-label="Back to home">${icons.chevronRight}</button>
          <h1>Steps</h1>
        </div>
        <a class="btn btn-sm btn-outline" href="#/health-input">${icons.plus} Log steps</a>
      </div>

      ${loadError ? `
      <div class="empty-state card" role="alert">
        <h3>Couldn't load your step history</h3>
        <p>Check your connection and try again. Your entries are safe.</p>
        <button type="button" class="btn btn-sm" id="steps-retry">Try again</button>
      </div>` : ''}

      <div class="card step-summary-card">
        <div class="step-large-display">
          <div class="step-count">${todaySteps == null ? '—' : todaySteps.toLocaleString()}</div>
          <div class="step-label">${todaySteps == null ? 'No steps logged today' : 'Steps today'}</div>
        </div>
        <div class="step-goal-info">
          <span>Last 7 days: ${week.length ? `${weekTotal.toLocaleString()} total` : 'no entries'}</span>
          <span>${weekAvg == null ? '' : `${weekAvg.toLocaleString()} avg over ${week.length} logged ${week.length === 1 ? 'day' : 'days'}`}</span>
        </div>
        <p class="text-tertiary text-xs" style="margin:var(--space-2) 0 0;">No step goal set</p>
      </div>

      <div class="tab-bar" role="tablist" aria-label="Step history range">
        ${['weekly', 'monthly'].map(v => `<button type="button" role="tab" id="steps-tab-${v}" aria-controls="steps-chart-panel" class="tab-item ${currentView === v ? 'active' : ''}" aria-selected="${currentView === v}" data-view="${v}">${v === 'weekly' ? 'Last 7 days' : 'Last 30 days'}</button>`).join('')}
      </div>

      ${loadError ? '' : `
      <div class="card chart-card" id="steps-chart-panel" role="tabpanel" aria-labelledby="steps-tab-${currentView}">
        ${chartData.length
            ? `<div id="steps-chart-wrap">${createInteractiveTrendChart(chartData, 340, 160, 'var(--viz-green)', 'steps-chart', { label: `Daily step counts, ${rangeLabel.toLowerCase()}`, unit: 'steps' })}</div>
               <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin:var(--space-2) 0 0;">${chartData.length} ${chartData.length === 1 ? 'day' : 'days'} with entries in the ${rangeLabel.toLowerCase()}. Hover, tap, or tab through the points to see each day.</p>`
            : `<div class="empty-state"><h3>No step entries yet</h3><p>${history.length ? `Nothing logged in the ${rangeLabel.toLowerCase()}.` : 'Log today\'s steps from the Habits tab and they will appear here.'}</p></div>`}
      </div>`}

      <div class="section-heading"><h3>History</h3></div>
      <div class="step-history-list">${renderHistoryList(history)}</div>
    </div>`;

    document.getElementById('steps-back')?.addEventListener('click', () => { window.location.hash = '#/'; });
    document.getElementById('steps-retry')?.addEventListener('click', () => renderStepDetails());
    document.querySelectorAll('.tab-item[data-view]').forEach(tab => {
        tab.addEventListener('click', () => { currentView = tab.dataset.view; renderStepDetails(); });
    });
}

// Entries within the last N calendar days, oldest first, labelled for the chart.
function chartSeries(history, days) {
    const cutoff = daysAgoLocalISO(days - 1);
    return history
        .filter(h => h.date >= cutoff)
        .slice()
        .reverse()
        .map(h => ({
            label: new Date(startOfDayISO(h.date)).toLocaleDateString([], { month: 'short', day: 'numeric' }),
            value: h.value,
        }));
}

function renderHistoryList(history) {
    if (!history.length) return '';
    return history.map(item => {
        const date = new Date(startOfDayISO(item.date));
        const day = date.toLocaleDateString([], { weekday: 'short' });
        const label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        return `
        <div class="card card-sm step-history-item">
          <div class="step-history-date"><span class="day">${esc(day)}</span><span class="date">${esc(label)}</span></div>
          <div class="step-history-value">
            <span class="count">${item.value.toLocaleString()} <span class="visually-hidden">steps</span></span>
          </div>
        </div>`;
    }).join('');
}
