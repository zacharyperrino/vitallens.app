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
import { showToast } from '../utils/toast.js';
import { markOnboardingComplete } from './auth.js';
import { CONDITIONS, GOAL_OPTIONS, inchesToCm, lbsToKg } from '../utils/profile-shared.js';

const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Sedentary — little or no exercise' },
  { value: 'light', label: 'Light — 1-3 days/week' },
  { value: 'moderate', label: 'Moderate — 3-5 days/week' },
  { value: 'active', label: 'Active — 6-7 days/week' },
  { value: 'very_active', label: 'Very active — hard training / physical job' },
];

const TOTAL_STEPS = 8; // steps 1–8 after the welcome screen

export async function renderOnboarding() {
  const content = document.getElementById('page-content');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) { window.location.hash = '#/auth'; return; }
  const userId = user.id;

  trackEvent('onboarding_started', { userId });

  const state = {
    step: 0,
    baseline: { heightUnit: 'cm', weightUnit: 'kg', activity_level: '', sex: '' },
    conditions: [],
    targets: null,
    bmr: null,
    tdee: null,
  };
  let backTarget = null;

  // ── Layout shell ─────────────────────────────────────────
  // The frame (Back button, progress bar, live region) is created once so the
  // aria-live region persists across steps and announces each new step.
  function ensureFrame() {
    if (document.getElementById('ob-step')) return;
    content.innerHTML = `
      <div class="flex-col items-center justify-center p-6" style="min-height:100vh;">
        <div class="w-full" style="max-width:460px;">
          <div class="flex items-center justify-between gap-3 mb-3" style="min-height:44px;">
            <button type="button" class="btn btn-sm" id="ob-back" style="display:none;">← Back</button>
            <span id="ob-step-count" class="disclaimer"></span>
          </div>
          <div id="ob-progress" role="progressbar" aria-label="Setup progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" style="display:none;height:6px;background:var(--surface-2);border-radius:var(--radius-full);overflow:hidden;margin-bottom:var(--space-5);">
            <div id="ob-progress-fill" style="height:100%;width:0%;background:var(--accent);transition:width 0.3s ease;"></div>
          </div>
          <div id="ob-step" aria-live="polite"></div>
        </div>
      </div>`;
    document.getElementById('ob-back').addEventListener('click', () => { if (backTarget != null) go(backTarget); });
  }

  function shell(inner, progress, backStep) {
    ensureFrame();
    backTarget = backStep ?? null;
    document.getElementById('ob-back').style.display = backStep == null ? 'none' : '';
    document.getElementById('ob-step-count').textContent = state.step > 0 ? `Step ${state.step} of ${TOTAL_STEPS}` : '';
    const bar = document.getElementById('ob-progress');
    bar.style.display = progress == null ? 'none' : '';
    if (progress != null) {
      bar.setAttribute('aria-valuenow', String(progress));
      document.getElementById('ob-progress-fill').style.width = `${progress}%`;
    }
    document.getElementById('ob-step').innerHTML = inner;
    // Move focus to the step heading so keyboard and screen-reader users land on the new step.
    const heading = document.querySelector('#ob-step h1, #ob-step h2');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus(); }
  }

  function skippableFooter(saveId, skipStep) {
    return `
      <div class="flex gap-2 mt-4">
        <button type="button" class="btn flex-1 bg-surface-2 border text-secondary" id="ob-skip" data-skip="${skipStep}">Skip for now</button>
        <button type="button" class="btn btn-glass" id="${saveId}" style="flex:2;">Save &amp; continue</button>
      </div>
      <p class="disclaimer mt-2 text-center">You can add this later on your Profile.</p>`;
  }

  // ── Persistence helpers ──────────────────────────────────
  async function saveHealthProfile(patch) {
    const res = await apiFetch('/api/health-profile', { method: 'POST', body: JSON.stringify({ userId, ...patch }) });
    if (!res.ok) throw new Error(`health-profile save responded ${res.status}`);
  }
  async function saveUserGoals(patch) {
    const res = await apiFetch('/api/user-goals', { method: 'POST', body: JSON.stringify({ userId, ...patch }) });
    if (!res.ok) throw new Error(`user-goals save responded ${res.status}`);
  }

  // Every save in the flow goes through here. Optional steps move on even if the
  // save fails (the data can be added on Profile later); required steps stay put
  // and hand the error back to the caller so the form can recover.
  async function withSave(fn, nextStep, opts = {}) {
    try {
      await fn();
      showToast(opts.successMessage || 'Saved');
      go(nextStep);
      return true;
    } catch (err) {
      console.warn('[Onboarding] save failed:', err?.message);
      if (opts.required) {
        showToast(opts.errorMessage || "Couldn't save — please try again.");
        opts.onError?.(err);
        return false;
      }
      showToast("Couldn't save — you can add it later on your Profile.");
      go(nextStep);
      return false;
    }
  }

  function wireSkip() {
    document.getElementById('ob-skip')?.addEventListener('click', (e) => go(Number(e.currentTarget.dataset.skip)));
  }

  // ── Steps ────────────────────────────────────────────────
  function renderWelcome() {
    shell(`
      <div class="card text-center">
        <div class="mb-3 text-accent flex justify-center" aria-hidden="true">${icons.activity}</div>
        <h1 class="text-2xl mb-2" style="font-weight:var(--weight-extrabold);">Welcome to VitalLens</h1>
        <p class="text-sm text-secondary mb-5" style="line-height:1.6;">
          Let's set up your profile so your observations are based on your own details from day one. It takes about a minute — and you can skip anything you'd rather do later.
        </p>
        <button type="button" class="btn btn-glass btn-block" id="ob-start">Get started</button>
      </div>`, null, null);
    document.getElementById('ob-start').addEventListener('click', () => go(1));
  }

  function renderBaseline() {
    const b = state.baseline;
    shell(`
      <div class="card">
        <div class="text-center mb-5">
          <div class="text-secondary flex justify-center" aria-hidden="true">${icons.clipboard}</div>
          <h2 style="margin:var(--space-2) 0 var(--space-1);">Your baseline</h2>
          <p class="text-secondary text-sm">We use these to estimate your calorie and macro targets.</p>
        </div>
        <div class="flex-col gap-3">
          <div class="grid-2 gap-3">
            <div class="input-group"><label for="ob-age">Age</label><input class="input-field" type="number" min="18" max="120" id="ob-age" value="${b.age || ''}" placeholder="Age" inputmode="numeric"></div>
            <div class="input-group"><label for="ob-sex">Biological sex</label>
              <select class="input-field" id="ob-sex">
                <option value="">Select…</option>
                <option value="male" ${b.sex === 'male' ? 'selected' : ''}>Male</option>
                <option value="female" ${b.sex === 'female' ? 'selected' : ''}>Female</option>
                <option value="other" ${b.sex === 'other' ? 'selected' : ''}>Other</option>
              </select>
            </div>
          </div>
          <div class="grid-2 gap-3">
            <div class="input-group"><label for="ob-height">Height</label>
              <div class="flex gap-2">
                <input class="input-field" type="number" min="0" id="ob-height" value="${b.height || ''}" placeholder="Height" inputmode="decimal">
                <select class="input-field" id="ob-height-unit" style="width:90px;" aria-label="Height unit">
                  <option value="cm" ${b.heightUnit === 'cm' ? 'selected' : ''}>cm</option>
                  <option value="in" ${b.heightUnit === 'in' ? 'selected' : ''}>in</option>
                </select>
              </div>
            </div>
            <div class="input-group"><label for="ob-weight">Weight</label>
              <div class="flex gap-2">
                <input class="input-field" type="number" min="0" id="ob-weight" value="${b.weight || ''}" placeholder="Weight" inputmode="decimal">
                <select class="input-field" id="ob-weight-unit" style="width:90px;" aria-label="Weight unit">
                  <option value="kg" ${b.weightUnit === 'kg' ? 'selected' : ''}>kg</option>
                  <option value="lb" ${b.weightUnit === 'lb' ? 'selected' : ''}>lb</option>
                </select>
              </div>
            </div>
          </div>
          <div class="input-group"><label for="ob-activity">Activity level</label>
            <select class="input-field" id="ob-activity">
              <option value="" disabled ${b.activity_level ? '' : 'selected'}>Select…</option>
              ${ACTIVITY_OPTIONS.map(o => `<option value="${o.value}" ${b.activity_level === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
            </select>
          </div>
          <div id="ob-baseline-error" role="alert" style="display:none;font-size:var(--text-sm);color:var(--error);"></div>
          <button type="button" class="btn btn-glass btn-block mt-2" id="ob-baseline-next">Calculate my targets</button>
        </div>
      </div>`, 20, 0);
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
    if (age < 18) {
      err.textContent = 'VitalLens is for people 18 and older.';
      err.style.display = 'block';
      return;
    }
    err.style.display = 'none';

    const height_cm = Math.round((heightUnit === 'in' ? inchesToCm(heightRaw) : heightRaw) * 10) / 10;
    const weight_kg = Math.round((weightUnit === 'lb' ? lbsToKg(weightRaw) : weightRaw) * 10) / 10;

    const btn = document.getElementById('ob-baseline-next');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin:0 auto;"></div><span class="visually-hidden">Calculating…</span>';

    // The server persists the baseline + targets here, so this is a save and
    // runs through withSave like every other one — but it's required, so a
    // failure keeps the user on this step with the form ready to retry.
    await withSave(async () => {
      const res = await apiFetch('/api/health-profile/calculate-targets', {
        method: 'POST',
        body: JSON.stringify({ userId, weight_kg, height_cm, age, sex, activity_level }),
      });
      if (!res.ok) throw new Error(`calculate-targets responded ${res.status}`);
      const data = await res.json();
      state.targets = data.targets;
      state.bmr = data.bmr;
      state.tdee = data.tdee;
      trackEvent('onboarding_baseline_complete', { userId });
    }, 2, {
      required: true,
      successMessage: 'Baseline saved',
      errorMessage: "Couldn't calculate your targets. Please try again.",
      onError: () => {
        err.textContent = "We couldn't calculate your targets just now. Check your connection and try again.";
        err.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Calculate my targets';
      },
    });
  }

  function renderPayoff() {
    const t = state.targets || {};
    const num = (v) => (v == null || v === '') ? '—' : v;
    shell(`
      <div class="card text-center">
        <div class="mb-2 text-accent flex justify-center" aria-hidden="true">${icons.chart}</div>
        <h2 class="mb-1">Your starting targets</h2>
        <p class="mb-4 text-secondary text-sm">Estimated from your baseline using the Mifflin-St Jeor formula.</p>
        <div class="flex justify-center gap-5 mb-4">
          <div><div class="text-tertiary text-xs">Estimated BMR</div><div class="text-lg" style="font-weight:700;">${num(state.bmr)}</div></div>
          <div><div class="text-tertiary text-xs">Estimated daily burn (TDEE)</div><div class="text-lg" style="font-weight:700;">${num(state.tdee)}</div></div>
        </div>
        <div class="bg-surface-2 rounded-lg p-4 mb-5">
          <div class="text-3xl text-primary" style="font-weight:var(--weight-extrabold);">${num(t.calories)}</div>
          <div class="mb-3 text-tertiary text-xs">calories / day</div>
          <div class="flex justify-between text-center">
            <div class="flex-1"><div class="text-accent" style="font-weight:700;">${num(t.protein_g)}g</div><div class="text-tertiary text-xs">protein</div></div>
            <div class="flex-1"><div class="text-amber" style="font-weight:700;">${num(t.carbs_g)}g</div><div class="text-tertiary text-xs">carbs</div></div>
            <div class="flex-1"><div class="text-neutral" style="font-weight:700;">${num(t.fat_g)}g</div><div class="text-tertiary text-xs">fat</div></div>
            <div class="flex-1"><div class="text-green" style="font-weight:700;">${num(t.fiber_g)}g</div><div class="text-tertiary text-xs">fiber</div></div>
          </div>
        </div>
        <button type="button" class="btn btn-glass btn-block" id="ob-payoff-next">Continue</button>
        <p class="disclaimer mt-3">These are estimates, not prescriptions. You can change them any time on your Profile.</p>
      </div>`, 40, 1);
    document.getElementById('ob-payoff-next').addEventListener('click', () => go(3));
  }

  function renderAllergies() {
    shell(`
      <div class="card">
        <div class="mb-4 text-center">
          <div class="text-secondary flex justify-center" aria-hidden="true">${icons.alert}</div>
          <h2 style="margin:var(--space-2) 0 var(--space-1);">Any allergies?</h2>
          <p class="text-secondary text-sm">Optional — helps us avoid suggesting foods that don't work for you.</p>
        </div>
        <div class="input-group"><label for="ob-allergies">Allergies</label><textarea class="input-field" id="ob-allergies" rows="4" placeholder="e.g. peanuts, shellfish, dairy…"></textarea></div>
        ${skippableFooter('ob-allergies-save', 4)}
      </div>`, 55, 2);
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
        <div class="mb-4 text-center">
          <div class="text-secondary flex justify-center" aria-hidden="true">${icons.heart}</div>
          <h2 style="margin:var(--space-2) 0 var(--space-1);">Any conditions to note?</h2>
          <p class="text-secondary text-sm">Optional — tap any that apply. This adds context to your wellness observations.</p>
        </div>
        <fieldset class="p-0 m-0" style="border:0;min-width:0;">
          <legend class="visually-hidden">Conditions</legend>
          <div class="grid-2 gap-2" style="max-height:280px;overflow-y:auto;">
            ${CONDITIONS.map((c, i) => `
              <label for="ob-cond-${i}" class="condition-toggle flex items-center gap-2 p-2 border rounded-md cursor-pointer">
                <input class="input-checkbox ob-condition" id="ob-cond-${i}" type="checkbox" value="${c}" ${selected.includes(c) ? 'checked' : ''}>
                <span class="text-sm">${c}</span>
              </label>`).join('')}
          </div>
        </fieldset>
        ${skippableFooter('ob-conditions-save', 5)}
      </div>`, 68, 3);
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
        <div class="mb-4 text-center">
          <div class="text-secondary flex justify-center" aria-hidden="true">${icons.leaf}</div>
          <h2 style="margin:var(--space-2) 0 var(--space-1);">Dietary restrictions?</h2>
          <p class="text-secondary text-sm">Optional — e.g. vegetarian, halal, gluten-free, low-FODMAP.</p>
        </div>
        <div class="input-group"><label for="ob-dietary">Dietary restrictions</label><textarea class="input-field" id="ob-dietary" rows="3" placeholder="List anything you avoid or follow…"></textarea></div>
        ${skippableFooter('ob-dietary-save', 6)}
      </div>`, 80, 4);
    wireSkip();
    document.getElementById('ob-dietary-save').addEventListener('click', () => {
      const dietary_restrictions = document.getElementById('ob-dietary').value.trim();
      withSave(() => saveUserGoals({ dietary_restrictions }), 6);
    });
  }

  function renderGoals() {
    shell(`
      <div class="card">
        <div class="mb-4 text-center">
          <div class="text-secondary flex justify-center" aria-hidden="true">${icons.star}</div>
          <h2 style="margin:var(--space-2) 0 var(--space-1);">What are you working toward?</h2>
          <p class="text-secondary text-sm">Optional — pick a focus and add any detail.</p>
        </div>
        <div class="input-group"><label for="ob-goal">Primary goal</label>
          <select class="input-field" id="ob-goal">
            <option value="">Select…</option>
            ${GOAL_OPTIONS.map(g => `<option value="${g}">${g}</option>`).join('')}
          </select>
        </div>
        <div class="input-group mt-3"><label for="ob-goals-text">Anything specific? (optional)</label><textarea class="input-field" id="ob-goals-text" rows="3" placeholder="e.g. more energy in the afternoons, better sleep…"></textarea></div>
        ${skippableFooter('ob-goals-save', 7)}
      </div>`, 90, 5);
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
        <div class="mb-4 text-center">
          <div class="text-secondary flex justify-center" aria-hidden="true">${icons.plus}</div>
          <h2 style="margin:var(--space-2) 0 var(--space-1);">Medications (optional)</h2>
          <p class="text-secondary text-sm">A free-text note only, for your own reference. VitalLens never interprets medications or checks interactions.</p>
        </div>
        <div class="input-group"><label for="ob-meds">Notes</label><textarea class="input-field" id="ob-meds" rows="3" placeholder="e.g. vitamin D in the mornings…"></textarea></div>
        ${skippableFooter('ob-meds-save', 8)}
      </div>`, 96, 6);
    wireSkip();
    document.getElementById('ob-meds-save').addEventListener('click', () => {
      const medications_note = document.getElementById('ob-meds').value.trim();
      withSave(() => saveHealthProfile({ medications_note }), 8);
    });
  }

  function renderFinish() {
    shell(`
      <div class="card text-center">
        <div class="mb-2 text-accent flex justify-center" aria-hidden="true">${icons.check}</div>
        <h2 class="mb-2">You're all set!</h2>
        <p class="text-sm text-secondary mb-4" style="line-height:1.6;">
          Your baseline and starting targets are saved. Log your first meal to start building your history — your first pattern observation appears after about <strong>3 days</strong> of logging.
        </p>
        <div id="ob-finish-error" role="alert" style="display:none;font-size:var(--text-sm);color:var(--error);margin-bottom:var(--space-3);"></div>
        <div class="flex-col gap-2">
          <button type="button" class="btn btn-glass btn-block" id="ob-finish-meal">Log my first meal</button>
          <button type="button" class="btn bg-surface-2 border text-secondary" id="ob-finish-dash">Go to dashboard</button>
        </div>
      </div>`, 100, 7);
    document.getElementById('ob-finish-meal').addEventListener('click', () => finish('#/food-scanner'));
    document.getElementById('ob-finish-dash').addEventListener('click', () => finish('#/'));
  }

  // ── Flow control ─────────────────────────────────────────
  async function finish(targetHash) {
    const buttons = Array.from(document.querySelectorAll('#ob-step button'));
    const errEl = document.getElementById('ob-finish-error');
    buttons.forEach(b => { b.disabled = true; });
    try {
      // upsert (not update) so the flag sticks even if no profiles row exists yet.
      const { error } = await supabase.from('profiles').upsert({ id: userId, onboarding_completed: true }, { onConflict: 'id' });
      if (error) throw error;
    } catch (e) {
      console.warn('[Onboarding] Could not set onboarding_completed:', e?.message);
      if (errEl) { errEl.textContent = "Couldn't finish setup. Check your connection and try again."; errEl.style.display = 'block'; }
      buttons.forEach(b => { b.disabled = false; });
      return;
    }
    markOnboardingComplete();
    trackEvent('onboarding_completed', { userId });
    const nav = document.getElementById('bottom-nav');
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
