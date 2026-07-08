// ─── GPT-4o Vision — Food Detection Service ──────────────────
// Calls POST /api/vision-scan on the Express server.
// The OpenAI key lives in server/.env — never in the browser.

import { apiFetch } from '../utils/api.js';

// ── Fetch corrections weighted by frequency ───────────────────

async function getUserCorrections(userId) {
    if (!userId) return null;
    try {
        const res = await apiFetch(`/api/food-corrections?userId=${userId}&limit=30`);
        if (!res.ok) return null;
        const { corrections } = await res.json();
        if (!corrections || corrections.length === 0) return null;

        const rules = corrections.filter(c => (c.correction_count || 1) >= 3);
        const hints = corrections.filter(c => (c.correction_count || 1) < 3);

        let output = '';

        if (rules.length > 0) {
            output += 'CORRECTION RULES — apply with highest priority, these override your own judgment:\n';
            output += rules.map(c =>
                `- "${c.detected_label}" is ALWAYS "${c.corrected_label}" — corrected ${c.correction_count} times, never call it anything else${c.corrected_grams ? ` (${c.corrected_grams}g)` : ''}`
            ).join('\n');
            output += '\n\n';
        }

        if (hints.length > 0) {
            output += 'CORRECTION HINTS — apply when uncertain:\n';
            output += hints.map(c =>
                `- When you see "${c.detected_label}", the correct food is likely "${c.corrected_label}"${c.corrected_grams ? ` (${c.corrected_grams}g)` : ''}`
            ).join('\n');
        }

        return output.trim() || null;
    } catch {
        return null;
    }
}

// ── Fetch portion corrections ─────────────────────────────────

async function getPortionCorrections(userId) {
    if (!userId) return null;
    try {
        const res = await apiFetch(`/api/portion-corrections?userId=${userId}`);
        if (!res.ok) return null;
        const { portions } = await res.json();
        if (!portions || portions.length === 0) return null;

        return 'PORTION HINTS — use these gram estimates for this user:\n' +
            portions.map(p =>
                `- When you see "${p.food_label}", estimate ${p.avg_corrected_grams}g (user has corrected this ${p.correction_count} times)`
            ).join('\n');
    } catch {
        return null;
    }
}

// ── Main vision scan ──────────────────────────────────────────

export async function analyzeImageWithVision(imageFile) {
    const formData = new FormData();
    formData.append('image', imageFile, imageFile.name || 'meal.jpg');

    try {
        const { supabase } = await import('../lib/supabase.js');
        const { data: { user } } = await supabase.auth.getUser();

        if (user?.id) {
            const [correctionHints, portionHints] = await Promise.all([
                getUserCorrections(user.id),
                getPortionCorrections(user.id),
            ]);

            let hints = '';
            if (correctionHints) hints += correctionHints;
            if (portionHints) hints += (hints ? '\n\n' : '') + portionHints;

            if (hints) {
                formData.append('correctionHints', hints);
                console.log(`[VisionAPI] Injecting corrections + portion hints for user ${user.id.slice(0, 8)}`);
            }
        }
    } catch {
        // proceed without corrections
    }

    const response = await apiFetch(`/api/vision-scan`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Vision scan failed (${response.status})`);
    }

    const data = await response.json();
    console.log('[VisionAPI] Server response:', data.detections?.length, 'foods detected');
    console.log('[VisionAPI] Meal:', data.meal_description);
    return data;
}

// ── Save food label correction ────────────────────────────────

export async function saveFoodCorrection(detectedLabel, correctedLabel, options = {}) {
    try {
        const { supabase } = await import('../lib/supabase.js');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;

        await apiFetch(`/api/food-correction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user.id,
                detectedLabel,
                correctedLabel,
                detectedGrams: options.detectedGrams || null,
                correctedGrams: options.correctedGrams || null,
                confidence: options.confidence || null,
                mealContext: options.mealContext || null,
            }),
        });
        console.log(`[VisionAPI] Correction saved: ${detectedLabel} ${correctedLabel}`);
    } catch (err) {
        console.error('[VisionAPI] Failed to save correction:', err.message);
    }
}

// ── Save portion correction ───────────────────────────────────

export async function savePortionCorrection(foodLabel, originalGrams, correctedGrams) {
    try {
        const { supabase } = await import('../lib/supabase.js');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;

        const changePercent = Math.abs(correctedGrams - originalGrams) / originalGrams;
        if (changePercent < 0.40) return;

        await apiFetch(`/api/portion-correction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user.id,
                foodLabel,
                originalGrams,
                correctedGrams,
            }),
        });
        console.log(`[VisionAPI] Portion correction: ${foodLabel} ${originalGrams}g ${correctedGrams}g`);
    } catch (err) {
        console.error('[VisionAPI] Failed to save portion correction:', err.message);
    }
}
export async function checkMealMemory(hash) {
    try {
        const { supabase } = await import('../lib/supabase.js');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return null;

        const { data } = await supabase
            .from('meal_memory')
            .select('*')
            .eq('user_id', user.id)
            .eq('meal_hash', hash)
            .single();

        return data || null;
    } catch {
        return null;
    }
}

export async function saveMealMemory(hash, mealName, foods, calories) {
    try {
        const { supabase } = await import('../lib/supabase.js');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;

        const { data: existing } = await supabase
            .from('meal_memory')
            .select('id, scan_count, avg_calories')
            .eq('user_id', user.id)
            .eq('meal_hash', hash)
            .single();

        if (existing) {
            const newCount = existing.scan_count + 1;
            const newAvg = Math.round((existing.avg_calories * existing.scan_count + calories) / newCount);
            await supabase
                .from('meal_memory')
                .update({
                    scan_count: newCount,
                    avg_calories: newAvg,
                    meal_name: mealName,
                    foods: foods,
                    last_scanned_at: new Date().toISOString(),
                })
                .eq('id', existing.id);
        } else {
            await supabase
                .from('meal_memory')
                .insert({
                    user_id: user.id,
                    meal_hash: hash,
                    meal_name: mealName,
                    foods: foods,
                    avg_calories: calories,
                    scan_count: 1,
                });
        }
        console.log(`[MealMemory] Saved: ${mealName} (hash: ${hash})`);
    } catch (err) {
        console.error('[MealMemory] Save failed:', err.message);
    }
}