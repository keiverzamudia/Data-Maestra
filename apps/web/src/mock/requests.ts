import type { Request, WorkflowHistoryEntry } from '../types';
export const requests: Request[] = [
  { id: 'rq1', requestNumber: 1001, companyId: 'c1', departmentId: 'd1', requesterId: 'u1', requestedDescription: 'FILTRO HIDRÁULICO PARKER 20 MICRAS', purpose: 'Mantenimiento preventivo excavadora CAT 320', status: 'PENDING_MANAGER', priority: 2, groupId: 'g4', categoryId: 'cat1', brandId: 'b4', partNumber: 'PR-HF20', manufacturer: 'Parker', model: 'HF20', application: 'Sistema hidráulico', createdAt: '2026-03-18T09:00:00Z', updatedAt: '2026-03-18T09:00:00Z' },
  { id: 'rq2', requestNumber: 1002, companyId: 'c1', departmentId: 'd1', requesterId: 'u1', requestedDescription: 'RODAMIENTO 6206 SKF 2RS', purpose: 'Reemplazo rodamiento motor bomba', status: 'PENDING_WAREHOUSE', priority: 1, groupId: 'g2', brandId: 'b2', partNumber: '6206-2RS', createdAt: '2026-03-17T10:30:00Z', updatedAt: '2026-03-18T14:00:00Z' },
  { id: 'rq3', requestNumber: 1003, companyId: 'c2', departmentId: 'd4', requesterId: 'u1', requestedDescription: 'CORREA TRAPEZOIDAL B-68', purpose: 'Reemplazo correa compresor', status: 'PENDING_ACCOUNTING', priority: 0, brandId: 'b2', partNumber: 'B-68', createdAt: '2026-03-16T08:00:00Z', updatedAt: '2026-03-19T09:00:00Z' },
  { id: 'rq4', requestNumber: 1004, companyId: 'c1', departmentId: 'd1', requesterId: 'u1', requestedDescription: 'CONTACTOR LC1D18 SCHNEIDER', purpose: 'Tablero eléctrico nave 2', status: 'PENDING_FINAL_REVIEW', priority: 2, brandId: 'b3', partNumber: 'LC1D18M7', createdAt: '2026-03-15T11:00:00Z', updatedAt: '2026-03-19T16:00:00Z' },
  { id: 'rq5', requestNumber: 1005, companyId: 'c1', departmentId: 'd1', requesterId: 'u1', requestedDescription: 'ACEITE HIDRÁULICO ISO 46 20L', purpose: 'Stock almacén', status: 'RETURNED', priority: 0, unitId: 'uom2', createdAt: '2026-03-19T13:00:00Z', updatedAt: '2026-03-20T10:00:00Z', notes: 'Falta especificar marca y ficha técnica' },
  { id: 'rq6', requestNumber: 1006, companyId: 'c3', departmentId: 'd6', requesterId: 'u1', requestedDescription: 'EMPAQUE KIT CILINDRO HIDRÁULICO 80x50', purpose: 'Reparación cilindro', status: 'APPROVED', priority: 1, partNumber: 'KIT-80x50', createdAt: '2026-03-14T09:00:00Z', updatedAt: '2026-03-20T12:00:00Z' },
  { id: 'rq7', requestNumber: 1007, companyId: 'c1', departmentId: 'd1', requesterId: 'u1', requestedDescription: 'FILTRO DE AIRE DONALDSON P554685', purpose: 'Mantenimiento camión', status: 'REJECTED', priority: 0, partNumber: 'P554685', createdAt: '2026-03-12T10:00:00Z', updatedAt: '2026-03-13T09:00:00Z', notes: 'Duplicado de M-2026-000007' },
  { id: 'rq8', requestNumber: 1008, companyId: 'c1', departmentId: 'd1', requesterId: 'u1', requestedDescription: 'VÁLVULA HIDRÁULICA DIRECCIONAL 4/3', purpose: 'Reparación prensa', status: 'MASTER_ACTIVE', priority: 3, partNumber: '4WE10', createdAt: '2026-03-10T08:00:00Z', updatedAt: '2026-03-18T15:00:00Z' },
  { id: 'rq9', requestNumber: 1009, companyId: 'c1', departmentId: 'd1', requesterId: 'u1', requestedDescription: 'BOMBA DE AGUA CUMMINS 6CT', purpose: 'Repuesto motor', status: 'DRAFT', priority: 1, createdAt: '2026-03-21T09:00:00Z', updatedAt: '2026-03-21T09:00:00Z' },
];
export const workflowHistory: WorkflowHistoryEntry[] = [
  { id: 'wh1', requestId: 'rq2', from: 'DRAFT', to: 'PENDING_MANAGER', action: 'SUBMIT', actorId: 'u1', createdAt: '2026-03-17T10:30:00Z' },
  { id: 'wh2', requestId: 'rq2', from: 'PENDING_MANAGER', to: 'MANAGER_APPROVED', action: 'APPROVE', actorId: 'u2', comment: 'Aprobado, enviar a almacén para clasificación', createdAt: '2026-03-18T09:00:00Z' },
  { id: 'wh3', requestId: 'rq5', from: 'PENDING_WAREHOUSE', to: 'RETURNED', action: 'RETURN', actorId: 'u3', comment: 'Falta marca, ficha técnica y unidad', createdAt: '2026-03-20T10:00:00Z' },
];
export const workflowSteps = [
  { code: 'DRAFT' as const, name: 'Borrador', order: 0 },
  { code: 'PENDING_MANAGER' as const, name: 'Aprobación Gerente', order: 1, slaHours: 48 },
  { code: 'PENDING_WAREHOUSE' as const, name: 'Almacén', order: 2, slaHours: 72 },
  { code: 'PENDING_ACCOUNTING' as const, name: 'Contabilidad', order: 3, slaHours: 48 },
  { code: 'PENDING_FINAL_REVIEW' as const, name: 'Revisión Final', order: 4, slaHours: 24 },
  { code: 'APPROVED' as const, name: 'Aprobado', order: 5 },
  { code: 'MASTER_ACTIVE' as const, name: 'Master Activo', order: 6 },
];
