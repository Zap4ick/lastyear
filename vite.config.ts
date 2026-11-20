import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const API = `http://127.0.0.1:${process.env.API_PORT ?? 8787}`;

/** Dev only: serve generated helper pages from .dev/ at /__dev/ (e.g. `npm run fixture:payload`). */
function devFiles(): Plugin {
  return {
    name: 'dev-files',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev', (req, res, next) => {
        const file = normalize(join('.dev', decodeURIComponent((req.url ?? '/').split('?')[0]!)));
        if (!file.startsWith('.dev') || !existsSync(file)) return next();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(readFileSync(file));
      });
    },
  };
}

export default defineConfig({
  root: 'src/web',
  plugins: [react(), devFiles()],
  build: { outDir: '../../dist/web', emptyOutDir: true },
  server: {
    port: 5173,
    strictPort: true,
    // Regex keys: a plain '/api' prefix would also catch the module /api.ts.
    proxy: { '^/api/': API, '^/b\\.js': API },
  },
});
