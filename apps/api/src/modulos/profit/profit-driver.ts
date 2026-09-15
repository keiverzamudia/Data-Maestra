/**
 * Único driver SQL del módulo Profit (14K.2).
 *
 * Causa raíz del `connection.queryRaw is not a function`: `mssql` registra
 * las clases activas en un global compartido (`base.driver`) CADA VEZ que se
 * importa `mssql` (tedious) o `mssql/msnodesqlv8` (wrapper). `pool.request()`
 * crea `new shared.driver.Request(...)`, es decir, la clase del ÚLTIMO driver
 * importado en el proceso, no la del pool. Al convivir ambos drivers, los
 * pools tedious recibían Requests del wrapper (que llaman
 * `connection.queryRaw`, inexistente en conexiones tedious) y todo fallaba.
 *
 * Regla: TODO el módulo Profit usa EXCLUSIVAMENTE este driver (msnodesqlv8 +
 * ODBC 18, con SQL auth o Windows integrada según configuración). Ningún
 * archivo del módulo debe importar `mssql` pelado (tedious).
 */
export const PROFIT_ODBC_DRIVER = 'ODBC Driver 18 for SQL Server';
export const PROFIT_SQL_PORT = 1433;

// @ts-ignore - tipos provistos en runtime por el wrapper
export async function profitDriver(): Promise<any> {
  const sqlw: any = await import('mssql/msnodesqlv8');
  return sqlw;
}
