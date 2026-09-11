// ─── Consent gate ─────────────────────────────────────────────
// Shown by the router when an authenticated user has not accepted the
// current document versions. Blocks the app until they do.
import { CONSENT_DOCS, recordConsents } from '../utils/consent.js';

export function renderConsentGate() {
    const content = document.getElementById('page-content');
    const nav = document.getElementById('bottom-nav');
    if (nav) nav.style.display = 'none';

    const links = CONSENT_DOCS
        .map(d => `<a href="${d.href}" target="_blank" rel="noopener" style="color:var(--accent);">${d.label}</a>`)
        .join(', ');

    content.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:var(--space-6);">
      <div class="card" style="width:100%;max-width:440px;">
        <h2 style="margin-bottom:var(--space-3);" tabindex="-1" id="consent-heading">Before you continue</h2>
        <p style="font-size:var(--text-sm);color:var(--text-secondary);line-height:1.6;margin-bottom:var(--space-4);">
          VitalLens is a <strong>general-wellness journal</strong> — it is not a medical
          device and does not diagnose or assess any condition. To use it, please review and
          accept our ${links}.
        </p>
        <label for="consent-agree" style="display:flex;gap:var(--space-2);align-items:flex-start;font-size:var(--text-sm);cursor:pointer;margin-bottom:var(--space-2);">
          <input type="checkbox" id="consent-agree" style="margin-top:3px;">
          <span>I have read and agree to the Terms of Service and Privacy Policy, and I consent to the processing of the wellness and health-related data I choose to provide (including any photos I submit) as described.</span>
        </label>
        <div id="consent-error" role="alert" style="display:none;color:var(--error);font-size:var(--text-sm);margin-bottom:var(--space-2);"></div>
        <button type="button" id="consent-continue" class="btn btn-glass btn-block" style="margin-top:var(--space-3);">Agree &amp; continue</button>
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
