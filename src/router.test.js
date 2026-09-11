import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./pages/auth.js', () => ({
  getSession: vi.fn(),
  isOnboardingComplete: vi.fn(),
  renderAuth: vi.fn(),
}));
vi.mock('./utils/consent.js', () => ({ isConsentComplete: vi.fn() }));
vi.mock('./pages/consent-gate.js', () => ({ renderConsentGate: vi.fn() }));

import { getSession, isOnboardingComplete, renderAuth } from './pages/auth.js';
import { isConsentComplete } from './utils/consent.js';
import { renderConsentGate } from './pages/consent-gate.js';
import { Router } from './router.js';

// replaceState changes the hash WITHOUT firing hashchange, so each test drives
// exactly one resolve() call.
const setHash = (hash) => window.history.replaceState(null, '', hash);
const content = () => document.getElementById('page-content');
const nav = () => document.getElementById('bottom-nav');

// resolve() defers the actual render by 150ms for the page transition.
async function resolve(router) {
  await router.resolve();
  await vi.runAllTimersAsync();
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = `
    <nav id="bottom-nav">
      <a class="nav-item" data-route="/">Home</a>
      <a class="nav-item" data-route="/profile">Profile</a>
    </nav>
    <main id="page-content"></main>`;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // Happy-path defaults; individual tests override one guard at a time.
  getSession.mockResolvedValue({ user: { id: 'u1' } });
  isConsentComplete.mockResolvedValue(true);
  isOnboardingComplete.mockResolvedValue(true);
  setHash('#/');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setHash('#/');
});

describe('Router guards', () => {
  it('renders the auth page and hides the nav when there is no session', async () => {
    getSession.mockResolvedValue(null);
    const home = vi.fn();
    await resolve(new Router({ '/': home }));

    expect(renderAuth).toHaveBeenCalledTimes(1);
    expect(home).not.toHaveBeenCalled();
    expect(isConsentComplete).not.toHaveBeenCalled();
    expect(nav().style.display).toBe('none');
  });

  it('renders the consent gate when consent is incomplete', async () => {
    isConsentComplete.mockResolvedValue(false);
    const home = vi.fn();
    await resolve(new Router({ '/': home }));

    expect(renderConsentGate).toHaveBeenCalledTimes(1);
    expect(renderAuth).not.toHaveBeenCalled();
    expect(home).not.toHaveBeenCalled();
    expect(nav().style.display).toBe('none');
  });

  it('fails closed when consent status cannot be determined', async () => {
    isConsentComplete.mockRejectedValue(new Error('Consent status unavailable (503)'));
    const home = vi.fn();
    await resolve(new Router({ '/': home }));

    expect(content().textContent).toContain("Can't reach the server");
    expect(home).not.toHaveBeenCalled();
  });

  it("renders 'Can't reach the server' when onboarding status resolves null", async () => {
    isOnboardingComplete.mockResolvedValue(null);
    const home = vi.fn();
    await resolve(new Router({ '/': home }));

    expect(content().textContent).toContain("Can't reach the server");
    expect(content().querySelector('#retry-boot')).not.toBeNull();
    expect(home).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      '[Router] Boot guard failed:',
      'Onboarding status unavailable',
    );
  });

  it('redirects to onboarding when the user has not finished it', async () => {
    isOnboardingComplete.mockResolvedValue(false);
    const home = vi.fn();
    await resolve(new Router({ '/': home }));

    expect(window.location.hash).toBe('#/onboarding');
    expect(home).not.toHaveBeenCalled();
  });

  it('lets public legal routes through without a session', async () => {
    getSession.mockResolvedValue(null);
    setHash('#/legal/terms');
    const terms = vi.fn();
    await resolve(new Router({ '/legal/terms': terms }));

    expect(getSession).not.toHaveBeenCalled();
    expect(renderAuth).not.toHaveBeenCalled();
    expect(terms).toHaveBeenCalledTimes(1);
  });
});

describe('Router rendering', () => {
  it("renders 'Page not found' for an unknown hash with a session", async () => {
    setHash('#/does-not-exist');
    await resolve(new Router({ '/': vi.fn() }));

    expect(content().textContent).toContain('Page not found');
    expect(content().textContent).toContain('/does-not-exist');
    expect(content().querySelector('a[href="#/"]')).not.toBeNull();
  });

  it('renders the matched route and marks the active nav item', async () => {
    const home = vi.fn();
    await resolve(new Router({ '/': home }));

    expect(home).toHaveBeenCalledTimes(1);
    expect(content().textContent).not.toContain('Page not found');
    const [homeItem, profileItem] = document.querySelectorAll('.nav-item');
    expect(homeItem.classList.contains('active')).toBe(true);
    expect(homeItem.getAttribute('aria-current')).toBe('page');
    expect(profileItem.classList.contains('active')).toBe(false);
    expect(profileItem.getAttribute('aria-current')).toBe('false');
  });

  it('hides the bottom nav on NAVLESS routes and skips the onboarding check there', async () => {
    setHash('#/onboarding');
    const onboarding = vi.fn();
    await resolve(new Router({ '/onboarding': onboarding }));

    expect(onboarding).toHaveBeenCalledTimes(1);
    expect(nav().style.display).toBe('none');
    expect(isOnboardingComplete).not.toHaveBeenCalled();
  });

  it('shows the bottom nav on ordinary routes', async () => {
    nav().style.display = 'none'; // e.g. left over from an auth screen
    await resolve(new Router({ '/': vi.fn() }));
    expect(nav().style.display).toBe('');
  });

  it('renders a recoverable error screen when a route throws', async () => {
    const broken = vi.fn().mockRejectedValue(new Error('boom'));
    await resolve(new Router({ '/': broken }));

    expect(content().textContent).toContain('Something went wrong');
    expect(content().querySelector('#retry-route')).not.toBeNull();
  });

  it('does not re-render when the same route is resolved twice', async () => {
    const home = vi.fn();
    const router = new Router({ '/': home });
    await resolve(router);
    await resolve(router);
    expect(home).toHaveBeenCalledTimes(1);
  });
});

describe('offline banner', () => {
  it('adds and removes the banner as connectivity changes', () => {
    const router = new Router({});
    expect(document.getElementById('offline-banner')).toBeNull(); // jsdom reports online

    router.setOffline(true);
    const banner = document.getElementById('offline-banner');
    expect(banner).not.toBeNull();
    expect(banner.getAttribute('role')).toBe('status');

    router.setOffline(false);
    expect(document.getElementById('offline-banner')).toBeNull();
  });
});
