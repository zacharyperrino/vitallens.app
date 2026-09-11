import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../utils/api.js';

export default function WellnessScoreCard({ userId }) {
    const [scores, setScores] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const fetchReport = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await apiFetch(`/api/weekly-report/latest?userId=${userId}`);
            // 404 means no weekly report exists yet — that's empty, not broken.
            if (res.status === 404) { setScores(null); return; }
            if (!res.ok) throw new Error(`Weekly report request failed (${res.status})`);
            const { reports } = await res.json();
            setScores(Array.isArray(reports) && reports.length > 0 ? reports[0] : null);
        } catch (e) {
            console.warn('[WellnessScoreCard] Load failed:', e.message);
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    if (loading) return (
        <div role="status" aria-label="Loading weekly score" style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-4)' }}>
            <div className="spinner" />
        </div>
    );

    if (error) return (
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="empty-state" role="alert" style={{ padding: 'var(--space-4)' }}>
                <h3 style={{ fontSize: 'var(--text-base)' }}>Couldn't load your weekly score</h3>
                <p style={{ fontSize: 'var(--text-sm)' }}>Check your connection and try again.</p>
                <button type="button" className="btn btn-sm" onClick={fetchReport}>Try again</button>
            </div>
        </div>
    );

    // No report yet: nothing to show, and nothing to invent.
    if (!scores) return null;

    const weekScore = Number(scores.week_score);
    const hasScore = Number.isFinite(weekScore);
    const scoreColor = !hasScore ? 'var(--text-secondary)'
        : weekScore >= 80 ? 'var(--viz-green)'
        : weekScore >= 60 ? 'var(--viz-amber)'
        : 'var(--error)';
    const scoreWord = !hasScore ? '' : weekScore >= 80 ? 'strong week' : weekScore >= 60 ? 'steady week' : 'lighter week';

    const wins = Array.isArray(scores.wins) ? scores.wins : [];
    const gaps = Array.isArray(scores.gaps) ? scores.gaps : Array.isArray(scores.report_data?.patterns_to_explore) ? scores.report_data.patterns_to_explore : [];
    const connection = scores.top_correlation || scores.report_data?.top_connection;

    return (
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: '2px' }}>
                        Week of {scores.week_of}
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>
                        {scores.headline}
                    </div>
                </div>
                {hasScore && (
                    <div style={{ textAlign: 'center', marginLeft: 'var(--space-3)' }} role="img" aria-label={`Week score ${weekScore} out of 100, ${scoreWord}`}>
                        <div style={{
                            fontFamily: 'var(--font-heading)',
                            fontSize: 'var(--text-3xl)',
                            fontWeight: 800,
                            color: scoreColor,
                            transition: 'color 0.3s ease'
                        }}>
                            {weekScore}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>week score · {scoreWord}</div>
                    </div>
                )}
            </div>

            {wins.length > 0 && (
                <div style={{ marginBottom: 'var(--space-3)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--viz-green)', marginBottom: 'var(--space-1)' }}>WINS</div>
                    {wins.map((w, i) => (
                        <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', padding: '2px 0' }}>+ {w}</div>
                    ))}
                </div>
            )}

            {gaps.length > 0 && (
                <div style={{ marginBottom: 'var(--space-3)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--viz-amber)', marginBottom: 'var(--space-1)' }}>PATTERNS TO EXPLORE</div>
                    {gaps.map((g, i) => (
                        <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', padding: '2px 0' }}>{g}</div>
                    ))}
                </div>
            )}

            {connection && (
                <div style={{ padding: 'var(--space-2)', background: 'var(--accent-teal-dim)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--accent-teal)', marginBottom: '2px' }}>CONNECTION NOTICED</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                        {connection}
                    </div>
                </div>
            )}

            <p className="disclaimer" style={{ margin: 0 }}>
                Pattern observations only — not medical advice.
            </p>
        </div>
    );
}
