// Step details — real step counts from the user's daily habit log.
// Steps are entered manually (Log → Habits) or arrive via a wearable sync.
// Nothing here is estimated: if a day has no entry, it shows as no entry.
import { icons } from '../icons.js';
import { supabase } from '../lib/supabase.js';
import { getUserId } from '../lib/db.js';
import { createSparkline } from '../utils/charts.js';
import { esc } from '../utils/esc.js';

const GOAL = 10000;
let currentView = 'weekly';

export async function renderStepDetails() {
    const content = document.getElementById('page-content');
    content.innerHTML = `<div class="step-details"><div class="card" style="text-align:center;padding:var(--space-8);"><div class="spinner" style="margin:0 auto;"></div></div></div>`;

    let history = [];
    let loadError = null;
    try {
        const userId = await getUserId();
        const since = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
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
        loadError = err;
    }

    const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const today = history.find(h => h.date === todayStr);
    const todaySteps = today ? today.value : null;
    const progress = todaySteps == null ? 0 : Math.min((todaySteps / GOAL) * 100, 100);

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
      <div class="card" role="alert">
        <p style="color:var(--error);margin:0;">Couldn't load your step history. ${esc(loadError.message || '')}</p>
        <button type="button" class="btn btn-sm" id="steps-retry" style="margin-top:var(--space-3);">Try again</button>
      </div>` : ''}

      <div class="card step-summary-card">
        <div class="step-large-display">
          <div class="step-count">${todaySteps == null ? '—' : todaySteps.toLocaleString()}</div>
          <div class="step-label">${todaySteps == null ? 'No steps logged today' : 'Steps today'}</div>
        </div>
        <div class="step-progress-container" role="progressbar" aria-valuemin="0" aria-valuemax="${GOAL}" aria-valuenow="${todaySteps ?? 0}" aria-label="Progress toward daily step goal">
          <div class="step-progress-bar" style="width:${progress}%"></div>
        </div>
        <div class="step-goal-info">
          <span>Goal: ${GOAL.toLocaleString()}</span>
          <span>${todaySteps == null ? '' : Math.round(progress) + '%'}</span>
        </div>
      </div>

      <div class="tab-bar" role="tablist" aria-label="Step history range">
        ${['weekly', 'monthly'].map(v => `<button type="button" role="tab" class="tab-item ${currentView === v ? 'active' : ''}" aria-selected="${currentView === v}" data-view="${v}">${v === 'weekly' ? 'Last 7 days' : 'Last 30 days'}</button>`).join('')}
      </div>

      <div class="card chart-card">
        ${history.length ? `<canvas id="steps-chart" style="width:100%;height:200px;" role="img" aria-label="Step counts over the selected range"></canvas>`
                         : `<div class="empty-state"><p>No step entries yet. Log today's steps from the Habits tab and they will appear here.</p></div>`}
      </div>

      <div class="section-heading"><h3>History</h3></div>
      <div class="step-history-list">${renderHistoryList(history)}</div>
    </div>`;

    document.getElementById('steps-back')?.addEventListener('click', () => { window.location.hash = '#/'; });
    document.getElementById('steps-retry')?.addEventListener('click', () => renderStepDetails());
    document.querySelectorAll('.tab-item[data-view]').forEach(tab => {
        tab.addEventListener('click', () => { currentView = tab.dataset.view; renderStepDetails(); });
    });
    renderChart(history);
}

function renderHistoryList(history) {
    if (!history.length) return '';
    return history.map(item => {
        const date = new Date(item.date + 'T00:00:00');
        const day = date.toLocaleDateString([], { weekday: 'short' });
        const label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const pct = Math.min((item.value / GOAL) * 100, 100);
        return `
        <div class="card card-sm step-history-item">
          <div class="step-history-date"><span class="day">${day}</span><span class="date">${label}</span></div>
          <div class="step-history-value">
            <span class="count">${item.value.toLocaleString()}</span>
            <div class="mini-progress" aria-hidden="true"><div style="width:${pct}%"></div></div>
          </div>
        </div>`;
    }).join('');
}

function renderChart(history) {
    const canvas = document.getElementById('steps-chart');
    if (!canvas || !history.length) return;
    const n = currentView === 'weekly' ? 7 : 30;
    const points = history.slice(0, n).reverse().map(h => h.value);
    createSparkline(canvas, points, { color: '#6F8F6A', fill: true, points: true });
}
