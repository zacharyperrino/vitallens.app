// ─── VitalLens Reminder System ────────────────────────────────
// Uses Web Notifications API (no service worker needed)
// Checks on app load and shows contextual reminders

const API = '/api';
const REMINDER_KEY = 'vitallens_reminders';

// ── Permission ────────────────────────────────────────────────
export async function requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
}

// ── Show notification ─────────────────────────────────────────
function showNotification(title, body, tag = 'vitallens') {
    if (Notification.permission !== 'granted') return;
    new Notification(title, {
        body,
        tag,
        icon: '/src/assets/icon-192.png',
        badge: '/src/assets/icon-192.png',
    });
}

// ── In-app toast reminder (fallback) ─────────────────────────
function showReminderToast(title, body, color = 'var(--accent-teal)') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = `max-width:320px;padding:var(--space-3) var(--space-4);border-left:3px solid ${color};`;
    toast.innerHTML = `
        <div style="font-size:var(--text-sm);font-weight:600;margin-bottom:2px;">${title}</div>
        <div style="font-size:var(--text-xs);color:var(--text-secondary);">${body}</div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 8000);
}

// ── Check if already fired today ─────────────────────────────
function firedToday(key) {
    const reminders = JSON.parse(localStorage.getItem(REMINDER_KEY) || '{}');
    const today = new Date().toISOString().split('T')[0];
    return reminders[key] === today;
}

function markFired(key) {
    const reminders = JSON.parse(localStorage.getItem(REMINDER_KEY) || '{}');
    const today = new Date().toISOString().split('T')[0];
    reminders[key] = today;
    localStorage.setItem(REMINDER_KEY, JSON.stringify(reminders));
}

// ── Main reminder checker ─────────────────────────────────────
export async function checkReminders(userId) {
    if (!userId) return;

    const hour = new Date().getHours();
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];

    // Run checks in parallel
    const [nutritionRes, scanRes, suppRes] = await Promise.allSettled([
        fetch(`${API}/daily-nutrition?userId=${userId}&date=${today}`),
        fetch(`${API}/biomarker-history?userId=${userId}&limit=1`),
        fetch(`${API}/supplements?userId=${userId}`),
    ]);

    // ── 1. Meal logging nudge (fire at noon if nothing logged) ──
    if (hour >= 12 && hour < 14 && !firedToday('meal_nudge')) {
        if (nutritionRes.status === 'fulfilled' && nutritionRes.value.ok) {
            const { data } = await nutritionRes.value.json();
            if (!data || data.calories < 100) {
                markFired('meal_nudge');
                setTimeout(() => {
                    if (Notification.permission === 'granted') {
                        showNotification('Log your meals', 'No meals logged yet today — scan your next meal to track nutrition');
                    } else {
                        showReminderToast('Log your meals', 'No meals logged yet today — tap Food to scan your next meal');
                    }
                }, 3000);
            }
        }
    }

    // ── 2. Weekly biomarker scan reminder (fire Sunday or if >7 days since last scan) ──
    if (!firedToday('scan_reminder')) {
        if (scanRes.status === 'fulfilled' && scanRes.value.ok) {
            const { scans } = await scanRes.value.json();
            const lastScan = scans?.[0];
            const daysSince = lastScan
                ? Math.floor((Date.now() - new Date(lastScan.scanned_at).getTime()) / 86400000)
                : 999;

            if (daysSince >= 7) {
                markFired('scan_reminder');
                setTimeout(() => {
                    const msg = lastScan
                        ? `Your last scan was ${daysSince} days ago — scan to track your progress`
                        : 'No biomarker scans yet — tap Scan to get your baseline scores';
                    if (Notification.permission === 'granted') {
                        showNotification('Weekly health scan', msg);
                    } else {
                        showReminderToast('Weekly health scan due', msg, 'var(--accent-blue)');
                    }
                }, 6000);
            }
        }
    }

    // ── 3. Supplement reminders (morning and evening) ──────────
    if (!firedToday('supp_morning') && hour >= 7 && hour < 10) {
        if (suppRes.status === 'fulfilled' && suppRes.value.ok) {
            const { supplements } = await suppRes.value.json();
            const morningSupps = supplements.filter(s =>
                ['daily', 'twice_daily', '3x_daily', 'morning', 'with_meals'].includes(s.frequency)
            );
            if (morningSupps.length > 0) {
                markFired('supp_morning');
                setTimeout(() => {
                    const names = morningSupps.slice(0, 3).map(s => s.name).join(', ');
                    if (Notification.permission === 'granted') {
                        showNotification('Morning supplements', `Time for: ${names}`);
                    } else {
                        showReminderToast('Morning supplements', `Time for: ${names}`, 'var(--accent-green)');
                    }
                }, 9000);
            }
        }
    }

    if (!firedToday('supp_evening') && hour >= 20 && hour < 22) {
        if (suppRes.status === 'fulfilled') {
            const { supplements } = await suppRes.value.json();
            const eveningSupps = supplements.filter(s =>
                ['before_bed', 'twice_daily', '3x_daily'].includes(s.frequency)
            );
            if (eveningSupps.length > 0) {
                markFired('supp_evening');
                setTimeout(() => {
                    const names = eveningSupps.slice(0, 3).map(s => s.name).join(', ');
                    if (Notification.permission === 'granted') {
                        showNotification('Evening supplements', `Time for: ${names}`);
                    } else {
                        showReminderToast('Evening supplements', `Time for: ${names}`, 'var(--accent-purple)');
                    }
                }, 5000);
            }
        }
    }
}

// ── Settings UI ───────────────────────────────────────────────
export function renderNotificationSettings() {
    const permission = ('Notification' in window) ? Notification.permission : 'unsupported';
    const supported = 'Notification' in window;

    return `
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Reminders</h4>
      <p style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-3);">
        Get notified to log meals, take supplements, and run weekly scans.
      </p>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3);">
        <div>
          <div style="font-size:var(--text-sm);font-weight:600;">Browser Notifications</div>
          <div style="font-size:var(--text-xs);color:var(--text-tertiary);">
            Status: <span style="color:${permission === 'granted' ? 'var(--accent-green)' : permission === 'denied' ? 'var(--accent-coral)' : 'var(--accent-amber)'};">${permission}</span>
          </div>
        </div>
        ${supported && permission !== 'granted' && permission !== 'denied' ? `
        <button class="btn btn-primary" id="enable-notifications-btn" style="font-size:var(--text-xs);">Enable</button>` : ''}
        ${permission === 'granted' ? `<span class="badge badge-green">Active</span>` : ''}
        ${permission === 'denied' ? `<span style="font-size:10px;color:var(--text-tertiary);">Enable in browser settings</span>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);">
        ${[
            ['Meal logging nudge', 'Fires at noon if no meals logged', 'var(--accent-teal)'],
            ['Supplement reminders', 'Morning (7-10am) and evening (8-10pm)', 'var(--accent-green)'],
            ['Weekly scan reminder', 'When 7+ days since last biomarker scan', 'var(--accent-blue)'],
        ].map(([title, desc, color]) => `
        <div style="display:flex;gap:var(--space-2);align-items:flex-start;">
          <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;margin-top:5px;"></div>
          <div>
            <div style="font-size:var(--text-xs);font-weight:600;">${title}</div>
            <div style="font-size:10px;color:var(--text-tertiary);">${desc}</div>
          </div>
        </div>`).join('')}
      </div>
    </div>`;
}