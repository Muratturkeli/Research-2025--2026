import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
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
const CORE_HEIGHT_M = 25;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor(0xc5ced6, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc5ced6, 220, 780);

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.5, 5_000_000);
camera.position.set(135, 88, 148);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.target.set(0, 20, 0);
controls.maxPolarAngle = Math.PI * 0.492;
controls.minDistance = 20;
controls.maxDistance = 700;
controls.update();

// Polished daylight-ish lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
scene.add(new THREE.HemisphereLight(0xf0f4f8, 0x7a8468, 0.95));
const sun = new THREE.DirectionalLight(0xfff5e6, 1.35);
sun.position.set(160, 220, 90);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xd6e6ff, 0.55);
fill.position.set(-120, 80, -60);
scene.add(fill);

let tiles = null;
let solidMesh = null;
let lidarPoints = null;
let photoPoints = null;
let thermalPoints = null;
let usingGoogle = false;
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
  return new THREE.Points(geo, mat);
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
  bar.style.width = `${Math.max(24, Math.min(160, 50 / worldPerPixel))}px`;
}

function setModeUI(google, reason = '') {
  usingGoogle = google;
  if (google) {
    modeBadge.textContent = 'Google Photorealistic 3D Tiles';
    subtitle.textContent = 'Rutgers Busch Campus · Google Maps–style base + thermal';
  } else if (reason === 'forbidden_403') {
    modeBadge.textContent = 'Solid mesh · Map Tiles blocked (403)';
    subtitle.textContent = 'Gap-filled CoRE mesh · enable Map Tiles API for Google base';
  } else if (reason === 'no_key') {
    modeBadge.textContent = 'Solid gap-filled mesh';
    subtitle.textContent = 'Rutgers Busch Campus · complete building surface + thermal';
  } else {
    modeBadge.textContent = 'Solid gap-filled mesh';
    subtitle.textContent = `Rutgers Busch Campus · tiles unavailable (${reason || 'fallback'})`;
  }
  mapsAttrib.hidden = !google;
  mapsAttrib.style.display = google ? '' : 'none';
  document.getElementById('rowTiles').style.display = google ? '' : 'none';
  document.getElementById('showTiles').checked = google;
  document.getElementById('showSolid').checked = !google;
  document.getElementById('showLidar').checked = false;
  document.getElementById('showPhoto').checked = false;
  document.getElementById('showThermal').checked = false;
}

async function probeGoogleTilesAccess() {
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
  return { ok: true };
}

function polishMeshMaterial(geo) {
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  else {
    // Rebuild normals after ENU→Y-up style exports can leave lighting black
    geo.computeVertexNormals();
  }
  const hasColor = Boolean(geo.getAttribute('color'));
  const mat = new THREE.MeshPhongMaterial({
    vertexColors: hasColor,
    color: hasColor ? 0xffffff : 0x8a6a55,
    shininess: 18,
    specular: 0x222222,
    side: THREE.DoubleSide,
    flatShading: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

async function loadSolidMesh(manifest) {
  // Prefer PLY (reliable vertex colors). Fall back to GLB.
  const plyName = manifest.geometry_layers?.find((l) => l.id === 'filled_solid')?.files?.ply || 'core_solid.ply';
  try {
    const ply = await new PLYLoader().loadAsync(`./data/buildings/core/${plyName}`);
    // PLY is still ENU (x,y,z)=(E,N,U) — convert to Three Y-up
    const pos = ply.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      pos.setXYZ(i, x, z, -y);
    }
    pos.needsUpdate = true;
    ply.computeBoundingSphere();
    const mesh = polishMeshMaterial(ply);
    const root = new THREE.Group();
    root.name = 'solid';
    root.add(mesh);
    scene.add(root);
    solidMesh = root;
    return plyName;
  } catch (plyErr) {
    console.warn('PLY load failed, trying GLB', plyErr);
  }

  const candidates = ['core_solid.glb', 'core_solid_lod.glb'];
  const loader = new GLTFLoader();
  let lastErr;
  for (const name of candidates) {
    try {
      const gltf = await loader.loadAsync(`./data/buildings/core/${name}`);
      const root = gltf.scene;
      root.traverse((obj) => {
        if (obj.isMesh) {
          const mesh = polishMeshMaterial(obj.geometry);
          obj.material.dispose?.();
          obj.material = mesh.material;
        }
      });
      root.name = 'solid';
      scene.add(root);
      solidMesh = root;
      return name;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('No solid mesh');
}

function wireControls() {
  const sizeInput = document.getElementById('pointSize');
  const opacityInput = document.getElementById('thermalOpacity');
  document.getElementById('showTiles').addEventListener('change', (e) => {
    if (tiles) tiles.group.visible = e.target.checked;
  });
  document.getElementById('showSolid').addEventListener('change', (e) => {
    if (solidMesh) solidMesh.visible = e.target.checked;
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
    if (thermalPoints) thermalPoints.material.size = s * 1.1;
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
  loading.textContent = 'Loading CoRE geometry…';
  const manifest = await fetch('./data/buildings/core/manifest.json').then((r) => r.json());
  const lidar = manifest.geometry_layers.find((l) => l.id === 'lidar');
  const photoLayer = manifest.geometry_layers.find((l) => l.id === 'photo_dense');
  const thermal = manifest.thermal_layer;
  const fillMeta = await fetch('./data/buildings/core/fill_gaps.json')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  let googleOk = false;
  let googleReason = 'no_key';
  try {
    const g = await tryInitGoogleTiles();
    googleOk = Boolean(g?.ok);
    googleReason = g?.reason || (googleOk ? '' : 'init_failed');
  } catch (err) {
    console.warn(err);
    googleOk = false;
    googleReason = 'init_exception';
  }
  setModeUI(googleOk, googleReason);

  // Primary: gap-filled solid mesh (always — complete structure even when Google tiles work as context)
  let solidName = null;
  try {
    loading.textContent = 'Loading solid gap-filled mesh…';
    solidName = await loadSolidMesh(manifest);
    if (solidMesh) solidMesh.visible = document.getElementById('showSolid').checked;
  } catch (e) {
    console.warn('solid mesh', e);
  }

  // Optional lidar context (subsample)
  try {
    const lidarData = await loadPreviewPoints(`./data/buildings/core/${lidar.files.preview_bin}`);
    let { xyzYup, rgb, n } = lidarData;
    if (n > 160_000) {
      const step = Math.ceil(n / 160_000);
      const m = Math.ceil(n / step);
      const x2 = new Float32Array(m * 3);
      const c2 = new Float32Array(m * 3);
      let j = 0;
      for (let i = 0; i < n; i += step) {
        x2[j * 3] = xyzYup[i * 3];
        x2[j * 3 + 1] = xyzYup[i * 3 + 1];
        x2[j * 3 + 2] = xyzYup[i * 3 + 2];
        c2[j * 3] = rgb[i * 3];
        c2[j * 3 + 1] = rgb[i * 3 + 1];
        c2[j * 3 + 2] = rgb[i * 3 + 2];
        j++;
      }
      xyzYup = x2;
      rgb = c2;
    }
    lidarPoints = makeRoundPoints(xyzYup, rgb, Number(document.getElementById('pointSize').value) * 0.85);
    lidarPoints.visible = document.getElementById('showLidar').checked;
    scene.add(lidarPoints);
  } catch (e) {
    console.warn(e);
  }

  // Raw photo points (optional)
  const photoFile = photoLayer?.files?.preview_bin;
  if (photoFile) {
    try {
      const photo = await loadPreviewPoints(`./data/buildings/core/${photoFile}`);
      photoPoints = makeRoundPoints(photo.xyzYup, photo.rgb, Number(document.getElementById('pointSize').value));
      photoPoints.visible = document.getElementById('showPhoto').checked;
      scene.add(photoPoints);
    } catch (e) {
      console.warn(e);
    }
  }

  // Thermal overlay
  let covTxt = 'unavailable';
  try {
    let tData = null;
    if (thermal?.files?.thermal_visible) {
      tData = await loadPreviewPoints(`./data/buildings/core/${thermal.files.thermal_visible}`);
    }
    if (tData?.n > 0) {
      const opac = Number(document.getElementById('thermalOpacity').value);
      thermalPoints = makeRoundPoints(
        tData.xyzYup,
        tData.rgb,
        Number(document.getElementById('pointSize').value) * 1.1,
        opac,
      );
      thermalPoints.visible = document.getElementById('showThermal').checked;
      scene.add(thermalPoints);
      const cov = thermal.coverage_fraction ?? thermal.coverage_fraction_of_projected_subset;
      covTxt =
        cov != null
          ? `IRX overlay (${(cov * 100).toFixed(0)}% of building pts; relative)`
          : `IRX overlay (${tData.n.toLocaleString()} pts)`;
    }
  } catch (e) {
    console.warn('thermal', e);
  }

  const tris = fillMeta?.triangles ?? manifest.geometry_layers.find((l) => l.id === 'filled_solid')?.triangles;
  const baseTxt = googleOk
    ? 'Base: Google Photorealistic 3D Tiles (streamed)'
    : solidName
      ? `Base: gap-filled solid mesh (${Number(tris || 0).toLocaleString()} tris, ${solidName})`
      : `Base: ${lidar.dataset} (${lidar.year})`;

  prov.textContent = `${baseTxt} · Thermal: ${covTxt} · RWH: pending`;
  wireControls();
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
    const credit = attrs.map((a) => a.value || a).filter(Boolean).join(' · ');
    if (credit && tileCredits.textContent !== credit) tileCredits.textContent = credit;
  }
  const dx = camera.position.x - controls.target.x;
  const dz = camera.position.z - controls.target.z;
  document.getElementById('compass').style.transform = `rotate(${THREE.MathUtils.radToDeg(Math.atan2(dx, dz))}deg)`;
  updateScaleBar();
  renderer.render(scene, camera);
}
frame();
