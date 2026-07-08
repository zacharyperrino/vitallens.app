import { Router } from './router.js';
import { icons } from './icons.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderFoodScanner } from './pages/food-scanner.js';
import { renderBodyScanner } from './pages/body-scanner.js';
import { renderStoolScanner } from './pages/stool-scanner.js';
import { renderHealthInput } from './pages/health-input.js';
import { renderEasternMedicine } from './pages/eastern-medicine.js';
import { renderAnalytics } from './pages/analytics.js';
import { renderProfile } from './pages/profile.js';
import { renderHealthChat } from './pages/health-chat.js';
import { renderStepDetails } from './pages/step-details.js';
import { renderProductResults } from './pages/product-results.js';
import { checkOAuthCallback, exchangeCodeForToken } from './utils/strava.js';
import { getSession, renderAuth } from './pages/auth.js';
import { meals } from './lib/db.js';
import { renderHygieneScanner } from './pages/hygiene-scanner.js';
import { renderOnboarding } from './pages/onboarding.js';
import { renderTerms, renderPrivacy } from './pages/legal.js';
import { apiFetch } from './utils/api.js';
import { showToast } from './utils/toast.js';
const NOTIFICATION_PERMISSION_KEY = 'vitallens_notifications_permission_requested';
const NOTIFICATION_ENABLED_KEY = 'vitallens_notifications_enabled';
const LAST_WEEKLY_REPORT_KEY = 'vitallens_last_weekly_report_week';
const NOTIFICATION_WIDGET_ID = 'notification-settings-widget';

function getNotificationPreference() {
  const value = localStorage.getItem(NOTIFICATION_ENABLED_KEY);
  if (value === null) return true;
  return value === 'true';
}

function setNotificationPreference(enabled) {
  localStorage.setItem(NOTIFICATION_ENABLED_KEY, enabled ? 'true' : 'false');
  updateNotificationToggle();
  return enabled;
}

function hasNotificationPermissionBeenRequested() {
  return localStorage.getItem(NOTIFICATION_PERMISSION_KEY) === 'true';
}

function markNotificationPermissionRequested() {
  localStorage.setItem(NOTIFICATION_PERMISSION_KEY, 'true');
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') {
    markNotificationPermissionRequested();
    return true;
  }
  if (Notification.permission === 'denied') {
    markNotificationPermissionRequested();
    return false;
  }
  if (hasNotificationPermissionBeenRequested()) {
    return Notification.permission === 'granted';
  }

  markNotificationPermissionRequested();
  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (err) {
    console.warn('[Notifications] Permission request failed:', err.message);
    return false;
  }
}

async function initializeNotificationPreferences() {
  createNotificationWidget();

  const permissionGranted = await requestNotificationPermission();
  if (permissionGranted) {
    setNotificationPreference(true);
  } else if (!hasNotificationPermissionBeenRequested()) {
    setNotificationPreference(false);
  }

  updateNotificationToggle();
  return permissionGranted && getNotificationPreference();
}

// Listen for profile-driven notification changes
window.addEventListener('vitallens:notifications:changed', async (e) => {
  try {
    const enabled = !!(e?.detail && e.detail.enabled);
    localStorage.setItem(NOTIFICATION_ENABLED_KEY, enabled ? 'true' : 'false');
    updateNotificationToggle();
    if (enabled) {
      if (Notification.permission !== 'granted') {
        const granted = await requestNotificationPermission();
        if (!granted) { showToast('Notification permission not granted'); return; }
      }
      const session = await getSession();
      const userId = session?.userId || localStorage.getItem('vitallens_user_id');
      if (userId) setupNotificationTriggers(userId);
      showToast('Notifications enabled');
    } else {
      showToast('Notifications disabled');
    }
  } catch (err) {
    console.warn('[Notifications] Event handler error:', err.message);
  }
});

async function showNotification(title, options = {}) {
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  if (!getNotificationPreference()) return false;

  try {
    new Notification(title, options);
    return true;
  } catch (err) {
    console.warn('[Notifications] Failed to show notification:', err.message);
    return false;
  }
}

function createNotificationWidget() {
  if (document.getElementById(NOTIFICATION_WIDGET_ID)) return;

  const widget = document.createElement('div');
  widget.id = NOTIFICATION_WIDGET_ID;
  widget.style.cssText = `position:fixed;bottom:22px;right:22px;z-index:9999;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:18px;box-shadow:0 18px 40px rgba(0,0,0,0.12);background:var(--surface-1);color:var(--text-primary);font-size:13px;max-width:220px;`;
  widget.innerHTML = `
    <button id="notification-toggle-btn" style="border:none;outline:none;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:600;cursor:pointer;">On</button>
    <div style="display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;">
      <span style="font-weight:700;line-height:1.1;">Notifications</span>
      <span id="notification-widget-status" style="font-size:11px;color:var(--text-secondary);line-height:1.2;">Enabled</span>
    </div>
  `;

  document.body.appendChild(widget);
  widget.querySelector('#notification-toggle-btn')?.addEventListener('click', handleNotificationToggle);
  updateNotificationToggle();
}

function updateNotificationToggle() {
  const enabled = getNotificationPreference();
  const button = document.querySelector('#notification-toggle-btn');
  const status = document.querySelector('#notification-widget-status');
  if (!button || !status) return;

  if (Notification.permission === 'denied') {
    button.textContent = 'Blocked';
    button.style.background = 'rgba(251, 113, 133, 0.18)';
    button.style.color = 'var(--accent-coral)';
    status.textContent = 'Permission denied';
    status.style.color = 'var(--accent-coral)';
    return;
  }

  button.textContent = enabled ? 'On' : 'Off';
  button.style.background = enabled ? 'rgba(16, 185, 129, 0.18)' : 'rgba(148, 163, 184, 0.18)';
  button.style.color = enabled ? 'var(--accent-green)' : 'var(--text-secondary)';
  status.textContent = enabled ? 'Enabled' : 'Disabled';
  status.style.color = enabled ? 'var(--accent-green)' : 'var(--text-secondary)';
}

async function handleNotificationToggle() {
  const enabled = getNotificationPreference();
  if (enabled) {
    setNotificationPreference(false);
    showToast('Notifications turned off');
    return;
  }

  if (Notification.permission === 'denied') {
    showToast('Notifications are blocked in your browser settings');
    updateNotificationToggle();
    return;
  }

  const granted = await requestNotificationPermission();
  if (granted) {
    setNotificationPreference(true);
    showToast('Notifications enabled');
    const session = await getSession();
    const userId = session?.userId || localStorage.getItem('vitallens_user_id');
    if (userId) setupNotificationTriggers(userId);
  } else {
    setNotificationPreference(false);
    showToast('Notifications remain disabled');
  }
}

function parseExplicitTimes(text) {
  const times = [];
  const regex = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi;
  let match;
  while ((match = regex.exec(text))) {
    const hour = parseInt(match[1], 10);
    const minute = match[2] ? parseInt(match[2], 10) : 0;
    const ampm = match[3] ? match[3].toLowerCase() : null;
    const normalized = to24Hour(hour, minute, ampm);
    if (normalized) {
      times.push(normalized);
    }
  }
  return Array.from(new Set(times));
}

function to24Hour(hour, minute = 0, ampm = null) {
  if (ampm) {
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
  }
  if (hour === 24) hour = 0;
  if (hour < 0 || hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseSupplementSchedule(frequency) {
  const text = (frequency || '').toLowerCase();
  if (!text || /as needed|as-needed|prn/.test(text)) {
    return { times: [], repeat: 'none' };
  }

  const explicit = parseExplicitTimes(text);
  if (explicit.length) {
    return { times: explicit, repeat: /weekly/.test(text) ? 'weekly' : 'daily' };
  }
  if (/three|3x|3 times|three times/.test(text)) {
    return { times: ['08:00', '13:00', '20:00'], repeat: 'daily' };
  }
  if (/twice|2x|two times/.test(text)) {
    return { times: ['09:00', '20:00'], repeat: 'daily' };
  }
  if (/weekly/.test(text)) {
    return { times: ['09:00'], repeat: 'weekly' };
  }
  if (/morning/.test(text)) {
    return { times: ['09:00'], repeat: 'daily' };
  }
  if (/evening|bed|before bed/.test(text)) {
    return { times: ['20:00'], repeat: 'daily' };
  }
  if (/with meals/.test(text)) {
    return { times: ['08:00', '12:00', '18:00'], repeat: 'daily' };
  }
  if (/daily|every day|once a day/.test(text)) {
    return { times: ['09:00'], repeat: 'daily' };
  }
  return { times: ['09:00'], repeat: 'daily' };
}

function getNextTimestamp(timeString) {
  const [hourStr, minuteStr] = timeString.split(':');
  const now = new Date();
  const next = new Date(now);
  next.setHours(parseInt(hourStr, 10), parseInt(minuteStr, 10), 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime();
}

function getNextWeeklyTimestamp(timeString) {
  const [hourStr, minuteStr] = timeString.split(':');
  const now = new Date();
  const next = new Date(now);
  next.setHours(parseInt(hourStr, 10), parseInt(minuteStr, 10), 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 7);
  }
  return next.getTime();
}

function getNextWeekdayTimestamp(weekday, timeString) {
  const [hourStr, minuteStr] = timeString.split(':');
  const now = new Date();
  const next = new Date(now);
  next.setHours(parseInt(hourStr, 10), parseInt(minuteStr, 10), 0, 0);
  const currentWeekday = next.getDay();
  const delta = (weekday + 7 - currentWeekday) % 7 || 7;
  next.setDate(next.getDate() + delta);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 7);
  }
  return next.getTime();
}

function scheduleReminder(timeString, repeat, callback) {
  const scheduleNext = async () => {
    const nextTime = repeat === 'weekly' ? getNextWeeklyTimestamp(timeString) : getNextTimestamp(timeString);
    const delay = Math.max(nextTime - Date.now(), 1000);
    setTimeout(async () => {
      try {
        await callback();
      } finally {
        if (repeat !== 'none') {
          scheduleNext();
        }
      }
    }, delay);
  };
  scheduleNext();
}

function scheduleWeeklyDayReminder(weekday, timeString, callback) {
  const scheduleNext = async () => {
    const nextTime = getNextWeekdayTimestamp(weekday, timeString);
    const delay = Math.max(nextTime - Date.now(), 1000);
    setTimeout(async () => {
      try {
        await callback();
      } finally {
        scheduleNext();
      }
    }, delay);
  };
  scheduleNext();
}

async function setupNotificationTriggers(userId) {
  if (!Notification || !getNotificationPreference() || Notification.permission !== 'granted') {
    return;
  }
  scheduleSupplementReminders(userId);
  scheduleMealNudge(userId);
  setupWeeklyReportNotifier(userId);
}

async function scheduleSupplementReminders(userId) {
  try {
    const res = await apiFetch(`/api/supplements?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return;
    const data = await res.json();
    const supplements = Array.isArray(data.supplements) ? data.supplements : [];
    if (!supplements.length) return;

    const reminders = new Map();
    supplements.forEach((supplement) => {
      const schedule = parseSupplementSchedule(supplement.frequency);
      if (!schedule.times.length) return;
      schedule.times.forEach((time) => {
        const existing = reminders.get(time) || { names: [], repeat: schedule.repeat };
        existing.names.push(supplement.name || 'Supplement');
        if (existing.repeat !== 'daily' && schedule.repeat === 'daily') {
          existing.repeat = 'daily';
        }
        reminders.set(time, existing);
      });
    });

    reminders.forEach(({ names, repeat }, time) => {
      scheduleReminder(time, repeat, async () => {
        if (!getNotificationPreference()) return;
        const title = 'Supplement reminder';
        const body = `Time to take: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ' and more' : ''}.`;
        await showNotification(title, {
          body,
          icon: '/icons/notification-icon.png',
          tag: `supplement-reminder-${time}`,
          renotify: true,
        });
      });
    });
  } catch (err) {
    console.warn('[Notifications] Supplement reminder setup failed:', err.message);
  }
}

async function scheduleMealNudge(userId) {
  const checkMealStatus = async () => {
    if (!getNotificationPreference()) return;
    try {
      const todayMeals = await meals.getToday();
      if (!Array.isArray(todayMeals) || todayMeals.length === 0) {
        await showNotification('Meal reminder', {
          body: 'No meal logged by 1pm yet. Log your lunch or dinner to keep nutrition on track.',
          icon: '/icons/notification-icon.png',
          tag: 'daily-meal-nudge',
          renotify: false,
        });
      }
    } catch (err) {
      console.warn('[Notifications] Meal nudge check failed:', err.message);
    }
  };

  try {
    const now = new Date();
    const target = new Date(now);
    target.setHours(13, 0, 0, 0);
    const todayMeals = await meals.getToday();
    if ((!Array.isArray(todayMeals) || todayMeals.length === 0) && now.getTime() >= target.getTime()) {
      await checkMealStatus();
    }
  } catch (err) {
    console.warn('[Notifications] Meal nudge initialization failed:', err.message);
  }

  scheduleReminder('13:00', 'daily', checkMealStatus);
}

async function setupWeeklyReportNotifier(userId) {
  const checkReports = async () => {
    if (!getNotificationPreference()) return;
    try {
      const res = await apiFetch(`/api/weekly-report/latest?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const latest = Array.isArray(data.reports) ? data.reports[0] : null;
      if (!latest || !latest.week_of) return;

      const lastKnownWeek = localStorage.getItem(LAST_WEEKLY_REPORT_KEY);
      if (lastKnownWeek && lastKnownWeek !== latest.week_of) {
        await showNotification('Weekly report ready', {
          body: 'Your latest weekly health report is now available. Open VitalLens to review your newest insights.',
          icon: '/icons/notification-icon.png',
          tag: 'weekly-report-ready',
          renotify: false,
        });
      }
      localStorage.setItem(LAST_WEEKLY_REPORT_KEY, latest.week_of);
    } catch (err) {
      console.warn('[Notifications] Weekly report check failed:', err.message);
    }
  };

  await checkReports();
  scheduleWeeklyDayReminder(1, '09:00', checkReports);
}

function initNav() {
  const nav = document.getElementById('bottom-nav');
  const items = [
    { route: '/', icon: icons.home, label: 'Home' },
    { route: '/food-scanner', icon: icons.scan, label: 'Food' },
    { route: '/body-scanner', icon: icons.eye, label: 'Scan' },
    { route: '/health-input', icon: icons.clipboard, label: 'Log' },
    { route: '/health-chat', icon: icons.sparkle, label: 'AI Chat' },
  ];

  nav.innerHTML = items.map(item => `
    <div class="nav-item${item.route === '/' ? ' active' : ''}" data-route="${item.route}">
      ${item.icon}
      <span>${item.label}</span>
    </div>
  `).join('');

  nav.querySelectorAll('.nav-item').forEach(navItem => {
    navItem.addEventListener('click', () => {
      location.hash = '#' + navItem.dataset.route;
    });
  });
}

async function init() {
  const session = await getSession();
  if (!session) {
    renderAuth();
    return;
  }

  initNav();
  createNotificationWidget();

  const notificationReady = await initializeNotificationPreferences();
  const userId = session?.userId || localStorage.getItem('vitallens_user_id');
  if (userId && notificationReady) {
    setupNotificationTriggers(userId);
  }

  const router = new Router({
    '/': renderDashboard,
    '/food-scanner': renderFoodScanner,
    '/hygiene-scanner': renderHygieneScanner,
    '/body-scanner': renderBodyScanner,
    '/stool-scanner': renderStoolScanner,
    '/health-input': renderHealthInput,
    '/eastern-medicine': renderEasternMedicine,
    '/analytics': renderAnalytics,
    '/profile': renderProfile,
    '/health-chat': renderHealthChat,
    '/step-details': renderStepDetails,
    '/product-results': renderProductResults,
    '/onboarding': renderOnboarding,
    '/legal/terms': renderTerms,
    '/legal/privacy': renderPrivacy,
  });

  const stravaCode = checkOAuthCallback();
  if (stravaCode) {
    try {
      await exchangeCodeForToken(stravaCode);
      location.hash = '#/health-input';
      setTimeout(() => {
        const c = document.getElementById('toast-container');
        if (c) {
          const t = document.createElement('div');
          t.className = 'toast';
          t.innerHTML = '<span>Strava connected! Sync your activities.</span>';
          c.appendChild(t);
          setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 300); }, 3000);
        }
      }, 500);
    } catch (err) {
      console.error('Strava auth failed:', err);
      const c = document.getElementById('toast-container');
      if (c) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.innerHTML = `<span>Strava auth failed: ${err.message}</span>`;
        c.appendChild(t);
        setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 300); }, 4000);
      }
    }
  }

  // First-run onboarding is a DB-gated route (profiles.onboarding_completed),
  // enforced by the router guard and rendered by pages/onboarding.js.

  router.resolve();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ── Service Worker Registration ────────────────────────────────
// Production only — in dev the SW's cache-first shell serving fights
// Vite's live modules (stale HTML/CSS, broken hot reloads).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('[SW] Registered:', reg.scope);

        // Trigger background sync when online
        window.addEventListener('online', () => {
          reg.sync?.register('vitallens-sync').catch(() => {});
          navigator.serviceWorker.controller?.postMessage({ type: 'trigger-sync' });
        });

        // Listen for sync complete messages
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'sync-complete') {
            console.log('[SW] Offline data synced successfully');
          }
        });
      })
      .catch(err => console.warn('[SW] Registration failed:', err));
  });
}