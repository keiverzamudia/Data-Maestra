import type { DataQualityResult, AuditEvent, Notification } from '../tipos';

export const qualityResults: DataQualityResult[] = [
  { id: 'qr1', entityType: 'MASTER_ITEM', entityId: 'mi4', overallScore: 74, evaluatedAt: '2026-03-21T06:00:00Z', issues: [{ id: 'qi1', fieldName: 'brand', severity: 'WARNING', message: 'Marca no normalizada' }, { id: 'qi2', fieldName: 'category', severity: 'ERROR', message: 'Categoría requerida' }] },
  { id: 'qr2', entityType: 'MASTER_ITEM', entityId: 'mi5', overallScore: 45, evaluatedAt: '2026-03-21T06:00:00Z', issues: [{ id: 'qi3', fieldName: 'partNumber', severity: 'ERROR', message: 'Part number vacío' }, { id: 'qi4', fieldName: 'manufacturer', severity: 'WARNING', message: 'Fabricante no especificado' }] },
  { id: 'qr3', entityType: 'SOURCE_ITEM', entityId: 'si7', overallScore: 62, evaluatedAt: '2026-03-21T06:00:00Z', issues: [{ id: 'qi5', fieldName: 'description', severity: 'INFO', message: 'Descripción muy corta' }] },
  { id: 'qr4', entityType: 'MASTER_ITEM', entityId: 'mi1', overallScore: 96, evaluatedAt: '2026-03-21T06:00:00Z', issues: [] },
];

export const auditEvents: AuditEvent[] = [
  { id: 'a1', correlationId: 'corr1', requestId: 'rq2', actorId: 'u2', actorCompanyId: 'c1', entityType: 'REQUEST', entityId: 'rq2', action: 'APPROVE', beforeData: { status: 'PENDIENTE_GERENTE' }, afterData: { status: 'PENDIENTE_ALMACEN' }, createdAt: '2026-03-18T09:00:00Z' },
  { id: 'a2', correlationId: 'corr2', actorId: 'u3', entityType: 'MASTER_ITEM', entityId: 'mi1', action: 'MERGE', beforeData: { mergedInto: null }, afterData: { mergedInto: 'mi1' }, createdAt: '2026-03-15T10:00:00Z' },
  { id: 'a3', correlationId: 'corr3', requestId: 'rq5', actorId: 'u3', actorCompanyId: 'c1', entityType: 'REQUEST', entityId: 'rq5', action: 'RETURN', beforeData: { status: 'PENDIENTE_ALMACEN' }, afterData: { status: 'DEVUELTO' }, createdAt: '2026-03-20T10:00:00Z' },
  { id: 'a4', correlationId: 'corr4', actorId: 'u1', actorCompanyId: 'c1', entityType: 'REQUEST', entityId: 'rq1', action: 'CREATE', afterData: { status: 'BORRADOR' }, createdAt: '2026-03-18T09:00:00Z' },
  { id: 'a5', correlationId: 'corr5', actorId: 'u5', entityType: 'IMPORT', entityId: 'ir1', action: 'IMPORT_RUN', afterData: { rowsRead: 1250 }, createdAt: '2026-03-21T06:05:00Z' },
  { id: 'a6', correlationId: 'corr1', requestId: 'rq2', actorId: 'u1', actorCompanyId: 'c1', entityType: 'REQUEST', entityId: 'rq2', action: 'CREATE', afterData: { status: 'BORRADOR' }, createdAt: '2026-03-17T10:30:00Z' },
];

export const notifications: Notification[] = [
  { id: 'n1', title: 'Solicitud requiere aprobación', body: 'REQ-1001 pendiente de gerente (SLA 12h restantes)', type: 'warning', readAt: null, createdAt: '2026-03-21T08:00:00Z', link: '/requests/rq1' },
  { id: 'n2', title: 'Solicitud devuelta', body: 'REQ-1005 devuelta por Almacén: falta marca', type: 'error', readAt: null, createdAt: '2026-03-20T10:00:00Z', link: '/requests/rq5' },
  { id: 'n3', title: 'Match pendiente', body: '2 candidatos requieren revisión', type: 'info', readAt: null, createdAt: '2026-03-21T07:00:00Z', link: '/matching' },
  { id: 'n4', title: 'Importación completada', body: 'Profit Empresa A: 12 nuevos, 3 errores', type: 'warning', readAt: '2026-03-21T09:00:00Z', createdAt: '2026-03-21T06:05:00Z', link: '/imports' },
  { id: 'n5', title: 'Master activado', body: 'M-2026-000004 activado correctamente', type: 'success', readAt: '2026-03-21T09:00:00Z', createdAt: '2026-03-18T15:00:00Z', link: '/master-items/mi4' },
];
