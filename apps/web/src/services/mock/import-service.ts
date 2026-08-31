import { importRuns } from '../../mock/source-items';
import type { ImportService } from '../../contracts';
import type { ImportRun } from '../../types';

const delay = (ms = 150) => new Promise(r => setTimeout(r, ms));

export const mockImportService: ImportService = {
  async getImportRuns() {
    await delay();
    return [...importRuns];
  },
  async startImport(sourceId) {
    await delay();
    const run: ImportRun = {
      id: 'ir' + Date.now(),
      sourceId,
      startedAt: new Date().toISOString(),
      status: 'RUNNING',
      rowsRead: 0, rowsImported: 0, rowsUnchanged: 0, rowsFailed: 0, rowsSkipped: 0,
    };
    importRuns.unshift(run);
    return run;
  },
  async getImportProgress(id) {
    await delay();
    return importRuns.find(r => r.id === id);
  },
};
