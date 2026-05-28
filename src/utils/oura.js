// Oura Ring API Bridge — V2
import { store } from '../store.js';

const OURA_AUTH_URL = 'https://cloud.ouraring.com/oauth/authorize';
const CLIENT_ID = 'MOCK_CLIENT_ID'; // Placeholder for Oura Developer Portal Client ID
const REDIRECT_URI = `${location.origin}${location.pathname}`;

/**
 * Checks if Oura is connected.
 */
export function isOuraConnected() {
    const cfg = store.get('oura') || {};
    return !!(cfg.connected && cfg.accessToken);
}

/**
 * Redirects to Oura OAuth.
 */
export function connectOura() {
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'token', // Using Implicit flow for mock simplicity
        scope: 'daily personal',
        state: 'oura_connect'
    });

    // In a real app, we'd redirect. In mock mode, we'll simulation the callback.
    console.log('Redirecting to Oura Auth:', `${OURA_AUTH_URL}?${params.toString()}`);

    // Mock simulation
    setTimeout(() => {
        handleOuraCallback('mock_access_token_abc123');
    }, 1000);
}

/**
 * Handles the OAuth redirect.
 */
export function handleOuraCallback(token) {
    if (!token) return;

    store.update('oura', (cfg) => ({
        ...cfg,
        connected: true,
        accessToken: token,
        lastSync: Date.now()
    }));

    // Initial sync
    syncOuraData();
}

/**
 * Synchronizes Oura metrics (Sleep, Readiness, Activity).
 */
export async function syncOuraData() {
    if (!isOuraConnected()) return;

    // Simulate API delay
    await new Promise(r => setTimeout(r, 1500));

    const mockData = generateMockOuraData();

    store.update('oura', (cfg) => ({
        ...cfg,
        ...mockData,
        lastSync: Date.now()
    }));

    return mockData;
}

/**
 * Disconnects Oura.
 */
export function disconnectOura() {
    store.set('oura', {
        connected: false,
        accessToken: null,
        readiness: [],
        sleep: [],
        activity: [],
        lastSync: null,
    });
}

// ── Mock Data Generator ─────────────────────────────────

function generateMockOuraData() {
    const today = new Date();
    const readiness = [];
    const sleep = [];
    const activity = [];

    for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];

        readiness.push({
            day: dateStr,
            score: 75 + Math.floor(Math.random() * 20),
            contributors: {
                recovery_index: 80,
                hrv_balance: 70,
                sleep_balance: 85
            }
        });

        sleep.push({
            day: dateStr,
            score: 70 + Math.floor(Math.random() * 25),
            total_sleep: 25000 + Math.floor(Math.random() * 5000), // seconds
            rem_sleep: 4000 + Math.floor(Math.random() * 2000),
            deep_sleep: 3000 + Math.floor(Math.random() * 2000),
        });

        activity.push({
            day: dateStr,
            score: 60 + Math.floor(Math.random() * 30),
            steps: 4000 + Math.floor(Math.random() * 10000),
            cal_total: 2200 + Math.floor(Math.random() * 800),
        });
    }

    return { readiness, sleep, activity };
}
