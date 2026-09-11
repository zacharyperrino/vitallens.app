// Background (medical history) and Goals tabs.
import { apiFetch } from '../../utils/api.js';
import { esc } from '../../utils/esc.js';
import { currentUserId, loadErrorState } from './index.js';

// ═══════════════════════════════════════
//  Background Tab
// ═══════════════════════════════════════

const BACKGROUND_CONDITIONS = [
  'IBS', 'Diabetes', 'Hypertension', 'Anxiety', 'Depression',
  'ADHD', 'Hypothyroid', 'PCOS', 'Acne', 'Eczema',
  'Asthma', 'Arthritis', 'Migraines', 'GERD', 'Celiac',
  'Crohns', 'Sleep Apnea', 'Endometriosis', 'High Cholesterol', 'Chronic Fatigue',
];

function parseConditions(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function renderBackground() {
  let profile = {};
  let loadError = null;
  try {
    const res = await apiFetch(`/api/health-profile?userId=${encodeURIComponent(currentUserId)}`);
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    const data = await res.json();
    profile = data.profile || {};
  } catch (e) {
    loadError = e;
  }

  // Never show a blank form after a failed load — saving it would wipe the saved background.
  if (loadError) {
    return `<div class="stagger-children flex-col gap-4">
      <div class="card"><h4 class="mb-2">Medical history</h4>${loadErrorState('your health background', loadError, 'background-retry')}</div>
    </div>`;
  }

  const selectedConditions = parseConditions(profile.conditions);

  return `<div class="stagger-children flex-col gap-4">
    <div class="card">
      <h4 class="mb-2">Medical history</h4>
      <p class="disclaimer mb-3">Anything you note here is kept private and only used to add context to your own patterns.</p>
      <form id="background-form" class="flex-col gap-3">
        <fieldset style="border:0;padding:0;margin:0;min-width:0;">
          <legend style="display:block;margin-bottom:var(--space-2);font-weight:var(--weight-semibold);font-size:var(--text-sm);padding:0;">Health conditions</legend>
          <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:var(--space-2);">
            ${BACKGROUND_CONDITIONS.map((condition, i) => `
              <label for="bg-cond-${i}" style="display:flex;align-items:center;gap:var(--space-2);cursor:pointer;padding:var(--space-2);border-radius:var(--radius-md);border:1px solid var(--border);transition:all 0.2s;">
                <input type="checkbox" class="condition-check" id="bg-cond-${i}" value="${condition}" ${selectedConditions.includes(condition) ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;">
                <span class="text-sm">${condition}</span>
              </label>
            `).join('')}
          </div>
        </fieldset>
        <div class="input-group"><label for="bg-allergies">Allergies</label>
          <textarea class="input-field" id="bg-allergies" placeholder="List any allergies (medication, food, environmental, etc.)" style="min-height:100px;resize:vertical;">${esc(profile.allergies || '')}</textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Save health background</button>
      </form>
    </div>
  </div>`;
}

// ═══════════════════════════════════════
//  Goals Tab
// ═══════════════════════════════════════

export async function renderGoals() {
  let goals = {};
  let loadError = null;
  try {
    const res = await apiFetch(`/api/user-goals?userId=${encodeURIComponent(currentUserId)}`);
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    const data = await res.json();
    goals = data.goals || {};
  } catch (e) {
    loadError = e;
  }

  if (loadError) {
    return `<div class="stagger-children flex-col gap-4">
      <div class="card"><h4 class="mb-2">Health goals &amp; preferences</h4>${loadErrorState('your goals', loadError, 'goals-retry')}</div>
    </div>`;
  }

  return `<div class="stagger-children flex-col gap-4">
    <div class="card">
      <h4 class="mb-4">Health goals &amp; preferences</h4>
      <form id="goals-form" class="flex-col gap-3">
        <div class="input-group"><label for="goals-text">Goals</label>
          <textarea class="input-field" id="goals-text" placeholder="What are you working toward? (e.g. more energy, better sleep, less stress)" style="min-height:120px;resize:vertical;">${esc(goals.goals_text || '')}</textarea>
        </div>
        <div class="input-group"><label for="goals-dietary">Dietary restrictions</label>
          <textarea class="input-field" id="goals-dietary" placeholder="Anything you avoid or follow (e.g. vegetarian, gluten-free, keto)" style="min-height:100px;resize:vertical;">${esc(goals.dietary_restrictions || '')}</textarea>
        </div>
        <div class="input-group"><label for="goals-concerns">Health concerns</label>
          <textarea class="input-field" id="goals-concerns" placeholder="Anything you'd like to keep an eye on" style="min-height:100px;resize:vertical;">${esc(goals.health_concerns || '')}</textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Save goals</button>
      </form>
    </div>
  </div>`;
}
