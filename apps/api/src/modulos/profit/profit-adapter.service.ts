import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ARTICLE_TYPE_LABELS,
  FUNCTIONAL_ARTICLE_TYPES,
} from './article-taxonomy';

export interface ProfitArticle {
  co_art: string;
  art_des: string;
  co_lin: string;
  co_subl: string;
  co_cat: string;
  co_color: string;
  uni_venta: string;
  stock_act: number;
}

export interface ProfitGroup {
  co_lin: string;
  lin_des: string;
}

export interface ProfitSubgroup {
  co_lin: string;
  co_subl: string;
  subl_des: string;
}

export interface ProfitUnit {
  co_uni: string;
  des_uni: string;
}

export interface ProfitCategory {
  co_cat: string;
  cat_des: string;
}

/**
 * Marca Profit = dbo.colores (art.co_color FK → colores).
 * En la UI de Profit aparece como "Marca/Subgrupo" (FASE 8F: AD_TRANS tiene
 * 01/NO APLICA, F01/GASOLINA…; AD_DIST tiene 01/NO APLICA).
 */
export interface ProfitBrand {
  co_col: string;
  des_col: string;
}

/** Cuenta contable Profit (origen: xart_cont ctaN/nom_ctaN, solo cuentas usadas). */
export interface ProfitAccount {
  code: string;
  description: string;
}

/** Posición del estándar contable de un grupo Profit (origen: lin_art.dis_cen). */
export interface ProfitGroupStandardPosition {
  position: string;
  code: string;
  description: string;
  inCatalog: boolean;
}

export interface ProfitGroupStandard {
  groupCode: string;
  configured: boolean;
  positions: ProfitGroupStandardPosition[];
}

/**
 * Tipo de artículo Profit (FASE 14C-FORM §5). Fuente maestra: CHECK
 * `CK_art_TIPO` + uso real en `dbo.art`. Sin tabla catálogo ni lista manual.
 */
export interface ProfitArticleType {
  code: string;
  label: string;
  functional: boolean;
  usageCount: number;
}

/** Tasa de impuesto Profit (origen: dbo.tabulado, FK de art.tipo_imp). */
export interface ProfitTaxType {
  tipo: string;
  descripcio: string;
}

/** Persona de Profit: código externo estable + nombre visible. Sin secretos. */
export interface ProfitUser {
  profitCode: string;
  displayName: string;
}

@Injectable()
export class ProfitAdapterService {
  private readonly logger = new Logger(ProfitAdapterService.name);
  private pool: any = null;
  private poolPromise: Promise<any> | null = null;

  constructor(private readonly config: ConfigService) {}

  private getConfig() {
    const server = this.config.get<string>('PROFIT_DB_SERVER');
    const database = this.config.get<string>('PROFIT_DB_DATABASE');
    const user = this.config.get<string>('PROFIT_DB_USER');
    const password = this.config.get<string>('PROFIT_DB_PASSWORD');
    const writeEnabled = this.config.get<string>('PROFIT_WRITE_ENABLED') === 'true';
    const env = this.config.get<string>('PROFIT_ENV') || 'production';

    return { server, database, user, password, writeEnabled, env };
  }

  private assertReadOnly() {
    // This adapter is READ-ONLY. Any future write must check protection.
    const { writeEnabled, database, env } = this.getConfig();
    if (writeEnabled && database?.toUpperCase() === 'AD_DIST' && env === 'production') {
      throw new Error('PROTECTION: PROFIT_WRITE_ENABLED=true blocked for AD_DIST in production');
    }
  }

  private async getPool(): Promise<any> {
    const { server, database, user, password } = this.getConfig();

    if (!server || !database) {
      throw new ServiceUnavailableException('Profit not configured (PROFIT_DB_SERVER/DATABASE missing)');
    }

    if (this.pool && this.pool.connected) {
      return this.pool;
    }

    if (this.poolPromise) {
      return this.poolPromise;
    }

    // Lazy import to allow app to start without mssql if not needed
    // @ts-ignore
    const mssql: any = await import('mssql');

    const config: any = {
      server,
      database,
      options: {
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: 5000,
        requestTimeout: 10000,
      },
      pool: {
        max: 5,
        min: 0,
        idleTimeoutMillis: 30000,
      },
      connectionTimeout: 5000,
      requestTimeout: 10000,
    };

    if (user && password) {
      config.user = user;
      config.password = password;
    } else {
      // Windows Authentication
      config.options.trustedConnection = true;
    }

    this.logger.log(`Connecting to Profit ${server}/${database} (user=${user ? '***' : 'WindowsAuth'})`);

    // @ts-ignore - mssql types provided via @types/mssql
    this.poolPromise = new (mssql as any).ConnectionPool(config)
      .connect()
      .then((pool: any) => {
        this.pool = pool;
        this.pool.on('error', (err: any) => {
          this.logger.error(`Profit pool error: ${err.message}`);
          this.pool = null;
          this.poolPromise = null;
        });
        this.logger.log('Profit pool connected');
        return pool;
      })
      .catch((err: any) => {
        this.poolPromise = null;
        this.logger.error(`Profit connection failed: ${err.message}`);
        throw new ServiceUnavailableException(`Profit unavailable: ${err.message}`);
      });

    return this.poolPromise;
  }

  private async query<T>(sql: string, params: Record<string, { type: any; value: any }> = {}): Promise<T[]> {
    this.assertReadOnly();
    let pool: any;
    try {
      pool = await this.getPool();
    } catch (e: any) {
      throw new ServiceUnavailableException(e.message);
    }

    try {
      // @ts-ignore
    const mssql: any = await import('mssql');
      const request = pool.request();
      request.timeout = 10000;
      for (const [name, def] of Object.entries(params)) {
        request.input(name, def.type, def.value);
      }
      const result = await request.query(sql);
      return result.recordset as T[];
    } catch (e: any) {
      this.logger.error(`Profit query failed: ${e.message}`);
      if (e.code === 'ETIMEOUT' || e.code === 'EREQUEST') {
        throw new ServiceUnavailableException(`Profit timeout: ${e.message}`);
      }
      throw new ServiceUnavailableException(`Profit query error: ${e.message}`);
    }
  }

  async getArticle(co_art: string): Promise<ProfitArticle | null> {
    // @ts-ignore
    const mssql: any = await import('mssql');
    const rows = await this.query<ProfitArticle>(
      `SELECT TOP 1 co_art, art_des, co_lin, co_subl, co_cat, co_color, uni_venta, stock_act
       FROM dbo.art WHERE LTRIM(RTRIM(co_art)) = LTRIM(RTRIM(@co_art))`,
      { co_art: { type: mssql.VarChar(30), value: co_art } },
    );
    return rows[0] ?? null;
  }

  async getArticles(limit = 20, search?: string, co_lin?: string): Promise<ProfitArticle[]> {
    // @ts-ignore
    const mssql: any = await import('mssql');
    let sql = `SELECT TOP (@limit) co_art, art_des, co_lin, co_subl, co_cat, co_color, uni_venta, stock_act FROM dbo.art`;
    const params: any = { limit: { type: mssql.Int, value: limit } };
    const conditions: string[] = [];
    if (search) {
      conditions.push(`art_des LIKE '%' + @search + '%'`);
      params.search = { type: mssql.VarChar(120), value: search };
    }
    if (co_lin) {
      conditions.push(`LTRIM(RTRIM(co_lin)) = LTRIM(RTRIM(@co_lin))`);
      params.co_lin = { type: mssql.VarChar(6), value: co_lin };
    }
    if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += ` ORDER BY co_art`;
    return this.query<ProfitArticle>(sql, params);
  }

  async getGroups(): Promise<ProfitGroup[]> {
    return this.query<ProfitGroup>(`SELECT co_lin, lin_des FROM dbo.lin_art ORDER BY co_lin`);
  }

  async getGroup(co_lin: string): Promise<ProfitGroup | null> {
    // @ts-ignore
    const mssql: any = await import('mssql');
    const rows = await this.query<ProfitGroup>(
      `SELECT TOP 1 co_lin, lin_des FROM dbo.lin_art WHERE LTRIM(RTRIM(co_lin)) = LTRIM(RTRIM(@co_lin))`,
      { co_lin: { type: mssql.VarChar(6), value: co_lin } },
    );
    return rows[0] ?? null;
  }

  async getSubgroups(co_lin?: string): Promise<ProfitSubgroup[]> {
    // @ts-ignore
    const mssql: any = await import('mssql');
    if (co_lin) {
      return this.query<ProfitSubgroup>(
        `SELECT co_lin, co_subl, subl_des FROM dbo.sub_lin WHERE LTRIM(RTRIM(co_lin)) = LTRIM(RTRIM(@co_lin)) ORDER BY co_subl`,
        { co_lin: { type: mssql.VarChar(6), value: co_lin } },
      );
    }
    return this.query<ProfitSubgroup>(`SELECT co_lin, co_subl, subl_des FROM dbo.sub_lin ORDER BY co_lin, co_subl`);
  }

  async getSubgroup(co_lin: string, co_subl: string): Promise<ProfitSubgroup | null> {
    // @ts-ignore
    const mssql: any = await import('mssql');
    const rows = await this.query<ProfitSubgroup>(
      `SELECT TOP 1 co_lin, co_subl, subl_des FROM dbo.sub_lin WHERE LTRIM(RTRIM(co_lin)) = LTRIM(RTRIM(@co_lin)) AND LTRIM(RTRIM(co_subl)) = LTRIM(RTRIM(@co_subl))`,
      {
        co_lin: { type: mssql.VarChar(6), value: co_lin },
        co_subl: { type: mssql.VarChar(6), value: co_subl },
      },
    );
    return rows[0] ?? null;
  }

  async getUnits(): Promise<ProfitUnit[]> {
    return this.query<ProfitUnit>(`SELECT co_uni, des_uni FROM dbo.unidades ORDER BY co_uni`);
  }

  async getUnit(co_uni: string): Promise<ProfitUnit | null> {
    // @ts-ignore
    const mssql: any = await import('mssql');
    const rows = await this.query<ProfitUnit>(
      `SELECT TOP 1 co_uni, des_uni FROM dbo.unidades WHERE LTRIM(RTRIM(co_uni)) = LTRIM(RTRIM(@co_uni))`,
      { co_uni: { type: mssql.VarChar(6), value: co_uni } },
    );
    return rows[0] ?? null;
  }

  /**
   * Tipos de artículo Profit (FASE 14C-FORM §5, READ-ONLY). Fuente maestra:
   * definición del CHECK `CK_art_TIPO` cruzada con el uso real en `dbo.art`.
   * Sin lista manual: si Profit amplía el CHECK, aparece solo.
   */
  async getArticleTypes(): Promise<ProfitArticleType[]> {
    const defRows = await this.query<{ definition: string }>(
      `SELECT definition FROM sys.check_constraints WHERE name = 'CK_art_TIPO'`,
    );
    const definition = defRows[0]?.definition ?? '';
    const codes: string[] = [...new Set(
      [...definition.matchAll(/'([A-Z0-9])'/g)].map((m) => m[1]).filter((c): c is string => !!c),
    )];
    const usage = await this.query<{ tipo: string; n: number }>(
      `SELECT CAST(tipo AS VARCHAR(5)) AS tipo, COUNT(*) AS n FROM dbo.art GROUP BY CAST(tipo AS VARCHAR(5))`,
    );
    const usageByCode = new Map(usage.map((u) => [(u.tipo ?? '').trim(), u.n]));
    return codes.map((code) => ({
      code,
      label: (ARTICLE_TYPE_LABELS as Record<string, string>)[code] ?? `Tipo ${code}`,
      functional: (FUNCTIONAL_ARTICLE_TYPES as readonly string[]).includes(code),
      usageCount: usageByCode.get(code) ?? 0,
    }));
  }

  /**
   * Tipo dominante de una línea Profit (sugerencia de default, FASE 14C-FORM §6).
   * No impone nada: el tipo pertenece a la solicitud.
   */
  async getLineDefaultType(co_lin: string): Promise<{ groupCode: string; defaultType: string | null }> {
    // @ts-ignore
    const mssql: any = await import('mssql');
    const rows = await this.query<{ tipo: string; n: number }>(
      `SELECT TOP 1 CAST(tipo AS VARCHAR(5)) AS tipo, COUNT(*) AS n FROM dbo.art WHERE LTRIM(RTRIM(co_lin)) = LTRIM(RTRIM(@co_lin)) GROUP BY CAST(tipo AS VARCHAR(5)) ORDER BY COUNT(*) DESC`,
      { co_lin: { type: mssql.VarChar(6), value: co_lin } },
    );
    return { groupCode: co_lin.trim(), defaultType: (rows[0]?.tipo ?? '').trim() || null };
  }

  /** Tasas de impuesto Profit (origen: dbo.tabulado, READ-ONLY). */
  async getTaxTypes(): Promise<ProfitTaxType[]> {
    return this.query<ProfitTaxType>(
      `SELECT LTRIM(RTRIM(CAST(tipo AS VARCHAR(10)))) AS tipo, LTRIM(RTRIM(descripcio)) AS descripcio FROM dbo.tabulado ORDER BY tipo`,
    );
  }

  async getCategories(): Promise<ProfitCategory[]> {
    return this.query<ProfitCategory>(`SELECT co_cat, cat_des FROM dbo.cat_art ORDER BY co_cat`);
  }

  async getCategory(co_cat: string): Promise<ProfitCategory | null> {
    // @ts-ignore
    const mssql: any = await import('mssql');
    const rows = await this.query<ProfitCategory>(
      `SELECT TOP 1 co_cat, cat_des FROM dbo.cat_art WHERE LTRIM(RTRIM(co_cat)) = LTRIM(RTRIM(@co_cat))`,
      { co_cat: { type: mssql.VarChar(6), value: co_cat } },
    );
    return rows[0] ?? null;
  }

  /**
   * Catálogo maestro de cuentas contables (READ-ONLY) — Fase 8E.6.
   * Fuente: C_DIST.dbo.sccuenta (855 cuentas; ver
   * docs/INVESTIGACION_CATALOGO_CUENTAS_PROFIT_8E5.md).
   * Por defecto solo imputables activas (detalle=1 AND inactivo=0, 489).
   * xart_cont queda como referencia de configuraciones por artículo
   * (y origen de c9, que no existe en columnas), no como catálogo.
   */
  async getAccounts(limit = 20, offset = 0, search?: string): Promise<ProfitAccount[]> {
    // @ts-ignore
    const mssql: any = await import('mssql');
    let sql = `SELECT LTRIM(RTRIM(co_cue)) AS code, LTRIM(RTRIM(des_cue)) AS description FROM C_DIST.dbo.sccuenta WHERE detalle = 1 AND inactivo = 0`;
    const params: any = {
      limit: { type: mssql.Int, value: limit },
      offset: { type: mssql.Int, value: offset },
    };
    if (search) {
      sql += ` AND (co_cue LIKE '%' + @search + '%' OR des_cue LIKE '%' + @search + '%')`;
      params.search = { type: mssql.VarChar(120), value: search };
    }
    sql += ` ORDER BY co_cue OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
    return this.query<ProfitAccount>(sql, params);
  }

  async getBrands(): Promise<ProfitBrand[]> {
    return this.query<ProfitBrand>(`SELECT co_col, des_col FROM dbo.colores ORDER BY co_col`);
  }
  async getBrand(co_col: string): Promise<ProfitBrand | null> {
    // @ts-ignore
    const mssql: any = await import('mssql');
    const rows = await this.query<ProfitBrand>(
      `SELECT TOP 1 co_col, des_col FROM dbo.colores WHERE LTRIM(RTRIM(co_col)) = LTRIM(RTRIM(@co_col))`,
      { co_col: { type: mssql.VarChar(6), value: co_col } },
    );
    return rows[0] ?? null;
  }

  async getArticleWithDetails(co_art: string) {
    const article = await this.getArticle(co_art);
    if (!article) return null;
    const [group, subgroup, unit] = await Promise.all([
      this.getGroup(article.co_lin.trim()),
      this.getSubgroup(article.co_lin.trim(), article.co_subl.trim()),
      this.getUnit(article.uni_venta.trim()),
    ]);
    return { article, group, subgroup, unit };
  }

  /**
   * 12C — Estándar contable de un grupo (READ-ONLY).
   * Fuente maestra: dbo.lin_art.dis_cen (`<DIS> {c1:..} </DIS>`, con espacios).
   * Normaliza espacios/saltos/CHAR padding y omite posiciones vacías (`{c8:}`).
   * Descripciones desde C_DIST.dbo.sccuenta; lo no encontrado se marca
   * inCatalog:false (cuentas obsoletas con uso vivo, ver 12A) sin bloquear.
   */
  async getGroupAccountingStandard(groupCode: string): Promise<ProfitGroupStandard> {
    // @ts-ignore
    const mssql: any = await import('mssql');
    const code = (groupCode ?? '').trim();
    const rows = await this.query<{ dis: string | null }>(
      `SELECT CAST(dis_cen AS VARCHAR(2000)) AS dis FROM dbo.lin_art WHERE LTRIM(RTRIM(co_lin)) = LTRIM(RTRIM(@co))`,
      { co: { type: mssql.VarChar(6), value: code } },
    );
    const raw = (rows[0]?.dis ?? '').replace(/\r/g, '');
    const body = /^<DIS>(.*)<\/DIS>$/s.exec(raw.trim())?.[1] ?? '';
    const parsed = new Map<string, string>();
    const re = /\{(c\d{1,2}):([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const key = m[1]!;
      if (!/^c([1-9]|10)$/.test(key) || parsed.has(key)) continue;
      const account = (m[2] ?? '').trim();
      if (account) parsed.set(key, account);
    }
    const positions: ProfitGroupStandardPosition[] = [];
    for (const [position, account] of [...parsed.entries()].sort((a, b) => parseInt(a[0].slice(1), 10) - parseInt(b[0].slice(1), 10))) {
      const found = await this.getAccountByCode(account);
      positions.push({
        position,
        code: account,
        description: found?.description ?? '',
        inCatalog: !!found,
      });
    }
    return { groupCode: code, configured: positions.length > 0, positions };
  }

  async getAccountByCode(code: string): Promise<ProfitAccount | null> {
    // @ts-ignore
    const mssql: any = await import('mssql');
    const rows = await this.query<ProfitAccount>(
      `SELECT TOP 1 LTRIM(RTRIM(co_cue)) AS code, LTRIM(RTRIM(des_cue)) AS description FROM C_DIST.dbo.sccuenta WHERE LTRIM(RTRIM(co_cue)) = LTRIM(RTRIM(@code))`,
      { code: { type: mssql.VarChar(40), value: (code ?? '').trim() } },
    );
    return rows[0] ?? null;
  }

  /**
   * Directorio de usuarios de Profit (READ-ONLY) — Fase 10C.
   * Fuente oficial y única: MasterProfit.dbo.VUSUARIOS
   *   columnas reales: codigo (código de ingreso a Profit),
   *                     nombre  (nombre visible del usuario).
   * Verificado en SRVBDPROFITBK: 107 filas, códigos distintos, sin vacíos
   * (ej: KZAMU → KEIBER ZAMUDIA). Solo se leen código y nombre.
   */
  async getProfitUsers(): Promise<ProfitUser[]> {
    const rows = await this.query<{ codigo: string; nombre: string }>(
      `SELECT codigo, nombre FROM MasterProfit.dbo.VUSUARIOS ORDER BY nombre`,
    );
    const seen = new Set<string>();
    const users: ProfitUser[] = [];
    for (const r of rows) {
      const profitCode = (r.codigo ?? '').trim();
      const displayName = (r.nombre ?? '').trim();
      if (!profitCode || !displayName || seen.has(profitCode)) continue;
      seen.add(profitCode);
      users.push({ profitCode, displayName });
    }
    return users;
  }
}
