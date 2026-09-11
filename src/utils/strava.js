// Strava API integration — OAuth2 + Activity fetching
import { store } from '../store.js';

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const REDIRECT_URI = `${location.origin}${location.pathname}`;
const SCOPES = 'read,activity:read_all';

// ── Config ──────────────────────────────────────────────

export function getStravaConfig() {
    return store.get('strava') || {};
}

export function saveStravaConfig(config) {
    const existing = getStravaConfig();
    store.set('strava', { ...existing, ...config });
}

export function isStravaConfigured() {
    const cfg = getStravaConfig();
    return !!(cfg.clientId && cfg.clientSecret);
}

export function isStravaConnected() {
    const cfg = getStravaConfig();
    return !!(cfg.accessToken && cfg.athleteId);
}

// ── OAuth Flow ──────────────────────────────────────────

export function getAuthorizationUrl() {
    const cfg = getStravaConfig();
    if (!cfg.clientId) throw new Error('Client ID not configured');

    const params = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        approval_prompt: 'auto',
        scope: SCOPES,
    });

    return `${STRAVA_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(code) {
    const cfg = getStravaConfig();
    if (!cfg.clientId || !cfg.clientSecret) {
        throw new Error('Strava credentials not configured');
    }

    const response = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            code: code,
            grant_type: 'authorization_code',
        }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `Token exchange failed (${response.status})`);
    }

    const data = await response.json();

    saveStravaConfig({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at,
        athleteId: data.athlete?.id,
        athleteName: `${data.athlete?.firstname || ''} ${data.athlete?.lastname || ''}`.trim(),
        athleteAvatar: data.athlete?.profile_medium || '',
    });

    return data;
}

async function refreshAccessToken() {
    const cfg = getStravaConfig();
    if (!cfg.refreshToken) throw new Error('No refresh token available');

    const response = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            refresh_token: cfg.refreshToken,
            grant_type: 'refresh_token',
        }),
    });

    if (!response.ok) throw new Error('Token refresh failed');

    const data = await response.json();
    saveStravaConfig({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at,
    });

    return data.access_token;
}

async function getValidToken() {
    const cfg = getStravaConfig();
    const now = Math.floor(Date.now() / 1000);

    if (cfg.expiresAt && cfg.expiresAt > now + 60) {
        return cfg.accessToken;
    }

    return await refreshAccessToken();
}

// ── Activity Fetching ───────────────────────────────────

async function fetchActivities(page = 1, perPage = 30) {
    const token = await getValidToken();

    const params = new URLSearchParams({
        page: page.toString(),
        per_page: perPage.toString(),
    });

    const response = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
        if (response.status === 401) {
            // Token expired mid-request, try refresh
            const newToken = await refreshAccessToken();
            const retry = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params}`, {
                headers: { Authorization: `Bearer ${newToken}` },
            });
            if (!retry.ok) throw new Error('Failed to fetch activities');
            return await retry.json();
        }
        throw new Error(`Failed to fetch activities (${response.status})`);
    }

    return await response.json();
}

export async function syncActivities() {
    const activities = await fetchActivities(1, 50);
    const mapped = activities.map(mapStravaActivity);

    saveStravaConfig({
        lastSync: Date.now(),
        activities: mapped,
    });

    return mapped;
}

// ── Activity Mapping ────────────────────────────────────

const ACTIVITY_TYPE_MAP = {
    'Run': 'Running',
    'TrailRun': 'Running',
    'VirtualRun': 'Running',
    'Walk': 'Walking',
    'Hike': 'Walking',
    'Ride': 'Cycling',
    'VirtualRide': 'Cycling',
    'MountainBikeRide': 'Cycling',
    'GravelRide': 'Cycling',
    'EBikeRide': 'Cycling',
    'Swim': 'Swimming',
    'WeightTraining': 'Weight Training',
    'Yoga': 'Yoga',
    'Workout': 'HIIT',
    'CrossFit': 'HIIT',
    'Crossfit': 'HIIT',
    'Elliptical': 'Other',
    'StairStepper': 'Other',
    'Rowing': 'Other',
    'Kayaking': 'Other',
    'Soccer': 'Sports',
    'Tennis': 'Sports',
    'Pickleball': 'Sports',
    'Golf': 'Sports',
    'RockClimbing': 'Other',
    'Pilates': 'Pilates',
    'Dance': 'Dance',
    'Snowboard': 'Sports',
    'AlpineSki': 'Sports',
    'NordicSki': 'Sports',
    'IceSkate': 'Sports',
    'Skateboard': 'Sports',
    'Surfing': 'Sports',
};

function mapStravaActivity(activity) {
    const durationMin = Math.round(activity.moving_time / 60);
    const distanceKm = activity.distance ? (activity.distance / 1000).toFixed(2) : null;
    const distanceMi = activity.distance ? (activity.distance / 1609.34).toFixed(2) : null;

    let intensity = 'Moderate';
    if (activity.average_heartrate) {
        if (activity.average_heartrate > 160) intensity = 'Very High';
        else if (activity.average_heartrate > 140) intensity = 'High';
        else if (activity.average_heartrate > 120) intensity = 'Moderate';
        else intensity = 'Low';
    } else if (activity.suffer_score) {
        if (activity.suffer_score > 150) intensity = 'Very High';
        else if (activity.suffer_score > 80) intensity = 'High';
        else if (activity.suffer_score > 30) intensity = 'Moderate';
        else intensity = 'Low';
    }

    return {
        stravaId: activity.id,
        name: activity.name,
        type: ACTIVITY_TYPE_MAP[activity.type] || activity.type || 'Other',
        stravaType: activity.type,
        duration: durationMin,
        intensity,
        calories: activity.calories || estimateCalories(activity),
        distanceKm,
        distanceMi,
        avgHeartRate: activity.average_heartrate || null,
        maxHeartRate: activity.max_heartrate || null,
        elevationGain: activity.total_elevation_gain || null,
        avgSpeed: activity.average_speed ? (activity.average_speed * 3.6).toFixed(1) : null, // m/s km/h
        date: activity.start_date_local,
        elapsedTime: activity.elapsed_time,
        movingTime: activity.moving_time,
        imported: false,
    };
}

function estimateCalories(activity) {
    // Rough MET-based estimation when Strava doesn't provide calories
    const minutes = activity.moving_time / 60;
    const metMap = {
        'Run': 9.8, 'TrailRun': 10.5, 'Ride': 7.5, 'Swim': 8.0,
        'Walk': 3.5, 'Hike': 6.0, 'WeightTraining': 5.0, 'Yoga': 3.0,
        'Workout': 8.0, 'Rowing': 7.0,
    };
    const met = metMap[activity.type] || 5.0;
    const weight = 70; // default kg assumption
    return Math.round((met * weight * minutes) / 60);
}

// ── Import into Exercise Log ────────────────────────────

export function importActivity(stravaActivity) {
    store.push('exerciseLog', {
        type: stravaActivity.type,
        duration: stravaActivity.duration,
        intensity: stravaActivity.intensity,
        calories: stravaActivity.calories,
        source: 'strava',
        stravaId: stravaActivity.stravaId,
        name: stravaActivity.name,
        distance: stravaActivity.distanceKm ? `${stravaActivity.distanceKm} km` : null,
        heartRate: stravaActivity.avgHeartRate,
        date: stravaActivity.date,
    });

    // Mark as imported in Strava cache
    const cfg = getStravaConfig();
    if (cfg.activities) {
        const updated = cfg.activities.map(a =>
            a.stravaId === stravaActivity.stravaId ? { ...a, imported: true } : a
        );
        saveStravaConfig({ activities: updated });
    }
}

export function importAllActivities() {
    const cfg = getStravaConfig();
    const existingLog = store.get('exerciseLog') || [];
    const existingStravaIds = new Set(existingLog.filter(e => e.stravaId).map(e => e.stravaId));
    let imported = 0;

    if (cfg.activities) {
        cfg.activities.forEach(a => {
            if (!a.imported && !existingStravaIds.has(a.stravaId)) {
                importActivity(a);
                imported++;
            }
        });
    }

    return imported;
}

// ── Disconnect ──────────────────────────────────────────

export function disconnectStrava() {
    saveStravaConfig({
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        athleteId: null,
        athleteName: null,
        athleteAvatar: null,
        lastSync: null,
        activities: null,
    });
}

// ── OAuth callback detection ────────────────────────────

export function checkOAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
        // Clean the URL (remove query params, keep hash)
        const cleanUrl = `${location.origin}${location.pathname}${location.hash}`;
        history.replaceState(null, '', cleanUrl);
        return code;
    }

    return null;
}
