import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsuariosService } from './usuarios.service';

/**
 * 10H — Sincronización automática diaria de usuarios Profit.
 * Usa la MISMA función central que el botón manual:
 * UsuariosService.synchronize(). Sin duplicar lógica.
 *
 * Configuración:
 * - PROFIT_USER_SYNC_ENABLED=true/false (por defecto true: una ejecución diaria).
 * - PROFIT_USER_SYNC_HOUR=0-23 (por defecto 3).
 *
 * Nunca ejecuta al iniciar salvo que corresponda al horario; nunca permite
 * ejecuciones concurrentes (segunda llamada se omite). Cada ejecución queda
 * registrada en ProfitUserSyncRun por synchronize() (incluidos fallos de Profit,
 * que no modifican usuarios locales).
 */
@Injectable()
export class ProfitUserSyncScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProfitUserSyncScheduler.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('PROFIT_USER_SYNC_ENABLED', 'true') !== 'true') {
      this.logger.log('Sincronización automática de usuarios Profit deshabilitada.');
      return;
    }
    this.scheduleNext();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  private syncHour(): number {
    const h = Number(this.config.get<string>('PROFIT_USER_SYNC_HOUR', '3'));
    return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 3;
  }

  private msUntilNextRun(now = new Date()): number {
    const next = new Date(now);
    next.setHours(this.syncHour(), 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }

  private scheduleNext() {
    const ms = this.msUntilNextRun();
    this.logger.log(`Próxima sincronización de usuarios Profit en ${Math.round(ms / 60000)} min.`);
    this.timer = setTimeout(() => void this.tick(), ms);
    if (this.timer.unref) this.timer.unref();
  }

  /** Ejecuta UNA sincronización (misma función que el botón manual). */
  async tick(): Promise<'ok' | 'failed' | 'skipped-concurrent'> {
    if (this.running) {
      this.logger.warn('Sincronización omitida: ya hay una en curso.');
      return 'skipped-concurrent';
    }
    this.running = true;
    try {
      // Actor indefinido = ejecución del sistema (auditoría sin actor).
      await this.usuariosService.synchronize();
      return 'ok';
    } catch (e: any) {
      this.logger.error(`Sincronización programada falló: ${e?.message ?? e}`);
      return 'failed';
    } finally {
      this.running = false;
      if (this.config.get<string>('PROFIT_USER_SYNC_ENABLED', 'true') === 'true') {
        this.scheduleNext();
      }
    }
  }
}
