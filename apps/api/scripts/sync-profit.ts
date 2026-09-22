/**
 * Sincronización manual Profit → usuarios locales (SOLO sincroniza).
 *
 * Uso (desde la raíz del checkout Pruebas):
 *   pnpm --filter @master-data/api run db:sync-profit
 *
 * Requisitos: PROFIT_DB_SERVER/DATABASE/USER/PASSWORD (+PROFIT_ENV) en el
 * .env raíz. Sin ellos falla cerrado sin modificar nada local.
 *
 * Efectos: SOLO lecturas hacia Profit (getProfitUsers, SELECT) y escrituras
 * en el SQLite LOCAL (create/update de users + fila ProfitUserSyncRun de
 * auditoría). Nunca escribe en Profit. No otorga roles ni permisos.
 * No levanta ningún puerto (contexto de aplicación, sin listen).
 */
import '../src/entorno/cargar-entorno';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { UsuariosService } from '../src/modulos/usuarios/usuarios.service';
import { PrismaService } from '../src/comun/prisma/prisma.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const usuarios = app.get(UsuariosService);
    // Sin actor (igual que el scheduler): la auditoría registra ejecución
    // del sistema. Pasar un id inexistente rompería la FK de auditEvent.
    const r = await usuarios.synchronize();
    const prisma = app.get(PrismaService);
    const keibe = await prisma.user.findFirst({
      where: {
        OR: [
          { profitCode: { contains: 'keibe' } },
          { username: { contains: 'keibe' } },
          { displayName: { contains: 'keibe' } },
        ],
      },
      select: { id: true, username: true, profitCode: true, active: true },
    });
    const conCodigo = await prisma.user.count({ where: { profitCode: { not: null } } });
    console.log(
      JSON.stringify(
        { ok: true, ...r, usuariosConProfitCode: conCodigo, keibe },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e?.message ?? String(e) }));
  process.exitCode = 1;
});
