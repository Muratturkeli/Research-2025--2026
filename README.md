# Research-2025--2026

by Murat Turkeli

UAV thermography, environment-conditioned calibration (EnvCalib), façade segmentation, and visualization notebooks for Rutgers **Richard Weeks Hall** research.

## Interactive 3D thermal demo

School-embeddable Three.js scene for **RWH + CoRE**:

- Path: [`web/thermal-3d-demo/`](./web/thermal-3d-demo/)
- Build guide: [`docs/3d-demo-build-guide.md`](./docs/3d-demo-build-guide.md)

```bash
cd web/thermal-3d-demo
npm install
npm run dev
```

Geometry: OpenStreetMap footprints + refined massing; Core uses curated RGB+IR textures; RWH uses thermal-only materials until RGB flights exist. Large raw flight dumps are intentionally **not** in this repository.
