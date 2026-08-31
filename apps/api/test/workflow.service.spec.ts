import { describe, it, expect } from 'vitest';
import { WorkflowService } from '../src/shared/workflow/workflow.service';

describe('WorkflowService', () => {
  let service: WorkflowService;

  beforeEach(() => {
    service = new WorkflowService();
  });

  describe('getStepCodeForStatus', () => {
    it('returns the same string for a known status', () => {
      expect(service.getStepCodeForStatus('DRAFT')).toBe('DRAFT');
      expect(service.getStepCodeForStatus('PENDING_MANAGER')).toBe('PENDING_MANAGER');
      expect(service.getStepCodeForStatus('MASTER_ACTIVE')).toBe('MASTER_ACTIVE');
    });

    it('returns the same string for a status that is also a step code', () => {
      expect(service.getStepCodeForStatus('APPROVED')).toBe('APPROVED');
      expect(service.getStepCodeForStatus('RETURNED')).toBe('RETURNED');
    });

    it('returns the input when status is unknown', () => {
      expect(service.getStepCodeForStatus('UNKNOWN_STATUS')).toBe('UNKNOWN_STATUS');
      expect(service.getStepCodeForStatus('')).toBe('');
    });
  });

  describe('getNextStep', () => {
    it('returns the next step in the workflow', () => {
      expect(service.getNextStep('DRAFT')).toBe('PENDING_MANAGER');
      expect(service.getNextStep('PENDING_MANAGER')).toBe('MANAGER_APPROVED');
      expect(service.getNextStep('MANAGER_APPROVED')).toBe('PENDING_WAREHOUSE');
      expect(service.getNextStep('PENDING_WAREHOUSE')).toBe('WAREHOUSE_APPROVED');
      expect(service.getNextStep('WAREHOUSE_APPROVED')).toBe('PENDING_ACCOUNTING');
      expect(service.getNextStep('PENDING_ACCOUNTING')).toBe('ACCOUNTING_APPROVED');
      expect(service.getNextStep('ACCOUNTING_APPROVED')).toBe('PENDING_FINAL_REVIEW');
      expect(service.getNextStep('PENDING_FINAL_REVIEW')).toBe('APPROVED');
      expect(service.getNextStep('APPROVED')).toBe('MASTER_ACTIVE');
    });

    it('returns null for MASTER_ACTIVE (terminal step)', () => {
      expect(service.getNextStep('MASTER_ACTIVE')).toBeNull();
    });

    it('returns null for an unknown step', () => {
      expect(service.getNextStep('UNKNOWN_STEP')).toBeNull();
      expect(service.getNextStep('RETURNED')).toBeNull();
      expect(service.getNextStep('REJECTED')).toBeNull();
    });
  });

  describe('canTransition', () => {
    it('allows valid transitions', () => {
      expect(service.canTransition('DRAFT', 'SUBMIT')).toBe(true);
      expect(service.canTransition('PENDING_MANAGER', 'APPROVE')).toBe(true);
      expect(service.canTransition('PENDING_MANAGER', 'REJECT')).toBe(true);
      expect(service.canTransition('PENDING_MANAGER', 'RETURN')).toBe(true);
      expect(service.canTransition('APPROVED', 'ACTIVATE')).toBe(true);
      expect(service.canTransition('RETURNED', 'RESUBMIT')).toBe(true);
    });

    it('rejects invalid transitions', () => {
      expect(service.canTransition('DRAFT', 'APPROVE')).toBe(false);
      expect(service.canTransition('DRAFT', 'REJECT')).toBe(false);
      expect(service.canTransition('MASTER_ACTIVE', 'APPROVE')).toBe(false);
      expect(service.canTransition('REJECTED', 'APPROVE')).toBe(false);
      expect(service.canTransition('UNKNOWN', 'SUBMIT')).toBe(false);
    });

    it('rejects transitions from unknown steps', () => {
      expect(service.canTransition('NONEXISTENT', 'SUBMIT')).toBe(false);
    });
  });

  describe('getValidActions', () => {
    it('returns SUBMIT for DRAFT', () => {
      expect(service.getValidActions('DRAFT')).toEqual(['SUBMIT']);
    });

    it('returns APPROVE, REJECT, RETURN for pending review steps', () => {
      expect(service.getValidActions('PENDING_MANAGER')).toEqual(['APPROVE', 'REJECT', 'RETURN']);
      expect(service.getValidActions('PENDING_WAREHOUSE')).toEqual(['APPROVE', 'REJECT', 'RETURN']);
      expect(service.getValidActions('PENDING_ACCOUNTING')).toEqual(['APPROVE', 'REJECT', 'RETURN']);
      expect(service.getValidActions('PENDING_FINAL_REVIEW')).toEqual(['APPROVE', 'REJECT', 'RETURN']);
    });

    it('returns ROUTE for approved-but-not-active steps', () => {
      expect(service.getValidActions('MANAGER_APPROVED')).toEqual(['ROUTE']);
      expect(service.getValidActions('WAREHOUSE_APPROVED')).toEqual(['ROUTE']);
      expect(service.getValidActions('ACCOUNTING_APPROVED')).toEqual(['ROUTE']);
    });

    it('returns ACTIVATE for APPROVED', () => {
      expect(service.getValidActions('APPROVED')).toEqual(['ACTIVATE']);
    });

    it('returns empty array for MASTER_ACTIVE and REJECTED', () => {
      expect(service.getValidActions('MASTER_ACTIVE')).toEqual([]);
      expect(service.getValidActions('REJECTED')).toEqual([]);
    });

    it('returns RESUBMIT for RETURNED', () => {
      expect(service.getValidActions('RETURNED')).toEqual(['RESUBMIT']);
    });

    it('returns empty array for unknown step', () => {
      expect(service.getValidActions('UNKNOWN')).toEqual([]);
    });
  });
});
