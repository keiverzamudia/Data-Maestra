// ── Organization ──
export interface Company { id: string; name: string; code: string; active: boolean; }
export interface Department { id: string; companyId: string; name: string; code: string; managerId?: string; active: boolean; }
export interface User { id: string; username: string; displayName: string; email: string; avatar?: string; active: boolean; roleCodes: string[]; companyIds: string[]; }
export interface Role { id: string; code: string; name: string; description: string; }

// ── Catalog ──
export interface CatalogGroup { id: string; code: string; name: string; }
export interface CatalogSubgroup { id: string; groupId: string; code: string; name: string; }
export interface CatalogCategory { id: string; subgroupId: string; code: string; name: string; }
export interface Brand { id: string; name: string; normalizedName: string; manufacturerId?: string; }
export interface Manufacturer { id: string; name: string; }
export interface UnitOfMeasure { id: string; code: string; name: string; }

// ── Request / Workflow ──
export type RequestStatus = 'DRAFT' | 'PENDING_MANAGER' | 'MANAGER_APPROVED' | 'PENDING_WAREHOUSE' | 'WAREHOUSE_APPROVED' | 'PENDING_ACCOUNTING' | 'ACCOUNTING_APPROVED' | 'PENDING_FINAL_REVIEW' | 'APPROVED' | 'MASTER_ACTIVE' | 'RETURNED' | 'REJECTED';
export type Priority = 0 | 1 | 2 | 3;
export interface DepartmentRef { id: string; name: string; code: string; managerId?: string | null; }
export interface ApprovalRef { id: string; stepCode: string; actorId: string; action: string; fromStatus: string; toStatus: string; comment?: string | null; createdAt: string; actor?: { id: string; username: string; displayName: string }; }
export interface Request {
  id: string; requestNumber: number; companyId: string; departmentId: string; requesterId: string;
  requestedDescription: string; purpose: string; referencePhotoUri?: string;
  suggestedMasterItemId?: string; status: RequestStatus; priority: Priority;
  groupId?: string; subgroupId?: string; categoryId?: string; unitId?: string; brandId?: string;
  manufacturer?: string; model?: string; partNumber?: string; application?: string;
  masterCode?: string;
  notes?: string; attributes?: Record<string,string>;
  accountingCodes?: { code: string; description: string }[];
  createdAt: string; updatedAt: string;
  department?: DepartmentRef;
  approvals?: ApprovalRef[];
}
export interface WorkflowStepDef { code: RequestStatus; name: string; order: number; slaHours?: number; }
export interface WorkflowHistoryEntry { id: string; requestId: string; from: RequestStatus; to: RequestStatus; action: 'APPROVE'|'REJECT'|'RETURN'|'SUBMIT'; actorId: string; comment?: string; createdAt: string; }

// ── Master ──
export type MasterStatus = 'PENDING_REVIEW' | 'ACTIVE' | 'INACTIVE' | 'MERGED' | 'REJECTED';
export interface MasterItem {
  id: string; masterCode: string; masterDescription: string; normalizedDescription: string; status: MasterStatus;
  groupId?: string; subgroupId?: string; categoryId?: string; brandId?: string; manufacturerId?: string; model?: string; unitId?: string;
  partNumber?: string; application?: string; attributes: Record<string,string>;
  qualityScore: number; mergedIntoId?: string;
  createdBy?: string; createdAt: string; updatedAt: string;
  sourceMappingIds: string[]; aliases: string[];
}

// ── Source ──
export type SourceStatus = 'IMPORTED'|'NORMALIZED'|'MATCHED'|'REVIEW_REQUIRED'|'LINKED'|'IGNORED';
export interface Source { id: string; companyId: string; sourceName: string; connectionAlias: string; active: boolean; }
export interface SourceItem {
  id: string; sourceId: string; sourceRecordId: string; sourceCode?: string;
  originalDescription: string; normalizedDescription: string; status: SourceStatus;
  brand?: string; manufacturer?: string; model?: string; partNumber?: string;
  companyId: string; lastSeenAt: string; sourceData?: Record<string,unknown>;
}

// ── Matching ──
export interface MatchCandidate {
  id: string; sourceItemId: string; masterItemId: string;
  score: number; matchedFields: Record<string,boolean>; differentFields: Record<string,{source:string;master:string}>;
  evidence: Record<string,string>; algorithmVersion: string; status: 'NEW'|'PENDING_REVIEW'|'CONFIRMED_SAME'|'CONFIRMED_DIFFERENT'|'IGNORED'; createdAt: string;
}

// ── Data Quality ──
export interface DataQualityIssue { id: string; fieldName: string; severity: 'ERROR'|'WARNING'|'INFO'; message: string; }
export interface DataQualityResult { id: string; entityType: 'SOURCE_ITEM'|'MASTER_ITEM'|'REQUEST'; entityId: string; overallScore: number; issues: DataQualityIssue[]; evaluatedAt: string; }

// ── Import ──
export type ImportStatus = 'CREATED'|'RUNNING'|'COMPLETED'|'COMPLETED_WITH_ERRORS'|'FAILED'|'CANCELLED';
export interface ImportRun { id: string; sourceId?: string; sourceName?: string; companyId?: string; startedAt: string; finishedAt?: string; status: ImportStatus; rowsRead: number; rowsImported: number; rowsUnchanged: number; rowsFailed: number; rowsSkipped: number; errorSummary?: string; }

// ── Audit ──
export interface AuditEvent { id: string; correlationId: string; requestId?: string; actorId: string; actorCompanyId?: string; entityType: string; entityId: string; action: string; beforeData?: unknown; afterData?: unknown; createdAt: string; }

// ── Notifications ──
export interface Notification { id: string; title: string; body: string; type: 'info'|'warning'|'success'|'error'; read: boolean; createdAt: string; link?: string; }
