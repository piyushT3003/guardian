// Builds Guardian as one self-contained HTML file with the backend running in the page.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { viteSingleFile } from 'vite-plugin-singlefile';

const S = path.resolve(__dirname, '../server/src');
const I = path.resolve(__dirname, 'src/inpage');
const swap = { [`${S}/db.js`]: `${I}/db.js`, [`${S}/lib/auth.js`]: `${I}/auth.js`, [`${S}/lib/events.js`]: `${I}/events.js` };
const bare = { 'node:crypto': `${I}/crypto.js`, express: `${I}/express.js`, 'node:fs': `${I}/empty.js` };

export default defineConfig({
  plugins: [
    { name: 'guardian-inpage', enforce: 'pre', resolveId(src, importer) {
      if (bare[src]) return bare[src];
      if (importer && src.startsWith('.')) { const abs = path.resolve(path.dirname(importer), src); if (swap[abs]) return swap[abs]; }
      return null;
    } },
    react(), viteSingleFile(),
  ],
  define: { 'process.env': '{}', 'process.version': '"in-page"', 'process.argv': '[]', 'import.meta.env.VITE_INPAGE': '"1"', 'import.meta.env.VITE_MAP_TILE_URL': '""' },
  build: { outDir: 'dist-inpage', assetsInlineLimit: 100000000, chunkSizeWarningLimit: 20000, rollupOptions: { input: 'index.inpage.html' } },
});
