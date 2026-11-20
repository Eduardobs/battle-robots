import { pilots } from '../catalog.js';
import { decimalSeparator, t } from '../i18n.js';
import { formatHP, hpAmount, timecode } from '../ui/format.js';

const events = document.getElementById('events');
const eventScroll = document.getElementById('event-scroll');
const MAX_EVENT_ROWS = 160;
const eventRows = [];
const pendingEvents = [];

function updateEvent(row, { time, robot, action, item, damage }) {
  const values = [
    `${timecode(time)}${decimalSeparator}${String(Math.floor((time % 1) * 100)).padStart(2, '0')}`,
    robot === null ? t('arena') : pilots[robot].name,
    t(action, item ? { item: t(item) } : {}),
    damage === null ? '—' : hpAmount(`−${formatHP(damage)}`),
  ];
  values.forEach((value, index) => { row.children[index].textContent = value; });
}

function createEventRow(event) {
  const row = document.createElement('li');
  for (const className of ['event-time', pilots[event.robot]?.className ?? '', 'event-action', 'event-damage']) {
    const cell = document.createElement('span');
    cell.className = className;
    row.append(cell);
  }
  updateEvent(row, event);
  return row;
}

export function queueEvent(event) {
  if (event.action === 'event.move' || event.action === 'event.hold') return;
  pendingEvents.push(event);
}

export function flushEvents() {
  if (!pendingEvents.length) return;
  const follow = eventScroll.scrollTop + eventScroll.clientHeight >= eventScroll.scrollHeight - 24;
  const overflow = eventRows.length + pendingEvents.length - MAX_EVENT_ROWS;
  if (overflow > 0) {
    for (const { row } of eventRows.splice(0, overflow)) row.remove();
  }
  const batch = document.createDocumentFragment();
  for (let index = Math.max(0, pendingEvents.length - MAX_EVENT_ROWS); index < pendingEvents.length; index++) {
    const event = pendingEvents[index];
    const row = createEventRow(event);
    eventRows.push({ row, event });
    batch.append(row);
  }
  pendingEvents.length = 0;
  events.append(batch);
  if (follow) eventScroll.scrollTop = eventScroll.scrollHeight;
}

export function clearEvents() {
  pendingEvents.length = 0;
  eventRows.length = 0;
  events.replaceChildren();
}

export function translateEvents() {
  eventRows.forEach(({ row, event }) => updateEvent(row, event));
}
