# CoRE Building 3D Thermal Demo — Build Guide

**Target experience:** Google Maps–style photorealistic 3D of Rutgers **CoRE**, with a research thermal overlay. **RWH is pending.**

Murat’s reference: Google Maps 3D screenshots in the project store `internal/core-reference/`.

## What you get

1. **Primary base (with API key):** streamed **Google Photorealistic 3D Tiles** (Map Tiles API) via NASA-AMMOS `3d-tiles-renderer` + three.js — orbit / tilt / zoom, opens on a three-quarter view of CoRE.
2. **Thermal add-on:** relative-intensity coloring of **our own** ICP/GPS-registered building points (OpenMVS dense from Core `MAX_*` + COLMAP poses), with a soft z-buffer visibility test per `IRX_*` frame. Toggle + opacity slider. **Not** extracted or derived from Google tiles (Map Tiles API terms).
3. **Fallback (no key):** USGS lidar + UAV photogrammetry + same thermal layer, clearly labeled — repo runs for anyone.

## Run

```bash
cd web/thermal-3d-demo
npm install
npm run dev
```

Or openable package: `C:\Users\murat\OneDrive\Documents\UAV-RWH-3D-Assets\thermal-3d-demo-html\` → `serve.bat`

### Google Maps API key

1. In Google Cloud Console, enable **Map Tiles API**.
2. Create an API key. For a school site, restrict it with **HTTP referrers** (e.g. `https://yourschool.edu/*` and `http://localhost:5173/*` for local dev).
3. Put the key as a **single line** in:

   `C:\Users\murat\OneDrive\Documents\UAV-RWH-3D-Assets\google-maps-key.txt`

   Optional alternate: `web/thermal-3d-demo/.env.local` with  
   `VITE_GOOGLE_MAPS_API_KEY=...`

4. Restart `npm run dev` / rebuild. Vite reads the file at startup and injects the key at compile time. **Never commit** the key file, `.env.local`, or paste the key into docs/PRs/stores.
5. Confirm **Map Tiles API** is enabled for the Cloud project and that the key is allowed to call Photorealistic 3D Tiles (`ThreeDTilesService.GetRootTileset`). A key that exists but returns **403 PERMISSION_DENIED / Requests to this API tile method … are blocked** means the API or key restriction is wrong — the viewer automatically falls back to measured lidar/photogrammetry.

Without a usable key, the viewer stays in **fallback** mode automatically.

### Attribution (required when tiles are shown)

- Display the **Google Maps logo** (bottom-right in this demo).
- Display **data attribution** strings aggregated from visible tiles (footer credits strip).
- **Streaming only** — do not cache, extract, or commit tile geometry/textures. Do not build products by tracing Google tiles.

Policies: https://developers.google.com/maps/documentation/tile/policies

## Data layout (building-agnostic)

```
public/data/buildings/<id>/
  manifest.json
  lidar.laz / lidar_preview.bin
  photo_dense_preview.bin
  registration.json
  thermal_*.bin / thermal_layer.json
  colmap_cameras.json
```

CoRE id: `core`. RWH later: add `rwh/` the same way (needs post-2018 lidar; 2014 Sandy predates Weeks Hall).

## Pipeline notes (measured fallback / thermal registration)

| Step | Tooling | Notes |
|------|---------|--------|
| Lidar | USGS 3DEP | `NJ_SdL5_2014` clip in use; `NJ_NE6County_B23` (acq. 2023–2025) preferred when LAZ download completes |
| Poses | COLMAP 4.2.1 | GPS `model_aligner` ECEF; Core March 22_2 `MAX_*` |
| Dense | OpenMVS 2.4 | COLMAP CUDA dense crashed on RTX 5070 → OpenMVS CPU. Dense is **fallback + alignment reference**, not the hero mesh when Google tiles are on |
| Register | ECEF→UTM + GEOID18≈−33 m + point-to-plane ICP vs lidar roof/ground | Fix OpenMVS PLY list-property reader before ICP |
| Thermal | Soft z-buffer per IRX; IR focal from ~48° HFOV; small IR lever-arm | Colors building points; uncovered stay uncolored |

### Flight coverage (Core March 22*)

Primary: **Core March 22_2** — 167 `MAX_*` + 167 `IRX_*` (paired). Sibling folders add unique names (560 unique `MAX_*` staged across March 22 / `_2` / `_3` / `_4`). GPS samples show a tight orbit ~80–120 m AGL over CoRE (~40.521°N, −74.461°W) — façade/oblique-heavy, not a wide nadir grid. That bounds reconstruction to the building mass and near context.

## Licenses

| Layer | Source | License / terms |
|-------|--------|-----------------|
| Photorealistic base | Google Map Tiles API | Google Maps Platform ToS + Map Tiles policies (stream, attribute, no extract) |
| Lidar | USGS 3DEP | Public domain |
| UAV RGB/IR | Project flights | Research use |
| three / 3d-tiles-renderer | npm | MIT |

## RWH later

Needs finished B23 (or other post-2018) lidar covering Weeks Hall, IRX campaigns already in the dump, optional RGB. Keep RWH out of the viewer until then (`RWH: pending`).
