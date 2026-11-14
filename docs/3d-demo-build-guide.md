# 3D Thermal Demo — Build & Retexture Guide

This guide explains how the **RWH × CoRE** interactive demo was built and how to rebuild, retexture, or upgrade it to a photogrammetry GLB / Gaussian splat later.

## Layout

```
Research-2025--2026/
├── docs/3d-demo-build-guide.md          ← this file
├── web/thermal-3d-demo/
│   ├── package.json                     ← three@0.170.0, vite@5.4.11 (pinned)
│   ├── index.html
│   ├── public/
│   │   ├── data/buildings.json          ← OSM footprints → local meters
│   │   ├── data/texture-manifest.json
│   │   └── textures/*.jpg               ← curated ~2 MB set
│   └── src/
│       ├── main.js
│       ├── styles.css
│       ├── scene/{campus,buildings,materials,envResponse}.js
│       └── ui/hud.js
└── (notebooks…)
```

## Prerequisites

- Node.js ≥ 18
- Optional for rebuild of textures: Python 3 + Pillow
- Optional for Phase 2 mesh: Metashape / RealityCapture / WebODM / Blender
- Optional for Phase 2 splat: Postshot / nerfstudio / gsplat

## Run locally

```bash
cd web/thermal-3d-demo
npm install
npm run dev
```

## Geometry source (v1)

1. Queried OpenStreetMap Overpass for:
   - `Richard Weeks Hall of Engineering`
   - `Computing Research & Education Building (CoRE)`
2. Converted lon/lat rings to a shared local-meter frame (`buildings.json`).
3. Extruded footprints in Three.js with bevel, roof HVAC, RWH cantilever accent, façade UV projection, and dual-texture thermal shader.

**No redistributable Sketchfab / university GLB** for these buildings was found with a clear license. OSM footprints (ODbL) + authored massing is the v1 path.

### Replace with a future GLB

1. Export `models/core-building.glb` (and optionally `rwh-building.glb`) &lt; ~25 MB.
2. In `src/scene/campus.js`, load with `GLTFLoader` and swap the massing group for that building id.
3. Keep the same HUD / `applyEnvToMaterial` path: either bake IR into materials or keep the custom shader on cloned meshes.
4. Document the GLB license in `web/thermal-3d-demo/THIRD_PARTY_LICENSES.md`.

### Phase 2 — Core photogrammetry / splat

Staged inputs (do not commit raw flights):

- RGB: unique `MAX_*.JPG` from `Core March 22_2` / `_3` (~167 each)
- IR pairs: matching `IRX_*.JPG` by numeric suffix

Suggested pipeline:

1. Copy unique MAX frames to a local **non-OneDrive** work folder.
2. Run Metashape / WebODM → textured mesh → decimate in Blender → GLB.
3. Optional: train a splat for hero marketing views; keep mesh for school embed.
4. Align IR by filename index (`MAX_3350` ↔ `IRX_3350`) for façade projection.

Gaussian splat was **not** run on the build agent (no COLMAP/Metashape/ffmpeg). Treat splat as Phase 2.

## Retexture from the UAV dump

Original dump (never commit wholesale):

`C:\Users\murat\OneDrive\Documents\UAV-RWH-3D-Assets\`

Helper scripts used during authoring (can live outside git or under `web/thermal-3d-demo/scripts/`):

1. Pick representative `MAX_*` / `IRX_*` stills.
2. Downsample (RGB ≤1280 px wide, IR ≤1024).
3. Map IR grayscale → ironbow-style false color for materials.
4. Write `public/textures/` + `texture-manifest.json`.

Update `buildings.json` `textures` arrays if you rename files.

## Environment slider math

`src/scene/envResponse.js` maps ambient / solar / wind / humidity into:

- façade warmth, roof heat, glass cool
- palette contrast
- sun elevation / azimuth
- emissive boost

This mirrors the **shape** of EnvCalib zone drivers from the research notebooks without claiming radiometric accuracy.

## School embed checklist

- [ ] `npm run build` → host `dist/` over HTTPS
- [ ] iframe: `allow-scripts allow-same-origin`; min height ~560px
- [ ] Confirm total transfer (textures + JS) stays comfortable on campus Wi‑Fi
- [ ] Prefer reduced-motion: CSS already disables animations when requested

## Gaps remaining

| Gap | Impact | Next step |
|-----|--------|-----------|
| No RWH RGB (`MAX_*`) | RWH stays massing + IR | Capture / provide Weeks Hall visual orbit |
| No browser GLB from Pix4D | Core not photoreal | Re-export OBJ/GLB or reprocess MAX set |
| No absolute °C | Demo is relative LUT | Optional Phase 4 radiometric path |
| OSM height tags incomplete on RWH | Assumed ~24 m | Confirm with campus drawings |

## License summary

| Asset | License / note |
|-------|----------------|
| OSM footprints | ODbL — © OpenStreetMap contributors |
| Demo source | Part of Murat Turkeli Research-2025--2026 |
| Curated flight stills | Project research imagery — not for unrelated redistribution |
| Fonts (Outfit, IBM Plex Mono) | Google Fonts / SIL OFL |
| three / vite | MIT |
