import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Where the dev server forwards /api to. Override when the backend is not on 8080,
// e.g. VITE_API_TARGET=http://localhost:8090 npm run dev
const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    // VITE_PORT lets a second project keep 5173 for itself on a shared machine.
    port: Number(process.env.VITE_PORT) || 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heavy animation libraries out of the entry bundle so the
        // sign-in page never downloads Lottie or confetti, and repeat visits
        // reuse cached vendor chunks.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          animation: ['lottie-react', 'canvas-confetti'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});
