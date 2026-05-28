import { useState, useEffect } from 'react';

const API = window.API_BASE || '/api';

export default function WellnessScoreCard({ userId }) {
    const [scores, setScores] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${API}/weekly-report/latest?userId=${userId}`)
            .then(r => r.json())
            .then(({ reports }) => {
                if (reports?.length > 0) setScores(reports[0]);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [userId]);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-4)' }}>
            <div className="spinner" />
        </div>
    );

    if (!scores) return null;

    const scoreColor = scores.week_score >= 80
        ? 'var(--accent-green)'
        : scores.week_score >= 60
        ? 'var(--accent-amber)'
        : 'var(--accent-coral)';

    const wins = scores.wins || [];
    const gaps = scores.gaps || scores.report_data?.patterns_to_explore || [];

    return (
        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>
                        Week of {scores.week_of}
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>
                        {scores.headline}
                    </div>
                </div>
                <div style={{ textAlign: 'center', marginLeft: 'var(--space-3)' }}>
                    <div style={{
                        fontFamily: 'var(--font-heading)',
                        fontSize: 'var(--text-3xl)',
                        fontWeight: 800,
                        color: scoreColor,
                        transition: 'color 0.3s ease'
                    }}>
                        {scores.week_score}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>week score</div>
                </div>
            </div>

            {wins.length > 0 && (
                <div style={{ marginBottom: 'var(--space-3)' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--accent-green)', marginBottom: 'var(--space-1)' }}>WINS</div>
                    {wins.map((w, i) => (
                        <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', padding: '2px 0' }}>+ {w}</div>
                    ))}
                </div>
            )}

            {gaps.length > 0 && (
                <div style={{ marginBottom: 'var(--space-3)' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--accent-amber)', marginBottom: 'var(--space-1)' }}>PATTERNS TO EXPLORE</div>
                    {gaps.map((g, i) => (
                        <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', padding: '2px 0' }}>→ {g}</div>
                    ))}
                </div>
            )}

            {(scores.top_correlation || scores.report_data?.top_connection) && (
                <div style={{ padding: 'var(--space-2)', background: 'var(--accent-teal-dim)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--accent-teal)', marginBottom: '2px' }}>CONNECTION NOTICED</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                        {scores.top_correlation || scores.report_data?.top_connection}
                    </div>
                </div>
            )}

            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                Pattern observations only — not medical advice.
            </div>
        </div>
    );
}