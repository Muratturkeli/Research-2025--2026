import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('c');
const loading = document.getElementById('loading');
const prov = document.getElementById('prov');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.setClearColor(0xececec, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 2000);
camera.position.set(180, 120, 180);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 15, 0);
controls.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const sun = new THREE.DirectionalLight(0xffffff, 0.35);
sun.position.set(80, 120, 40);
scene.add(sun);

// Ground reference grid (metric)
const grid = new THREE.GridHelper(400, 40, 0xb0b0b0, 0xd0d0d0);
grid.position.y = -0.05;
scene.add(grid);

let lidarPoints = null;
let thermalPoints = null;
let photoPoints = null;

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
  // Approximate screen meters for 50 m world length at look-at distance
  const el = document.getElementById('scale');
  const bar = el.querySelector('i');
  const dist = camera.position.distanceTo(controls.target);
  const worldPerPixel = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist) / innerHeight;
  const px = 50 / worldPerPixel;
  bar.style.width = `${Math.max(24, Math.min(140, px))}px`;
}

async function loadBin(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

function makePoints(xyz, rgb, size = 1.6) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(xyz, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  const mat = new THREE.PointsMaterial({
    size,
    vertexColors: true,
    sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}

async function boot() {
  const manifest = await fetch('./data/buildings/core/manifest.json').then((r) => r.json());
  const lidar = manifest.geometry_layers.find((l) => l.id === 'lidar');
  const thermal = manifest.thermal_layer;

  const lidarData = await loadPreviewPoints(`./data/buildings/core/${lidar.files.preview_bin}`);
  const { n, xyzYup, rgb } = lidarData;

  lidarPoints = makePoints(xyzYup, rgb, Number(document.getElementById('pointSize').value));
  lidarPoints.name = 'lidar';
  scene.add(lidarPoints);

  const photoLayer = manifest.geometry_layers.find((l) => l.id === 'photo_dense');
  if (photoLayer?.files?.preview_bin) {
    try {
      const photo = await loadPreviewPoints(`./data/buildings/core/${photoLayer.files.preview_bin}`);
      photoPoints = makePoints(photo.xyzYup, photo.rgb, Number(document.getElementById('pointSize').value) + 0.2);
      photoPoints.name = 'photo';
      photoPoints.visible = false;
      scene.add(photoPoints);
    } catch (e) {
      console.warn('photo dense layer missing', e);
    }
  }

  // Thermal overlay: only covered points
  let covTxt = 'unavailable';
  if (thermal?.files) {
    const [tRaw, mRaw] = await Promise.all([
      loadBin(`./data/buildings/core/${thermal.files.colors}`),
      loadBin(`./data/buildings/core/${thermal.files.mask}`),
    ]);
    let count = 0;
    for (let i = 0; i < n; i++) if (mRaw[i]) count++;
    const txyz = new Float32Array(count * 3);
    const trgb = new Float32Array(count * 3);
    let k = 0;
    for (let i = 0; i < n; i++) {
      if (!mRaw[i]) continue;
      txyz[k * 3] = xyzYup[i * 3];
      txyz[k * 3 + 1] = xyzYup[i * 3 + 1];
      txyz[k * 3 + 2] = xyzYup[i * 3 + 2];
      trgb[k * 3] = tRaw[i * 3] / 255;
      trgb[k * 3 + 1] = tRaw[i * 3 + 1] / 255;
      trgb[k * 3 + 2] = tRaw[i * 3 + 2] / 255;
      k++;
    }
    thermalPoints = makePoints(txyz, trgb, Number(document.getElementById('pointSize').value) + 0.3);
    thermalPoints.name = 'thermal';
    scene.add(thermalPoints);
    const cov = thermal.coverage_fraction_of_projected_subset;
    covTxt = `Core March 22_2 IRX projected (${(cov * 100).toFixed(1)}% covered; relative intensity)`;
  }

  const reg = manifest.registration?.openmvs_dense;
  const regTxt = reg
    ? ` · UAV dense NN median ${reg.nn_median_to_elevated_lidar_m?.toFixed?.(1) ?? '?'} m vs lidar`
    : '';
  prov.textContent =
    `Lidar: ${lidar.dataset} (${lidar.year}, ${lidar.license}) · ${lidar.point_count_preview.toLocaleString()} pts · ` +
    `Thermal: ${covTxt}${regTxt} · RWH: pending`;

  document.getElementById('showLidar').addEventListener('change', (e) => {
    if (lidarPoints) lidarPoints.visible = e.target.checked;
  });
  document.getElementById('showPhoto').addEventListener('change', (e) => {
    if (photoPoints) photoPoints.visible = e.target.checked;
  });
  document.getElementById('showThermal').addEventListener('change', (e) => {
    if (thermalPoints) thermalPoints.visible = e.target.checked;
  });
  document.getElementById('pointSize').addEventListener('input', (e) => {
    const s = Number(e.target.value);
    if (lidarPoints) lidarPoints.material.size = s;
    if (photoPoints) photoPoints.material.size = s + 0.2;
    if (thermalPoints) thermalPoints.material.size = s + 0.3;
  });

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
});

function frame() {
  requestAnimationFrame(frame);
  controls.update();
  // Compass rotation from camera azimuth
  const dx = camera.position.x - controls.target.x;
  const dz = camera.position.z - controls.target.z;
  const az = Math.atan2(dx, dz);
  document.getElementById('compass').style.transform = `rotate(${THREE.MathUtils.radToDeg(az)}deg)`;
  updateScaleBar();
  renderer.render(scene, camera);
}
frame();
