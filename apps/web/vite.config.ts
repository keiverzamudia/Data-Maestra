import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

/**
 * Puertos por worktree: se leen de `<repoRoot>/.env.local` (no versionado).
 *   API_PORT=3001   → backend al que apunta el proxy /api y /uploads
 *   WEB_PORT=5173   → puerto de Vite (strictPort: falla si está ocupado)
 * Sin ese archivo se usan los valores por defecto históricos (3001/5173).
 *
 * Nota: se parsea el archivo a mano en vez de usar `loadEnv` para NO cargar el
 * `.env` de la raíz (evita filtrar NODE_ENV y empaquetar React de desarrollo).
 */
function readWorktreeEnv(repoRoot: string): Record<string, string> {
  const out: Record<string, string> = {};
  const file = path.join(repoRoot, '.env.local');
  try {
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i <= 0) continue;
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // Sin perfil de worktree: se usan los defaults.
  }
  return out;
}

export default defineConfig(() => {
  const repoRoot = path.resolve(__dirname, '../..');
  const worktreeEnv = readWorktreeEnv(repoRoot);
  const apiPort = Number(process.env.API_PORT ?? worktreeEnv.API_PORT ?? 3001);
  const webPort = Number(process.env.WEB_PORT ?? worktreeEnv.WEB_PORT ?? 5173);
  const apiTarget = `http://localhost:${apiPort}`;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: webPort,
      // Falla explícitamente si el puerto está ocupado en vez de saltar a otro
      // (evita que dos worktrees colisionen silenciosamente).
      strictPort: true,
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
