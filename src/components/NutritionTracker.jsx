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
                // GET /api/daily-nutrition responds { data: row | null } — unwrap the row.
                const json = await nutritionRes.json();
                setNutrition(json.data ?? null);
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
        <div role="status" aria-label="Loading today's nutrition" className="flex justify-center p-4">
            <div className="spinner" />
        </div>
    );

    if (error) return (
        <div className="card mb-4">
            <div className="empty-state p-4" role="alert">
                <h2 className="text-base">Couldn't load today's nutrition</h2>
                <p className="text-sm">Check your connection and try again. Your logged meals are safe.</p>
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
            <div className="mb-2">
                <div className="flex justify-between" style={{ marginBottom: '4px' }}>
                    <span className="text-xs text-secondary">{label}</span>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color }}>
                        {value}{unit}{pct != null && <span className="text-tertiary" style={{ fontWeight: 400 }}> ({pct}%)</span>}
                    </span>
                </div>
                {pct != null && (
                    <div
                        role="progressbar"
                        aria-label={`${label} progress`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={pct}
                        className="bg-surface-2 overflow-hidden" style={{ height: '4px', borderRadius: '2px' }}
                    >
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', transition: 'width 0.6s ease' }} />
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="card mb-4">
            <div className="flex justify-between items-start mb-3">
                <div>
                    <div className="text-xs text-tertiary" style={{ marginBottom: '2px' }}>Today's Nutrition</div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 800, color: barColor(calPct) }}>
                        {cal} <span className="text-sm text-tertiary" style={{ fontWeight: 400 }}>kcal</span>
                    </div>
                </div>
                {hasTargets && (
                    <div className="text-right">
                        <div className="text-xs text-tertiary">of {calTarget} target</div>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: barColor(calPct) }}>{calPct}%</div>
                    </div>
                )}
            </div>

            <MacroBar label="Protein" value={protein} unit="g" pct={protPct} color={barColor(protPct)} />
            <MacroBar label="Fiber" value={fiber} unit="g" pct={fiberPct} color={barColor(fiberPct)} />

            <div className="flex gap-3 mt-2">
                <div className="flex-1 text-center p-2 bg-surface-2 rounded-md">
                    <div className="text-sm font-semibold">{carbs}g</div>
                    <div className="text-xs text-tertiary">Carbs</div>
                </div>
                <div className="flex-1 text-center p-2 bg-surface-2 rounded-md">
                    <div className="text-sm font-semibold">{fat}g</div>
                    <div className="text-xs text-tertiary">Fat</div>
                </div>
                {hasTargets && (
                    <div className="flex-1 text-center p-2 bg-surface-2 rounded-md">
                        <div className="text-sm font-semibold">{calTarget - cal > 0 ? calTarget - cal : 0}</div>
                        <div className="text-xs text-tertiary">Remaining</div>
                    </div>
                )}
            </div>

            {!hasTargets && (
                <p className="text-xs text-secondary mt-2">
                    Set a daily calorie target in your profile to see progress toward it.
                </p>
            )}

            <p className="disclaimer mt-2">
                Pattern observations only — not medical advice.
            </p>
        </div>
    );
}
