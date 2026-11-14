import { PRESETS } from '../scene/envResponse.js';

/**
 * Wire HUD sliders to the campus scene controller.
 * @param {{ applyState: Function, getState: Function }} sceneApi
 */
export function bindHud(sceneApi) {
  const ids = ['blend', 'palette', 'ambient', 'solar', 'wind', 'humidity'];
  const inputs = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  const labels = {
    blend: document.getElementById('v-blend'),
    palette: document.getElementById('v-palette'),
    ambient: document.getElementById('v-ambient'),
    solar: document.getElementById('v-solar'),
    wind: document.getElementById('v-wind'),
    humidity: document.getElementById('v-humidity'),
  };
  const status = document.getElementById('statusChip');

  function read() {
    return {
      blend: num(inputs.blend),
      palette: num(inputs.palette),
      ambient: num(inputs.ambient),
      solar: num(inputs.solar),
      wind: num(inputs.wind),
      humidity: num(inputs.humidity),
    };
  }

  function writeLabels(state) {
    labels.blend.textContent = state.blend.toFixed(2);
    labels.palette.textContent = state.palette.toFixed(2);
    labels.ambient.textContent = String(state.ambient);
    labels.solar.textContent = String(Math.round(state.solar));
    labels.wind.textContent = state.wind.toFixed(1);
    labels.humidity.textContent = String(Math.round(state.humidity));
  }

  function syncFromInputs() {
    const state = read();
    writeLabels(state);
    sceneApi.applyState(state);
    status.textContent = state.blend > 0.6 ? 'THERMAL' : state.blend < 0.3 ? 'RGB LOOK' : 'BLEND';
  }

  for (const id of ids) {
    inputs[id].addEventListener('input', syncFromInputs);
  }

  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-preset');
      const preset = PRESETS[key];
      if (!preset) return;
      for (const [k, v] of Object.entries(preset)) {
        if (inputs[k]) inputs[k].value = String(v);
      }
      syncFromInputs();
      status.textContent = key.replace(/[A-Z]/, (m) => ` ${m}`).toUpperCase();
    });
  });

  syncFromInputs();
}

function num(el) {
  return Number(el.value);
}
