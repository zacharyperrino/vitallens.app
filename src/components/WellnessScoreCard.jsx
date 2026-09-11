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
        <div role="status" aria-label="Loading weekly score" className="flex justify-center p-4">
            <div className="spinner" />
        </div>
    );

    if (error) return (
        <div className="card mb-4">
            <div className="empty-state p-4" role="alert">
                <h3 className="text-base">Couldn't load your weekly score</h3>
                <p className="text-sm">Check your connection and try again.</p>
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
        <div className="card mb-4">
            <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                    <div className="text-xs text-tertiary" style={{ marginBottom: '2px' }}>
                        Week of {scores.week_of}
                    </div>
                    <div className="text-sm font-semibold">
                        {scores.headline}
                    </div>
                </div>
                {hasScore && (
                    <div className="text-center" style={{ marginLeft: 'var(--space-3)' }} role="img" aria-label={`Week score ${weekScore} out of 100, ${scoreWord}`}>
                        <div style={{
                            fontFamily: 'var(--font-heading)',
                            fontSize: 'var(--text-3xl)',
                            fontWeight: 800,
                            color: scoreColor,
                            transition: 'color 0.3s ease'
                        }}>
                            {weekScore}
                        </div>
                        <div className="text-xs text-tertiary">week score · {scoreWord}</div>
                    </div>
                )}
            </div>

            {wins.length > 0 && (
                <div className="mb-3">
                    <div className="text-xs font-semibold text-green mb-1">WINS</div>
                    {wins.map((w, i) => (
                        <div key={i} className="text-xs text-secondary" style={{ padding: '2px 0' }}>+ {w}</div>
                    ))}
                </div>
            )}

            {gaps.length > 0 && (
                <div className="mb-3">
                    <div className="text-xs font-semibold text-amber mb-1">PATTERNS TO EXPLORE</div>
                    {gaps.map((g, i) => (
                        <div key={i} className="text-xs text-secondary" style={{ padding: '2px 0' }}>{g}</div>
                    ))}
                </div>
            )}

            {connection && (
                <div className="p-2 rounded-md mb-3" style={{ background: 'var(--accent-teal-dim)' }}>
                    <div className="text-xs font-semibold" style={{ color: 'var(--accent-teal)', marginBottom: '2px' }}>CONNECTION NOTICED</div>
                    <div className="text-xs text-secondary">
                        {connection}
                    </div>
                </div>
            )}

            <p className="disclaimer m-0">
                Pattern observations only — not medical advice.
            </p>
        </div>
    );
}
