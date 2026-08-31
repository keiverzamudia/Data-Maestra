import { Injectable } from '@nestjs/common';

const WORKFLOW_STEPS = [
  'DRAFT',
  'PENDING_MANAGER',
  'MANAGER_APPROVED',
  'PENDING_WAREHOUSE',
  'WAREHOUSE_APPROVED',
  'PENDING_ACCOUNTING',
  'ACCOUNTING_APPROVED',
  'PENDING_FINAL_REVIEW',
  'APPROVED',
  'MASTER_ACTIVE',
] as const;

type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

const VALID_ACTIONS: Record<string, string[]> = {
  DRAFT: ['SUBMIT'],
  PENDING_MANAGER: ['APPROVE', 'REJECT', 'RETURN'],
  MANAGER_APPROVED: ['ROUTE'],
  PENDING_WAREHOUSE: ['APPROVE', 'REJECT', 'RETURN'],
  WAREHOUSE_APPROVED: ['ROUTE'],
  PENDING_ACCOUNTING: ['APPROVE', 'REJECT', 'RETURN'],
  ACCOUNTING_APPROVED: ['ROUTE'],
  PENDING_FINAL_REVIEW: ['APPROVE', 'REJECT', 'RETURN'],
  APPROVED: ['ACTIVATE'],
  MASTER_ACTIVE: [],
  RETURNED: ['RESUBMIT'],
  REJECTED: [],
};

const STATUS_TO_STEP: Record<string, string> = {
  DRAFT: 'DRAFT',
  PENDING_MANAGER: 'PENDING_MANAGER',
  MANAGER_APPROVED: 'MANAGER_APPROVED',
  PENDING_WAREHOUSE: 'PENDING_WAREHOUSE',
  WAREHOUSE_APPROVED: 'WAREHOUSE_APPROVED',
  PENDING_ACCOUNTING: 'PENDING_ACCOUNTING',
  ACCOUNTING_APPROVED: 'ACCOUNTING_APPROVED',
  PENDING_FINAL_REVIEW: 'PENDING_FINAL_REVIEW',
  APPROVED: 'APPROVED',
  MASTER_ACTIVE: 'MASTER_ACTIVE',
  RETURNED: 'RETURNED',
  REJECTED: 'REJECTED',
};

const ACTION_TRANSITIONS: Record<string, Record<string, string>> = {
  DRAFT: { SUBMIT: 'PENDING_MANAGER' },
  PENDING_MANAGER: { APPROVE: 'MANAGER_APPROVED', REJECT: 'REJECTED', RETURN: 'RETURNED' },
  MANAGER_APPROVED: { ROUTE: 'PENDING_WAREHOUSE' },
  PENDING_WAREHOUSE: { APPROVE: 'WAREHOUSE_APPROVED', REJECT: 'REJECTED', RETURN: 'RETURNED' },
  WAREHOUSE_APPROVED: { ROUTE: 'PENDING_ACCOUNTING' },
  PENDING_ACCOUNTING: { APPROVE: 'ACCOUNTING_APPROVED', REJECT: 'REJECTED', RETURN: 'RETURNED' },
  ACCOUNTING_APPROVED: { ROUTE: 'PENDING_FINAL_REVIEW' },
  PENDING_FINAL_REVIEW: { APPROVE: 'APPROVED', REJECT: 'REJECTED', RETURN: 'RETURNED' },
  APPROVED: { ACTIVATE: 'MASTER_ACTIVE' },
  RETURNED: { RESUBMIT: 'DRAFT' },
};

@Injectable()
export class WorkflowService {
  getStepCodeForStatus(status: string): string {
    return STATUS_TO_STEP[status] ?? status;
  }

  getNextStep(currentStepCode: string): string | null {
    const index = WORKFLOW_STEPS.indexOf(currentStepCode as WorkflowStep);
    if (index === -1 || index === WORKFLOW_STEPS.length - 1) {
      return null;
    }
    return WORKFLOW_STEPS[index + 1] ?? null;
  }

  canTransition(fromStep: string, action: string): boolean {
    const transitions = ACTION_TRANSITIONS[fromStep];
    if (!transitions) return false;
    return action in transitions;
  }

  getValidActions(stepCode: string): string[] {
    return VALID_ACTIONS[stepCode] ?? [];
  }
}
