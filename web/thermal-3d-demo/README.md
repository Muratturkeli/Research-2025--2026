# CoRE Building — Google-style 3D + thermal

School-embeddable viewer for Rutgers **CoRE**:

- **Primary:** streamed Google Photorealistic 3D Tiles (Map Tiles API) when a usable key is present  
- **Thermal add-on:** own registered IRX-colored building points (visibility-filtered), toggle + opacity  
- **Fallback:** USGS lidar + UAV photogrammetry if the key is missing or Map Tiles returns 403  
- **RWH:** pending  

```bash
npm install
npm run dev
```

Put the API key (single line) in `C:\Users\murat\OneDrive\Documents\UAV-RWH-3D-Assets\google-maps-key.txt`. Enable **Map Tiles API** / Photorealistic 3D Tiles on that key. Never commit the key.

See `docs/3d-demo-build-guide.md` for attribution rules and the measured-data pipeline.
