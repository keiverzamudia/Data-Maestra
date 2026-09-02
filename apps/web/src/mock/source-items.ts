import type { ImportRun, MatchCandidate } from '../tipos';

export const importRuns: ImportRun[] = [
  { id: 'ir1', sourceId: 's1', sourceName: 'Profit Empresa A', startedAt: '2026-03-21T06:00:00Z', finishedAt: '2026-03-21T06:05:00Z', status: 'COMPLETED', rowsRead: 1250, rowsImported: 12, rowsUnchanged: 1235, rowsFailed: 3, rowsSkipped: 0 },
  { id: 'ir2', sourceId: 's2', sourceName: 'Profit Empresa B', startedAt: '2026-03-21T06:10:00Z', status: 'RUNNING', rowsRead: 890, rowsImported: 5, rowsUnchanged: 880, rowsFailed: 0, rowsSkipped: 5 },
  { id: 'ir3', sourceId: 's1', sourceName: 'Profit Empresa A', startedAt: '2026-03-20T06:00:00Z', finishedAt: '2026-03-20T06:04:00Z', status: 'COMPLETED_WITH_ERRORS', rowsRead: 1248, rowsImported: 8, rowsUnchanged: 1230, rowsFailed: 10, rowsSkipped: 0 },
  { id: 'ir4', sourceId: 's3', sourceName: 'Profit Empresa C', startedAt: '2026-03-19T06:00:00Z', finishedAt: '2026-03-19T06:03:00Z', status: 'FAILED', rowsRead: 0, rowsImported: 0, rowsUnchanged: 0, rowsFailed: 0, rowsSkipped: 0 },
];

export const matchCandidates: MatchCandidate[] = [
  { id: 'mc1', sourceItemId: 'si7', masterItemId: 'mi3', score: 88.5, matchedFields: { partNumber: true, brand: true, category: false }, differentFields: { category: { source: '—', master: 'RODAMIENTO' } }, evidence: { partNumber: 'EXACT', brand: 'NORMALIZED', description: 'SIMILAR (0.78)' }, algorithmVersion: '1.0.0', status: 'PENDING_REVIEW', createdAt: '2026-03-21T07:00:00Z' },
  { id: 'mc2', sourceItemId: 'si8', masterItemId: 'mi5', score: 94.5, matchedFields: { partNumber: true, brand: true, category: true, description: true }, differentFields: {}, evidence: { partNumber: 'EXACT', brand: 'NORMALIZED', model: 'EXACT', category: 'MATCH' }, algorithmVersion: '1.0.0', status: 'PENDING_REVIEW', createdAt: '2026-03-21T07:10:00Z' },
  { id: 'mc3', sourceItemId: 'si6', masterItemId: 'mi6', score: 91.2, matchedFields: { partNumber: true, brand: true }, differentFields: { description: { source: 'FILTRO AIRE CUMMINS', master: 'FILTRO DE AIRE FOTON AF25550' } }, evidence: { partNumber: 'EXACT', brand: 'NORMALIZED' }, algorithmVersion: '1.0.0', status: 'NEW', createdAt: '2026-03-21T07:20:00Z' },
];

export const analyzerProposals: Record<string, { groupCode: string; subgroupCode: string; brand?: string; application?: string; confidence: number; evidence: string[] }> = {
  si0: { groupCode: 'RVH', subgroupCode: 'CAR', brand: 'FOTON', application: '45 TON', confidence: 94.5, evidence: ['PARACHOQUE → CARROCERIA', 'FOTON → marca', '45 TON → aplicación'] },
  si1: { groupCode: 'RVH', subgroupCode: 'MOT', brand: 'Fleetguard', confidence: 88, evidence: ['FILTRO → MOTOR', 'DIESEL → subtipo'] },
};
