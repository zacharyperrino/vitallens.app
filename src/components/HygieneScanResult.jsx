import { useState } from 'react';

export default function HygieneScanResult({ product, onLog }) {
    const [expanded, setExpanded] = useState(false);
    const [logged, setLogged] = useState(false);

    if (!product) return null;

    const score = Number(product.safetyScore) || 0;
    // Every colour below is paired with a text label, so meaning is never colour-only.
    const scoreColor = score >= 75 ? 'var(--viz-green)' : score >= 50 ? 'var(--viz-amber)' : 'var(--error)';
    const scoreLabel = score >= 75 ? 'Looks clean' : score >= 50 ? 'Some things to explore' : 'Worth reviewing';

    const concerns = Array.isArray(product.concerns) ? product.concerns : [];
    const highConcerns = concerns.filter(c => c.risk === 'high');
    const modConcerns = concerns.filter(c => c.risk === 'moderate');
    const lowConcerns = concerns.filter(c => c.risk === 'low');

    function ConcernBadge({ concern }) {
        const color = concern.risk === 'high' ? 'var(--error)' : concern.risk === 'moderate' ? 'var(--viz-amber)' : 'var(--text-tertiary)';
        const bg = concern.risk === 'high' ? 'var(--error-dim)' : concern.risk === 'moderate' ? 'var(--viz-amber-dim)' : 'var(--surface-2)';
        return (
            <div style={{ padding: 'var(--space-2)', background: bg, borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-1)' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color, marginBottom: '2px' }}>{concern.ingredient}</div>
                {concern.note && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{concern.note}</div>}
            </div>
        );
    }

    return (
        <div className="card" style={{ marginBottom: 'var(--space-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)' }}>{product.name}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{product.brand}</div>
                    {product.category && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>{product.category}</div>}
                </div>
                <div style={{ textAlign: 'center', marginLeft: 'var(--space-4)' }} role="img" aria-label={`Wellness score ${score} out of 100, ${scoreLabel}`}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-3xl)', fontWeight: 800, color: scoreColor }}>{score}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: scoreColor, fontWeight: 600 }}>{scoreLabel}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>wellness score</div>
                </div>
            </div>

            {concerns.length === 0 && (
                <div style={{ padding: 'var(--space-3)', background: 'var(--viz-green-dim)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--viz-green)' }}>No commonly flagged ingredients noticed.</div>
                </div>
            )}

            {highConcerns.length > 0 && (
                <div style={{ marginBottom: 'var(--space-3)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--error)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-2)' }}>Worth Reviewing</div>
                    {highConcerns.map((c, i) => <ConcernBadge key={i} concern={c} />)}
                </div>
            )}

            {modConcerns.length > 0 && (
                <div style={{ marginBottom: 'var(--space-3)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--viz-amber)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-2)' }}>Something to Explore</div>
                    {modConcerns.map((c, i) => <ConcernBadge key={i} concern={c} />)}
                </div>
            )}

            {lowConcerns.length > 0 && (
                <>
                    <button
                        type="button"
                        onClick={() => setExpanded(!expanded)}
                        aria-expanded={expanded}
                        aria-controls="hygiene-low-concerns"
                        style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 var(--space-2) 0' }}
                    >
                        <span aria-hidden="true">{expanded ? '▲' : '▼'} </span>
                        {expanded ? 'Hide' : 'Show'} {lowConcerns.length} low-concern ingredient{lowConcerns.length > 1 ? 's' : ''}
                    </button>
                    {expanded && (
                        <div id="hygiene-low-concerns">
                            {lowConcerns.map((c, i) => <ConcernBadge key={i} concern={c} />)}
                        </div>
                    )}
                </>
            )}

            <p className="disclaimer" style={{ marginBottom: 'var(--space-3)' }}>
                Pattern observations only — not medical advice.
            </p>

            <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => { setLogged(true); onLog?.(product); }}
                disabled={logged}
                style={{ opacity: logged ? 0.6 : 1 }}
            >
                {logged ? 'Logged' : 'Log This Product'}
            </button>
        </div>
    );
}
