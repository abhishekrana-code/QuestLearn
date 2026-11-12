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

/**
 * A wrong API target otherwise surfaces only as a page full of failed requests, so
 * probe it once the dev server is listening and say the answer in the terminal.
 */
function checkApiTarget(target) {
  return {
    name: 'questlearn-api-target',
    apply: 'serve',
    configureServer(server) {
      server.httpServer?.once('listening', async () => {
        const url = `${target.replace(/\/$/, '')}/actuator/health`;
        const logger = server.config.logger;
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
          const body = await response.text();
          if (response.ok && body.includes('"status"')) {
            logger.info(`  [api] QuestLearn backend reachable at ${target}`);
            return;
          }
          logger.warn(
            `\n  [api] ${target} answered ${response.status} but is not QuestLearn's backend.` +
              '\n  Check SERVER_PORT in questlearn-backend/.env, or set VITE_API_TARGET.\n',
          );
        } catch {
          logger.warn(
            `\n  [api] no backend answering at ${target} - API calls will fail.` +
              '\n  Start it there, or set VITE_API_TARGET.\n',
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), checkApiTarget(apiTarget)],
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
