import { supabase } from '../lib/supabase.js';
import { apiFetch } from '../utils/api.js';

import { showToast } from '../utils/toast.js';
import { CONDITIONS, GOAL_OPTIONS, inchesToCm, lbsToKg, kgToLbs, cmToInches } from '../utils/profile-shared.js';
const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};



export async function renderProfile() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="profile stagger-children">
      <div class="page-header"><h1>Profile</h1><p>Loading your profile data...</p></div>
      <div style="display:flex;justify-content:center;padding:var(--space-8);"><div class="spinner"></div></div>
    </div>`;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user?.id) throw new Error('You must be signed in to view your profile.');

    const profileResponse = await apiFetch(`/api/health-profile?userId=${encodeURIComponent(user.id)}`);
    // A failed load must NOT render an empty form — the next save would overwrite the real row with blanks.
    if (!profileResponse.ok) throw new Error(`Could not load your profile (server responded ${profileResponse.status}). Nothing was changed.`);
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
        <div class="card"><p style="color:var(--text-secondary);">Failed to load profile. ${error.message || 'Please refresh the page.'}</p></div>
      </div>`;
  }
}

// Maps the snake_case health_profile row (the DB's real columns) onto the
// form's internal camelCase model. Height/weight are always stored in cm/kg.
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
    activityLevel: profile.activity_level || 'sedentary',
    liftingSessions: parseInt(profile.lifting_frequency, 10) || 0,
    primaryGoal: profile.goal || '',
    calorieTarget: Number(profile.target_calories ?? profile.custom_calories) || 0,
    proteinTarget: Number(profile.target_protein) || 0,
    carbsTarget: Number(profile.target_carbs) || 0,
    fatTarget: Number(profile.target_fat) || 0,
    fiberTarget: Number(profile.target_fiber) || 30,
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
  const displayedCalorieTarget = profile.calorieTarget || Math.round(tdee);

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="profile stagger-children">
      <div class="page-header"><h1>Profile</h1><p>Manage your body stats, health goals, and nutrition targets.</p></div>
      <div class="card" style="margin-bottom:var(--space-5);">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:var(--space-3);align-items:center;">
          <div>
            <div style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-1);">Signed in as ${user.email || 'unknown'}</div>
            <h2 style="margin:0;">${profile.name || 'Your Health Profile'}</h2>
          </div>
          <div style="display:flex;gap:var(--space-3);flex-wrap:wrap;align-items:center;">
            <div style="text-align:right;min-width:140px;">
              <div style="font-size:var(--text-xs);color:var(--text-secondary);">BMR</div>
              <div id="profile-bmr-value" style="font-size:var(--text-xl);font-weight:700;">${Math.round(bmr)}</div>
            </div>
            <div style="text-align:right;min-width:140px;">
              <div style="font-size:var(--text-xs);color:var(--text-secondary);">TDEE</div>
              <div id="profile-tdee-value" style="font-size:var(--text-xl);font-weight:700;">${Math.round(tdee)}</div>
            </div>
          </div>
        </div>
      </div>

      <form id="profile-form" class="card" style="display:flex;flex-direction:column;gap:var(--space-5);">
        <div>
          <h4 style="margin-bottom:var(--space-4);">BASIC STATS</h4>
          <div class="grid-2" style="gap:var(--space-3);">
            <div class="input-group"><label>Name</label><input class="input-field" type="text" id="p-name" value="${profile.name}" placeholder="Your name"></div>
            <div class="input-group"><label>Age</label><input class="input-field" type="number" min="0" id="p-age" value="${profile.age || ''}" placeholder="Age"></div>
          </div>

          <div class="grid-3" style="gap:var(--space-3);margin-top:var(--space-3);">
            <div class="input-group"><label>Sex</label>
              <select class="input-field" id="p-sex">
                <option value="">Select...</option>
                <option value="male" ${profile.sex === 'male' ? 'selected' : ''}>Male</option>
                <option value="female" ${profile.sex === 'female' ? 'selected' : ''}>Female</option>
                <option value="other" ${profile.sex === 'other' ? 'selected' : ''}>Other</option>
              </select>
            </div>
            <div class="input-group"><label>Activity Level</label>
              <select class="input-field" id="p-activity-level">
                <option value="sedentary" ${profile.activityLevel === 'sedentary' ? 'selected' : ''}>Sedentary</option>
                <option value="light" ${profile.activityLevel === 'light' ? 'selected' : ''}>Light</option>
                <option value="moderate" ${profile.activityLevel === 'moderate' ? 'selected' : ''}>Moderate</option>
                <option value="active" ${profile.activityLevel === 'active' ? 'selected' : ''}>Active</option>
                <option value="very_active" ${profile.activityLevel === 'very_active' ? 'selected' : ''}>Very Active</option>
              </select>
            </div>
            <div class="input-group"><label>Primary Goal</label>
              <select class="input-field" id="p-primary-goal">
                <option value="">Select...</option>
                ${GOAL_OPTIONS.map(option => `<option value="${option}" ${profile.primaryGoal === option ? 'selected' : ''}>${option}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="grid-3" style="gap:var(--space-3);margin-top:var(--space-3);">
            <div class="input-group">
              <label>Height</label>
              <div style="display:flex;gap:var(--space-2);align-items:center;">
                <input class="input-field" type="number" min="0" id="p-height" value="${profile.height || ''}" placeholder="Height">
                <select class="input-field" id="p-height-unit" style="width:100px;">
                  <option value="cm" ${profile.heightUnit === 'cm' ? 'selected' : ''}>cm</option>
                  <option value="in" ${profile.heightUnit === 'in' ? 'selected' : ''}>in</option>
                </select>
              </div>
            </div>
            <div class="input-group">
              <label>Current Weight</label>
              <div style="display:flex;gap:var(--space-2);align-items:center;">
                <input class="input-field" type="number" min="0" id="p-weight" value="${profile.weight || ''}" placeholder="Weight">
                <select class="input-field" id="p-weight-unit" style="width:100px;">
                  <option value="kg" ${profile.weightUnit === 'kg' ? 'selected' : ''}>kg</option>
                  <option value="lb" ${profile.weightUnit === 'lb' ? 'selected' : ''}>lb</option>
                </select>
              </div>
            </div>
            <div class="input-group">
              <label>Goal Weight</label>
              <div style="display:flex;gap:var(--space-2);align-items:center;">
                <input class="input-field" type="number" min="0" id="p-goal-weight" value="${profile.goalWeight || ''}" placeholder="Goal weight">
                <span id="p-goal-weight-unit" style="font-size:var(--text-sm);color:var(--text-secondary);">${profile.weightUnit}</span>
              </div>
            </div>
          </div>

          <div style="margin-top:var(--space-4);">
            <label style="display:block;margin-bottom:var(--space-2);">Lifting Sessions per Week: <strong id="p-lifting-count">${profile.liftingSessions}</strong></label>
            <input type="range" id="p-lifting-sessions" min="0" max="7" value="${profile.liftingSessions}" style="width:100%;">
          </div>
        </div>

        <div>
          <h4 style="margin-bottom:var(--space-4);">NUTRITION TARGETS</h4>
          <div class="grid-2" style="gap:var(--space-3);margin-bottom:var(--space-3);">
            <div class="input-group"><label>Calorie Target</label><input class="input-field" type="number" min="0" id="p-calorie-target" value="${displayedCalorieTarget}" placeholder="Calories per day"></div>
            <div class="input-group"><label>Fiber Target (g)</label><input class="input-field" type="number" min="0" id="p-fiber-target" value="${profile.fiberTarget}" placeholder="30"></div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--space-3);">
            <div class="input-group"><label>Protein Target (g)</label><input class="input-field" type="number" min="0" id="p-protein-target" value="${profile.proteinTarget || ''}" placeholder="g"></div>
            <div class="input-group"><label>Carbs Target (g)</label><input class="input-field" type="number" min="0" id="p-carbs-target" value="${profile.carbsTarget || ''}" placeholder="g"></div>
            <div class="input-group"><label>Fat Target (g)</label><input class="input-field" type="number" min="0" id="p-fat-target" value="${profile.fatTarget || ''}" placeholder="g"></div>
          </div>
          <div style="margin-top:var(--space-3);font-size:var(--text-xs);color:var(--text-secondary);">
            BMR is calculated from Mifflin-St Jeor and updated automatically when height, weight, age, or activity level changes.
          </div>
        </div>

        <div>
          <h4 style="margin-bottom:var(--space-4);">PREEXISTING CONDITIONS</h4>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-2);">
            ${CONDITIONS.map(condition => `
              <label class="condition-toggle" style="display:flex;align-items:center;gap:var(--space-2);padding:var(--space-2);border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer;">
                <input class="input-checkbox condition-checkbox" type="checkbox" value="${condition}" ${profile.conditions.includes(condition) ? 'checked' : ''}>
                <span style="font-size:var(--text-sm);">${condition}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div>
          <h4 style="margin-bottom:var(--space-4);">ALLERGIES</h4>
          <div class="input-group"><label>Allergies</label><textarea class="input-field" id="p-allergies" rows="4" placeholder="List any allergies...">${profile.allergies}</textarea></div>
        </div>

        <button type="submit" id="save-profile-btn" class="btn btn-glass btn-block">Save Profile</button>
        <button type="button" id="sign-out-btn" class="btn" style="width:100%;margin-top:var(--space-3);background:var(--surface-2);border:1px solid var(--border);color:var(--text-secondary);">Sign Out</button>
      </form>

      <div class="card" style="margin-top:var(--space-5);">
        <h4 style="margin-bottom:var(--space-3);">Subscription</h4>
        <div id="billing-status" class="disclaimer">Checking your plan…</div>
        <div id="billing-actions" style="display:flex;gap:var(--space-3);flex-wrap:wrap;margin-top:var(--space-3);"></div>
        <p class="disclaimer" style="margin-top:var(--space-3);">Free includes 5 food scans and 10 AI chats a day. Premium removes those limits. Cancel anytime.</p>
      </div>

      <div class="card" style="margin-top:var(--space-5);">
        <h4 style="margin-bottom:var(--space-3);">Wearables</h4>
        <div id="oura-status" class="disclaimer">Checking…</div>
        <div style="margin-top:var(--space-3);"><button type="button" class="btn btn-sm" id="oura-connect-btn">Connect Oura Ring</button></div>
      </div>

      <div class="card" style="margin-top:var(--space-5);">
        <h4 style="margin-bottom:var(--space-3);">Notifications</h4>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);">
          <span id="notif-state" class="disclaimer"></span>
          <button type="button" class="btn btn-sm" id="notif-toggle"></button>
        </div>
      </div>

      <div class="card" style="margin-top:var(--space-5);">
        <h4 style="margin-bottom:var(--space-3);">Security</h4>
        <div id="mfa-section"><span class="disclaimer">Checking two-factor status…</span></div>
      </div>

      <div class="card" style="margin-top:var(--space-5);">
        <h4 style="margin-bottom:var(--space-3);">Your data</h4>
        <p class="disclaimer">Download everything VitalLens holds about you as JSON, or permanently delete your account and all of its data.</p>
        <div style="display:flex;gap:var(--space-3);flex-wrap:wrap;margin-top:var(--space-3);">
          <button type="button" class="btn btn-sm" id="export-data-btn">Export my data</button>
          <button type="button" class="btn btn-sm" id="delete-account-btn" style="color:var(--error);border:1px solid var(--error);">Delete my account</button>
        </div>
        <div id="delete-confirm" hidden style="margin-top:var(--space-3);">
          <label for="delete-email" class="disclaimer">Type your account email to confirm. This cannot be undone.</label>
          <input class="input-field" id="delete-email" type="email" autocomplete="off" style="margin-top:var(--space-2);">
          <button type="button" class="btn btn-sm" id="delete-account-confirm" style="margin-top:var(--space-2);color:var(--error);border:1px solid var(--error);">Permanently delete</button>
        </div>
      </div>
    </div>`;

  attachProfileHandlers(profile, user.id, bmr, tdee);
}

function attachProfileHandlers(profile, userId, initialBmr, initialTdee) {
  let manualCalorieTarget = Boolean(profile.calorieTarget);
  const bmrValueEl = document.getElementById('profile-bmr-value');
  const tdeeValueEl = document.getElementById('profile-tdee-value');
  const calorieInput = document.getElementById('p-calorie-target');

  function getNumberValue(id) {
    return Number(document.getElementById(id)?.value || 0);
  }

  function computeAgeFromDob(dob) {
    if (!dob) return 0;
    const birth = new Date(dob);
    if (Number.isNaN(birth.getTime())) return 0;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
    return age;
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

  function updateCalculatedTargets() {
    const height = getNumberValue('p-height');
    const weight = getNumberValue('p-weight');
    const age = getNumberValue('p-age');
    const sex = document.getElementById('p-sex')?.value || '';
    const activityLevel = document.getElementById('p-activity-level')?.value || 'sedentary';
    const heightUnit = document.getElementById('p-height-unit')?.value || 'cm';
    const weightUnit = document.getElementById('p-weight-unit')?.value || 'kg';

    const heightCm = heightUnit === 'cm' ? height : inchesToCm(height);
    const weightKg = weightUnit === 'kg' ? weight : lbsToKg(weight);
    const bmr = calculateBmr(weightKg, heightCm, age, sex);
    const tdee = calculateTdee(bmr, activityLevel);
    if (bmrValueEl) bmrValueEl.textContent = Math.round(bmr);
    if (tdeeValueEl) tdeeValueEl.textContent = Math.round(tdee);

    if (!manualCalorieTarget && calorieInput) {
      calorieInput.value = Math.round(tdee);
    }
  }

  ['p-height', 'p-weight', 'p-age', 'p-sex', 'p-activity-level'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateCalculatedTargets);
    document.getElementById(id)?.addEventListener('change', updateCalculatedTargets);
  });

  calorieInput?.addEventListener('input', () => {
    manualCalorieTarget = true;
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

    const name = document.getElementById('p-name')?.value.trim() || '';
    const age = getNumberValue('p-age');
    const sex = document.getElementById('p-sex')?.value || '';
    const heightRaw = getNumberValue('p-height');
    const weightRaw = getNumberValue('p-weight');
    const heightUnit = document.getElementById('p-height-unit')?.value || 'cm';
    const weightUnit = document.getElementById('p-weight-unit')?.value || 'kg';
    const activityLevel = document.getElementById('p-activity-level')?.value || 'sedentary';

    // health_profile always stores cm / kg — convert before saving.
    const height_cm = roundValue(heightUnit === 'in' ? inchesToCm(heightRaw) : heightRaw);
    const weight_kg = roundValue(weightUnit === 'lb' ? lbsToKg(weightRaw) : weightRaw);
    const goalWeightRaw = getNumberValue('p-goal-weight');
    const goal_weight_kg = goalWeightRaw > 0
      ? roundValue(weightUnit === 'lb' ? lbsToKg(goalWeightRaw) : goalWeightRaw)
      : null;

    const bmr = calculateBmr(weight_kg, height_cm, age, sex);
    const tdee = calculateTdee(bmr, activityLevel);

    // Payload uses the real snake_case health_profile columns.
    const payload = {
      userId,
      sex,
      age,
      height_cm,
      weight_kg,
      goal_weight_kg,
      goal: document.getElementById('p-primary-goal')?.value || '',
      activity_level: activityLevel,
      lifting_frequency: String(getNumberValue('p-lifting-sessions')),
      target_calories: getNumberValue('p-calorie-target'),
      target_protein: getNumberValue('p-protein-target'),
      target_carbs: getNumberValue('p-carbs-target'),
      target_fat: getNumberValue('p-fat-target'),
      target_fiber: getNumberValue('p-fiber-target'),
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      conditions: Array.from(document.querySelectorAll('.condition-checkbox:checked')).map(input => input.value),
      allergies: document.getElementById('p-allergies')?.value.trim() || '',
      updated_at: new Date().toISOString(),
    };

    try {
      const response = await apiFetch(`/api/health-profile`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Save failed');
      // Name lives on profiles (RLS lets a user update their own row).
      try { await supabase.from('profiles').update({ name }).eq('id', userId); } catch { /* non-blocking */ }
      showToast('Profile saved');
      renderProfile();
    } catch (error) {
      console.error('[Profile] Save failed', error);
      showToast('Failed to save profile');
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

function calculateTdee(bmr, activityLevel = 'sedentary') {
  if (!bmr) return 0;
  return bmr * (ACTIVITY_FACTORS[activityLevel] || ACTIVITY_FACTORS.sedentary);
}

function getDefaultProfile() {
  return {
    name: '',
    email: '',
    age: 0,
    sex: '',
    height: 0,
    heightUnit: 'cm',
    weight: 0,
    weightUnit: 'kg',
    goalWeight: 0,
    activityLevel: 'sedentary',
    liftingSessions: 0,
    primaryGoal: '',
    calorieTarget: 0,
    proteinTarget: 0,
    carbsTarget: 0,
    fatTarget: 0,
    fiberTarget: 30,
    conditions: [],
    allergies: '',
  };
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
    statusEl.textContent = 'Plan details unavailable right now.';
  }

  // Wearables (Oura)
  const ouraEl = document.getElementById('oura-status');
  const ouraBtn = document.getElementById('oura-connect-btn');
  try {
    const { refreshOuraStatus, isOuraConnected, startOuraConnect } = await import('../utils/oura.js');
    await refreshOuraStatus(userId);
    ouraEl.textContent = isOuraConnected() ? 'Oura Ring connected — sleep and readiness sync nightly.' : 'Not connected. Connect a ring to sync sleep and readiness automatically.';
    if (isOuraConnected()) ouraBtn.hidden = true;
    ouraBtn?.addEventListener('click', async () => {
      ouraBtn.disabled = true;
      try { await startOuraConnect(); }
      catch (err) { showToast(err.message || 'Oura is not available right now'); ouraBtn.disabled = false; }
    });
  } catch { ouraEl.textContent = 'Wearable status unavailable.'; }

  // Notifications (preference lives in main.js; permission is the browser's)
  const notifState = document.getElementById('notif-state');
  const notifBtn = document.getElementById('notif-toggle');
  const renderNotif = () => {
    const enabled = localStorage.getItem('vitallens_notifications_enabled') !== 'false';
    const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    if (perm === 'unsupported') { notifState.textContent = 'Not supported in this browser.'; notifBtn.hidden = true; return; }
    if (perm === 'denied') { notifState.textContent = 'Blocked in your browser settings.'; notifBtn.hidden = true; return; }
    const on = enabled && perm === 'granted';
    notifState.textContent = on ? 'Reminders are on.' : 'Reminders are off.';
    notifBtn.textContent = on ? 'Turn off' : 'Turn on';
  };
  renderNotif();
  window.addEventListener('vitallens:notifications:state', renderNotif);
  notifBtn?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('vitallens:notifications:toggle')));

  // Two-factor authentication
  const mfaEl = document.getElementById('mfa-section');
  async function renderMfa() {
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = (data?.totp || []).find(f => f.status === 'verified');
      if (verified) {
        mfaEl.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);"><span class="disclaimer">Two-factor authentication is on.</span><button type="button" class="btn btn-sm" id="mfa-off">Turn off</button></div>`;
        document.getElementById('mfa-off')?.addEventListener('click', async () => {
          if (!confirm('Turn off two-factor authentication?')) return;
          const { error } = await supabase.auth.mfa.unenroll({ factorId: verified.id });
          if (error) return showToast(error.message);
          showToast('Two-factor turned off'); renderMfa();
        });
        return;
      }
      mfaEl.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-3);"><span class="disclaimer">Add an authenticator app for a second sign-in step.</span><button type="button" class="btn btn-sm" id="mfa-enroll">Set up</button></div>`;
      document.getElementById('mfa-enroll')?.addEventListener('click', async () => {
        const { data: enroll, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'VitalLens' });
        if (error || !enroll) return showToast(error?.message || 'Could not start enrolment');
        mfaEl.innerHTML = `
          <p class="disclaimer">Scan this with Google Authenticator, Authy, or 1Password, then enter the 6-digit code.</p>
          <img src="${enroll.totp.qr_code}" alt="QR code for your authenticator app" style="width:160px;height:160px;margin:var(--space-3) auto;display:block;">
          <label for="mfa-code" class="visually-hidden">6-digit code</label>
          <input class="input-field" id="mfa-code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" maxlength="6">
          <div style="display:flex;gap:var(--space-2);margin-top:var(--space-2);">
            <button type="button" class="btn btn-sm btn-glass" id="mfa-verify">Verify</button>
            <button type="button" class="btn btn-sm" id="mfa-cancel">Cancel</button>
          </div>`;
        document.getElementById('mfa-cancel')?.addEventListener('click', async () => { await supabase.auth.mfa.unenroll({ factorId: enroll.id }).catch(() => {}); renderMfa(); });
        document.getElementById('mfa-verify')?.addEventListener('click', async () => {
          const code = document.getElementById('mfa-code')?.value.trim();
          if (!code) return;
          const { data: ch } = await supabase.auth.mfa.challenge({ factorId: enroll.id });
          const { error: vErr } = await supabase.auth.mfa.verify({ factorId: enroll.id, challengeId: ch?.id, code });
          if (vErr) return showToast('That code didn\'t match — try again.');
          showToast('Two-factor authentication is on'); renderMfa();
        });
      });
    } catch { mfaEl.innerHTML = '<span class="disclaimer">Two-factor status unavailable.</span>'; }
  }
  renderMfa();

  // Export
  document.getElementById('export-data-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Preparing…';
    try {
      const res = await apiFetch(`/api/user-data/export?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vitallens-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
      showToast('Your data export has downloaded');
    } catch (err) { showToast(err.message || 'Export failed'); }
    finally { btn.disabled = false; btn.textContent = 'Export my data'; }
  });

  // Delete
  document.getElementById('delete-account-btn')?.addEventListener('click', () => {
    const box = document.getElementById('delete-confirm'); box.hidden = !box.hidden;
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
    } catch (err) { showToast(err.message); btn.disabled = false; btn.textContent = 'Permanently delete'; }
  });
}
