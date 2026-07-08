// ─── First-Run Onboarding ─────────────────────────────────────
// Multi-step flow new users hit right after their first login. Collects the
// same personal info as the Profile tab — writing the exact same snake_case
// health_profile / user_goals columns — computes calorie/macro targets as an
// immediate payoff, and flips profiles.onboarding_completed at the end.
//
// Baseline body stats are required (they produce the targets). Everything
// else is skippable and can be filled in later on the Profile tab.

import { icons } from '../icons.js';
import { supabase } from '../lib/supabase.js';
import { apiFetch } from '../utils/api.js';
import { trackEvent } from '../utils/analytics-events.js';
import { markOnboardingComplete } from './auth.js';


import { CONDITIONS, GOAL_OPTIONS, inchesToCm, lbsToKg } from '../utils/profile-shared.js';

const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Sedentary — little or no exercise' },
  { value: 'light', label: 'Light — 1-3 days/week' },
  { value: 'moderate', label: 'Moderate — 3-5 days/week' },
  { value: 'active', label: 'Active — 6-7 days/week' },
  { value: 'very_active', label: 'Very active — hard training / physical job' },
];


export async function renderOnboarding() {
  const content = document.getElementById('page-content');
  const nav = document.getElementById('bottom-nav');
  if (nav) nav.style.display = 'none';

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) { window.location.hash = '#/auth'; return; }
  const userId = user.id;

  trackEvent('onboarding_started', { userId });

  const state = {
    step: 0,
    baseline: { heightUnit: 'cm', weightUnit: 'kg', activity_level: 'moderate', sex: '' },
    conditions: [],
    targets: null,
    bmr: null,
    tdee: null,
  };

  // ── Layout shell ─────────────────────────────────────────
  function shell(inner, progress) {
    content.innerHTML = `
      <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:var(--space-6);">
        <div style="width:100%;max-width:460px;">
          ${progress != null ? `
          <div style="height:6px;background:var(--surface-2);border-radius:var(--radius-full);overflow:hidden;margin-bottom:var(--space-5);">
            <div style="height:100%;width:${progress}%;background:var(--accent-teal);transition:width 0.3s ease;"></div>
          </div>` : ''}
          ${inner}
        </div>
      </div>`;
  }

  function toast(msg) {
    const c = document.getElementById('toast-container') || document.body;
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 300); }, 2500);
  }

  function skippableFooter(saveId, skipStep) {
    return `
      <div style="display:flex;gap:var(--space-2);margin-top:var(--space-4);">
        <button class="btn" id="ob-skip" data-skip="${skipStep}" style="flex:1;background:var(--surface-2);border:1px solid var(--border);color:var(--text-secondary);">Skip for now</button>
        <button class="btn btn-glass" id="${saveId}" style="flex:2;">Save &amp; continue</button>
      </div>
      <p style="font-size:10px;color:var(--text-tertiary);text-align:center;margin-top:var(--space-2);">You can add this later on your Profile.</p>`;
  }

  // ── Persistence helpers ──────────────────────────────────
  async function saveHealthProfile(patch) {
    const res = await apiFetch('/api/health-profile', { method: 'POST', body: JSON.stringify({ userId, ...patch }) });
    if (!res.ok) throw new Error('health-profile save failed');
  }
  async function saveUserGoals(patch) {
    const res = await apiFetch('/api/user-goals', { method: 'POST', body: JSON.stringify({ userId, ...patch }) });
    if (!res.ok) throw new Error('user-goals save failed');
  }

  async function withSave(fn, nextStep) {
    try {
      await fn();
      toast('Saved');
    } catch {
      toast('Could not save — you can add it later on your Profile');
    }
    go(nextStep);
  }

  function wireSkip() {
    document.getElementById('ob-skip')?.addEventListener('click', (e) => go(Number(e.currentTarget.dataset.skip)));
  }

  // ── Steps ────────────────────────────────────────────────
  function renderWelcome() {
    shell(`
      <div class="card" style="text-align:center;">
        <div style="margin-bottom:var(--space-3);color:var(--accent);display:flex;justify-content:center;">${icons.activity}</div>
        <h1 style="font-size:var(--text-2xl);font-weight:var(--weight-extrabold);margin-bottom:var(--space-2);">Welcome to VitalLens</h1>
        <p style="font-size:var(--text-sm);color:var(--text-secondary);line-height:1.6;margin-bottom:var(--space-5);">
          Let's set up your profile so your insights are personalized from day one. It takes about a minute — and you can skip anything you'd rather do later.
        </p>
        <button class="btn btn-glass btn-block" id="ob-start">Get started</button>
      </div>`);
    document.getElementById('ob-start').addEventListener('click', () => go(1));
  }

  function renderBaseline() {
    const b = state.baseline;
    shell(`
      <div class="card">
        <div style="text-align:center;margin-bottom:var(--space-5);">
          <div style="color:var(--text-secondary);display:flex;justify-content:center;">${icons.clipboard}</div>
          <h2 style="margin:var(--space-2) 0 var(--space-1);">Your baseline</h2>
          <p style="font-size:var(--text-sm);color:var(--text-secondary);">We use these to calculate your calorie and macro targets.</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:var(--space-3);">
          <div class="grid-2" style="gap:var(--space-3);">
            <div class="input-group"><label>Age</label><input class="input-field" type="number" min="0" id="ob-age" value="${b.age || ''}" placeholder="Age"></div>
            <div class="input-group"><label>Biological sex</label>
              <select class="input-field" id="ob-sex">
                <option value="">Select...</option>
                <option value="male" ${b.sex === 'male' ? 'selected' : ''}>Male</option>
                <option value="female" ${b.sex === 'female' ? 'selected' : ''}>Female</option>
                <option value="other" ${b.sex === 'other' ? 'selected' : ''}>Other</option>
              </select>
            </div>
          </div>
          <div class="grid-2" style="gap:var(--space-3);">
            <div class="input-group"><label>Height</label>
              <div style="display:flex;gap:var(--space-2);">
                <input class="input-field" type="number" min="0" id="ob-height" value="${b.height || ''}" placeholder="Height">
                <select class="input-field" id="ob-height-unit" style="width:90px;">
                  <option value="cm" ${b.heightUnit === 'cm' ? 'selected' : ''}>cm</option>
                  <option value="in" ${b.heightUnit === 'in' ? 'selected' : ''}>in</option>
                </select>
              </div>
            </div>
            <div class="input-group"><label>Weight</label>
              <div style="display:flex;gap:var(--space-2);">
                <input class="input-field" type="number" min="0" id="ob-weight" value="${b.weight || ''}" placeholder="Weight">
                <select class="input-field" id="ob-weight-unit" style="width:90px;">
                  <option value="kg" ${b.weightUnit === 'kg' ? 'selected' : ''}>kg</option>
                  <option value="lb" ${b.weightUnit === 'lb' ? 'selected' : ''}>lb</option>
                </select>
              </div>
            </div>
          </div>
          <div class="input-group"><label>Activity level</label>
            <select class="input-field" id="ob-activity">
              ${ACTIVITY_OPTIONS.map(o => `<option value="${o.value}" ${b.activity_level === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
          </div>
          <div id="ob-baseline-error" style="display:none;font-size:var(--text-xs);color:var(--accent-coral);"></div>
          <button class="btn btn-glass btn-block" id="ob-baseline-next" style="margin-top:var(--space-2);">Calculate my targets</button>
        </div>
      </div>`, 20);
    document.getElementById('ob-baseline-next').addEventListener('click', submitBaseline);
  }

  async function submitBaseline() {
    const age = Number(document.getElementById('ob-age').value) || 0;
    const sex = document.getElementById('ob-sex').value;
    const heightRaw = Number(document.getElementById('ob-height').value) || 0;
    const weightRaw = Number(document.getElementById('ob-weight').value) || 0;
    const heightUnit = document.getElementById('ob-height-unit').value;
    const weightUnit = document.getElementById('ob-weight-unit').value;
    const activity_level = document.getElementById('ob-activity').value;

    Object.assign(state.baseline, { age, sex, height: heightRaw, weight: weightRaw, heightUnit, weightUnit, activity_level });

    const err = document.getElementById('ob-baseline-error');
    if (!age || !sex || !heightRaw || !weightRaw || !activity_level) {
      err.textContent = 'Please fill in age, sex, height, weight, and activity level to continue.';
      err.style.display = 'block';
      return;
    }

    const height_cm = Math.round((heightUnit === 'in' ? inchesToCm(heightRaw) : heightRaw) * 10) / 10;
    const weight_kg = Math.round((weightUnit === 'lb' ? lbsToKg(weightRaw) : weightRaw) * 10) / 10;

    const btn = document.getElementById('ob-baseline-next');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin:0 auto;"></div>';

    try {
      const res = await apiFetch('/api/health-profile/calculate-targets', {
        method: 'POST',
        body: JSON.stringify({ userId, weight_kg, height_cm, age, sex, activity_level }),
      });
      if (!res.ok) throw new Error('calc failed');
      const data = await res.json();
      state.targets = data.targets;
      state.bmr = data.bmr;
      state.tdee = data.tdee;
      trackEvent('onboarding_baseline_complete', { userId });
      go(2);
    } catch {
      err.textContent = 'Could not calculate targets. Please check your entries and try again.';
      err.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Calculate my targets';
    }
  }

  function renderPayoff() {
    const t = state.targets || {};
    shell(`
      <div class="card" style="text-align:center;">
        <div style="margin-bottom:var(--space-2);color:var(--accent);display:flex;justify-content:center;">${icons.chart}</div>
        <h2 style="margin-bottom:var(--space-1);">Your personalized targets</h2>
        <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-4);">Calculated from your baseline using the Mifflin-St Jeor equation.</p>
        <div style="display:flex;justify-content:center;gap:var(--space-5);margin-bottom:var(--space-4);">
          <div><div style="font-size:var(--text-xs);color:var(--text-tertiary);">BMR</div><div style="font-size:var(--text-lg);font-weight:700;">${state.bmr}</div></div>
          <div><div style="font-size:var(--text-xs);color:var(--text-tertiary);">TDEE</div><div style="font-size:var(--text-lg);font-weight:700;">${state.tdee}</div></div>
        </div>
        <div style="background:var(--surface-2);border-radius:var(--radius-lg);padding:var(--space-4);margin-bottom:var(--space-5);">
          <div style="font-size:var(--text-3xl);font-weight:var(--weight-extrabold);color:var(--accent-teal);">${t.calories}</div>
          <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:var(--space-3);">calories / day</div>
          <div style="display:flex;justify-content:space-between;text-align:center;">
            <div style="flex:1;"><div style="font-weight:700;color:var(--accent-blue);">${t.protein_g}g</div><div style="font-size:10px;color:var(--text-tertiary);">protein</div></div>
            <div style="flex:1;"><div style="font-weight:700;color:var(--accent-amber);">${t.carbs_g}g</div><div style="font-size:10px;color:var(--text-tertiary);">carbs</div></div>
            <div style="flex:1;"><div style="font-weight:700;color:var(--accent-coral);">${t.fat_g}g</div><div style="font-size:10px;color:var(--text-tertiary);">fat</div></div>
            <div style="flex:1;"><div style="font-weight:700;color:var(--accent-green);">${t.fiber_g}g</div><div style="font-size:10px;color:var(--text-tertiary);">fiber</div></div>
          </div>
        </div>
        <button class="btn btn-glass btn-block" id="ob-payoff-next">Continue</button>
        <p style="font-size:10px;color:var(--text-tertiary);margin-top:var(--space-3);">You can fine-tune these any time on your Profile.</p>
      </div>`, 40);
    document.getElementById('ob-payoff-next').addEventListener('click', () => go(3));
  }

  function renderAllergies() {
    shell(`
      <div class="card">
        <div style="text-align:center;margin-bottom:var(--space-4);">
          <div style="color:var(--text-secondary);display:flex;justify-content:center;">${icons.alert}</div>
          <h2 style="margin:var(--space-2) 0 var(--space-1);">Any allergies?</h2>
          <p style="font-size:var(--text-sm);color:var(--text-secondary);">Optional — helps us avoid suggesting foods that don't work for you.</p>
        </div>
        <div class="input-group"><label>Allergies</label><textarea class="input-field" id="ob-allergies" rows="4" placeholder="e.g. peanuts, shellfish, dairy..."></textarea></div>
        ${skippableFooter('ob-allergies-save', 4)}
      </div>`, 55);
    wireSkip();
    document.getElementById('ob-allergies-save').addEventListener('click', () => {
      const allergies = document.getElementById('ob-allergies').value.trim();
      withSave(() => saveHealthProfile({ allergies }), 4);
    });
  }

  function renderConditions() {
    const selected = state.conditions || [];
    shell(`
      <div class="card">
        <div style="text-align:center;margin-bottom:var(--space-4);">
          <div style="color:var(--text-secondary);display:flex;justify-content:center;">${icons.heart}</div>
          <h2 style="margin:var(--space-2) 0 var(--space-1);">Any conditions to note?</h2>
          <p style="font-size:var(--text-sm);color:var(--text-secondary);">Optional — tap any that apply. This tailors your wellness observations.</p>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-2);max-height:280px;overflow-y:auto;">
          ${CONDITIONS.map(c => `
            <label class="condition-toggle" style="display:flex;align-items:center;gap:var(--space-2);padding:var(--space-2);border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer;">
              <input class="input-checkbox ob-condition" type="checkbox" value="${c}" ${selected.includes(c) ? 'checked' : ''}>
              <span style="font-size:var(--text-sm);">${c}</span>
            </label>`).join('')}
        </div>
        ${skippableFooter('ob-conditions-save', 5)}
      </div>`, 68);
    wireSkip();
    document.getElementById('ob-conditions-save').addEventListener('click', () => {
      const conditions = Array.from(document.querySelectorAll('.ob-condition:checked')).map(i => i.value);
      state.conditions = conditions;
      withSave(() => saveHealthProfile({ conditions }), 5);
    });
  }

  function renderDietary() {
    shell(`
      <div class="card">
        <div style="text-align:center;margin-bottom:var(--space-4);">
          <div style="color:var(--text-secondary);display:flex;justify-content:center;">${icons.leaf}</div>
          <h2 style="margin:var(--space-2) 0 var(--space-1);">Dietary restrictions?</h2>
          <p style="font-size:var(--text-sm);color:var(--text-secondary);">Optional — e.g. vegetarian, halal, gluten-free, low-FODMAP.</p>
        </div>
        <div class="input-group"><label>Dietary restrictions</label><textarea class="input-field" id="ob-dietary" rows="3" placeholder="List anything you avoid or follow..."></textarea></div>
        ${skippableFooter('ob-dietary-save', 6)}
      </div>`, 80);
    wireSkip();
    document.getElementById('ob-dietary-save').addEventListener('click', () => {
      const dietary_restrictions = document.getElementById('ob-dietary').value.trim();
      withSave(() => saveUserGoals({ dietary_restrictions }), 6);
    });
  }

  function renderGoals() {
    shell(`
      <div class="card">
        <div style="text-align:center;margin-bottom:var(--space-4);">
          <div style="color:var(--text-secondary);display:flex;justify-content:center;">${icons.star}</div>
          <h2 style="margin:var(--space-2) 0 var(--space-1);">What are you working toward?</h2>
          <p style="font-size:var(--text-sm);color:var(--text-secondary);">Optional — pick a focus and add any detail.</p>
        </div>
        <div class="input-group"><label>Primary goal</label>
          <select class="input-field" id="ob-goal">
            <option value="">Select...</option>
            ${GOAL_OPTIONS.map(g => `<option value="${g}">${g}</option>`).join('')}
          </select>
        </div>
        <div class="input-group" style="margin-top:var(--space-3);"><label>Anything specific? (optional)</label><textarea class="input-field" id="ob-goals-text" rows="3" placeholder="e.g. more energy in the afternoons, better sleep..."></textarea></div>
        ${skippableFooter('ob-goals-save', 7)}
      </div>`, 90);
    wireSkip();
    document.getElementById('ob-goals-save').addEventListener('click', () => {
      const goal = document.getElementById('ob-goal').value;
      const goals_text = document.getElementById('ob-goals-text').value.trim();
      withSave(async () => {
        if (goal) await saveHealthProfile({ goal });
        await saveUserGoals({ goals_text });
      }, 7);
    });
  }

  function renderMedications() {
    shell(`
      <div class="card">
        <div style="text-align:center;margin-bottom:var(--space-4);">
          <div style="color:var(--text-secondary);display:flex;justify-content:center;">${icons.plus}</div>
          <h2 style="margin:var(--space-2) 0 var(--space-1);">Medications (optional)</h2>
          <p style="font-size:var(--text-sm);color:var(--text-secondary);">A free-text note only, for your own reference. VitalLens never interprets medications or checks interactions.</p>
        </div>
        <div class="input-group"><label>Notes</label><textarea class="input-field" id="ob-meds" rows="3" placeholder="e.g. vitamin D in the mornings..."></textarea></div>
        ${skippableFooter('ob-meds-save', 8)}
      </div>`, 96);
    wireSkip();
    document.getElementById('ob-meds-save').addEventListener('click', () => {
      const medications_note = document.getElementById('ob-meds').value.trim();
      withSave(() => saveHealthProfile({ medications_note }), 8);
    });
  }

  function renderFinish() {
    shell(`
      <div class="card" style="text-align:center;">
        <div style="margin-bottom:var(--space-2);color:var(--accent);display:flex;justify-content:center;">${icons.check}</div>
        <h2 style="margin-bottom:var(--space-2);">You're all set!</h2>
        <p style="font-size:var(--text-sm);color:var(--text-secondary);line-height:1.6;margin-bottom:var(--space-4);">
          Your profile and targets are saved. Log your first meal to start building your history — your first pattern insight appears after about <strong>3 days</strong> of logging.
        </p>
        <div style="display:flex;flex-direction:column;gap:var(--space-2);">
          <button class="btn btn-glass btn-block" id="ob-finish-meal">Log my first meal</button>
          <button class="btn" id="ob-finish-dash" style="background:var(--surface-2);border:1px solid var(--border);color:var(--text-secondary);">Go to dashboard</button>
        </div>
      </div>`, 100);
    document.getElementById('ob-finish-meal').addEventListener('click', () => finish('#/food-scanner'));
    document.getElementById('ob-finish-dash').addEventListener('click', () => finish('#/'));
  }

  // ── Flow control ─────────────────────────────────────────
  async function finish(targetHash) {
    try {
      // upsert (not update) so the flag sticks even if no profiles row exists yet.
      await supabase.from('profiles').upsert({ id: userId, onboarding_completed: true }, { onConflict: 'id' });
    } catch (e) {
      console.warn('[Onboarding] Could not set onboarding_completed:', e.message);
    }
    markOnboardingComplete();
    trackEvent('onboarding_completed', { userId });
    if (nav) nav.style.display = '';
    window.location.hash = targetHash;
  }

  function go(step) {
    state.step = step;
    render();
  }

  function render() {
    switch (state.step) {
      case 0: return renderWelcome();
      case 1: return renderBaseline();
      case 2: return renderPayoff();
      case 3: return renderAllergies();
      case 4: return renderConditions();
      case 5: return renderDietary();
      case 6: return renderGoals();
      case 7: return renderMedications();
      case 8: return renderFinish();
      default: return renderWelcome();
    }
  }

  render();
}
