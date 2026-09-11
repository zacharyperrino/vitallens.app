// ─── Oura Ring integration (client) ──────────────────────────
// Connection state comes from the server (wearable_connections). The OAuth
// hand-off is started server-side with a signed state; nothing is faked here.
import { apiFetch } from './api.js';

let _connected = false;

export function isOuraConnected() {
    return _connected;
}

export async function refreshOuraStatus(userId) {
    try {
        const res = await apiFetch(`/api/oura/status?userId=${encodeURIComponent(userId)}`);
        if (!res.ok) { _connected = false; return false; }
        const data = await res.json();
        _connected = !!data.connected;
        return _connected;
    } catch {
        _connected = false;
        return false;
    }
}

export async function startOuraConnect() {
    const res = await apiFetch('/api/oura/connect');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error(data.error || 'Oura connection is not available right now.');
    window.location.href = data.url;
}
