# RWH × CoRE — Interactive Thermal 3D Demo

School-embeddable Three.js visualization of **Richard Weeks Hall (RWH)** and the **Computing Research & Education Building (CoRE)** on Rutgers Busch Campus.

Looks-first science UI: orbit / zoom, RGB↔thermal blend, palette contrast, and ambient / solar / wind / humidity drivers that recolor façades in an EnvCalib-inspired way (presentation-grade, not absolute °C).

## Quick start

**Not** under `UAV-RWH-3D-Assets` (that folder is the imagery dump). This app lives at:

```text
Research-2025--2026/web/thermal-3d-demo
```

On Murat’s machine the working clone is:

```text
C:\Users\murat\OneDrive\Documents\Research-2025--2026-thermal-demo\web\thermal-3d-demo
```

```bash
cd web/thermal-3d-demo
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`).

Production build:

```bash
npm run build
npm run preview
```

Embed the `dist/` folder as static files or an iframe. Paths are relative (`base: './'`).

**Standalone HTML package** (no `npm install` needed to view): copy of `dist/` at

```text
C:\Users\murat\OneDrive\Documents\UAV-RWH-3D-Assets\thermal-3d-demo-html\
```

Double-click `serve.bat` there. Opening `index.html` via `file://` fails (ES modules).

## What geometry is this?

| Building | Geometry | Textures |
|----------|----------|----------|
| **CoRE** | OSM footprint extruded massing + roof details | Curated `MAX_*` RGB + `IRX_*` false-color from Core March 22_2 |
| **RWH** | OSM footprint extruded massing + cantilever accent | `IRX_*` thermal only (no RWH RGB in the UAV dump) |

Footprints: © OpenStreetMap contributors (ODbL). Extrusion / detailing authored for this demo. No third-party Sketchfab mesh had a clear redistributable license for these buildings.

Photogrammetry / Gaussian splat from Core `MAX_*` is documented as **Phase 2** in `docs/3d-demo-build-guide.md` (tools were not available on the build machine; school embed prefers &lt;25 MB mesh over heavy splats).

## Asset policy

- Committed textures under `public/textures/` are a **~2 MB curated subset**.
- Do **not** commit the ~5.6 GB UAV dump.
- Originals live at `UAV-RWH-3D-Assets/` on Murat’s machine; re-curate with the repo helper scripts if needed.

## Controls

| Control | Effect |
|---------|--------|
| Thermal blend | Crossfade RGB look → false-color IR |
| Palette contrast | LUT punch |
| Ambient / Solar / Wind / Humidity | Zone-tint + sun angle + emissive response |
| Presets | Cold clear · Hot sunny · Windy damp |

## License notes

- Demo code: see repository root (Murat Turkeli research corpus).
- OSM footprints: [ODbL](https://www.openstreetmap.org/copyright).
- Flight imagery: research / educational use under Murat’s project rights — not a free stock dump for unrelated commercial reuse.
