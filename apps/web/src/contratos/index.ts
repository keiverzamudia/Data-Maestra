import type {
  Request, MatchCandidate, DataQualityResult, ImportRun, AuditEvent,
  Notification
} from '../tipos';

// ── Session ──
export interface SessionUser {
  id: string;
  name: string;
  username: string;
  department: { id: string; code: string; name: string; managerId: string; managerName: string };
  company: { id: string; name: string; code: string };
  permissions: string[];
  roleCodes: string[];
}

// ── Request Service ──
export interface RequestService {
  list(params?: { companyId?: string; status?: string; search?: string; page?: number }): Promise<{ data: Request[]; total: number }>;
  getById(id: string): Promise<Request | undefined>;
  create(data: Partial<Request>): Promise<Request>;
  submit(id: string): Promise<Request>;
  approve(id: string, comment?: string): Promise<void>;
  reject(id: string, comment: string): Promise<void>;
  returnRequest(id: string, comment: string): Promise<void>;
}

// ── Warehouse Service ──
export interface WarehouseService {
  getPendingRequests(companyId?: string): Promise<Request[]>;
  getRequestForClassification(id: string): Promise<Request | undefined>;
  saveClassification(id: string, data: ClassificationData): Promise<void>;
  approveClassification(id: string): Promise<void>;
  returnRequest(id: string, comment: string): Promise<void>;
  rejectRequest(id: string, comment: string): Promise<void>;
}

export interface ClassificationData {
  groupId?: string;
  subgroupId?: string;
  categoryId?: string;
  brandId?: string;
  /** Códigos Profit directos (FASE 8F, preferidos sobre IDs). */
  groupCode?: string;
  subgroupCode?: string;
  categoryCode?: string;
  categoryName?: string;
  brandCode?: string;
  brandName?: string;
  unitId?: string;
  manufacturer?: string;
  model?: string;
  partNumber?: string;
  application?: string;
}

// ── Accounting Service ──
export interface AccountingService {
  getPendingApprovals(companyId?: string): Promise<Request[]>;
  approveAccounting(id: string, codes: AccountingCode[]): Promise<void>;
  rejectAccounting(id: string, comment: string): Promise<void>;
}

export interface AccountingCode {
  code: string;
  description: string;
  /** Posición contable c1..c10 (Fase 8E). Opcional por compatibilidad. */
  position?: string;
}

// ── Final Review Service ──
export interface FinalReviewService {
  getPendingReviews(companyId?: string): Promise<Request[]>;
  approveReview(id: string): Promise<void>;
  rejectReview(id: string, comment: string): Promise<void>;
}

// ── Import Service ──
export interface ImportService {
  getImportRuns(): Promise<ImportRun[]>;
  startImport(sourceId: string): Promise<ImportRun>;
  getImportProgress(id: string): Promise<ImportRun | undefined>;
}

// ── Audit Service ──
export interface AuditService {
  getEvents(params?: {
    entityId?: string;
    entityType?: string;
    action?: string;
    actorId?: string;
    correlationId?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: AuditEvent[]; total: number; page?: number; limit?: number; totalPages?: number }>;
  getById?(id: string): Promise<AuditEvent>;
}

// ── Matching Service ──
export interface MatchingService {
  list(): Promise<MatchCandidate[]>;
  decide(id: string, action: 'ACCEPTED' | 'REJECTED' | 'DEFERRED'): Promise<void>;
}

// ── Quality Service ──
export interface QualityService {
  list(): Promise<DataQualityResult[]>;
}

// ── Notification Service ──
export interface NotificationService {
  list(): Promise<Notification[]>;
  unreadCount(): Promise<number>;
}
