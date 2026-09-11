// List cards for recent meals and product scans, plus their empty states.
import { icons } from '../../icons.js';
import { esc } from '../../utils/esc.js';
import { getScoreColor } from '../../utils/product-scanner.js';

// ─── Render helpers ───────────────────────────────────────────

function cleanMealName(name) {
  if (!name) return 'Meal';
  return name
    .split('&').slice(0, 3).map(part =>
      part
        .replace(/,.*$/, '')                                    // drop USDA technical descriptors after comma
        .replace(/\b(raw|cooked|frozen|canned|dried|NFS|NS|USDA|grade|includes?|skin|bone(less)?|fat)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .join(' & ')
    .replace(/^./, c => c.toUpperCase())
    .trim() || 'Meal';
}

export function renderMealCard(meal) {
  const time = meal.logged_at
    ? new Date(meal.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : meal.timestamp
      ? new Date(meal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
  const displayName = cleanMealName(meal.name);
  return `
    <div class="card card-sm">
      <div class="flex-between">
        <div class="flex items-center gap-3">
          <div class="rounded-md flex-center" style="width:36px;height:36px;background:var(--accent-teal-dim);font-size:18px;">${icons.leaf}</div>
          <div>
            <div class="font-semibold text-sm">${esc(displayName)}</div>
            <div class="text-tertiary text-xs">${time} • P:${Math.round(meal.protein || 0)}g C:${Math.round(meal.carbs || 0)}g F:${Math.round(meal.fat || 0)}g</div>
          </div>
        </div>
        <div class="font-heading font-bold" style="color:var(--accent-teal);">${Math.round(meal.calories || 0)}</div>
      </div>
    </div>
  `;
}

export function renderEmptyMeals() {
  return `
    <div class="card text-center" style="padding:var(--space-8);">
      <div class="mb-3 text-tertiary flex justify-center">${icons.leaf}</div>
      <h3 class="h4 mb-2">No meals logged yet</h3>
      <p class="text-sm">Scan your first meal to start tracking nutrition</p>
    </div>
  `;
}

function getScoreDimColor(score) {
  if (score >= 75) return 'var(--viz-green-dim)';
  if (score >= 50) return 'var(--viz-amber-dim)';
  return 'var(--error-dim)';
}

export function renderProductScanCard(scan) {
  const score = Number(scan.health_score ?? scan.score) || 0;
  const color = getScoreColor(score);
  return `
    <div class="card card-sm">
      <div class="flex-between">
        <div class="flex items-center gap-3">
          <div style="width:36px;height:36px;border-radius:var(--radius-md);background:${getScoreDimColor(score)};display:flex;align-items:center;justify-content:center;color:var(--text-secondary);">${icons.barcode}</div>
          <div>
            <div class="font-semibold text-sm">${esc(scan.name)}</div>
            <div class="text-tertiary text-xs">${esc(scan.brand || scan.barcode)}</div>
          </div>
        </div>
        <div class="text-center">
          <div style="font-family:var(--font-heading);font-weight:var(--weight-bold);color:${color};font-size:var(--text-lg);">${score}</div>
          <div class="text-tertiary text-xs">${esc(scan.rating)}</div>
        </div>
      </div>
    </div>
  `;
}

export function renderEmptyScans() {
  return `
    <div class="card text-center p-6">
      <div class="mb-2 text-tertiary flex justify-center">${icons.barcode}</div>
      <h3 class="h4 mb-1">No products scanned</h3>
      <p class="text-secondary text-sm">Scan a barcode or nutrition label to see results</p>
    </div>
  `;
}
