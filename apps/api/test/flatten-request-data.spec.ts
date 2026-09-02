import { describe, it, expect } from 'vitest';
import { flattenRequestData } from '../src/comun/utilidades/flatten-request-data';

describe('flattenRequestData', () => {
  it('flattens requestData into top-level fields', () => {
    const raw = {
      id: 'req-1',
      status: 'PENDING_WAREHOUSE',
      requestData: {
        requestId: 'req-1',
        groupId: 'g1',
        subgroupId: 'sg1',
        categoryId: 'cat1',
        brandId: 'b1',
        unitId: 'uom1',
        manufacturer: 'Siemens',
        model: 'SITRANS',
        partNumber: '7MF0543',
        application: 'Temperature',
        masterCode: 'RVHCAR-00001',
      },
    };

    const result = flattenRequestData(raw);

    expect(result.id).toBe('req-1');
    expect(result.status).toBe('PENDING_WAREHOUSE');
    expect(result.groupId).toBe('g1');
    expect(result.subgroupId).toBe('sg1');
    expect(result.categoryId).toBe('cat1');
    expect(result.brandId).toBe('b1');
    expect(result.unitId).toBe('uom1');
    expect(result.manufacturer).toBe('Siemens');
    expect(result.model).toBe('SITRANS');
    expect(result.partNumber).toBe('7MF0543');
    expect(result.application).toBe('Temperature');
    expect(result.masterCode).toBe('RVHCAR-00001');
    expect(result.requestData).toBeUndefined();
  });

  it('returns original object when requestData is null', () => {
    const raw = {
      id: 'req-2',
      status: 'DRAFT',
      requestData: null,
    };

    const result = flattenRequestData(raw);

    expect(result.id).toBe('req-2');
    expect(result.status).toBe('DRAFT');
    expect(result.requestData).toBeUndefined();
  });

  it('returns original object when requestData is undefined', () => {
    const raw = {
      id: 'req-3',
      status: 'DRAFT',
    };

    const result = flattenRequestData(raw);

    expect(result.id).toBe('req-3');
    expect(result.status).toBe('DRAFT');
    expect(result.requestData).toBeUndefined();
  });

  it('handles optional fields being undefined in requestData', () => {
    const raw = {
      id: 'req-4',
      requestData: {
        requestId: 'req-4',
        groupId: 'g1',
        subgroupId: 'sg1',
      },
    };

    const result = flattenRequestData(raw);

    expect(result.groupId).toBe('g1');
    expect(result.subgroupId).toBe('sg1');
    expect(result.categoryId).toBeUndefined();
    expect(result.brandId).toBeUndefined();
    expect(result.unitId).toBeUndefined();
    expect(result.manufacturer).toBeUndefined();
    expect(result.model).toBeUndefined();
    expect(result.partNumber).toBeUndefined();
    expect(result.application).toBeUndefined();
    expect(result.masterCode).toBeUndefined();
  });

  it('handles empty requestData object', () => {
    const raw = {
      id: 'req-5',
      requestData: {},
    };

    const result = flattenRequestData(raw);

    expect(result.id).toBe('req-5');
    expect(result.groupId).toBeUndefined();
    expect(result.requestData).toBeUndefined();
  });

  it('preserves nested company and department objects', () => {
    const raw = {
      id: 'req-6',
      company: { id: 'c1', name: 'Empresa A' },
      department: { id: 'd1', name: 'Compras' },
      requester: { id: 'u1', username: 'j.perez' },
      requestData: {
        groupId: 'g1',
        masterCode: 'RVHCAR-00001',
      },
    };

    const result = flattenRequestData(raw);

    expect(result.company).toEqual({ id: 'c1', name: 'Empresa A' });
    expect(result.department).toEqual({ id: 'd1', name: 'Compras' });
    expect(result.requester).toEqual({ id: 'u1', username: 'j.perez' });
    expect(result.groupId).toBe('g1');
    expect(result.masterCode).toBe('RVHCAR-00001');
  });

  it('preserves accountingCodes when present', () => {
    const raw = {
      id: 'req-7',
      accountingCodes: [
        { code: '5010-01', description: 'Repuestos' },
      ],
      requestData: {
        groupId: 'g1',
      },
    };

    const result = flattenRequestData(raw);

    expect(result.accountingCodes).toHaveLength(1);
    expect(result.accountingCodes[0].code).toBe('5010-01');
    expect(result.groupId).toBe('g1');
  });

  it('preserves workflowInstance when present', () => {
    const raw = {
      id: 'req-8',
      workflowInstance: { id: 'wf-1', currentStepCode: 'PENDING_MANAGER' },
      requestData: {
        groupId: 'g1',
      },
    };

    const result = flattenRequestData(raw);

    expect(result.workflowInstance).toEqual({ id: 'wf-1', currentStepCode: 'PENDING_MANAGER' });
    expect(result.groupId).toBe('g1');
  });
});
