# CoRE Building 3D Thermal Point-Cloud Demo — Build Guide

Accuracy-first rebuild (2026-11-14). **CoRE only** in the viewer; **RWH is pending** by design.

## What you get

Interactive browser viewer of **measured** geometry for Rutgers **Computing Research & Education (CoRE)**:

1. **Airborne lidar base** (USGS 3DEP / NJ Sandy 2014 tile) clipped around CoRE with ground + context  
2. **UAV photogrammetry** from Murat’s Core March 22_2 `MAX_*` (COLMAP sparse poses + OpenMVS dense)  
3. **Thermal layer** projected from paired `IRX_*` using COLMAP camera poses (relative intensity; uncovered points left neutral)

Layout is building-agnostic: `public/data/buildings/<id>/`.

## Run

```bash
cd web/thermal-3d-demo
npm install
npm run dev
# or: npm run build && npm run preview
```

Openable package (no install): `C:\Users\murat\OneDrive\Documents\UAV-RWH-3D-Assets\thermal-3d-demo-html\` → `serve.bat`

## Data sources & licenses

| Layer | Dataset | Year | License |
|-------|---------|------|---------|
| Lidar | `NJ_SdL5_2014` / USGS LPC `USGS_LPC_NJ_New_Jersey_SANDY_LiDAR_15_18TWK445850.laz` | 2014 | USGS 3DEP public domain |
| RGB / IR | `UAV-RWH-3D-Assets/drone-images/Core March 22_2` `MAX_*` / `IRX_*` | 2025-03-22 flight | Project research imagery |
| Upgrade path | `NJ_NE6County_B23` (acq. 2023–2025) LAZ via rockyweb/TNM | newer | USGS 3DEP public domain — download was in progress; swap when complete |

**Not used as geometry:** OSM extrusions, Google Photorealistic 3D Tiles (API-key streaming only; terms disallow extract/re-host).

## Tool versions (this build)

| Tool | Version | Path / note |
|------|---------|-------------|
| Node | ≥18 | |
| three / vite | 0.170.0 / 5.4.11 | `package.json` pinned |
| COLMAP | 4.2.1 CUDA (+ nocuda available) | `web/thermal-3d-demo/_work/tools/colmap/` |
| OpenMVS | 2.4.0 Windows x64 | `_work/tools/OpenMVS/` |
| PotreeConverter | 2.1.1 | optional octree export |
| Python | 3.13 + `laspy[lazrs]`, `pyproj`, `Pillow`, `numpy` | |

`_work/` is local scratch — **do not commit** (raw LAZ, COLMAP DB, OpenMVS depth maps).

## Pipeline steps

### 1. Lidar clip (CoRE)

```bash
# Download USGS LPC tile covering campus (example Sandy 2014):
# https://rockyweb.usgs.gov/vdelivery/Datasets/Staged/Elevation/LPC/Projects/NJ_New_Jersey_SANDY_LiDAR_15/...

python _work_scripts/clip_core_laz.py NJ_SdL5_2014
# Prefer B23 when the LAZ is complete/readable:
# python _work_scripts/clip_core_laz.py NJ_NE6County_B23
```

Writes `public/data/buildings/core/lidar.laz`, `lidar_preview.bin`, `manifest.json`.

### 2. COLMAP sparse (poses)

```powershell
# Stage MAX frames (stride 2 used here → 84 images)
# Then:
web/thermal-3d-demo/_work/tools/colmap/bin/colmap.exe automatic_reconstructor `
  --workspace_path .../workspace --image_path .../images --quality medium --dense 0 --use_gpu 1
colmap model_aligner ... --ref_is_gps 1 --alignment_type ecef
python _work_scripts/export_colmap_cameras.py
```

This build: **84/84 images registered**, **33 660 sparse points**, **mean reprojection error 1.29 px**.

### 3. Dense photogrammetry

COLMAP `patch_match_stereo` **crashed** on RTX 5070 Laptop (CUDA exit `0xC0000409`). Fallback:

```powershell
# InterfaceCOLMAP + DensifyPointCloud (OpenMVS CPU)
_work_scripts/openmvs_dense.ps1
python _work_scripts/register_dense_ply.py
```

Dense PLY ≈ 884 k points; after ECEF→UTM + Core clip + centroid align to elevated lidar: **~11 k points** in clip, **NN median ≈ 3.6 m** / **RMSE ≈ 8.5 m** vs elevated lidar (ballpark, not full ICP). Treat as façade detail layer, **not** the metric base.

### 4. Thermal projection

```bash
python _work_scripts/register_and_project_thermal.py
```

Projects `IRX_*` with COLMAP ECEF poses onto lidar points. **Uncovered → mask 0 / neutral.** Units: **relative thermal intensity** (not confirmed radiometric).

This build: **42 IR frames used**, **~16.9%** of a 400 k lidar subsample covered.

EnvCalib weather sliders: **omitted** (coefficients not wired; do not fake response).

### 5. Viewer

Vite + Three.js Points loader over `*_preview.bin`. Minimal UI: layers, legend with units, scale bar, north, provenance footer. `RWH: pending` control disabled.

## RWH later (do not invent)

Needs:

1. Post-2018 lidar covering Weeks Hall (e.g. finished `NJ_NE6County_B23` tiles) — RWH opened 2018; **2014 Sandy does not contain it**  
2. Optional RWH RGB flight (none in dump — only `IRX_*`)  
3. Same folder pattern: `public/data/buildings/rwh/` + manifest entry  

Keep RWH out of the viewer until those exist.

## Google 3D Tiles (optional context only)

Would need Murat’s **Maps 3D / Photorealistic tiles API key + billing**. Cannot be committed or school-hosted as extracted geometry. Leave out until requested.

## School embed size

Committed Core preview data ≈ **14 MB** (lidar bin + thermal + laz). Full `_work` intermediates stay local.
