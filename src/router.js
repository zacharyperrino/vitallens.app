// Simple hash-based SPA router with auth / consent / onboarding guards.
import { getSession, isOnboardingComplete } from './pages/auth.js';
import { renderAuth } from './pages/auth.js';
import { isConsentComplete } from './utils/consent.js';
import { renderConsentGate } from './pages/consent-gate.js';

// Routes that don't require login (legal docs must be readable pre-consent)
const PUBLIC_ROUTES = new Set(['/auth', '/legal/terms', '/legal/privacy']);
// Full-screen flows that hide the bottom nav. Everything else shows it.
const NAVLESS_ROUTES = new Set(['/onboarding', '/legal/terms', '/legal/privacy']);

export class Router {
    constructor(routes) {
        this.routes = routes;
        this.currentRoute = null;
        window.addEventListener('hashchange', () => this.resolve());
        window.addEventListener('online', () => this.setOffline(false));
        window.addEventListener('offline', () => this.setOffline(true));
        this.setOffline(!navigator.onLine);
    }

    async resolve() {
        const hash = window.location.hash.slice(1) || '/';

        if (!PUBLIC_ROUTES.has(hash)) {
            try {
                const session = await getSession();
                if (!session) {
                    this.showNav(false);
                    renderAuth();
                    return;
                }
                if (!(await isConsentComplete())) {
                    this.showNav(false);
                    renderConsentGate();
                    return;
                }
                if (hash !== '/onboarding') {
                    const onboarded = await isOnboardingComplete();
                    if (onboarded === null) throw new Error('Onboarding status unavailable');
                    if (!onboarded) {
                        window.location.hash = '#/onboarding';
                        return;
                    }
                }
            } catch (err) {
                // Backend unreachable (offline, or the database is waking up).
                console.warn('[Router] Boot guard failed:', err?.message || err);
                this.renderUnreachable();
                return;
            }
        }

        const known = Object.prototype.hasOwnProperty.call(this.routes, hash);
        const route = known ? this.routes[hash] : null;
        if (this.currentRoute === hash) return;
        this.currentRoute = hash;

        this.showNav(!NAVLESS_ROUTES.has(hash));
        const content = document.getElementById('page-content');
        if (!content) return;

        content.style.opacity = '0';
        content.style.transform = 'translateY(10px)';
        setTimeout(async () => {
            try {
                if (route) await route();
                else this.renderNotFound(hash);
            } catch (err) {
                console.error('[Router] Route render failed:', err);
                this.renderRouteError(err);
            } finally {
                content.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                content.style.opacity = '1';
                content.style.transform = 'translateY(0)';
                this.updateNav();
                content.focus?.();
            }
        }, 150);
    }

    navigate(path) {
        window.location.hash = path;
    }

    showNav(visible) {
        const nav = document.getElementById('bottom-nav');
        if (nav) nav.style.display = visible ? '' : 'none';
    }

    setOffline(offline) {
        let banner = document.getElementById('offline-banner');
        if (offline && !banner) {
            banner = document.createElement('div');
            banner.id = 'offline-banner';
            banner.setAttribute('role', 'status');
            banner.setAttribute('aria-live', 'polite');
            banner.className = 'offline-banner';
            banner.textContent = "You're offline — showing saved data. Changes will sync when you reconnect.";
            document.body.prepend(banner);
        } else if (!offline && banner) {
            banner.remove();
        }
    }

    renderUnreachable() {
        const content = document.getElementById('page-content');
        if (!content) return;
        content.style.opacity = '1';
        content.style.transform = 'none';
        content.innerHTML = `
          <div class="empty-state" style="min-height:70vh;">
            <h2>Can't reach the server</h2>
            <p>VitalLens couldn't connect to its database. Check your internet connection, or wait a moment — the server may be waking up.</p>
            <button type="button" class="btn btn-primary" id="retry-boot">Try again</button>
          </div>`;
        document.getElementById('retry-boot')?.addEventListener('click', () => window.location.reload());
    }

    renderNotFound(hash) {
        const content = document.getElementById('page-content');
        content.innerHTML = `
          <div class="empty-state" style="min-height:60vh;">
            <h2>Page not found</h2>
            <p>There's nothing at <code>${hash.replace(/[<>&"']/g, '')}</code>.</p>
            <a class="btn btn-primary" href="#/">Go to Home</a>
          </div>`;
    }

    renderRouteError(_err) {
        const content = document.getElementById('page-content');
        content.innerHTML = `
          <div class="empty-state" style="min-height:60vh;">
            <h2>Something went wrong</h2>
            <p>This page hit an error while loading. Your data is safe.</p>
            <button type="button" class="btn btn-primary" id="retry-route">Try again</button>
          </div>`;
        document.getElementById('retry-route')?.addEventListener('click', () => { this.currentRoute = null; this.resolve(); });
    }

    updateNav() {
        const hash = window.location.hash.slice(1) || '/';
        document.querySelectorAll('.nav-item').forEach(item => {
            const isActive = item.dataset.route === hash;
            item.classList.toggle('active', isActive);
            item.setAttribute('aria-current', isActive ? 'page' : 'false');
        });
    }
}
