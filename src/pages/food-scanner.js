// Food Scanner Page — Meal Scan & Product Scan Modes
import { icons } from '../icons.js';
import { esc } from '../utils/esc.js';
import { createDonutChart } from '../utils/charts.js';
import { lookupBarcode, parseNutritionLabel, getHealthScore, getMealAnalysis } from '../services/foodScanApi.js';
import { initCamera, stopCamera, startBarcodeScanner, getScoreColor } from '../utils/product-scanner.js';
import { meals, productScans, dailyNutrition } from '../lib/db.js';
import { saveFoodCorrection, savePortionCorrection, checkMealMemory, saveMealMemory } from '../services/visionApi.js';
import { apiFetch } from '../utils/api.js';
import { trackEvent } from '../utils/analytics-events.js';

import { showToast } from '../utils/toast.js';
const hasSeenGuide = () => localStorage.getItem('vl_scan_guide_seen') === '1';
const markGuideSeen = () => localStorage.setItem('vl_scan_guide_seen', '1');
let scanAttempts = parseInt(localStorage.getItem('vl_scan_attempts') || '0');
const incrementScanAttempts = () => { scanAttempts++; localStorage.setItem('vl_scan_attempts', scanAttempts); };

let currentMode = 'meal';
let cameraStream = null;
let stopScanning = null;

// ═══════════════════════════════════════
//  Traditional Chinese Medicine Food DB
// ═══════════════════════════════════════

const TCM_DB = {
  // ── Meats & Proteins ──
  beef:           { thermal: 'warm',    moisture: 'neutral', flavor: 'sweet',   organ: 'spleen',  action: 'tonifies Qi and Blood, strengthens muscles' },
  lamb:           { thermal: 'hot',     moisture: 'warm',    flavor: 'sweet',   organ: 'kidney',  action: 'warms Yang, dispels cold, tonifies Kidney' },
  pork:           { thermal: 'neutral', moisture: 'damp',    flavor: 'sweet',   organ: 'spleen',  action: 'nourishes Yin, moistens dryness' },
  chicken:        { thermal: 'warm',    moisture: 'neutral', flavor: 'sweet',   organ: 'spleen',  action: 'tonifies Qi, warms middle burner' },
  duck:           { thermal: 'neutral', moisture: 'neutral', flavor: 'sweet',   organ: 'lung',    action: 'nourishes Yin, clears heat' },
  salmon:         { thermal: 'warm',    moisture: 'neutral', flavor: 'sweet',   organ: 'spleen',  action: 'strengthens Spleen, resolves dampness' },
  tuna:           { thermal: 'neutral', moisture: 'neutral', flavor: 'sweet',   organ: 'spleen',  action: 'tonifies Qi, strengthens tendons' },
  shrimp:         { thermal: 'warm',    moisture: 'neutral', flavor: 'sweet',   organ: 'kidney',  action: 'tonifies Yang, warms Kidney' },
  eggs:           { thermal: 'neutral', moisture: 'neutral', flavor: 'sweet',   organ: 'heart',   action: 'nourishes Blood and Yin, calms mind' },
  halibut:        { thermal: 'neutral', moisture: 'neutral', flavor: 'sweet',   organ: 'spleen',  action: 'strengthens Spleen, resolves dampness' },
  // ── Beef cuts ──
  'skirt steak':  { thermal: 'warm',    moisture: 'neutral', flavor: 'sweet',   organ: 'spleen',  action: 'tonifies Qi and Blood, strengthens muscles' },
  // ── Vegetables ──
  broccoli:       { thermal: 'cool',    moisture: 'neutral', flavor: 'sweet',   organ: 'lung',    action: 'clears heat, supports Lung, resolves phlegm' },
  spinach:        { thermal: 'cool',    moisture: 'moist',   flavor: 'sweet',   organ: 'liver',   action: 'nourishes Blood, moistens dryness, calms Liver' },
  kale:           { thermal: 'cool',    moisture: 'neutral', flavor: 'bitter',  organ: 'heart',   action: 'clears heat, detoxifies, supports Heart' },
  carrot:         { thermal: 'neutral', moisture: 'neutral', flavor: 'sweet',   organ: 'spleen',  action: 'strengthens Spleen, improves vision' },
  cucumber:       { thermal: 'cold',    moisture: 'cool',    flavor: 'sweet',   organ: 'stomach', action: 'clears heat, promotes fluid, detoxifies' },
  tomato:         { thermal: 'cool',    moisture: 'moist',   flavor: 'sweet',   organ: 'liver',   action: 'clears heat, nourishes Yin, promotes fluids' },
  mushroom:       { thermal: 'neutral', moisture: 'neutral', flavor: 'sweet',   organ: 'spleen',  action: 'tonifies Qi, supports immunity, calms mind' },
  squash:         { thermal: 'warm',    moisture: 'neutral', flavor: 'sweet',   organ: 'spleen',  action: 'tonifies Qi, resolves dampness, warms middle' },
  zucchini:       { thermal: 'cool',    moisture: 'neutral', flavor: 'sweet',   organ: 'spleen',  action: 'clears heat, promotes diuresis' },
  onion:          { thermal: 'warm',    moisture: 'dry',     flavor: 'pungent', organ: 'lung',    action: 'disperses cold, promotes Qi circulation' },
  garlic:         { thermal: 'hot',     moisture: 'dry',     flavor: 'pungent', organ: 'lung',    action: 'traditionally considered warming and dispersing' },
  ginger:         { thermal: 'hot',     moisture: 'dry',     flavor: 'pungent', organ: 'lung',    action: 'warms middle, disperses cold, stops nausea' },
  celery:         { thermal: 'cool',    moisture: 'neutral', flavor: 'sweet',   organ: 'liver',   action: 'traditionally considered cooling and calming' },
  asparagus:      { thermal: 'cool',    moisture: 'moist',   flavor: 'sweet',   organ: 'lung',    action: 'nourishes Yin, moistens Lung, clears heat' },
  'bell pepper':  { thermal: 'warm',    moisture: 'neutral', flavor: 'sweet',   organ: 'spleen',  action: 'moves Qi, warms middle burner' },
  // ── Grains ──
  rice:           { thermal: 'neutral', moisture: 'neutral', flavor: 'sweet',   organ: 'spleen',  action: 'tonifies Qi, harmonizes middle burner' },
  oats:           { thermal: 'warm',    moisture: 'neutral', flavor: 'sweet',   organ: 'spleen',  action: 'strengthens Spleen, nourishes Qi' },
  barley:         { thermal: 'cool',    moisture: 'dry',     flavor: 'sweet',   organ: 'spleen',  action: 'resolves dampness, clears heat, promotes digestion' },
  quinoa:         { thermal: 'warm',    moisture: 'neutral', flavor: 'sweet',   organ: 'kidney',  action: 'tonifies Kidney Yang, warms middle burner' },
  wheat:          { thermal: 'cool',    moisture: 'neutral', flavor: 'sweet',   organ: 'heart',   action: 'calms mind, nourishes Heart, clears heat' },
  // ── Fruits ──
  apple:          { thermal: 'cool',    moisture: 'moist',   flavor: 'sweet',   organ: 'lung',    action: 'moistens Lung, promotes fluids, clears heat' },
  banana:         { thermal: 'cold',    moisture: 'moist',   flavor: 'sweet',   organ: 'stomach', action: 'clears heat, lubricates intestines, calms thirst' },
  mango:          { thermal: 'cool',    moisture: 'moist',   flavor: 'sweet',   organ: 'stomach', action: 'clears heat, promotes fluids, stops nausea' },
  watermelon:     { thermal: 'cold',    moisture: 'cool',    flavor: 'sweet',   organ: 'stomach', action: 'clears summer heat, promotes urination' },
  strawberry:     { thermal: 'cool',    moisture: 'moist',   flavor: 'sweet',   organ: 'lung',    action: 'clears heat, nourishes Yin, promotes fluids' },
  lemon:          { thermal: 'cool',    moisture: 'neutral', flavor: 'sour',    organ: 'liver',   action: 'astringes Liver, promotes digestion, clears heat' },
  orange:         { thermal: 'cool',    moisture: 'moist',   flavor: 'sweet',   organ: 'lung',    action: 'clears heat, promotes fluids, resolves phlegm' },
  // ── Legumes ──
  lentils:        { thermal: 'neutral', moisture: 'dry',     flavor: 'sweet',   organ: 'heart',   action: 'tonifies Qi and Blood, resolves dampness' },
  chickpeas:      { thermal: 'neutral', moisture: 'dry',     flavor: 'sweet',   organ: 'spleen',  action: 'strengthens Spleen, resolves dampness' },
  'black beans':  { thermal: 'neutral', moisture: 'dry',     flavor: 'sweet',   organ: 'kidney',  action: 'tonifies Kidney, nourishes Blood, resolves dampness' },
  tofu:           { thermal: 'cool',    moisture: 'neutral', flavor: 'sweet',   organ: 'spleen',  action: 'clears heat, nourishes Yin, benefits Qi' },
  // ── Dairy & Fats ──
  milk:           { thermal: 'neutral', moisture: 'damp',    flavor: 'sweet',   organ: 'lung',    action: 'nourishes Yin, moistens dryness — damp-forming' },
  cheese:         { thermal: 'neutral', moisture: 'damp',    flavor: 'sweet',   organ: 'spleen',  action: 'nourishes Yin — heavy, damp-forming in excess' },
  butter:         { thermal: 'warm',    moisture: 'damp',    flavor: 'sweet',   organ: 'spleen',  action: 'nourishes, warms — damp-forming in excess' },
  'olive oil':    { thermal: 'neutral', moisture: 'moist',   flavor: 'sweet',   organ: 'liver',   action: 'nourishes Liver Yin, lubricates intestines' },
  // ── Condiments & Sauces ──
  chimichurri:    { thermal: 'warm',    moisture: 'dry',     flavor: 'pungent', organ: 'lung',    action: 'moves Qi, disperses stagnation, warms Yang' },
  'soy sauce':    { thermal: 'cold',    moisture: 'neutral', flavor: 'salty',   organ: 'kidney',  action: 'clears heat, detoxifies, retains fluids' },
  miso:           { thermal: 'neutral', moisture: 'neutral', flavor: 'salty',   organ: 'kidney',  action: 'strengthens Kidney, supports gut, nourishes Yin' },
  vinegar:        { thermal: 'warm',    moisture: 'dry',     flavor: 'sour',    organ: 'liver',   action: 'astringes, moves Blood, dissolves stagnation' },
  'hot sauce':    { thermal: 'hot',     moisture: 'dry',     flavor: 'pungent', organ: 'lung',    action: 'disperses cold, moves Qi, opens pores' },
  // ── Nuts & Seeds ──
  walnuts:        { thermal: 'warm',    moisture: 'neutral', flavor: 'sweet',   organ: 'kidney',  action: 'tonifies Kidney Yang, warms Lung, benefits brain' },
  almonds:        { thermal: 'neutral', moisture: 'moist',   flavor: 'sweet',   organ: 'lung',    action: 'traditionally considered moistening' },
  sesame:         { thermal: 'neutral', moisture: 'moist',   flavor: 'sweet',   organ: 'liver',   action: 'nourishes Liver and Kidney, moistens dryness' },
  // ── Mushrooms (specific) ──
  "lion's mane":  { thermal: 'neutral', moisture: 'neutral', flavor: 'sweet',   organ: 'spleen',  action: 'tonifies Qi, nourishes Heart and Spleen, calms mind' },
  shiitake:       { thermal: 'neutral', moisture: 'neutral', flavor: 'sweet',   organ: 'spleen',  action: 'tonifies Qi, supports immunity, resolves dampness' },
  reishi:         { thermal: 'warm',    moisture: 'neutral', flavor: 'sweet',   organ: 'heart',   action: 'calms mind, tonifies Qi, supports Liver' },
};

// Every chip that uses these colours also prints its text label, so the
// category is never conveyed by colour alone.
const THERMAL_COLORS = {
  hot:     { bg: 'var(--error-dim)',       border: 'var(--error)',       text: 'var(--error)',       label: 'Hot' },
  warm:    { bg: 'var(--viz-amber-dim)',   border: 'var(--viz-amber)',   text: 'var(--viz-amber)',   label: 'Warm' },
  neutral: { bg: 'var(--viz-neutral-dim)', border: 'var(--viz-neutral)', text: 'var(--viz-neutral)', label: 'Neutral' },
  cool:    { bg: 'var(--accent-dim)',      border: 'var(--accent)',      text: 'var(--accent)',      label: 'Cool' },
  cold:    { bg: 'var(--accent-dim)',      border: 'var(--accent)',      text: 'var(--accent)',      label: 'Cold' },
};

const MOISTURE_COLORS = {
  damp:    { bg: 'var(--viz-neutral-dim)', border: 'var(--viz-neutral)', text: 'var(--viz-neutral)', label: 'Damp' },
  moist:   { bg: 'var(--viz-green-dim)',   border: 'var(--viz-green)',   text: 'var(--viz-green)',   label: 'Moist' },
  neutral: { bg: 'var(--viz-neutral-dim)', border: 'var(--viz-neutral)', text: 'var(--viz-neutral)', label: 'Neutral' },
  dry:     { bg: 'var(--viz-amber-dim)',   border: 'var(--viz-amber)',   text: 'var(--viz-amber)',   label: 'Dry' },
  warm:    { bg: 'var(--viz-amber-dim)',   border: 'var(--viz-amber)',   text: 'var(--viz-amber)',   label: 'Warm' },
  cool:    { bg: 'var(--accent-dim)',      border: 'var(--accent)',      text: 'var(--accent)',      label: 'Cool' },
};

function matchTCM(foodName) {
  if (!foodName) return null;
  const name = foodName.toLowerCase()
    .replace(/,.*$/, '')
    .replace(/\b(raw|cooked|fried|grilled|steamed|baked|sauteed|roasted|fresh|dried|organic)\b/gi, '')
    .trim();

  // Direct match
  if (TCM_DB[name]) return { ...TCM_DB[name], matched: name };

  // Partial match — longest key that appears in name
  let best = null;
  let bestLen = 0;
  for (const key of Object.keys(TCM_DB)) {
    if (name.includes(key) && key.length > bestLen) {
      best = key;
      bestLen = key.length;
    }
  }
  if (best) return { ...TCM_DB[best], matched: best };

  return null;
}

function renderTCMAnalysis(foods) {
  if (!foods || foods.length === 0) return '';

  const analyzed = foods.map(f => {
    const tcm = matchTCM(f.name || f.label || '');
    return tcm ? { name: f.name || f.label, ...tcm } : null;
  }).filter(Boolean);

  if (analyzed.length === 0) {
    return `<div class="card" style="text-align:center;padding:var(--space-4);">
      <p style="font-size:var(--text-xs);color:var(--text-tertiary);">No TCM data available for these foods</p>
    </div>`;
  }

  // Overall meal thermal tendency
  const thermalOrder = { cold: -2, cool: -1, neutral: 0, warm: 1, hot: 2 };
  const avgThermal = analyzed.reduce((sum, f) => sum + (thermalOrder[f.thermal] || 0), 0) / analyzed.length;
  const overallThermal = avgThermal <= -1.5 ? 'cold' : avgThermal <= -0.5 ? 'cool' : avgThermal <= 0.5 ? 'neutral' : avgThermal <= 1.5 ? 'warm' : 'hot';
  const dampCount = analyzed.filter(f => f.moisture === 'damp').length;
  const dryCount = analyzed.filter(f => f.moisture === 'dry').length;
  const overallMoisture = dampCount > dryCount ? 'damp-forming' : dryCount > dampCount ? 'drying' : 'balanced';

  const tc = THERMAL_COLORS[overallThermal];

  return `
    <div class="card" style="margin-bottom:var(--space-3);">
      <button type="button" id="tcm-toggle" aria-expanded="false" aria-controls="tcm-body" style="display:flex;justify-content:space-between;align-items:center;width:100%;cursor:pointer;text-align:left;padding:0;">
        <div style="display:flex;gap:var(--space-2);">
          <span style="padding:1px 8px;border-radius:20px;font-size:var(--text-xs);font-weight:600;background:${tc.bg};border:1px solid ${tc.border};color:${tc.text};">${tc.label}</span>
          <span style="padding:1px 8px;border-radius:20px;font-size:var(--text-xs);font-weight:600;background:var(--surface-2);color:var(--text-secondary);border:1px solid var(--border);">${overallMoisture}</span>
        </div>
        <span id="tcm-chevron" aria-hidden="true" style="color:var(--text-tertiary);font-size:12px;transition:transform 0.2s;">▼</span>
        <span class="visually-hidden">Show details for each food</span>
      </button>
      <div id="tcm-body" style="display:none;margin-top:var(--space-3);">
        <div style="display:flex;flex-direction:column;gap:var(--space-3);">
          ${analyzed.map(f => {
            const tc = THERMAL_COLORS[f.thermal] || THERMAL_COLORS.neutral;
            const mc = MOISTURE_COLORS[f.moisture] || MOISTURE_COLORS.neutral;
            return `
            <div style="border-left:2px solid ${tc.border};padding-left:var(--space-3);">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
                <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${esc(f.name)}</span>
                <div style="display:flex;gap:4px;flex-shrink:0;margin-left:var(--space-2);">
                  <span title="Thermal nature" style="padding:1px 7px;border-radius:20px;font-size:var(--text-xs);background:${tc.bg};border:1px solid ${tc.border};color:${tc.text};">${tc.label}</span>
                  <span title="Moisture quality" style="padding:1px 7px;border-radius:20px;font-size:var(--text-xs);background:${mc.bg};border:1px solid ${mc.border};color:${mc.text};">${mc.label}</span>
                </div>
              </div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:2px;">${f.flavor} · ${f.organ} system</div>
              <div style="font-size:var(--text-xs);color:var(--text-secondary);font-style:italic;">${f.action}</div>
            </div>`;
          }).join('')}
        </div>
        <p class="disclaimer" style="margin-top:var(--space-3);text-align:center;">
          Based on Traditional Chinese Medicine principles. Not medical advice.
        </p>
      </div>
    </div>`;
}

async function loadTCMConstitution() {
  const card = document.getElementById('tcm-constitution-card');
  if (!card) return;
  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;
    const res = await apiFetch(`/api/tcm-profile?userId=${user.id}`);
    if (!res.ok) throw new Error(`TCM profile request failed (${res.status})`);
    const { profile } = await res.json();
    if (!profile || !profile.constitution) return; // nothing logged yet — leave the card empty

    const thermalColor = profile.thermalType?.includes('Heat') ? 'var(--accent-coral)' :
      profile.thermalType?.includes('Warm') ? 'var(--accent-amber)' :
      profile.thermalType?.includes('Cold') ? 'var(--accent-blue)' :
      profile.thermalType?.includes('Cool') ? 'var(--accent-teal)' : 'var(--text-secondary)';

    card.innerHTML = `
      <div class="card card-sm" style="border-left:3px solid ${thermalColor};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-2);">
          <div style="font-size:var(--text-xs);font-weight:var(--weight-semibold);color:var(--text-secondary);">Your TCM Constitution</div>
          <span style="font-size:var(--text-xs);color:var(--text-tertiary);">${Number(profile.total_foods_analyzed) || 0} foods analyzed</span>
        </div>
        <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);color:${thermalColor};margin-bottom:2px;">${esc(profile.thermalType)} · ${esc(profile.moistureType)}</div>
        <div style="font-size:var(--text-xs);color:var(--text-secondary);">Dominant: ${esc(profile.dominantFlavor)} flavor ${esc(profile.dominantOrganSystem)}</div>
      </div>`;
  } catch (e) {
    console.warn('[TCMProfile] Could not load constitution:', e.message);
    card.innerHTML = `
      <div class="empty-state" role="alert">
        <h3>Couldn't load your TCM constitution</h3>
        <p>Check your connection and try again.</p>
        <button type="button" class="btn btn-sm" id="tcm-constitution-retry">Try again</button>
      </div>`;
    document.getElementById('tcm-constitution-retry')?.addEventListener('click', loadTCMConstitution);
  }
}

function renderComboCard(combo) {
  const isGood = combo.type === 'good';
  return `
    <div class="card ${isGood ? 'combo-good' : 'combo-bad'}" style="margin-bottom:var(--space-3);">
      <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-2);">
        <span style="font-size:18px;">${isGood ? icons.check : icons.alert}</span>
        <h4 style="font-size:var(--text-sm);">${esc(combo.title)}</h4>
        <span class="badge ${isGood ? 'badge-green' : 'badge-coral'}" style="margin-left:auto;">${isGood ? 'Optimal' : 'Avoid'}</span>
      </div>
      <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;">${esc(combo.explanation)}</p>
    </div>
  `;
}

export async function renderFoodScanner() {
  const content = document.getElementById('page-content');

  bindScannerCleanup();
  releaseScannerResources();

  let recentMeals = [];
  let recentScans = [];
  let todayNutrition = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  let savedMemories = [];
  // A failed load must never be rendered as "nothing logged yet".
  let mealsError = false, scansError = false, nutritionError = false, memoriesError = false;

  try { recentMeals = await meals.getRecent(5); } catch (e) { mealsError = true; console.warn('Could not load meals:', e.message); }
  try { recentScans = await productScans.getRecent(5); } catch (e) { scansError = true; console.warn('Could not load scans:', e.message); }
  try { todayNutrition = await dailyNutrition.get(); } catch (e) { nutritionError = true; console.warn('Could not load nutrition:', e.message); }
  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      const res = await apiFetch(`/api/meal-memory/list?userId=${user.id}`);
      if (!res.ok) throw new Error(`Meal memory request failed (${res.status})`);
      const j = await res.json();
      savedMemories = j.memories || [];
    }
  } catch (e) { memoriesError = true; console.warn('Could not load meal memories:', e.message); }

  content.innerHTML = `
    <div class="food-scanner stagger-children">
      <div class="page-header">
        <h1>Food Scanner</h1>
        <p>Scan meals or product barcodes for health insights</p>
      </div>

      ${nutritionError ? renderLoadError('nutrition', "Couldn't load today's nutrition") : todayNutrition.calories > 0 ? `
      <div class="card" style="margin-bottom:var(--space-4);">
        <h4 style="margin-bottom:var(--space-3);">Today's Nutrition</h4>
        <div style="display:flex;justify-content:space-between;text-align:center;">
          <div>
            <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:var(--weight-bold);color:var(--accent-teal);">${Math.round(todayNutrition.calories)}</div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">calories</div>
          </div>
          <div>
            <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:var(--weight-bold);color:var(--accent-blue);">${Math.round(todayNutrition.protein)}g</div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">protein</div>
          </div>
          <div>
            <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:var(--weight-bold);color:var(--accent-amber);">${Math.round(todayNutrition.carbs)}g</div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">carbs</div>
          </div>
          <div>
            <div style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:var(--weight-bold);color:var(--accent-coral);">${Math.round(todayNutrition.fat)}g</div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">fat</div>
          </div>
        </div>
      </div>` : ''}

      <div class="scan-mode-toggle" role="tablist" aria-label="Scanner mode">
        <button type="button" role="tab" aria-selected="${currentMode === 'meal'}" aria-controls="meal-scan-view" class="mode-btn ${currentMode === 'meal' ? 'mode-btn-active' : ''}" id="mode-meal">
          ${icons.camera} Meal Scan
        </button>
        <button type="button" role="tab" aria-selected="${currentMode === 'product'}" aria-controls="product-scan-view" class="mode-btn ${currentMode === 'product' ? 'mode-btn-active' : ''}" id="mode-product">
          ${icons.barcode} Product Scan
        </button>
      </div>

      <!-- Meal Scan View -->
      <div id="meal-scan-view" role="tabpanel" aria-labelledby="mode-meal" style="${currentMode !== 'meal' ? 'display:none;' : ''}">
        <div class="card" style="padding:0;overflow:hidden;margin-bottom:var(--space-5);" id="food-upload-card" aria-live="polite">
          <div class="upload-zone" id="food-upload-zone">
            <input type="file" accept="image/*" capture="environment" id="food-file-input" multiple aria-label="Take a photo of your meal, or choose up to 3 photos">
            <div style="color:var(--text-tertiary);">${icons.camera}</div>
            <p><span class="upload-btn-text">Take Photo</span> or drag &amp; drop</p>
            <p style="font-size:var(--text-xs);">Add up to 3 photos for better accuracy</p>
          </div>
          <div style="display:flex;gap:0;border-top:1px solid var(--border);">
            <div style="flex:1;text-align:center;padding:var(--space-2) var(--space-1);border-right:1px solid var(--border);">
              <div style="color:var(--text-secondary);display:flex;justify-content:center;">${icons.user}</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:1px;font-weight:600;">HAND</div>
              <div style="font-size:var(--text-xs);color:var(--accent-teal);">= best accuracy</div>
            </div>
            <div style="flex:1;text-align:center;padding:var(--space-2) var(--space-1);border-right:1px solid var(--border);">
              <div style="color:var(--text-secondary);display:flex;justify-content:center;">${icons.sun}</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:1px;font-weight:600;">LIGHTING</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);">bright & even</div>
            </div>
            <div style="flex:1;text-align:center;padding:var(--space-2) var(--space-1);border-right:1px solid var(--border);">
              <div style="color:var(--text-secondary);display:flex;justify-content:center;">${icons.camera}</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:1px;font-weight:600;">FULL PLATE</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);">from above</div>
            </div>
            <div style="flex:1;text-align:center;padding:var(--space-2) var(--space-1);">
              <div style="color:var(--text-secondary);display:flex;justify-content:center;">${icons.coffee}</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:1px;font-weight:600;">UTENSIL</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);">also works</div>
            </div>
          </div>
        </div>
        <div id="multi-image-preview" style="display:none;padding:var(--space-3);display:flex;gap:var(--space-2);flex-wrap:wrap;"></div>
        <div id="food-results" class="hidden" aria-live="polite">
          <div class="portion-selector">
            <label for="portion-select">Portion Size</label>
            <select id="portion-select">
              <option value="small">Small</option>
              <option value="medium" selected>Medium</option>
              <option value="large">Large</option>
            </select>
          </div>
        </div>
        ${memoriesError ? renderLoadError('memories', "Couldn't load your saved meals") : savedMemories.length > 0 ? `
        <div class="section-heading" style="margin-top:var(--space-6);">
          <h3>Saved Meals</h3>
          <span class="badge badge-teal">${savedMemories.length} saved</span>
        </div>
        <div id="meal-memory-list" style="display:flex;flex-direction:column;gap:var(--space-3);">
          ${savedMemories.map(m => renderMemoryCard(m)).join('')}
        </div>
        ` : ''}

        <div class="section-heading" style="margin-top:var(--space-6);">
          <h3>Recent Meals</h3>
          ${mealsError ? '' : `<span class="badge badge-teal">${recentMeals.length} logged</span>`}
        </div>
        <div id="meal-history" style="display:flex;flex-direction:column;gap:var(--space-3);">
          ${mealsError ? renderLoadError('meals', "Couldn't load your recent meals") : recentMeals.length > 0 ? recentMeals.map(renderMealCard).join('') : renderEmptyMeals()}
        </div>
      </div>

      <!-- Product Scan View -->
      <div id="product-scan-view" role="tabpanel" aria-labelledby="mode-product" style="${currentMode !== 'product' ? 'display:none;' : ''}">
        <div class="card barcode-scanner-card" id="barcode-scanner-card">
          <div class="barcode-viewfinder">
            <video id="barcode-video" autoplay playsinline muted aria-label="Live camera preview for barcode scanning"></video>
            <div class="barcode-overlay">
              <div class="barcode-scan-region">
                <div class="barcode-corner tl"></div>
                <div class="barcode-corner tr"></div>
                <div class="barcode-corner bl"></div>
                <div class="barcode-corner br"></div>
              </div>
              <p class="barcode-hint">Align barcode within the frame</p>
            </div>
          </div>
          <div class="barcode-actions">
            <button type="button" class="btn btn-sm btn-outline" id="btn-start-camera">
              ${icons.camera} Start Camera
            </button>
            <button type="button" class="btn btn-sm btn-outline" id="btn-capture-label">
              Capture Label
            </button>
          </div>
        </div>
        <div class="card" style="margin-top:var(--space-3);">
          <h4 style="margin-bottom:var(--space-2);font-size:var(--text-sm);">Manual Barcode Entry</h4>
          <div style="display:flex;gap:var(--space-2);">
            <label for="manual-barcode" class="visually-hidden">Barcode number</label>
            <input type="text" id="manual-barcode" inputmode="numeric" placeholder="e.g. 3017620422003"
              style="flex:1;font-size:var(--text-sm);padding:var(--space-2) var(--space-3);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);">
            <button type="button" class="btn btn-primary btn-sm" id="btn-manual-lookup">
              ${icons.scan} Look Up
            </button>
          </div>
        </div>
        <input type="file" accept="image/*" capture="environment" id="ocr-file-input" aria-label="Photo of a nutrition label" style="display:none;">
        <div id="product-scan-loading" class="hidden" aria-live="polite">
          <div class="card" style="text-align:center;padding:var(--space-6);">
            <div class="spinner" style="margin:0 auto var(--space-3);"></div>
            <p style="font-size:var(--text-sm);color:var(--text-secondary);" id="scan-status-text">Looking up product...</p>
          </div>
        </div>
        <div id="product-scan-error" class="hidden" role="alert">
          <div class="card" style="text-align:center;padding:var(--space-6);border-left:3px solid var(--error);">
            <div style="margin-bottom:var(--space-2);color:var(--viz-amber);display:flex;justify-content:center;">${icons.alert}</div>
            <p style="font-size:var(--text-sm);color:var(--text-secondary);" id="scan-error-text">Something went wrong</p>
            <button type="button" class="btn btn-sm btn-outline" id="btn-try-again" style="margin-top:var(--space-3);">Try Again</button>
          </div>
        </div>
        <div class="section-heading" style="margin-top:var(--space-5);">
          <h3>Recent Scans</h3>
          ${scansError ? '' : `<span class="badge badge-teal">${recentScans.length} scanned</span>`}
        </div>
        <div id="product-scan-history" style="display:flex;flex-direction:column;gap:var(--space-3);">
          ${scansError ? renderLoadError('scans', "Couldn't load your recent scans") : recentScans.length > 0 ? recentScans.map(renderProductScanCard).join('') : renderEmptyScans()}
        </div>
        <p class="disclaimer" style="text-align:center;margin-top:var(--space-4);">
          Scores are for informational purposes only. Not medical advice.
        </p>
      </div>
    </div>
  `;

  // ── Append modal to document.body so position:fixed works correctly ──
  document.getElementById('scan-guide-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'scan-guide-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'scan-guide-title');
  modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;align-items:flex-end;justify-content:center;';
  modal.innerHTML = `
    <div style="background:var(--surface-1);border-radius:var(--radius-xl) var(--radius-xl) 0 0;padding:var(--space-6);width:100%;max-width:480px;padding-bottom:40px;">
      <div style="text-align:center;margin-bottom:var(--space-5);">
        <div style="margin-bottom:var(--space-3);color:var(--accent);display:flex;justify-content:center;">${icons.camera}</div>
        <h3 id="scan-guide-title" style="margin-bottom:var(--space-2);">Get the most accurate scan</h3>
        <p style="font-size:var(--text-sm);color:var(--text-secondary);">Follow these tips for calorie estimates close to the real amount</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-3);margin-bottom:var(--space-5);">
        <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--surface-2);border-radius:var(--radius-lg);">
          <div style="flex-shrink:0;color:var(--text-secondary);">${icons.user}</div>
          <div>
            <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">Include your hand</div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">Your hand gives the AI a size reference — this is the #1 accuracy factor</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--surface-2);border-radius:var(--radius-lg);">
          <div style="flex-shrink:0;color:var(--text-secondary);">${icons.camera}</div>
          <div>
            <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">Show the full plate</div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">Capture everything from above — don't crop any part of the meal</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--surface-2);border-radius:var(--radius-lg);">
          <div style="flex-shrink:0;color:var(--text-secondary);">${icons.sun}</div>
          <div>
            <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">Good lighting</div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">Natural light or bright room — avoid shadows across the food</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--surface-2);border-radius:var(--radius-lg);">
          <div style="flex-shrink:0;color:var(--text-secondary);">${icons.coffee}</div>
          <div>
            <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">Fork or spoon works too</div>
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">Any reference object helps — utensils, plates, cups all work</div>
          </div>
        </div>
      </div>
      <button type="button" class="btn btn-primary btn-block" id="guide-got-it-btn" style="font-size:var(--text-base);">Got it — let me scan</button>
    </div>`;
  document.body.appendChild(modal);

  setupModeToggle();
  setupFoodUpload();
  setupProductScan();
  setupMemoryHandlers();
  document.querySelectorAll('[data-retry-page]').forEach(btn => btn.addEventListener('click', () => renderFoodScanner()));
}

function renderLoadError(key, title) {
  return `
    <div class="empty-state" role="alert">
      <h3>${title}</h3>
      <p>Check your connection and try again. Nothing you've logged has been lost.</p>
      <button type="button" class="btn btn-sm" id="${key}-retry" data-retry-page="1">Try again</button>
    </div>`;
}

// ── Camera / scanner lifecycle ────────────────────────────────
// Stops any live camera stream and barcode loop, and removes the
// body-level guide modal. Runs on navigation away and on re-render.
function releaseScannerResources() {
  if (stopScanning) { try { stopScanning(); } catch { /* already stopped */ } stopScanning = null; }
  if (cameraStream) { stopCamera(cameraStream); cameraStream = null; }
  document.getElementById('scan-guide-modal')?.remove();
}

let scannerCleanupBound = false;
function bindScannerCleanup() {
  if (scannerCleanupBound) return;
  scannerCleanupBound = true;
  window.addEventListener('hashchange', releaseScannerResources);
  window.addEventListener('pagehide', releaseScannerResources);
}

function resetCameraButton() {
  const btn = document.getElementById('btn-start-camera');
  if (!btn) return;
  btn.innerHTML = `${icons.camera} Start Camera`;
  btn.disabled = false;
}

// ─── Mode Toggle ─────────────────────────────────────────────

function setupModeToggle() {
  document.getElementById('mode-meal')?.addEventListener('click', () => switchMode('meal'));
  document.getElementById('mode-product')?.addEventListener('click', () => switchMode('product'));
}

function switchMode(mode) {
  currentMode = mode;
  if (mode !== 'product' && cameraStream) {
    stopCamera(cameraStream);
    cameraStream = null;
    if (stopScanning) { stopScanning(); stopScanning = null; }
  }
  document.getElementById('meal-scan-view').style.display = mode === 'meal' ? '' : 'none';
  document.getElementById('product-scan-view').style.display = mode === 'product' ? '' : 'none';
  const mealTab = document.getElementById('mode-meal');
  const productTab = document.getElementById('mode-product');
  if (mealTab) { mealTab.className = `mode-btn ${mode === 'meal' ? 'mode-btn-active' : ''}`; mealTab.setAttribute('aria-selected', String(mode === 'meal')); }
  if (productTab) { productTab.className = `mode-btn ${mode === 'product' ? 'mode-btn-active' : ''}`; productTab.setAttribute('aria-selected', String(mode === 'product')); }
}

// ─── Meal Upload ──────────────────────────────────────────────

function setupFoodUpload() {
  const zone = document.getElementById('food-upload-zone');
  const input = document.getElementById('food-file-input');

  // First-time scan guide
  const guideModal = document.getElementById('scan-guide-modal');
  const gotItBtn = document.getElementById('guide-got-it-btn');
  if (guideModal && !hasSeenGuide()) {
    const previouslyFocused = document.activeElement;
    const focusables = () => Array.from(guideModal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
    const closeGuide = () => {
      guideModal.style.display = 'none';
      markGuideSeen();
      document.removeEventListener('keydown', onGuideKey);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
    const onGuideKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeGuide(); return; }
      if (e.key === 'Tab') {
        const list = focusables();
        if (list.length === 0) return;
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    guideModal.style.display = 'flex';
    document.addEventListener('keydown', onGuideKey);
    gotItBtn?.addEventListener('click', closeGuide);
    // Deferred so it runs after the router moves focus to the page container.
    setTimeout(() => gotItBtn?.focus(), 0);
  } else if (guideModal) {
    guideModal.style.display = 'none';
  }

  // Hand reminder every 5th scan
  input?.addEventListener('click', () => {
    incrementScanAttempts();
    if (scanAttempts % 5 === 0 && scanAttempts > 0) {
      showToast('Tip: Include your hand in the photo for the most accurate calorie estimate');
    }
  });

  ['dragenter', 'dragover'].forEach(e => {
    zone?.addEventListener(e, (ev) => { ev.preventDefault(); zone.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(e => {
    zone?.addEventListener(e, (ev) => { ev.preventDefault(); zone.classList.remove('dragover'); });
  });
  zone?.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer?.files || []).slice(0, 3);
    if (files.length) processFood(files);
  });
  input?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []).slice(0, 3);
    if (files.length) processFood(files);
  });
}

function setupMemoryHandlers() {
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
        const { supabase } = await import('../lib/supabase.js');
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

function setupCorrectionHandlers(result) {
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

async function compressImage(file, maxDimension = 1536, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("We couldn't read that image. Try a different photo."));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("We couldn't read that image. Try a different photo."));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height / width) * maxDimension);
            width = maxDimension;
          } else {
            width = Math.round((width / height) * maxDimension);
            height = maxDimension;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error("We couldn't process that image. Try a different photo.")); return; }
          const compressed = new File([blob], file.name || 'meal.jpg', { type: 'image/jpeg', lastModified: Date.now() });
          console.log(`[FoodScanner] Image compressed: ${(file.size / 1024).toFixed(0)}KB ${(compressed.size / 1024).toFixed(0)}KB`);
          resolve(compressed);
        }, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function generateMealHash(foods) {
  const labels = (foods || [])
    .map(f => (f.label || f.name || '').toLowerCase().trim())
    .filter(Boolean)
    .sort()
    .join('|');
  return btoa(labels).slice(0, 32);
}

async function processFood(filesOrFile) {
  const files = Array.isArray(filesOrFile) ? filesOrFile : [filesOrFile];
  const file = files[0];
  const card = document.getElementById('food-upload-card');
  const resultsDiv = document.getElementById('food-results');

  card.innerHTML = `
        <div class="scanner-preview">
            <img id="food-preview-img" alt="Food preview" style="width:100%;height:100%;object-fit:cover;">
            <div class="scanner-line"></div>
            <div style="position:absolute;bottom:var(--space-3);left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:var(--space-2);background:rgba(0,0,0,0.6);padding:var(--space-2) var(--space-4);border-radius:var(--radius-full);">
                <div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>
                <span style="font-size:var(--text-sm);color:white;">Analyzing meal...</span>
            </div>
        </div>
    `;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.getElementById('food-preview-img');
    if (img) img.src = e.target.result;
  };
  reader.readAsDataURL(file);

  try {
    // ── Barcode auto-detection ────────────────────────────
    if ('BarcodeDetector' in window) {
      try {
        const detector = new BarcodeDetector({ formats: ['ean_13', 'upc_a', 'ean_8', 'upc_e', 'code_128', 'code_39', 'qr_code'] });
        const bitmap = await createImageBitmap(file);
        const barcodes = await detector.detect(bitmap);
        if (barcodes.length > 0) {
          const barcode = barcodes[0].rawValue;
          console.log(`[BarcodeAuto] Detected barcode in photo: ${barcode}`);
          showToast(`Barcode detected — looking up product...`);
          // Switch to product scan mode and handle
          card.innerHTML = `<div style="padding:var(--space-6);text-align:center;"><div class="spinner" style="margin:0 auto var(--space-3);"></div><p>Looking up barcode: ${esc(barcode)}...</p></div>`;
          await handleBarcodeDetected(barcode);
          return;
        }
      } catch (e) {
        console.log('[BarcodeAuto] No barcode found, proceeding with meal analysis');
      }
    }

    const selectedPortion = document.getElementById('portion-select')?.value || 'medium';
    const compressedFiles = await Promise.all(files.map(f => compressImage(f)));
    const result = await getMealAnalysis(compressedFiles, selectedPortion);

    // ── Analytics — vision scan completed ─────────────────
    try {
      const { supabase } = await import('../lib/supabase.js');
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;
      const detections = result.foods || [];
      trackEvent('food_scan_completed', { userId, foodCount: detections.length, source: 'vision' });
    } catch { /* analytics never blocks the scan */ }

    // ── Meal memory check ─────────────────────────────────
    const hash = generateMealHash(result.foods || []);
    const memory = await checkMealMemory(hash);

    if (memory && memory.scan_count >= 2) {
      // Show memory prompt instead of full results
      card.innerHTML = `
                <div style="padding:var(--space-5);">
                    <div style="margin-bottom:var(--space-3);color:var(--text-tertiary);">${icons.sparkle}</div>
                    <h4 style="margin-bottom:var(--space-1);">Looks familiar!</h4>
                    <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-1);">
                        This looks like <strong>${esc(memory.meal_name)}</strong>
                    </p>
                    <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:var(--space-4);">
                        You've had this ${Number(memory.scan_count) || 0} times · Avg ${Math.round(Number(memory.avg_calories) || 0)} cal
                    </p>
                    <div style="display:flex;gap:var(--space-2);">
                        <button type="button" id="memory-confirm-btn" class="btn btn-primary" style="flex:1;">Log as usual</button>
                        <button type="button" id="memory-edit-btn" class="btn btn-outline" style="flex:1;">Edit</button>
                    </div>
                </div>
            `;

      document.getElementById('memory-confirm-btn')?.addEventListener('click', async () => {
        try {
          await meals.log({
            name: memory.meal_name,
            calories: memory.avg_calories,
            protein: result.food?.protein || 0,
            carbs: result.food?.carbs || 0,
            fat: result.food?.fat || 0,
            fiber: result.food?.fiber || 0,
            foods: memory.foods,
          });
          await saveMealMemory(hash, memory.meal_name, result.foods, memory.avg_calories);
          showToast(`${memory.meal_name} logged — ${memory.avg_calories} cal`);
          card.innerHTML = `
                        <div style="padding:var(--space-4);text-align:center;">
                            <div style="margin-bottom:var(--space-2);color:var(--viz-green);display:flex;justify-content:center;">${icons.check}</div>
                            <p style="font-size:var(--text-sm);color:var(--text-secondary);">Logged successfully</p>
                        </div>
                    `;
        } catch (err) {
          console.warn('[MealMemory] Log failed:', err.message);
          showToast("Couldn't log this meal. Check your connection and try again.");
        }
      });

      document.getElementById('memory-edit-btn')?.addEventListener('click', () => {
        showNormalResults(result, hash, reader, resultsDiv, card);
      });

      return;
    }

    // ── Normal flow ───────────────────────────────────────
    showNormalResults(result, hash, reader, resultsDiv, card);

  } catch (err) {
    console.error('[MealScan] Processing error:', err);
    card.innerHTML = `
            <div class="empty-state" role="alert" style="border:2px dashed var(--error);border-radius:var(--radius-xl);">
                <div style="color:var(--viz-amber);display:flex;justify-content:center;">${icons.alert}</div>
                <h3>Couldn't analyze this meal</h3>
                <p>${esc(friendlyScanMessage(err))}</p>
                <button type="button" class="btn btn-sm" id="meal-scan-retry">Try again</button>
            </div>
        `;
    document.getElementById('meal-scan-retry')?.addEventListener('click', () => renderFoodScanner());
    showToast("Couldn't analyze this meal.");
  }
}

// Messages written for people pass through; anything else (status codes,
// upstream error strings) becomes a plain-language fallback.
function friendlyScanMessage(err) {
  const m = err?.message || '';
  if (/try a (clearer|different) photo|no food detected|sufficient confidence|couldn't (read|process) that image/i.test(m)) return m;
  return 'Check your connection and try again with a clear, well-lit photo.';
}

async function showNormalResults(result, hash, reader, resultsDiv, card) {
  card.innerHTML = `
        <div class="scanner-preview" style="aspect-ratio:auto;padding:0;position:relative;">
            <img id="food-preview-img-done" alt="Scanned food" style="width:100%;height:200px;object-fit:cover;display:block;">
            <canvas id="food-box-overlay" style="position:absolute;top:0;left:0;width:100%;height:200px;pointer-events:none;"></canvas>
            <div style="position:absolute;top:var(--space-3);right:var(--space-3);">
                <div class="badge badge-green">${icons.check} Analyzed</div>
            </div>
        </div>
    `;

  const imgDone = document.getElementById('food-preview-img-done');
  if (imgDone) {
    imgDone.src = reader.result;
    imgDone.onload = () => { drawDetectionOverlay(imgDone, result.foods || []); };
  }

  resultsDiv.classList.remove('hidden');
  resultsDiv.innerHTML = renderFoodResults(result);
  setupPortionSliders(result, hash);
  setupItemActions(result);
  setupCorrectionHandlers(result);
  resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast('Meal analyzed! Adjust portions if needed.');
  applyCorrectionsUI(result.foods || []);

  // TCM toggle
  const tcmToggle = document.getElementById('tcm-toggle');
  tcmToggle?.addEventListener('click', () => {
    const body = document.getElementById('tcm-body');
    const chevron = document.getElementById('tcm-chevron');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    tcmToggle.setAttribute('aria-expanded', String(!isOpen));
    if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
  });

  // Load TCM constitution profile
  loadTCMConstitution();
}

// ─── Product Scan ─────────────────────────────────────────────

function setupProductScan() {
  document.getElementById('btn-start-camera')?.addEventListener('click', async () => {
    const video = document.getElementById('barcode-video');
    try {
      cameraStream = await initCamera(video);
      stopScanning = await startBarcodeScanner(video, handleBarcodeDetected);
      const startBtn = document.getElementById('btn-start-camera');
      if (startBtn) { startBtn.textContent = 'Scanning...'; startBtn.disabled = true; }
    } catch (err) {
      console.warn('[ProductScan] Camera unavailable:', err.message);
      releaseScannerResources();
      resetCameraButton();
      showProductError("We couldn't access the camera. Allow camera access in your browser settings, or type the barcode below.");
    }
  });

  document.getElementById('btn-manual-lookup')?.addEventListener('click', () => {
    const input = document.getElementById('manual-barcode');
    const barcode = input?.value?.trim();
    if (barcode && barcode.length >= 8) handleBarcodeDetected(barcode);
  });

  document.getElementById('manual-barcode')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-manual-lookup')?.click();
  });

  document.getElementById('btn-capture-label')?.addEventListener('click', () => {
    document.getElementById('ocr-file-input')?.click();
  });

  document.getElementById('ocr-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await handleOcrCapture(file);
  });

  document.getElementById('btn-try-again')?.addEventListener('click', () => {
    document.getElementById('product-scan-error').classList.add('hidden');
  });
}

async function handleBarcodeDetected(barcode) {
  if (cameraStream) { stopCamera(cameraStream); cameraStream = null; }
  if (stopScanning) { stopScanning(); stopScanning = null; }
  resetCameraButton();
  showProductLoading(`Looking up barcode: ${barcode}...`);
  try {
    const result = await lookupBarcode(barcode);
    try {
      await productScans.log({ barcode: result.product.barcode, name: result.product.name, brand: result.product.brand, score: result.healthScore.score, rating: result.healthScore.rating, nutrition: result.product.nutrition, additives: result.additives, scanType: 'barcode' });
    } catch (dbErr) {
      console.error('[ProductScan] Failed to save:', dbErr.message);
      showToast("We found the product but couldn't save it to your history.");
    }
    window._lastProductScan = result;
    location.hash = '#/product-results';
  } catch (err) {
    console.warn('[ProductScan] Lookup failed:', err.message);
    const notFound = /not found|404/i.test(err.message || '');
    showProductError(notFound
      ? "We couldn't find this barcode in the product database. Check the number, or capture the nutrition label instead."
      : "Couldn't look up this product right now. Check your connection and try again.");
  }
}

async function handleOcrCapture(file) {
  showProductLoading('Analyzing nutrition label...');
  try {
    const ocrResult = await parseNutritionLabel(file);
    const scoreResult = await getHealthScore(ocrResult.nutrition, []);
    try {
      await productScans.log({ barcode: 'OCR-SCAN', name: 'Scanned Product', score: scoreResult.score, rating: scoreResult.rating, nutrition: ocrResult.nutrition, scanType: 'ocr' });
    } catch (dbErr) {
      console.error('[OCR] Failed to save:', dbErr.message);
      showToast("We read the label but couldn't save it to your history.");
    }
    window._lastProductScan = { product: { barcode: 'OCR-SCAN', name: 'Scanned Product', brand: '', ingredients: '', nutrition: ocrResult.nutrition, nutriscore: null, nova_group: null, image_url: null }, healthScore: scoreResult, additives: { analyzed: [], summary: { total: 0, high: 0, moderate: 0, low: 0 } } };
    location.hash = '#/product-results';
  } catch (err) {
    console.warn('[OCR] Label parse failed:', err.message);
    showProductError("We couldn't read that label. Try a sharper, well-lit photo with the whole nutrition panel in frame.");
  }
}

function showProductLoading(msg) {
  document.getElementById('product-scan-loading')?.classList.remove('hidden');
  document.getElementById('product-scan-error')?.classList.add('hidden');
  const el = document.getElementById('scan-status-text');
  if (el) el.textContent = msg;
}

function showProductError(msg) {
  document.getElementById('product-scan-loading')?.classList.add('hidden');
  document.getElementById('product-scan-error')?.classList.remove('hidden');
  const el = document.getElementById('scan-error-text');
  if (el) el.textContent = msg;
}

function renderCorrectionSection(foods, food) {
  const items = foods.length ? foods : [{ name: food.name, confidence: 1 }];
  return `
    <div class="card">
      <h4 style="margin-bottom:var(--space-2);">Something wrong?</h4>
      <p style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-3);">Tap a food to correct it. Your corrections improve future scans.</p>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);">
        ${items.map((item, i) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
            <span style="font-size:var(--text-sm);">${esc(item.name)}</span>
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
function generateMealName(result) {
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

function renderFoodResults(result) {
  const { food, foods = [], combinations, healthRating, digestibilityScore } = result;
  const totalMacro = Math.round((food.protein || 0) + (food.carbs || 0) + (food.fat || 0));
  const proteinPct = totalMacro ? Math.round(((food.protein || 0) / totalMacro) * 100) : 0;
  const carbsPct = totalMacro ? Math.round(((food.carbs || 0) / totalMacro) * 100) : 0;
  const fatPct = totalMacro ? 100 - proteinPct - carbsPct : 0;

  return `
    <div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3);">
          <div>
            <h3 style="font-size:var(--text-lg);margin-bottom:var(--space-1);">${esc(food.name)}</h3>
            <span class="badge badge-teal">Health Rating: ${Math.round(healthRating || 0)}/100</span>
          </div>
          <div style="text-align:center;">
            <div id="total-calories-display" style="font-family:var(--font-heading);font-size:var(--text-3xl);font-weight:var(--weight-extrabold);color:var(--accent-teal);">${Math.round(food.calories || 0)}</div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">calories</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3);">
          <h4>Detected Foods</h4>
          <span style="font-size:var(--text-xs);color:var(--text-tertiary);">Drag to adjust portions</span>
        </div>
        <div id="portion-items" style="display:flex;flex-direction:column;gap:var(--space-4);">
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
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2);">
                <div>
                  <div class="portion-item-name" style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${esc(item.name)}</div>
                  <div style="font-size:var(--text-xs);color:var(--text-tertiary);display:flex;align-items:center;gap:var(--space-2);">
                    ${item.confidence ? `${(Number(item.confidence) * 100).toFixed(0)}% confidence` : ''}
                    ${item.confidence >= 0.85 ? '' :
                      item.confidence >= 0.60 ? `<span style="background:var(--viz-amber);color:var(--text-primary);font-size:var(--text-xs);padding:1px 6px;border-radius:4px;font-weight:600;">Uncertain</span>` :
                        `<span style="background:var(--error);color:var(--text-inverse);font-size:var(--text-xs);padding:1px 6px;border-radius:4px;font-weight:600;">Low confidence</span>`}
                  </div>
                </div>
                <div style="text-align:right;">
                  <span id="grams-display-${i}" style="font-family:var(--font-heading);font-size:var(--text-lg);font-weight:var(--weight-bold);color:var(--accent-teal);">${displayVal}</span>
                  <div id="kcal-display-${i}" style="font-size:var(--text-xs);color:var(--text-tertiary);">${Math.round(item.nutrients?.calories || 0)} kcal</div>
                </div>
              </div>
              <input type="range" id="portion-slider-${i}" min="${sliderMin}" max="${sliderMax}" step="${sliderStep}" value="${Number(baseVal) || 150}" aria-label="Portion size for ${esc(item.name)}" style="width:100%;accent-color:var(--accent-teal);cursor:pointer;" />
              <div style="display:flex;justify-content:space-between;margin-top:var(--space-1);">
                <span style="font-size:var(--text-xs);color:var(--text-tertiary);">${minLabel}</span>
                <span style="font-size:var(--text-xs);color:var(--text-tertiary);">${anchors}</span>
                <span style="font-size:var(--text-xs);color:var(--text-tertiary);">${maxLabel}</span>
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
    <div id="add-food-results" aria-live="polite" style="margin-top:var(--space-2);display:flex;flex-direction:column;gap:var(--space-2);"></div>
  </div>
  <button type="button" id="add-missing-food-btn" aria-expanded="false" aria-controls="add-food-search" style="width:100%;padding:var(--space-2);border-radius:var(--radius-md);border:1px dashed var(--border);background:transparent;color:var(--text-secondary);font-size:var(--text-xs);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:var(--space-2);">
    <span style="font-size:16px;" aria-hidden="true">+</span> Add missing food
  </button>
</div>
      </div>

      <div class="card">
        <h4 style="margin-bottom:var(--space-4);">Macronutrients</h4>
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
          <div style="flex:1;">
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
        <h4 style="margin-bottom:var(--space-3);">Micronutrients</h4>
        ${food.micronutrients.map(m => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) 0;">
            <span style="font-size:var(--text-sm);color:var(--text-secondary);">${esc(m.name)}</span>
            <div style="display:flex;align-items:center;gap:var(--space-3);">
              <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${esc(m.amount)}</span>
              <div style="width:60px;"><div class="progress-bar" style="height:4px;"><div class="progress-fill" style="width:${Math.min(100, Number(m.rda) || 0)}%;background:${m.rda >= 80 ? 'var(--viz-green)' : m.rda >= 40 ? 'var(--viz-amber)' : 'var(--error)'}"></div></div></div>
              <span style="font-size:var(--text-xs);color:var(--text-tertiary);min-width:32px;text-align:right;">${Number(m.rda) || 0}%</span>
            </div>
          </div>
        `).join('')}
        <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-3);text-align:center;">% of Recommended Daily Allowance</p>
      </div>` : ''}

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <h4 style="margin-bottom:var(--space-1);">Digestibility Score</h4>
            <p style="font-size:var(--text-xs);">How easily your body can process this meal</p>
          </div>
          <div style="font-family:var(--font-heading);font-size:var(--text-2xl);font-weight:var(--weight-bold);color:${(digestibilityScore || 0) >= 80 ? 'var(--accent-green)' : 'var(--accent-amber)'};">${Math.round(digestibilityScore || 0)}%</div>
        </div>
      </div>

      <div class="section-heading"><h3>Food Combination Analysis</h3></div>
      ${(combinations || []).map(c => renderComboCard(c)).join('')}

      <div class="section-heading"><h3>Eastern Medicinal Analysis</h3></div>
      ${renderTCMAnalysis(foods)}
      <div id="tcm-constitution-card"></div>

      <button type="button" id="confirm-save-btn" class="btn btn-primary btn-block" style="margin-top:var(--space-2);">
        Confirm & Save to Health Log
      </button>
      <p style="font-size:var(--text-xs);color:var(--text-tertiary);text-align:center;margin-top:calc(-1 * var(--space-2));">
        Adjust portions above before saving
      </p>
      ${renderCorrectionSection(foods, food)}
    </div>
  `;
}

async function applyCorrectionsUI(foods) {
  try {
    const { supabase } = await import('../lib/supabase.js');
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

function setupPortionSliders(result, hash = null) {
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
            const { supabase } = await import('../lib/supabase.js');
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

function setupItemActions(result) {
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
          actionDiv.innerHTML = `<p style="font-size:var(--text-xs);color:var(--text-tertiary);">Removed from total <button type="button" class="item-action-undo" style="font-size:var(--text-xs);color:var(--accent-teal);background:none;border:none;cursor:pointer;">Undo</button></p>`;
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
  resultsDiv.innerHTML = `<div style="font-size:var(--text-xs);color:var(--text-tertiary);">Searching...</div>`;

  try {
    const res = await apiFetch(`/api/nutrition/search?query=${encodeURIComponent(query)}&grams=150`);
    if (res.status === 404) {
      resultsDiv.innerHTML = `<div style="font-size:var(--text-xs);color:var(--text-secondary);">No match for "${esc(query)}" — try a simpler name like "chicken" or "rice"</div>`;
      return;
    }
    if (!res.ok) throw new Error(`Search failed (${res.status})`);
    const nutrition = await res.json();

    resultsDiv.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
        <div>
          <div style="font-size:var(--text-sm);font-weight:600;">${esc(nutrition.name)}</div>
          <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${Math.round(Number(nutrition.calories) || 0)} kcal · ${Math.round(Number(nutrition.protein) || 0)}g protein · ${Math.round(Number(nutrition.carbs) || 0)}g carbs · ${Math.round(Number(nutrition.fat) || 0)}g fat</div>
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
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2);">
          <div>
            <div class="portion-item-name" style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${esc(nutrition.name)}</div>
            <div style="font-size:var(--text-xs);color:var(--accent-green);">Added manually</div>
          </div>
          <div style="text-align:right;">
            <span id="grams-display-${newIndex}" style="font-family:var(--font-heading);font-size:var(--text-lg);font-weight:var(--weight-bold);color:var(--accent-teal);">${grams}g</span>
            <div id="kcal-display-${newIndex}" style="font-size:var(--text-xs);color:var(--text-tertiary);">${Math.round(nutrition.calories)} kcal</div>
          </div>
        </div>
        <input type="range" id="portion-slider-${newIndex}" min="20" max="600" step="5" value="${Number(grams) || 150}" aria-label="Portion size for ${esc(nutrition.name)}" style="width:100%;accent-color:var(--accent-teal);cursor:pointer;" />
        <div style="display:flex;justify-content:space-between;margin-top:var(--space-1);">
          <span style="font-size:var(--text-xs);color:var(--text-tertiary);">20g</span>
          <span style="font-size:var(--text-xs);color:var(--text-tertiary);">Taste · Small · Medium · Large · XL</span>
          <span style="font-size:var(--text-xs);color:var(--text-tertiary);">600g</span>
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
        <h3 style="font-size:var(--text-sm);">Couldn't search for foods</h3>
        <p style="font-size:var(--text-xs);">Check your connection and try again.</p>
        <button type="button" class="btn btn-sm" id="add-food-retry">Try again</button>
      </div>`;
    document.getElementById('add-food-retry')?.addEventListener('click', () => searchAndAddFood(query, resultsDiv, result));
  }
}

// ─── Render helpers ───────────────────────────────────────────

function renderMemoryCard(memory) {
  const scannedAgo = memory.last_scanned_at
    ? (() => {
        const days = Math.floor((Date.now() - new Date(memory.last_scanned_at)) / 86400000);
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
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${Math.round(Number(memory.avg_calories) || 0)} cal avg · ${Number(memory.scan_count) || 0}x scanned · ${scannedAgo}</div>
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

function cleanMealName(name) {
  if (!name) return 'Meal';
  return name
    .split('&').slice(0, 3).map(part =>
      part
        .replace(/,.*$/, '')                                    // drop USDA technical descriptors after comma
        .replace(/\b(raw|cooked|frozen|canned|dried|NFS|NS|USDA|grade|includes?|skin|bone(less)?|fat)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .join(' & ')
    .replace(/^./, c => c.toUpperCase())
    .trim() || 'Meal';
}

function renderMealCard(meal) {
  const time = meal.logged_at
    ? new Date(meal.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : meal.timestamp
      ? new Date(meal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
  const displayName = cleanMealName(meal.name);
  return `
    <div class="card card-sm">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;align-items:center;gap:var(--space-3);">
          <div style="width:36px;height:36px;border-radius:var(--radius-md);background:var(--accent-teal-dim);display:flex;align-items:center;justify-content:center;font-size:18px;">${icons.leaf}</div>
          <div>
            <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${esc(displayName)}</div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${time} • P:${Math.round(meal.protein || 0)}g C:${Math.round(meal.carbs || 0)}g F:${Math.round(meal.fat || 0)}g</div>
          </div>
        </div>
        <div style="font-family:var(--font-heading);font-weight:var(--weight-bold);color:var(--accent-teal);">${Math.round(meal.calories || 0)}</div>
      </div>
    </div>
  `;
}

function renderEmptyMeals() {
  return `
    <div class="card" style="text-align:center;padding:var(--space-8);">
      <div style="margin-bottom:var(--space-3);color:var(--text-tertiary);display:flex;justify-content:center;">${icons.leaf}</div>
      <h4 style="margin-bottom:var(--space-2);">No meals logged yet</h4>
      <p style="font-size:var(--text-sm);">Scan your first meal to start tracking nutrition</p>
    </div>
  `;
}

function getScoreDimColor(score) {
  if (score >= 75) return 'var(--viz-green-dim)';
  if (score >= 50) return 'var(--viz-amber-dim)';
  return 'var(--error-dim)';
}

function renderProductScanCard(scan) {
  const score = Number(scan.health_score ?? scan.score) || 0;
  const color = getScoreColor(score);
  return `
    <div class="card card-sm">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;align-items:center;gap:var(--space-3);">
          <div style="width:36px;height:36px;border-radius:var(--radius-md);background:${getScoreDimColor(score)};display:flex;align-items:center;justify-content:center;color:var(--text-secondary);">${icons.barcode}</div>
          <div>
            <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${esc(scan.name)}</div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${esc(scan.brand || scan.barcode)}</div>
          </div>
        </div>
        <div style="text-align:center;">
          <div style="font-family:var(--font-heading);font-weight:var(--weight-bold);color:${color};font-size:var(--text-lg);">${score}</div>
          <div style="font-size:var(--text-xs);color:var(--text-tertiary);">${esc(scan.rating)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderEmptyScans() {
  return `
    <div class="card" style="text-align:center;padding:var(--space-6);">
      <div style="margin-bottom:var(--space-2);color:var(--text-tertiary);display:flex;justify-content:center;">${icons.barcode}</div>
      <h4 style="margin-bottom:var(--space-1);">No products scanned</h4>
      <p style="font-size:var(--text-sm);color:var(--text-secondary);">Scan a barcode or nutrition label to see results</p>
    </div>
  `;
}

function drawDetectionOverlay(imgEl, foods) {
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

async function checkNutritionalGaps() {
  console.log('[NutritionalGap] Checking gaps...');
  try {
    const today = await dailyNutrition.get();
    const gaps = [];

    // Fetch personalized targets from health profile
    let targets = null; // only real targets from the user's profile — never a placeholder
    let activeSupplements = [];
    let todayMealText = '';

    try {
      const { supabase } = await import('../lib/supabase.js');
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
            <div style="font-size:var(--text-xs);color:var(--text-secondary);">${warn.risk}</div>
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
          <div style="font-size:var(--text-xs);color:var(--text-secondary);">${esc(gap.suggestion)}</div>
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
