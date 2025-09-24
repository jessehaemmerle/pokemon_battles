import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // nur lokal nützlich, wenn du REST-Routen mit /api hättest
      '/api': 'http://localhost:3000'
    }
  }
});
