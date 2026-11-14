import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: { 'import.meta.env.VITE_INPAGE': 'false' },
  server: { port: 5173, proxy: { '/api': { target: process.env.GUARDIAN_API || 'http://localhost:4000', changeOrigin: true } } },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: { output: { manualChunks: { three: ['three', '@react-three/fiber', '@react-three/drei'], charts: ['recharts'], map: ['leaflet', 'react-leaflet'] } } },
  },
});
