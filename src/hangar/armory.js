import { equipmentCatalogs, pilots } from '../catalog.js';
import { numberFormat, t } from '../i18n.js';
import { spriteUrl } from '../ui/equipment-art.js';
import { icon } from '../ui/icons.js';

const dialog = document.getElementById('armory');
const slots = document.getElementById('armory-slots');
const items = document.getElementById('armory-items');
let activeField;
let fields = [];

function slotName(field) {
  return field.labels[0].textContent;
}

function renderCatalog() {
  const { kind } = activeField.dataset;
  for (const button of slots.children) {
    button.setAttribute('aria-pressed', String(button.dataset.field === activeField.id));
  }
  items.innerHTML = [...activeField.options].map(option => {
    const key = option.value;
    const equipped = key === activeField.value;
    const data = equipmentCatalogs[kind][key];
    const stat = kind === 'guns'
      ? t('catalogDamage', { value: numberFormat.format(data.damage) })
      : t('catalogCooldown', { value: numberFormat.format(data.cooldown) });
    return `<button class="part-card" type="button" data-key="${key}" aria-pressed="${equipped}" ${option.disabled ? 'disabled' : ''}>
      <span class="part-image"><img src="${spriteUrl(key, 'hangar')}" width="96" height="96" alt="">
        ${equipped ? icon('check') : ''}
      </span>
      <strong>${option.textContent}</strong><span>${t(`${kind}.${key}.description`)}</span>
      <small>${option.disabled ? t('otherSlot') : equipped ? t('equipped') : stat}</small>
    </button>`;
  }).join('');
}

export function openArmory(bay, select, id) {
  if (!select || select.matches(':disabled')) return;
  activeField = select;
  fields = [...bay.querySelectorAll('select[data-kind="guns"], select[data-kind="utils"]')];
  dialog.className = pilots[id].className;
  document.getElementById('armory-title').textContent = t('armory');
  document.getElementById('armory-context').textContent = t(pilots[id].nameKey) + ' / ' + t('equipment');
  slots.innerHTML = fields.map(field =>
    `<button type="button" data-field="${field.id}">${slotName(field)}</button>`).join('');
  renderCatalog();
  dialog.showModal();
  slots.querySelector('[aria-pressed="true"]').focus();
}

slots.addEventListener('click', event => {
  const button = event.target.closest('[data-field]');
  if (!button) return;
  activeField = fields.find(field => field.id === button.dataset.field);
  renderCatalog();
});

items.addEventListener('click', event => {
  const card = event.target.closest('[data-key]');
  if (!card || card.disabled || activeField.matches(':disabled')) return;
  const group = activeField.closest('.equipment-group');
  for (const field of group.querySelectorAll('.equipment')) {
    field.hidden = !field.contains(activeField);
  }
  activeField.value = card.dataset.key;
  activeField.dispatchEvent(new Event('change'));
  dialog.close();
  group.querySelector('.equipment:not([hidden]) .browse-parts').focus();
});

dialog.querySelector('[data-close-armory]').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }
});
