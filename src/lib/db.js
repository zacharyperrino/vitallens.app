// ─── VitalLens — Supabase Data Layer ────────────────────────
// Drop-in replacement for store.js
// Usage: import { db } from './lib/db.js'

import { supabase } from './supabase.js';
const API = window.API_BASE || '/api';

// ── RAG ingestion helper ─────────────────────────────────────
async function ingestEvent(eventType, data) {
    try {
        const userId = await getUserId();
        fetch(`${API}/ingest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, eventType, data }),
        }).catch(() => { }); // fire and forget — never block the UI
    } catch { }
}

// ── Auth helpers ─────────────────────────────────────────────

export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export async function getUserId() {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');
    return user.id;
}

// ── Profile ──────────────────────────────────────────────────

export const profile = {
    async get() {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
        if (error) throw error;
        return data;
    },

    async update(updates) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('profiles')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', userId)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async create(userData = {}) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('profiles')
            .insert({ id: userId, ...userData })
            .select()
            .single();
        if (error) throw error;
        return data;
    },
};

// ── Meals ────────────────────────────────────────────────────

export const meals = {
    async log(meal) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('meals')
            .insert({
                user_id: userId,
                name: meal.name,
                calories: meal.calories || 0,
                protein: meal.protein || 0,
                carbs: meal.carbs || 0,
                fat: meal.fat || 0,
                fiber: meal.fiber || 0,
                confidence: meal.confidence || null,
                image_url: meal.image_url || null,
                foods: meal.foods || null,
                health_rating: meal.healthRating || null,
                digestibility_score: meal.digestibilityScore || null,
            })
            .select()
            .single();
        if (error) throw error;

        // Update daily nutrition totals
        await dailyNutrition.add({
            calories: meal.calories || 0,
            protein: meal.protein || 0,
            carbs: meal.carbs || 0,
            fat: meal.fat || 0,
            fiber: meal.fiber || 0,
        });

        ingestEvent('meal', data);
        return data;
    },

    async getRecent(limit = 20) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('meals')
            .select('*')
            .eq('user_id', userId)
            .order('logged_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data;
    },

    async getToday() {
        const userId = await getUserId();
        const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('meals')
            .select('*')
            .eq('user_id', userId)
            .gte('logged_at', `${today}T00:00:00`)
            .order('logged_at', { ascending: false });
        if (error) throw error;
        return data;
    },
};

// ── Daily nutrition ──────────────────────────────────────────

export const dailyNutrition = {
    async get(date = null) {
        const userId = await getUserId();
        const targetDate = date || new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('daily_nutrition')
            .select('*')
            .eq('user_id', userId)
            .eq('date', targetDate)
            .maybeSingle();
        if (error && error.code !== 'PGRST116') throw error;
        return data || { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    },

    async add(nutrients) {
        const userId = await getUserId();
        const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        const { error } = await supabase.rpc('increment_daily_nutrition', {
            p_user_id: userId,
            p_date: today,
            p_calories: nutrients.calories || 0,
            p_protein: nutrients.protein || 0,
            p_carbs: nutrients.carbs || 0,
            p_fat: nutrients.fat || 0,
            p_fiber: nutrients.fiber || 0,
        });

        if (error) {
            const current = await this.get(today);
            await supabase
                .from('daily_nutrition')
                .upsert({
                    user_id: userId,
                    date: today,
                    calories: (current.calories || 0) + (nutrients.calories || 0),
                    protein: (current.protein || 0) + (nutrients.protein || 0),
                    carbs: (current.carbs || 0) + (nutrients.carbs || 0),
                    fat: (current.fat || 0) + (nutrients.fat || 0),
                    fiber: (current.fiber || 0) + (nutrients.fiber || 0),
                }, { onConflict: 'user_id,date' });
        }
    },
};

// ── Product scans ────────────────────────────────────────────

export const productScans = {
    async log(scan) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('product_scans')
            .insert({
                user_id: userId,
                barcode: scan.barcode,
                name: scan.name,
                brand: scan.brand,
                health_score: scan.score,
                rating: scan.rating,
                nutrition: scan.nutrition || null,
                additives: scan.additives || null,
                scan_type: scan.scanType || 'barcode',
            })
            .select()
            .single();
        if (error) throw error;
        ingestEvent('product_scan', data);
        return data;
    },

    async getRecent(limit = 10) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('product_scans')
            .select('*')
            .eq('user_id', userId)
            .order('scanned_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data;
    },
};

// ── Body / biomarker scans ───────────────────────────────────

export const bodyScans = {
    async log(scan) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('body_scans')
            .insert({
                user_id: userId,
                scan_type: scan.type,
                overall_score: scan.overallScore,
                results: scan.results || null,
                recommendations: scan.recommendations || null,
                risk_tier: scan.riskTier || null,
                hr: scan.hr || null,
                hrv: scan.hrv || null,
                confidence: scan.confidence || null,
                quality: scan.quality || null,
            })
            .select()
            .single();
        if (error) throw error;
        ingestEvent('body_scan', data);
        return data;
    },

    async getRecent(limit = 20) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('body_scans')
            .select('*')
            .eq('user_id', userId)
            .order('scanned_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data;
    },

    async getByType(type, limit = 10) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('body_scans')
            .select('*')
            .eq('user_id', userId)
            .eq('scan_type', type)
            .order('scanned_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data;
    },
};

// ── HR readings ──────────────────────────────────────────────

export const hrReadings = {
    async log(reading) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('hr_readings')
            .insert({
                user_id: userId,
                hr: reading.hr,
                hrv: reading.hrv || null,
                confidence: reading.confidence || null,
                quality: reading.quality || null,
            })
            .select()
            .single();
        if (error) throw error;
        ingestEvent('hr_reading', data);
        return data;
    },

    async getRecent(limit = 10) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('hr_readings')
            .select('*')
            .eq('user_id', userId)
            .order('recorded_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data;
    },
};

// ── Lab results ──────────────────────────────────────────────

export const labResults = {
    async log(result) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('lab_results')
            .insert({
                user_id: userId,
                panel_type: result.panelType,
                markers: result.markers,
                notes: result.notes || null,
                lab_name: result.labName || null,
                collected_at: result.collectedAt || null,
            })
            .select()
            .single();
        if (error) throw error;
        ingestEvent('lab_result', data);
        return data;
    },

    async getAll() {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('lab_results')
            .select('*')
            .eq('user_id', userId)
            .order('collected_at', { ascending: false });
        if (error) throw error;
        return data;
    },
};

// ── Exercise log ─────────────────────────────────────────────

export const exerciseLog = {
    async log(entry) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('exercise_log')
            .insert({
                user_id: userId,
                type: entry.type,
                name: entry.name || null,
                duration: entry.duration || null,
                intensity: entry.intensity || null,
                calories: entry.calories || null,
                distance: entry.distance || null,
                heart_rate: entry.heartRate || null,
                sets: entry.sets || null,
                reps: entry.reps || null,
                weight_kg: entry.weight_kg || null,
                rpe: entry.rpe || null,
                muscle_groups: entry.muscle_groups || null,
                notes: entry.notes || null,
                total_volume_kg: entry.total_volume_kg || null,
                source: entry.source || 'manual',
                strava_id: entry.stravaId || null,
                date: entry.date || new Date().toISOString().split('T')[0],
            })
            .select()
            .single();
        if (error) throw error;
        ingestEvent('exercise', data);
        return data;
    },

    async getRecent(limit = 20) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('exercise_log')
            .select('*')
            .eq('user_id', userId)
            .order('date', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data;
    },

    async getStravaIds() {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('exercise_log')
            .select('strava_id')
            .eq('user_id', userId)
            .not('strava_id', 'is', null);
        if (error) throw error;
        return new Set(data.map(r => r.strava_id));
    },
};

// ── Sleep log ────────────────────────────────────────────────

export const sleepLog = {
    async log(entry) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('sleep_log')
            .insert({
                user_id: userId,
                hours: entry.hours || null,
                quality: entry.quality || null,
                bedtime: entry.bedtime || null,
                wake_time: entry.wakeTime || null,
                source: entry.source || 'manual',
                notes: entry.notes || null,
                date: entry.date || new Date().toISOString().split('T')[0],
            })
            .select()
            .single();
        if (error) throw error;
        ingestEvent('sleep', data);
        return data;
    },

    async getRecent(limit = 14) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('sleep_log')
            .select('*')
            .eq('user_id', userId)
            .order('date', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data;
    },
};

// ── Habits ───────────────────────────────────────────────────

export const habits = {
    async logToday(entry) {
        const userId = await getUserId();
        const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('habits')
            .upsert({
                user_id: userId,
                date: today,
                water_glasses: entry.waterGlasses || 0,
                smoking: entry.smoking || false,
                alcohol: entry.alcohol || 'none',
                caffeine: entry.caffeine || 'moderate',
                stress_level: entry.stressLevel || null,
                mood: entry.mood || null,
                notes: entry.notes || null,
            }, { onConflict: 'user_id,date' })
            .select()
            .single();
        if (error) throw error;
        ingestEvent('habit', data);
        return data;
    },

    async getToday() {
        const userId = await getUserId();
        const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('habits')
            .select('*')
            .eq('user_id', userId)
            .eq('date', today)
            .maybeSingle();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },
};

// ── Wearable connections ─────────────────────────────────────

export const wearableConnections = {
    async save(provider, config) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('wearable_connections')
            .upsert({
                user_id: userId,
                provider,
                access_token: config.accessToken || null,
                refresh_token: config.refreshToken || null,
                expires_at: config.expiresAt || null,
                athlete_id: config.athleteId ? String(config.athleteId) : null,
                athlete_name: config.athleteName || null,
                athlete_avatar: config.athleteAvatar || null,
                connected: true,
                last_sync: config.lastSync ? new Date(config.lastSync).toISOString() : null,
            }, { onConflict: 'user_id,provider' })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async get(provider) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('wearable_connections')
            .select('*')
            .eq('user_id', userId)
            .eq('provider', provider)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    async disconnect(provider) {
        const userId = await getUserId();
        const { error } = await supabase
            .from('wearable_connections')
            .update({ connected: false, access_token: null, refresh_token: null })
            .eq('user_id', userId)
            .eq('provider', provider);
        if (error) throw error;
    },
};

// ── Health insights (AI generated) ──────────────────────────

export const healthInsights = {
    async save(insight) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('health_insights')
            .insert({
                user_id: userId,
                insight_type: insight.type,
                title: insight.title,
                body: insight.body,
                confidence: insight.confidence || null,
                data_sources: insight.dataSources || [],
                priority: insight.priority || 'medium',
            })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async getUnread(limit = 10) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('health_insights')
            .select('*')
            .eq('user_id', userId)
            .eq('read', false)
            .order('generated_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data;
    },

    async markRead(id) {
        const { error } = await supabase
            .from('health_insights')
            .update({ read: true })
            .eq('id', id);
        if (error) throw error;
    },
};

// ── Chat history ─────────────────────────────────────────────

export const chatHistory = {
    async append(role, content) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('chat_history')
            .insert({ user_id: userId, role, content })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async getRecent(limit = 20) {
        const userId = await getUserId();
        const { data, error } = await supabase
            .from('chat_history')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data.reverse();
    },
};

// ── localStorage → Supabase migration ───────────────────────

export async function migrateFromLocalStorage() {
    const raw = localStorage.getItem('vitallens_data');
    if (!raw) return { migrated: false };

    let local;
    try { local = JSON.parse(raw); } catch { return { migrated: false }; }

    const results = { meals: 0, scans: 0, exercises: 0, errors: [] };

    if (Array.isArray(local.meals) && local.meals.length > 0) {
        for (const meal of local.meals) {
            try {
                await meals.log({
                    name: meal.name || 'Unknown meal',
                    calories: meal.calories || 0,
                    protein: meal.protein || 0,
                    carbs: meal.carbs || 0,
                    fat: meal.fat || 0,
                    fiber: meal.fiber || 0,
                    confidence: meal.confidence || null,
                });
                results.meals++;
            } catch (e) { results.errors.push(`meal: ${e.message}`); }
        }
    }

    if (Array.isArray(local.productScans) && local.productScans.length > 0) {
        for (const scan of local.productScans) {
            try {
                await productScans.log({
                    barcode: scan.barcode,
                    name: scan.name,
                    brand: scan.brand,
                    score: scan.score,
                    rating: scan.rating,
                });
                results.scans++;
            } catch (e) { results.errors.push(`scan: ${e.message}`); }
        }
    }

    if (Array.isArray(local.exerciseLog) && local.exerciseLog.length > 0) {
        for (const entry of local.exerciseLog) {
            try {
                await exerciseLog.log({
                    type: entry.type || 'Other',
                    duration: entry.duration,
                    intensity: entry.intensity,
                    calories: entry.calories,
                    source: entry.source || 'manual',
                });
                results.exercises++;
            } catch (e) { results.errors.push(`exercise: ${e.message}`); }
        }
    }

    localStorage.setItem('vitallens_migrated', 'true');
    console.log('[Migration] Complete:', results);
    return { migrated: true, results };
}

window._sb = supabase; // temporary debug access