import { ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ProfitArticlePayload } from './profit-article.payload';

/**
 * Adapter de ESCRITURA Profit (FASE 14E §1-§3).
 * - Conexión propia: PROFIT_WRITE_SERVER/DATABASE/USER/PASSWORD, SIN fallback
 *   a las vars de lectura (§21: configuración incompleta jamás habilita).
 * - Feature flag PROFIT_WRITE_ENABLED (default false, §2).
 * - Única escritura autorizada: INSERT de artículo nuevo. NO expone
 *   update/delete de ningún tipo.
 */
@Injectable()
export class ProfitWriteAdapterService {
  private readonly logger = new Logger(ProfitWriteAdapterService.name);
  private pool: any = null;
  private poolPromise: Promise<any> | null = null;

  constructor(private readonly config: ConfigService) {}

  /** ¿Escritura habilitada por flag? Default seguro false (§2). */
  isWriteEnabled(): boolean {
    return this.config.get<string>('PROFIT_WRITE_ENABLED') === 'true';
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

  private async getPool(): Promise<any> {
    this.assertWriteEnabled();
    const { server, database } = this.describeTarget();
    const user = this.config.get<string>('PROFIT_WRITE_USER');
    const password = this.config.get<string>('PROFIT_WRITE_PASSWORD');

    if (this.pool) return this.pool;
    if (this.poolPromise) return this.poolPromise;

    // @ts-ignore
    const mssql: any = await import('mssql');
    const cfg: any = {
      server,
      database,
      options: { encrypt: false, trustServerCertificate: true, connectTimeout: 5000, requestTimeout: 15000 },
      pool: { max: 3, min: 0, idleTimeoutMillis: 30000 },
      connectionTimeout: 5000,
      requestTimeout: 15000,
    };
    if (user && password) {
      cfg.user = user;
      cfg.password = password;
    } else {
      cfg.options.trustedConnection = true;
    }

    this.logger.log(`Connecting (write) to Profit ${server}/${database}`);
    this.poolPromise = new (mssql as any).ConnectionPool(cfg)
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

  private async exec<T>(sql: string, params: Record<string, { type: any; value: any }> = {}): Promise<T[]> {
    let pool: any;
    try {
      pool = await this.getPool();
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof ServiceUnavailableException) throw e;
      throw new ServiceUnavailableException('Profit write unavailable');
    }
    try {
      // @ts-ignore
      const mssql: any = await import('mssql');
      const request = pool.request();
      request.timeout = 15000;
      for (const [name, def] of Object.entries(params)) {
        request.input(name, def.type, def.value);
      }
      const result = await request.query(sql);
      return result.recordset as T[];
    } catch (e: any) {
      this.logger.error(`Profit write failed: ${e?.code ?? e?.number ?? 'SQL_ERROR'}`);
      throw e;
    }
  }

  /** Existence check indexado sobre la PK (14E §9). No trae ART a memoria. */
  async articleExists(coArt: string): Promise<boolean> {
    // @ts-ignore
    const mssql: any = await import('mssql');
    const rows = await this.exec<{ one: number }>(
      `SELECT 1 AS one FROM dbo.art WHERE co_art = @coArt`,
      { coArt: { type: mssql.Char(30), value: coArt.trim() } },
    );
    return rows.length > 0;
  }

  /** Máximo sufijo numérico del prefijo sistemático (punto de partida). */
  async maxSequenceFor(prefix: string): Promise<number> {
    // @ts-ignore
    const mssql: any = await import('mssql');
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
    // @ts-ignore
    const mssql: any = await import('mssql');
    const C = (n: number) => mssql.Char(n);
    await this.exec(
      `INSERT INTO dbo.art (co_art, art_des, tipo, co_lin, co_subl, uni_venta, suni_venta,
        tipo_imp, co_cat, co_color, procedenci, co_prov, tipo_cos, dis_cen)
       VALUES (@co_art, @art_des, @tipo, @co_lin, @co_subl, @uni_venta, @suni_venta,
        @tipo_imp, @co_cat, @co_color, @procedenci, @co_prov, @tipo_cos, @dis_cen)`,
      {
        co_art: { type: C(30), value: p.co_art },
        art_des: { type: mssql.VarChar(120), value: p.art_des },
        tipo: { type: C(1), value: p.tipo },
        co_lin: { type: C(6), value: p.co_lin },
        co_subl: { type: C(6), value: p.co_subl },
        uni_venta: { type: C(6), value: p.uni_venta },
        suni_venta: { type: C(6), value: p.suni_venta },
        tipo_imp: { type: C(1), value: p.tipo_imp },
        co_cat: { type: C(6), value: p.co_cat },
        co_color: { type: C(6), value: p.co_color },
        procedenci: { type: C(6), value: p.procedenci },
        co_prov: { type: C(10), value: p.co_prov },
        tipo_cos: { type: C(4), value: p.tipo_cos },
        dis_cen: { type: mssql.Text, value: p.dis_cen },
      },
    );
  }

  /** Relectura post-INSERT para VERIFY/RECONCILE (§17). */
  async readArticle(coArt: string): Promise<ProfitArticlePayload & { fecha_reg?: string } | null> {
    // @ts-ignore
    const mssql: any = await import('mssql');
    const rows = await this.exec<any>(
      `SELECT TOP 1 LTRIM(RTRIM(co_art)) AS co_art, LTRIM(RTRIM(art_des)) AS art_des,
        LTRIM(RTRIM(tipo)) AS tipo, LTRIM(RTRIM(co_lin)) AS co_lin, LTRIM(RTRIM(co_subl)) AS co_subl,
        LTRIM(RTRIM(uni_venta)) AS uni_venta, LTRIM(RTRIM(suni_venta)) AS suni_venta,
        LTRIM(RTRIM(tipo_imp)) AS tipo_imp, LTRIM(RTRIM(co_cat)) AS co_cat, LTRIM(RTRIM(co_color)) AS co_color,
        LTRIM(RTRIM(procedenci)) AS procedenci, LTRIM(RTRIM(co_prov)) AS co_prov,
        LTRIM(RTRIM(tipo_cos)) AS tipo_cos, LTRIM(RTRIM(ISNULL(dis_cen,''))) AS dis_cen
       FROM dbo.art WHERE co_art = @coArt`,
      { coArt: { type: mssql.Char(30), value: coArt.trim() } },
    );
    return rows[0] ?? null;
  }
}
