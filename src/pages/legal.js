// ─── Legal document viewer ───────────────────────────────────
// Renders the committed markdown sources so the in-app text and the hosted
// docs never drift. Public route (no auth required).
import termsMd from '../../legal/terms-of-service.md?raw';
import privacyMd from '../../legal/privacy-policy.md?raw';

// Minimal, safe markdown → HTML (headings, bold, lists, paragraphs).
// Escapes first, so document text can never inject markup.
function mdToHtml(md) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = esc(md).split('\n');
    let html = '';
    let inList = false;
    const inline = s => s
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color:var(--accent);">$1</a>');
    for (const line of lines) {
        if (/^### /.test(line)) { if (inList) { html += '</ul>'; inList = false; } html += `<h3 class="mt-4">${inline(line.slice(4))}</h3>`; }
        else if (/^## /.test(line)) { if (inList) { html += '</ul>'; inList = false; } html += `<h2 style="margin-top:var(--space-5);">${inline(line.slice(3))}</h2>`; }
        else if (/^# /.test(line)) { html += `<h1>${inline(line.slice(2))}</h1>`; }
        else if (/^- /.test(line)) { if (!inList) { html += '<ul style="padding-left:1.2em;">'; inList = true; } html += `<li class="mb-1">${inline(line.slice(2))}</li>`; }
        else if (line.trim() === '') { if (inList) { html += '</ul>'; inList = false; } }
        else { if (inList) { html += '</ul>'; inList = false; } html += `<p style="margin-bottom:var(--space-2);line-height:1.6;">${inline(line)}</p>`; }
    }
    if (inList) html += '</ul>';
    return html;
}

export function renderLegal(doc) {
    const content = document.getElementById('page-content');
    const md = doc === 'terms' ? termsMd : privacyMd;
    content.innerHTML = `
    <div style="max-width:720px;margin:0 auto;padding:var(--space-6);">
      <a href="#/" style="color:var(--accent);font-size:var(--text-sm);text-decoration:none;">← Back</a>
      <div class="card" style="margin-top:var(--space-3);font-size:var(--text-sm);color:var(--text-primary);">
        ${mdToHtml(md)}
      </div>
    </div>`;
}

export const renderTerms = () => renderLegal('terms');
export const renderPrivacy = () => renderLegal('privacy');
