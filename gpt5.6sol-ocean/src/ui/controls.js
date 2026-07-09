import { ENVIRONMENT_PRESETS, PRESET_ORDER } from '../environment/presets.js';

const KEY_TO_PRESET = Object.freeze({
  1: PRESET_ORDER[0],
  2: PRESET_ORDER[1],
  3: PRESET_ORDER[2]
});

export function bindPresetControls({ root, keyboardTarget, onSelect, onStormToggle = () => {} }) {
  const buttons = Array.from(root.querySelectorAll('.preset-button[data-preset]'));
  const stormButton = root.querySelector('#storm-toggle');
  const currentLabel = root.querySelector('#current-preset');
  const removers = [];
  let stormEnabled = false;

  function setActive(id) {
    const preset = ENVIRONMENT_PRESETS[id];
    if (!preset) return;

    for (const button of buttons) {
      const active = button.dataset.preset === id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    if (currentLabel) {
      currentLabel.textContent = preset.label;
    }
  }

  function choose(id) {
    if (!ENVIRONMENT_PRESETS[id]) return;
    setActive(id);
    onSelect(id);
  }

  function setStormEnabled(enabled) {
    stormEnabled = Boolean(enabled);
    if (!stormButton) return;
    stormButton.classList.toggle('is-active', stormEnabled);
    stormButton.setAttribute('aria-pressed', String(stormEnabled));
  }

  function toggleStorm() {
    setStormEnabled(!stormEnabled);
    onStormToggle(stormEnabled);
  }

  for (const button of buttons) {
    const handler = () => choose(button.dataset.preset);
    button.addEventListener('click', handler);
    removers.push(() => button.removeEventListener('click', handler));
  }

  if (stormButton) {
    stormButton.addEventListener('click', toggleStorm);
    removers.push(() => stormButton.removeEventListener('click', toggleStorm));
  }

  const keyHandler = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    if (event.key.toLowerCase() === 's') {
      toggleStorm();
      return;
    }
    const id = KEY_TO_PRESET[event.key];
    if (id) choose(id);
  };
  keyboardTarget.addEventListener('keydown', keyHandler);
  removers.push(() => keyboardTarget.removeEventListener('keydown', keyHandler));

  return {
    setActive,
    setStormEnabled,
    destroy() {
      for (const remove of removers) remove();
    }
  };
}
