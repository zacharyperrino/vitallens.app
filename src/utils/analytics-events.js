// ─── Analytics Events ─────────────────────────────────────────
// Thin wrapper around PostHog. Safe to call whether or not PostHog
// is loaded — in development (no PostHog) events log to the console
// so they stay visible. Never throws.
//
// Activation is env-gated: set VITE_POSTHOG_KEY (and optionally
// VITE_POSTHOG_HOST) and PostHog loads itself. No key = disabled.

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

if (POSTHOG_KEY && typeof window !== 'undefined' && !window.posthog) {
    const s = document.createElement('script');
    s.async = true;
    s.src = `${POSTHOG_HOST}/static/array.js`;
    s.onload = () => window.posthog?.init?.(POSTHOG_KEY, { api_host: POSTHOG_HOST });
    s.onerror = () => console.warn('[Analytics] PostHog script failed to load.');
    document.head.appendChild(s);
}

export function trackEvent(eventName, properties = {}) {
    try {
        if (typeof window !== 'undefined' && window.posthog) {
            window.posthog.capture(eventName, properties);
        } else {
            console.log('[Analytics]', eventName, properties);
        }
    } catch (err) {
        // Analytics must never break the app.
        console.warn('[Analytics] trackEvent failed:', err?.message || err);
    }
}
