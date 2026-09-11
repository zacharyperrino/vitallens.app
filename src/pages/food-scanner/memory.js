// Saved-meal ("meal memory") cards and their quick-log / delete handlers.
import { icons } from '../../icons.js';
import { esc } from '../../utils/esc.js';
import { meals } from '../../lib/db.js';
import { apiFetch } from '../../utils/api.js';
import { showToast } from '../../utils/toast.js';
import { daysSince } from '../../utils/dates.js';

export function setupMemoryHandlers() {
  // Quick Log
  document.querySelectorAll('.memory-quick-log').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name;
      const calories = parseFloat(btn.dataset.calories) || 0;
      btn.disabled = true;
      btn.textContent = 'Logging...';
      try {
        await meals.log({
          name,
          calories,
          protein: 0, carbs: 0, fat: 0, fiber: 0,
          confidence: null, foods: [], healthRating: null,
        });
        btn.textContent = 'Logged';
        btn.style.background = 'var(--accent-green)';
        showToast(`${name} logged — ${Math.round(calories)} cal`);
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Quick Log';
        showToast("Couldn't log this meal. Please try again.");
      }
    });
  });

  // Delete
  document.querySelectorAll('.memory-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      try {
        const { supabase } = await import('../../lib/supabase.js');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const res = await apiFetch(`/api/meal-memory/${encodeURIComponent(id)}?userId=${user.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`Delete failed (${res.status})`);
        document.getElementById(`memory-card-${id}`)?.remove();
        showToast('Saved meal removed');
      } catch (e) {
        console.warn('[MealMemory] Delete failed:', e.message);
        showToast("Couldn't remove this saved meal. Please try again.");
      }
    });
  });
}

export function renderMemoryCard(memory) {
  const scannedAgo = memory.last_scanned_at
    ? (() => {
        const days = daysSince(memory.last_scanned_at);
        if (days === 0) return 'Today';
        if (days === 1) return 'Yesterday';
        return `${days} days ago`;
      })()
    : '';
  const foods = Array.isArray(memory.foods) ? memory.foods.slice(0, 3).map(f => f.name || f.label || '').filter(Boolean).join(', ') : '';

  return `
    <div class="card card-sm" id="memory-card-${esc(memory.id)}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="display:flex;align-items:center;gap:var(--space-3);flex:1;min-width:0;">
          <div style="width:36px;height:36px;border-radius:var(--radius-md);background:var(--accent-blue-dim);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">${icons.sparkle}</div>
          <div style="min-width:0;">
            <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(memory.meal_name)}</div>
            <div class="text-tertiary text-xs">${Math.round(Number(memory.avg_calories) || 0)} cal avg · ${Number(memory.scan_count) || 0}x scanned · ${scannedAgo}</div>
            ${foods ? `<div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(foods)}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:var(--space-2);flex-shrink:0;margin-left:var(--space-2);">
          <button type="button" class="memory-quick-log" data-id="${esc(memory.id)}" data-name="${esc(memory.meal_name)}" data-calories="${Number(memory.avg_calories) || 0}"
            style="font-size:var(--text-xs);padding:3px 8px;border-radius:var(--radius-md);background:var(--accent-teal);color:var(--text-primary);border:none;cursor:pointer;font-weight:600;white-space:nowrap;" aria-label="Quick log ${esc(memory.meal_name)}">
            Quick Log
          </button>
          <button type="button" class="memory-delete" data-id="${esc(memory.id)}" aria-label="Remove saved meal ${esc(memory.meal_name)}"
            style="font-size:var(--text-xs);padding:3px 8px;border-radius:var(--radius-md);background:transparent;color:var(--text-tertiary);border:1px solid var(--border);cursor:pointer;">
            ✕
          </button>
        </div>
      </div>
    </div>
  `;
}
