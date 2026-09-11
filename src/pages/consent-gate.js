// ─── Consent gate ─────────────────────────────────────────────
// Shown by the router when an authenticated user has not accepted the
// current document versions. Blocks the app until they do.
import { CONSENT_DOCS, recordConsents } from '../utils/consent.js';

export function renderConsentGate() {
    const content = document.getElementById('page-content');
    const nav = document.getElementById('bottom-nav');
    if (nav) nav.style.display = 'none';

    const links = CONSENT_DOCS
        .map(d => `<a href="${d.href}" target="_blank" rel="noopener" class="text-accent">${d.label}</a>`)
        .join(', ');

    content.innerHTML = `
    <div class="flex items-center justify-center p-6" style="min-height:100vh;">
      <div class="card w-full" style="max-width:440px;">
        <h2 class="mb-3" tabindex="-1" id="consent-heading">Before you continue</h2>
        <p class="text-sm text-secondary mb-4" style="line-height:1.6;">
          VitalLens is a <strong>general-wellness journal</strong> — it is not a medical
          device and does not diagnose or assess any condition. To use it, please review and
          accept our ${links}.
        </p>
        <label for="consent-agree" class="flex gap-2 items-start text-sm cursor-pointer mb-2">
          <input type="checkbox" id="consent-agree" style="margin-top:3px;">
          <span>I have read and agree to the Terms of Service and Privacy Policy, and I consent to the processing of the wellness and health-related data I choose to provide (including any photos I submit) as described.</span>
        </label>
        <div id="consent-error" role="alert" style="display:none;color:var(--error);font-size:var(--text-sm);margin-bottom:var(--space-2);"></div>
        <button type="button" id="consent-continue" class="btn btn-glass btn-block mt-3">Agree &amp; continue</button>
      </div>
    </div>`;

    document.getElementById('consent-heading')?.focus();

    const btn = document.getElementById('consent-continue');
    btn.addEventListener('click', async () => {
        const agreed = document.getElementById('consent-agree').checked;
        const err = document.getElementById('consent-error');
        if (!agreed) {
            err.textContent = 'Please check the box to continue.';
            err.style.display = 'block';
            document.getElementById('consent-agree')?.focus();
            return;
        }
        err.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Saving…';
        try {
            await recordConsents();
            window.location.hash = '#/';
            window.location.reload();
        } catch (e) {
            console.warn('[Consent] could not record consent:', e?.message);
            err.textContent = "Couldn't save your consent. Check your connection and try again.";
            err.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Agree & continue';
        }
    });
}
