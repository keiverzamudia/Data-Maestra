import type { RequestService, WarehouseService, WarehouseApprovalService, AccountingService, AuditService } from '../contratos';
import { mockRequestService } from './mock/request-service';
import { mockWarehouseService } from './mock/warehouse-service';
import { mockWarehouseApprovalService } from './mock/warehouse-approval-service';
import { mockAccountingService } from './mock/accounting-service';
import { mockAuditService } from './mock/audit-service';
import { apiRequestService } from './api/api-request-service';
import { apiWarehouseService } from './api/api-warehouse-service';
import { apiWarehouseApprovalService } from './api/api-warehouse-approval-service';
import { apiAccountingService } from './api/api-accounting-service';
import { apiAuditService } from './api/api-audit-service';

type Mode = 'mock' | 'api';

const mode: Mode = (import.meta.env.VITE_DATA_MODE as Mode) ?? 'mock';

export const requestService: RequestService = mode === 'api' ? apiRequestService : mockRequestService;
export const warehouseService: WarehouseService = mode === 'api' ? apiWarehouseService : mockWarehouseService;
export const warehouseApprovalService: WarehouseApprovalService = mode === 'api' ? apiWarehouseApprovalService : mockWarehouseApprovalService;
export const accountingService: AccountingService = mode === 'api' ? apiAccountingService : mockAccountingService;
export const auditService: AuditService = mode === 'api' ? apiAuditService : mockAuditService;
