// ─── Consent client helper ───────────────────────────────────
// Mirrors server REQUIRED_CONSENTS. The router uses getConsentStatus() to
// block app entry until the current versions are recorded, so a version bump
// here (and on the server) forces every user to re-consent.
import { apiFetch } from './api.js';

export const CONSENT_DOCS = [
    { key: 'terms_of_service', version: '2026-07-08', label: 'Terms of Service', href: '#/legal/terms' },
    { key: 'privacy_policy', version: '2026-07-08', label: 'Privacy Policy', href: '#/legal/privacy' },
    { key: 'health_data_processing', version: '2026-07-08', label: 'Health-Data & AI Processing', href: '#/legal/privacy' },
];

let _consentComplete = null; // cache so the router guard isn't a DB hit per nav

export async function isConsentComplete() {
    if (_consentComplete === true) return true;
    try {
        const res = await apiFetch('/api/consents/status');
        if (!res.ok) return true; // don't trap the user on a transient failure
        const data = await res.json();
        _consentComplete = !!data.complete;
        return _consentComplete;
    } catch {
        return true;
    }
}

export async function recordConsents() {
    const documents = CONSENT_DOCS.map(d => ({ document: d.key, version: d.version }));
    const res = await apiFetch('/api/consents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents }),
    });
    if (!res.ok) throw new Error('Could not record consent. Please try again.');
    _consentComplete = true;
}

export function resetConsentCache() {
    _consentComplete = null;
}
