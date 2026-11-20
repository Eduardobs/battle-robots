import { pilots } from '../catalog.js';
import { decimalSeparator, t } from '../i18n.js';
import { formatHP, hpAmount, timecode } from '../ui/format.js';

const events = document.getElementById('events');
const region = document.getElementById('event-scroll');
const older = document.getElementById('older-events');
const newer = document.getElementById('newer-events');
const MAX_EVENT_ROWS = 160;
const history = [];
let firstRetained = 0;
let anchor = null;
let visibleStart = 0;
let visibleEnd = 0;
let dirty = false;

function createEventRow({ time, robot, action, item, damage }) {
  const row = document.createElement('li');
  const pilot = pilots[robot];
  const cells = [
    ['event-time', timecode(time) + decimalSeparator + String(Math.floor((time % 1) * 100)).padStart(2, '0')],
    [pilot?.className ?? '', pilot ? t(pilot.nameKey) : t('arena')],
    ['event-action', t(action, item ? { item: t(item) } : {})],
    ['event-damage', damage === null ? '—' : hpAmount(`−${formatHP(damage)}`)],
  ];
  for (const [className, value] of cells) {
    const cell = document.createElement('span');
    cell.className = className;
    cell.textContent = value;
    row.append(cell);
  }
  return row;
}

function renderPage() {
  const total = firstRetained + history.length;
  // Each row is at least 40px tall. Measure wrapped text before choosing the page boundary.
  const capacity = Math.max(1, Math.ceil(region.clientHeight / 40));
  const backward = !anchor || anchor.edge === 'end';
  const boundary = Math.max(firstRetained, Math.min(anchor?.index ?? total - 1, total - 1));
  visibleStart = backward ? Math.max(firstRetained, boundary - capacity + 1) : boundary;
  visibleEnd = backward ? boundary : Math.min(total - 1, boundary + capacity - 1);
  const entries = history.slice(visibleStart - firstRetained, visibleEnd - firstRetained + 1);
  const rows = entries.map(entry => entry.row ??= createEventRow(entry.event));
  events.replaceChildren(...rows);
  const available = region.getBoundingClientRect().height - region.querySelector('.event-columns').getBoundingClientRect().height;
  const heights = rows.map(row => row.getBoundingClientRect().height);
  let used = 0;
  for (let i = 0; i < heights.length; i++) {
    used += heights[backward ? heights.length - 1 - i : i];
    if (i === 0 || used <= available) continue;
    if (backward) {
      rows.slice(0, heights.length - i).forEach(row => row.remove());
      visibleStart = visibleEnd - i + 1;
    } else {
      rows.slice(i).forEach(row => row.remove());
      visibleEnd = visibleStart + i - 1;
    }
    break;
  }
  if (visibleEnd === total - 1) anchor = null;
  document.getElementById('event-range').textContent = rows.length ? t('eventRange', {
    first: visibleStart + 1, last: visibleEnd + 1, total,
  }) : '';
  older.disabled = !rows.length || visibleStart === firstRetained;
  newer.disabled = !rows.length || visibleEnd === total - 1;
}

older.addEventListener('click', () => {
  anchor = { edge: 'end', index: visibleStart - 1 };
  renderPage();
});
newer.addEventListener('click', () => {
  anchor = { edge: 'start', index: visibleEnd + 1 };
  renderPage();
});

new ResizeObserver(() => {
  if (region.clientHeight) renderPage();
}).observe(region);

export function queueEvent(event) {
  if (event.action === 'event.move' || event.action === 'event.hold') return;
  history.push({ event, row: null });
  dirty = true;
}

export function flushEvents() {
  if (!dirty) return;
  dirty = false;
  const excess = history.length - MAX_EVENT_ROWS;
  if (excess > 0) {
    history.splice(0, excess);
    firstRetained += excess;
  }
  renderPage();
}

export function clearEvents() {
  history.length = 0;
  firstRetained = 0;
  anchor = null;
  dirty = false;
  renderPage();
}

export function translateEvents() {
  for (const entry of history) entry.row = null;
  renderPage();
}
