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
    const profileJson = profileResponse.ok ? await profileResponse.json() : { profile: null };
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
        <button id="sign-out-btn" class="btn" style="width:100%;margin-top:var(--space-3);background:var(--surface-2);border:1px solid var(--border);color:var(--text-secondary);">Sign Out</button>
      </form>
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

