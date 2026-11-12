import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function detectBackendPort() {
  const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../questlearn-backend/.env'),
    path.resolve(process.cwd(), '../.env'),
  ];
  for (const candidate of envCandidates) {
    if (fs.existsSync(candidate)) {
      try {
        const content = fs.readFileSync(candidate, 'utf8');
        const match = content.match(/^SERVER_PORT\s*=\s*(\d+)/m);
        if (match) return match[1];
      } catch {
        /* ignore parse errors */
      }
    }
  }
  // QuestLearn's backend runs on 8091; 8080 belongs to another project on this
  // machine, so a missing SERVER_PORT must never send our API calls there.
  return '8091';
}

// Where the dev server forwards /api to. Defaults to detected backend SERVER_PORT
// or overrides with VITE_API_TARGET if explicitly provided.
const apiTarget = process.env.VITE_API_TARGET || `http://localhost:${detectBackendPort()}`;

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
  test: {
    environment: 'jsdom',
    globals: true,
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
