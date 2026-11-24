import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

function localVercelApiPlugin(): Plugin {
  const routes: Record<string, string> = {
    '/api/health': 'api/health.js',
    '/api/image': 'api/image.js',
    '/api/video': 'api/video.js',
    '/api/proxy': 'api/proxy.js',
    '/api/seedance': 'api/seedance.js',
    '/api/director': 'api/director.js',
  };

  return {
    name: 'flowstudio-local-vercel-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || '';
        const parsed = new URL(rawUrl, 'http://localhost');
        const relFile = routes[parsed.pathname];
        if (!relFile) return next();

        try {
          const absFile = path.resolve(process.cwd(), relFile);
          const mod = await import(`${pathToFileURL(absFile).href}?t=${Date.now()}`);
          const handler = mod.default;

          const query: Record<string, string> = {};
          parsed.searchParams.forEach((v, k) => {
            query[k] = v;
          });

          const compatReq = Object.assign(req, { query });
          const compatRes = Object.assign(res, {
            status(code: number) {
              res.statusCode = code;
              return compatRes;
            },
            json(payload: unknown) {
              if (!res.getHeader('Content-Type')) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
              }
              res.end(JSON.stringify(payload));
              return compatRes;
            },
            send(payload: unknown) {
              if (Buffer.isBuffer(payload) || typeof payload === 'string') {
                res.end(payload);
              } else {
                if (!res.getHeader('Content-Type')) {
                  res.setHeader('Content-Type', 'application/json; charset=utf-8');
                }
                res.end(JSON.stringify(payload));
              }
              return compatRes;
            },
          });

          await handler(compatReq, compatRes);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    localVercelApiPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Cabardo Studio AI Generator FREE Lifetime',
        short_name: 'Cabardo Studio',
        description:
          'Cabardo Studio AI Generator FREE Lifetime — AI Video & Image Studio with Character Bible, Frame Continuity, Storyboard Stitcher, and $0 Dual-GPU Engine.',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//, /\.ipynb$/],
      },
    }),
  ],
  server: {
    port: 5175,
    strictPort: false,
  },
});
