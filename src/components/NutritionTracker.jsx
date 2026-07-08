import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api.js';

export default function NutritionTracker({ userId }) {
    const [nutrition, setNutrition] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
                const [nutritionRes, profileRes] = await Promise.allSettled([
                    apiFetch(`/api/daily-nutrition?userId=${userId}&date=${today}`),
                    apiFetch(`/api/health-profile?userId=${userId}`),
                ]);

                if (nutritionRes.status === 'fulfilled' && nutritionRes.value.ok) {
                    const data = await nutritionRes.value.json();
                    setNutrition(data.nutrition || data);
                }
                if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
                    const data = await profileRes.value.json();
                    setProfile(data.profile);
                }
            } catch (e) {
                console.warn('[NutritionTracker] Failed:', e.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [userId]);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-4)' }}>
            <div className="spinner" />
        </div>
    );

    const cal = Math.round(nutrition?.calories || 0);
    const protein = Math.round(nutrition?.protein || 0);
    const carbs = Math.round(nutrition?.carbs || 0);
    const fat = Math.round(nutrition?.fat || 0);
    const fiber = Math.round(nutrition?.fiber || 0);

    const calTarget = profile?.target_calories || 2000;
    const protTarget = profile?.target_protein || 120;
    const fiberTarget = profile?.target_fiber || 30;

    const calPct = Math.min(100, Math.round((cal / calTarget) * 100));
    const protPct = Math.min(100, Math.round((protein / protTarget) * 100));
    const fiberPct = Math.min(100, Math.round((fiber / fiberTarget) * 100));

    const barColor = (pct) => pct >= 90 ? 'var(--accent-green)' : pct >= 60 ? 'var(--accent-teal)' : 'var(--accent-amber)';

    function MacroBar({ label, value, unit, pct, color }) {
        return (
            <div style={{ marginBottom: 'var(--space-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{label}</span>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color }}>
                        {value}{unit} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>({pct}%)</span>
                    </span>
                </div>
                <div style={{ height: '4px', background: 'var(--surface-2)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', transition: 'width 0.6s ease' }} />
                </div>
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
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>of {calTarget} target</div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: barColor(calPct) }}>{calPct}%</div>
                </div>
            </div>

            <MacroBar label="Protein" value={protein} unit="g" pct={protPct} color={barColor(protPct)} />
            <MacroBar label="Fiber" value={fiber} unit="g" pct={fiberPct} color={barColor(fiberPct)} />

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                <div style={{ flex: 1, textAlign: 'center', padding: 'var(--space-2)', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{carbs}g</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Carbs</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: 'var(--space-2)', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{fat}g</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Fat</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: 'var(--space-2)', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{calTarget - cal > 0 ? calTarget - cal : 0}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Remaining</div>
                </div>
            </div>

            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: 'var(--space-2)', fontStyle: 'italic' }}>
                Pattern observations only — not medical advice.
            </div>
        </div>
    );
}
