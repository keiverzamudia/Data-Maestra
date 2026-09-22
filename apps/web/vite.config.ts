import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Fuente única de puertos: raíz .env (API_PORT + FRONT_PORT).
// Cambiar de entorno = editar 2 líneas en raíz .env y reiniciar:
//   Principal:  API_PORT=3001 / FRONT_PORT=5173
//   Secundario: API_PORT=3002 / FRONT_PORT=5174
// El shell ($env:API_PORT=...) sigue teniendo prioridad si se define.
// NO editar vite.config.js (artefacto generado, Vite lo prefiere y confunde).
export default defineConfig(({ mode }) => {
  const rootDir = path.resolve(__dirname, '../..');
  const fileEnv = loadEnv(mode, rootDir, '');
  const pick = (k: string) => process.env[k] ?? fileEnv[k];
  const rawApiPort = pick('API_PORT') ?? pick('PORT') ?? '3001';
  const rawFrontPort = pick('VITE_PORT') ?? pick('FRONT_PORT') ?? '5173';
  const apiPort = Number(rawApiPort);
  const frontPort = Number(rawFrontPort);
  const apiTarget =
    pick('VITE_API_TARGET') ?? `http://localhost:${Number.isFinite(apiPort) ? apiPort : 3001}`;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: Number.isFinite(frontPort) ? frontPort : 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/uploads': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
