// ─── Auth Page — Sign In / Sign Up ──────────────────────────
import { icons } from '../icons.js';
import { supabase } from '../lib/supabase.js';
import { migrateFromLocalStorage } from '../lib/db.js';
import { trackEvent } from '../utils/analytics-events.js';

export function renderAuth() {
    const content = document.getElementById('page-content');
    const nav = document.getElementById('bottom-nav');
    if (nav) nav.style.display = 'none';

    let mode = 'signin'; // 'signin' | 'signup'

    content.innerHTML = `
    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:var(--space-6);">

      <!-- Logo -->
      <div style="text-align:center;margin-bottom:var(--space-8);">
        <div style="margin-bottom:var(--space-3);color:var(--accent);display:flex;justify-content:center;">${icons.activity}</div>
        <h1 style="font-size:var(--text-2xl);font-weight:var(--weight-extrabold);margin-bottom:var(--space-1);">VitalLens</h1>
        <p style="font-size:var(--text-sm);color:var(--text-secondary);">Your personal health intelligence platform</p>
      </div>

      <!-- Card -->
      <div class="card" style="width:100%;max-width:400px;">

        <!-- Mode toggle -->
        <div class="scan-mode-toggle" style="margin-bottom:var(--space-5);">
          <button class="mode-btn mode-btn-active" id="btn-signin-mode">Sign In</button>
          <button class="mode-btn" id="btn-signup-mode">Create Account</button>
        </div>

        <!-- Form -->
        <div id="auth-form">
          <div style="display:flex;flex-direction:column;gap:var(--space-3);">

            <div id="name-field" style="display:none;">
              <label style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-1);display:block;">Full Name</label>
              <input type="text" id="auth-name" placeholder="Your name"
                style="width:100%;padding:var(--space-3);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-size:var(--text-sm);box-sizing:border-box;">
            </div>

            <div id="dob-field" style="display:none;">
              <label style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-1);display:block;">Date of Birth</label>
              <input type="date" id="auth-dob" max="${new Date().toISOString().split('T')[0]}"
                style="width:100%;padding:var(--space-3);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-size:var(--text-sm);box-sizing:border-box;">
              <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;">You must be 18 or older to use VitalLens.</div>
            </div>

            <div>
              <label style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-1);display:block;">Email</label>
              <input type="email" id="auth-email" placeholder="you@example.com"
                style="width:100%;padding:var(--space-3);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-size:var(--text-sm);box-sizing:border-box;">
            </div>

            <div>
              <label style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-1);display:block;">Password</label>
              <input type="password" id="auth-password" placeholder="••••••••"
                style="width:100%;padding:var(--space-3);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-size:var(--text-sm);box-sizing:border-box;">
            </div>

            <!-- Consent (signup only) -->
            <label id="consent-field" style="display:none;gap:var(--space-2);align-items:flex-start;font-size:var(--text-xs);color:var(--text-secondary);cursor:pointer;line-height:1.5;">
              <input type="checkbox" id="auth-consent" style="margin-top:2px;">
              <span>I am 18+ and agree to the <a href="#/legal/terms" target="_blank" style="color:var(--accent);">Terms</a> and <a href="#/legal/privacy" target="_blank" style="color:var(--accent);">Privacy Policy</a>, and consent to processing of the wellness data I provide.</span>
            </label>

            <!-- Error message -->
            <div id="auth-error" style="display:none;padding:var(--space-3);background:var(--accent-coral-dim);border-radius:var(--radius-md);font-size:var(--text-xs);color:var(--accent-coral);">
            </div>

            <!-- Submit button -->
            <button id="auth-submit" class="btn btn-glass btn-block" style="margin-top:var(--space-2);">
              Sign In
            </button>

          </div>
        </div>

        <p style="font-size:var(--text-xs);color:var(--text-tertiary);text-align:center;margin-top:var(--space-4);line-height:1.5;">
          Your health data is encrypted and stored securely.<br>We never sell your data.
        </p>
      </div>
    </div>
  `;

    // ── Mode toggle ────────────────────────────────────────────
    document.getElementById('btn-signin-mode').addEventListener('click', () => {
        mode = 'signin';
        document.getElementById('btn-signin-mode').className = 'mode-btn mode-btn-active';
        document.getElementById('btn-signup-mode').className = 'mode-btn';
        document.getElementById('name-field').style.display = 'none';
        document.getElementById('dob-field').style.display = 'none';
        document.getElementById('consent-field').style.display = 'none';
        document.getElementById('auth-submit').textContent = 'Sign In';
        hideError();
    });

    document.getElementById('btn-signup-mode').addEventListener('click', () => {
        mode = 'signup';
        document.getElementById('btn-signup-mode').className = 'mode-btn mode-btn-active';
        document.getElementById('btn-signin-mode').className = 'mode-btn';
        document.getElementById('name-field').style.display = 'block';
        document.getElementById('dob-field').style.display = 'block';
        document.getElementById('consent-field').style.display = 'flex';
        document.getElementById('auth-submit').textContent = 'Create Account';
        hideError();
    });

    // ── Submit ─────────────────────────────────────────────────
    document.getElementById('auth-submit').addEventListener('click', () => handleSubmit());

    document.getElementById('auth-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSubmit();
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

        if (password.length < 6) {
            showError('Password must be at least 6 characters.');
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
                showError('VitalLens is available for users 18 and older.');
                return;
            }
            if (!document.getElementById('auth-consent')?.checked) {
                showError('Please agree to the Terms and Privacy Policy to create an account.');
                return;
            }
        }

        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin:0 auto;"></div>';

        try {
            if (mode === 'signup') {
                const dob = document.getElementById('auth-dob').value;
                const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));

                const { data, error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;

                if (data.user) {
                    await supabase.from('profiles').insert({
                        id: data.user.id,
                        name: name || '',
                        date_of_birth: dob,
                        age,
                    });
                }

                showSuccess('Account created! Check your email to confirm, then sign in.');
                btn.disabled = false;
                btn.textContent = 'Create Account';

            } else {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;

                const user = data.user;
                if (user) trackEvent('user_logged_in', { userId: user.id });

                const alreadyMigrated = localStorage.getItem('vitallens_migrated');
                if (!alreadyMigrated) {
                    await migrateFromLocalStorage();
                }

                // Check if MFA is enrolled — prompt if not
                const { data: mfaData } = await supabase.auth.mfa.listFactors();
                const hasTotp = mfaData?.totp?.length > 0;
                if (!hasTotp) {
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
            showError(err.message || 'Something went wrong. Please try again.');
            btn.disabled = false;
            btn.textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
        }
    }

    function showMFAEnrollment(qrCode, factorId) {
        document.getElementById('auth-form').innerHTML = `
            <div style="text-align:center;">
                <div style="font-size:var(--text-sm);font-weight:600;margin-bottom:var(--space-3);">Secure your account</div>
                <p style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-4);">Scan this QR code with an authenticator app like Google Authenticator or Authy.</p>
                <img src="${qrCode}" style="width:180px;height:180px;margin:0 auto var(--space-4);display:block;border-radius:var(--radius-md);">
                <input type="text" id="mfa-code" placeholder="Enter 6-digit code"
                    style="width:100%;padding:var(--space-3);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-size:var(--text-sm);box-sizing:border-box;text-align:center;letter-spacing:0.2em;margin-bottom:var(--space-3);">
                <button id="mfa-verify-btn" class="btn btn-primary btn-block">Verify & Continue</button>
                <button id="mfa-skip-btn" style="margin-top:var(--space-2);background:none;border:none;color:var(--text-tertiary);font-size:var(--text-xs);cursor:pointer;">Skip for now</button>
            </div>
        `;

        document.getElementById('mfa-verify-btn').addEventListener('click', async () => {
            const code = document.getElementById('mfa-code').value.trim();
            if (!code) return;
            const { data: challengeData } = await supabase.auth.mfa.challenge({ factorId });
            const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challengeData.id, code });
            if (error) {
                showError('Invalid code — please try again.');
                return;
            }
            window.location.reload();
        });

        document.getElementById('mfa-skip-btn').addEventListener('click', () => {
            window.location.reload();
        });
    }

    function showError(msg) {
        const el = document.getElementById('auth-error');
        el.textContent = msg;
        el.style.display = 'block';
    }

    function showSuccess(msg) {
        const el = document.getElementById('auth-error');
        el.textContent = msg;
        el.style.display = 'block';
        el.style.background = 'var(--accent-teal-dim)';
        el.style.color = 'var(--accent-teal)';
    }

    function hideError() {
        const el = document.getElementById('auth-error');
        if (el) el.style.display = 'none';
    }
}

// ─── Auth state helper — call this on app boot ───────────────
export async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
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
    } catch {
        // On a transient read failure, don't trap the user in a redirect
        // loop — allow this navigation but leave the cache unset so the
        // next navigation re-checks.
        return true;
    }
}

// Call after the user finishes onboarding so the guard stops redirecting.
export function markOnboardingComplete() {
    _onboardingComplete = true;
}

export async function signOut() {
    await supabase.auth.signOut();
    window.location.reload();
}