import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/api.js';
import { todayLocalISO } from '../utils/dates.js';

export default function NutritionTracker({ userId }) {
    const [nutrition, setNutrition] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const today = todayLocalISO();
            const [nutritionRes, profileRes] = await Promise.all([
                apiFetch(`/api/daily-nutrition?userId=${userId}&date=${today}`),
                apiFetch(`/api/health-profile?userId=${userId}`),
            ]);

            // 404 means "nothing recorded" (empty). Any other failure is an error
            // and must not be rendered as a day with zero intake.
            if (nutritionRes.status === 404) {
                setNutrition(null);
            } else if (!nutritionRes.ok) {
                throw new Error(`Nutrition request failed (${nutritionRes.status})`);
            } else {
                const data = await nutritionRes.json();
                setNutrition(data.nutrition || data || null);
            }

            if (profileRes.status === 404) {
                setProfile(null);
            } else if (!profileRes.ok) {
                throw new Error(`Profile request failed (${profileRes.status})`);
            } else {
                const data = await profileRes.json();
                setProfile(data.profile || null);
            }
        } catch (e) {
            console.warn('[NutritionTracker] Failed:', e.message);
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    if (loading) return (
        <div role="status" aria-label="Loading today's nutrition" style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-4)' }}>
            <div className="spinner" />
        </div>
    );

    if (error) return (
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="empty-state" role="alert" style={{ padding: 'var(--space-4)' }}>
                <h3 style={{ fontSize: 'var(--text-base)' }}>Couldn't load today's nutrition</h3>
                <p style={{ fontSize: 'var(--text-sm)' }}>Check your connection and try again. Your logged meals are safe.</p>
                <button type="button" className="btn btn-sm" onClick={fetchData}>Try again</button>
            </div>
        </div>
    );

    const cal = Math.round(Number(nutrition?.calories) || 0);
    const protein = Math.round(Number(nutrition?.protein) || 0);
    const carbs = Math.round(Number(nutrition?.carbs) || 0);
    const fat = Math.round(Number(nutrition?.fat) || 0);
    const fiber = Math.round(Number(nutrition?.fiber) || 0);

    // Targets come only from the user's own profile — never a placeholder.
    const calTarget = Number(profile?.target_calories) || 0;
    const protTarget = Number(profile?.target_protein) || 0;
    const fiberTarget = Number(profile?.target_fiber) || 0;
    const hasTargets = calTarget > 0;

    const pctOf = (value, target) => target > 0 ? Math.min(100, Math.round((value / target) * 100)) : null;
    const calPct = pctOf(cal, calTarget);
    const protPct = pctOf(protein, protTarget);
    const fiberPct = pctOf(fiber, fiberTarget);

    // Colour tracks progress, and the percentage is always printed beside it.
    const barColor = (pct) => pct == null ? 'var(--text-secondary)' : pct >= 90 ? 'var(--viz-green)' : pct >= 60 ? 'var(--accent-teal)' : 'var(--viz-amber)';

    function MacroBar({ label, value, unit, pct, color }) {
        return (
            <div style={{ marginBottom: 'var(--space-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{label}</span>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color }}>
                        {value}{unit}{pct != null && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}> ({pct}%)</span>}
                    </span>
                </div>
                {pct != null && (
                    <div
                        role="progressbar"
                        aria-label={`${label} progress`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={pct}
                        style={{ height: '4px', background: 'var(--surface-2)', borderRadius: '2px', overflow: 'hidden' }}
                    >
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', transition: 'width 0.6s ease' }} />
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: '2px' }}>Today's Nutrition</div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 800, color: barColor(calPct) }}>
                        {cal} <span style={{ fontSize: 'var(--text-sm)', fontWeight: 400, color: 'var(--text-tertiary)' }}>kcal</span>
                    </div>
                </div>
                {hasTargets && (
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>of {calTarget} target</div>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: barColor(calPct) }}>{calPct}%</div>
                    </div>
                )}
            </div>

            <MacroBar label="Protein" value={protein} unit="g" pct={protPct} color={barColor(protPct)} />
            <MacroBar label="Fiber" value={fiber} unit="g" pct={fiberPct} color={barColor(fiberPct)} />

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                <div style={{ flex: 1, textAlign: 'center', padding: 'var(--space-2)', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{carbs}g</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Carbs</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: 'var(--space-2)', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{fat}g</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Fat</div>
                </div>
                {hasTargets && (
                    <div style={{ flex: 1, textAlign: 'center', padding: 'var(--space-2)', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{calTarget - cal > 0 ? calTarget - cal : 0}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Remaining</div>
                    </div>
                )}
            </div>

            {!hasTargets && (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                    Set a daily calorie target in your profile to see progress toward it.
                </p>
            )}

            <p className="disclaimer" style={{ marginTop: 'var(--space-2)' }}>
                Pattern observations only — not medical advice.
            </p>
        </div>
    );
}
