import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

/**
 * Read Murat's key for local `npm run dev` / intentional local builds only.
 * Committed CI/dist builds should ship with an empty key (see build:public script).
 * Never log the key value.
 */
function readGoogleMapsKey() {
  if (process.env.THERMAL_DEMO_STRIP_KEY === '1') return '';

  const candidates = [
    process.env.GOOGLE_MAPS_API_KEY,
    process.env.VITE_GOOGLE_MAPS_API_KEY,
  ].filter(Boolean);

  const keyFile = path.resolve(
    'C:/Users/murat/OneDrive/Documents/UAV-RWH-3D-Assets/google-maps-key.txt',
  );
  try {
    if (fs.existsSync(keyFile)) {
      const line = fs
        .readFileSync(keyFile, 'utf8')
        .split(/\r?\n/)
        .find((l) => l.trim() && !l.trim().startsWith('#'));
      if (line) candidates.push(line.trim());
    }
  } catch {
    /* absent */
  }

  const localEnv = path.resolve(__dirname, '.env.local');
  try {
    if (fs.existsSync(localEnv)) {
      for (const raw of fs.readFileSync(localEnv, 'utf8').split(/\r?\n/)) {
        const m = raw.match(/^\s*VITE_GOOGLE_MAPS_API_KEY\s*=\s*(.+)\s*$/);
        if (m) candidates.push(m[1].trim().replace(/^["']|["']$/g, ''));
      }
    }
  } catch {
    /* ignore */
  }

  return candidates.find(Boolean) || '';
}

const googleMapsKey = readGoogleMapsKey();

export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
  define: {
    // May be empty in committed public builds. Dev injects from key file.
    __GOOGLE_MAPS_API_KEY__: JSON.stringify(googleMapsKey),
  },
});
