# Research-2025--2026

by Murat Turkeli

UAV thermography, environment-conditioned calibration (EnvCalib), façade segmentation, and visualization notebooks for Rutgers **Richard Weeks Hall** research.

## Interactive 3D thermal demo (CoRE)

Google Maps–style Photorealistic 3D Tiles base + thermal overlay for **CoRE** (RWH pending). Falls back to measured lidar/photogrammetry without a usable Map Tiles key.

- Path: [`web/thermal-3d-demo/`](./web/thermal-3d-demo/)
- Build guide: [`docs/3d-demo-build-guide.md`](./docs/3d-demo-build-guide.md)

```bash
cd web/thermal-3d-demo
npm install
npm run dev
```

Key (optional): `UAV-RWH-3D-Assets/google-maps-key.txt` — never commit. Raw multi-GB flights stay out of git.
