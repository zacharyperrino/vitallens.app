// Traditional Chinese Medicine food table, matcher, and the meal-level TCM cards.
import { esc } from '../../utils/esc.js';
import { apiFetch } from '../../utils/api.js';

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

export function matchTCM(foodName) {
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

export function renderTCMAnalysis(foods) {
  if (!foods || foods.length === 0) return '';

  const analyzed = foods.map(f => {
    const tcm = matchTCM(f.name || f.label || '');
    return tcm ? { name: f.name || f.label, ...tcm } : null;
  }).filter(Boolean);

  if (analyzed.length === 0) {
    return `<div class="card" style="text-align:center;padding:var(--space-4);">
      <p class="text-tertiary text-xs">No TCM data available for these foods</p>
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
    <div class="card mb-3">
      <button type="button" id="tcm-toggle" aria-expanded="false" aria-controls="tcm-body" style="display:flex;justify-content:space-between;align-items:center;width:100%;cursor:pointer;text-align:left;padding:0;">
        <div style="display:flex;gap:var(--space-2);">
          <span style="padding:1px 8px;border-radius:20px;font-size:var(--text-xs);font-weight:600;background:${tc.bg};border:1px solid ${tc.border};color:${tc.text};">${tc.label}</span>
          <span style="padding:1px 8px;border-radius:20px;font-size:var(--text-xs);font-weight:600;background:var(--surface-2);color:var(--text-secondary);border:1px solid var(--border);">${overallMoisture}</span>
        </div>
        <span id="tcm-chevron" aria-hidden="true" style="color:var(--text-tertiary);font-size:12px;transition:transform 0.2s;">▼</span>
        <span class="visually-hidden">Show details for each food</span>
      </button>
      <div id="tcm-body" style="display:none;margin-top:var(--space-3);">
        <div class="flex-col gap-3">
          ${analyzed.map(f => {
            const tc = THERMAL_COLORS[f.thermal] || THERMAL_COLORS.neutral;
            const mc = MOISTURE_COLORS[f.moisture] || MOISTURE_COLORS.neutral;
            return `
            <div style="border-left:2px solid ${tc.border};padding-left:var(--space-3);">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
                <span class="font-semibold text-sm">${esc(f.name)}</span>
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
        <p class="disclaimer mt-3 text-center">
          Based on Traditional Chinese Medicine principles. Not medical advice.
        </p>
      </div>
    </div>`;
}

export async function loadTCMConstitution() {
  const card = document.getElementById('tcm-constitution-card');
  if (!card) return;
  try {
    const { supabase } = await import('../../lib/supabase.js');
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
          <div class="font-semibold text-secondary text-xs">Your TCM Constitution</div>
          <span class="text-tertiary text-xs">${Number(profile.total_foods_analyzed) || 0} foods analyzed</span>
        </div>
        <div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);color:${thermalColor};margin-bottom:2px;">${esc(profile.thermalType)} · ${esc(profile.moistureType)}</div>
        <div class="text-secondary text-xs">Dominant: ${esc(profile.dominantFlavor)} flavor ${esc(profile.dominantOrganSystem)}</div>
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
