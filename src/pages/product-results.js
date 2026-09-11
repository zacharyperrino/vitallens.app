// ─── Product Results Page ────────────────────────────────────
// Displays detailed product analysis: score badge, nutrition table,
// ingredients with flagged additives, and positives/negatives.

import { icons } from '../icons.js';
import { esc } from '../utils/esc.js';
import { getScoreColor, getScoreLabel } from '../utils/product-scanner.js';
import { createDonutChart } from '../utils/charts.js';
import { apiFetch } from '../utils/api.js';
import { meals } from '../lib/db.js';

const RISK_LEVELS = new Set(['high', 'moderate', 'low']);
// Additive risk levels come from a third-party service; only known values
// are allowed into class names and badge styles.
function riskLevel(additive) {
  const r = String(additive?.risk_level || '').toLowerCase();
  return RISK_LEVELS.has(r) ? r : null;
}

/**
 * Render product detail results.
 * Called with product data stored in sessionStorage or passed via hash params.
 */
export function renderProductResults() {
  const content = document.getElementById('page-content');
  const data = window._lastProductScan;

  if (!data) {
    content.innerHTML = `
      <div class="food-scanner stagger-children">
        <div class="empty-state">
          <div style="color:var(--text-tertiary);display:flex;justify-content:center;">${icons.scan}</div>
          <h3>No product to show</h3>
          <p>Scan a product barcode or nutrition label and its results will appear here.</p>
          <button type="button" class="btn btn-primary" id="product-results-go-scanner">Go to Scanner</button>
        </div>
      </div>`;
    document.getElementById('product-results-go-scanner')?.addEventListener('click', () => { location.hash = '#/food-scanner'; });
    return;
  }

  const { product = {}, additives } = data;
  const healthScore = data.healthScore || {};
  const n = product.nutrition || {};
  // A missing score is shown as missing — never as 0.
  const hasScore = healthScore.score !== null && healthScore.score !== undefined && healthScore.score !== '' && Number.isFinite(Number(healthScore.score));
  const score = hasScore ? Number(healthScore.score) : null;
  // Colour always comes from our own token scale — never from the API payload.
  const scoreColor = hasScore ? getScoreColor(score) : 'var(--text-tertiary)';
  const scoreLabel = hasScore ? (healthScore.rating || getScoreLabel(score)) : 'Score unavailable';

  // Macro percentages for chart
  const totalMacro = Math.round(((Number(n.protein) || 0) + (Number(n.carbs) || 0) + (Number(n.fat) || 0)) * 10) / 10;
  const pPct = totalMacro ? Math.round(((Number(n.protein) || 0) / totalMacro) * 100) : 0;
  const cPct = totalMacro ? Math.round(((Number(n.carbs) || 0) / totalMacro) * 100) : 0;
  const fPct = totalMacro ? 100 - pPct - cPct : 0;

  // Flag ingredients with additives
  const analyzedAdditives = Array.isArray(additives?.analyzed) ? additives.analyzed : [];
  const scoredIngredients = renderScoredIngredients(product.ingredients, analyzedAdditives, product.ingredients_analysis);

  // Analysis badges from OFF
  const analysis = product.ingredients_analysis;
  const analysisBadges = analysis ? [
    analysis.hasPalmOil ? `<span class="badge badge-coral">Palm Oil</span>` : '',
    analysis.isVegan === true ? `<span class="badge badge-green">Vegan</span>` : analysis.isVegan === false ? `<span class="badge badge-amber">Non-Vegan</span>` : '',
    analysis.isVegetarian === true ? `<span class="badge badge-green">Vegetarian</span>` : analysis.isVegetarian === false ? `<span class="badge badge-coral">Non-Vegetarian</span>` : '',
    analysis.isOrganic === true ? `<span class="badge badge-green">Organic</span>` : '',
  ].filter(Boolean).join('') : '';

  const nutriGrade = String(product.nutriscore || '').toUpperCase();
  const nutriBadge = /^[A-E]$/.test(nutriGrade)
    ? `<span class="badge" style="background:${getNutriScoreColor(nutriGrade)};color:var(--text-inverse);">NutriScore ${nutriGrade}</span>`
    : '';
  const nova = Number(product.nova_group);
  const novaBadge = nova >= 1 && nova <= 4
    ? `<span class="badge badge-${nova <= 2 ? 'green' : nova <= 3 ? 'amber' : 'coral'}">NOVA ${nova}</span>`
    : '';

  const summary = additives?.summary || {};
  const additiveCount = Number(summary.total) || analyzedAdditives.length;
  const servingSize = Number(n.serving_size) > 0 ? Number(n.serving_size) : 100;

  content.innerHTML = `
    <div class="food-scanner stagger-children">
      <button type="button" id="product-results-back" style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-4);cursor:pointer;padding:0;">
        <span aria-hidden="true" style="color:var(--text-tertiary);transform:rotate(180deg);display:inline-block;">${icons.chevronRight}</span>
        <span class="text-sm text-tertiary">Back to Scanner</span>
      </button>

      <!-- Product Header + Score Badge -->
      <div class="card product-header-card">
        <div style="display:flex;gap:var(--space-4);align-items:center;">
          <div class="product-score-badge" style="--score-color:${scoreColor};" role="img" aria-label="${hasScore ? `Wellness score ${score} out of 100, ` : ''}${esc(scoreLabel)}">
            <div class="product-score-value">${hasScore ? score : '—'}</div>
            <div class="product-score-label">${esc(scoreLabel)}</div>
          </div>
          <div class="flex-1">
            <h2 style="font-size:var(--text-lg);margin-bottom:var(--space-1);">${esc(product.name || 'Unnamed product')}</h2>
            ${product.brand ? `<p class="text-secondary text-sm">${esc(product.brand)}</p>` : ''}
            <div style="display:flex;gap:var(--space-2);margin-top:var(--space-2);flex-wrap:wrap;">
              ${nutriBadge}
              ${novaBadge}
              ${analysisBadges}
            </div>
          </div>
        </div>
      </div>

      <!-- Positives & Negatives -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
        <div class="card" style="border-left:3px solid var(--viz-green);">
          <h4 style="font-size:var(--text-xs);color:var(--viz-green);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:var(--space-2);">Positives</h4>
          ${(healthScore.positives || []).map(p => `<p class="mb-1 text-secondary text-xs">• ${esc(p)}</p>`).join('') || '<p class="text-tertiary text-xs">None noted</p>'}
        </div>
        <div class="card" style="border-left:3px solid var(--error);">
          <h4 style="font-size:var(--text-xs);color:var(--error);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:var(--space-2);">Negatives</h4>
          ${(healthScore.negatives || []).map(m => `<p class="mb-1 text-secondary text-xs">• ${esc(m)}</p>`).join('') || '<p class="text-tertiary text-xs">None noted</p>'}
        </div>
      </div>

      <!-- Nutrition per 100g -->
      <div class="card">
        <div class="flex-between mb-4">
          <h4>Nutrition per 100g</h4>
          <span style="font-family:var(--font-heading);font-size:var(--text-2xl);font-weight:var(--weight-extrabold);color:var(--accent-teal);">${n.calories != null ? Math.round(Number(n.calories) || 0) : '—'} <span style="font-size:var(--text-xs);font-weight:var(--weight-normal);color:var(--text-tertiary);">kcal</span></span>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-5);">
          <div class="chart-container" style="flex-shrink:0;">
            ${totalMacro > 0 ? createDonutChart([
    { percent: pPct, color: 'var(--accent-blue)' },
    { percent: cPct, color: 'var(--accent-amber)' },
    { percent: fPct, color: 'var(--accent-coral)' },
  ], 100, 10) : '<div style="width:100px;height:100px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-size:var(--text-xs);color:var(--text-tertiary);">No data</div>'}
            ${totalMacro > 0 ? `<div class="chart-center-label"><div class="value" style="font-size:var(--text-md);">${totalMacro}g</div><div class="label">total</div></div>` : ''}
          </div>
          <div class="flex-1">
            ${renderNutrientRow('Protein', n.protein, 'g', pPct, 'var(--accent-blue)')}
            ${renderNutrientRow('Carbs', n.carbs, 'g', cPct, 'var(--accent-amber)')}
            ${renderNutrientRow('  Sugar', n.sugar, 'g', null, 'var(--accent-coral)')}
            ${renderNutrientRow('Fat', n.fat, 'g', fPct, 'var(--accent-coral)')}
            ${renderNutrientRow('  Sat. Fat', n.saturated_fat, 'g', null, 'var(--error)')}
            ${renderNutrientRow('Fiber', n.fiber, 'g', null, 'var(--accent-green)')}
            ${renderNutrientRow('Sodium', n.sodium, 'mg', null, 'var(--text-secondary)')}
          </div>
        </div>
      </div>

      <!-- Ingredients & Additives -->
      <div class="card">
        <button type="button" id="ingredients-toggle" aria-expanded="true" aria-controls="ingredients-body" style="display:flex;justify-content:space-between;align-items:center;width:100%;margin-bottom:var(--space-3);cursor:pointer;padding:0;text-align:left;">
          <h4>Ingredients</h4>
          <span id="ingredients-chevron" aria-hidden="true" style="color:var(--text-tertiary);font-size:var(--text-xs);display:inline-block;transform:rotate(90deg);transition:transform 0.2s;">${icons.chevronRight}</span>
        </button>
        <div id="ingredients-body" class="expandable-section">
          <p style="font-size:var(--text-sm);color:var(--text-secondary);line-height:1.6;">${scoredIngredients}</p>
        </div>
      </div>

      <!-- Additive Analysis -->
      ${analyzedAdditives.length > 0 ? `
      <div class="card">
        <h4 class="mb-3">Additives (${additiveCount})</h4>
        <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-3);flex-wrap:wrap;">
          ${Number(summary.high) > 0 ? `<span class="badge badge-coral">${Number(summary.high)} high risk</span>` : ''}
          ${Number(summary.moderate) > 0 ? `<span class="badge badge-amber">${Number(summary.moderate)} moderate</span>` : ''}
          ${Number(summary.low) > 0 ? `<span class="badge badge-green">${Number(summary.low)} low risk</span>` : ''}
        </div>
        ${analyzedAdditives.map(a => {
          const level = riskLevel(a);
          return `
          <div class="additive-row ${level ? `additive-${level}` : ''}">
            <div style="display:flex;align-items:center;gap:var(--space-2);">
              <span class="additive-risk-dot ${level ? `additive-dot-${level}` : ''}" aria-hidden="true"></span>
              <span class="font-semibold text-sm">${esc(a.code)}</span>
              <span class="text-secondary text-sm">${esc(a.name)}</span>
            </div>
            <span class="badge badge-${level === 'high' ? 'coral' : level === 'moderate' ? 'amber' : 'green'} text-xs">${level ? `${level} risk` : 'unrated'}</span>
          </div>`;
        }).join('')}
      </div>
      ` : ''}

      <!-- Log to Food Diary -->
      <div class="card text-center">
        <p class="mb-3 text-secondary text-xs">Add this product to today's food log and daily nutrition totals.</p>
        <div class="flex-center gap-2 mb-3">
          <label for="product-serving-size" class="text-secondary text-xs">Serving size (g)</label>
          <input type="number" id="product-serving-size" value="${servingSize}" min="1" max="2000" step="1" inputmode="numeric"
            style="width:80px;padding:4px 8px;border-radius:var(--radius-md);border:1px solid var(--border);background:var(--surface-2);color:var(--text-primary);font-size:var(--text-sm);text-align:center;">
        </div>
        <button type="button" id="log-product-btn" class="btn btn-primary btn-block">Log to Food Diary</button>
        <div id="log-product-status" role="status" aria-live="polite" style="display:none;margin-top:var(--space-2);font-size:var(--text-xs);color:var(--viz-green);"></div>
      </div>

      <p class="disclaimer" style="text-align:center;padding:var(--space-3) var(--space-4);">
        This score is for informational purposes and does not constitute medical or dietary advice.
        Data sourced from Open Food Facts. Always consult a healthcare professional.
      </p>
    </div>
  `;

  document.getElementById('product-results-back')?.addEventListener('click', () => { location.hash = '#/food-scanner'; });

  // Setup toggle
  setupExpandables();

  // Setup log button
  document.getElementById('log-product-btn')?.addEventListener('click', () => logProductToFoodLog(product, n));
}

async function logProductToFoodLog(product, n) {
  const btn = document.getElementById('log-product-btn');
  const status = document.getElementById('log-product-status');
  if (!btn || !status) return;
  const servingSize = parseFloat(document.getElementById('product-serving-size')?.value) || 100;
  const scale = servingSize / 100; // nutrition is per 100g

  btn.disabled = true;
  btn.textContent = 'Logging...';

  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('not signed in');

    const calories = Math.round((Number(n.calories) || 0) * scale);
    const protein = Math.round((Number(n.protein) || 0) * scale * 10) / 10;
    const carbs = Math.round((Number(n.carbs) || 0) * scale * 10) / 10;
    const fat = Math.round((Number(n.fat) || 0) * scale * 10) / 10;
    const fiber = Math.round((Number(n.fiber) || 0) * scale * 10) / 10;
    const mealName = `${product.brand ? product.brand + ' ' : ''}${product.name || 'Scanned product'}`;

    // Write the meals row — this is the write that counts as "logged". The
    // shared helper also increments today's daily_nutrition totals and fires
    // the /api/ingest event (non-blocking), same path the meal scanner uses.
    await meals.log({
      name: mealName,
      calories,
      protein,
      carbs,
      fat,
      fiber,
      foods: [{ name: product.name, grams: servingSize }],
    });

    // Meal memory is a follow-up: if it fails the meal is still logged, so
    // only warn rather than report a failure that would invite a duplicate log.
    try {
      const memRes = await apiFetch(`/api/meal-memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          hash: `product-${product.barcode || product.name}`,
          mealName,
          foods: [{ name: product.name, grams: servingSize }],
          calories,
        }),
      });
      if (!memRes.ok) console.warn('[ProductLog] Meal memory not saved:', memRes.status);
    } catch (memErr) {
      console.warn('[ProductLog] Meal memory not saved:', memErr?.message || memErr);
    }

    btn.textContent = 'Logged';
    btn.style.background = 'var(--viz-green)';
    status.style.display = 'block';
    status.style.color = 'var(--viz-green)';
    status.textContent = `${mealName} — ${calories} cal logged to today`;
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Log to Food Diary';
    console.error('[ProductLog] Failed:', err?.message || err);
    status.style.display = 'block';
    status.style.color = 'var(--error)';
    status.textContent = /not signed in/i.test(err?.message || '')
      ? 'Please sign in to log products to your food diary.'
      : "Couldn't log this product. Check your connection and try again.";
  }
}

function renderNutrientRow(label, value, unit, pct, color) {
  const num = value != null && value !== '' ? Number(value) : NaN;
  const rounded = Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
  const displayValue = rounded != null ? `${rounded}${unit}` : '—';
  return `
    <div class="nutrient-row" style="padding:var(--space-1) 0;">
      <div class="nutrient-info">
        <div class="nutrient-dot" style="background:${color};" aria-hidden="true"></div>
        <span class="nutrient-name">${label}</span>
      </div>
      <span class="nutrient-value">${displayValue}${pct != null ? ` (${pct}%)` : ''}</span>
    </div>`;
}

// ── Ingredient Health Classifier ─────────────────────────────

const INGREDIENT_RED = [
  'high fructose corn syrup', 'hfcs', 'corn syrup', 'hydrogenated',
  'partially hydrogenated', 'trans fat', 'artificial flavor', 'artificial colour',
  'artificial color', 'sodium nitrate', 'sodium nitrite', 'bha', 'bht',
  'potassium bromate', 'brominated vegetable oil', 'propyl gallate',
  'monosodium glutamate', 'msg', 'aspartame', 'saccharin', 'acesulfame',
  'sucralose', 'refined sugar', 'white sugar', 'sugar syrup', 'glucose syrup',
  'fructose syrup', 'dextrose', 'maltodextrin', 'modified starch',
  'bleached flour', 'enriched flour', 'white flour', 'soybean oil',
  'canola oil', 'cottonseed oil', 'vegetable shortening', 'palm oil',
  'sodium benzoate', 'potassium sorbate', 'calcium propionate',
  'red 40', 'yellow 5', 'yellow 6', 'blue 1', 'blue 2', 'caramel color',
];

const INGREDIENT_GREEN = [
  'water', 'organic', 'whole grain', 'whole wheat', 'oats', 'oat',
  'olive oil', 'extra virgin', 'avocado oil', 'coconut oil',
  'almonds', 'almond', 'walnuts', 'walnut', 'cashews', 'pecans',
  'flaxseed', 'chia', 'quinoa', 'lentils', 'chickpeas', 'black beans',
  'tomato', 'tomatoes', 'spinach', 'kale', 'broccoli', 'garlic',
  'onion', 'ginger', 'turmeric', 'cinnamon', 'apple cider vinegar',
  'lemon juice', 'lime juice', 'sea salt', 'himalayan salt',
  'honey', 'maple syrup', 'stevia', 'eggs', 'egg', 'milk', 'cream',
  'butter', 'cheese', 'yogurt', 'whey protein', 'pea protein',
  'sunflower seeds', 'pumpkin seeds', 'sesame', 'tahini',
  'apple', 'banana', 'berries', 'blueberry', 'strawberry',
  'vinegar', 'yeast', 'baking soda', 'baking powder', 'vanilla',
  'cocoa', 'dark chocolate', 'green tea', 'black tea',
];

function scoreIngredient(ingredient, analyzedAdditives) {
  const clean = ingredient.toLowerCase().trim().replace(/[*()[\]]/g, '');
  if (!clean) return null;

  // Check if it's a flagged additive (E-number)
  const eMatch = clean.match(/\be\d{3,4}[a-z]?\b/i);
  if (eMatch) {
    const code = eMatch[0].toUpperCase();
    const additive = analyzedAdditives.find(a => String(a?.code || '').toUpperCase() === code);
    if (additive) {
      const level = riskLevel(additive);
      return {
        text: ingredient.trim(),
        score: level === 'high' ? 'red' : 'yellow',
        reason: `${additive.name || code} — ${level ? `${level} risk` : 'unrated'}`,
      };
    }
    return { text: ingredient.trim(), score: 'yellow', reason: 'Additive' };
  }

  // Check red list
  for (const bad of INGREDIENT_RED) {
    if (clean.includes(bad)) {
      return { text: ingredient.trim(), score: 'red', reason: bad };
    }
  }

  // Check green list
  for (const good of INGREDIENT_GREEN) {
    if (clean.includes(good)) {
      return { text: ingredient.trim(), score: 'green', reason: good };
    }
  }

  // Default neutral
  return { text: ingredient.trim(), score: 'yellow', reason: null };
}

// Each status has a colour, a visible glyph, and a word for screen readers,
// so the classification is never carried by colour alone.
const INGREDIENT_STATUS = {
  red:    { bg: 'var(--error-dim)',     border: 'var(--error)',     text: 'var(--error)',     glyph: '!', word: 'flagged' },
  yellow: { bg: 'var(--viz-amber-dim)', border: 'var(--viz-amber)', text: 'var(--viz-amber)', glyph: '',  word: 'neutral' },
  green:  { bg: 'var(--viz-green-dim)', border: 'var(--viz-green)', text: 'var(--viz-green)', glyph: '✓', word: 'no flags' },
};

function renderScoredIngredients(ingredientsText, analyzedAdditives, analysis) {
  const notListed = '<em class="text-tertiary">Not listed by manufacturer</em>';
  if (!ingredientsText || typeof ingredientsText !== 'string') return notListed;

  const ingredients = ingredientsText.split(/,(?![^(]*\))/).filter(i => i.trim());
  if (ingredients.length === 0) return notListed;

  const scored = ingredients.map(i => {
    const s = scoreIngredient(i, analyzedAdditives);
    // Enrich with OFF analysis — flag palm oil red if confirmed
    if (s && analysis?.hasPalmOil && i.toLowerCase().includes('palm')) {
      s.score = 'red';
      s.reason = 'Palm oil — environmental + health concern';
    }
    return s;
  }).filter(Boolean);
  const redCount = scored.filter(s => s.score === 'red').length;
  const greenCount = scored.filter(s => s.score === 'green').length;

  const legendDot = (color) => `<span aria-hidden="true" style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;"></span>`;
  const legend = `
    <div style="display:flex;gap:var(--space-3);margin-bottom:var(--space-3);font-size:var(--text-xs);color:var(--text-tertiary);">
      <span style="display:flex;align-items:center;gap:4px;">${legendDot('var(--viz-green)')}${greenCount} no flags</span>
      <span style="display:flex;align-items:center;gap:4px;">${legendDot('var(--viz-amber)')}${scored.length - redCount - greenCount} neutral</span>
      <span style="display:flex;align-items:center;gap:4px;">${legendDot('var(--error)')}${redCount} flagged</span>
    </div>`;

  const pills = scored.map(s => {
    const c = INGREDIENT_STATUS[s.score] || INGREDIENT_STATUS.yellow;
    const title = s.reason ? ` title="${esc(s.reason)}"` : '';
    const glyph = c.glyph ? `<span aria-hidden="true">${c.glyph} </span>` : '';
    const srNote = `<span class="visually-hidden"> (${c.word}${s.reason ? `: ${esc(s.reason)}` : ''})</span>`;
    return `<span${title} style="display:inline-block;margin:3px;padding:3px 8px;border-radius:20px;font-size:var(--text-xs);background:${c.bg};border:1px solid ${c.border};color:${c.text};cursor:${s.reason ? 'help' : 'default'};">${glyph}${esc(s.text)}${srNote}</span>`;
  }).join('');

  return legend + `<div style="line-height:2;">${pills}</div>`;
}

// Nutri-Score grades map onto the app's own status scale. The badge always
// prints the letter, so the grade is never conveyed by colour alone.
function getNutriScoreColor(grade) {
  const colors = { A: 'var(--viz-green)', B: 'var(--viz-green)', C: 'var(--viz-amber)', D: 'var(--error)', E: 'var(--error)' };
  return colors[grade] || 'var(--text-tertiary)';
}

function setupExpandables() {
  const toggle = document.getElementById('ingredients-toggle');
  toggle?.addEventListener('click', () => {
    const body = document.getElementById('ingredients-body');
    const chevron = document.getElementById('ingredients-chevron');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    toggle.setAttribute('aria-expanded', String(!isOpen));
    if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(90deg)';
  });
}
