// Meal result renderers: header, portion items, macros, micronutrients,
// combination cards, the correction section and the detection overlay.
import { icons } from '../../icons.js';
import { esc } from '../../utils/esc.js';
import { createDonutChart } from '../../utils/charts.js';
import { renderTCMAnalysis } from './tcm-data.js';

function renderComboCard(combo) {
  const isGood = combo.type === 'good';
  return `
    <div class="card ${isGood ? 'combo-good' : 'combo-bad'} mb-3">
      <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-2);">
        <span style="font-size:18px;">${isGood ? icons.check : icons.alert}</span>
        <h4 class="text-sm">${esc(combo.title)}</h4>
        <span class="badge ${isGood ? 'badge-green' : 'badge-coral'}" style="margin-left:auto;">${isGood ? 'Optimal' : 'Avoid'}</span>
      </div>
      <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;">${esc(combo.explanation)}</p>
    </div>
  `;
}

function renderCorrectionSection(foods, food) {
  const items = foods.length ? foods : [{ name: food.name, confidence: 1 }];
  return `
    <div class="card">
      <h4 class="mb-2">Something wrong?</h4>
      <p class="mb-3 text-secondary text-xs">Tap a food to correct it. Your corrections improve future scans.</p>
      <div class="flex-col gap-2">
        ${items.map((item, i) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
            <span class="text-sm">${esc(item.name)}</span>
            <button type="button" class="btn btn-sm btn-outline" id="correct-btn-${i}" data-detected="${esc(item.name)}" data-grams="${Number(item.grams) || 150}" data-confidence="${Number(item.confidence) || 1}" style="font-size:var(--text-xs);padding:var(--space-1) var(--space-3);" aria-label="Correct ${esc(item.name)}">Correct</button>
          </div>
          <div id="correct-input-${i}" style="display:none;padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
            <label for="correct-text-${i}" style="display:block;font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-2);">What is this food actually?</label>
            <div style="display:flex;gap:var(--space-2);">
              <input type="text" id="correct-text-${i}" placeholder="e.g. salmon fillet" style="flex:1;font-size:var(--text-sm);padding:var(--space-2);background:var(--surface-3);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);" />
              <button type="button" class="btn btn-sm btn-primary" id="correct-save-${i}" data-index="${i}">Save</button>
              <button type="button" class="btn btn-sm btn-outline" id="correct-cancel-${i}" data-index="${i}" aria-label="Cancel correction">✕</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ─── Food Results ─────────────────────────────────────────────
export function generateMealName(result) {
  // 1. Use vision meal_description if it's clean and short
  const desc = result.meal_description || '';
  if (desc && desc.length > 0 && desc.length < 60 && desc !== 'No food detected') {
    // Capitalize first letter, trim
    return desc.charAt(0).toUpperCase() + desc.slice(1).trim();
  }

  // 2. Build from individual food names — use display_name or cleaned name
  const foods = result.foods || [];
  if (foods.length === 0) return 'Scanned Meal';

  const cleanName = (name) => {
    if (!name) return '';
    return name
      .replace(/,.*$/, '')                         // drop everything after first comma
      .replace(/\b(raw|cooked|frozen|canned|dried|fresh|organic|usda|grade)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const names = foods
    .slice(0, 3)                                   // max 3 items
    .map(f => cleanName(f.name || f.display_name || f.label))
    .filter(Boolean);

  if (names.length === 0) return 'Scanned Meal';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]}, ${names[1]} & ${names[2]}`;
}

function isDrink(foodName) {
  const name = (foodName || '').toLowerCase();
  return /\b(coffee|espresso|latte|cappuccino|americano|cold brew|matcha|tea|juice|smoothie|shake|milk|water|soda|coke|pepsi|sprite|beer|wine|cocktail|whiskey|vodka|tequila|rum|kombucha|protein shake|energy drink|red bull|gatorade|sparkling water)\b/.test(name);
}

function getDrinkAnchors(foodName) {
  const name = (foodName || '').toLowerCase();
  if (/espresso|shot/.test(name)) return 'Single · Double · Triple';
  if (/wine/.test(name)) return 'Half pour · Pour · Large pour';
  if (/beer/.test(name)) return 'Half pint · Pint · Large';
  if (/whiskey|vodka|tequila|rum|spirit/.test(name)) return 'Shot · Double · Triple';
  if (/cocktail/.test(name)) return 'Small · Standard · Large';
  if (/smoothie|shake|protein/.test(name)) return 'Small · Medium · Large';
  if (/juice/.test(name)) return 'Small glass · Glass · Large glass';
  if (/coffee|latte|cappuccino|matcha|tea/.test(name)) return 'Small · Medium · Large';
  return 'Small · Medium · Large · XL';
}

function getPortionAnchors(foodName) {
  const name = (foodName || '').toLowerCase();
  if (/chicken|breast|thigh|wing/.test(name)) return '½ breast · 1 breast · Large';
  if (/steak|beef|skirt|ribeye|flank/.test(name)) return 'Small (120g) · Standard (200g) · Large (300g)';
  if (/salmon|fish|fillet|halibut|tuna/.test(name)) return 'Small fillet · Fillet · Large fillet';
  if (/shrimp|prawn/.test(name)) return 'Side · Portion · Large';
  if (/rice|quinoa/.test(name)) return 'Side · Bowl · Large bowl';
  if (/pasta|noodle|spaghetti/.test(name)) return 'Side · Portion · Large';
  if (/salad|greens|lettuce/.test(name)) return 'Side · Meal · Large';
  if (/broccoli|cauliflower|vegetable|veggie|squash|zucchini/.test(name)) return 'Side · Portion · Large';
  if (/mushroom/.test(name)) return 'Side · Portion · Large';
  if (/fries|chips/.test(name)) return 'Small · Medium · Large';
  if (/bread|toast|bagel/.test(name)) return '½ slice · 1 slice · 2 slices';
  if (/egg/.test(name)) return '1 egg · 2 eggs · 3 eggs';
  if (/sauce|dressing|dip/.test(name)) return 'Drizzle · Light · Heavy';
  if (/soup|broth/.test(name)) return 'Cup · Bowl · Large bowl';
  if (/strawberr|blueberr|raspberr|fruit|berry/.test(name)) return 'Small handful · Cup · Large cup';
  if (/apple|banana|orange|mango/.test(name)) return '½ fruit · 1 fruit · Large';
  if (/cheese/.test(name)) return 'Sprinkle · Slice · Large portion';
  if (/dumpling|gyoza|potsticker/.test(name)) return '3 pieces · 6 pieces · 10 pieces';
  if (/taco|burrito|wrap/.test(name)) return '1 piece · 2 pieces · 3 pieces';
  if (/pizza/.test(name)) return '1 slice · 2 slices · 3 slices';
  if (/cookie|muffin|pastry/.test(name)) return '½ piece · 1 piece · 2 pieces';
  if (/chocolate|candy|dessert/.test(name)) return 'Taste · Small · Standard';
  return 'Taste · Small · Medium · Large · XL';
}

export function renderFoodResults(result) {
  const { food, foods = [], combinations, healthRating, digestibilityScore } = result;
  const totalMacro = Math.round((food.protein || 0) + (food.carbs || 0) + (food.fat || 0));
  const proteinPct = totalMacro ? Math.round(((food.protein || 0) / totalMacro) * 100) : 0;
  const carbsPct = totalMacro ? Math.round(((food.carbs || 0) / totalMacro) * 100) : 0;
  const fatPct = totalMacro ? 100 - proteinPct - carbsPct : 0;

  return `
    <div class="stagger-children flex-col gap-4">
      <div class="card">
        <div class="flex-between mb-3">
          <div>
            <h3 style="font-size:var(--text-lg);margin-bottom:var(--space-1);">${esc(food.name)}</h3>
            <span class="badge badge-teal">Health Rating: ${Math.round(healthRating || 0)}/100</span>
          </div>
          <div class="text-center">
            <div id="total-calories-display" style="font-family:var(--font-heading);font-size:var(--text-3xl);font-weight:var(--weight-extrabold);color:var(--accent-teal);">${Math.round(food.calories || 0)}</div>
            <div class="text-tertiary text-xs">calories</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex-between mb-3">
          <h4>Detected Foods</h4>
          <span class="text-tertiary text-xs">Drag to adjust portions</span>
        </div>
        <div id="portion-items" class="flex-col gap-4">
          ${(foods.length ? foods : [{ name: food.name, grams: 150, confidence: 1, nutrients: { calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat, fiber: food.fiber } }]).map((item, i) => {
            const drink = isDrink(item.name || item.label);
            const baseVal = item.grams || 150;
            const sliderMin = drink ? 50 : 20;
            const sliderMax = drink ? 1000 : 600;
            const sliderStep = drink ? 10 : 5;
            const displayVal = drink ? `${baseVal}ml` : `${baseVal}g`;
            const anchors = drink ? getDrinkAnchors(item.name || item.label) : getPortionAnchors(item.name || item.label);
            const minLabel = drink ? '50ml' : '20g';
            const maxLabel = drink ? '1000ml' : '600g';
            return `
            <div class="portion-item" data-index="${i}" data-is-drink="${drink ? '1' : '0'}"
              data-base-grams="${baseVal}"
              data-calories-per-g="${((item.nutrients?.calories || 0) / baseVal).toFixed(4)}"
              data-protein-per-g="${((item.nutrients?.protein || 0) / baseVal).toFixed(4)}"
              data-carbs-per-g="${((item.nutrients?.carbs || 0) / baseVal).toFixed(4)}"
              data-fat-per-g="${((item.nutrients?.fat || 0) / baseVal).toFixed(4)}"
              data-fiber-per-g="${((item.nutrients?.fiber || 0) / baseVal).toFixed(4)}">
              <div class="flex-between mb-2">
                <div>
                  <div class="portion-item-name font-semibold text-sm">${esc(item.name)}</div>
                  <div style="font-size:var(--text-xs);color:var(--text-tertiary);display:flex;align-items:center;gap:var(--space-2);">
                    ${item.confidence ? `${(Number(item.confidence) * 100).toFixed(0)}% confidence` : ''}
                    ${item.confidence >= 0.85 ? '' :
                      item.confidence >= 0.60 ? `<span style="background:var(--viz-amber);color:var(--text-primary);font-size:var(--text-xs);padding:1px 6px;border-radius:4px;font-weight:600;">Uncertain</span>` :
                        `<span style="background:var(--error);color:var(--text-inverse);font-size:var(--text-xs);padding:1px 6px;border-radius:4px;font-weight:600;">Low confidence</span>`}
                  </div>
                </div>
                <div style="text-align:right;">
                  <span id="grams-display-${i}" style="font-family:var(--font-heading);font-size:var(--text-lg);font-weight:var(--weight-bold);color:var(--accent-teal);">${displayVal}</span>
                  <div id="kcal-display-${i}" class="text-tertiary text-xs">${Math.round(item.nutrients?.calories || 0)} kcal</div>
                </div>
              </div>
              <input type="range" id="portion-slider-${i}" min="${sliderMin}" max="${sliderMax}" step="${sliderStep}" value="${Number(baseVal) || 150}" aria-label="Portion size for ${esc(item.name)}" style="width:100%;accent-color:var(--accent-teal);cursor:pointer;" />
              <div style="display:flex;justify-content:space-between;margin-top:var(--space-1);">
                <span class="text-tertiary text-xs">${minLabel}</span>
                <span class="text-tertiary text-xs">${anchors}</span>
                <span class="text-tertiary text-xs">${maxLabel}</span>
              </div>
              ${item.confidence < 0.85 ? `
<div class="item-actions" style="margin-top:var(--space-2);padding:var(--space-2);background:${item.confidence < 0.60 ? 'var(--error-dim)' : 'var(--surface-2)'};border-radius:var(--radius-md);">
  <p style="font-size:var(--text-xs);color:${item.confidence < 0.60 ? 'var(--error)' : 'var(--viz-amber)'};margin-bottom:var(--space-2);font-weight:600;">
    ${item.confidence < 0.60 ? 'Low confidence — is this correct?' : 'Uncertain — confirm or correct'}
  </p>
  <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;">
    <button type="button" class="item-action-confirm" data-index="${i}" style="flex:1;font-size:var(--text-xs);padding:4px 8px;border-radius:var(--radius-md);border:1px solid var(--viz-green);color:var(--viz-green);background:transparent;cursor:pointer;font-weight:600;" aria-label="Confirm ${esc(item.name)} is correct">Correct</button>
    <button type="button" class="item-action-replace" data-index="${i}" style="flex:1;font-size:var(--text-xs);padding:4px 8px;border-radius:var(--radius-md);border:1px solid var(--viz-amber);color:var(--viz-amber);background:transparent;cursor:pointer;font-weight:600;" aria-label="Replace ${esc(item.name)}">Replace</button>
    <button type="button" class="item-action-remove" data-index="${i}" style="flex:1;font-size:var(--text-xs);padding:4px 8px;border-radius:var(--radius-md);border:1px solid var(--error);color:var(--error);background:transparent;cursor:pointer;font-weight:600;" aria-label="Remove ${esc(item.name)} from this meal">Remove</button>
  </div>
  <div class="item-replace-input" data-index="${i}" style="display:none;margin-top:var(--space-2);">
    <div style="display:flex;gap:var(--space-2);">
      <input type="text" class="item-replace-text" data-index="${i}" placeholder="What is this food?" aria-label="Replacement food name" style="flex:1;font-size:var(--text-xs);padding:var(--space-2);background:var(--surface-3);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);">
      <button type="button" class="item-replace-save" data-index="${i}" style="font-size:var(--text-xs);padding:4px 10px;border-radius:var(--radius-md);background:var(--accent-teal);color:var(--text-primary);border:none;cursor:pointer;font-weight:600;">Go</button>
    </div>
  </div>
  <input type="checkbox" id="include-item-${i}" checked aria-hidden="true" tabindex="-1" style="display:none;">
</div>` : ''}
            </div>
          `; }).join('')}
        </div>
        <div style="margin-top:var(--space-3);border-top:1px solid var(--border);padding-top:var(--space-3);">
  <div id="add-food-search" style="display:none;margin-bottom:var(--space-2);">
    <div style="display:flex;gap:var(--space-2);">
      <label for="add-food-input" class="visually-hidden">Search for a food to add</label>
      <input type="text" id="add-food-input" placeholder="Search for a food to add..." style="flex:1;font-size:var(--text-sm);padding:var(--space-2) var(--space-3);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);">
      <button type="button" id="add-food-search-btn" style="padding:var(--space-2) var(--space-3);border-radius:var(--radius-md);background:var(--accent-teal);color:var(--text-primary);border:none;cursor:pointer;font-size:var(--text-xs);font-weight:600;">Search</button>
    </div>
    <div id="add-food-results" aria-live="polite" class="flex-col gap-2 mt-2"></div>
  </div>
  <button type="button" id="add-missing-food-btn" aria-expanded="false" aria-controls="add-food-search" style="width:100%;padding:var(--space-2);border-radius:var(--radius-md);border:1px dashed var(--border);background:transparent;color:var(--text-secondary);font-size:var(--text-xs);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:var(--space-2);">
    <span style="font-size:16px;" aria-hidden="true">+</span> Add missing food
  </button>
</div>
      </div>

      <div class="card">
        <h4 class="mb-4">Macronutrients</h4>
        <div style="display:flex;align-items:center;gap:var(--space-5);">
          <div class="chart-container" style="flex-shrink:0;">
            ${createDonutChart([
          { percent: proteinPct, color: 'var(--accent-blue)' },
          { percent: carbsPct, color: 'var(--accent-amber)' },
          { percent: fatPct, color: 'var(--accent-coral)' },
        ], 100, 10)}
            <div class="chart-center-label">
              <div class="value" id="total-macro-display" style="font-size:var(--text-md);">${totalMacro}g</div>
              <div class="label">total</div>
            </div>
          </div>
          <div class="flex-1">
            <div class="nutrient-row">
              <div class="nutrient-info"><div class="nutrient-dot" style="background:var(--accent-blue);"></div><span class="nutrient-name">Protein</span></div>
              <span class="nutrient-value" id="protein-display">${Math.round(food.protein || 0)}g (${proteinPct}%)</span>
            </div>
            <div class="nutrient-row">
              <div class="nutrient-info"><div class="nutrient-dot" style="background:var(--accent-amber);"></div><span class="nutrient-name">Carbs</span></div>
              <span class="nutrient-value" id="carbs-display">${Math.round(food.carbs || 0)}g (${carbsPct}%)</span>
            </div>
            <div class="nutrient-row">
              <div class="nutrient-info"><div class="nutrient-dot" style="background:var(--accent-coral);"></div><span class="nutrient-name">Fat</span></div>
              <span class="nutrient-value" id="fat-display">${Math.round(food.fat || 0)}g (${fatPct}%)</span>
            </div>
            ${food.fiber ? `
            <div class="nutrient-row">
              <div class="nutrient-info"><div class="nutrient-dot" style="background:var(--accent-green);"></div><span class="nutrient-name">Fiber</span></div>
              <span class="nutrient-value" id="fiber-display">${Math.round(food.fiber || 0)}g</span>
            </div>` : ''}
          </div>
        </div>
      </div>

      ${food.micronutrients && food.micronutrients.length > 0 ? `
      <div class="card">
        <h4 class="mb-3">Micronutrients</h4>
        ${food.micronutrients.map(m => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) 0;">
            <span class="text-secondary text-sm">${esc(m.name)}</span>
            <div style="display:flex;align-items:center;gap:var(--space-3);">
              <span class="font-semibold text-sm">${esc(m.amount)}</span>
              <div style="width:60px;"><div class="progress-bar" style="height:4px;"><div class="progress-fill" style="width:${Math.min(100, Number(m.rda) || 0)}%;background:${m.rda >= 80 ? 'var(--viz-green)' : m.rda >= 40 ? 'var(--viz-amber)' : 'var(--error)'}"></div></div></div>
              <span style="font-size:var(--text-xs);color:var(--text-tertiary);min-width:32px;text-align:right;">${Number(m.rda) || 0}%</span>
            </div>
          </div>
        `).join('')}
        <p class="mt-3 text-center text-tertiary text-xs">% of Recommended Daily Allowance</p>
      </div>` : ''}

      <div class="card">
        <div class="flex-between">
          <div>
            <h4 class="mb-1">Digestibility Score</h4>
            <p class="text-xs">How easily your body can process this meal</p>
          </div>
          <div style="font-family:var(--font-heading);font-size:var(--text-2xl);font-weight:var(--weight-bold);color:${(digestibilityScore || 0) >= 80 ? 'var(--accent-green)' : 'var(--accent-amber)'};">${Math.round(digestibilityScore || 0)}%</div>
        </div>
      </div>

      <div class="section-heading"><h3>Food Combination Analysis</h3></div>
      ${(combinations || []).map(c => renderComboCard(c)).join('')}

      <div class="section-heading"><h3>Eastern Medicinal Analysis</h3></div>
      ${renderTCMAnalysis(foods)}
      <div id="tcm-constitution-card"></div>

      <button type="button" id="confirm-save-btn" class="btn btn-primary btn-block mt-2">
        Confirm & Save to Health Log
      </button>
      <p style="font-size:var(--text-xs);color:var(--text-tertiary);text-align:center;margin-top:calc(-1 * var(--space-2));">
        Adjust portions above before saving
      </p>
      ${renderCorrectionSection(foods, food)}
    </div>
  `;
}

export function drawDetectionOverlay(imgEl, foods) {
  const canvas = document.getElementById('food-box-overlay');
  if (!canvas || !imgEl || !foods?.length) return;
  const rect = imgEl.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Canvas can't resolve CSS variables, so read the tokens off :root.
  const rootStyle = getComputedStyle(document.documentElement);
  const boxColor = rootStyle.getPropertyValue('--accent').trim() || rootStyle.getPropertyValue('--viz-green').trim();
  const labelText = rootStyle.getPropertyValue('--text-inverse').trim();
  ctx.lineWidth = 2;
  ctx.font = '12px sans-serif';
  foods.forEach(item => {
    const box = item.box;
    if (!Array.isArray(box) || box.length < 4) return;
    const x = box[0] * canvas.width;
    const y = box[1] * canvas.height;
    const w = (box[2] - box[0]) * canvas.width;
    const h = (box[3] - box[1]) * canvas.height;
    ctx.strokeStyle = boxColor;
    ctx.strokeRect(x, y, w, h);
    const label = `${item.name} ${item.grams || '?'}g`;
    ctx.fillStyle = boxColor;
    ctx.fillRect(x, y - 16, ctx.measureText(label).width + 10, 16);
    ctx.fillStyle = labelText;
    ctx.fillText(label, x + 5, y - 4);
  });
}
