/**
 * Looks-first environment response inspired by EnvCalib zone drivers.
 * Maps ambient / solar / wind / humidity into shader-friendly uniforms.
 * Not radiometric truth — presentation-grade relative response.
 */

export const PRESETS = {
  coldClear: { ambient: 2, solar: 650, wind: 4.5, humidity: 35, blend: 0.7, palette: 1.25 },
  hotSunny: { ambient: 31, solar: 920, wind: 2.0, humidity: 42, blend: 0.45, palette: 1.35 },
  windyDamp: { ambient: 14, solar: 180, wind: 12, humidity: 78, blend: 0.8, palette: 1.05 },
};

/**
 * @param {{ ambient:number, solar:number, wind:number, humidity:number, blend:number, palette:number }} state
 */
export function computeEnvLook(state) {
  const tAmb = (state.ambient + 5) / 40; // ~0..1
  const solar = state.solar / 1000;
  const wind = state.wind / 18;
  const hum = state.humidity / 100;

  // Warm envelope when ambient+solar high; wind cools façades; humidity softens contrast.
  const facadeWarmth = clamp(0.25 + 0.55 * tAmb + 0.45 * solar - 0.35 * wind + 0.1 * tAmb * solar, 0, 1);
  const roofHeat = clamp(0.2 + 0.7 * solar + 0.2 * tAmb - 0.25 * wind, 0, 1);
  const glassCool = clamp(0.15 + 0.35 * (1 - solar) + 0.25 * wind + 0.15 * hum, 0, 1);
  const contrast = clamp(state.palette * (1.05 - 0.25 * hum + 0.1 * solar), 0.5, 2.0);
  const emissiveBoost = clamp(0.15 + 0.55 * facadeWarmth + 0.25 * state.blend, 0, 1.2);
  const sunElevation = clamp(8 + solar * 72 - wind * 6, 5, 82);
  const sunAzimuth = 210 + (tAmb - 0.5) * 40;
  const groundTint = 0.15 + 0.25 * (1 - solar) + 0.1 * hum;

  return {
    facadeWarmth,
    roofHeat,
    glassCool,
    contrast,
    emissiveBoost,
    sunElevation,
    sunAzimuth,
    groundTint,
    blend: state.blend,
    windRipple: wind,
  };
}

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}
