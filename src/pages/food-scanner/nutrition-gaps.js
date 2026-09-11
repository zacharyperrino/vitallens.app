// After a meal is saved: compare today's intake with the user's targets and
// active supplements, then surface the most important gap as a toast.
import { icons } from '../../icons.js';
import { esc } from '../../utils/esc.js';
import { meals, dailyNutrition } from '../../lib/db.js';
import { apiFetch } from '../../utils/api.js';

export async function checkNutritionalGaps() {
  console.log('[NutritionalGap] Checking gaps...');
  try {
    const today = await dailyNutrition.get();
    const gaps = [];

    // Fetch personalized targets from health profile
    let targets = null; // only real targets from the user's profile — never a placeholder
    let activeSupplements = [];
    let todayMealText = '';

    try {
      const { supabase } = await import('../../lib/supabase.js');
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const [profileRes, suppRes] = await Promise.all([
          apiFetch(`/api/health-profile?userId=${user.id}`),
          apiFetch(`/api/supplements?userId=${user.id}`),
        ]);
        // Both requests must succeed: a gap computed against missing supplement
        // data would be a guess, and this feature says nothing rather than guess.
        if (!profileRes.ok || !suppRes.ok) {
          console.warn('[NutritionalGap] Profile or supplement request failed — skipping gap check');
          return;
        }
        const { profile } = await profileRes.json();
        if (profile?.target_calories) {
          targets = { calories: profile.target_calories, protein: profile.target_protein || 0, fiber: profile.target_fiber || 0, fat: profile.target_fat || 0 };
        }
        const { supplements } = await suppRes.json();
        activeSupplements = supplements || [];
        try {
          const todays = await meals.getToday?.();
          todayMealText = (todays || []).map(m => (m.name || '').toLowerCase()).join(' | ');
        } catch { /* no meals yet */ }
      }
    } catch (e) { /* no profile → no targets */ }
    if (!targets) return; // nothing to compare against — say nothing rather than guess

    // Supplement nutrient coverage map
    const SUPP_COVERS = {
      'vitamin d': ['vitamin d', 'vitamin d3', 'd3'],
      'vitamin c': ['vitamin c'],
      'vitamin b12': ['vitamin b12', 'b12', 'cobalamin'],
      'vitamin b complex': ['b vitamins', 'b complex'],
      'vitamin k2': ['vitamin k', 'k2'],
      'magnesium': ['magnesium glycinate', 'magnesium citrate', 'magnesium'],
      'zinc': ['zinc'],
      'iron': ['iron'],
      'calcium': ['calcium'],
      'omega-3': ['omega-3', 'fish oil', 'algae oil', 'dha', 'epa'],
      'protein': ['whey protein', 'protein shake', 'pea protein'],
      'fiber': ['prebiotics', 'psyllium', 'fiber'],
      'folate': ['folate', 'folic acid', 'vitamin b9'],
      'iodine': ['iodine'],
      'selenium': ['selenium'],
    };

    // Build set of what supplements cover
    const suppCovers = new Set();
    activeSupplements.forEach(s => {
      const name = (s.name || '').toLowerCase();
      Object.entries(SUPP_COVERS).forEach(([nutrient, keywords]) => {
        if (keywords.some(k => name.includes(k) || k.includes(name.split(' ')[0]))) {
          suppCovers.add(nutrient);
        }
      });
    });

    // Interaction warnings — foods that block absorption
    const INTERACTION_RISKS = [
      { supplement: 'iron', foodPatterns: ['chimichurri', 'parsley', 'tea', 'coffee', 'spinach'], risk: 'tannins and oxalates reduce iron absorption — take iron away from meals' },
      { supplement: 'calcium', foodPatterns: ['spinach', 'whole grain', 'bran'], risk: 'oxalates and phytates reduce calcium absorption' },
      { supplement: 'zinc', foodPatterns: ['whole grain', 'legumes', 'beans'], risk: 'phytates reduce zinc absorption — take on empty stomach' },
    ];

    // Check today's meals for interaction risks
    const interactionWarnings = [];
    INTERACTION_RISKS.forEach(({ supplement, foodPatterns, risk }) => {
      const takingSupp = activeSupplements.some(s => (s.name || '').toLowerCase().includes(supplement));
      const conflictingFoodToday = foodPatterns.some(p => todayMealText.includes(p));
      if (takingSupp && conflictingFoodToday) {
        interactionWarnings.push({ supplement, risk });
      }
    });

    // Gap detection with supplement awareness
    const checkGap = (nutrient, current, target, suppKey, icon, suggestion, color) => {
      if (current < target * 0.7) {
        const coveredBySupp = suppCovers.has(suppKey);
        const suppName = coveredBySupp
          ? activeSupplements.find(s => {
              const name = (s.name || '').toLowerCase();
              return (SUPP_COVERS[suppKey] || []).some(k => name.includes(k) || k.includes(name.split(' ')[0]));
            })?.name
          : null;
        gaps.push({
          nutrient,
          icon,
          current: Math.round(current),
          target,
          suggestion: coveredBySupp
            ? `Low from food — partially covered by your ${suppName} supplement`
            : suggestion,
          color: coveredBySupp ? 'var(--accent-teal)' : color,
          coveredBySupp,
          suppName,
        });
      }
    };

    checkGap('Protein', today.protein, targets.protein, 'protein', icons.activity, 'Add eggs, chicken, or Greek yogurt to your next meal', 'var(--accent-blue)');
    checkGap('Fiber', today.fiber, targets.fiber, 'fiber', icons.leaf, 'Add vegetables, beans, or fruit to your next meal', 'var(--accent-green)');
    checkGap('Healthy Fats', today.fat, targets.fat, 'omega-3', icons.droplet, 'Add avocado, nuts, or olive oil to your next meal', 'var(--accent-coral)');
    if (today.calories < targets.calories * 0.5) gaps.push({
      nutrient: 'Calories',
      icon: icons.zap,
      current: Math.round(today.calories),
      target: targets.calories,
      suggestion: 'You may be under-eating today',
      color: 'var(--accent-amber)',
      coveredBySupp: false,
    });

    if (gaps.length === 0 && interactionWarnings.length === 0) return;

    // Show interaction warning if present
    if (interactionWarnings.length > 0) {
      const warn = interactionWarnings[0];
      const container = document.getElementById('toast-container');
      if (!container) return;
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.style.cssText = 'max-width:320px;padding:var(--space-3) var(--space-4);border-left:3px solid var(--accent-amber);';
      toast.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:var(--space-2);">
          <div>
            <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);margin-bottom:2px;">
              ${warn.supplement} absorption risk
            </div>
            <div class="text-secondary text-xs">${warn.risk}</div>
          </div>
        </div>`;
      container.appendChild(toast);
      setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 6000);
    }

    if (gaps.length === 0) return;

    // Show the most important gap as a toast
    const gap = gaps[0];
    const pct = Math.round((gap.current / gap.target) * 100);

    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = `max-width:320px;padding:var(--space-3) var(--space-4);${gap.coveredBySupp ? 'border-left:3px solid var(--accent-teal);' : ''}`;
    toast.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:var(--space-2);">
        <div>
          <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);margin-bottom:2px;">
            ${gap.nutrient} gap — ${gap.current}${gap.nutrient === 'Calories' ? ' kcal' : 'g'} of ${gap.target}${gap.nutrient === 'Calories' ? ' kcal' : 'g'} (${pct}%)
          </div>
          <div class="text-secondary text-xs">${esc(gap.suggestion)}</div>
          <div style="margin-top:var(--space-2);height:4px;background:var(--surface-3);border-radius:2px;">
            <div style="width:${Math.min(100, pct)}%;height:100%;background:${gap.color};border-radius:2px;"></div>
          </div>
        </div>
      </div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 5000);

  } catch (err) {
    console.warn('[NutritionalGap] Could not check gaps:', err.message);
  }
}
