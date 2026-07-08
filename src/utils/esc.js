// HTML-escape any value before interpolating it into an innerHTML string.
// Use for every user- or AI-controlled value (meal names, labels, notes,
// product/brand names, corrections) to prevent stored/prompt-injected XSS.
export function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
