import * as THREE from 'three';

const thermalVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const thermalFrag = /* glsl */ `
  uniform sampler2D mapRgb;
  uniform sampler2D mapThermal;
  uniform float uBlend;
  uniform float uContrast;
  uniform float uWarmth;
  uniform float uRoofHeat;
  uniform float uGlassCool;
  uniform float uEmissive;
  uniform float uHasRgb;
  uniform float uTime;
  uniform float uWind;
  uniform vec3 uAccentCold;
  uniform vec3 uAccentHot;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  void main() {
    vec2 uv = vUv;
    // Subtle wind shimmer on thermal layer
    uv += vec2(sin(vPosW.y * 0.35 + uTime * (0.4 + uWind)) * 0.002 * uWind, 0.0);

    vec3 rgb = texture2D(mapRgb, vUv).rgb;
    vec3 th = texture2D(mapThermal, uv).rgb;

    float up = clamp(vNormalW.y, 0.0, 1.0);
    float side = 1.0 - up;
    float glassBand = smoothstep(0.12, 0.22, fract(vPosW.y * 0.22)) *
                      (1.0 - smoothstep(0.55, 0.78, fract(vPosW.y * 0.22)));

    // Zone-ish response: roof heats with solar, glass stays cooler, walls follow warmth
    float zone = side * mix(uWarmth, uGlassCool, glassBand) + up * uRoofHeat;
    th = mix(th, mix(uAccentCold, uAccentHot, zone), 0.28);
    th = (th - 0.5) * uContrast + 0.5 + zone * 0.12;

    vec3 base = mix(rgb, th, mix(uBlend, min(1.0, uBlend + 0.25), 1.0 - uHasRgb));
    // When no RGB, keep a cool shell under the IR
    if (uHasRgb < 0.5) {
      vec3 shell = vec3(0.08, 0.12, 0.16) + vec3(0.05) * side;
      base = mix(shell, th, clamp(uBlend * 0.95 + 0.2, 0.0, 1.0));
    }

    float rim = pow(1.0 - abs(dot(normalize(vNormalW), vec3(0.0, 0.15, 1.0))), 2.0);
    vec3 glow = mix(uAccentCold, uAccentHot, zone) * (0.08 + uEmissive * 0.35) * (0.35 + rim);

    vec3 color = base + glow;
    color += glassBand * side * vec3(0.05, 0.1, 0.12) * (1.0 - uBlend * 0.5);

    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * Create a dual-texture thermal material. Falls back when RGB missing.
 * @param {THREE.Texture|null} rgb
 * @param {THREE.Texture} thermal
 * @param {{ hasRgb?: boolean }} opts
 */
export function createThermalMaterial(rgb, thermal, opts = {}) {
  const hasRgb = opts.hasRgb ?? Boolean(rgb);
  const fallback = rgb || thermal;

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      mapRgb: { value: fallback },
      mapThermal: { value: thermal },
      uBlend: { value: 0.55 },
      uContrast: { value: 1.15 },
      uWarmth: { value: 0.45 },
      uRoofHeat: { value: 0.4 },
      uGlassCool: { value: 0.35 },
      uEmissive: { value: 0.4 },
      uHasRgb: { value: hasRgb ? 1 : 0 },
      uTime: { value: 0 },
      uWind: { value: 0.2 },
      uAccentCold: { value: new THREE.Color('#1ec8d4') },
      uAccentHot: { value: new THREE.Color('#ff5a36') },
    },
    vertexShader: thermalVert,
    fragmentShader: thermalFrag,
  });

  mat.userData.isThermal = true;
  return mat;
}

/**
 * @param {THREE.Material} mat
 * @param {import('./envResponse.js').computeEnvLook extends Function ? any : any} look
 */
export function applyEnvToMaterial(mat, look) {
  if (!mat?.uniforms) return;
  const u = mat.uniforms;
  if (u.uBlend) u.uBlend.value = look.blend;
  if (u.uContrast) u.uContrast.value = look.contrast;
  if (u.uWarmth) u.uWarmth.value = look.facadeWarmth;
  if (u.uRoofHeat) u.uRoofHeat.value = look.roofHeat;
  if (u.uGlassCool) u.uGlassCool.value = look.glassCool;
  if (u.uEmissive) u.uEmissive.value = look.emissiveBoost;
  if (u.uWind) u.uWind.value = look.windRipple;
}

export function tickMaterials(mats, time) {
  for (const mat of mats) {
    if (mat?.uniforms?.uTime) mat.uniforms.uTime.value = time;
  }
}
