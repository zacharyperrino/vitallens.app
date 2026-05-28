import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

const roots = new Map();

export function mountReact(Component, containerId, props = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Unmount existing root if present
    if (roots.has(containerId)) {
        roots.get(containerId).unmount();
    }

    const root = createRoot(container);
    root.render(createElement(Component, props));
    roots.set(containerId, root);
}

export function unmountReact(containerId) {
    if (roots.has(containerId)) {
        roots.get(containerId).unmount();
        roots.delete(containerId);
    }
}