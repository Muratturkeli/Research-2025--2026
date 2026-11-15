import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildMassing } from './buildings.js';
import { applyEnvToMaterial, tickMaterials } from './materials.js';
import { computeEnvLook } from './envResponse.js';

/**
 * @param {HTMLCanvasElement} canvas
 */
export async function createCampusScene(canvas, { onProgress } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x08141d, 0.0018);
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 2000);
  camera.position.set(180, 120, 210);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 40;
  controls.maxDistance = 520;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.target.set(0, 12, 0);

  // Lights
  const hemi = new THREE.HemisphereLight(0xb8dce8, 0x1a2a28, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.35);
  sun.position.set(120, 160, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 600;
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x2de2c5, 0.35);
  rim.position.set(-80, 40, -120);
  scene.add(rim);

  addGround(scene);
  addAtmosphere(scene);

  onProgress?.(0.15);
  const buildingsData = await fetch('./data/buildings.json').then((r) => {
    if (!r.ok) throw new Error('Failed to load buildings.json');
    return r.json();
  });
  onProgress?.(0.35);

  const loader = new THREE.TextureLoader();
  const loadTex = (url) =>
    new Promise((resolve, reject) => {
      loader.load(
        url,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          resolve(t);
        },
        undefined,
        reject,
      );
    });

  const tex = {
    coreRgb: await loadTex('./textures/core-rgb-b.jpg'),
    coreIr: await loadTex('./textures/core-ir-b.jpg'),
    rwhIr: await loadTex('./textures/rwh-ir-b.jpg'),
    rwhIrAlt: await loadTex('./textures/rwh-ir-a.jpg'),
  };
  onProgress?.(0.7);

  const thermalMats = [];
  const buildingGroups = {};

  for (const b of buildingsData.buildings) {
    const maps =
      b.id === 'core'
        ? { rgb: tex.coreRgb, thermal: tex.coreIr }
        : { rgb: null, thermal: tex.rwhIr };

    const { group, materials } = buildMassing(b, maps);
    if (group.userData.extraMaterials) materials.push(...group.userData.extraMaterials);
    thermalMats.push(...materials);
    buildingGroups[b.id] = group;
    scene.add(group);
  }

  // Footprints share a local-meter frame from buildings.json (origin between sites).
  // Scale slightly for iframe / school-site framing while keeping relative layout.
  const site = new THREE.Group();
  site.name = 'site';
  scene.add(site);
  for (const id of Object.keys(buildingGroups)) {
    site.add(buildingGroups[id]);
  }
  site.scale.setScalar(0.9);
  controls.target.set(0, 14, 0);
  camera.position.set(160, 110, 190);
  controls.update();

  let envState = {
    ambient: 12,
    solar: 420,
    wind: 3.5,
    humidity: 48,
    blend: 0.55,
    palette: 1.15,
  };

  function applyState(next) {
    envState = { ...envState, ...next };
    const look = computeEnvLook(envState);
    for (const mat of thermalMats) applyEnvToMaterial(mat, look);

    const elev = THREE.MathUtils.degToRad(look.sunElevation);
    const az = THREE.MathUtils.degToRad(look.sunAzimuth);
    const r = 220;
    sun.position.set(Math.cos(az) * Math.cos(elev) * r, Math.sin(elev) * r, Math.sin(az) * Math.cos(elev) * r);
    sun.intensity = 0.55 + look.roofHeat * 1.1;
    hemi.intensity = 0.35 + (1 - look.roofHeat) * 0.35;
    renderer.toneMappingExposure = 0.9 + look.facadeWarmth * 0.35;
    scene.fog.density = 0.0012 + look.groundTint * 0.0015;
    return { envState, look };
  }

  applyState(envState);
  onProgress?.(1);

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener('resize', onResize);

  let raf = 0;
  const clock = new THREE.Clock();
  function frame() {
    raf = requestAnimationFrame(frame);
    const t = clock.getElapsedTime();
    controls.update();
    tickMaterials(thermalMats, t);
    // gentle site breathing
    site.rotation.y = Math.sin(t * 0.05) * 0.01;
    renderer.render(scene, camera);
  }
  frame();

  return {
    applyState,
    getState: () => ({ ...envState }),
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
    },
  };
}

function addGround(scene) {
  const geo = new THREE.CircleGeometry(420, 64);
  const mat = new THREE.MeshStandardMaterial({
    color: '#0d1a22',
    metalness: 0.2,
    roughness: 0.92,
  });
  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Grid ring
  const grid = new THREE.GridHelper(360, 36, 0x1ec8d4, 0x14303a);
  grid.position.y = 0.02;
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  scene.add(grid);

  // Plaza disc between buildings
  const plaza = new THREE.Mesh(
    new THREE.RingGeometry(18, 42, 64),
    new THREE.MeshStandardMaterial({
      color: '#123038',
      emissive: '#2de2c5',
      emissiveIntensity: 0.08,
      metalness: 0.3,
      roughness: 0.6,
      side: THREE.DoubleSide,
    }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.04;
  scene.add(plaza);
}

function addAtmosphere(scene) {
  const pts = [];
  for (let i = 0; i < 200; i++) {
    pts.push(
      (Math.random() - 0.5) * 500,
      Math.random() * 80 + 5,
      (Math.random() - 0.5) * 500,
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const m = new THREE.PointsMaterial({
    color: 0x8ad4d0,
    size: 0.7,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const cloud = new THREE.Points(g, m);
  cloud.name = 'aerosol';
  scene.add(cloud);
}
