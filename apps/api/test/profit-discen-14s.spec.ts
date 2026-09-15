import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';
import { buildProfitArticlePayload } from '../src/modulos/profit/profit-article.payload';

/**
 * FASE 14S — cierre contable del registro Profit.
 * disCen proviene EXCLUSIVAMENTE de los códigos validados (accountingCodes)
 * serializados con serializarDis. Sin códigos: no se inventa nada.
 */
function makeService(accountingCodes: any[] | undefined) {
  const db: any = {
    request: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'req-1',
        requestNumber: 'REQ-0099',
        status: 'CONTABILIDAD_APROBADA',
        requestedDescription: 'TORNILLO HEX',
        requestData: {
          groupId: 'g1', subgroupId: 's1', categoryId: null, brandId: null,
          articleType: 'C', taxType: '1', unitCode: 'UND', brandCode: '01',
          masterCode: 'TST-00001',
        },
        accountingCodes,
      }),
    },
    catalogGroup: { findUnique: vi.fn().mockResolvedValue({ id: 'g1', code: 'ACT' }) },
    catalogSubgroup: { findUnique: vi.fn().mockResolvedValue({ id: 's1', code: 'EQT' }) },
    catalogCategory: { findUnique: vi.fn().mockResolvedValue(null) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  let captured: any = null;
  const engine = {
    assertAvailable: vi.fn(),
    plan: vi.fn().mockImplementation(async (input: any) => {
      captured = input;
      return { candidate: 'ACTEQT0001', available: true, warnings: [] };
    }),
    allocateAndInsert: vi.fn(),
    verifyAndReconcile: vi.fn(),
  };
  const service = new SolicitudesService(db, {} as any, {} as any, {} as any, {} as any, engine);
  return { service, captured: () => captured };
}

const CODES = [
  { position: 'c1', code: '1.1.04.03.01.010' },
  { position: 'c7', code: '1.1.04.01.01.001' },
  { position: 'c8', code: '7.1.10.02.01.002' },
];
const EXPECTED = '<DIS>{c1:1.1.04.03.01.010}{c7:1.1.04.01.01.001}{c8:7.1.10.02.01.002}</DIS>';

describe('14S disCen desde contabilidad validada', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('plan incluye disCen exacto desde accountingCodes', async () => {
    const { service, captured } = makeService(CODES);
    await service.planProfitCreation('req-1', 'u1', 'c1');
    expect(captured().disCen).toBe(EXPECTED);
  });

  it('payload final lleva dis_cen exacto', async () => {
    const { service, captured } = makeService(CODES);
    await service.planProfitCreation('req-1', 'u1', 'c1');
    const payload = buildProfitArticlePayload('ACTEQT0001', captured());
    expect(payload.dis_cen).toBe(EXPECTED);
  });

  it('sin códigos contables no inventa valores', async () => {
    const { service, captured } = makeService([]);
    await service.planProfitCreation('req-1', 'u1', 'c1');
    expect(captured().disCen).toBeUndefined();
    const payload = buildProfitArticlePayload('ACTEQT0001', captured());
    expect(payload.dis_cen).toBe('');
  });

  it('sin relación accountingCodes no inventa valores', async () => {
    const { service, captured } = makeService(undefined);
    await service.planProfitCreation('req-1', 'u1', 'c1');
    expect(captured().disCen).toBeUndefined();
  });
});
