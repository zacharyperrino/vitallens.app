// Step Details page — timeframe analysis of step data
import { store } from '../store.js';
import { icons } from '../icons.js';
import { syncSteps } from '../utils/apple-health.js';
import { createSparkline } from '../utils/charts.js';

let currentView = 'weekly'; // daily, weekly, monthly

export function renderStepDetails() {
    const content = document.getElementById('page-content');
    const stepHistory = store.get('stepHistory') || [];
    const healthConfig = store.get('healthKit') || {};
    const goal = healthConfig.goal || 10000;

    const todaySteps = stepHistory[0]?.value || 0;
    const progress = Math.min((todaySteps / goal) * 100, 100);

    content.innerHTML = `
    <div class="step-details stagger-children">
      <div class="page-header">
        <div style="display:flex;align-items:center;gap:var(--space-3);">
          <div class="back-btn" id="steps-back">${icons.chevronRight ? icons.chevronRight : '‹'}</div>
          <h1>Steps</h1>
        </div>
        <button class="btn btn-sm btn-outline sync-btn" id="sync-steps">
          ${icons.refresh} Sync
        </button>
      </div>

      <div class="card step-summary-card">
        <div class="step-large-display">
          <div class="step-count">${todaySteps.toLocaleString()}</div>
          <div class="step-label">Steps Today</div>
        </div>
        <div class="step-progress-container">
          <div class="step-progress-bar" style="width: ${progress}%"></div>
        </div>
        <div class="step-goal-info">
          <span>Goal: ${goal.toLocaleString()}</span>
          <span>${Math.round(progress)}%</span>
        </div>
      </div>

      <div class="tab-bar">
        <div class="tab-item ${currentView === 'daily' ? 'active' : ''}" data-view="daily">Daily</div>
        <div class="tab-item ${currentView === 'weekly' ? 'active' : ''}" data-view="weekly">Weekly</div>
        <div class="tab-item ${currentView === 'monthly' ? 'active' : ''}" data-view="monthly">Monthly</div>
      </div>

      <div class="card chart-card">
        <canvas id="steps-chart" style="width: 100%; height: 200px;"></canvas>
      </div>

      <div class="section-heading">
        <h3>History</h3>
      </div>
      <div class="step-history-list">
        ${renderHistoryList(stepHistory)}
      </div>
    </div>`;

    setupStepHandlers();
    renderChart(stepHistory);
}

function renderHistoryList(history) {
    if (!history || history.length === 0) {
        return `<div class="card" style="text-align:center;padding:var(--space-8);">No history available</div>`;
    }

    return history.map(item => {
        const date = new Date(item.date);
        const day = date.toLocaleDateString([], { weekday: 'short' });
        const label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const pct = Math.min((item.value / 10000) * 100, 100);

        return `
        <div class="card card-sm step-history-item">
          <div class="step-history-date">
            <span class="day">${day}</span>
            <span class="date">${label}</span>
          </div>
          <div class="step-history-value">
            <span class="count">${item.value.toLocaleString()}</span>
            <div class="mini-progress"><div style="width:${pct}%"></div></div>
          </div>
        </div>`;
    }).join('');
}

function renderChart(history) {
    const canvas = document.getElementById('steps-chart');
    if (!canvas) return;

    let dataPoints = [];
    if (currentView === 'daily') {
        dataPoints = history.slice(0, 24).reverse().map(h => h.value); // Usually we'd want hourly here
    } else if (currentView === 'weekly') {
        dataPoints = history.slice(0, 7).reverse().map(h => h.value);
    } else {
        dataPoints = history.slice(0, 30).reverse().map(h => h.value);
    }

    // Since our mock data is only daily, for "daily" view we'll just show last 7 days too for now
    // In a real app we'd fetch hourly samples from HealthKit
    createSparkline(canvas, dataPoints, {
        color: '#2dd4bf',
        fill: true,
        points: true
    });
}

function setupStepHandlers() {
    document.getElementById('steps-back')?.addEventListener('click', () => {
        window.location.hash = '/';
    });

    document.getElementById('sync-steps')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.classList.add('loading');
        try {
            await syncSteps();
            renderStepDetails();
        } catch (err) {
            alert('Sync failed: ' + err.message);
        } finally {
            btn.classList.remove('loading');
        }
    });

    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.addEventListener('click', () => {
            currentView = tab.dataset.view;
            renderStepDetails();
        });
    });
}
