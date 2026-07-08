import { icons } from '../icons.js';
import { analyzeStool } from '../utils/stool-analyzer.js';
import { createRingProgress } from '../utils/charts.js';
import { supabase } from '../lib/supabase.js';
import { getUserId } from '../lib/db.js';
import { apiFetch } from '../utils/api.js';

export async function renderStoolScanner() {
  const content = document.getElementById('page-content');
  const scans = await loadStoolHistory();

  content.innerHTML = `
    <div class="stool-scanner stagger-children">
      <div class="page-header"><h1>Stool Analysis</h1><p>Gut health insights from stool assessment</p></div>
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:var(--space-5);" id="stool-upload-card">
        <div class="upload-zone" id="stool-upload-zone">
          <input type="file" accept="image/*" id="stool-file-input">
          <div style="color:var(--text-tertiary);">${icons.camera}</div>
          <p><span class="upload-btn-text">Upload Photo</span> or drag & drop</p>
          <p style="font-size:var(--text-xs);">Private & secure — stored only with your account</p>
        </div>
      </div>
      <div id="stool-results" class="hidden"></div>
      <div class="section-heading" style="margin-top:var(--space-4);"><h3>Bristol Stool Scale</h3></div>
      <div class="card" style="margin-bottom:var(--space-5);">
        <div style="display:flex;flex-direction:column;gap:var(--space-2);">
          ${[{ t: 1, l: 'Hard lumps', c: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--viz-amber);"></span>' }, { t: 2, l: 'Lumpy sausage', c: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--viz-amber);"></span>' }, { t: 3, l: 'Cracked sausage', c: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--viz-neutral);"></span>' }, { t: 4, l: 'Smooth & soft', c: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--viz-green);"></span>' }, { t: 5, l: 'Soft blobs', c: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--viz-neutral);"></span>' }, { t: 6, l: 'Fluffy/mushy', c: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--viz-amber);"></span>' }, { t: 7, l: 'Watery', c: '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--viz-amber);"></span>' }].map(b =>
            `<div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-2) 0;${b.t === 4 ? 'background:var(--accent-green-dim);border-radius:var(--radius-sm);padding:var(--space-2) var(--space-3);margin:0 calc(-1 * var(--space-3));' : ''}">
              <span style="font-size:14px;">${b.c}</span>
              <span style="font-size:var(--text-sm);font-weight:var(--weight-semibold);min-width:28px;">Type ${b.t}</span>
              <span style="font-size:var(--text-xs);color:var(--text-secondary);">${b.l}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="section-heading"><h3>History</h3><span class="badge badge-amber">${scans.length}</span></div>
      <div style="display:flex;flex-direction:column;gap:var(--space-3);">
        ${scans.length > 0 ? scans.slice(0, 5).map(s => {
      const d = s.scanned_at ? new Date(s.scanned_at).toLocaleDateString() : 'Recently';
      const score = s.findings?.gutHealthScore ?? '--';
      const scoreColor = score >= 80 ? 'var(--accent-green)' : score >= 60 ? 'var(--accent-amber)' : 'var(--accent-coral)';
      return `<div class="card card-sm"><div style="display:flex;justify-content:space-between;align-items:center;">
            <div><div style="font-size:var(--text-sm);font-weight:var(--weight-semibold);">Type ${s.bristol_type || '?'}</div><div style="font-size:var(--text-xs);color:var(--text-tertiary);">${d}</div></div>
            <span style="font-family:var(--font-heading);font-weight:var(--weight-bold);color:${scoreColor};">${score}%</span>
          </div></div>`;
    }).join('') : `<div class="card" style="text-align:center;padding:var(--space-8);"><div style="margin-bottom:var(--space-3);color:var(--text-tertiary);display:flex;justify-content:center;">${icons.droplet}</div><h4>No analyses yet</h4><p style="font-size:var(--text-sm);">Upload to begin tracking gut health</p></div>`}
      </div>
    </div>`;

  setupStoolUpload();
}

async function loadStoolHistory() {
  try {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('stool_scans')
      .select('*')
      .eq('user_id', userId)
      .order('scanned_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[StoolScanner] Failed to load history', err.message || err);
    return [];
  }
}

function setupStoolUpload() {
  const zone = document.getElementById('stool-upload-zone');
  const input = document.getElementById('stool-file-input');
  ['dragenter', 'dragover'].forEach(e => zone?.addEventListener(e, ev => { ev.preventDefault(); zone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(e => zone?.addEventListener(e, ev => { ev.preventDefault(); zone.classList.remove('dragover'); }));
  zone?.addEventListener('drop', e => { if (e.dataTransfer?.files[0]) processScan(e.dataTransfer.files[0]); });
  input?.addEventListener('change', e => { if (e.target.files?.[0]) processScan(e.target.files[0]); });
}

async function processScan(file) {
  const card = document.getElementById('stool-upload-card');
  card.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:var(--space-10);gap:var(--space-3);">
    <div class="spinner"></div><p style="font-size:var(--text-sm);color:var(--text-secondary);">Analyzing sample...</p></div>`;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const result = analyzeStool(imageData);
      const scanData = {
        bristol_type: result.bristolType?.type || null,
        color: result.color?.color || '',
        notes: result.color?.meaning || '',
        findings: result,
        scanned_at: new Date().toISOString(),
      };

      try {
        const saved = await saveStoolScan(scanData);
        await ingestStoolScan(saved);
        card.innerHTML = `<div style="text-align:center;padding:var(--space-4);"><div class="badge badge-green">${icons.check} Analysis Complete</div></div>`;
        const resultsDiv = document.getElementById('stool-results');
        resultsDiv.classList.remove('hidden');
        resultsDiv.innerHTML = renderStoolResults(result);
        resultsDiv.scrollIntoView({ behavior: 'smooth' });
        await renderStoolScanner();
      } catch (err) {
        console.error('[StoolScanner] Save failed', err);
        card.innerHTML = `<div style="text-align:center;padding:var(--space-6);color:var(--accent-coral);"><div style="margin-bottom:var(--space-2);">Could not save stool scan.</div><div style="font-size:var(--text-sm);">${err.message || 'Please try again.'}</div></div>`;
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function saveStoolScan(scan) {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('stool_scans')
    .insert({ user_id: userId, ...scan })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function ingestStoolScan(scan) {
  try {
    const userId = await getUserId();
    await apiFetch('/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, eventType: 'stool_scan', data: scan }),
    });
  } catch (err) {
    console.warn('[StoolScanner] Ingest failed', err.message || err);
  }
}

function renderStoolResults(r) {
  const hc = r.gutHealthScore >= 80 ? 'var(--accent-green)' : r.gutHealthScore >= 60 ? 'var(--accent-amber)' : 'var(--accent-coral)';
  return `<div class="stagger-children" style="display:flex;flex-direction:column;gap:var(--space-4);">
    <div class="card" style="text-align:center;">
      <div class="health-ring" style="margin:0 auto var(--space-3);">
        ${createRingProgress(r.gutHealthScore, 100, 140, 10, hc)}
        <div class="ring-label"><div class="ring-score" style="color:${hc};font-size:var(--text-3xl);">${r.gutHealthScore}</div><div class="ring-text">Gut Health</div></div>
      </div>
    </div>
    <div class="grid-2">
      <div class="card card-sm" style="text-align:center;border-left:3px solid ${r.bristolType.health === 'excellent' || r.bristolType.health === 'good' ? 'var(--accent-green)' : 'var(--accent-amber)'};">
        <div style="font-size:24px;">${r.bristolType.icon}</div>
        <div style="font-family:var(--font-heading);font-weight:var(--weight-bold);">Type ${r.bristolType.type}</div>
        <div style="font-size:var(--text-xs);color:var(--text-secondary);">${r.bristolType.name}</div>
      </div>
      <div class="card card-sm" style="text-align:center;">
        <div style="color:var(--text-tertiary);">${icons.eye}</div>
        <div style="font-family:var(--font-heading);font-weight:var(--weight-bold);">${r.color.color}</div>
        <div style="font-size:var(--text-xs);color:var(--text-secondary);">${r.color.health === 'good' ? 'Normal' : 'Review'}</div>
      </div>
    </div>
    <div class="card">
      <h4 style="margin-bottom:var(--space-3);">Key Indicators</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
        <div><div style="font-size:var(--text-xs);color:var(--text-tertiary);">Transit Time</div><div style="font-weight:var(--weight-semibold);">${r.transitTime}</div></div>
        <div><div style="font-size:var(--text-xs);color:var(--text-tertiary);">Frequency</div><div style="font-weight:var(--weight-semibold);font-size:var(--text-sm);">${r.frequency}</div></div>
        <div><div style="font-size:var(--text-xs);color:var(--text-tertiary);">Hydration</div><div style="font-weight:var(--weight-semibold);">${r.hydrationLevel}%</div></div>
        <div><div style="font-size:var(--text-xs);color:var(--text-tertiary);">Microbiome</div><div style="font-weight:var(--weight-semibold);">${r.microbiomeDiversity}%</div></div>
      </div>
    </div>
    <div class="card"><h4 style="margin-bottom:var(--space-2);">Color Analysis</h4><p style="font-size:var(--text-sm);color:var(--text-secondary);">${r.color.meaning}</p></div>
    <div class="section-heading"><h3>Potential Deficiencies</h3></div>
    ${r.deficiencies.map(d => `<div class="card card-sm" style="border-left:3px solid var(--accent-amber);">
      <h4 style="font-size:var(--text-sm);margin-bottom:var(--space-1);">${d.name}</h4>
      <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:var(--space-1);">${d.sign}</p>
      <p style="font-size:var(--text-xs);color:var(--accent-teal);">${d.recommendation}</p>
    </div>`).join('')}
    <div class="section-heading"><h3>Recommendations</h3></div>
    ${r.recommendations.map(rec => `<div class="card card-sm"><p style="font-size:var(--text-sm);color:var(--text-secondary);">${rec}</p></div>`).join('')}
  </div>`;
}
