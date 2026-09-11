import { supabase } from '../lib/supabase.js';
import { profile } from '../lib/db.js';
import { icons } from '../icons.js';
import { doshaData, doshaQuiz, faceMappingZones, tongueDiagnosis } from '../utils/eastern-medicine-data.js';
import { apiFetch } from '../utils/api.js';
import { esc } from '../utils/esc.js';
import { initTablist } from '../utils/tablist.js';

import { showToast } from '../utils/toast.js';
let activeTab = 'dosha';
let quizStep = 0;
let quizAnswers = [];
let tcmProfile = null;
let userProfile = null; // profiles row — `dosha` lives here
let userId = null;
let profileLoading = false;
let profileError = false;

const TABS = [
  { id: 'dosha', label: 'Dosha Quiz' },
  { id: 'facemap', label: 'Face Map' },
  { id: 'tongue', label: 'Tongue' },
];

export async function renderEasternMedicine() {
  // Get userId from Supabase auth
  try {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id || null;
    if (!userId) {
      console.warn('[EasternMedicine] No authenticated user found');
    }
  } catch (err) {
    console.error('[EasternMedicine] Failed to get user:', err);
    userId = null;
  }

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="eastern-med stagger-children">
      <div class="page-header"><h1>Eastern Medicine</h1><p>Ayurvedic and Traditional Chinese Medicine frameworks</p></div>
      <p class="disclaimer" style="margin:0 0 var(--space-4);">These are traditional cultural frameworks for reflecting on wellbeing. They are not diagnostic tools, they do not detect or assess any condition, and they do not replace care from a licensed provider.</p>
      <div id="em-summary" aria-live="polite"></div>
      <div class="tab-bar" id="em-tabs" role="tablist" aria-label="Eastern medicine sections">
        ${TABS.map(t => `<button type="button" role="tab" id="em-tab-${t.id}" aria-controls="em-content" class="tab-item ${t.id === activeTab ? 'active' : ''}" aria-selected="${t.id === activeTab}" data-tab="${t.id}">${esc(t.label)}</button>`).join('')}
      </div>
      <div id="em-content" role="tabpanel" aria-labelledby="em-tab-${activeTab}"></div>
    </div>`;

  // Click + Arrow/Home/End handling and active/aria-selected/tabindex state
  // live in initTablist (WAI-ARIA tabs pattern).
  initTablist(document.getElementById('em-tabs'), tab => {
    activeTab = tab.dataset.tab;
    document.getElementById('em-content')?.setAttribute('aria-labelledby', `em-tab-${activeTab}`);
    renderEMContent();
  });

  await loadProfileData();
  renderEMContent();
}

async function loadProfileData() {
  profileLoading = true;
  profileError = false;
  const summary = document.getElementById('em-summary');
  if (summary) {
    summary.innerHTML = `<div class="card text-center p-6" role="status"><div class="spinner" style="margin:0 auto var(--space-2);"></div><p class="text-sm text-secondary m-0">Loading your profile…</p></div>`;
  }
  if (!userId) {
    profileLoading = false;
    profileError = true;
    return;
  }
  const results = await Promise.all([fetchTCMProfile(), fetchUserProfile()]);
  profileLoading = false;
  profileError = results.some(ok => !ok);
}

async function fetchTCMProfile() {
  try {
    const res = await apiFetch(`/api/tcm-profile?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error(`TCM profile request failed (${res.status})`);
    const data = await res.json();
    tcmProfile = data.profile || null;
    return true;
  } catch (err) {
    console.warn('[EasternMedicine] TCM profile fetch failed:', err.message);
    tcmProfile = null;
    return false;
  }
}

// The saved dosha is a column on `profiles` (written by saveDoshaResult via
// profile.update), so it has to be read back from that same row.
async function fetchUserProfile() {
  try {
    userProfile = await profile.get();
    return true;
  } catch (err) {
    // No profiles row yet means nothing saved — not a load failure.
    if (err?.code === 'PGRST116') { userProfile = null; return true; }
    console.warn('[EasternMedicine] Profile fetch failed:', err.message);
    userProfile = null;
    return false;
  }
}

function renderEMContent() {
  const summaryContainer = document.getElementById('em-summary');
  if (summaryContainer) summaryContainer.innerHTML = renderSummaryPanel();

  const content = document.getElementById('em-content');
  if (!content) return;

  if (activeTab === 'dosha') content.innerHTML = renderDoshaTab();
  else if (activeTab === 'facemap') content.innerHTML = renderFaceMap();
  else content.innerHTML = renderTongue();

  setupEMHandlers();
}

function renderSummaryPanel() {
  if (profileLoading) {
    return `<div class="card text-center p-6" role="status"><div class="spinner" style="margin:0 auto var(--space-2);"></div><p class="text-sm text-secondary m-0">Loading your profile…</p></div>`;
  }

  if (profileError) {
    return `<div class="empty-state card mb-4" role="alert">
      <h2 class="h3">Couldn't load your profile</h2>
      <p>Check your connection and try again. The quiz and reference sections below still work.</p>
      <button type="button" class="btn btn-sm" id="em-profile-retry">Try again</button>
    </div>`;
  }

  if (!tcmProfile) {
    return `<div class="card flex-col gap-3">
      <div class="flex-between">
        <div>
          <h2 class="h3 m-0">Your TCM Constitution</h2>
          <p class="text-secondary" style="margin:var(--space-1) 0 0;">No constitution data yet. Take the Dosha quiz or analyze a few meals to build your profile.</p>
        </div>
        <div class="text-tertiary" aria-hidden="true">${icons.sparkle}</div>
      </div>
    </div>`;
  }

  return `
    <div class="grid-2 gap-4 mb-4">
      <div class="card">
        <div class="flex justify-between items-start gap-3">
          <div>
            <h2 class="h3" style="margin:0 0 var(--space-2);">Constitution Summary</h2>
            <p class="text-sm text-secondary" style="margin:0 0 var(--space-3);">Derived from meal history and food pattern analysis.</p>
          </div>
          <span class="badge badge-teal">Profile data</span>
        </div>
        <div class="grid-2 gap-3 mt-4">
          <div class="p-3 bg-surface-2 rounded-md">
            <div class="mb-1 text-tertiary text-xs">Thermal Type</div>
            <div class="text-lg font-bold">${esc(tcmProfile.thermalType || 'Balanced')}</div>
          </div>
          <div class="p-3 bg-surface-2 rounded-md">
            <div class="mb-1 text-tertiary text-xs">Moisture Type</div>
            <div class="text-lg font-bold">${esc(tcmProfile.moistureType || 'Balanced')}</div>
          </div>
          <div class="p-3 bg-surface-2 rounded-md" style="grid-column:span 2;">
            <div class="mb-1 text-tertiary text-xs">Dominant Organ System (traditional)</div>
            <div class="text-lg font-bold">${esc(tcmProfile.dominantOrganSystem || 'Balanced')}</div>
          </div>
          <div class="p-3 bg-surface-2 rounded-md">
            <div class="mb-1 text-tertiary text-xs">Foods Analyzed</div>
            <div class="text-lg font-bold">${Number(tcmProfile.total_foods_analyzed) || 0}</div>
          </div>
          <div class="p-3 bg-surface-2 rounded-md">
            <div class="mb-1 text-tertiary text-xs">Meals analyzed</div>
            <div class="text-lg font-bold">${Math.round((Number(tcmProfile.total_foods_analyzed) || 0) / 3) || 0}</div>
          </div>
        </div>
      </div>
      ${renderTCMPatternCard()}
    </div>`;
}

function renderTCMPatternCard() {
  if (!tcmProfile) return `<div class="card"><h2 class="h3">Your TCM Pattern</h2><p class="text-secondary text-sm">Analyze meals to build your accumulated constitution pattern.</p></div>`;

  const n = (v) => Number(v) || 0;
  const thermal = [
    { label: 'Hot', value: n(tcmProfile.hot_count) },
    { label: 'Warm', value: n(tcmProfile.warm_count) },
    { label: 'Neutral', value: n(tcmProfile.neutral_count) },
    { label: 'Cool', value: n(tcmProfile.cool_count) },
    { label: 'Cold', value: n(tcmProfile.cold_count) },
  ];
  const moisture = [
    { label: 'Damp', value: n(tcmProfile.damp_count) },
    { label: 'Balanced', value: n(tcmProfile.moist_count) },
    { label: 'Dry', value: n(tcmProfile.dry_count) },
  ];
  const flavors = [
    { label: 'Sweet', value: n(tcmProfile.sweet_count) },
    { label: 'Sour', value: n(tcmProfile.sour_count) },
    { label: 'Bitter', value: n(tcmProfile.bitter_count) },
    { label: 'Pungent', value: n(tcmProfile.pungent_count) },
    { label: 'Salty', value: n(tcmProfile.salty_count) },
  ];
  const totalPattern = thermal.reduce((sum, item) => sum + item.value, 0) + moisture.reduce((sum, item) => sum + item.value, 0);

  return `<div class="card">
      <div class="flex justify-between items-start gap-3">
        <div>
          <h2 class="h3" style="margin:0 0 var(--space-2);">Your TCM Pattern</h2>
          <p class="text-sm text-secondary m-0">Accumulated constitution data from meal history.</p>
        </div>
        <span class="badge badge-secondary">Pattern</span>
      </div>
      <div class="mt-4">
        <div class="mb-2 text-tertiary text-xs">Dominant Flavor</div>
        <div class="text-lg font-bold mb-3">${esc(tcmProfile.dominantFlavor || 'Balanced')}</div>
        <div class="grid gap-2">
          ${renderPatternRows('Thermal Tendency', thermal, totalPattern)}
          ${renderPatternRows('Moisture Balance', moisture, totalPattern)}
          ${renderPatternRows('Flavor Profile', flavors, totalPattern)}
        </div>
      </div>
    </div>`;
}

function renderPatternRows(title, items, total) {
  return `<div class="p-3 bg-surface-2 rounded-md">
      <div class="mb-2 text-tertiary text-xs">${esc(title)}</div>
      ${items.map(item => {
    const pct = total ? Math.round((item.value / total) * 100) : 0;
    return `<div class="mb-2">
            <div class="flex justify-between text-xs text-primary" style="margin-bottom:4px;"><span>${esc(item.label)}</span><span>${item.value} <span class="visually-hidden">(${pct}%)</span></span></div>
            <div class="w-full bg-surface-3" style="height:6px;border-radius:999px;" aria-hidden="true"><div style="width:${pct}%;height:100%;background:var(--viz-green);border-radius:999px;"></div></div>
          </div>`;
  }).join('')}
    </div>`;
}

function renderDoshaTab() {
  const savedDosha = userProfile?.dosha;
  if (savedDosha && quizStep === 0) return renderDoshaProfile(savedDosha);
  return renderQuiz();
}

function renderQuiz() {
  if (quizStep >= doshaQuiz.length) return finishQuiz();
  const q = doshaQuiz[quizStep];
  return `<div class="animate-fade-in-up flex-col gap-4" role="group" aria-labelledby="quiz-question">
    <div class="card text-center">
      <div class="mb-2 text-tertiary text-xs" aria-live="polite">Question ${quizStep + 1} of ${doshaQuiz.length}</div>
      <div class="progress-bar mb-4" role="progressbar" aria-valuemin="1" aria-valuemax="${doshaQuiz.length}" aria-valuenow="${quizStep + 1}" aria-label="Quiz progress"><div class="progress-fill" style="width:${((quizStep + 1) / doshaQuiz.length) * 100}%"></div></div>
      <h2 id="quiz-question" class="text-md" style="line-height:1.4;">${esc(q.question)}</h2>
    </div>
    ${q.options.map((opt, i) => `
      <button type="button" class="card card-sm quiz-option block w-full text-left cursor-pointer" data-dosha="${esc(opt.dosha)}" data-idx="${i}" style="color:inherit;">
        <p class="text-sm text-primary m-0">${esc(opt.text)}</p>
      </button>
    `).join('')}
  </div>`;
}

function finishQuiz() {
  const counts = { vata: 0, pitta: 0, kapha: 0 };
  quizAnswers.forEach(a => { if (counts[a] !== undefined) counts[a]++; });
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  quizStep = 0;
  quizAnswers = [];
  saveDoshaResult(dominant);
  if (!userProfile) userProfile = {};
  userProfile.dosha = dominant; // show immediately; saveDoshaResult persists the same column
  return renderDoshaProfile(dominant);
}

function renderDoshaProfile(doshaKey) {
  const d = doshaData[doshaKey] || doshaData.vata;
  return `<div class="stagger-children flex-col gap-4">
    <div class="card" style="text-align:center;border:1px solid ${d.colorDim};">
      <div class="mb-2" style="font-size:48px;" aria-hidden="true">${d.icon}</div>
      <h2 class="mb-1">Your responses suggest <span style="color:${d.color};">${esc(d.name)}</span></h2>
      <p class="text-sm">${esc(d.element)}</p>
      <div class="flex flex-wrap justify-center gap-2 mt-3">
        ${d.qualities.map(q => `<span class="badge" style="background:${d.colorDim};color:${d.color};">${esc(q)}</span>`).join('')}
      </div>
    </div>
    <p class="disclaimer">A dosha is a traditional Ayurvedic way of describing tendencies, not a medical finding. Think of it as something to explore, not a label.</p>
    <div class="card"><h3 class="h4 mb-2">Body Type (traditional description)</h3><p class="text-sm">${esc(d.bodyType)}</p></div>
    <div class="card"><h3 class="h4 mb-2">Personality (traditional description)</h3><p class="text-sm">${esc(d.personality)}</p></div>
    <div class="card"><h3 class="h4 mb-2">Signs traditionally linked to imbalance</h3>
      <div class="flex flex-wrap gap-2">${d.imbalanceSigns.map(s => `<span class="badge badge-amber">${esc(s)}</span>`).join('')}</div>
    </div>
    <div class="grid-2 gap-4">
      <div class="card"><h3 class="mb-2 text-sm">Foods traditionally favored</h3>
        ${d.foods.favor.map(f => `<div class="text-xs text-green" style="padding:var(--space-1) 0;">• ${esc(f)}</div>`).join('')}
      </div>
      <div class="card"><h3 class="mb-2 text-sm">Foods traditionally limited</h3>
        ${d.foods.avoid.map(f => `<div class="text-xs text-amber" style="padding:var(--space-1) 0;">• ${esc(f)}</div>`).join('')}
      </div>
    </div>
    <div class="card"><h3 class="h4 mb-2">Herbs traditionally associated</h3>
      <div class="flex flex-wrap gap-2">${d.herbs.map(h => `<span class="badge badge-green">${esc(h)}</span>`).join('')}</div>
      <p class="disclaimer mt-2 text-xs">Listed for cultural context only. Herbs can interact with medications — check with a pharmacist or licensed provider before trying any.</p>
    </div>
    <div class="card"><h3 class="h4 mb-2">Lifestyle practices traditionally suggested</h3>
      ${d.lifestyle.map(l => `<div class="text-sm text-secondary" style="padding:var(--space-1) 0;">• ${esc(l)}</div>`).join('')}
    </div>
    <button type="button" class="btn btn-secondary btn-block" id="retake-quiz">Retake Quiz</button>
  </div>`;
}

function renderFaceMap() {
  return `<div class="stagger-children flex-col gap-4">
    <div class="card text-center">
      <h3 class="h4 mb-2">Chinese Face Mapping</h3>
      <p class="mb-4 text-secondary text-xs">In traditional face mapping, each zone is associated with an organ system. This is a cultural framework, not a diagnostic tool.</p>
      <div class="face-map rounded-xl relative" role="group" aria-label="Face map zones" style="background:var(--bg-glass-heavy);border:1px solid var(--border-subtle);min-height:360px;">
        <div class="text-primary" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.15;" aria-hidden="true">${icons.user}</div>
        ${faceMappingZones.map(z => `<button type="button" class="face-map-zone" data-zone="${esc(z.id)}" aria-label="${esc(z.name)} zone" style="position:absolute;top:${z.position.top};left:${z.position.left};width:${z.position.width};height:${z.position.height};border-radius:var(--radius-md);"></button>`).join('')}
      </div>
    </div>
    <div id="zone-detail" aria-live="polite"></div>
    <div class="section-heading"><h2 class="h3">All Zones</h2></div>
    ${faceMappingZones.map(z => `<button type="button" class="card card-sm zone-list-item block w-full text-left cursor-pointer" data-zone="${esc(z.id)}" style="color:inherit;">
      <div class="flex-between">
        <div><div class="font-semibold text-sm">${esc(z.name)}</div><div class="text-tertiary text-xs">${esc(z.organ)}</div></div>
        <span class="text-tertiary text-xs" aria-hidden="true">→</span>
      </div>
    </button>`).join('')}
  </div>`;
}

function renderTongue() {
  return `<div class="stagger-children flex-col gap-4">
    <div class="card text-center">
      <div class="mb-2 text-tertiary flex justify-center" aria-hidden="true">${icons.droplet}</div>
      <h3 class="h4">Tongue Observations</h3>
      <p class="text-secondary text-xs">In TCM tradition, the look of the tongue is read as a reflection of internal balance. These are cultural observations to explore, not medical findings.</p>
    </div>
    ${tongueDiagnosis.map(t => `<div class="card card-sm">
      <h3 class="text-sm mb-1 text-amber">${esc(t.condition)}</h3>
      <p class="mb-2 text-secondary text-xs">${esc(t.meaning)}</p>
      <p class="text-xs text-green">Traditionally paired with: ${esc(t.recommendation)}</p>
    </div>`).join('')}
  </div>`;
}

function setupEMHandlers() {
  document.getElementById('em-profile-retry')?.addEventListener('click', async () => {
    await loadProfileData();
    renderEMContent();
  });

  document.querySelectorAll('.quiz-option').forEach(opt => {
    opt.addEventListener('click', () => {
      quizAnswers.push(opt.dataset.dosha);
      quizStep++;
      const content = document.getElementById('em-content');
      if (content) {
        content.innerHTML = renderDoshaTab();
        setupEMHandlers();
        content.querySelector('h2, h3')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  document.getElementById('retake-quiz')?.addEventListener('click', () => {
    quizStep = 0;
    quizAnswers = [];
    const content = document.getElementById('em-content');
    if (content) {
      content.innerHTML = renderQuiz();
      setupEMHandlers();
    }
  });

  document.querySelectorAll('.face-map-zone, .zone-list-item').forEach(el => {
    el.addEventListener('click', () => {
      const zone = faceMappingZones.find(z => z.id === el.dataset.zone);
      if (!zone) return;
      document.querySelectorAll('.face-map-zone').forEach(z => {
        const on = z.dataset.zone === zone.id;
        z.classList.toggle('active', on);
        z.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      const detail = document.getElementById('zone-detail');
      if (!detail) return;
      detail.innerHTML = `<div class="card animate-fade-in-up" style="border-left:3px solid var(--viz-green);">
            <h3 class="h4 mb-1">${esc(zone.name)}</h3>
            <p class="text-xs mb-2" style="color:var(--accent-purple);">${esc(zone.tcmMeridian)}</p>
            <p class="font-semibold mb-1 text-sm">Traditionally linked to: ${esc(zone.organ)}</p>
            <div style="margin:var(--space-2) 0;"><p class="font-semibold mb-1 text-xs">Traditionally associated signs:</p>
              ${zone.signs.map(s => `<p class="text-xs text-secondary" style="padding:var(--space-1) 0;">• ${esc(s)}</p>`).join('')}</div>
            <div><p class="font-semibold mb-1 text-xs">Things traditionally worth exploring:</p>
              ${zone.recommendations.map(r => `<p class="text-xs text-green" style="padding:var(--space-1) 0;">${esc(r)}</p>`).join('')}</div>
            <p class="disclaimer mt-2 text-xs">Cultural framework only — not a finding about your health.</p>
          </div>`;
      detail.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

async function saveDoshaResult(doshaKey) {
  if (!userId) {
    showToast("Your result is shown here, but couldn't be saved — you're not signed in.");
    return;
  }
  try {
    // `dosha` lives on profiles (not health_profile); write it through the RLS-scoped profile helper.
    await profile.update({ dosha: doshaKey });
    showToast('Dosha saved to your profile');
  } catch (err) {
    console.error('[EasternMedicine] Save dosha failed:', err);
    showToast("Couldn't save your result right now. It's still shown here — retake the quiz later to save it.");
  }
}
