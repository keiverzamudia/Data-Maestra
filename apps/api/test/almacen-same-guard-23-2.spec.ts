import { describe, it, expect, vi } from 'vitest';
import { AlmacenService } from '../src/modulos/almacen/almacen.service';

function buildAlmacen(articleLink: any) {
  const prisma: any = {
    request: {
      findUnique: vi.fn(async () => ({
        id: 'req-9',
        status: 'PENDIENTE_ALMACEN',
        requestData: null,
        articleLink,
      })),
    },
    requestData: { findUnique: vi.fn(async () => null) },
  };
  const requestsService: any = { approve: vi.fn() };
  const service = new AlmacenService(prisma, requestsService);
  return { service, requestsService };
}

describe('23.2 SAME activo bloquea avanzar hacia creación', () => {
  it('approve con SAME vigente lanza SAME_LINKED y no aprueba', async () => {
    const { service, requestsService } = buildAlmacen({
      decision: 'SAME', profitArticleCode: '094-7134-CAT', companyCode: 'AD_TRANS',
    });
    await expect(service.approve('req-9', 'u-alm', 'c1')).rejects.toThrow('SAME_LINKED');
    expect(requestsService.approve).not.toHaveBeenCalled();
  });

  it('sin vínculo la aprobación continúa su validación normal', async () => {
    const { service, requestsService } = buildAlmacen(null);
    await expect(service.approve('req-9', 'u-alm', 'c1')).rejects.toThrow('incompleta');
    expect(requestsService.approve).not.toHaveBeenCalled();
  });

  it('vínculo DIFFERENT vigente no bloquea (flujo normal)', async () => {
    const { service, requestsService } = buildAlmacen({
      decision: 'DIFFERENT', profitArticleCode: 'AAA', companyCode: 'AD_TRANS',
    });
    await expect(service.approve('req-9', 'u-alm', 'c1')).rejects.toThrow('incompleta');
    expect(requestsService.approve).not.toHaveBeenCalled();
  });
});
