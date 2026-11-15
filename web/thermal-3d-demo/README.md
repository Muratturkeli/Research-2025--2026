# CoRE Building — Lidar + Thermal Point Cloud

Research-grade browser viewer for Rutgers **CoRE** (Computing Research & Education Building).

- **Base geometry:** USGS 3DEP airborne lidar (NJ Sandy 2014 clip), ~651 k points with ground/context  
- **UAV layer:** COLMAP poses + OpenMVS dense from Core March 22_2 `MAX_*` (registration to lidar reported in `registration.json`)  
- **Thermal:** `IRX_*` projected with camera poses; relative intensity; uncovered points not filled  
- **RWH:** pending (control disabled)

```bash
npm install
npm run dev
```

See `docs/3d-demo-build-guide.md` at the repo root for the full pipeline, licenses, and how to add RWH later.
