// SVG Chart rendering utilities

export function createDonutChart(segments, size = 120, strokeWidth = 12) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const center = size / 2;
    let offset = 0;

    const paths = segments.map(seg => {
        const dashLength = (seg.percent / 100) * circumference;
        const dashOffset = circumference - dashLength;
        const rotation = (offset / 100) * 360 - 90;
        offset += seg.percent;
        return `<circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${seg.color}" 
      stroke-width="${strokeWidth}" stroke-dasharray="${dashLength} ${circumference - dashLength}" 
      stroke-dashoffset="0" stroke-linecap="round"
      transform="rotate(${rotation} ${center} ${center})"
      style="transition: stroke-dasharray 1s ease"/>`;
    });

    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths.join('')}</svg>`;
}

export function createRingProgress(value, max = 100, size = 160, strokeWidth = 10, color = 'var(--accent-teal)') {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = ((max - value) / max) * circumference;
    const center = size / 2;

    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">
    <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="var(--bg-glass-heavy)" stroke-width="${strokeWidth}"/>
    <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" 
      stroke-dasharray="${circumference}" stroke-dashoffset="${progress}" stroke-linecap="round"
      style="transition: stroke-dashoffset 1.5s ease; --ring-circumference:${circumference};animation:ringProgress 1.5s ease forwards"/>
  </svg>`;
}

export function createLineChart(data, width = 300, height = 80, color = 'var(--accent-teal)') {
    if (!data.length) return '';
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const step = width / (data.length - 1);

    const points = data.map((v, i) => {
        const x = i * step;
        const y = height - ((v - min) / range) * (height - 10) - 5;
        return `${x},${y}`;
    }).join(' ');

    const areaPoints = `0,${height} ${points} ${width},${height}`;

    return `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <defs>
      <linearGradient id="lineGrad_${data.length}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${areaPoints}" fill="url(#lineGrad_${data.length})"/>
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      style="filter:drop-shadow(0 0 4px ${color})"/>
  </svg>`;
}

export function createBarChart(data, width = 300, height = 100) {
    if (!data.length) return '';
    const max = Math.max(...data.map(d => d.value)) || 1;
    const barWidth = Math.min(24, (width / data.length) - 8);
    const gap = (width - barWidth * data.length) / (data.length + 1);

    const bars = data.map((d, i) => {
        const barHeight = (d.value / max) * (height - 20);
        const x = gap + i * (barWidth + gap);
        const y = height - barHeight - 10;
        return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="${d.color || 'var(--accent-teal)'}" opacity="0.85"/>
    <text x="${x + barWidth / 2}" y="${height}" text-anchor="middle" fill="var(--text-tertiary)" font-size="9" font-family="var(--font-body)">${d.label}</text>`;
    }).join('');

    return `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${bars}</svg>`;
}

export function createRadarChart(data, size = 200) {
    const center = size / 2;
    const radius = size / 2 - 20;
    const count = data.length;
    const angleStep = (2 * Math.PI) / count;

    // Grid
    const gridLines = [0.25, 0.5, 0.75, 1].map(scale => {
        const pts = Array.from({ length: count }, (_, i) => {
            const angle = i * angleStep - Math.PI / 2;
            return `${center + Math.cos(angle) * radius * scale},${center + Math.sin(angle) * radius * scale}`;
        }).join(' ');
        return `<polygon points="${pts}" fill="none" stroke="var(--border-subtle)" stroke-width="1"/>`;
    }).join('');

    // Data polygon
    const dataPoints = data.map((d, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const r = (d.value / 100) * radius;
        return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
    }).join(' ');

    // Labels
    const labels = data.map((d, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const lx = center + Math.cos(angle) * (radius + 14);
        const ly = center + Math.sin(angle) * (radius + 14);
        return `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" fill="var(--text-secondary)" font-size="9" font-family="var(--font-body)">${d.label}</text>`;
    }).join('');

    return `<svg width="100%" height="${size}" viewBox="0 0 ${size} ${size}">
    ${gridLines}
    <polygon points="${dataPoints}" fill="var(--accent-teal-dim)" stroke="var(--accent-teal)" stroke-width="2" style="filter:drop-shadow(0 0 8px var(--accent-teal-dim))"/>
    ${labels}
  </svg>`;
}

export function createSparkline(data, width = 80, height = 24, color = 'var(--accent-teal)') {
    if (!data.length) return '';
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const step = width / (data.length - 1);
    const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ');
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/></svg>`;
}

export function createInteractiveTrendChart(data, width = 340, height = 120, color = 'var(--accent-teal)', containerId) {
    if (!data.length) return '';
    const max = Math.max(...data.map(d => d.value));
    const min = Math.min(...data.map(d => d.value));
    const range = max - min || 1;
    const step = width / (data.length - 1);

    const points = data.map((d, i) => {
        const x = i * step;
        const y = height - ((d.value - min) / range) * (height - 20) - 10;
        return { x, y, ...d };
    });

    const polyPoints = points.map(p => `${p.x},${p.y}`).join(' ');
    const areaPoints = `0,${height} ${polyPoints} ${width},${height}`;
    const id = containerId || `chart_${Date.now()}`;

    const dots = points.map((p, i) => `
        <circle cx="${p.x}" cy="${p.y}" r="3" fill="${color}" opacity="0"
            class="chart-dot" data-index="${i}"
            style="cursor:pointer;transition:opacity 0.2s;"/>
    `).join('');

    setTimeout(() => {
        const svg = document.getElementById(id);
        if (!svg) return;
        const tooltip = document.createElement('div');
        tooltip.style.cssText = 'position:fixed;background:var(--surface-3);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:11px;color:var(--text-primary);pointer-events:none;opacity:0;transition:opacity 0.15s;z-index:1000;';
        document.body.appendChild(tooltip);

        svg.querySelectorAll('.chart-dot').forEach((dot, i) => {
            dot.style.opacity = '0';
            dot.addEventListener('mouseenter', (e) => {
                dot.style.opacity = '1';
                dot.setAttribute('r', '5');
                tooltip.style.opacity = '1';
                tooltip.innerHTML = `<div style="font-weight:600;">${points[i].label || ''}</div><div style="color:var(--accent-teal);">${points[i].value}</div>`;
                tooltip.style.left = (e.clientX + 12) + 'px';
                tooltip.style.top = (e.clientY - 30) + 'px';
            });
            dot.addEventListener('mousemove', (e) => {
                tooltip.style.left = (e.clientX + 12) + 'px';
                tooltip.style.top = (e.clientY - 30) + 'px';
            });
            dot.addEventListener('mouseleave', () => {
                dot.style.opacity = '0';
                dot.setAttribute('r', '3');
                tooltip.style.opacity = '0';
            });
        });

        svg.addEventListener('mouseenter', () => {
            svg.querySelectorAll('.chart-dot').forEach(d => d.style.opacity = '0.4');
        });
        svg.addEventListener('mouseleave', () => {
            svg.querySelectorAll('.chart-dot').forEach(d => d.style.opacity = '0');
            tooltip.style.opacity = '0';
        });
    }, 100);

    return `<svg id="${id}" width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="cursor:crosshair;">
        <defs>
            <linearGradient id="grad_${id}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
                <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <polygon points="${areaPoints}" fill="url(#grad_${id})"/>
        <polyline points="${polyPoints}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}
    </svg>`;
}