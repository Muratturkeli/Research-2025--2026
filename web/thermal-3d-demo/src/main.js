import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
// Keep tiles renderer in the public bundle even when the key is empty at build time.
import { TilesRenderer } from '3d-tiles-renderer/three';
import {
  GoogleCloudAuthPlugin,
  ReorientationPlugin,
  GLTFExtensionsPlugin,
  TilesFadePlugin,
  TileCompressionPlugin,
} from '3d-tiles-renderer/plugins';

const canvas = document.getElementById('c');
const loading = document.getElementById('loading');
const prov = document.getElementById('prov');
const subtitle = document.getElementById('subtitle');
const modeBadge = document.getElementById('modeBadge');
const mapsAttrib = document.getElementById('mapsAttrib');
const tileCredits = document.getElementById('tileCredits');

const API_KEY = typeof __GOOGLE_MAPS_API_KEY__ !== 'undefined' ? String(__GOOGLE_MAPS_API_KEY__) : '';
const HAS_KEY = API_KEY.length > 8;

const CORE_LAT = 40.52137;
const CORE_LON = -74.46135;
const CORE_HEIGHT_M = 25; // approx orthometric ground near building

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor(0xd0d6dc, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 5_000_000);
// Three-quarter framing matching Google Maps refs (SE → NW)
camera.position.set(145, 95, 155);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 22, 0);
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 25;
controls.maxDistance = 900;
controls.update();

scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 0.45);
sun.position.set(120, 180, 60);
scene.add(sun);

let tiles = null;
let lidarPoints = null;
let photoPoints = null;
let thermalPoints = null;
let usingGoogle = false;
let roundPointMat = null;

/** Soft round points + mild size attenuation (Potree-ish without full EDL pass). */
function makeRoundPoints(xyz, rgb, size = 1.0, opacity = 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(xyz, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  const mat = new THREE.PointsMaterial({
    size,
    vertexColors: true,
    sizeAttenuation: true,
    transparent: opacity < 0.999,
    opacity,
    depthWrite: opacity > 0.95,
    map: discTexture(),
    alphaTest: 0.15,
  });
  roundPointMat = mat;
  return new THREE.Points(geo, mat);
}

let _disc = null;
function discTexture() {
  if (_disc) return _disc;
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  _disc = new THREE.CanvasTexture(c);
  _disc.colorSpace = THREE.SRGBColorSpace;
  return _disc;
}

async function loadBin(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function loadPreviewPoints(url) {
  const raw = await loadBin(url);
  const n = new DataView(raw.buffer, raw.byteOffset, 4).getUint32(0, true);
  const xyz = new Float32Array(raw.buffer, raw.byteOffset + 4, n * 3);
  const rgbBytes = new Uint8Array(raw.buffer, raw.byteOffset + 4 + n * 12, n * 3);
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) rgb[i] = rgbBytes[i] / 255;
  // Local ENU (X east, Y north, Z up) → Three.js Y-up (X east, Y up, Z south)
  const xyzYup = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    xyzYup[i * 3] = xyz[i * 3];
    xyzYup[i * 3 + 1] = xyz[i * 3 + 2];
    xyzYup[i * 3 + 2] = -xyz[i * 3 + 1];
  }
  return { n, xyzYup, rgb };
}

function updateScaleBar() {
  const el = document.getElementById('scale');
  const bar = el.querySelector('i');
  const dist = camera.position.distanceTo(controls.target);
  const worldPerPixel = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist) / innerHeight;
  const px = 50 / worldPerPixel;
  bar.style.width = `${Math.max(24, Math.min(160, px))}px`;
}

function setModeUI(google, reason = '') {
  usingGoogle = google;
  if (google) {
    modeBadge.textContent = 'Google Photorealistic 3D Tiles';
    subtitle.textContent = 'Rutgers Busch Campus · Google Maps–style base + thermal';
  } else if (reason === 'forbidden_403') {
    modeBadge.textContent = 'Fallback · Map Tiles API blocked (403)';
    subtitle.textContent = 'Rutgers Busch Campus · enable Map Tiles API on the key, then reload';
  } else if (reason === 'no_key') {
    modeBadge.textContent = 'Fallback · measured point cloud';
    subtitle.textContent = 'Rutgers Busch Campus · lidar / photogrammetry fallback (no API key)';
  } else {
    modeBadge.textContent = 'Fallback · measured point cloud';
    subtitle.textContent = `Rutgers Busch Campus · tiles unavailable (${reason || 'unknown'})`;
  }
  mapsAttrib.hidden = !google;
  document.getElementById('rowTiles').style.display = google ? '' : 'none';
  document.getElementById('showLidar').checked = !google;
  document.getElementById('showPhoto').checked = true; // RGB photogrammetry on in fallback
  document.getElementById('showTiles').checked = google;
}

async function probeGoogleTilesAccess() {
  // Lightweight root request so we can fall back cleanly on 403/401 before spinning the renderer.
  try {
    const res = await fetch(
      `https://tile.googleapis.com/v1/3dtiles/root.json?key=${encodeURIComponent(API_KEY)}`,
    );
    if (!res.ok) {
      const preview = (await res.text()).slice(0, 180);
      console.warn('Map Tiles root failed', res.status, preview.replace(API_KEY, '[redacted]'));
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    console.warn('Map Tiles probe error', err);
    return { ok: false, status: 0 };
  }
}

async function tryInitGoogleTiles() {
  if (!HAS_KEY || !API_KEY) return { ok: false, reason: 'no_key' };

  const probe = await probeGoogleTilesAccess();
  if (!probe.ok) {
    return {
      ok: false,
      reason: probe.status === 403 ? 'forbidden_403' : `http_${probe.status}`,
      status: probe.status,
    };
  }

  tiles = new TilesRenderer();
  tiles.registerPlugin(
    new GoogleCloudAuthPlugin({
      apiToken: API_KEY,
      autoRefreshToken: true,
      useRecommendedSettings: true,
    }),
  );
  tiles.registerPlugin(
    new ReorientationPlugin({
      lat: CORE_LAT * THREE.MathUtils.DEG2RAD,
      lon: CORE_LON * THREE.MathUtils.DEG2RAD,
      height: CORE_HEIGHT_M,
      up: '+y',
    }),
  );
  tiles.registerPlugin(new TileCompressionPlugin());
  tiles.registerPlugin(new TilesFadePlugin());

  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));

  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);
  scene.add(tiles.group);

  // Streaming only — renderer LRU in memory; never write tiles to disk.
  return { ok: true };
}

function wireControls(manifest) {
  const sizeInput = document.getElementById('pointSize');
  const opacityInput = document.getElementById('thermalOpacity');

  document.getElementById('showTiles').addEventListener('change', (e) => {
    if (tiles) tiles.group.visible = e.target.checked;
  });
  document.getElementById('showLidar').addEventListener('change', (e) => {
    if (lidarPoints) lidarPoints.visible = e.target.checked;
  });
  document.getElementById('showPhoto').addEventListener('change', (e) => {
    if (photoPoints) photoPoints.visible = e.target.checked;
  });
  document.getElementById('showThermal').addEventListener('change', (e) => {
    if (thermalPoints) thermalPoints.visible = e.target.checked;
  });
  sizeInput.addEventListener('input', () => {
    const s = Number(sizeInput.value);
    if (lidarPoints) lidarPoints.material.size = s * 0.85;
    if (photoPoints) photoPoints.material.size = s;
    if (thermalPoints) thermalPoints.material.size = s * 1.15;
  });
  opacityInput.addEventListener('input', () => {
    if (!thermalPoints) return;
    const o = Number(opacityInput.value);
    thermalPoints.material.opacity = o;
    thermalPoints.material.transparent = o < 0.999;
    thermalPoints.material.depthWrite = o > 0.95;
    thermalPoints.material.needsUpdate = true;
  });
}

async function boot() {
  loading.textContent = HAS_KEY ? 'Connecting to Google Photorealistic 3D Tiles…' : 'Loading measured fallback (no Google key)…';

  const manifest = await fetch('./data/buildings/core/manifest.json').then((r) => r.json());
  const lidar = manifest.geometry_layers.find((l) => l.id === 'lidar');
  const photoLayer = manifest.geometry_layers.find((l) => l.id === 'photo_dense');
  const thermal = manifest.thermal_layer;

  let googleOk = false;
  let googleReason = 'no_key';
  try {
    const g = await tryInitGoogleTiles();
    googleOk = Boolean(g?.ok);
    googleReason = g?.reason || (googleOk ? '' : 'init_failed');
  } catch (err) {
    console.warn('Google tiles init failed; using fallback', err);
    googleOk = false;
    googleReason = 'init_exception';
  }
  setModeUI(googleOk, googleReason);

  // Measured layers (always available; primary when no key)
  loading.textContent = 'Loading measured layers…';
  try {
    const lidarData = await loadPreviewPoints(`./data/buildings/core/${lidar.files.preview_bin}`);
    // Subsample display for lidar in Google mode
    let { xyzYup, rgb, n } = lidarData;
    if (googleOk && n > 180_000) {
      const step = Math.ceil(n / 180_000);
      const m = Math.floor(n / step);
      const x2 = new Float32Array(m * 3);
      const c2 = new Float32Array(m * 3);
      for (let i = 0, j = 0; i < n; i += step, j++) {
        x2[j * 3] = xyzYup[i * 3];
        x2[j * 3 + 1] = xyzYup[i * 3 + 1];
        x2[j * 3 + 2] = xyzYup[i * 3 + 2];
        c2[j * 3] = rgb[i * 3];
        c2[j * 3 + 1] = rgb[i * 3 + 1];
        c2[j * 3 + 2] = rgb[i * 3 + 2];
      }
      xyzYup = x2;
      rgb = c2;
      n = m;
    }
    lidarPoints = makeRoundPoints(xyzYup, rgb, Number(document.getElementById('pointSize').value) * 0.85);
    lidarPoints.name = 'lidar';
    lidarPoints.visible = document.getElementById('showLidar').checked;
    scene.add(lidarPoints);
  } catch (e) {
    console.warn(e);
  }

  if (photoLayer?.files?.preview_bin) {
    try {
      const photo = await loadPreviewPoints(`./data/buildings/core/${photoLayer.files.preview_bin}`);
      photoPoints = makeRoundPoints(
        photo.xyzYup,
        photo.rgb,
        Number(document.getElementById('pointSize').value),
      );
      photoPoints.name = 'photo';
      photoPoints.visible = document.getElementById('showPhoto').checked;
      scene.add(photoPoints);
    } catch (e) {
      console.warn('photo layer', e);
    }
  }

  // Thermal on building points (visibility-filtered)
  let covTxt = 'unavailable';
  const thermalFile =
    thermal?.files?.thermal_visible ||
    thermal?.files?.thermal_building ||
    (thermal?.files?.colors ? null : null);
  try {
    let tData = null;
    if (thermal?.files?.thermal_visible) {
      tData = await loadPreviewPoints(`./data/buildings/core/${thermal.files.thermal_visible}`);
    } else if (thermal?.files?.thermal_building) {
      tData = await loadPreviewPoints(`./data/buildings/core/${thermal.files.thermal_building}`);
      if (thermal.files.thermal_building_mask) {
        const mask = await loadBin(`./data/buildings/core/${thermal.files.thermal_building_mask}`);
        let count = 0;
        for (let i = 0; i < mask.length; i++) if (mask[i]) count++;
        const x = new Float32Array(count * 3);
        const c = new Float32Array(count * 3);
        let k = 0;
        for (let i = 0; i < mask.length; i++) {
          if (!mask[i]) continue;
          x[k * 3] = tData.xyzYup[i * 3];
          x[k * 3 + 1] = tData.xyzYup[i * 3 + 1];
          x[k * 3 + 2] = tData.xyzYup[i * 3 + 2];
          c[k * 3] = tData.rgb[i * 3];
          c[k * 3 + 1] = tData.rgb[i * 3 + 1];
          c[k * 3 + 2] = tData.rgb[i * 3 + 2];
          k++;
        }
        tData = { n: count, xyzYup: x, rgb: c };
      }
    } else if (thermal?.files?.colors && lidarPoints) {
      // Legacy path: colors/mask on lidar preview
      const [tRaw, mRaw] = await Promise.all([
        loadBin(`./data/buildings/core/${thermal.files.colors}`),
        loadBin(`./data/buildings/core/${thermal.files.mask}`),
      ]);
      const n = mRaw.length;
      let count = 0;
      for (let i = 0; i < n; i++) if (mRaw[i]) count++;
      const lid = await loadPreviewPoints(`./data/buildings/core/${lidar.files.preview_bin}`);
      const x = new Float32Array(count * 3);
      const c = new Float32Array(count * 3);
      let k = 0;
      for (let i = 0; i < n; i++) {
        if (!mRaw[i]) continue;
        x[k * 3] = lid.xyzYup[i * 3];
        x[k * 3 + 1] = lid.xyzYup[i * 3 + 1];
        x[k * 3 + 2] = lid.xyzYup[i * 3 + 2];
        c[k * 3] = tRaw[i * 3] / 255;
        c[k * 3 + 1] = tRaw[i * 3 + 1] / 255;
        c[k * 3 + 2] = tRaw[i * 3 + 2] / 255;
        k++;
      }
      tData = { n: count, xyzYup: x, rgb: c };
    }

    if (tData && tData.n > 0) {
      const opac = Number(document.getElementById('thermalOpacity').value);
      thermalPoints = makeRoundPoints(
        tData.xyzYup,
        tData.rgb,
        Number(document.getElementById('pointSize').value) * 1.15,
        opac,
      );
      thermalPoints.name = 'thermal';
      scene.add(thermalPoints);
      const cov = thermal.coverage_fraction ?? thermal.coverage_fraction_of_projected_subset;
      covTxt =
        cov != null
          ? `IRX projected (${(cov * 100).toFixed(1)}% of building points; relative intensity)`
          : `IRX projected (${tData.n.toLocaleString()} visible pts; relative intensity)`;
    }
  } catch (e) {
    console.warn('thermal', e);
  }

  const reg = manifest.registration?.openmvs_dense?.after_icp
    || manifest.registration?.openmvs_dense
    || {};
  const med =
    reg.nn_median_m ??
    reg.nn_median_to_elevated_lidar_m ??
    manifest.geometry_layers.find((l) => l.id === 'photo_dense')?.registration_to_lidar_nn_median_m;
  const rmse =
    reg.nn_rmse_m ??
    reg.nn_rmse_to_elevated_lidar_m ??
    manifest.geometry_layers.find((l) => l.id === 'photo_dense')?.registration_to_lidar_nn_rmse_m;
  const inliers = reg.inlier_count_approx;
  const regTxt =
    med != null
      ? ` · UAV↔lidar NN median ${Number(med).toFixed(2)} m` +
        (rmse != null ? ` / RMSE ${Number(rmse).toFixed(2)} m` : '') +
        (inliers != null ? ` / ICP inliers≈${Number(inliers).toLocaleString()}` : '')
      : '';

  const baseTxt = googleOk
    ? 'Base: Google Photorealistic 3D Tiles (streamed; not cached)'
    : `Base: ${lidar.dataset} (${lidar.year}) · ${Number(lidar.point_count_preview).toLocaleString()} lidar pts`;

  prov.textContent = `${baseTxt} · Thermal: ${covTxt}${regTxt} · RWH: pending`;

  wireControls(manifest);
  loading.classList.add('hide');
}

boot().catch((err) => {
  console.error(err);
  loading.textContent = String(err.message || err);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  if (tiles) tiles.setResolutionFromRenderer(camera, renderer);
});

function frame() {
  requestAnimationFrame(frame);
  controls.update();

  if (tiles) {
    camera.updateMatrixWorld();
    tiles.setResolutionFromRenderer(camera, renderer);
    tiles.setCamera(camera);
    tiles.update();
    const attrs = tiles.getAttributions?.() || [];
    const credit = attrs
      .map((a) => a.value || a)
      .filter(Boolean)
      .join(' · ');
    if (credit && tileCredits.textContent !== credit) tileCredits.textContent = credit;
  }

  const dx = camera.position.x - controls.target.x;
  const dz = camera.position.z - controls.target.z;
  const az = Math.atan2(dx, dz);
  document.getElementById('compass').style.transform = `rotate(${THREE.MathUtils.radToDeg(az)}deg)`;
  updateScaleBar();
  renderer.render(scene, camera);
}
frame();
