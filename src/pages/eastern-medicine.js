import { supabase } from '../lib/supabase.js';
import { icons } from '../icons.js';
import { doshaData, doshaQuiz, faceMappingZones, tongueDiagnosis } from '../utils/eastern-medicine-data.js';
import { apiFetch } from '../utils/api.js';

import { showToast } from '../utils/toast.js';
let activeTab = 'dosha';
let quizStep = 0;
let quizAnswers = [];
let tcmProfile = null;
let healthProfile = null;
let userId = null;

export async function renderEasternMedicine() {
  // Get userId from Supabase auth
  try {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id;
    if (!userId) {
      console.warn('[EasternMedicine] No authenticated user found');
    }
  } catch (err) {
    console.error('[EasternMedicine] Failed to get user:', err);
  }

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="eastern-med stagger-children">
      <div class="page-header"><h1>Eastern Medicine</h1><p>Ayurveda, Chinese medicine & holistic wellness</p></div>
      <div id="em-summary"></div>
      <div class="tab-bar" id="em-tabs">
        <div class="tab-item active" data-tab="dosha">Dosha Quiz</div>
        <div class="tab-item" data-tab="facemap">Face Map</div>
        <div class="tab-item" data-tab="tongue">Tongue</div>
      </div>
      <div id="em-content"></div>
    </div>`;

  document.querySelectorAll('#em-tabs .tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#em-tabs .tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      renderEMContent();
    });
  });

  await loadProfileData();
  renderEMContent();
}

async function loadProfileData() {
  await Promise.all([fetchTCMProfile(), fetchHealthProfile()]);
}

async function fetchTCMProfile() {
  try {
    const res = await apiFetch(`/api/tcm-profile?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error('Failed to load TCM profile');
    const data = await res.json();
    tcmProfile = data.profile || null;
  } catch (err) {
    console.warn('[EasternMedicine] TCM profile fetch failed:', err.message);
    tcmProfile = null;
  }
}

async function fetchHealthProfile() {
  try {
    const res = await apiFetch(`/api/health-profile?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error('Failed to load health profile');
    const data = await res.json();
    healthProfile = data.profile || null;
  } catch (err) {
    console.warn('[EasternMedicine] Health profile fetch failed:', err.message);
    healthProfile = null;
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
  if (!tcmProfile) {
    return `<div class="card" style="display:flex;flex-direction:column;gap:var(--space-3);">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h3 style="margin:0;">Your TCM Constitution</h3>
          <p style="margin:var(--space-1) 0 0;color:var(--text-secondary);">No constitution data available yet. Start the Dosha quiz or analyze meals to build your profile.</p>
        </div>
        <div style="color:var(--text-tertiary);">${icons.sparkle}</div>
      </div>
    </div>`;
  }

  return `
    <div class="grid-2" style="gap:var(--space-4);margin-bottom:var(--space-4);">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-3);">
          <div>
            <h3 style="margin:0 0 var(--space-2);">Constitution Summary</h3>
            <p style="font-size:var(--text-sm);color:var(--text-secondary);margin:0 0 var(--space-3);">Derived from meal history and food pattern analysis.</p>
          </div>
          <span class="badge badge-teal">Profile data</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-3);margin-top:var(--space-4);">
          <div style="padding:var(--space-3);background:var(--surface-2);border-radius:var(--radius-md);">
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:var(--space-1);">Thermal Type</div>
            <div style="font-size:var(--text-lg);font-weight:var(--weight-bold);">${tcmProfile.thermalType || 'Balanced'}</div>
          </div>
          <div style="padding:var(--space-3);background:var(--surface-2);border-radius:var(--radius-md);">
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:var(--space-1);">Moisture Type</div>
            <div style="font-size:var(--text-lg);font-weight:var(--weight-bold);">${tcmProfile.moistureType || 'Balanced'}</div>
          </div>
          <div style="padding:var(--space-3);background:var(--surface-2);border-radius:var(--radius-md);grid-column:span 2;">
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:var(--space-1);">Dominant Organ System</div>
            <div style="font-size:var(--text-lg);font-weight:var(--weight-bold);">${tcmProfile.dominantOrganSystem || 'Balanced'}</div>
          </div>
          <div style="padding:var(--space-3);background:var(--surface-2);border-radius:var(--radius-md);">
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:var(--space-1);">Foods Analyzed</div>
            <div style="font-size:var(--text-lg);font-weight:var(--weight-bold);">${tcmProfile.total_foods_analyzed || 0}</div>
          </div>
          <div style="padding:var(--space-3);background:var(--surface-2);border-radius:var(--radius-md);">
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:var(--space-1);">Meals analyzed</div>
            <div style="font-size:var(--text-lg);font-weight:var(--weight-bold);">${Math.round((tcmProfile.total_foods_analyzed || 0) / 3) || 0}</div>
          </div>
        </div>
      </div>
      ${renderTCMPatternCard()}
    </div>`;
}

function renderTCMPatternCard() {
  if (!tcmProfile) return `<div class="card"><h3>Your TCM Pattern</h3><p style="font-size:var(--text-sm);color:var(--text-secondary);">Analyze meals to build your accumulated constitution pattern.</p></div>`;

  const thermal = [
    { label: 'Hot', value: tcmProfile.hot_count || 0 },
    { label: 'Warm', value: tcmProfile.warm_count || 0 },
    { label: 'Neutral', value: tcmProfile.neutral_count || 0 },
    { label: 'Cool', value: tcmProfile.cool_count || 0 },
    { label: 'Cold', value: tcmProfile.cold_count || 0 },
  ];
  const moisture = [
    { label: 'Damp', value: tcmProfile.damp_count || 0 },
    { label: 'Balanced', value: tcmProfile.moist_count || 0 },
    { label: 'Dry', value: tcmProfile.dry_count || 0 },
  ];
  const flavors = [
    { label: 'Sweet', value: tcmProfile.sweet_count || 0 },
    { label: 'Sour', value: tcmProfile.sour_count || 0 },
    { label: 'Bitter', value: tcmProfile.bitter_count || 0 },
    { label: 'Pungent', value: tcmProfile.pungent_count || 0 },
    { label: 'Salty', value: tcmProfile.salty_count || 0 },
  ];
  const totalPattern = thermal.reduce((sum, item) => sum + item.value, 0) + moisture.reduce((sum, item) => sum + item.value, 0);

  return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-3);">
        <div>
          <h3 style="margin:0 0 var(--space-2);">Your TCM Pattern</h3>
          <p style="font-size:var(--text-sm);color:var(--text-secondary);margin:0;">Accumulated constitution data from meal history.</p>
        </div>
        <span class="badge badge-secondary">Pattern</span>
      </div>
      <div style="margin-top:var(--space-4);">
        <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:var(--space-2);">Dominant Flavor</div>
        <div style="font-size:var(--text-lg);font-weight:var(--weight-bold);margin-bottom:var(--space-3);">${tcmProfile.dominantFlavor || 'Balanced'}</div>
        <div style="display:grid;gap:var(--space-2);">
          ${renderPatternRows('Thermal Tendency', thermal, totalPattern)}
          ${renderPatternRows('Moisture Balance', moisture, totalPattern)}
          ${renderPatternRows('Flavor Profile', flavors, totalPattern)}
        </div>
      </div>
    </div>`;
}

function renderPatternRows(title, items, total) {
  return `<div style="padding:var(--space-3);background:var(--surface-2);border-radius:var(--radius-md);">
      <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:var(--space-2);">${title}</div>
      ${items.map(item => {
    const pct = total ? Math.round((item.value / total) * 100) : 0;
    return `<div style="margin-bottom:var(--space-2);">
            <div style="display:flex;justify-content:space-between;font-size:var(--text-xs);color:var(--text-primary);margin-bottom:4px;"><span>${item.label}</span><span>${item.value}</span></div>
            <div style="height:6px;width:100%;background:var(--surface-3);border-radius:999px;"><div style="width:${pct}% ;height:100%;background:var(--accent-teal);border-radius:999px;"></div></div>
          </div>`;
  }).join('')}
    </div>`;
}

function renderDoshaTab() {
  const savedDosha = healthProfile?.dosha || tcmProfile?.dosha;
  if (savedDosha && quizStep === 0) return renderDoshaProfile(savedDosha);
  return renderQuiz();
}

function renderQuiz() {
  if (quizStep >= doshaQuiz.length) return finishQuiz();
  const q = doshaQuiz[quizStep];
  return `<div class="animate-fade-in-up" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card" style="text-align:center;">
      <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:var(--space-2);">Question ${quizStep + 1} of ${doshaQuiz.length}</div>
      <div class="progress-bar" style="margin-bottom:var(--space-4);"><div class="progress-fill" style="width:${((quizStep + 1) / doshaQuiz.length) * 100}%"></div></div>
      <h3 style="font-size:var(--text-md);line-height:1.4;">${q.question}</h3>
    </div>
    ${q.options.map((opt, i) => `
      <div class="card card-sm quiz-option" data-dosha="${opt.dosha}" data-idx="${i}" style="cursor:pointer;">
        <p style="font-size:var(--text-sm);color:var(--text-primary);margin:0;">${opt.text}</p>
      </div>
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
  if (!healthProfile) healthProfile = {};
  healthProfile.dosha = dominant;
  return renderDoshaProfile(dominant);
}

function renderDoshaProfile(doshaKey) {
  const d = doshaData[doshaKey] || doshaData.vata;
  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card" style="text-align:center;border:1px solid ${d.color}33;">
      <div style="font-size:48px;margin-bottom:var(--space-2);">${d.icon}</div>
      <h2 style="margin-bottom:var(--space-1);">You are <span style="color:${d.color};">${d.name}</span></h2>
      <p style="font-size:var(--text-sm);">${d.element}</p>
      <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:var(--space-2);margin-top:var(--space-3);">
        ${d.qualities.map(q => `<span class="badge" style="background:${d.colorDim};color:${d.color};">${q}</span>`).join('')}
      </div>
    </div>
    <div class="card"><h4 style="margin-bottom:var(--space-2);">Body Type</h4><p style="font-size:var(--text-sm);">${d.bodyType}</p></div>
    <div class="card"><h4 style="margin-bottom:var(--space-2);">Personality</h4><p style="font-size:var(--text-sm);">${d.personality}</p></div>
    <div class="card"><h4 style="margin-bottom:var(--space-2);">Imbalance Signs</h4>
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);">${d.imbalanceSigns.map(s => `<span class="badge badge-amber">${s}</span>`).join('')}</div>
    </div>
    <div class="grid-2" style="gap:var(--space-4);">
      <div class="card"><h4 style="margin-bottom:var(--space-2);font-size:var(--text-sm);">Foods to Favor</h4>
        ${d.foods.favor.map(f => `<div style="font-size:var(--text-xs);color:var(--accent-green);padding:var(--space-1) 0;">• ${f}</div>`).join('')}
      </div>
      <div class="card"><h4 style="margin-bottom:var(--space-2);font-size:var(--text-sm);">Foods to Avoid</h4>
        ${d.foods.avoid.map(f => `<div style="font-size:var(--text-xs);color:var(--accent-coral);padding:var(--space-1) 0;">• ${f}</div>`).join('')}
      </div>
    </div>
    <div class="card"><h4 style="margin-bottom:var(--space-2);">Recommended Herbs</h4>
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);">${d.herbs.map(h => `<span class="badge badge-green">${h}</span>`).join('')}</div>
    </div>
    <div class="card"><h4 style="margin-bottom:var(--space-2);">Lifestyle Tips</h4>
      ${d.lifestyle.map(l => `<div style="font-size:var(--text-sm);color:var(--text-secondary);padding:var(--space-1) 0;">• ${l}</div>`).join('')}
    </div>
    <button class="btn btn-secondary btn-block" id="retake-quiz">Retake Quiz</button>
  </div>`;
}

function renderFaceMap() {
  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card" style="text-align:center;">
      <h4 style="margin-bottom:var(--space-2);">Chinese Face Mapping</h4>
      <p style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-4);">Each facial zone connects to internal organs via TCM meridians. Tap a zone to learn more.</p>
      <div class="face-map" style="background:var(--bg-glass-heavy);border-radius:var(--radius-xl);border:1px solid var(--border-subtle);position:relative;min-height:360px;">
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0.15;color:var(--text-primary);">${icons.user}</div>
        ${faceMappingZones.map(z => `<div class="face-map-zone" data-zone="${z.id}" style="position:absolute;top:${z.position.top};left:${z.position.left};width:${z.position.width};height:${z.position.height};border-radius:var(--radius-md);"></div>`).join('')}
      </div>
    </div>
    <div id="zone-detail"></div>
    <div class="section-heading"><h3>All Zones</h3></div>
    ${faceMappingZones.map(z => `<div class="card card-sm zone-list-item" data-zone="${z.id}" style="cursor:pointer;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div><div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">${z.name}</div><div style="font-size:var(--text-xs);color:var(--text-tertiary);">${z.organ}</div></div>
        <span style="color:var(--text-tertiary);font-size:12px;">→</span>
      </div>
    </div>`).join('')}
  </div>`;
}

function renderTongue() {
  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card" style="text-align:center;">
      <div style="margin-bottom:var(--space-2);color:var(--text-tertiary);display:flex;justify-content:center;">${icons.droplet}</div>
      <h4>Tongue Diagnosis</h4>
      <p style="font-size:var(--text-xs);color:var(--text-secondary);">In TCM, the tongue reflects internal organ health.</p>
    </div>
    ${tongueDiagnosis.map(t => `<div class="card card-sm">
      <h4 style="font-size:var(--text-sm);margin-bottom:var(--space-1);color:var(--accent-amber);">${t.condition}</h4>
      <p style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-2);">${t.meaning}</p>
      <p style="font-size:var(--text-xs);color:var(--accent-teal);">${t.recommendation}</p>
    </div>`).join('')}
  </div>`;
}

function setupEMHandlers() {
  document.querySelectorAll('.quiz-option').forEach(opt => {
    opt.addEventListener('click', () => {
      quizAnswers.push(opt.dataset.dosha);
      quizStep++;
      const content = document.getElementById('em-content');
      if (content) {
        content.innerHTML = renderDoshaTab();
        setupEMHandlers();
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
      const detail = document.getElementById('zone-detail');
      if (!detail) return;
      detail.innerHTML = `<div class="card animate-fade-in-up" style="border-left:3px solid var(--accent-teal);">
            <h4 style="margin-bottom:var(--space-1);">${zone.name}</h4>
            <p style="font-size:var(--text-xs);color:var(--accent-purple);margin-bottom:var(--space-2);">${zone.tcmMeridian}</p>
            <p style="font-size:var(--text-sm);font-weight:var(--weight-semibold);margin-bottom:var(--space-1);">Connected Organ: ${zone.organ}</p>
            <div style="margin:var(--space-2) 0;"><p style="font-size:var(--text-xs);font-weight:var(--weight-semibold);margin-bottom:var(--space-1);">Signs to Watch:</p>
              ${zone.signs.map(s => `<p style="font-size:var(--text-xs);color:var(--text-secondary);padding:var(--space-1) 0;">• ${s}</p>`).join('')}</div>
            <div><p style="font-size:var(--text-xs);font-weight:var(--weight-semibold);margin-bottom:var(--space-1);">Recommendations:</p>
              ${zone.recommendations.map(r => `<p style="font-size:var(--text-xs);color:var(--accent-teal);padding:var(--space-1) 0;">${r}</p>`).join('')}</div>
          </div>`;
      detail.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

async function saveDoshaResult(doshaKey) {
  try {
    await apiFetch('/api/health-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, dosha: doshaKey }),
    });
    showToast('Dosha saved to your health profile');
  } catch (err) {
    console.error('[EasternMedicine] Save dosha failed:', err);
    showToast('Could not save dosha result');
  }
}

