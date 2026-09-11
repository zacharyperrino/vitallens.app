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
    // Lazy-load the npm bundle so it ships from our own origin (CSP script-src 'self').
    // disable_external_dependency_loading stops posthog-js from injecting any
    // <script> tags (remote-config, recorder, surveys, toolbar); it falls back to
    // plain fetches, which connect-src allows.
    try {
        import('posthog-js')
            .then((mod) => {
                const posthog = mod.default || mod.posthog;
                posthog.init(POSTHOG_KEY, {
                    api_host: POSTHOG_HOST,
                    autocapture: false,
                    capture_pageview: false,
                    disable_session_recording: true,
                    disable_surveys: true,
                    disable_external_dependency_loading: true,
                    persistence: 'localStorage',
                });
                window.posthog = posthog;
            })
            .catch((err) => console.warn('[Analytics] PostHog failed to load:', err?.message || err));
    } catch (err) {
        console.warn('[Analytics] PostHog failed to load:', err?.message || err);
    }
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
