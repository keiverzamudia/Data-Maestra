/**
 * Precarga determinística de variables de entorno (cero dependencias).
 *
 * Se importa como PRIMERA línea de main.ts, antes que Nest y Prisma, para
 * que process.env ya contenga DATABASE_URL y demás cuando PrismaClient se
 * construya. No depende de ConfigModule ni de la profundidad de __dirname
 * (funciona igual desde src/, dist/ o dist/src/).
 *
 * Orden (el primero que aporta cada clave gana; el shell siempre gana):
 *   1. <apps/api>/.env.local
 *   2. <apps/api>/.env
 *   3. <raíz>/.env.local
 *   4. <raíz>/.env
 * La raíz se detecta subiendo hasta el directorio con pnpm-workspace.yaml.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

export interface CargaEntorno {
  archivo: string | null;
  claves: number;
}

function parseDotEnv(contenido: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const linea of contenido.split(/\r?\n/)) {
    const t = linea.trim();
    if (t === '' || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (k === '' || k.startsWith('#')) continue;
    if (v.startsWith('export ')) v = v.slice('export '.length).trim();
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    else if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    vars[k] = v;
  }
  return vars;
}

function subirHasta(inicio: string, marcador: string, max = 12): string | null {
  let dir = inicio;
  for (let i = 0; i < max; i++) {
    if (existsSync(join(dir, marcador))) return dir;
    const padre = dirname(dir);
    if (padre === dir) return null;
    dir = padre;
  }
  return null;
}

function cargar(): CargaEntorno {
  const inicios = [__dirname, process.cwd()];
  let raiz: string | null = null;
  for (const inicio of inicios) {
    const r = subirHasta(inicio, 'pnpm-workspace.yaml');
    if (r) {
      raiz = r;
      break;
    }
  }
  const apiDir = raiz ? join(raiz, 'apps', 'api') : null;
  const candidatos: string[] = [];
  if (apiDir && existsSync(apiDir)) {
    candidatos.push(join(apiDir, '.env.local'), join(apiDir, '.env'));
  }
  if (raiz) {
    candidatos.push(join(raiz, '.env.local'), join(raiz, '.env'));
  }
  let archivo: string | null = null;
  let claves = 0;
  const vistas = new Set<string>();
  for (const ruta of candidatos) {
    if (vistas.has(ruta) || !existsSync(ruta)) continue;
    vistas.add(ruta);
    let vars: Record<string, string>;
    try {
      vars = parseDotEnv(readFileSync(ruta, 'utf8'));
    } catch {
      continue;
    }
    for (const k of Object.keys(vars)) {
      if (!(k in process.env)) {
        const v: string | undefined = vars[k];
        if (typeof v === 'string') {
          process.env[k] = v;
          claves++;
        }
      }
    }
    if (archivo === null && claves > 0) archivo = ruta;
  }
  return { archivo, claves };
}

export const cargaEntorno: CargaEntorno = cargar();
