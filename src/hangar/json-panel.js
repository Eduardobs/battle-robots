import { pilots } from '../catalog.js';
import { t } from '../i18n.js';
import { configuration, validateConfiguration } from './loadouts.js';

export function bindConfiguration(bay, id, loadout, onApply) {
  const panel = bay.querySelector('.loadout-json');
  const input = panel.querySelector('textarea');
  const fileInput = panel.querySelector('input');
  const status = key => {
    const message = panel.querySelector('.json-status');
    message.dataset.message = key;
    message.textContent = t(key);
  };
  const json = () => JSON.stringify(configuration(loadout), null, 2);
  let importRequest = 0;

  function apply(source) {
    if (loadout.ready) return;
    let config;
    try {
      config = validateConfiguration(JSON.parse(source));
    } catch {
      // Invalid JSON leaves the current configuration intact.
    }
    if (!config) {
      status('invalidJson');
      return;
    }
    Object.assign(loadout, config);
    onApply();
    input.value = json();
    status('loadedJson');
  }

  panel.querySelector('[data-json="download"]').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([json()], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `robot-${t(pilots[id].nameKey).toLowerCase()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  panel.querySelector('[data-json="copy"]').addEventListener('click', async () => {
    const source = json();
    try {
      await navigator.clipboard.writeText(source);
      status('copiedJson');
    } catch {
      input.value = source;
      input.focus();
      input.select();
      status('manualCopyJson');
    }
  });
  panel.querySelector('[data-json="apply"]').addEventListener('click', () => {
    importRequest++;
    apply(input.value);
  });
  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files;
    if (!file) return;
    fileInput.value = '';
    const request = ++importRequest;
    try {
      const source = await file.text();
      if (request === importRequest && panel.isConnected) apply(source);
    } catch {
      if (request === importRequest) status('invalidJson');
    }
  });
}
