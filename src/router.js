// Simple hash-based SPA router
import { getSession } from './pages/auth.js';
import { renderAuth } from './pages/auth.js';

// Routes that don't require login
const PUBLIC_ROUTES = new Set(['/auth']);

export class Router {
    constructor(routes) {
        this.routes = routes;
        this.currentRoute = null;
        window.addEventListener('hashchange', () => this.resolve());
    }

    async resolve() {
        const hash = window.location.hash.slice(1) || '/';

        // ── Auth guard ────────────────────────────────────────
        if (!PUBLIC_ROUTES.has(hash)) {
            const session = await getSession();
            if (!session) {
                renderAuth();
                return;
            }
        }
        // ─────────────────────────────────────────────────────

        const route = this.routes[hash] || this.routes['/'];
        if (this.currentRoute !== hash) {
            this.currentRoute = hash;
            const content = document.getElementById('page-content');
            if (content) {
                content.style.opacity = '0';
                content.style.transform = 'translateY(10px)';
                setTimeout(() => {
                    route();
                    content.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                    content.style.opacity = '1';
                    content.style.transform = 'translateY(0)';
                    this.updateNav();
                }, 150);
            }
        }
    }

    navigate(path) {
        window.location.hash = path;
    }

    updateNav() {
        const hash = window.location.hash.slice(1) || '/';
        document.querySelectorAll('.nav-item').forEach(item => {
            const isActive = item.dataset.route === hash;
            item.classList.toggle('active', isActive);
        });
    }
}