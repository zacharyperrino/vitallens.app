import { supabase } from '../lib/supabase.js';
import { apiFetch } from '../utils/api.js';
import { showToast } from '../utils/toast.js';
import { esc } from '../utils/esc.js';
import { CONDITIONS, GOAL_OPTIONS, inchesToCm, lbsToKg, kgToLbs, cmToInches } from '../utils/profile-shared.js';
import { todayLocalISO } from '../utils/dates.js';

const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

function plainReason(err) {
  const msg = String(err?.message || '');
  if (/not authenticated|jwt|session|signed in/i.test(msg)) return 'You need to be signed in to see your profile.';
  if (/failed to fetch|networkerror|load failed|network|timeout/i.test(msg)) return 'Check your connection and try again.';
  return 'Something went wrong on our side. Nothing was changed — please try again.';
}

export async function renderProfile() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="profile stagger-children">
      <div class="page-header"><h1>Profile</h1><p>Loading your profile…</p></div>
      <div class="flex justify-center" style="padding:var(--space-8);" role="status" aria-label="Loading"><div class="spinner"></div></div>
    </div>`;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error('You must be signed in to view your profile.');

    const profileResponse = await apiFetch(`/api/health-profile?userId=${encodeURIComponent(user.id)}`);
    // A failed load must NOT render an empty form — the next save would overwrite the real row with blanks.
    if (!profileResponse.ok) throw new Error(`Server responded ${profileResponse.status}`);
    const profileJson = await profileResponse.json();
    // Name lives on the profiles table (not health_profile) — read it there.
    let name = '';
    try {
      const { data: prof } = await supabase.from('profiles').select('name').eq('id', user.id).single();
      name = prof?.name || '';
    } catch { /* non-blocking */ }
    const profile = normalizeProfileData({ ...(profileJson.profile || {}), name });
    renderProfileForm(profile, user);
  } catch (error) {
    console.error('[Profile] Load failed', error);
    content.innerHTML = `
      <div class="profile stagger-children">
        <div class="page-header"><h1>Profile</h1></div>
        <div class="empty-state" role="alert">
          <h2 class="h3">Couldn't load your profile</h2>
          <p>${plainReason(error)}</p>
          <button type="button" class="btn btn-sm" id="profile-retry">Try again</button>
        </div>
      </div>`;
    document.getElementById('profile-retry')?.addEventListener('click', () => renderProfile());
  }
}

// Maps the snake_case health_profile row (the DB's real columns) onto the
// form's internal camelCase model. Height/weight are always stored in cm/kg.
// Missing values stay 0/empty — nothing is invented for the user.
function normalizeProfileData(profile) {
  return {
    name: profile.name || '',
    email: profile.email || '',
    age: Number(profile.age) || 0,
    sex: profile.sex || '',
    height: Number(profile.height_cm) || 0,
    weight: Number(profile.weight_kg) || 0,
    goalWeight: Number(profile.goal_weight_kg) || 0,
    heightUnit: 'cm',
    weightUnit: 'kg',
    activityLevel: profile.activity_level || '',
    liftingSessions: parseInt(profile.lifting_frequency, 10) || 0,
    primaryGoal: profile.goal || '',
    calorieTarget: Number(profile.target_calories ?? profile.custom_calories) || 0,
    proteinTarget: Number(profile.target_protein) || 0,
    carbsTarget: Number(profile.target_carbs) || 0,
    fatTarget: Number(profile.target_fat) || 0,
    fiberTarget: Number(profile.target_fiber) || 0,
    conditions: Array.isArray(profile.conditions) ? profile.conditions : profile.conditions ? safeParseConditions(profile.conditions) : [],
    allergies: profile.allergies || '',
  };
}

function safeParseConditions(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderProfileForm(profile, user) {
  const heightCm = profile.heightUnit === 'cm' ? profile.height : inchesToCm(profile.height);
  const weightKg = profile.weightUnit === 'kg' ? profile.weight : lbsToKg(profile.weight);
  const bmr = calculateBmr(weightKg, heightCm, profile.age, profile.sex);
  const tdee = calculateTdee(bmr, profile.activityLevel);

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="profile stagger-children">
      <div class="page-header"><h1>Profile</h1><p>Manage your body stats, health goals, and nutrition targets.</p></div>
      <div class="card mb-5">
        <div class="flex-between flex-wrap gap-3">
          <div>
            <div class="mb-1 text-secondary text-sm">Signed in as ${esc(user.email || 'unknown')}</div>
            <h2 class="m-0">${esc(profile.name || 'Your health profile')}</h2>
          </div>
          <div class="flex gap-3 flex-wrap items-center" aria-live="polite">
            <div class="text-right" style="min-width:140px;">
              <div class="text-secondary text-xs">Estimated BMR</div>
              <div id="profile-bmr-value" class="text-xl" style="font-weight:700;">${bmr ? Math.round(bmr) : '—'}</div>
            </div>
            <div class="text-right" style="min-width:140px;">
              <div class="text-secondary text-xs">Estimated daily burn (TDEE)</div>
              <div id="profile-tdee-value" class="text-xl" style="font-weight:700;">${tdee ? Math.round(tdee) : '—'}</div>
            </div>
          </div>
        </div>
        <p class="disclaimer mt-3">Estimates from the Mifflin-St Jeor formula using the stats below. They update as you edit, and are only saved if you choose to use them as targets.</p>
      </div>

      <form id="profile-form" class="card flex-col gap-5">
        <div>
          <h2 class="h4 mb-4">Basic stats</h2>
          <div class="grid-2 gap-3">
            <div class="input-group"><label for="p-name">Name</label><input class="input-field" type="text" id="p-name" value="${esc(profile.name)}" placeholder="Your name" autocomplete="name"></div>
            <div class="input-group"><label for="p-age">Age</label><input class="input-field" type="number" min="18" max="120" id="p-age" value="${profile.age || ''}" placeholder="Age"></div>
          </div>

          <div class="grid-3 gap-3 mt-3">
            <div class="input-group"><label for="p-sex">Sex</label>
              <select class="input-field" id="p-sex">
                <option value="">Select…</option>
                <option value="male" ${profile.sex === 'male' ? 'selected' : ''}>Male</option>
                <option value="female" ${profile.sex === 'female' ? 'selected' : ''}>Female</option>
                <option value="other" ${profile.sex === 'other' ? 'selected' : ''}>Other</option>
              </select>
            </div>
            <div class="input-group"><label for="p-activity-level">Activity level</label>
              <select class="input-field" id="p-activity-level">
                <option value="" disabled ${profile.activityLevel ? '' : 'selected'}>Select…</option>
                <option value="sedentary" ${profile.activityLevel === 'sedentary' ? 'selected' : ''}>Sedentary</option>
                <option value="light" ${profile.activityLevel === 'light' ? 'selected' : ''}>Light</option>
                <option value="moderate" ${profile.activityLevel === 'moderate' ? 'selected' : ''}>Moderate</option>
                <option value="active" ${profile.activityLevel === 'active' ? 'selected' : ''}>Active</option>
                <option value="very_active" ${profile.activityLevel === 'very_active' ? 'selected' : ''}>Very active</option>
              </select>
            </div>
            <div class="input-group"><label for="p-primary-goal">Primary goal</label>
              <select class="input-field" id="p-primary-goal">
                <option value="">Select…</option>
                ${GOAL_OPTIONS.map(option => `<option value="${option}" ${profile.primaryGoal === option ? 'selected' : ''}>${option}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="grid-3-stats gap-3 mt-3">
            <div class="input-group">
              <label for="p-height">Height</label>
              <div class="unit-row">
                <input class="input-field" type="number" min="0" id="p-height" value="${profile.height || ''}" placeholder="Height">
                <select class="input-field" id="p-height-unit" aria-label="Height unit">
                  <option value="cm" ${profile.heightUnit === 'cm' ? 'selected' : ''}>cm</option>
                  <option value="in" ${profile.heightUnit === 'in' ? 'selected' : ''}>in</option>
                </select>
              </div>
            </div>
            <div class="input-group">
              <label for="p-weight">Current weight</label>
              <div class="unit-row">
                <input class="input-field" type="number" min="0" id="p-weight" value="${profile.weight || ''}" placeholder="Weight">
                <select class="input-field" id="p-weight-unit" aria-label="Weight unit">
                  <option value="kg" ${profile.weightUnit === 'kg' ? 'selected' : ''}>kg</option>
                  <option value="lb" ${profile.weightUnit === 'lb' ? 'selected' : ''}>lb</option>
                </select>
              </div>
            </div>
            <div class="input-group">
              <label for="p-goal-weight">Goal weight</label>
              <div class="unit-row">
                <input class="input-field" type="number" min="0" id="p-goal-weight" value="${profile.goalWeight || ''}" placeholder="Goal weight">
                <span id="p-goal-weight-unit" class="text-secondary text-sm">${profile.weightUnit}</span>
              </div>
            </div>
          </div>

          <div class="mt-4">
            <label for="p-lifting-sessions" class="block mb-2">Lifting sessions per week: <strong id="p-lifting-count">${profile.liftingSessions}</strong></label>
            <input type="range" id="p-lifting-sessions" min="0" max="7" value="${profile.liftingSessions}" class="w-full">
          </div>
        </div>

        <div>
          <h2 class="h4 mb-4">Nutrition targets</h2>
          <div class="grid-2 gap-3 mb-3">
            <div class="input-group"><label for="p-calorie-target">Calorie target (kcal/day)</label><input class="input-field" type="number" min="0" id="p-calorie-target" value="${profile.calorieTarget || ''}" placeholder="e.g. 2200"></div>
            <div class="input-group"><label for="p-fiber-target">Fiber target (g)</label><input class="input-field" type="number" min="0" id="p-fiber-target" value="${profile.fiberTarget || ''}" placeholder="e.g. 30"></div>
          </div>
          <div id="p-calorie-suggestion" class="disclaimer" aria-live="polite" style="margin-bottom:var(--space-3);${tdee ? '' : 'display:none;'}">
            Suggested from your stats: about <strong id="p-suggested-calories">${tdee ? Math.round(tdee) : ''}</strong> kcal/day.
            <button type="button" class="btn btn-sm" id="p-use-suggested-calories" style="margin-left:var(--space-2);">Use this</button>
          </div>
          <p id="p-activity-hint" class="disclaimer" style="margin-bottom:var(--space-3);${profile.activityLevel ? 'display:none;' : ''}">Set your activity level to get a target.</p>
          <div class="grid-3 gap-3">
            <div class="input-group"><label for="p-protein-target">Protein target (g)</label><input class="input-field" type="number" min="0" id="p-protein-target" value="${profile.proteinTarget || ''}" placeholder="g"></div>
            <div class="input-group"><label for="p-carbs-target">Carbs target (g)</label><input class="input-field" type="number" min="0" id="p-carbs-target" value="${profile.carbsTarget || ''}" placeholder="g"></div>
            <div class="input-group"><label for="p-fat-target">Fat target (g)</label><input class="input-field" type="number" min="0" id="p-fat-target" value="${profile.fatTarget || ''}" placeholder="g"></div>
          </div>
          <p class="disclaimer mt-3">Leave a target blank if you don't want to track it. Only what you enter here is saved.</p>
        </div>

        <div>
          <h2 class="h4 mb-4">Pre-existing conditions</h2>
          <fieldset class="p-0 m-0" style="border:0;min-width:0;">
            <legend class="visually-hidden">Conditions you'd like noted</legend>
            <div class="grid-2 gap-2">
              ${CONDITIONS.map((condition, i) => `
                <label for="p-cond-${i}" class="condition-toggle flex items-center gap-2 p-2 border rounded-md cursor-pointer">
                  <input class="input-checkbox condition-checkbox" id="p-cond-${i}" type="checkbox" value="${condition}" ${profile.conditions.includes(condition) ? 'checked' : ''}>
                  <span class="text-sm">${condition}</span>
                </label>
              `).join('')}
            </div>
          </fieldset>
        </div>

        <div>
          <h2 class="h4 mb-4">Allergies</h2>
          <div class="input-group"><label for="p-allergies">Allergies</label><textarea class="input-field" id="p-allergies" rows="4" placeholder="List any allergies…">${esc(profile.allergies)}</textarea></div>
        </div>

        <button type="submit" id="save-profile-btn" class="btn btn-glass btn-block">Save profile</button>
        <button type="button" id="sign-out-btn" class="btn w-full mt-3 bg-surface-2 border text-secondary">Sign out</button>
      </form>

      <div class="card mt-5">
        <h2 class="h4 mb-3">Subscription</h2>
        <div id="billing-status" class="disclaimer" aria-live="polite">Checking your plan…</div>
        <div id="billing-actions" class="flex gap-3 flex-wrap mt-3"></div>
        <p class="disclaimer mt-3">Free includes 5 food scans and 10 AI chats a day. Premium removes those limits. Cancel anytime.</p>
      </div>

      <div class="card mt-5">
        <h2 class="h4 mb-3">AI usage</h2>
        <div id="usage-status" class="disclaimer" aria-live="polite">Checking your usage…</div>
      </div>

      <div class="card mt-5">
        <h2 class="h4 mb-3">Wearables</h2>
        <div id="oura-status" class="disclaimer" aria-live="polite">Checking…</div>
        <div class="mt-3"><button type="button" class="btn btn-sm" id="oura-connect-btn">Connect Oura Ring</button></div>
      </div>

      <div class="card mt-5">
        <h2 class="h4 mb-3">Notifications</h2>
        <div class="flex-between gap-3">
          <span id="notif-state" class="disclaimer" aria-live="polite"></span>
          <button type="button" class="btn btn-sm" id="notif-toggle"></button>
        </div>
      </div>

      <div class="card mt-5">
        <h2 class="h4 mb-3">Security</h2>
        <div id="mfa-section" aria-live="polite"><span class="disclaimer">Checking two-factor status…</span></div>
      </div>

      <div class="card mt-5">
        <h2 class="h4 mb-3">Your data</h2>
        <p class="disclaimer">Download everything VitalLens holds about you as JSON, or permanently delete your account and all of its data.</p>
        <div class="flex gap-3 flex-wrap mt-3">
          <button type="button" class="btn btn-sm" id="export-data-btn">Export my data</button>
          <button type="button" class="btn btn-sm text-error" id="delete-account-btn" aria-expanded="false" aria-controls="delete-confirm" style="border:1px solid var(--error);">Delete my account</button>
        </div>
        <div id="delete-confirm" hidden class="mt-3">
          <label for="delete-email" class="disclaimer">Type your account email to confirm. This cannot be undone.</label>
          <input class="input-field mt-2" id="delete-email" type="email" autocomplete="off">
          <button type="button" class="btn btn-sm mt-2 text-error" id="delete-account-confirm" style="border:1px solid var(--error);">Permanently delete</button>
        </div>
      </div>
    </div>`;

  attachProfileHandlers(profile, user.id);
}

function attachProfileHandlers(profile, userId) {
  const bmrValueEl = document.getElementById('profile-bmr-value');
  const tdeeValueEl = document.getElementById('profile-tdee-value');
  const calorieInput = document.getElementById('p-calorie-target');
  const suggestionEl = document.getElementById('p-calorie-suggestion');
  const suggestedEl = document.getElementById('p-suggested-calories');
  const activityHintEl = document.getElementById('p-activity-hint');
  let suggestedCalories = null;

  function getNumberValue(id) {
    return Number(document.getElementById(id)?.value || 0);
  }

  // Blank stays blank (null) — a 0 target is not the same as "no target".
  function getOptionalNumber(id) {
    const raw = document.getElementById(id)?.value;
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function convertValue(value, fromUnit, toUnit, type) {
    if (!value || fromUnit === toUnit) return value;
    if (type === 'weight') {
      return toUnit === 'kg' ? lbsToKg(value) : kgToLbs(value);
    }
    if (type === 'height') {
      return toUnit === 'cm' ? inchesToCm(value) : cmToInches(value);
    }
    return value;
  }

  function roundValue(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  }

  // Recomputes the estimates shown in the header and the suggestion line.
  // It never writes into the calorie input — the user decides what to keep.
  function updateCalculatedTargets() {
    const height = getNumberValue('p-height');
    const weight = getNumberValue('p-weight');
    const age = getNumberValue('p-age');
    const sex = document.getElementById('p-sex')?.value || '';
    const activityLevel = document.getElementById('p-activity-level')?.value || '';
    const heightUnit = document.getElementById('p-height-unit')?.value || 'cm';
    const weightUnit = document.getElementById('p-weight-unit')?.value || 'kg';

    const heightCm = heightUnit === 'cm' ? height : inchesToCm(height);
    const weightKg = weightUnit === 'kg' ? weight : lbsToKg(weight);
    const bmr = calculateBmr(weightKg, heightCm, age, sex);
    const tdee = calculateTdee(bmr, activityLevel);
    if (bmrValueEl) bmrValueEl.textContent = bmr ? Math.round(bmr) : '—';
    if (tdeeValueEl) tdeeValueEl.textContent = tdee ? Math.round(tdee) : '—';

    suggestedCalories = tdee ? Math.round(tdee) : null;
    if (suggestionEl) suggestionEl.style.display = suggestedCalories ? '' : 'none';
    if (suggestedEl) suggestedEl.textContent = suggestedCalories ?? '';
    if (activityHintEl) activityHintEl.style.display = activityLevel ? 'none' : '';
  }
  updateCalculatedTargets();

  ['p-height', 'p-weight', 'p-age', 'p-sex', 'p-activity-level'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateCalculatedTargets);
    document.getElementById(id)?.addEventListener('change', updateCalculatedTargets);
  });

  document.getElementById('p-use-suggested-calories')?.addEventListener('click', () => {
    if (!suggestedCalories || !calorieInput) return;
    calorieInput.value = suggestedCalories;
    calorieInput.focus();
  });

  const heightUnitInput = document.getElementById('p-height-unit');
  const weightUnitInput = document.getElementById('p-weight-unit');
  const goalWeightUnitLabel = document.getElementById('p-goal-weight-unit');

  if (heightUnitInput) {
    heightUnitInput.dataset.previousUnit = heightUnitInput.value;
    heightUnitInput.addEventListener('change', event => {
      const newUnit = event.target.value;
      const oldUnit = event.target.dataset.previousUnit || 'cm';
      const heightField = document.getElementById('p-height');
      if (heightField) {
        heightField.value = roundValue(convertValue(Number(heightField.value) || 0, oldUnit, newUnit, 'height')) || '';
      }
      event.target.dataset.previousUnit = newUnit;
      updateCalculatedTargets();
    });
  }

  if (weightUnitInput) {
    weightUnitInput.dataset.previousUnit = weightUnitInput.value;
    weightUnitInput.addEventListener('change', event => {
      const newUnit = event.target.value;
      const oldUnit = event.target.dataset.previousUnit || 'kg';
      const weightField = document.getElementById('p-weight');
      const goalWeightField = document.getElementById('p-goal-weight');
      if (weightField) {
        weightField.value = roundValue(convertValue(Number(weightField.value) || 0, oldUnit, newUnit, 'weight')) || '';
      }
      if (goalWeightField) {
        goalWeightField.value = roundValue(convertValue(Number(goalWeightField.value) || 0, oldUnit, newUnit, 'weight')) || '';
      }
      if (goalWeightUnitLabel) {
        goalWeightUnitLabel.textContent = newUnit;
      }
      event.target.dataset.previousUnit = newUnit;
      updateCalculatedTargets();
    });
  }

  document.getElementById('p-lifting-sessions')?.addEventListener('input', event => {
    const value = event.target.value;
    const label = document.getElementById('p-lifting-count');
    if (label) label.textContent = value;
  });

  document.getElementById('sign-out-btn')?.addEventListener('click', async () => {
    const { signOut } = await import('./auth.js');
    await signOut();
  });

  attachAccountHandlers(userId);

  document.getElementById('profile-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const saveBtn = document.getElementById('save-profile-btn');

    const name = document.getElementById('p-name')?.value.trim() || '';
    const age = getNumberValue('p-age');
    const sex = document.getElementById('p-sex')?.value || '';
    const heightRaw = getNumberValue('p-height');
    const weightRaw = getNumberValue('p-weight');
    const heightUnit = document.getElementById('p-height-unit')?.value || 'cm';
    const weightUnit = document.getElementById('p-weight-unit')?.value || 'kg';
    const activityLevel = document.getElementById('p-activity-level')?.value || '';

    // health_profile always stores cm / kg — convert before saving.
    const height_cm = roundValue(heightUnit === 'in' ? inchesToCm(heightRaw) : heightRaw);
    const weight_kg = roundValue(weightUnit === 'lb' ? lbsToKg(weightRaw) : weightRaw);
    const goalWeightRaw = getNumberValue('p-goal-weight');
    const goal_weight_kg = goalWeightRaw > 0
      ? roundValue(weightUnit === 'lb' ? lbsToKg(goalWeightRaw) : goalWeightRaw)
      : null;

    // Payload uses the real snake_case health_profile columns. Only what is in
    // the inputs is saved — the BMR/TDEE estimates are shown, never persisted.
    const payload = {
      userId,
      sex,
      age,
      height_cm,
      weight_kg,
      goal_weight_kg,
      goal: document.getElementById('p-primary-goal')?.value || '',
      activity_level: activityLevel || null,
      lifting_frequency: String(getNumberValue('p-lifting-sessions')),
      target_calories: getOptionalNumber('p-calorie-target'),
      target_protein: getOptionalNumber('p-protein-target'),
      target_carbs: getOptionalNumber('p-carbs-target'),
      target_fat: getOptionalNumber('p-fat-target'),
      target_fiber: getOptionalNumber('p-fiber-target'),
      conditions: Array.from(document.querySelectorAll('.condition-checkbox:checked')).map(input => input.value),
      allergies: document.getElementById('p-allergies')?.value.trim() || '',
      updated_at: new Date().toISOString(),
    };

    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
    try {
      const response = await apiFetch(`/api/health-profile`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Server responded ${response.status}`);
      // Name lives on profiles (RLS lets a user update their own row).
      try { await supabase.from('profiles').update({ name }).eq('id', userId); } catch { /* non-blocking */ }
      showToast('Profile saved');
      renderProfile();
    } catch (error) {
      console.error('[Profile] Save failed', error);
      showToast("Couldn't save your profile. " + plainReason(error));
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save profile'; }
    }
  });
}

function calculateBmr(weightKg, heightCm, age, sex) {
  if (!weightKg || !heightCm || !age || !sex) return 0;
  if (sex === 'male') return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  if (sex === 'female') return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  // Mifflin-St Jeor defines only male/female constants (+5 / −161). For
  // "other" we use their midpoint (−78) — a documented convention, not a claim.
  return 10 * weightKg + 6.25 * heightCm - 5 * age - 78;
}

// No activity level → no TDEE (0). Never assumes a default level.
function calculateTdee(bmr, activityLevel) {
  if (!bmr || !ACTIVITY_FACTORS[activityLevel]) return 0;
  return bmr * ACTIVITY_FACTORS[activityLevel];
}

// ── Account sections: billing, wearables, notifications, MFA, data ──────
async function attachAccountHandlers(userId) {
  // Post-checkout / OAuth return messages
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  if (q.get('upgraded') === 'true') showToast('Welcome to Premium — your limits are lifted.');
  if (q.get('oura') === 'connected') showToast('Oura Ring connected');
  if (q.get('oura') === 'error' || q.get('oura') === 'invalid_state') showToast('Oura connection did not complete. Please try again.');

  // Subscription
  const statusEl = document.getElementById('billing-status');
  const actionsEl = document.getElementById('billing-actions');
  try {
    const res = await apiFetch('/api/billing/status');
    if (!res.ok) throw new Error(`status ${res.status}`);
    const b = await res.json();
    if (b.isPremium) {
      const until = b.currentPeriodEnd ? new Date(b.currentPeriodEnd).toLocaleDateString() : null;
      statusEl.textContent = `Premium${b.status === 'trialing' ? ' (trial)' : ''}${until ? ` · renews ${until}` : ''}`;
      actionsEl.innerHTML = '';
    } else {
      statusEl.textContent = 'Free plan';
      actionsEl.innerHTML = `
        <button type="button" class="btn btn-glass" data-plan="monthly">Upgrade — $9.99 / month</button>
        <button type="button" class="btn btn-glass" data-plan="annual">Upgrade — $79 / year</button>`;
      actionsEl.querySelectorAll('[data-plan]').forEach(btn => btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = 'Opening secure checkout…';
        try {
          const r = await apiFetch('/api/billing/create-checkout', { method: 'POST', body: JSON.stringify({ plan: btn.dataset.plan }) });
          const j = await r.json();
          if (!r.ok || !j.url) throw new Error(j.error || 'Checkout unavailable');
          window.location.href = j.url;
        } catch (err) {
          showToast(err.message || 'Could not start checkout');
          btn.disabled = false; btn.textContent = btn.dataset.plan === 'monthly' ? 'Upgrade — $9.99 / month' : 'Upgrade — $79 / year';
        }
      }));
    }
  } catch (err) {
    console.warn('[Profile] billing status unavailable', err?.message);
    statusEl.innerHTML = '<span role="alert">Couldn\'t check your plan right now. </span><button type="button" class="btn btn-sm" id="billing-retry">Try again</button>';
    document.getElementById('billing-retry')?.addEventListener('click', () => renderProfile());
  }

  // AI usage (labels, limits and windows come from the server; nothing hardcoded)
  const usageEl = document.getElementById('usage-status');
  const USAGE_WINDOW = { day: 'today', week: 'this week', month: 'this month' };
  async function renderUsage() {
    if (!usageEl) return;
    usageEl.textContent = 'Checking your usage…';
    try {
      const res = await apiFetch(`/api/usage/status?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const u = await res.json();
      if (u?.premium) { usageEl.textContent = 'Premium — AI features are unlimited.'; return; }
      const entries = Object.entries(u?.limits || {});
      if (!entries.length) { usageEl.textContent = 'No usage to show yet.'; return; }
      usageEl.innerHTML = `<ul class="p-0 m-0 flex-col gap-2" style="list-style:none;">${entries.map(([feature, f]) => {
        const count = f?.limit === 'unlimited'
          ? 'Unlimited'
          : `${esc(f?.used ?? 0)} of ${esc(f?.limit)} ${esc(USAGE_WINDOW[f?.window] || f?.window || '')}`.trim();
        return `<li class="flex-between gap-3"><span>${esc(f?.label || feature)}</span><span class="text-secondary">${count}</span></li>`;
      }).join('')}</ul>`;
    } catch (err) {
      console.warn('[Profile] usage status unavailable', err?.message);
      usageEl.innerHTML = '<span role="alert">Couldn\'t check your AI usage right now. </span><button type="button" class="btn btn-sm" id="usage-retry">Try again</button>';
      document.getElementById('usage-retry')?.addEventListener('click', () => renderUsage());
    }
  }
  renderUsage();

  // Wearables (Oura)
  const ouraEl = document.getElementById('oura-status');
  const ouraBtn = document.getElementById('oura-connect-btn');
  try {
    const { refreshOuraStatus, isOuraConnected, startOuraConnect } = await import('../utils/oura.js');
    await refreshOuraStatus(userId);
    ouraEl.textContent = isOuraConnected() ? 'Oura Ring connected — sleep and readiness sync nightly.' : 'Not connected. Connect a ring to sync sleep and readiness automatically.';
    if (isOuraConnected()) ouraBtn.style.display = 'none';
    ouraBtn?.addEventListener('click', async () => {
      ouraBtn.disabled = true;
      try { await startOuraConnect(); }
      catch (err) { showToast(err.message || 'Oura is not available right now'); ouraBtn.disabled = false; }
    });
  } catch (err) {
    console.warn('[Profile] wearable status unavailable', err?.message);
    ouraEl.innerHTML = '<span role="alert">Couldn\'t check your wearable right now.</span>';
  }

  // Notifications (preference lives in main.js; permission is the browser's)
  // The Oura status above awaited a network call — if the user navigated away
  // meanwhile, the account section is gone and the loaders below must stop.
  if (!document.getElementById('notif-state') || !document.getElementById('mfa-section')) return;
  const notifState = document.getElementById('notif-state');
  const notifBtn = document.getElementById('notif-toggle');
  const renderNotif = () => {
    const enabled = localStorage.getItem('vitallens_notifications_enabled') !== 'false';
    const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    if (perm === 'unsupported') { notifState.textContent = 'Not supported in this browser.'; notifBtn.style.display = 'none'; return; }
    if (perm === 'denied') { notifState.textContent = 'Blocked in your browser settings.'; notifBtn.style.display = 'none'; return; }
    notifBtn.style.display = '';
    const on = enabled && perm === 'granted';
    notifState.textContent = on ? 'Reminders are on.' : 'Reminders are off.';
    notifBtn.textContent = on ? 'Turn off reminders' : 'Turn on reminders';
    notifBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  };
  renderNotif();
  window.addEventListener('vitallens:notifications:state', renderNotif);
  notifBtn?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('vitallens:notifications:toggle')));

  // Two-factor authentication
  const mfaEl = document.getElementById('mfa-section');
  async function renderMfa() {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const verified = (data?.totp || []).find(f => f.status === 'verified');
      if (verified) {
        mfaEl.innerHTML = `<div class="flex-between gap-3"><span class="disclaimer">Two-factor authentication is on.</span><button type="button" class="btn btn-sm" id="mfa-off">Turn off</button></div>`;
        document.getElementById('mfa-off')?.addEventListener('click', async () => {
          if (!confirm('Turn off two-factor authentication?')) return;
          const { error: offErr } = await supabase.auth.mfa.unenroll({ factorId: verified.id });
          if (offErr) return showToast("Couldn't turn off two-factor. Please try again.");
          showToast('Two-factor turned off'); renderMfa();
        });
        return;
      }
      mfaEl.innerHTML = `<div class="flex-between gap-3"><span class="disclaimer">Add an authenticator app for a second sign-in step.</span><button type="button" class="btn btn-sm" id="mfa-enroll">Set up</button></div>`;
      document.getElementById('mfa-enroll')?.addEventListener('click', async () => {
        const { data: enroll, error: enrollErr } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'VitalLens' });
        if (enrollErr || !enroll) return showToast("Couldn't start two-factor setup. Please try again.");
        mfaEl.innerHTML = `
          <p class="disclaimer">Scan this with Google Authenticator, Authy, or 1Password, then enter the 6-digit code.</p>
          <img src="${esc(enroll.totp.qr_code)}" alt="QR code for your authenticator app" class="block" style="width:160px;height:160px;margin:var(--space-3) auto;">
          <label for="mfa-code" class="visually-hidden">6-digit code</label>
          <input class="input-field" id="mfa-code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" maxlength="6">
          <div class="flex gap-2 mt-2">
            <button type="button" class="btn btn-sm btn-glass" id="mfa-verify">Verify</button>
            <button type="button" class="btn btn-sm" id="mfa-cancel">Cancel</button>
          </div>`;
        document.getElementById('mfa-cancel')?.addEventListener('click', async () => { await supabase.auth.mfa.unenroll({ factorId: enroll.id }).catch(() => {}); renderMfa(); });
        document.getElementById('mfa-verify')?.addEventListener('click', async () => {
          const code = document.getElementById('mfa-code')?.value.trim();
          if (!code) return;
          try {
            const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enroll.id });
            if (chErr || !ch?.id) throw chErr || new Error('No challenge');
            const { error: vErr } = await supabase.auth.mfa.verify({ factorId: enroll.id, challengeId: ch.id, code });
            if (vErr) return showToast('That code didn\'t match — try again.');
            showToast('Two-factor authentication is on'); renderMfa();
          } catch (err) {
            console.warn('[Profile] MFA verify failed', err?.message);
            showToast("Couldn't verify the code. Please try again.");
          }
        });
      });
    } catch (err) {
      console.warn('[Profile] MFA status unavailable', err?.message);
      mfaEl.innerHTML = '<span class="disclaimer" role="alert">Couldn\'t check two-factor status right now. </span><button type="button" class="btn btn-sm" id="mfa-retry">Try again</button>';
      document.getElementById('mfa-retry')?.addEventListener('click', () => renderMfa());
    }
  }
  renderMfa();

  // Export
  document.getElementById('export-data-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Preparing…';
    try {
      const res = await apiFetch(`/api/user-data/export?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vitallens-export-${todayLocalISO()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
      showToast('Your data export has downloaded');
    } catch (err) { console.warn('[Profile] export failed', err?.message); showToast("Couldn't prepare your export. " + plainReason(err)); }
    finally { btn.disabled = false; btn.textContent = 'Export my data'; }
  });

  // Delete
  document.getElementById('delete-account-btn')?.addEventListener('click', (e) => {
    const box = document.getElementById('delete-confirm'); box.hidden = !box.hidden;
    e.currentTarget.setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
    if (!box.hidden) document.getElementById('delete-email')?.focus();
  });
  document.getElementById('delete-account-confirm')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget; const confirmEmail = document.getElementById('delete-email')?.value.trim();
    if (!confirmEmail) return showToast('Type your email to confirm');
    btn.disabled = true; btn.textContent = 'Deleting…';
    try {
      const res = await apiFetch('/api/user-data/delete', { method: 'DELETE', body: JSON.stringify({ userId, confirmEmail }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Deletion failed');
      showToast('Your account and data have been deleted');
      const { signOut } = await import('./auth.js');
      setTimeout(signOut, 800);
    } catch (err) { showToast(err.message || "Couldn't delete your account. Please try again."); btn.disabled = false; btn.textContent = 'Permanently delete'; }
  });
}
