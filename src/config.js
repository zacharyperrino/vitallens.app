// ─── App config ───────────────────────────────────────────────
// Single source of truth for the backend API base URL.
//
// In production, set VITE_API_BASE at build time (e.g. https://api.vitallens.app)
// so the frontend talks to the deployed API instead of localhost. Vite exposes
// any VITE_-prefixed env var on import.meta.env.
//
// Callers append the route path themselves, e.g. `${API_BASE}/api/vision-scan`.

const ENV = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const PROD_FALLBACK = 'https://api.vitallens.app';

if (!ENV.VITE_API_BASE && ENV.PROD) {
  // Module evaluates once, so this warns once per page load.
  console.warn(`[Config] VITE_API_BASE is not set; falling back to ${PROD_FALLBACK}`);
}

export const API_BASE =
  ENV.VITE_API_BASE || (ENV.PROD ? PROD_FALLBACK : 'http://localhost:3001');
