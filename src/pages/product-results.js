// ─── Product Results Page ────────────────────────────────────
// Displays detailed product analysis: score badge, nutrition table,
// ingredients with flagged additives, and positives/negatives.

import { icons } from '../icons.js';
import { getScoreColor, getScoreLabel } from '../utils/product-scanner.js';
import { createDonutChart } from '../utils/charts.js';
import { apiFetch } from '../utils/api.js';

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
        <div class="card" style="text-align:center;padding:var(--space-8);">
          <div style="margin-bottom:var(--space-3);color:var(--text-tertiary);display:flex;justify-content:center;">${icons.scan}</div>
          <h3>No Product Data</h3>
          <p style="font-size:var(--text-sm);color:var(--text-secondary);">Scan a product barcode to see results here.</p>
          <button class="btn btn-primary" onclick="location.hash='#/food-scanner'" style="margin-top:var(--space-4);">Go to Scanner</button>
        </div>
      </div>`;
    return;
  }

  const { product, healthScore, additives } = data;
  const n = product.nutrition || {};
  const score = healthScore.score;
  const scoreColor = healthScore.color || getScoreColor(score);
  const scoreLabel = healthScore.rating || getScoreLabel(score);

  // Macro percentages for chart
  const totalMacro = Math.round(((n.protein || 0) + (n.carbs || 0) + (n.fat || 0)) * 10) / 10;
  const pPct = totalMacro ? Math.round(((n.protein || 0) / totalMacro) * 100) : 0;
  const cPct = totalMacro ? Math.round(((n.carbs || 0) / totalMacro) * 100) : 0;
  const fPct = totalMacro ? 100 - pPct - cPct : 0;

  // Flag ingredients with additives
  const scoredIngredients = renderScoredIngredients(product.ingredients, additives?.analyzed || [], product.ingredients_analysis);

  // Analysis badges from OFF
  const analysis = product.ingredients_analysis;
  const analysisBadges = analysis ? [
    analysis.hasPalmOil ? `<span class="badge badge-coral">Palm Oil</span>` : '',
    analysis.isVegan === true ? `<span class="badge badge-green">Vegan</span>` : analysis.isVegan === false ? `<span class="badge badge-amber">Non-Vegan</span>` : '',
    analysis.isVegetarian === true ? `<span class="badge badge-green">Vegetarian</span>` : analysis.isVegetarian === false ? `<span class="badge badge-coral">Non-Vegetarian</span>` : '',
    analysis.isOrganic === true ? `<span class="badge badge-green">Organic</span>` : '',
  ].filter(Boolean).join('') : '';

  content.innerHTML = `
    <div class="food-scanner stagger-children">
      <!-- Back Button -->
      <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-4);cursor:pointer;" onclick="location.hash='#/food-scanner'">
        <span style="color:var(--text-tertiary);transform:rotate(180deg);display:inline-block;">${icons.chevronRight}</span>
        <span style="font-size:var(--text-sm);color:var(--text-tertiary);">Back to Scanner</span>
      </div>

      <!-- Product Header + Score Badge -->
      <div class="card product-header-card">
        <div style="display:flex;gap:var(--space-4);align-items:center;">
          <div class="product-score-badge" style="--score-color:${scoreColor};">
            <div class="product-score-value">${score}</div>
            <div class="product-score-label">${scoreLabel}</div>
          </div>
          <div style="flex:1;">
            <h2 style="font-size:var(--text-lg);margin-bottom:var(--space-1);">${product.name}</h2>
            ${product.brand ? `<p style="font-size:var(--text-sm);color:var(--text-secondary);">${product.brand}</p>` : ''}
            <div style="display:flex;gap:var(--space-2);margin-top:var(--space-2);flex-wrap:wrap;">
              ${product.nutriscore ? `<span class="badge" style="background:${getNutriScoreColor(product.nutriscore)};color:white;">NutriScore ${product.nutriscore}</span>` : ''}
              ${product.nova_group ? `<span class="badge badge-${product.nova_group <= 2 ? 'green' : product.nova_group <= 3 ? 'amber' : 'coral'}">NOVA ${product.nova_group}</span>` : ''}
              ${analysisBadges}
            </div>
          </div>
        </div>
      </div>

      <!-- Positives & Negatives -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
        <div class="card" style="border-left:3px solid #4CAF50;">
          <h4 style="font-size:var(--text-xs);color:#4CAF50;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:var(--space-2);">Positives</h4>
          ${(healthScore.positives || []).map(p => `<p style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-1);">• ${p}</p>`).join('') || '<p style="font-size:var(--text-xs);color:var(--text-tertiary);">—</p>'}
        </div>
        <div class="card" style="border-left:3px solid #F44336;">
          <h4 style="font-size:var(--text-xs);color:#F44336;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:var(--space-2);">Negatives</h4>
          ${(healthScore.negatives || []).map(n => `<p style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-1);">• ${n}</p>`).join('') || '<p style="font-size:var(--text-xs);color:var(--text-tertiary);">—</p>'}
        </div>
      </div>

      <!-- Nutrition per 100g -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-4);">
          <h4>Nutrition per 100g</h4>
          <span style="font-family:var(--font-heading);font-size:var(--text-2xl);font-weight:var(--weight-extrabold);color:var(--accent-teal);">${n.calories || '—'} <span style="font-size:var(--text-xs);font-weight:var(--weight-normal);color:var(--text-tertiary);">kcal</span></span>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-5);">
          <div class="chart-container" style="flex-shrink:0;">
            ${totalMacro > 0 ? createDonutChart([
    { percent: pPct, color: 'var(--accent-blue)' },
    { percent: cPct, color: 'var(--accent-amber)' },
    { percent: fPct, color: 'var(--accent-coral)' },
  ], 100, 10) : '<div style="width:100px;height:100px;border-radius:50%;background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-size:var(--text-xs);color:var(--text-tertiary);">N/A</div>'}
            ${totalMacro > 0 ? `<div class="chart-center-label"><div class="value" style="font-size:var(--text-md);">${totalMacro}g</div><div class="label">total</div></div>` : ''}
          </div>
          <div style="flex:1;">
            ${renderNutrientRow('Protein', n.protein, 'g', pPct, 'var(--accent-blue)')}
            ${renderNutrientRow('Carbs', n.carbs, 'g', cPct, 'var(--accent-amber)')}
            ${renderNutrientRow('  Sugar', n.sugar, 'g', null, 'var(--accent-coral)')}
            ${renderNutrientRow('Fat', n.fat, 'g', fPct, 'var(--accent-coral)')}
            ${renderNutrientRow('  Sat. Fat', n.saturated_fat, 'g', null, '#e57373')}
            ${renderNutrientRow('Fiber', n.fiber, 'g', null, 'var(--accent-green)')}
            ${renderNutrientRow('Sodium', n.sodium, 'mg', null, 'var(--text-secondary)')}
          </div>
        </div>
      </div>

      <!-- Ingredients & Additives -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3);cursor:pointer;" id="ingredients-toggle">
          <h4>Ingredients</h4>
          <span style="color:var(--text-tertiary);font-size:var(--text-xs);">${icons.chevronRight}</span>
        </div>
        <div id="ingredients-body" class="expandable-section">
          <p style="font-size:var(--text-sm);color:var(--text-secondary);line-height:1.6;">${scoredIngredients}</p>
        </div>
      </div>

      <!-- Additive Analysis -->
      ${additives && additives.analyzed && additives.analyzed.length > 0 ? `
      <div class="card">
        <h4 style="margin-bottom:var(--space-3);">Additives (${additives.summary?.total || additives.analyzed.length})</h4>
        <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-3);flex-wrap:wrap;">
          ${additives.summary?.high > 0 ? `<span class="badge badge-coral">${additives.summary.high} high risk</span>` : ''}
          ${additives.summary?.moderate > 0 ? `<span class="badge badge-amber">${additives.summary.moderate} moderate</span>` : ''}
          ${additives.summary?.low > 0 ? `<span class="badge badge-green">${additives.summary.low} low risk</span>` : ''}
        </div>
        ${additives.analyzed.map(a => `
          <div class="additive-row additive-${a.risk_level}">
            <div style="display:flex;align-items:center;gap:var(--space-2);">
              <span class="additive-risk-dot additive-dot-${a.risk_level}"></span>
              <span style="font-weight:var(--weight-semibold);font-size:var(--text-sm);">${a.code}</span>
              <span style="font-size:var(--text-sm);color:var(--text-secondary);">${a.name}</span>
            </div>
            <span class="badge badge-${a.risk_level === 'high' ? 'coral' : a.risk_level === 'moderate' ? 'amber' : 'green'}" style="font-size:10px;">${a.risk_level}</span>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <!-- Disclaimer -->
      <!-- Log to Food Diary -->
      <div class="card" style="text-align:center;">
        <p style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-3);">Add this product to today's food log and daily nutrition totals.</p>
        <div style="display:flex;gap:var(--space-2);align-items:center;justify-content:center;margin-bottom:var(--space-3);">
          <label style="font-size:var(--text-xs);color:var(--text-secondary);">Serving size (g)</label>
          <input type="number" id="product-serving-size" value="${n.serving_size || 100}" min="1" max="2000" step="1"
            style="width:80px;padding:4px 8px;border-radius:var(--radius-md);border:1px solid var(--border);background:var(--surface-2);color:var(--text-primary);font-size:var(--text-sm);text-align:center;">
        </div>
        <button id="log-product-btn" class="btn btn-primary btn-block">Log to Food Diary</button>
        <div id="log-product-status" style="display:none;margin-top:var(--space-2);font-size:var(--text-xs);color:var(--accent-green);">Logged successfully</div>
      </div>

      <p style="font-size:var(--text-xs);color:var(--text-tertiary);text-align:center;padding:var(--space-3) var(--space-4);line-height:1.5;">
        This score is for informational purposes and does not constitute medical or dietary advice.
        Data sourced from Open Food Facts. Always consult a healthcare professional.
      </p>
    </div>
  `;

  // Setup toggle
  setupExpandables();

  // Setup log button
  document.getElementById('log-product-btn')?.addEventListener('click', () => logProductToFoodLog(product, n));
}

async function logProductToFoodLog(product, n) {
  const btn = document.getElementById('log-product-btn');
  const status = document.getElementById('log-product-status');
  const servingSize = parseFloat(document.getElementById('product-serving-size')?.value) || 100;
  const scale = servingSize / 100; // nutrition is per 100g

  btn.disabled = true;
  btn.textContent = 'Logging...';

  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Not authenticated');

    const calories = Math.round((n.calories || 0) * scale);
    const protein = Math.round((n.protein || 0) * scale * 10) / 10;
    const carbs = Math.round((n.carbs || 0) * scale * 10) / 10;
    const fat = Math.round((n.fat || 0) * scale * 10) / 10;
    const fiber = Math.round((n.fiber || 0) * scale * 10) / 10;
    const mealName = `${product.brand ? product.brand + ' ' : ''}${product.name}`;

    // Save to meals table
    await apiFetch(`/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id,
        eventType: 'meal',
        data: {
          name: mealName,
          calories,
          protein,
          carbs,
          fat,
          fiber,
          grams: servingSize,
          source: 'product_scan',
          barcode: product.barcode,
          timestamp: new Date().toISOString(),
        },
      }),
    });

    // Update daily_nutrition via RPC
    await apiFetch(`/api/meal-memory`, {
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

    // Increment daily nutrition via Supabase RPC directly
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
    await supabase.rpc('increment_daily_nutrition', {
      p_user_id: user.id,
      p_date: today,
      p_calories: calories,
      p_protein: protein,
      p_carbs: carbs,
      p_fat: fat,
      p_fiber: fiber,
    });

    btn.textContent = 'Logged';
    btn.style.background = 'var(--accent-green)';
    status.style.display = 'block';
    status.textContent = `${mealName} — ${calories} cal logged to today`;
    console.log(`[ProductLog] Logged: ${mealName} — ${calories} cal, ${protein}g protein`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Log to Food Diary';
    console.error('[ProductLog] Failed:', err.message);
    const s = document.getElementById('log-product-status');
    s.style.display = 'block';
    s.style.color = 'var(--accent-coral)';
    s.textContent = `Failed to log: ${err.message}`;
  }
}

function renderNutrientRow(label, value, unit, pct, color) {
  const rounded = value != null ? Math.round(value * 100) / 100 : null;
  const displayValue = rounded != null ? `${rounded}${unit}` : '—';
  return `
    <div class="nutrient-row" style="padding:var(--space-1) 0;">
      <div class="nutrient-info">
        <div class="nutrient-dot" style="background:${color};"></div>
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
    const additive = analyzedAdditives.find(a => a.code.toUpperCase() === code);
    if (additive) {
      return {
        text: ingredient.trim(),
        score: additive.risk_level === 'high' ? 'red' : additive.risk_level === 'moderate' ? 'yellow' : 'yellow',
        reason: `${additive.name} — ${additive.risk_level} risk`,
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

function renderScoredIngredients(ingredientsText, analyzedAdditives, analysis) {
  if (!ingredientsText) return '<em style="color:var(--text-tertiary);">Not listed by manufacturer</em>';

  const ingredients = ingredientsText.split(/,(?![^(]*\))/).filter(i => i.trim());
  if (ingredients.length === 0) return '<em style="color:var(--text-tertiary);">Not listed by manufacturer</em>';

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

  const colorMap = {
    red: { bg: 'rgba(239,68,68,0.15)', border: '#ef4444', text: '#ef4444' },
    yellow: { bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', text: '#f59e0b' },
    green: { bg: 'rgba(34,197,94,0.12)', border: '#22c55e', text: '#22c55e' },
  };

  const legend = `
    <div style="display:flex;gap:var(--space-3);margin-bottom:var(--space-3);font-size:10px;color:var(--text-tertiary);">
      <span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block;"></span>${greenCount} safe</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;display:inline-block;"></span>${scored.length - redCount - greenCount} neutral</span>
      <span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:#ef4444;display:inline-block;"></span>${redCount} concerning</span>
    </div>`;

  const pills = scored.map(s => {
    const c = colorMap[s.score];
    const title = s.reason ? ` title="${s.reason}"` : '';
    return `<span${title} style="display:inline-block;margin:3px;padding:3px 8px;border-radius:20px;font-size:11px;background:${c.bg};border:1px solid ${c.border};color:${c.text};cursor:${s.reason ? 'help' : 'default'};">${s.text}</span>`;
  }).join('');

  return legend + `<div style="line-height:2;">${pills}</div>`;
}

function highlightAdditives(ingredientsText, analyzed) {
  if (!ingredientsText) return '';
  let html = ingredientsText;
  for (const a of analyzed) {
    const regex = new RegExp(`(${a.code})`, 'gi');
    const cls = a.risk_level === 'high' ? 'additive-flag-high' : a.risk_level === 'moderate' ? 'additive-flag-moderate' : '';
    if (cls) {
      html = html.replace(regex, `<span class="${cls}" title="${a.name} — ${a.risk_level} risk">$1</span>`);
    }
  }
  return html;
}

function getNutriScoreColor(grade) {
  const colors = { A: '#038141', B: '#85BB2F', C: '#FECB02', D: '#EE8100', E: '#E63E11' };
  return colors[grade?.toUpperCase()] || '#888';
}

function setupExpandables() {
  document.getElementById('ingredients-toggle')?.addEventListener('click', () => {
    const body = document.getElementById('ingredients-body');
    if (body) {
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
    }
  });
}