import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // loadEnv merges process.env with .env.production; warn (don't fail) if the
  // API base is missing so a build can't silently ship the localhost fallback.
  if (mode === 'production' && !loadEnv(mode, process.cwd(), 'VITE_').VITE_API_BASE) {
    console.warn('[vite] WARNING: VITE_API_BASE is not set for this production build; src/config.js will fall back to https://api.vitallens.app');
  }
  return {
    root: '.',
    plugins: [react()],
    server: {
      port: 3000,
      hmr: {
        protocol: 'ws',
        host: 'localhost',
        port: 3000,
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});
