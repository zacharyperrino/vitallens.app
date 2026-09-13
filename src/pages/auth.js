// ─── Auth Page — Sign In / Sign Up ──────────────────────────
import { icons } from '../icons.js';
import { supabase } from '../lib/supabase.js';
import { migrateFromLocalStorage } from '../lib/db.js';
import { trackEvent } from '../utils/analytics-events.js';
import { esc } from '../utils/esc.js';
import { todayLocalISO } from '../utils/dates.js';

const FIELD_STYLE = 'width:100%;padding:var(--space-3);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-size:var(--text-sm);box-sizing:border-box;';
const LABEL_STYLE = 'font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-1);display:block;';

export function renderAuth() {
    const content = document.getElementById('page-content');
    const nav = document.getElementById('bottom-nav');
    if (nav) nav.style.display = 'none';

    let mode = 'signin'; // 'signin' | 'signup'
    let mfaVerify = null; // set while the MFA enrolment screen is showing

    content.innerHTML = `
    <div class="flex-col items-center justify-center p-6" style="min-height:100vh;">

      <!-- Logo -->
      <div class="text-center" style="margin-bottom:var(--space-8);">
        <div class="mb-3 text-accent flex justify-center" aria-hidden="true">${icons.activity}</div>
        <h1 class="text-2xl mb-1" style="font-weight:var(--weight-extrabold);">VitalLens</h1>
        <p class="text-secondary text-sm">Your private wellness journal</p>
      </div>

      <!-- Card -->
      <div class="card w-full" style="max-width:400px;">

        <!-- Mode toggle -->
        <div class="scan-mode-toggle mb-5" role="group" aria-label="Sign in or create an account">
          <button type="button" class="mode-btn mode-btn-active" id="btn-signin-mode" aria-pressed="true">Sign in</button>
          <button type="button" class="mode-btn" id="btn-signup-mode" aria-pressed="false">Create account</button>
        </div>

        <!-- Form -->
        <form id="auth-form" novalidate>
          <div class="flex-col gap-3">

            <div id="name-field" style="display:none;">
              <label for="auth-name" style="${LABEL_STYLE}">Full name</label>
              <input type="text" id="auth-name" placeholder="Your name" autocomplete="name" style="${FIELD_STYLE}">
            </div>

            <div id="dob-field" style="display:none;">
              <label for="auth-dob" style="${LABEL_STYLE}">Date of birth</label>
              <input type="date" id="auth-dob" max="${todayLocalISO()}" autocomplete="bday" aria-describedby="auth-dob-help" style="${FIELD_STYLE}">
              <div id="auth-dob-help" class="disclaimer mt-2">You must be 18 or older to use VitalLens.</div>
            </div>

            <div>
              <label for="auth-email" style="${LABEL_STYLE}">Email</label>
              <input type="email" id="auth-email" placeholder="you@example.com" autocomplete="email" inputmode="email" style="${FIELD_STYLE}">
            </div>

            <div>
              <label for="auth-password" style="${LABEL_STYLE}">Password</label>
              <input type="password" id="auth-password" placeholder="At least 8 characters, letters and numbers" minlength="8" autocomplete="current-password" style="${FIELD_STYLE}">
            </div>

            <!-- Consent (signup only) -->
            <label for="auth-consent" id="consent-field" style="display:none;gap:var(--space-2);align-items:flex-start;font-size:var(--text-xs);color:var(--text-secondary);cursor:pointer;line-height:1.5;">
              <input type="checkbox" id="auth-consent" style="margin-top:2px;">
              <span>I am 18+ and agree to the <a href="#/legal/terms" target="_blank" rel="noopener" class="text-accent">Terms</a> and <a href="#/legal/privacy" target="_blank" rel="noopener" class="text-accent">Privacy Policy</a>, and consent to processing of the wellness data I provide.</span>
            </label>

            <!-- Error / status message -->
            <div id="auth-error" role="alert" style="display:none;padding:var(--space-3);background:var(--error-dim);border-radius:var(--radius-md);font-size:var(--text-sm);color:var(--error);">
            </div>

            <!-- Submit button -->
            <button type="submit" id="auth-submit" class="btn btn-glass btn-block mt-2">
              Sign in
            </button>

          </div>
        </form>

        <p class="disclaimer mt-4 text-center">
          Your health data is encrypted and stored securely.<br>We never sell your data.
        </p>
      </div>
    </div>
  `;

    // ── Mode toggle ────────────────────────────────────────────
    function setMode(next) {
        if (mfaVerify) return;
        mode = next;
        const signup = mode === 'signup';
        document.getElementById('btn-signin-mode').className = signup ? 'mode-btn' : 'mode-btn mode-btn-active';
        document.getElementById('btn-signup-mode').className = signup ? 'mode-btn mode-btn-active' : 'mode-btn';
        document.getElementById('btn-signin-mode').setAttribute('aria-pressed', signup ? 'false' : 'true');
        document.getElementById('btn-signup-mode').setAttribute('aria-pressed', signup ? 'true' : 'false');
        document.getElementById('name-field').style.display = signup ? 'block' : 'none';
        document.getElementById('dob-field').style.display = signup ? 'block' : 'none';
        document.getElementById('consent-field').style.display = signup ? 'flex' : 'none';
        document.getElementById('auth-password').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
        document.getElementById('auth-submit').textContent = signup ? 'Create account' : 'Sign in';
        hideError();
    }
    document.getElementById('btn-signin-mode').addEventListener('click', () => setMode('signin'));
    document.getElementById('btn-signup-mode').addEventListener('click', () => setMode('signup'));

    // ── Submit (Enter in any field works because this is a real form) ──
    document.getElementById('auth-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if (mfaVerify) { mfaVerify(); return; }
        handleSubmit();
    });

    async function handleSubmit() {
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        const name = document.getElementById('auth-name')?.value.trim();
        const btn = document.getElementById('auth-submit');

        if (!email || !password) {
            showError('Please enter your email and password.');
            return;
        }

        if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
            showError('Your password needs at least 8 characters, including a letter and a number.');
            return;
        }

        // ── Age verification on signup ─────────────────────────
        if (mode === 'signup') {
            const dob = document.getElementById('auth-dob').value;
            if (!dob) {
                showError('Please enter your date of birth.');
                return;
            }
            const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
            if (age < 18) {
                showError('VitalLens is available for people 18 and older.');
                return;
            }
            if (!document.getElementById('auth-consent')?.checked) {
                showError('Please agree to the Terms and Privacy Policy to create an account.');
                return;
            }
        }

        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin:0 auto;"></div><span class="visually-hidden">Please wait</span>';

        try {
            if (mode === 'signup') {
                const dob = document.getElementById('auth-dob').value;
                const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));

                const { data, error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;

                if (data.user) {
                    const { error: profileErr } = await supabase.from('profiles').insert({
                        id: data.user.id,
                        name: name || '',
                        date_of_birth: dob,
                        age,
                    });
                    if (profileErr) console.warn('[Auth] profile row not created:', profileErr.message);
                }

                showSuccess('Account created. Check your email to confirm, then sign in.');
                btn.disabled = false;
                btn.textContent = 'Create account';

            } else {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;

                const user = data.user;
                if (user) trackEvent('user_logged_in', { userId: user.id });

                const alreadyMigrated = localStorage.getItem('vitallens_migrated');
                if (!alreadyMigrated) {
                    await migrateFromLocalStorage();
                }

                // Offer MFA enrolment once. "Skip for now" is remembered so the
                // prompt does not reappear on every sign-in; it stays available in Profile.
                const { data: mfaData } = await supabase.auth.mfa.listFactors();
                const hasTotp = mfaData?.totp?.length > 0;
                const skipped = localStorage.getItem(`vitallens_mfa_skipped_${user?.id}`) === '1';
                if (!hasTotp && !skipped) {
                    const enroll = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'VitalLens' });
                    if (enroll.data) {
                        const qrCode = enroll.data.totp.qr_code;
                        const factorId = enroll.data.id;
                        showMFAEnrollment(qrCode, factorId);
                        return;
                    }
                }

                window.location.reload();
            }
        } catch (err) {
            showError(friendlyAuthError(err));
            btn.disabled = false;
            btn.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
        }
    }

    // Supabase messages are mostly readable; translate the terse ones.
    function friendlyAuthError(err) {
        const msg = String(err?.message || '');
        if (/invalid login credentials/i.test(msg)) return "That email and password don't match. Please try again.";
        if (/email not confirmed/i.test(msg)) return 'Please confirm your email first — check your inbox for the link.';
        if (/already registered|already exists/i.test(msg)) return 'An account with that email already exists. Try signing in.';
        if (/failed to fetch|network/i.test(msg)) return 'Check your connection and try again.';
        return msg || 'Something went wrong. Please try again.';
    }

    function showMFAEnrollment(qrCode, factorId) {
        const form = document.getElementById('auth-form');
        const toggle = document.querySelector('.scan-mode-toggle');
        if (toggle) toggle.style.display = 'none';
        form.innerHTML = `
            <div class="text-center">
                <h2 class="text-md font-semibold mb-3" tabindex="-1" id="mfa-heading">Secure your account</h2>
                <p class="mb-4 text-secondary text-sm">Scan this QR code with an authenticator app like Google Authenticator or Authy, then enter the 6-digit code it shows.</p>
                <img src="${esc(qrCode)}" alt="QR code to add VitalLens to your authenticator app" class="block rounded-md" style="width:180px;height:180px;margin:0 auto var(--space-4);">
                <label for="mfa-code" class="visually-hidden">6-digit code</label>
                <input type="text" id="mfa-code" placeholder="Enter 6-digit code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"
                    style="${FIELD_STYLE}text-align:center;letter-spacing:0.2em;margin-bottom:var(--space-3);">
                <div id="auth-error" role="alert" style="display:none;padding:var(--space-3);background:var(--error-dim);border-radius:var(--radius-md);font-size:var(--text-sm);color:var(--error);margin-bottom:var(--space-3);"></div>
                <button type="button" id="mfa-verify-btn" class="btn btn-primary btn-block">Verify &amp; continue</button>
                <button type="button" id="mfa-skip-btn" class="btn btn-ghost btn-block mt-2 text-tertiary text-sm">Skip for now</button>
            </div>
        `;
        document.getElementById('mfa-heading')?.focus();

        mfaVerify = async () => {
            const codeInput = document.getElementById('mfa-code');
            const verifyBtn = document.getElementById('mfa-verify-btn');
            const code = codeInput?.value.trim();
            if (!code) { showError('Enter the 6-digit code from your authenticator app.'); codeInput?.focus(); return; }
            if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.textContent = 'Verifying…'; }
            try {
                const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId });
                if (challengeErr || !challengeData?.id) throw challengeErr || new Error('No challenge');
                const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challengeData.id, code });
                if (error) {
                    showError("That code didn't match — please try again.");
                    return;
                }
                window.location.reload();
            } catch (err) {
                console.warn('[Auth] MFA verify failed:', err?.message);
                showError("Couldn't verify the code. " + friendlyAuthError(err));
            } finally {
                if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.textContent = 'Verify & continue'; }
            }
        };
        document.getElementById('mfa-verify-btn').addEventListener('click', () => mfaVerify());

        document.getElementById('mfa-skip-btn').addEventListener('click', async () => {
            try {
                const { data } = await supabase.auth.getUser();
                if (data?.user?.id) localStorage.setItem(`vitallens_mfa_skipped_${data.user.id}`, '1');
                // Remove the half-enrolled factor so it doesn't linger unverified.
                await supabase.auth.mfa.unenroll({ factorId }).catch(() => {});
            } catch { /* non-blocking */ }
            window.location.reload();
        });
    }

    function showError(msg) {
        const el = document.getElementById('auth-error');
        if (!el) return;
        el.textContent = msg;
        el.style.display = 'block';
        el.style.background = 'var(--error-dim)';
        el.style.color = 'var(--error)';
    }

    function showSuccess(msg) {
        const el = document.getElementById('auth-error');
        if (!el) return;
        el.textContent = msg;
        el.style.display = 'block';
        el.style.background = 'var(--viz-green-dim)';
        el.style.color = 'var(--viz-green)';
    }

    function hideError() {
        const el = document.getElementById('auth-error');
        if (el) el.style.display = 'none';
    }
}

// ─── Auth state helper — call this on app boot ───────────────
export async function getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data?.session ?? null;
}

// ─── Onboarding gate ─────────────────────────────────────────
// Reads profiles.onboarding_completed for the current user. Cached
// so the router guard doesn't hit the DB on every navigation.
let _onboardingComplete = null;

export async function isOnboardingComplete() {
    if (_onboardingComplete !== null) return _onboardingComplete;
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;
        const { data } = await supabase
            .from('profiles')
            .select('onboarding_completed')
            .eq('id', user.id)
            .single();
        _onboardingComplete = !!data?.onboarding_completed;
        return _onboardingComplete;
    } catch (err) {
        // Unknown — the router shows a retry screen rather than guessing.
        console.warn('[Auth] onboarding status unavailable:', err?.message);
        return null;
    }
}

// Call after the user finishes onboarding so the guard stops redirecting.
export function markOnboardingComplete() {
    _onboardingComplete = true;
}

export async function signOut() {
    try { await supabase.auth.signOut(); }
    catch (err) { console.warn('[Auth] signOut failed:', err?.message); }
    window.location.hash = '#/';
    window.location.reload();
}
