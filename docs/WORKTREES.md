# Trabajar con git worktrees (varios entornos en paralelo)

Este proyecto está preparado para que cada **worktree** corra su propio stack
(API + Web) en puertos distintos, sin compartir configuración versionada.

La configuración de puertos vive en un archivo **no versionado** por worktree:

```
<repoRoot>/.env.local
```

## 1. Perfil local (único archivo a copiar)

`.env.local` es el **único** archivo que se copia a mano en cada worktree/clon.
Contiene los puertos del worktree **y** los secretos (por eso nunca se versiona):

```dotenv
API_PORT=3001
WEB_PORT=5173
CORS_ORIGINS=http://localhost:5173
DATABASE_URL="file:../data/dev.db"
JWT_SECRET=
PROFIT_DB_SERVER=
PROFIT_DB_DATABASE=
PROFIT_DB_USER=
PROFIT_DB_PASSWORD=
# ...
```

| Worktree | API_PORT | WEB_PORT |
|---|---|---|
| A (principal) | 3001 | 5173 |
| B | 3002 | 5174 |

Sin `.env.local` se usan los valores históricos (3001 / 5173).

`CORS_ORIGINS` es opcional: la API siempre agrega `http://localhost:$WEB_PORT`
de su propio worktree.

## 2. Crear un worktree

```powershell
# Desde el worktree principal
git worktree add ..\Data-Maestra-b -b feature-x

# En el nuevo worktree
cd ..\Data-Maestra-b
Copy-Item .env.local.example .env.local
# editar .env.local:
#   API_PORT=3002  WEB_PORT=5174  CORS_ORIGINS=http://localhost:5174
#   + credenciales Profit (se copian una vez; no se versionan)
pnpm install                                          # dependencias por worktree
```

## 3. Levantar y administrar

```powershell
pnpm dev                          # API + Web del worktree actual
.\scripts\api-restart.ps1         # build + stop + start + health SOLO del puerto de este worktree
.\scripts\api-stop.ps1
.\scripts\api-health.ps1
.\scripts\verify-local.ps1        # verifica API_PORT y WEB_PORT de este worktree
```

`api-start/stop/health/restart` y `verify-local` leen `.env.local`, por lo que
cada worktree opera únicamente sobre sus propios puertos.

## 4. Notas y limitaciones

- **Base de datos**: cada worktree tiene su propia SQLite (`apps/api/data/dev.db`,
  ignorada por git). Ejecutar migraciones/seed por worktree si hace falta.
- **`node_modules`**: son por worktree; `pnpm install` en cada uno.
- **Cookie de sesión**: `dm_session` es compartida entre worktrees que corren en
  `localhost` (las cookies no distinguen puerto). Al alternar 5173/5174 puede
  pedirse login de nuevo, porque cada worktree tiene su propia base de datos.
- **`vite.config.ts`**: es la única fuente. Los artefactos generados
  (`vite.config.js` / `.d.ts`) se emiten en `node_modules/.tmp/` y están
  ignorados, para que nunca ensombrezcan al `.ts`.

## 5. Solución de problemas

- **Copié la carpeta pero `api-stop` mira el puerto 3001**: la copia no trae
  `scripts/_worktree.ps1` (o trae scripts viejos). Vuelve a copiar la carpeta
  `scripts/` completa desde el repo. Los scripts nuevos imprimen siempre
  `Perfil: API_PORT=...` para que se vea qué configuración leyeron.
- **`api-stop` no encontraba una API vieja**: el `api-stop` nuevo detiene por
  puerto **y** por proceso (`node ... apps\api\dist\main.js` de ese worktree),
  así que atrapa instancias aunque estén en otro puerto. No toca otros
  worktrees.
- **`Remove-Item api.log` en uso**: ya no falla; avisa y continúa agregando
  al log existente. El aviso indica que una instancia anterior sigue viva
  (detenerla primero con `api-stop.ps1`).
- **Dos APIs (3001 y 3002) a la vez**: detener cada una con el `api-stop.ps1`
  de su propio worktree.
- **`nest start --watch` / `pnpm dev`**: `api-stop` no los detiene (cerrarlos
  con Ctrl+C en su terminal); si no, el watcher relanza la API solo.

## 6. Qué se versiona y qué no


| Archivo | Git | Notas |
|---|---|---|
| `.env.local` | **NO** | Único archivo manual por worktree. Puertos + secretos. |
| `.env` (raíz) | **NO** | Obsoleto; ya no se usa. |
| `apps/api/.env` | Sí | Defaults sin secretos (SQLite, prefijo, puerto). |
| `apps/web/.env` | Sí | `VITE_DATA_MODE=api`, sin secretos. |
| `.env.local.example` | Sí | Plantilla de la que se copia `.env.local`. |
| `apps/*/.env.example` | Sí | Plantillas sin secretos. |

## 7. Seguridad

- **Nunca** versionar `.env.local` ni ningún archivo con credenciales reales.
- Si un secreto llegó a commitearse, **rotarlo** en Profit/DBA (cambiar la
  contraseña) aunque ya se haya destrackeado: sigue en el historial.
- Para limpiar el historial (opcional, reescribe commits — coordinar con el
  equipo y hacer respaldo antes):

  ```powershell
  # Opción recomendada: git-filter-repo
  git filter-repo --path apps/api/.env.local --invert-paths --force
  # Alternativa con BFG: java -jar bfg.jar --delete-files '.env.local'
  ```

  Tras reescribir historial: `git push --force-with-lease` y avisar a quienes
  tengan clones.
