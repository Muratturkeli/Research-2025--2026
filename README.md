# Research-2025--2026

by Murat Turkeli

UAV thermography, environment-conditioned calibration (EnvCalib), façade segmentation, and visualization notebooks for Rutgers **Richard Weeks Hall** research.

## Interactive 3D thermal point-cloud demo (CoRE)

Accuracy-first measured point cloud for **CoRE** (RWH pending):

- Path: [`web/thermal-3d-demo/`](./web/thermal-3d-demo/)
- Build guide: [`docs/3d-demo-build-guide.md`](./docs/3d-demo-build-guide.md)

```bash
cd web/thermal-3d-demo
npm install
npm run dev
```

Geometry: USGS 3DEP lidar + COLMAP/OpenMVS from Core `MAX_*`; thermal from projected `IRX_*`. Raw multi-GB flights stay out of git.
