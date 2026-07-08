// ─── App config ───────────────────────────────────────────────
// Single source of truth for the backend API base URL.
//
// In production, set VITE_API_BASE at build time (e.g. https://api.vitallens.app)
// so the frontend talks to the deployed API instead of localhost. Vite exposes
// any VITE_-prefixed env var on import.meta.env.
//
// Callers append the route path themselves, e.g. `${API_BASE}/api/vision-scan`.

export const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE)
    ? import.meta.env.VITE_API_BASE
    : 'http://localhost:3001';
