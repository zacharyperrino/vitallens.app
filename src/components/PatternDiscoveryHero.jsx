import { useState, useEffect } from 'react';

const API = window.API_BASE || '/api';

export default function PatternDiscoveryHero({ userId }) {
    const [correlations, setCorrelations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    async function fetchPatterns() {
        try {
            const res = await fetch(`${API}/correlate/latest?userId=${userId}&limit=8`);
            if (!res.ok) throw new Error('Failed');
            const { correlations } = await res.json();
            setCorrelations(correlations || []);
        } catch (e) {
            setCorrelations([]);
        } finally {
            setLoading(false);
        }
    }

    async function runFreshAnalysis() {
        setRefreshing(true);
        try {
            await fetch(`${API}/correlate/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });
            await fetchPatterns();
        } catch (e) {}
        setRefreshing(false);
    }

    useEffect(() => { fetchPatterns(); }, [userId]);

    const meaningful = correlations.filter(c => c.correlation_type !== 'summary' && c.confidence >= 0.6);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-6)' }}>
            <div className="spinner" />
        </div>
    );

    if (meaningful.length === 0) return (
        <div style={{ background: 'linear-gradient(135deg,var(--surface-2) 0%,var(--surface-3) 100%)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: 'var(--space-3)' }}>🔍</div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>No patterns discovered yet</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>Log meals, sleep, and check-ins for a few days, then run a pattern analysis.</div>
            <button className="btn btn-primary" style={{ fontSize: 'var(--text-xs)' }} onClick={runFreshAnalysis} disabled={refreshing}>
                {refreshing ? 'Analyzing...' : 'Run Pattern Analysis'}
            </button>
        </div>
    );

    const top = meaningful[0];
    const domains = top.correlation_type?.split('-') || ['lifestyle', 'wellness'];
    const domainA = domains[0]?.replace(/_/g, ' ') || 'lifestyle';
    const domainB = domains[1]?.replace(/_/g, ' ') || 'wellness';
    const directionColor = top.direction === 'positive' ? 'var(--accent-green)' : top.direction === 'negative' ? 'var(--accent-coral)' : 'var(--accent-teal)';
    const strengthLabel = top.confidence >= 0.8 ? 'Consistent pattern' : top.confidence >= 0.5 ? 'Emerging pattern' : 'Early signal';

    return (
        <div style={{ background: 'linear-gradient(135deg,var(--surface-2) 0%,var(--surface-3) 100%)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, width: '120px', height: '120px', background: directionColor, opacity: 0.05, borderRadius: '50%', transform: 'translate(30px,-30px)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: directionColor }} />
                <div style={{ fontSize: '10px', fontWeight: 700, color: directionColor, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{strengthLabel}</div>
            </div>

            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-2)', textTransform: 'capitalize' }}>{domainA} → {domainB}</div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', marginBottom: 'var(--space-3)', lineHeight: 1.5 }}>{top.description}</div>

            {top.actionable && (
                <div style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--surface-1)', borderRadius: 'var(--radius-md)', borderLeft: `3px solid ${directionColor}`, marginBottom: 'var(--space-3)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>Something to explore</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{top.actionable}</div>
                </div>
            )}

            {meaningful.length > 1 && (
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
                    {meaningful.slice(1, 4).map((c, i) => {
                        const parts = c.correlation_type?.split('-') || [];
                        const col = c.direction === 'positive' ? 'var(--accent-green)' : c.direction === 'negative' ? 'var(--accent-coral)' : 'var(--accent-amber)';
                        return (
                            <div key={i} style={{ padding: 'var(--space-1) var(--space-2)', background: 'var(--surface-1)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '10px', color: 'var(--text-tertiary)' }}>
                                <span style={{ color: col }}>●</span> {parts[0]?.replace(/_/g, ' ')} → {parts[1]?.replace(/_/g, ' ')}
                            </div>
                        );
                    })}
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Pattern observations · not medical advice</div>
                <button onClick={runFreshAnalysis} disabled={refreshing} style={{ fontSize: '10px', color: 'var(--accent-teal)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {refreshing ? 'Analyzing...' : 'Run fresh analysis →'}
                </button>
            </div>
        </div>
    );
}
