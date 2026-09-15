import { ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { profitDriver, PROFIT_ODBC_DRIVER, PROFIT_SQL_PORT } from './profit-driver';
import { buildInsertStatement } from './profit-article.payload';
import type { ProfitArticlePayload } from './profit-article.payload';

/**
 * Adapter de ESCRITURA Profit (FASE 14E §1-§3, 14J modos de auth).
 * - Conexión propia: PROFIT_WRITE_SERVER/DATABASE (+USER/PASSWORD solo en
 *   modo sql), SIN fallback a las vars de lectura (config incompleta jamás
 *   habilita).
 * - PROFIT_WRITE_AUTH=windows|sql (default sql). Windows usa el driver
 *   nativo msnodesqlv8 + ODBC con la identidad del proceso API (tedious v20
 *   ignora trustedConnection: probado ELOGIN, no reintentarlo).
 * - Feature flag PROFIT_WRITE_ENABLED (default false).
 * - Única escritura autorizada: INSERT de artículo nuevo. NO expone
 *   update/delete de ningún tipo.
 */
export type ProfitWriteAuth = 'windows' | 'sql';

@Injectable()
export class ProfitWriteAdapterService {
  private readonly logger = new Logger(ProfitWriteAdapterService.name);
  private pool: any = null;
  private poolPromise: Promise<any> | null = null;
  private typeLib: any = null;

  constructor(private readonly config: ConfigService) {}

  /** ¿Escritura habilitada por flag? Default seguro false (§2). */
  isWriteEnabled(): boolean {
    return this.config.get<string>('PROFIT_WRITE_ENABLED') === 'true';
  }

  /** Modo de autenticación (default sql = comportamiento histórico). */
  authMode(): ProfitWriteAuth {
    return this.config.get<string>('PROFIT_WRITE_AUTH') === 'windows' ? 'windows' : 'sql';
  }

  assertWriteEnabled(): void {
    if (!this.isWriteEnabled()) {
      throw new ForbiddenException('Profit write disabled by feature flag (PROFIT_WRITE_ENABLED=false)');
    }
  }

  /** Destino de escritura: servidor/base/entorno, sin secretos en errores. */
  describeTarget(): { server: string; database: string } {
    const server = this.config.get<string>('PROFIT_WRITE_SERVER') ?? '';
    const database = this.config.get<string>('PROFIT_WRITE_DATABASE') ?? '';
    if (!server || !database) {
      throw new ServiceUnavailableException('Profit write not configured (PROFIT_WRITE_SERVER/DATABASE missing)');
    }
    return { server, database };
  }

  private async getPool(requireFlag = true): Promise<any> {
    if (requireFlag) this.assertWriteEnabled();
    const { server, database } = this.describeTarget();
    const mode = this.authMode();

    if (this.pool) return this.pool;
    if (this.poolPromise) return this.poolPromise;

    if (mode === 'windows') {
      this.poolPromise = this.connectWindows(server, database);
      return this.poolPromise;
    }

    const user = this.config.get<string>('PROFIT_WRITE_USER');
    const password = this.config.get<string>('PROFIT_WRITE_PASSWORD');
    if (!(user && password)) {
      // 14I: tedious v20 IGNORA trustedConnection (sin SSPI implícito) y
      // NTLM exige password explícito. Fallar cerrado y claro en vez de
      // un ELOGIN confuso: el modo sql exige credencial explícita.
      throw new ServiceUnavailableException(
        'Profit write requires explicit SQL credentials (PROFIT_WRITE_USER/PASSWORD); driver has no passwordless Windows auth',
      );
    }
    // 14N: UNA SOLA clase de pool en todo el módulo (wrapper msnodesqlv8).
    // Usar aquí la clase tedious rompería el invariante 14K.2 (flip global
    // shared.driver); el wrapper soporta SQL auth vía Uid/Pwd igualmente.
    const sqlw: any = await profitDriver();
    this.typeLib = sqlw;
    const cfg: any = {
      driver: PROFIT_ODBC_DRIVER,
      server,
      database,
      port: PROFIT_SQL_PORT,
      user,
      password,
      options: { encrypt: false, trustServerCertificate: true, connectTimeout: 5000, requestTimeout: 15000 },
      connectionTimeout: 5000,
      requestTimeout: 15000,
    };

    this.logger.log(`Connecting (write, sql auth) to Profit ${server}/${database}`);
    this.poolPromise = new sqlw.ConnectionPool(cfg)
      .connect()
      .then((pool: any) => {
        this.pool = pool;
        this.pool.on('error', (err: any) => {
          this.logger.error(`Profit write pool error: ${err?.message}`);
          this.pool = null;
          this.poolPromise = null;
        });
        return pool;
      })
      .catch((err: any) => {
        this.poolPromise = null;
        this.logger.error('Profit write connection failed (sin secretos en el mensaje)');
        throw new ServiceUnavailableException(`Profit write unavailable: ${err?.code ?? 'CONNECT_FAIL'}`);
      });
    return this.poolPromise;
  }

  /** Conexión Windows integrada real (msnodesqlv8 + ODBC, identidad del proceso). */
  private async connectWindows(server: string, database: string): Promise<any> {
    // @ts-ignore
    const sqlw: any = await import('mssql/msnodesqlv8');
    this.typeLib = sqlw;
    this.logger.log(`Connecting (write, windows auth) to Profit ${server}/${database}`);
    this.poolPromise = new sqlw.ConnectionPool({
      driver: 'ODBC Driver 18 for SQL Server',
      server,
      database,
      port: 1433,
      options: { trustedConnection: true, encrypt: false, trustServerCertificate: true },
      connectionTimeout: 5000,
      requestTimeout: 15000,
    })
      .connect()
      .then((pool: any) => {
        this.pool = pool;
        if (typeof this.pool?.on === 'function') {
          this.pool.on('error', (err: any) => {
            this.logger.error(`Profit write pool error: ${err?.message}`);
            this.pool = null;
            this.poolPromise = null;
          });
        }
        return pool;
      })
      .catch((err: any) => {
        this.poolPromise = null;
        this.logger.error('Profit write connection failed (sin secretos en el mensaje)');
        throw new ServiceUnavailableException(`Profit write unavailable: ${err?.code ?? 'CONNECT_FAIL'}`);
      });
    return this.poolPromise;
  }

  /** Librería de tipos: siempre la del driver único (14K.2). */
  private async types(): Promise<any> {
    if (this.typeLib) return this.typeLib;
    const sqlw: any = await profitDriver();
    this.typeLib = sqlw;
    return sqlw;
  }

  /**
   * Prueba de conexión READ-ONLY (14J §7): abre el pool y ejecuta un único
   * SELECT de identidad. No escribe, no habilita nada, no usa el flag.
   * El flag se sigue exigiendo en cada operación de escritura/lectura del motor.
   */
  async testConnection(): Promise<{ connected: boolean; identity?: string; database?: string; server?: string; code?: string }> {
    let target: { server: string; database: string };
    try {
      target = this.describeTarget();
    } catch {
      return { connected: false, code: 'NOT_CONFIGURED' };
    }
    try {
      const pool = await this.getPool(false);
      const request = pool.request();
      request.timeout = 10000;
      const result = await request.query('SELECT SYSTEM_USER AS u, DB_NAME() AS db');
      const row = (result.recordset ?? [])[0];
      return { connected: true, identity: row?.u ?? undefined, database: row?.db ?? target.database, server: target.server };
    } catch (e: any) {
      if (e instanceof ServiceUnavailableException) {
        return { connected: false, code: 'NOT_CONFIGURED' };
      }
      this.logger.error(`Profit write connection test failed: ${e?.code ?? 'CONNECT_FAIL'}`);
      return { connected: false, code: e?.code ?? 'CONNECT_FAIL' };
    }
  }

  private async exec<T>(sql: string, params: Record<string, { type: any; value: any }> = {}): Promise<T[]> {
    let pool: any;
    try {
      pool = await this.getPool(true);
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof ServiceUnavailableException) throw e;
      throw new ServiceUnavailableException('Profit write unavailable');
    }
    try {
      const request = pool.request();
      request.timeout = 15000;
      for (const [name, def] of Object.entries(params)) {
        request.input(name, def.type, def.value);
      }
      const result = await request.query(sql);
      return ((result.recordset ?? []) as T[]);
    } catch (e: any) {
      this.logger.error(`Profit write failed: ${e?.code ?? e?.number ?? 'SQL_ERROR'}`);
      throw e;
    }
  }

  /** Existence check indexado sobre la PK (14E §9). No trae ART a memoria. */
  async articleExists(coArt: string): Promise<boolean> {
    const mssql: any = await this.types();
    const rows = await this.exec<{ one: number }>(
      `SELECT 1 AS one FROM dbo.art WHERE co_art = @coArt`,
      { coArt: { type: mssql.Char(30), value: coArt.trim() } },
    );
    return rows.length > 0;
  }

  /** Máximo sufijo numérico del prefijo sistemático (punto de partida). */
  async maxSequenceFor(prefix: string): Promise<number> {
    const mssql: any = await this.types();
    const rows = await this.exec<{ m: string | null }>(
      `SELECT MAX(RIGHT(LTRIM(RTRIM(co_art)), 4)) AS m FROM dbo.art
       WHERE LTRIM(RTRIM(co_art)) LIKE @pfx + '[0-9][0-9][0-9][0-9]'
       AND LEN(LTRIM(RTRIM(co_art))) = LEN(@pfx) + 4`,
      { pfx: { type: mssql.VarChar(12), value: prefix } },
    );
    const m = rows[0]?.m;
    return m && /^\d+$/.test(m) ? parseInt(m, 10) : 0;
  }

  /** ÚNICA escritura autorizada: INSERT de artículo nuevo (§1). */
  async insertArticle(p: ProfitArticlePayload): Promise<void> {
    const mssql: any = await this.types();
    const { sql, params } = buildInsertStatement(p);
    const bound: Record<string, { type: any; value: any }> = {};
    for (const par of params) {
      bound[par.name] = {
        type: par.kind === 'char' ? mssql.Char(par.size) : mssql.VarChar(par.size),
        value: par.value,
      };
    }
    await this.exec(sql, bound);
  }

  /** Relectura post-INSERT para VERIFY/RECONCILE (§17). */
  async readArticle(coArt: string): Promise<ProfitArticlePayload & { fecha_reg?: string } | null> {
    const mssql: any = await this.types();
    const rows = await this.exec<any>(
      `SELECT TOP 1 LTRIM(RTRIM(co_art)) AS co_art, LTRIM(RTRIM(art_des)) AS art_des,
        LTRIM(RTRIM(tipo)) AS tipo, LTRIM(RTRIM(co_lin)) AS co_lin, LTRIM(RTRIM(co_subl)) AS co_subl,
        LTRIM(RTRIM(uni_venta)) AS uni_venta, LTRIM(RTRIM(suni_venta)) AS suni_venta,
        LTRIM(RTRIM(tipo_imp)) AS tipo_imp, LTRIM(RTRIM(co_cat)) AS co_cat, LTRIM(RTRIM(co_color)) AS co_color,
        LTRIM(RTRIM(procedenci)) AS procedenci, LTRIM(RTRIM(co_prov)) AS co_prov,
        LTRIM(RTRIM(tipo_cos)) AS tipo_cos, LTRIM(RTRIM(CAST(ISNULL(dis_cen,'') AS VARCHAR(MAX)))) AS dis_cen
       FROM dbo.art WHERE co_art = @coArt`,
      { coArt: { type: mssql.Char(30), value: coArt.trim() } },
    );
    return rows[0] ?? null;
  }
}
