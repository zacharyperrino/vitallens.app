import { useState, useEffect, useCallback } from 'react';
import { icons } from '../icons.js';
import { apiFetch } from '../utils/api.js';

export default function PatternDiscoveryHero({ userId }) {
    const [correlations, setCorrelations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [runError, setRunError] = useState('');

    const fetchPatterns = useCallback(async () => {
        setLoadError(false);
        try {
            const res = await apiFetch(`/api/correlate/latest?userId=${userId}&limit=8`);
            if (!res.ok) throw new Error(`Patterns request failed (${res.status})`);
            const { correlations } = await res.json();
            setCorrelations(Array.isArray(correlations) ? correlations : []);
        } catch (e) {
            console.warn('[PatternDiscovery] Load failed:', e.message);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    async function runFreshAnalysis() {
        setRefreshing(true);
        setRunError('');
        try {
            const res = await apiFetch(`/api/correlate/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });
            if (!res.ok) throw new Error(`Analysis request failed (${res.status})`);
            await fetchPatterns();
        } catch (e) {
            console.warn('[PatternDiscovery] Analysis failed:', e.message);
            setRunError("Couldn't run the analysis right now. Check your connection and try again.");
        } finally {
            setRefreshing(false);
        }
    }

    useEffect(() => { setLoading(true); fetchPatterns(); }, [fetchPatterns]);

    const meaningful = correlations.filter(c => c.correlation_type !== 'summary' && Number(c.confidence) >= 0.6);

    const heroStyle = { background: 'linear-gradient(135deg,var(--surface-2) 0%,var(--surface-3) 100%)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', border: '1px solid var(--border)', textAlign: 'center' };

    if (loading) return (
        <div role="status" aria-label="Loading patterns" className="flex justify-center p-6">
            <div className="spinner" />
        </div>
    );

    if (loadError) return (
        <div className="empty-state" role="alert" style={heroStyle}>
            <h2 className="text-base">Couldn't load your patterns</h2>
            <p className="text-sm">Check your connection and try again. Nothing you've logged has been lost.</p>
            <button type="button" className="btn btn-sm" onClick={() => { setLoading(true); fetchPatterns(); }}>Try again</button>
        </div>
    );

    const runErrorNote = runError && (
        <div role="alert" className="text-xs text-error mt-2">{runError}</div>
    );

    if (meaningful.length === 0) return (
        <div style={heroStyle}>
            <div aria-hidden="true" className="mb-3 text-tertiary" dangerouslySetInnerHTML={{ __html: icons.scan }} />
            <div className="text-sm font-semibold mb-2">No patterns discovered yet</div>
            <div className="text-xs text-secondary mb-4">Log meals, sleep, and check-ins for a few days, then run a pattern analysis.</div>
            <button type="button" className="btn btn-primary text-xs" onClick={runFreshAnalysis} disabled={refreshing}>
                {refreshing ? 'Analyzing...' : 'Run Pattern Analysis'}
            </button>
            {runErrorNote}
        </div>
    );

    const top = meaningful[0];
    const domains = top.correlation_type?.split('-') || ['lifestyle', 'wellness'];
    const domainA = domains[0]?.replace(/_/g, ' ') || 'lifestyle';
    const domainB = domains[1]?.replace(/_/g, ' ') || 'wellness';
    const directionWord = (d) => d === 'positive' ? 'positive link' : d === 'negative' ? 'negative link' : 'link';
    const directionColor = top.direction === 'positive' ? 'var(--viz-green)' : top.direction === 'negative' ? 'var(--error)' : 'var(--accent-teal)';
    const strengthLabel = top.confidence >= 0.8 ? 'Consistent pattern' : top.confidence >= 0.5 ? 'Emerging pattern' : 'Early signal';

    return (
        <div className="rounded-lg p-5 border relative overflow-hidden" style={{ background: 'linear-gradient(135deg,var(--surface-2) 0%,var(--surface-3) 100%)' }}>
            <div aria-hidden="true" style={{ position: 'absolute', top: 0, right: 0, width: '120px', height: '120px', background: directionColor, opacity: 0.05, borderRadius: '50%', transform: 'translate(30px,-30px)' }} />

            <div className="flex items-center gap-2 mb-3">
                <div aria-hidden="true" style={{ width: '8px', height: '8px', borderRadius: '50%', background: directionColor }} />
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: directionColor, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {strengthLabel} · {directionWord(top.direction)}
                </div>
            </div>

            <div className="text-xs text-tertiary mb-2" style={{ textTransform: 'capitalize' }}>{domainA} {domainB}</div>
            <div className="text-sm font-semibold text-primary mb-3" style={{ lineHeight: 1.5 }}>{top.description}</div>

            {top.actionable && (
                <div style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--surface-1)', borderRadius: 'var(--radius-md)', borderLeft: `3px solid ${directionColor}`, marginBottom: 'var(--space-3)' }}>
                    <div className="text-xs text-tertiary" style={{ marginBottom: '2px' }}>Something to explore</div>
                    <div className="text-xs text-secondary">{top.actionable}</div>
                </div>
            )}

            {meaningful.length > 1 && (
                <ul className="flex gap-2 flex-wrap mb-3 p-0" style={{ listStyle: 'none', margin: '0 0 var(--space-3)' }}>
                    {meaningful.slice(1, 4).map((c, i) => {
                        const parts = c.correlation_type?.split('-') || [];
                        const col = c.direction === 'positive' ? 'var(--viz-green)' : c.direction === 'negative' ? 'var(--error)' : 'var(--viz-amber)';
                        return (
                            <li key={i} className="bg-surface-1 rounded-sm border text-xs text-tertiary" style={{ padding: 'var(--space-1) var(--space-2)' }}>
                                <span aria-hidden="true" style={{ color: col }}>●</span>
                                <span className="visually-hidden">{directionWord(c.direction)}: </span>
                                {' '}{parts[0]?.replace(/_/g, ' ')} {parts[1]?.replace(/_/g, ' ')}
                            </li>
                        );
                    })}
                </ul>
            )}

            <div className="flex justify-between items-center gap-2">
                <p className="disclaimer m-0 text-xs">Pattern observations · not medical advice</p>
                <button type="button" onClick={runFreshAnalysis} disabled={refreshing} className="text-xs text-accent cursor-pointer p-0" style={{ background: 'none', border: 'none' }}>
                    {refreshing ? 'Analyzing...' : 'Run fresh analysis'}
                </button>
            </div>
            {runErrorNote}
        </div>
    );
}
