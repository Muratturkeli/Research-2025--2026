import * as THREE from 'three';
import { createThermalMaterial } from './materials.js';

/**
 * Extrude an OSM local XZ footprint into a refined massing mesh.
 * @param {object} building
 * @param {{ rgb?: THREE.Texture|null, thermal: THREE.Texture, accentThermal?: THREE.Texture }} maps
 */
export function buildMassing(building, maps) {
  const shape = new THREE.Shape();
  const pts = building.footprintLocalXZ;
  if (!pts?.length) throw new Error(`Building ${building.id} missing footprint`);

  shape.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i][0], -pts[i][1]);
  }
  shape.closePath();

  const height = building.heightM;
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.35,
    bevelSize: 0.25,
    bevelSegments: 2,
    curveSegments: 1,
  });

  // ExtrudeGeometry: shape in XY, depth along +Z → rotate to stand up in Y
  geom.rotateX(-Math.PI / 2);
  geom.computeVertexNormals();
  projectFacadeUVs(geom, height);

  const mat = createThermalMaterial(maps.rgb || null, maps.thermal, {
    hasRgb: Boolean(maps.rgb),
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = building.id;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.buildingId = building.id;
  mesh.userData.label = building.name;

  const group = new THREE.Group();
  group.name = `${building.id}-group`;
  group.add(mesh);

  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;

  // Roof plant / mechanical boxes for silhouette interest
  addRoofDetails(group, pts, height, building.id, cx, cz);

  // RWH cantilever suggestion — upper volume shelf on north-east side
  if (building.id === 'rwh') {
    addCantilever(group, height, maps.thermal, cx, cz);
  }

  // Ground-floor glass band proxy (emissive edge)
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(estimateWidth(pts) * 0.55, 0.35, estimateDepth(pts) * 0.55),
    new THREE.MeshStandardMaterial({
      color: '#14303a',
      emissive: '#1ec8d4',
      emissiveIntensity: 0.25,
      metalness: 0.4,
      roughness: 0.35,
      transparent: true,
      opacity: 0.55,
    }),
  );
  band.position.set(cx, 1.2, cz);
  band.name = `${building.id}-plinth-glow`;
  group.add(band);

  // Label sprite at footprint centroid
  const label = makeLabelSprite(
    building.id === 'rwh' ? 'RWH' : 'CoRE',
    building.id === 'rwh' ? '#2de2c5' : '#f0b429',
  );
  label.position.set(cx, height + 6, cz);
  group.add(label);

  return { group, materials: [mat] };
}

function estimateWidth(pts) {
  const xs = pts.map((p) => p[0]);
  return Math.max(...xs) - Math.min(...xs);
}

function estimateDepth(pts) {
  const zs = pts.map((p) => p[1]);
  return Math.max(...zs) - Math.min(...zs);
}

function addRoofDetails(group, pts, height, id, cx, cz) {
  const w = estimateWidth(pts);
  const d = estimateDepth(pts);
  const mat = new THREE.MeshStandardMaterial({
    color: '#1a2430',
    metalness: 0.55,
    roughness: 0.4,
    emissive: '#ff5a36',
    emissiveIntensity: 0.08,
  });
  const box = new THREE.Mesh(new THREE.BoxGeometry(Math.min(8, w * 0.18), 2.2, Math.min(6, d * 0.16)), mat);
  box.position.set(cx + w * 0.08, height + 1.1, cz - d * 0.05);
  box.name = `${id}-hvac`;
  group.add(box);

  const vent = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 1.4, 12),
    new THREE.MeshStandardMaterial({ color: '#2a3542', metalness: 0.7, roughness: 0.3 }),
  );
  vent.position.set(cx - w * 0.1, height + 0.7, cz + d * 0.08);
  group.add(vent);
}

function addCantilever(group, height, thermal, cx, cz) {
  const mat = createThermalMaterial(null, thermal, { hasRgb: false });
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(28, 5.5, 12), mat);
  shelf.position.set(cx + 10, height - 4, cz - 8);
  shelf.name = 'rwh-cantilever';
  shelf.castShadow = true;
  group.add(shelf);
  shelf.userData.extraMaterial = mat;
  group.userData.extraMaterials = [mat];
}

function projectFacadeUVs(geometry, height) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const normal = geometry.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let u;
    let v = y / Math.max(height, 1);
    if (ny > nx && ny > nz) {
      // roof / floor
      u = (x + 40) / 80;
      v = (z + 40) / 80;
    } else if (nx > nz) {
      u = (z + 40) / 80;
    } else {
      u = (x + 40) / 80;
    }
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

function makeLabelSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  ctx.fillStyle = 'rgba(6,16,24,0.55)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  roundRect(ctx, 24, 36, 208, 56, 8);
  ctx.fill();
  ctx.stroke();
  ctx.font = '700 36px Outfit, sans-serif';
  ctx.fillStyle = '#e8f4f2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(14, 7, 1);
  sprite.name = `label-${text}`;
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
