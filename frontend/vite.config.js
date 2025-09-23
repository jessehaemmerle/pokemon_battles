import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // Standard-Vite-Port, kann geändert werden
    proxy: {
      '/api': 'http://localhost:3000', // Weiterleitung an dein Backend
    },
  },
});
