// ─── Tablist keyboard support ─────────────────────────────────
// WAI-ARIA tabs pattern: roving tabindex + ArrowLeft/ArrowRight/Home/End.
// `tablistEl` contains the [role="tab"] buttons (marked with .active and
// aria-selected). `onSelect(tab)` runs whenever a tab is selected by click
// or keyboard. Returns the `select(tab)` function for programmatic use.

export function initTablist(tablistEl, onSelect) {
  if (!tablistEl) return () => {};
  const tabs = () => Array.from(tablistEl.querySelectorAll('[role="tab"]'));

  function select(tab, focus = false) {
    tabs().forEach((t) => {
      const on = t === tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    if (focus) tab.focus();
    tab.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    onSelect?.(tab);
  }

  // Only the selected tab sits in the page tab order.
  const all = tabs();
  const current = all.find((t) => t.getAttribute('aria-selected') === 'true') || all[0];
  all.forEach((t) => { t.tabIndex = t === current ? 0 : -1; });

  tablistEl.addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab && tablistEl.contains(tab)) select(tab);
  });

  tablistEl.addEventListener('keydown', (e) => {
    const list = tabs();
    const i = list.indexOf(document.activeElement);
    if (i === -1) return;
    let next = null;
    if (e.key === 'ArrowRight') next = list[(i + 1) % list.length];
    else if (e.key === 'ArrowLeft') next = list[(i - 1 + list.length) % list.length];
    else if (e.key === 'Home') next = list[0];
    else if (e.key === 'End') next = list[list.length - 1];
    if (next) { e.preventDefault(); select(next, true); }
  });

  return select;
}
