// SVG Chart rendering utilities
//
// Every chart is emitted as an <svg role="img"> with an aria-label. Callers
// can pass a trailing `opts` object with `label` to describe the chart in
// their own words; otherwise a generic, data-derived description is used.
// All positional signatures are unchanged for existing call sites.
import { esc } from './esc.js';

function a11y(opts, fallback) {
    const label = (opts && typeof opts.label === 'string' && opts.label.trim()) ? opts.label.trim() : fallback;
    return `role="img" aria-label="${esc(label)}"`;
}

function fmt(v) {
    return Number.isFinite(Number(v)) ? String(Math.round(Number(v) * 100) / 100) : String(v ?? '');
}

export function createDonutChart(segments, size = 120, strokeWidth = 12, opts = {}) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const center = size / 2;
    let offset = 0;

    const paths = segments.map(seg => {
        const dashLength = (seg.percent / 100) * circumference;
        const rotation = (offset / 100) * 360 - 90;
        offset += seg.percent;
        return `<circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${esc(seg.color)}"
      stroke-width="${strokeWidth}" stroke-dasharray="${dashLength} ${circumference - dashLength}"
      stroke-dashoffset="0" stroke-linecap="round"
      transform="rotate(${rotation} ${center} ${center})"
      style="transition: stroke-dasharray 1s ease"/>`;
    });

    const summary = segments.map(s => `${s.label ? s.label + ' ' : ''}${fmt(s.percent)}%`).join(', ');
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" ${a11y(opts, `Breakdown: ${summary}`)}>${paths.join('')}</svg>`;
}

export function createRingProgress(value, max = 100, size = 160, strokeWidth = 10, color = 'var(--viz-green)', opts = {}) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const safeMax = max || 1;
    const progress = ((safeMax - value) / safeMax) * circumference;
    const center = size / 2;

    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)" ${a11y(opts, `Progress: ${fmt(value)} of ${fmt(max)}`)}>
    <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="var(--bg-glass-heavy)" stroke-width="${strokeWidth}"/>
    <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${esc(color)}" stroke-width="${strokeWidth}"
      stroke-dasharray="${circumference}" stroke-dashoffset="${progress}" stroke-linecap="round"
      style="transition: stroke-dashoffset 1.5s ease; --ring-circumference:${circumference};animation:ringProgress 1.5s ease forwards"/>
  </svg>`;
}

export function createLineChart(data, width = 300, height = 80, color = 'var(--viz-green)', opts = {}) {
    if (!data.length) return '';
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const step = data.length > 1 ? width / (data.length - 1) : 0;

    const points = data.map((v, i) => {
        const x = data.length > 1 ? i * step : width / 2;
        const y = height - ((v - min) / range) * (height - 10) - 5;
        return `${x},${y}`;
    }).join(' ');

    const areaPoints = `0,${height} ${points} ${width},${height}`;
    const gradId = `lineGrad_${data.length}_${Math.round(min)}_${Math.round(max)}`;

    return `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" ${a11y(opts, `Trend of ${data.length} values, from ${fmt(min)} to ${fmt(max)}`)}>
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${esc(color)}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${esc(color)}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${areaPoints}" fill="url(#${gradId})"/>
    <polyline points="${points}" fill="none" stroke="${esc(color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

export function createBarChart(data, width = 300, height = 100, opts = {}) {
    if (!data.length) return '';
    const max = Math.max(...data.map(d => d.value)) || 1;
    const barWidth = Math.min(24, (width / data.length) - 8);
    const gap = (width - barWidth * data.length) / (data.length + 1);

    const bars = data.map((d, i) => {
        const barHeight = (d.value / max) * (height - 20);
        const x = gap + i * (barWidth + gap);
        const y = height - barHeight - 10;
        return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="${esc(d.color || 'var(--viz-green)')}" opacity="0.85"/>
    <text x="${x + barWidth / 2}" y="${height}" text-anchor="middle" fill="var(--text-tertiary)" font-size="11" font-family="var(--font-body)">${esc(d.label)}</text>`;
    }).join('');

    const summary = data.map(d => `${d.label ?? ''} ${fmt(d.value)}`.trim()).join(', ');
    return `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" ${a11y(opts, `Bar chart: ${summary}`)}>${bars}</svg>`;
}

// ── Shared tooltip (one element for every interactive chart on the page) ──
let tooltipEl = null;
function getTooltip() {
    if (tooltipEl && document.body.contains(tooltipEl)) return tooltipEl;
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'chart-tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.setAttribute('aria-hidden', 'true');
    tooltipEl.style.cssText = 'position:fixed;background:var(--surface-3);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:var(--text-xs);color:var(--text-primary);pointer-events:none;opacity:0;transition:opacity 0.15s;z-index:1000;';
    document.body.appendChild(tooltipEl);
    return tooltipEl;
}

function showTooltipFor(dot, label, value) {
    const tip = getTooltip();
    tip.innerHTML = `<div style="font-weight:600;">${esc(label)}</div><div style="color:var(--viz-green);">${esc(value)}</div>`;
    const rect = dot.getBoundingClientRect();
    tip.style.opacity = '1';
    // Position next to the point (works for mouse, keyboard focus and touch alike),
    // then keep it inside the viewport.
    const tipW = tip.offsetWidth || 80;
    const tipH = tip.offsetHeight || 36;
    let left = rect.left + rect.width / 2 + 12;
    let top = rect.top - tipH - 6;
    if (left + tipW > window.innerWidth - 8) left = rect.left - tipW - 12;
    if (left < 8) left = 8;
    if (top < 8) top = rect.bottom + 6;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
}

function hideTooltip() {
    if (tooltipEl) tooltipEl.style.opacity = '0';
}

export function createInteractiveTrendChart(data, width = 340, height = 120, color = 'var(--viz-green)', containerId, opts = {}) {
    if (!data.length) return '';
    const max = Math.max(...data.map(d => d.value));
    const min = Math.min(...data.map(d => d.value));
    const range = max - min || 1;
    const step = data.length > 1 ? width / (data.length - 1) : 0;

    const points = data.map((d, i) => {
        const x = data.length > 1 ? i * step : width / 2;
        const y = height - ((d.value - min) / range) * (height - 20) - 10;
        return { x, y, ...d };
    });

    const polyPoints = points.map(p => `${p.x},${p.y}`).join(' ');
    const areaPoints = `0,${height} ${polyPoints} ${width},${height}`;
    const id = String(containerId || `chart_${Date.now()}_${Math.floor(Math.random() * 1e6)}`).replace(/[^A-Za-z0-9_-]/g, '_');
    const unit = opts.unit ? ` ${opts.unit}` : '';

    // Each point is focusable so keyboard users can reach the tooltip; the
    // transparent stroke widens the hit area for touch.
    const dots = points.map((p, i) => `
        <circle cx="${p.x}" cy="${p.y}" r="3" fill="${esc(color)}" opacity="0"
            stroke="transparent" stroke-width="16"
            class="chart-dot" data-index="${i}" tabindex="0" role="img"
            aria-label="${esc(p.label || `Point ${i + 1}`)}: ${esc(fmt(p.value))}${esc(unit)}"
            style="cursor:pointer;transition:opacity 0.2s;outline-offset:2px;"/>
    `).join('');

    setTimeout(() => {
        const svg = document.getElementById(id);
        if (!svg || svg.dataset.bound === '1') return;
        svg.dataset.bound = '1';

        const dotEls = svg.querySelectorAll('.chart-dot');
        const activate = (dot, i) => {
            dot.style.opacity = '1';
            dot.setAttribute('r', '5');
            showTooltipFor(dot, points[i].label || '', `${fmt(points[i].value)}${unit}`);
        };
        const deactivate = (dot) => {
            dot.style.opacity = svg.matches(':hover') ? '0.4' : '0';
            dot.setAttribute('r', '3');
            hideTooltip();
        };

        dotEls.forEach((dot, i) => {
            dot.style.opacity = '0';
            dot.addEventListener('pointerenter', () => activate(dot, i));
            dot.addEventListener('pointerleave', () => { if (document.activeElement !== dot) deactivate(dot); });
            dot.addEventListener('focus', () => activate(dot, i));
            dot.addEventListener('blur', () => deactivate(dot));
            // Touch: a tap focuses the point, which shows the tooltip until focus moves on.
            dot.addEventListener('click', (e) => { e.preventDefault(); dot.focus(); activate(dot, i); });
        });

        svg.addEventListener('pointerenter', () => {
            dotEls.forEach(d => { if (document.activeElement !== d) d.style.opacity = '0.4'; });
        });
        svg.addEventListener('pointerleave', () => {
            dotEls.forEach(d => { if (document.activeElement !== d) d.style.opacity = '0'; });
            if (!svg.contains(document.activeElement)) hideTooltip();
        });
    }, 100);

    const summary = points.map(p => `${p.label ?? ''} ${fmt(p.value)}${unit}`.trim()).join(', ');
    const tableRows = points.map(p => `<tr><th scope="row">${esc(p.label ?? '')}</th><td>${esc(fmt(p.value))}${esc(unit)}</td></tr>`).join('');

    return `<svg id="${id}" width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="cursor:crosshair;overflow:visible;" ${a11y(opts, `Trend: ${summary}`)}>
        <defs>
            <linearGradient id="grad_${id}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${esc(color)}" stop-opacity="0.3"/>
                <stop offset="100%" stop-color="${esc(color)}" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <polygon points="${areaPoints}" fill="url(#grad_${id})"/>
        <polyline points="${polyPoints}" fill="none" stroke="${esc(color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}
    </svg>
    <table class="visually-hidden"><caption>${esc(opts.label || 'Chart data')}</caption><tbody>${tableRows}</tbody></table>`;
}
