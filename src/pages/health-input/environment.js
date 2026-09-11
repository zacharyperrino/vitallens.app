// Environment tab: air quality, UV and water-risk snapshot for a location.
import { apiFetch } from '../../utils/api.js';
import { showToast } from '../../utils/toast.js';
import { esc } from '../../utils/esc.js';
import { loadErrorState, plainReason, renderTabContent } from './index.js';

// ═══════════════════════════════════════
//  Environment Tab
// ═══════════════════════════════════════

export async function renderEnvironment() {
  const { environment: env, error: loadError } = await loadLatestEnvironment();

  const air = env?.air || { aqi: env?.aqi, aqiCategory: env?.aqi_category, pm2_5: env?.pm2_5, uv_index: env?.uv_index ?? env?.raw?.air?.uv_index };
  const waterRisk = env?.water_risk ?? env?.raw?.water?.risk_level ?? null;
  const aqi = air?.aqi ?? null;
  const aqiCategory = air?.aqiCategory || '';
  const pm25 = air?.pm2_5 ?? null;
  const uvIndex = air?.uv_index ?? env?.raw?.air?.uv_index ?? null;
  const locationValue = env?.location || '';
  const fetchedAt = env?.fetched_at ? new Date(env.fetched_at).toLocaleString() : null;
  const aqiNum = Number(aqi);
  const aqiColor = Number.isFinite(aqiNum) && aqi !== null
    ? (aqiNum <= 50 ? 'var(--viz-green)' : aqiNum <= 100 ? 'var(--viz-amber)' : 'var(--error)')
    : 'var(--text-secondary)';
  const show = (v) => (v === null || v === undefined || v === '') ? '<span aria-label="No data">—</span>' : esc(v);

  let readings;
  if (loadError) {
    readings = loadErrorState('your environment data', loadError, 'env-retry');
  } else if (env) {
    readings = `
      ${locationValue ? `<div style="font-size:var(--text-xl);font-weight:700;color:var(--text-primary);margin-bottom:var(--space-3);">${esc(locationValue)}</div>` : ''}
      <div class="card card-sm mb-4">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
          <div style="padding:var(--space-3);border-radius:var(--radius-sm);background:var(--surface-2);">
            <div class="mb-2 text-secondary text-xs">Air quality index (AQI)</div>
            <div style="font-size:var(--text-3xl);font-weight:var(--weight-bold);color:${aqiColor};">${show(aqi)}</div>
            <div class="text-secondary text-sm">${aqiCategory ? esc(aqiCategory) : 'No category reported'}</div>
          </div>
          <div style="padding:var(--space-3);border-radius:var(--radius-sm);background:var(--surface-2);">
            <div class="mb-2 text-secondary text-xs">PM2.5</div>
            <div style="font-size:var(--text-2xl);font-weight:var(--weight-bold);">${show(pm25)}</div>
            <div class="text-secondary text-sm">μg/m³</div>
          </div>
          <div style="padding:var(--space-3);border-radius:var(--radius-sm);background:var(--surface-2);">
            <div class="mb-2 text-secondary text-xs">UV index</div>
            <div style="font-size:var(--text-2xl);font-weight:var(--weight-bold);">${show(uvIndex)}</div>
          </div>
          <div style="padding:var(--space-3);border-radius:var(--radius-sm);background:var(--surface-2);">
            <div class="mb-2 text-secondary text-xs">Water risk</div>
            <div style="font-size:var(--text-2xl);font-weight:var(--weight-bold);text-transform:capitalize;">${show(waterRisk)}</div>
          </div>
        </div>
        ${fetchedAt ? `<div class="mt-3 text-secondary text-xs">Last updated ${esc(fetchedAt)}</div>` : ''}
      </div>`;
  } else {
    readings = `<div class="empty-state"><p>No environment data yet. Enter your city or zip code below to fetch air quality, UV index and water safety for your area.</p></div>`;
  }

  return `<div class="stagger-children flex-col gap-4">
    <div class="card">
      <h4 class="mb-4">Environmental factors</h4>
      ${readings}
      <form id="env-form" class="flex-col gap-3">
        <div class="input-group"><label for="env-location">Location / city</label>
          <input class="input-field" type="text" id="env-location" value="" placeholder="e.g. Los Angeles, CA" autocomplete="off">
        </div>
        <button type="submit" id="env-refresh" class="btn btn-primary btn-block">Get environment data</button>
      </form>
    </div>
  </div>`;
}

// Resolves to { environment, error } so callers can tell "nothing saved yet" from "couldn't load".
async function loadLatestEnvironment() {
  try {
    const { supabase } = await import('../../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    if (!userId) return { environment: null, error: new Error('Not authenticated') };

    const res = await apiFetch(`/api/environment/latest?userId=${encodeURIComponent(userId)}`);
    if (res.status === 404) return { environment: null, error: null };
    if (!res.ok) return { environment: null, error: new Error(`Server responded ${res.status}`) };

    const json = await res.json();
    return { environment: json.environment || null, error: null };
  } catch (err) {
    console.warn('[HealthInput] Failed to load environment data', err);
    return { environment: null, error: err };
  }
}

export async function refreshEnvironmentData() {
  const locationInput = document.getElementById('env-location');
  const btn = document.getElementById('env-refresh');
  const location = locationInput?.value?.trim();
  if (!location) {
    showToast('Enter a city or zip code first');
    locationInput?.focus();
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Getting data…'; }
  try {
    const { supabase } = await import('../../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    const res = await apiFetch(`/api/environment?userId=${encodeURIComponent(userId || '')}&location=${encodeURIComponent(location)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server responded ${res.status}`);
    }
    await res.json();
    // The server persists a snapshot when userId is provided
    showToast('Environment data saved');
    renderTabContent();
  } catch (err) {
    console.error('[HealthInput] Refresh failed', err);
    showToast(/not found|unknown location|could not find/i.test(err.message) ? "Couldn't find that location — try a city name or zip code." : "Couldn't get environment data. " + plainReason(err));
    if (btn) { btn.disabled = false; btn.textContent = 'Get environment data'; }
  }
}
