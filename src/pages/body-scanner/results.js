// Per-mode result markup (face, tongue, body), the shared signal /
// recommendation cards, and the "vs previous check-in" delta card.
import { esc } from '../../utils/esc.js';
import { apiFetch } from '../../utils/api.js';
import { MODES, TONE, num, scoreTone, toneFor, words } from './shared.js';

// ═══════════════════════════════════════════════════
//  Results Display
// ═══════════════════════════════════════════════════

export async function fetchAndRenderDelta(scanType, currentScore) {
  const deltaCard = document.getElementById('scan-delta-card');
  if (!deltaCard) return;
  const m = MODES.find(x => x.id === scanType);
  const modeLabel = m ? m.label : scanType;

  try {
    const { supabase } = await import('../../lib/supabase.js');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;

    const res = await apiFetch(`/api/biomarker-history/latest?userId=${encodeURIComponent(user.id)}&type=${encodeURIComponent(scanType)}`);
    if (!res.ok) throw new Error(`history request failed (${res.status})`);
    const { previous } = await res.json();

    // `latest` is the check-in just saved — `previous` is the one before it.
    if (!previous || !Number.isFinite(Number(previous.score))) {
      deltaCard.innerHTML = `
        <div class="card card-sm" style="border-left:3px solid var(--viz-green);background:var(--viz-green-dim);">
          <div style="font-size:var(--text-xs);color:var(--text-secondary);font-weight:600;">First ${esc(modeLabel.toLowerCase())} check-in saved — next time you'll see how it compares.</div>
        </div>`;
      return;
    }

    const prevScore = Math.round(Number(previous.score));
    const delta = Math.round(Number(currentScore)) - prevScore;
    const tone = delta > 0 ? TONE.good : delta < 0 ? TONE.watch : TONE.neutral;
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
    const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'unchanged';
    const prevDate = previous.scanned_at ? new Date(previous.scanned_at).toLocaleDateString() : 'earlier';

    deltaCard.innerHTML = `
      <div class="card card-sm" style="border-left:3px solid ${tone.color};">
        <div class="flex-between">
          <div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:2px;">vs your previous ${esc(modeLabel.toLowerCase())} check-in · ${esc(prevDate)}</div>
            <div class="font-semibold text-sm">
              Score: <span style="color:${tone.color};font-weight:700;">${deltaStr} points</span> — ${direction}
            </div>
          </div>
          <div style="display:flex;gap:var(--space-3);align-items:center;">
            <div class="text-center">
              <div class="text-tertiary text-xs">Previous</div>
              <div style="font-family:var(--font-heading);font-size:var(--text-lg);font-weight:700;color:var(--text-secondary);">${prevScore}</div>
            </div>
            <div class="text-tertiary" aria-hidden="true">→</div>
            <div class="text-center">
              <div class="text-tertiary text-xs">Now</div>
              <div style="font-family:var(--font-heading);font-size:var(--text-lg);font-weight:700;color:${tone.color};">${num(currentScore)}</div>
            </div>
          </div>
        </div>
      </div>`;
  } catch (e) {
    console.warn('[ScanDelta] Failed to load comparison:', e?.message || e);
    deltaCard.innerHTML = `
      <div class="empty-state card card-sm" role="alert" style="padding:var(--space-3);">
        <h3 class="text-sm">Couldn't compare with your previous check-in</h3>
        <p class="text-xs">Your result below is saved. Check your connection to load the comparison.</p>
        <button type="button" class="btn btn-sm" id="delta-retry">Try again</button>
      </div>`;
    document.getElementById('delta-retry')?.addEventListener('click', () => fetchAndRenderDelta(scanType, currentScore));
  }
}

function renderScoreHeader(m, score, caption, badges = '') {
  const tone = scoreTone(Number(score));
  return `
    <div class="card text-center">
      <h3 class="mb-2">${esc(m.label)} Check-In</h3>
      <div style="font-family:var(--font-heading);font-size:var(--text-4xl);font-weight:var(--weight-extrabold);color:${tone.color};">${num(score)}</div>
      <p class="text-secondary text-sm">${esc(caption)} <span class="text-tertiary">(out of 100)</span></p>
      ${badges}
    </div>`;
}

function statTile(label, value, color) {
  return `
    <div style="padding:var(--space-2);background:var(--surface-2);border-radius:var(--radius-md);">
      <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:2px;">${esc(label)}</div>
      <div style="font-size:var(--text-sm);font-weight:600;${color ? `color:${color};` : ''}">${value}</div>
    </div>`;
}

// ─── Face Results ─────────────────────────────────

export function renderFaceResults(r, m) {
  const zones = r.zones || {};
  const zoneOrder = ['forehead', 'glabella', 'nose_tzone', 'left_cheek', 'right_cheek', 'chin_jawline', 'temples', 'perioral', 'periorbital'];
  const zoneLabels = { forehead: 'Forehead', glabella: 'Between Brows', nose_tzone: 'Nose / T-Zone', left_cheek: 'Left Cheek', right_cheek: 'Right Cheek', chin_jawline: 'Chin & Jawline', temples: 'Temples', perioral: 'Around the Mouth', periorbital: 'Under-Eye' };

  const badges = `
      <div style="display:flex;justify-content:center;gap:var(--space-2);margin-top:var(--space-3);flex-wrap:wrap;">
        ${r.hydration ? `<span class="badge badge-teal">${words(r.hydration)} skin</span>` : ''}
        ${r.primary_breakout_type && r.primary_breakout_type !== 'none' ? `<span class="badge badge-amber">${words(r.primary_breakout_type)} pattern noted</span>` : '<span class="badge badge-green">No breakout pattern noted</span>'}
      </div>`;

  return `
    ${renderScoreHeader(m, r.overallScore, 'Skin appearance score', badges)}

    <!-- Skin profile -->
    ${r.fitzpatrick_type ? `
    <div class="card">
      <h4 class="mb-3">Skin Profile</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-bottom:var(--space-3);">
        ${statTile('Fitzpatrick Type', `Type ${words(r.fitzpatrick_type)}`, 'var(--viz-green)')}
        ${statTile('Skin Barrier', words(r.skin_barrier, 'unknown'), toneFor(r.skin_barrier).color)}
        ${statTile('Collagen', words(r.collagen_density_estimate))}
        ${statTile('Texture', words(r.skin_texture))}
      </div>
      ${r.fitzpatrick_notes ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;margin-bottom:var(--space-2);">${esc(r.fitzpatrick_notes)}</p>` : ''}
      ${r.skin_barrier_notes ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;">${esc(r.skin_barrier_notes)}</p>` : ''}
    </div>` : ''}

    <!-- Structure notes -->
    ${(r.forehead_lines || r.nasolabial_folds || r.jowling || r.temporal_hollowing) ? `
    <div class="card">
      <h4 class="mb-3">Structure Notes</h4>
      <div class="flex-col gap-2">
        ${r.forehead_lines ? `
        <div style="padding:var(--space-2) 0;border-bottom:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span class="text-secondary text-xs">Forehead Lines</span>
            <span style="font-size:var(--text-xs);font-weight:600;">Horizontal: ${words(r.forehead_lines.horizontal)} · Vertical: ${words(r.forehead_lines.vertical_glabellar)}</span>
          </div>
          ${r.forehead_lines.wellness_note ? `<p class="text-tertiary text-xs">${esc(r.forehead_lines.wellness_note)}</p>` : ''}
        </div>` : ''}
        ${r.nasolabial_folds ? `
        <div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px solid var(--border);">
          <span class="text-secondary text-xs">Smile Lines</span>
          <span style="font-size:var(--text-xs);font-weight:600;">${words(r.nasolabial_folds)}</span>
        </div>` : ''}
        ${r.jowling ? `
        <div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px solid var(--border);">
          <span class="text-secondary text-xs">Jawline Softness</span>
          <span style="font-size:var(--text-xs);font-weight:600;">${words(r.jowling)}</span>
        </div>` : ''}
        ${r.temporal_hollowing ? `
        <div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;">
          <span class="text-secondary text-xs">Temple Fullness</span>
          <span style="font-size:var(--text-xs);font-weight:600;">${words(r.temporal_hollowing)}</span>
        </div>` : ''}
      </div>
    </div>` : ''}

    <!-- Facial zones -->
    ${Object.keys(zones).length > 0 ? `
    <div class="section-heading"><h3>Facial Zones</h3></div>
    ${zoneOrder.filter(z => zones[z] && typeof zones[z] === 'object').map(z => {
      const zone = zones[z];
      const sev = zone.severity || (zone.dark_circles && zone.dark_circles !== 'none' ? zone.dark_circles : 'clear');
      const tone = toneFor(sev);
      // The under-eye zone has a different shape.
      if (z === 'periorbital') {
        return `
        <div class="card card-sm" style="border-left:3px solid ${toneFor(zone.dark_circles || 'clear').color};">
          <div class="flex-between mb-2">
            <span class="font-semibold text-sm">${esc(zoneLabels[z])}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-bottom:var(--space-2);">
            <div class="text-secondary text-xs">Dark circles: <strong>${words(zone.dark_circles)}</strong>${zone.dark_circle_tone && zone.dark_circle_tone !== 'none' ? ` (${words(zone.dark_circle_tone)})` : ''}</div>
            <div class="text-secondary text-xs">Puffiness: <strong>${words(zone.puffiness)}</strong></div>
            <div class="text-secondary text-xs">Fine lines: <strong>${words(zone.fine_lines)}</strong></div>
          </div>
          ${zone.wellness_signal ? `<p style="font-size:var(--text-xs);color:var(--viz-green);">${esc(zone.wellness_signal)}</p>` : ''}
        </div>`;
      }
      return `
      <div class="card card-sm" style="border-left:3px solid ${tone.color};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-2);">
          <div class="font-semibold text-sm">${esc(zoneLabels[z])}</div>
          <span style="font-size:var(--text-xs);padding:1px 6px;border-radius:4px;background:${tone.dim};color:${tone.color};font-weight:600;">${words(sev)}</span>
        </div>
        <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;margin-bottom:var(--space-1);">${esc(zone.condition || '')}</p>
        ${zone.wellness_signal ? `<p style="font-size:var(--text-xs);color:var(--viz-green);">${esc(zone.wellness_signal)}</p>` : ''}
        ${zone.possible_system ? `<p style="font-size:var(--text-xs);color:var(--viz-green);">${esc(zone.possible_system)}</p>` : ''}
      </div>`;
    }).join('')}` : ''}

    <!-- Skin tone notes -->
    ${r.discoloration && typeof r.discoloration === 'object' && Object.values(r.discoloration).some(v => v === true) ? `
    <div class="card">
      <h4 class="mb-3">Skin Tone Notes</h4>
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);">
        ${Object.entries(r.discoloration).filter(([, v]) => v === true).map(([k]) =>
          `<span style="font-size:var(--text-xs);padding:4px 10px;border-radius:var(--radius-full);background:var(--viz-amber-dim);color:var(--viz-amber);">${words(k)}</span>`
        ).join('')}
        ${r.discoloration.hyperpigmentation_pattern && r.discoloration.hyperpigmentation_pattern !== 'none' ? `<span style="font-size:var(--text-xs);padding:4px 10px;border-radius:var(--radius-full);background:var(--viz-amber-dim);color:var(--viz-amber);">${words(r.discoloration.hyperpigmentation_pattern)}</span>` : ''}
      </div>
    </div>` : ''}

    ${renderSignals(r.wellness_signals, 'Wellness Signals')}

    <!-- Other notes -->
    ${(r.eyebrow_notes && r.eyebrow_notes !== 'normal') || (r.lip_notes && r.lip_notes !== 'normal') || (r.facial_puffiness && r.facial_puffiness !== 'none') || (r.facial_symmetry && r.facial_symmetry !== 'normal') ? `
    <div class="card">
      <h4 class="mb-3">Other Notes</h4>
      <div class="flex-col gap-2">
        ${r.eyebrow_notes && r.eyebrow_notes !== 'normal' ? `<div style="display:flex;justify-content:space-between;"><span class="text-secondary text-xs">Eyebrows</span><span style="font-size:var(--text-xs);font-weight:600;color:var(--viz-amber);">${words(r.eyebrow_notes)}</span></div>` : ''}
        ${r.lip_notes && r.lip_notes !== 'normal' ? `<div style="display:flex;justify-content:space-between;"><span class="text-secondary text-xs">Lips</span><span style="font-size:var(--text-xs);font-weight:600;color:var(--viz-amber);">${words(r.lip_notes)}</span></div>` : ''}
        ${r.facial_puffiness && r.facial_puffiness !== 'none' ? `<div style="display:flex;justify-content:space-between;"><span class="text-secondary text-xs">Facial Puffiness</span><span style="font-size:var(--text-xs);font-weight:600;color:var(--viz-amber);">${words(r.facial_puffiness)}</span></div>` : ''}
        ${r.facial_symmetry && r.facial_symmetry !== 'normal' ? `<div style="display:flex;justify-content:space-between;"><span class="text-secondary text-xs">Symmetry</span><span style="font-size:var(--text-xs);font-weight:600;">${words(r.facial_symmetry)}</span></div>` : ''}
      </div>
    </div>` : ''}

    ${renderRecommendations(r.recommendations)}`;
}

// ─── Tongue Results ───────────────────────────────

export function renderTongueResults(r, m) {
  const bodyTone = { pale: TONE.neutral, pale_pink: TONE.neutral, normal_pink_red: TONE.good, red: TONE.watch, dark_red: TONE.watch, purple: TONE.watch, bluish: TONE.watch, mixed: TONE.watch };
  const body = r.body && typeof r.body === 'object' ? r.body : null;
  const coating = r.coating && typeof r.coating === 'object' ? r.coating : null;
  const tcm = r.tcm_interpretation && typeof r.tcm_interpretation === 'object' ? r.tcm_interpretation : null;

  return `
    ${renderScoreHeader(m, r.overallScore, 'Tongue observation score')}

    ${body ? `
    <div class="card">
      <h4 class="mb-3">Tongue Body</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);margin-bottom:var(--space-3);">
        ${statTile('Color', words(body.color), (bodyTone[body.color] || TONE.neutral).color)}
        ${statTile('Size', words(body.size))}
        ${statTile('Moisture', words(body.moisture))}
        ${statTile('Teeth Marks', body.teeth_marks ? 'Present' : 'None noted')}
      </div>
      ${body.color_significance ? `<p class="text-secondary text-xs">${esc(body.color_significance)}</p>` : ''}
      ${body.cracks?.present ? `
      <div style="margin-top:var(--space-2);padding:var(--space-2);background:var(--viz-amber-dim);border-radius:var(--radius-md);">
        <p style="font-size:var(--text-xs);color:var(--viz-amber);font-weight:600;">Cracks noted${Array.isArray(body.cracks.locations) && body.cracks.locations.length ? `: ${esc(body.cracks.locations.join(', '))}` : ''}</p>
        ${body.cracks.significance ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px;">${esc(body.cracks.significance)}</p>` : ''}
      </div>` : ''}
    </div>` : ''}

    ${coating ? `
    <div class="card">
      <h4 class="mb-3">Tongue Coating</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);">
        ${statTile('Thickness', words(coating.thickness))}
        ${statTile('Color', words(coating.color))}
        ${statTile('Distribution', words(coating.distribution))}
        ${statTile('Texture', words(coating.texture))}
      </div>
      ${coating.coating_significance ? `<p class="mt-2 text-secondary text-xs">${esc(coating.coating_significance)}</p>` : ''}
    </div>` : ''}

    ${tcm ? `
    <div class="card" style="border-left:3px solid var(--viz-green);">
      <h4 class="mb-2">Traditional (TCM) Pattern</h4>
      <p class="mb-2 text-tertiary text-xs">A cultural framework for reflection, not a medical finding.</p>
      ${tcm.primary_pattern ? `<p class="font-semibold mb-2 text-sm">${esc(tcm.primary_pattern)}</p>` : ''}
      ${Array.isArray(tcm.organ_systems_implicated) && tcm.organ_systems_implicated.length > 0 ? `
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-1);margin-bottom:var(--space-2);">
        ${tcm.organ_systems_implicated.map(o =>
    `<span style="font-size:var(--text-xs);padding:2px 8px;border-radius:4px;background:var(--viz-green-dim);color:var(--viz-green);">${esc(o)}</span>`
  ).join('')}
      </div>` : ''}
      ${tcm.element_imbalance ? `<p class="text-secondary text-xs">${esc(tcm.element_imbalance)}</p>` : ''}
    </div>` : ''}

    ${Array.isArray(r.nutritional_deficiency_flags) && r.nutritional_deficiency_flags.length > 0 ? `
    <div class="card card-sm" style="border-left:3px solid var(--viz-amber);">
      <h4 class="mb-2">Nutrition — something to explore</h4>
      ${r.nutritional_deficiency_flags.map(d =>
    `<div style="font-size:var(--text-xs);color:var(--text-secondary);padding:var(--space-1) 0;">• ${esc(typeof d === 'string' ? d : d?.text || d?.nutrient || '')}</div>`
  ).join('')}
    </div>` : ''}

    ${renderSignals(r.systemic_flags, 'Wellness Signals')}
    ${renderRecommendations(r.recommendations)}`;
}

// ─── Body Results ─────────────────────────────────

export function renderBodyResults(r, m) {
  const posture = r.posture && typeof r.posture === 'object' ? r.posture : null;
  const postureScore = Number(posture?.overall_posture_score ?? r.overallScore);
  const postureTone = scoreTone(postureScore);
  const imbalanceTone = { none: TONE.good, mild: TONE.watch, moderate: TONE.note, significant: TONE.note };
  const comp = r.body_composition && typeof r.body_composition === 'object' ? r.body_composition : null;
  const lymph = r.lymphatic_signals && typeof r.lymphatic_signals === 'object' ? r.lymphatic_signals : null;
  const sym = r.symmetry && typeof r.symmetry === 'object' ? r.symmetry : null;
  const muscle = r.muscle_imbalance && typeof r.muscle_imbalance === 'object' ? r.muscle_imbalance : null;
  const apt = r.anterior_pelvic_tilt && typeof r.anterior_pelvic_tilt === 'object' ? r.anterior_pelvic_tilt : null;
  const breathing = r.breathing_pattern && typeof r.breathing_pattern === 'object' ? r.breathing_pattern : null;

  const skip = (v, ...neutral) => !v || neutral.includes(v) || v === 'cannot_assess';

  return `
    ${renderScoreHeader(m, r.overallScore, 'Wellness score')}

    ${posture ? `
    <div class="card">
      <div class="flex-between mb-3">
        <h4>Posture Notes</h4>
        ${posture.overall_rating ? `<span style="font-family:var(--font-heading);font-weight:700;color:${postureTone.color};">${words(posture.overall_rating)}</span>` : ''}
      </div>
      <div class="flex-col gap-1">
        ${[
          { label: 'Head Position', value: posture.head_position },
          { label: 'Shoulders', value: posture.shoulder_position },
          { label: 'Shoulder Level', value: posture.shoulder_level },
          { label: 'Shoulder Blades', value: posture.scapular_position },
          { label: 'Spine', value: posture.spinal_pattern },
          { label: 'Side-to-side Curve', value: posture.lateral_curve_type },
          { label: 'Pelvis', value: posture.pelvic_position },
          { label: 'Knees', value: posture.knee_alignment },
          { label: 'Feet', value: posture.foot_position },
        ].filter(i => !skip(i.value, 'neutral', 'even', 'none')).map(item => `
        <div style="display:flex;justify-content:space-between;padding:var(--space-1) 0;border-bottom:1px solid var(--border);">
          <span class="text-secondary text-xs">${esc(item.label)}</span>
          <span style="font-size:var(--text-xs);font-weight:600;">${words(item.value)}</span>
        </div>`).join('')}
      </div>
      ${posture.primary_observation ? `<p style="font-size:var(--text-xs);color:var(--viz-amber);margin-top:var(--space-3);">${esc(posture.primary_observation)}</p>` : ''}
    </div>` : ''}

    ${apt?.present ? `
    <div class="card card-sm" style="border-left:3px solid var(--viz-amber);">
      <div class="flex-between mb-2">
        <span class="font-semibold text-sm">Forward Pelvic Tilt</span>
        ${apt.severity ? `<span style="font-size:var(--text-xs);padding:1px 6px;border-radius:4px;background:var(--viz-amber-dim);color:var(--viz-amber);">${words(apt.severity)}</span>` : ''}
      </div>
      ${apt.functional_note ? `<p class="text-secondary text-xs">${esc(apt.functional_note)}</p>` : ''}
      ${Array.isArray(apt.indicators_observed) && apt.indicators_observed.length > 0 ? `<p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:4px;">${esc(apt.indicators_observed.join(' · '))}</p>` : ''}
    </div>` : ''}

    ${muscle ? `
    <div class="card">
      <h4 class="mb-3">Muscle Balance Notes</h4>
      <div class="flex-col gap-2">
        ${[
          { label: 'Forward head / rounded shoulders', value: muscle.upper_crossed_syndrome },
          { label: 'Pelvic tilt pattern', value: muscle.lower_crossed_syndrome },
          { label: 'Dominant Side', value: muscle.dominant_side_hypertrophy },
          { label: 'Apparent leg length difference', value: muscle.apparent_leg_length_difference },
        ].filter(i => !skip(i.value, 'none')).map(item => `
        <div style="display:flex;justify-content:space-between;padding:var(--space-1) 0;border-bottom:1px solid var(--border);">
          <span class="text-secondary text-xs">${esc(item.label)}</span>
          <span style="font-size:var(--text-xs);font-weight:600;color:${(imbalanceTone[item.value] || TONE.neutral).color};">${words(item.value)}</span>
        </div>`).join('')}
      </div>
      ${muscle.notes ? `<p class="mt-2 text-secondary text-xs">${esc(muscle.notes)}</p>` : ''}
    </div>` : ''}

    ${breathing?.observable ? `
    <div class="card card-sm">
      <div class="flex-between">
        <span class="font-semibold text-sm">Breathing Pattern</span>
        <span style="font-size:var(--text-xs);font-weight:600;color:${breathing.pattern === 'diaphragmatic' ? 'var(--viz-green)' : 'var(--viz-amber)'};">${words(breathing.pattern)}</span>
      </div>
      ${breathing.wellness_note ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:var(--space-1);">${esc(breathing.wellness_note)}</p>` : ''}
    </div>` : ''}

    ${comp ? `
    <div class="card">
      <h4 class="mb-3">Build Notes</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);">
        ${statTile('Build Type', words(comp.build_type))}
        ${statTile('Weight Distribution', words(comp.fat_distribution))}
        ${statTile('Muscle Development', words(comp.muscle_development))}
        ${statTile('Upper-body weight pattern', comp.android_pattern_present ? 'Noted' : 'Not noted', comp.android_pattern_present ? 'var(--viz-amber)' : 'var(--viz-green)')}
      </div>
      ${comp.metabolic_note ? `<p class="mt-2 text-secondary text-xs">${esc(comp.metabolic_note)}</p>` : ''}
    </div>` : ''}

    ${lymph && Object.entries(lymph).some(([k, v]) => k !== 'wellness_note' && v && v !== 'none') ? `
    <div class="card card-sm">
      <h4 class="mb-2">Puffiness Notes</h4>
      <div class="flex-col gap-1">
        ${[
          { label: 'Ankles', value: lymph.ankle_puffiness },
          { label: 'Hands', value: lymph.hand_puffiness },
          { label: 'General', value: lymph.general_puffiness },
        ].filter(i => !skip(i.value, 'none')).map(item => `
        <div style="display:flex;justify-content:space-between;">
          <span class="text-secondary text-xs">${esc(item.label)}</span>
          <span style="font-size:var(--text-xs);font-weight:600;color:var(--viz-amber);">${words(item.value)}</span>
        </div>`).join('')}
      </div>
      ${lymph.wellness_note ? `<p class="mt-2 text-secondary text-xs">${esc(lymph.wellness_note)}</p>` : ''}
    </div>` : ''}

    ${sym && sym.overall && sym.overall !== 'symmetric' ? `
    <div class="card card-sm">
      <h4 class="mb-2">Symmetry</h4>
      <div class="flex-col gap-1">
        ${[
          { label: 'Overall', value: sym.overall },
          { label: 'Shoulders', value: sym.shoulder_level },
          { label: 'Hips', value: sym.hip_level },
        ].filter(i => !skip(i.value, 'even', 'symmetric')).map(item => `
        <div style="display:flex;justify-content:space-between;">
          <span class="text-secondary text-xs">${esc(item.label)}</span>
          <span style="font-size:var(--text-xs);font-weight:600;">${words(item.value)}</span>
        </div>`).join('')}
      </div>
    </div>` : ''}

    ${Array.isArray(r.wellness_observations) && r.wellness_observations.length > 0 ? `
    <div class="section-heading"><h3>Wellness Observations</h3></div>
    ${r.wellness_observations.map(obs => `
      <div class="card card-sm" style="border-left:3px solid var(--text-tertiary);">
        <div class="flex-between mb-1">
          <span class="font-semibold text-sm">${esc(obs?.finding || '')}</span>
        </div>
        ${obs?.location ? `<p class="text-tertiary text-xs">Location: ${esc(obs.location)}</p>` : ''}
        <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;">${esc(obs?.significance || '')}</p>
      </div>`).join('')}` : ''}

    ${renderSignals(r.visible_health_flags || r.systemic_flags, 'Wellness Signals')}
    ${renderRecommendations(r.recommendations)}`;
}

// ─── Shared render helpers ────────────────────────

function renderSignals(flags, heading) {
  if (!Array.isArray(flags) || !flags.length) return '';
  return `
    <div class="section-heading"><h3>${esc(heading)}</h3></div>
    ${flags.map(flag => {
    const label = typeof flag === 'string' ? flag : (flag?.indicator || flag?.finding || '');
    const detail = typeof flag === 'string' ? '' : (flag?.significance || '');
    const confidence = typeof flag === 'object' ? flag?.confidence : null;
    return `
      <div class="card card-sm" style="border-left:3px solid var(--text-tertiary);">
        <div class="flex-between mb-1">
          <span class="font-semibold text-sm">${esc(label)}</span>
        </div>
        ${detail ? `<p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;">${esc(detail)}</p>` : ''}
        ${confidence ? `<p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-1);">Confidence: ${esc(confidence)}</p>` : ''}
      </div>`;
  }).join('')}`;
}

// Suggesting lab tests to "confirm or rule out" visual findings would be a
// clinical act, so `suggested_lab_tests` / `suggested_followup` from the
// model are intentionally never rendered.
function renderRecommendations(recs) {
  if (!Array.isArray(recs) || !recs.length) return '';
  const priorityTone = { high: TONE.watch, medium: TONE.watch, low: TONE.good };
  return `
    <div class="section-heading"><h3>Worth a Look</h3></div>
    ${recs.map(rec => {
    const text = typeof rec === 'string' ? rec : rec?.text || '';
    if (!text) return '';
    const priority = typeof rec === 'object' && rec?.priority ? String(rec.priority).toLowerCase() : null;
    const tone = priorityTone[priority] || TONE.good;
    return `
      <div class="card card-sm" style="border-left:3px solid ${tone.color};">
        ${priority ? `<span style="font-size:var(--text-xs);font-weight:600;text-transform:uppercase;color:${tone.color};">${esc(priority)} priority</span>` : ''}
        <p style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.5;${priority ? 'margin-top:4px;' : ''}">${esc(text)}</p>
      </div>`;
  }).join('')}`;
}

export function renderGenericResults(r, m) {
  return `
    ${renderScoreHeader(m, r.overallScore, 'Wellness score')}
    ${renderRecommendations(r.recommendations)}`;
}
