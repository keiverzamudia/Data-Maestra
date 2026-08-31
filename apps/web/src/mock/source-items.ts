import type { Source, SourceItem, MasterSourceMap, ImportRun, MatchCandidate } from '../types';
export const sources: Source[] = [
  { id: 's1', companyId: 'c1', sourceName: 'Profit Empresa A', connectionAlias: 'profit-a', active: true },
  { id: 's2', companyId: 'c2', sourceName: 'Profit Empresa B', connectionAlias: 'profit-b', active: true },
  { id: 's3', companyId: 'c3', sourceName: 'Profit Empresa C', connectionAlias: 'profit-c', active: true },
];
export const sourceItems: SourceItem[] = [
  { id: 'si0', sourceId: 's1', companyId: 'c1', sourceRecordId: 'RVHCAR001', sourceCode: 'RVHCAR001', originalDescription: 'PARACHOQUE DELANTERO FOTON 45 TON', normalizedDescription: 'PARACHOQUE DELANTERO FOTON 45 TON', status: 'LINKED', brand: 'Foton', manufacturer: 'Foton', model: '45 TON', partNumber: 'FOT-PAR-001', lastSeenAt: '2026-03-20T10:00:00Z' },
  { id: 'si1', sourceId: 's1', companyId: 'c1', sourceRecordId: 'RVHMOT101', sourceCode: 'RVHMOT101', originalDescription: 'FILTRO DIESEL CAMION CUMMINS', normalizedDescription: 'FILTRO DIESEL CUMMINS', status: 'LINKED', brand: 'Fleetguard', manufacturer: 'Foton', model: 'FS1012', partNumber: '3936061', lastSeenAt: '2026-03-20T10:00:00Z' },
  { id: 'si2', sourceId: 's2', companyId: 'c2', sourceRecordId: '4587', sourceCode: '4587', originalDescription: 'FILTRO DIESEL CUMMINS', normalizedDescription: 'FILTRO DIESEL CUMMINS', status: 'LINKED', brand: 'Fleetguard', manufacturer: 'Foton', model: 'FS1012', partNumber: '3936061', lastSeenAt: '2026-03-20T10:00:00Z' },
  { id: 'si4', sourceId: 's1', companyId: 'c1', sourceRecordId: 'MECROD100', sourceCode: 'MECROD100', originalDescription: 'RODAMIENTO 6205 SKF', normalizedDescription: 'RODAMIENTO 6205 SKF', status: 'LINKED', brand: 'SKF', partNumber: '6205-2RS', lastSeenAt: '2026-03-18T09:00:00Z' },
  { id: 'si5', sourceId: 's2', companyId: 'c2', sourceRecordId: 'ELECON022', sourceCode: 'ELECON022', originalDescription: 'CONTACTOR 32A SCHNEIDER', normalizedDescription: 'CONTACTOR 32A SCHNEIDER', status: 'LINKED', brand: 'Schneider', partNumber: 'LC1D32M7', lastSeenAt: '2026-03-19T11:00:00Z' },
  { id: 'si6', sourceId: 's1', companyId: 'c1', sourceRecordId: 'RVHMOT102', sourceCode: 'RVHMOT102', originalDescription: 'FILTRO AIRE CUMMINS', normalizedDescription: 'FILTRO AIRE CUMMINS', status: 'MATCHED', brand: 'Fleetguard', partNumber: 'AF25550', lastSeenAt: '2026-03-20T10:00:00Z' },
  { id: 'si7', sourceId: 's1', companyId: 'c1', sourceRecordId: 'MECROD009', sourceCode: 'MECROD009', originalDescription: 'CORREA B68', normalizedDescription: 'CORREA B68', status: 'REVIEW_REQUIRED', brand: 'SKF', partNumber: 'B-68', lastSeenAt: '2026-03-20T10:00:00Z' },
  { id: 'si8', sourceId: 's2', companyId: 'c2', sourceRecordId: 'HIDBOM012', sourceCode: 'HIDBOM012', originalDescription: 'BOMBA HIDRAULICA 16CC PARKER', normalizedDescription: 'BOMBA HIDRAULICA 16CC PARKER', status: 'IMPORTED', brand: 'Parker', partNumber: 'PGP-16CC', lastSeenAt: '2026-03-21T08:00:00Z' },
];
export const sourceMaps: MasterSourceMap[] = [
  { id: 'sm0', masterItemId: 'mi1', sourceItemId: 'si0', relationType: 'EQUIVALENT', confidence: 99, active: true },
  { id: 'sm1', masterItemId: 'mi2', sourceItemId: 'si1', relationType: 'EQUIVALENT', confidence: 98, active: true },
  { id: 'sm2', masterItemId: 'mi2', sourceItemId: 'si2', relationType: 'EQUIVALENT', confidence: 97, active: true },
  { id: 'sm4', masterItemId: 'mi3', sourceItemId: 'si4', relationType: 'EQUIVALENT', confidence: 99, active: true },
  { id: 'sm5', masterItemId: 'mi4', sourceItemId: 'si5', relationType: 'EQUIVALENT', confidence: 95, active: true },
  { id: 'sm6', masterItemId: 'mi6', sourceItemId: 'si6', relationType: 'EQUIVALENT', confidence: 92, active: true },
];
export const importRuns: ImportRun[] = [
  { id: 'ir1', sourceId: 's1', startedAt: '2026-03-21T06:00:00Z', finishedAt: '2026-03-21T06:05:00Z', status: 'COMPLETED', rowsRead: 1250, rowsImported: 12, rowsUnchanged: 1235, rowsFailed: 3, rowsSkipped: 0 },
  { id: 'ir2', sourceId: 's2', startedAt: '2026-03-21T06:10:00Z', status: 'RUNNING', rowsRead: 890, rowsImported: 5, rowsUnchanged: 880, rowsFailed: 0, rowsSkipped: 5 },
  { id: 'ir3', sourceId: 's1', startedAt: '2026-03-20T06:00:00Z', finishedAt: '2026-03-20T06:04:00Z', status: 'COMPLETED_WITH_ERRORS', rowsRead: 1248, rowsImported: 8, rowsUnchanged: 1230, rowsFailed: 10, rowsSkipped: 0 },
  { id: 'ir4', sourceId: 's3', startedAt: '2026-03-19T06:00:00Z', finishedAt: '2026-03-19T06:03:00Z', status: 'FAILED', rowsRead: 0, rowsImported: 0, rowsUnchanged: 0, rowsFailed: 0, rowsSkipped: 0 },
];
export const matchCandidates: MatchCandidate[] = [
  { id: 'mc1', sourceItemId: 'si7', masterItemId: 'mi3', score: 88.5, matchedFields: { partNumber: true, brand: true, category: false }, differentFields: { category: { source: '—', master: 'RODAMIENTO' } }, evidence: { partNumber: 'EXACT', brand: 'NORMALIZED', description: 'SIMILAR (0.78)' }, algorithmVersion: '1.0.0', status: 'PENDING_REVIEW', createdAt: '2026-03-21T07:00:00Z' },
  { id: 'mc2', sourceItemId: 'si8', masterItemId: 'mi5', score: 94.5, matchedFields: { partNumber: true, brand: true, category: true, description: true }, differentFields: {}, evidence: { partNumber: 'EXACT', brand: 'NORMALIZED', model: 'EXACT', category: 'MATCH' }, algorithmVersion: '1.0.0', status: 'PENDING_REVIEW', createdAt: '2026-03-21T07:10:00Z' },
  { id: 'mc3', sourceItemId: 'si6', masterItemId: 'mi6', score: 91.2, matchedFields: { partNumber: true, brand: true }, differentFields: { description: { source: 'FILTRO AIRE CUMMINS', master: 'FILTRO DE AIRE FOTON AF25550' } }, evidence: { partNumber: 'EXACT', brand: 'NORMALIZED' }, algorithmVersion: '1.0.0', status: 'NEW', createdAt: '2026-03-21T07:20:00Z' },
];
// Analizador: propuesta semántica desde descripción
export const analyzerProposals: Record<string, { groupCode: string; subgroupCode: string; brand?: string; application?: string; confidence: number; evidence: string[] }> = {
  si0: { groupCode: 'RVH', subgroupCode: 'CAR', brand: 'FOTON', application: '45 TON', confidence: 94.5, evidence: ['PARACHOQUE → CARROCERIA', 'FOTON → marca', '45 TON → aplicación'] },
  si1: { groupCode: 'RVH', subgroupCode: 'MOT', brand: 'Fleetguard', confidence: 88, evidence: ['FILTRO → MOTOR', 'DIESEL → subtipo'] },
};
