// ─── Analytics Events ─────────────────────────────────────────
// Thin wrapper around PostHog. Safe to call whether or not PostHog
// is loaded — in development (no PostHog) events log to the console
// so they stay visible. Never throws.

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
