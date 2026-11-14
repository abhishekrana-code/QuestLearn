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
    // Vite rejects an unknown Host header, which is exactly right: it stops a
    // DNS-rebinding page from reading this dev server. A tunnel arrives with its
    // own hostname, so allow only the tunnel providers' domains rather than
    // turning the check off with `true`.
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.dev', '.ngrok-free.app', '.ngrok.app', '.ts.net'],
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
    // Playwright owns e2e/; vitest must not try to run those specs in jsdom.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heavy animation libraries out of the entry bundle so the
        // sign-in page never downloads Lottie or confetti, and repeat visits
        // reuse cached vendor chunks.
        // Vite 8 builds with Rolldown, which only takes the function form here.
        manualChunks(id) {
          const file = id.replace(/\\/g, '/');
          if (!file.includes('node_modules')) return undefined;
          if (file.includes('framer-motion') || file.includes('motion-dom')) return 'motion';
          if (file.includes('lottie-react') || file.includes('canvas-confetti')) return 'animation';
          if (file.includes('lucide-react')) return 'icons';
          if (
            file.includes('/react/') ||
            file.includes('/react-dom/') ||
            file.includes('react-router')
          ) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
});
