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
      } catch {
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
      <div class="flex justify-between items-start">
        <div class="flex items-center gap-3 flex-1" style="min-width:0;">
          <div class="rounded-md flex-center shrink-0" style="width:36px;height:36px;background:var(--accent-blue-dim);font-size:16px;">${icons.sparkle}</div>
          <div style="min-width:0;">
            <div class="text-sm font-semibold overflow-hidden" style="white-space:nowrap;text-overflow:ellipsis;">${esc(memory.meal_name)}</div>
            <div class="text-tertiary text-xs">${Math.round(Number(memory.avg_calories) || 0)} cal avg · ${Number(memory.scan_count) || 0}x scanned · ${scannedAgo}</div>
            ${foods ? `<div class="text-xs text-tertiary overflow-hidden" style="margin-top:2px;white-space:nowrap;text-overflow:ellipsis;">${esc(foods)}</div>` : ''}
          </div>
        </div>
        <div class="flex gap-2 shrink-0" style="margin-left:var(--space-2);">
          <button type="button" class="memory-quick-log text-xs rounded-md text-primary cursor-pointer font-semibold" data-id="${esc(memory.id)}" data-name="${esc(memory.meal_name)}" data-calories="${Number(memory.avg_calories) || 0}"
            style="padding:3px 8px;background:var(--accent-teal);border:none;white-space:nowrap;" aria-label="Quick log ${esc(memory.meal_name)}">
            Quick Log
          </button>
          <button type="button" class="memory-delete text-xs rounded-md text-tertiary border cursor-pointer" data-id="${esc(memory.id)}" aria-label="Remove saved meal ${esc(memory.meal_name)}"
            style="padding:3px 8px;background:transparent;">
            ✕
          </button>
        </div>
      </div>
    </div>
  `;
}
