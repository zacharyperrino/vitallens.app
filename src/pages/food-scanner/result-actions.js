// Interaction handlers for the meal results view: portion sliders and save,
// confirm / replace / remove, add-missing-food search, and food corrections.
import { esc } from '../../utils/esc.js';
import { meals } from '../../lib/db.js';
import { saveFoodCorrection, savePortionCorrection, saveMealMemory } from '../../services/visionApi.js';
import { apiFetch } from '../../utils/api.js';
import { showToast } from '../../utils/toast.js';
import { renderFoodScanner } from './index.js';
import { matchTCM } from './tcm-data.js';
import { generateMealName } from './results.js';
import { checkNutritionalGaps } from './nutrition-gaps.js';

export function setupCorrectionHandlers(result) {
  const foods = result.foods?.length ? result.foods : [{ name: result.food?.name, grams: 150, confidence: 1 }];
  foods.forEach((item, i) => {
    const correctBtn = document.getElementById(`correct-btn-${i}`);
    const correctInput = document.getElementById(`correct-input-${i}`);
    const correctSave = document.getElementById(`correct-save-${i}`);
    const correctCancel = document.getElementById(`correct-cancel-${i}`);
    const correctText = document.getElementById(`correct-text-${i}`);

    correctBtn?.addEventListener('click', () => {
      correctInput.style.display = 'block';
      correctBtn.style.display = 'none';
      correctText?.focus();
    });
    correctCancel?.addEventListener('click', () => {
      correctInput.style.display = 'none';
      correctBtn.style.display = '';
      if (correctText) correctText.value = '';
    });
    correctSave?.addEventListener('click', async () => {
      const correctedLabel = correctText?.value?.trim();
      if (!correctedLabel) return;
      correctSave.disabled = true;
      correctSave.textContent = 'Saving...';
      try {
        await saveFoodCorrection(item.name, correctedLabel, {
          detectedGrams: item.grams || 150,
          confidence: item.confidence || null,
          mealContext: result.meal_description || null,
        });
      } catch (err) {
        console.warn('[Correction] Save failed:', err.message);
        correctSave.disabled = false;
        correctSave.textContent = 'Save';
        showToast("Couldn't save this correction. Check your connection and try again.");
        return;
      }
      correctInput.style.display = 'none';
      const btnContainer = correctBtn?.parentElement;
      if (btnContainer) {
        btnContainer.innerHTML = `
          <span style="font-size:var(--text-sm);color:var(--text-tertiary);text-decoration:line-through;">${esc(item.name)}</span>
          <span style="font-size:var(--text-sm);color:var(--accent-green);font-weight:var(--weight-semibold);">${esc(correctedLabel)}</span>
        `;
      }
      showToast(`Correction saved — future scans will recognize "${correctedLabel}"`);
    });
    correctText?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') correctSave?.click();
      if (e.key === 'Escape') correctCancel?.click();
    });
  });
}

export async function applyCorrectionsUI(foods) {
  try {
    const { supabase } = await import('../../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;

    const res = await apiFetch(`/api/food-corrections?userId=${user.id}&limit=50`);
    if (!res.ok) throw new Error(`Corrections request failed (${res.status})`);
    const { corrections } = await res.json();
    if (!corrections || corrections.length === 0) return;

    // Build lookup: corrected_label { detected_label, count }
    const lookup = {};
    corrections.forEach(c => {
      lookup[c.corrected_label.toLowerCase()] = {
        detected: c.detected_label,
        count: c.correction_count || 1,
      };
      // also index by detected_label for direct matches
      lookup[c.detected_label.toLowerCase()] = {
        detected: c.detected_label,
        count: c.correction_count || 1,
      };
    });

    // Badge each food item that has a known correction
    document.querySelectorAll('.portion-item').forEach((item, i) => {
      const food = foods[i];
      if (!food) return;
      const key1 = (food.label || '').toLowerCase().replace(/_/g, ' ');
      const key2 = (food.name || '').toLowerCase();
      const key3 = (food.label || '').toLowerCase();
      const match = lookup[key1] || lookup[key2] || lookup[key3];
      if (!match) return;

      const nameEl = item.querySelector('.portion-item-name');
      if (!nameEl) return;

      const isRule = match.count >= 3;
      const badge = document.createElement('span');
      badge.style.cssText = `margin-left:6px;font-size:var(--text-xs);padding:1px 5px;border-radius:3px;font-weight:700;vertical-align:middle;background:${isRule ? 'var(--accent-teal)' : 'var(--surface-3)'};color:${isRule ? 'var(--text-primary)' : 'var(--text-secondary)'};`;
      badge.title = isRule
        ? `Auto-corrected ${match.count}x — treated as rule`
        : `Corrected ${match.count}x — applied as hint`;
      badge.textContent = isRule ? `${match.count}x rule` : `${match.count}x hint`;
      nameEl.appendChild(badge);
    });
  } catch (e) {
    console.warn('[CorrectionsUI] Failed to load badges:', e.message);
  }
}

export function setupPortionSliders(result, hash = null) {
  const items = document.querySelectorAll('.portion-item');

  function recalculateTotals() {
    let totalCalories = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0, totalFiber = 0;
    items.forEach((item, i) => {
      const slider = document.getElementById(`portion-slider-${i}`);
      const checkbox = document.getElementById(`include-item-${i}`);
      const isIncluded = !checkbox || checkbox.checked;
      const grams = parseFloat(slider.value);
      const calPerG = parseFloat(item.dataset.caloriesPerG);
      const protPerG = parseFloat(item.dataset.proteinPerG);
      const carbsPerG = parseFloat(item.dataset.carbsPerG);
      const fatPerG = parseFloat(item.dataset.fatPerG);
      const fiberPerG = parseFloat(item.dataset.fiberPerG);
      const kcal = Math.round(calPerG * grams);
      const gramsDisplay = document.getElementById(`grams-display-${i}`);
      const kcalDisplay = document.getElementById(`kcal-display-${i}`);
      const isDrinkItem = item.dataset.isDrink === '1';
      if (gramsDisplay) gramsDisplay.textContent = isDrinkItem ? `${grams}ml` : `${grams}g`;
      if (kcalDisplay) kcalDisplay.textContent = isIncluded ? `${kcal} kcal` : `${kcal} kcal (excluded)`;
      if (isIncluded) {
        totalCalories += calPerG * grams;
        totalProtein += protPerG * grams;
        totalCarbs += carbsPerG * grams;
        totalFat += fatPerG * grams;
        totalFiber += fiberPerG * grams;
      }
    });
    totalCalories = Math.round(totalCalories);
    totalProtein = Math.round(totalProtein);
    totalCarbs = Math.round(totalCarbs);
    totalFat = Math.round(totalFat);
    totalFiber = Math.round(totalFiber);
    const totalMacro = totalProtein + totalCarbs + totalFat;
    const proteinPct = totalMacro ? Math.round((totalProtein / totalMacro) * 100) : 0;
    const carbsPct = totalMacro ? Math.round((totalCarbs / totalMacro) * 100) : 0;
    const fatPct = totalMacro ? 100 - proteinPct - carbsPct : 0;
    const calDisplay = document.getElementById('total-calories-display');
    if (calDisplay) calDisplay.textContent = totalCalories;
    const macroDisplay = document.getElementById('total-macro-display');
    if (macroDisplay) macroDisplay.textContent = `${totalMacro}g`;
    const proteinDisplay = document.getElementById('protein-display');
    if (proteinDisplay) proteinDisplay.textContent = `${totalProtein}g (${proteinPct}%)`;
    const carbsDisplay = document.getElementById('carbs-display');
    if (carbsDisplay) carbsDisplay.textContent = `${totalCarbs}g (${carbsPct}%)`;
    const fatDisplay = document.getElementById('fat-display');
    if (fatDisplay) fatDisplay.textContent = `${totalFat}g (${fatPct}%)`;
    const fiberDisplay = document.getElementById('fiber-display');
    if (fiberDisplay) fiberDisplay.textContent = `${totalFiber}g`;
    return { totalCalories, totalProtein, totalCarbs, totalFat, totalFiber };
  }

  items.forEach((item, i) => {
    const slider = document.getElementById(`portion-slider-${i}`);
    if (!slider) return;
    slider.addEventListener('input', recalculateTotals);
    slider.addEventListener('change', () => {
      const newGrams = parseFloat(slider.value);
      const baseGrams = parseFloat(item.dataset.baseGrams);
      const foodName = item.querySelector('.portion-item-name')?.textContent?.trim();
      if (foodName) Promise.resolve(savePortionCorrection(foodName, baseGrams, newGrams)).catch(e => console.warn('[Portion] Correction not saved:', e.message));
    });
    const checkbox = document.getElementById(`include-item-${i}`);
    if (checkbox) checkbox.addEventListener('change', recalculateTotals);
  });

  const confirmBtn = document.getElementById('confirm-save-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;margin-right:8px;"></div>Saving...';
      const totals = recalculateTotals();
      const adjustedFoods = Array.from(items).map((item, i) => {
        const slider = document.getElementById(`portion-slider-${i}`);
        const grams = slider ? parseFloat(slider.value) : 0;
        const origFood = result.foods?.[i] || {};
        return { ...origFood, grams };
      });
      try {
        await meals.log({
          name: generateMealName(result),
          calories: totals.totalCalories,
          protein: totals.totalProtein,
          carbs: totals.totalCarbs,
          fat: totals.totalFat,
          fiber: totals.totalFiber,
          confidence: result.foods?.[0]?.confidence || null,
          foods: adjustedFoods,
          healthRating: result.healthRating || null,
          digestibilityScore: result.digestibilityScore || null,
        });
        if (hash) {
          await saveMealMemory(
            hash,
            generateMealName(result),
            result.foods,
            totals.totalCalories
          );
        }
        confirmBtn.innerHTML = 'Saved to Health Log!';
        confirmBtn.style.background = 'var(--accent-green)';
        showToast('Meal saved with your adjusted portions');
        checkNutritionalGaps();

        // Update TCM constitution profile
        try {
          const tcmFoods = (result.foods || []).map(f => matchTCM(f.name || f.label || '')).filter(Boolean);
          if (tcmFoods.length > 0) {
            const { supabase } = await import('../../lib/supabase.js');
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.id) {
              await apiFetch(`/api/tcm-profile/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, foods: tcmFoods }),
              });
              console.log(`[TCMProfile] Updated with ${tcmFoods.length} foods`);
            }
          }
        } catch (tcmErr) { console.warn('[TCMProfile] Update failed:', tcmErr.message); }
        const scanAgainBtn = document.createElement('button');
        scanAgainBtn.type = 'button';
        scanAgainBtn.className = 'btn btn-outline btn-block';
        scanAgainBtn.style.marginTop = 'var(--space-2)';
        scanAgainBtn.textContent = 'Scan Another Meal';
        scanAgainBtn.addEventListener('click', () => { renderFoodScanner(); });
        confirmBtn.parentElement.appendChild(scanAgainBtn);

      } catch (err) {
        console.error('[FoodScanner] Save failed:', err.message);
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Confirm & Save to Health Log';
        showToast("Couldn't save this meal. Check your connection and try again.");
      }
    });
  }
}

export function setupItemActions(result) {
  // use global `API`

  // Confirm buttons
  document.querySelectorAll('.item-action-confirm').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = btn.dataset.index;
      const actionDiv = btn.closest('.item-actions');
      if (actionDiv) {
        actionDiv.innerHTML = `<p style="font-size:var(--text-xs);color:var(--viz-green);font-weight:600;">Confirmed</p>`;
      }
      // Uncheck hidden checkbox so item stays included
      const cb = document.getElementById(`include-item-${i}`);
      if (cb) cb.checked = true;
    });
  });

  // Replace buttons
  document.querySelectorAll('.item-action-replace').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = btn.dataset.index;
      const replaceInput = document.querySelector(`.item-replace-input[data-index="${i}"]`);
      if (replaceInput) replaceInput.style.display = 'block';
      btn.style.display = 'none';
    });
  });

  // Replace save buttons
  document.querySelectorAll('.item-replace-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = btn.dataset.index;
      const input = document.querySelector(`.item-replace-text[data-index="${i}"]`);
      const query = input?.value?.trim();
      if (!query) return;

      btn.textContent = '...';
      btn.disabled = true;

      try {
        const res = await apiFetch(`/api/nutrition/search?query=${encodeURIComponent(query)}&grams=150`);
        if (res.status === 404) {
          btn.textContent = 'Go';
          btn.disabled = false;
          showToast(`No match for "${query}" — try a simpler name like "chicken" or "rice"`);
          return;
        }
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        const nutrition = await res.json();

        // Update the portion item with new nutrition data
        const portionItem = document.querySelector(`.portion-item[data-index="${i}"]`);
        if (portionItem) {
          const grams = nutrition.grams || 150;
          portionItem.dataset.caloriesPerG = ((nutrition.calories || 0) / grams).toFixed(4);
          portionItem.dataset.proteinPerG = ((nutrition.protein || 0) / grams).toFixed(4);
          portionItem.dataset.carbsPerG = ((nutrition.carbs || 0) / grams).toFixed(4);
          portionItem.dataset.fatPerG = ((nutrition.fat || 0) / grams).toFixed(4);
          portionItem.dataset.fiberPerG = ((nutrition.fiber || 0) / grams).toFixed(4);

          // Update name display
          const nameEl = portionItem.querySelector('.portion-item-name');
          if (nameEl) nameEl.textContent = nutrition.name || query;

          // Update action area
          const actionDiv = btn.closest('.item-actions');
          if (actionDiv) actionDiv.innerHTML = `<p style="font-size:var(--text-xs);color:var(--viz-green);font-weight:600;">Replaced with ${esc(nutrition.name || query)}</p>`;

          // Save correction (best effort — the replacement itself already succeeded)
          const origFood = result.foods?.[parseInt(i)];
          if (origFood) {
            try { await saveFoodCorrection(origFood.name, query, { detectedGrams: grams, confidence: origFood.confidence }); }
            catch (corrErr) { console.warn('[Correction] Not saved:', corrErr.message); }
          }

          // Recalculate totals
          document.getElementById(`portion-slider-${i}`)?.dispatchEvent(new Event('input'));
          showToast(`Replaced with ${nutrition.name || query}`);
        }
      } catch (err) {
        console.warn('[Replace] Search failed:', err.message);
        btn.textContent = 'Go';
        btn.disabled = false;
        showToast("Couldn't search right now. Check your connection and try again.");
      }
    });
  });

  // Remove buttons
  document.querySelectorAll('.item-action-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = btn.dataset.index;
      const cb = document.getElementById(`include-item-${i}`);
      if (cb) {
        cb.checked = false;
        cb.dispatchEvent(new Event('change'));
      }
      const portionItem = document.querySelector(`.portion-item[data-index="${i}"]`);
      if (portionItem) {
        portionItem.style.opacity = '0.4';
        portionItem.style.pointerEvents = 'none';
        const actionDiv = btn.closest('.item-actions');
        if (actionDiv) {
          actionDiv.innerHTML = `<p class="text-tertiary text-xs">Removed from total <button type="button" class="item-action-undo" style="font-size:var(--text-xs);color:var(--accent-teal);background:none;border:none;cursor:pointer;">Undo</button></p>`;
          actionDiv.querySelector('.item-action-undo')?.addEventListener('click', () => {
            if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
            portionItem.style.opacity = '1';
            portionItem.style.pointerEvents = '';
            actionDiv.innerHTML = '';
          });
        }
        // The item is dimmed and inert; the Undo control must stay usable.
        if (actionDiv) actionDiv.style.pointerEvents = 'auto';
      }
    });
  });

  // Add missing food
  const addBtn = document.getElementById('add-missing-food-btn');
  const addSearch = document.getElementById('add-food-search');
  const addInput = document.getElementById('add-food-input');
  const addSearchBtn = document.getElementById('add-food-search-btn');
  const addResults = document.getElementById('add-food-results');

  addBtn?.addEventListener('click', () => {
    if (!addSearch) return;
    const opening = addSearch.style.display === 'none';
    addSearch.style.display = opening ? 'block' : 'none';
    addBtn.setAttribute('aria-expanded', String(opening));
    if (opening) addInput?.focus();
  });

  addSearchBtn?.addEventListener('click', () => searchAndAddFood(addInput?.value?.trim(), addResults, result));
  addInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchAndAddFood(addInput?.value?.trim(), addResults, result);
  });
}

async function searchAndAddFood(query, resultsDiv, result) {
  if (!query) return;
  // use global `API`
  resultsDiv.innerHTML = `<div class="text-tertiary text-xs">Searching...</div>`;

  try {
    const res = await apiFetch(`/api/nutrition/search?query=${encodeURIComponent(query)}&grams=150`);
    if (res.status === 404) {
      resultsDiv.innerHTML = `<div class="text-secondary text-xs">No match for "${esc(query)}" — try a simpler name like "chicken" or "rice"</div>`;
      return;
    }
    if (!res.ok) throw new Error(`Search failed (${res.status})`);
    const nutrition = await res.json();

    resultsDiv.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
        <div>
          <div style="font-size:var(--text-sm);font-weight:600;">${esc(nutrition.name)}</div>
          <div class="text-tertiary text-xs">${Math.round(Number(nutrition.calories) || 0)} kcal · ${Math.round(Number(nutrition.protein) || 0)}g protein · ${Math.round(Number(nutrition.carbs) || 0)}g carbs · ${Math.round(Number(nutrition.fat) || 0)}g fat</div>
        </div>
        <button type="button" id="add-food-confirm-btn" style="padding:4px 12px;border-radius:var(--radius-md);background:var(--accent-teal);color:var(--text-primary);border:none;cursor:pointer;font-size:var(--text-xs);font-weight:600;" aria-label="Add ${esc(nutrition.name)} to this meal">+ Add</button>
      </div>`;

    document.getElementById('add-food-confirm-btn')?.addEventListener('click', () => {
      // Add new portion item to the list
      const portionItems = document.getElementById('portion-items');
      const newIndex = document.querySelectorAll('.portion-item').length;
      const grams = nutrition.grams || 150;
      const newItem = document.createElement('div');
      newItem.className = 'portion-item';
      newItem.dataset.index = newIndex;
      newItem.dataset.baseGrams = grams;
      newItem.dataset.caloriesPerG = ((nutrition.calories || 0) / grams).toFixed(4);
      newItem.dataset.proteinPerG = ((nutrition.protein || 0) / grams).toFixed(4);
      newItem.dataset.carbsPerG = ((nutrition.carbs || 0) / grams).toFixed(4);
      newItem.dataset.fatPerG = ((nutrition.fat || 0) / grams).toFixed(4);
      newItem.dataset.fiberPerG = ((nutrition.fiber || 0) / grams).toFixed(4);
      newItem.innerHTML = `
        <div class="flex-between mb-2">
          <div>
            <div class="portion-item-name font-semibold text-sm">${esc(nutrition.name)}</div>
            <div style="font-size:var(--text-xs);color:var(--accent-green);">Added manually</div>
          </div>
          <div style="text-align:right;">
            <span id="grams-display-${newIndex}" style="font-family:var(--font-heading);font-size:var(--text-lg);font-weight:var(--weight-bold);color:var(--accent-teal);">${grams}g</span>
            <div id="kcal-display-${newIndex}" class="text-tertiary text-xs">${Math.round(nutrition.calories)} kcal</div>
          </div>
        </div>
        <input type="range" id="portion-slider-${newIndex}" min="20" max="600" step="5" value="${Number(grams) || 150}" aria-label="Portion size for ${esc(nutrition.name)}" style="width:100%;accent-color:var(--accent-teal);cursor:pointer;" />
        <div style="display:flex;justify-content:space-between;margin-top:var(--space-1);">
          <span class="text-tertiary text-xs">20g</span>
          <span class="text-tertiary text-xs">Taste · Small · Medium · Large · XL</span>
          <span class="text-tertiary text-xs">600g</span>
        </div>`;

      portionItems?.appendChild(newItem);

      // Wire up slider
      const slider = document.getElementById(`portion-slider-${newIndex}`);
      slider?.addEventListener('input', () => {
        const g = parseFloat(slider.value);
        const calPerG = parseFloat(newItem.dataset.caloriesPerG);
        document.getElementById(`grams-display-${newIndex}`).textContent = `${g}g`;
        document.getElementById(`kcal-display-${newIndex}`).textContent = `${Math.round(calPerG * g)} kcal`;
        // Trigger full recalculation via existing slider
        document.querySelector('.portion-item')?.querySelector('input[type=range]')?.dispatchEvent(new Event('input'));
      });

      resultsDiv.innerHTML = '';
      const addSearch = document.getElementById('add-food-search');
      if (addSearch) addSearch.style.display = 'none';
      document.getElementById('add-missing-food-btn')?.setAttribute('aria-expanded', 'false');
      const addInput = document.getElementById('add-food-input');
      if (addInput) addInput.value = '';
      showToast(`${nutrition.name} added`);
    });

  } catch (err) {
    console.warn('[AddFood] Search failed:', err.message);
    resultsDiv.innerHTML = `
      <div class="empty-state" role="alert" style="padding:var(--space-3);">
        <h3 class="text-sm">Couldn't search for foods</h3>
        <p class="text-xs">Check your connection and try again.</p>
        <button type="button" class="btn btn-sm" id="add-food-retry">Try again</button>
      </div>`;
    document.getElementById('add-food-retry')?.addEventListener('click', () => searchAndAddFood(query, resultsDiv, result));
  }
}
