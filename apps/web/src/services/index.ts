import type { RequestService, WarehouseService, AccountingService, FinalReviewService, AuditService, NotificationService } from '../contracts';
import { mockRequestService } from './mock/request-service';
import { mockWarehouseService } from './mock/warehouse-service';
import { mockAccountingService } from './mock/accounting-service';
import { mockFinalReviewService } from './mock/final-review-service';
import { mockAuditService } from './mock/audit-service';
import { mockNotificationService } from './mock/notification-service';
import { apiRequestService } from './api/api-request-service';
import { apiWarehouseService } from './api/api-warehouse-service';
import { apiAccountingService } from './api/api-accounting-service';
import { apiFinalReviewService } from './api/api-final-review-service';
import { apiAuditService } from './api/api-audit-service';

type Mode = 'mock' | 'api';

const mode: Mode = (import.meta.env.VITE_DATA_MODE as Mode) ?? 'mock';

export const requestService: RequestService = mode === 'api' ? apiRequestService : mockRequestService;
export const warehouseService: WarehouseService = mode === 'api' ? apiWarehouseService : mockWarehouseService;
export const accountingService: AccountingService = mode === 'api' ? apiAccountingService : mockAccountingService;
export const finalReviewService: FinalReviewService = mode === 'api' ? apiFinalReviewService : mockFinalReviewService;
export const auditService: AuditService = mode === 'api' ? apiAuditService : mockAuditService;
export const notificationService: NotificationService = mockNotificationService;
