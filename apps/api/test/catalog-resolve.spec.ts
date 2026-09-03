import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CatalogosService } from '../src/modulos/catalogos/catalogos.service';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';

function createTxMock() {
  return {
    catalogGroup: { findUnique: vi.fn() },
    catalogSubgroup: { findFirst: vi.fn(), findUnique: vi.fn() },
    catalogCategory: { findFirst: vi.fn(), create: vi.fn() },
    brand: { findFirst: vi.fn(), create: vi.fn() },
    masterItem: { findFirst: vi.fn() },
  };
}

describe('CatalogosService.resolveClassification (FASE 8F)', () => {
  let service: CatalogosService;
  let tx: ReturnType<typeof createTxMock>;

  beforeEach(() => {
    service = new CatalogosService({} as any);
    tx = createTxMock();
  });

  it('resuelve grupo+subgrupo Profit a IDs locales', async () => {
    tx.catalogGroup.findUnique.mockResolvedValue({ id: 'g-rvh', code: 'RVH' });
    tx.catalogSubgroup.findFirst.mockResolvedValue({ id: 'sg-car', code: 'CAR' });

    const r = await service.resolveClassification(tx as any, { groupCode: 'RVH', subgroupCode: 'CAR' });

    expect(r.groupId).toBe('g-rvh');
    expect(r.subgroupId).toBe('sg-car');
    expect(tx.catalogSubgroup.findFirst).toHaveBeenCalledWith({
      where: { groupId: 'g-rvh', code: 'CAR' },
    });
  });

  it('rechaza grupo inexistente', async () => {
    tx.catalogGroup.findUnique.mockResolvedValue(null);

    await expect(
      service.resolveClassification(tx as any, { groupCode: 'XXX', subgroupCode: 'CAR' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza subgrupo de otro grupo (combinación inválida)', async () => {
    tx.catalogGroup.findUnique.mockResolvedValue({ id: 'g-mec', code: 'MEC' });
    tx.catalogSubgroup.findFirst.mockResolvedValue(null);

    await expect(
      service.resolveClassification(tx as any, { groupCode: 'MEC', subgroupCode: 'CAR' }),
    ).rejects.toThrow(/no pertenece al grupo/);
  });

  it('reutiliza categoría existente por código', async () => {
    tx.catalogGroup.findUnique.mockResolvedValue({ id: 'g1', code: 'RVH' });
    tx.catalogSubgroup.findFirst.mockResolvedValue({ id: 'sg1', code: 'CAR' });
    tx.catalogCategory.findFirst.mockResolvedValue({ id: 'cat-002', code: '002' });

    const r = await service.resolveClassification(tx as any, {
      groupCode: 'RVH', subgroupCode: 'CAR', categoryCode: '002', categoryName: 'X',
    });

    expect(r.categoryId).toBe('cat-002');
    expect(tx.catalogCategory.create).not.toHaveBeenCalled();
  });

  it('provisiona categoría faltante bajo el subgrupo con su nombre Profit', async () => {
    tx.catalogGroup.findUnique.mockResolvedValue({ id: 'g1', code: 'RVH' });
    tx.catalogSubgroup.findFirst.mockResolvedValue({ id: 'sg1', code: 'CAR' });
    tx.catalogCategory.findFirst.mockResolvedValue(null);
    tx.catalogCategory.create.mockResolvedValue({ id: 'cat-new', code: '002' });

    const r = await service.resolveClassification(tx as any, {
      groupCode: 'RVH', subgroupCode: 'CAR', categoryCode: '002', categoryName: 'ARTICULOS DE OFICINA',
    });

    expect(r.categoryId).toBe('cat-new');
    expect(tx.catalogCategory.create).toHaveBeenCalledWith({
      data: { subgroupId: 'sg1', code: '002', name: 'ARTICULOS DE OFICINA' },
    });
    expect(r.provisioned).toContain('category:002');
  });

  it('reutiliza marca por nombre normalizado y provisiona si falta', async () => {
    tx.catalogGroup.findUnique.mockResolvedValue({ id: 'g1', code: 'RVH' });
    tx.catalogSubgroup.findFirst.mockResolvedValue({ id: 'sg1', code: 'CAR' });
    tx.brand.findFirst.mockResolvedValueOnce({ id: 'b1', name: 'GASOLINA' });

    const reuse = await service.resolveClassification(tx as any, {
      groupCode: 'RVH', subgroupCode: 'CAR', brandCode: 'F01', brandName: 'GASOLINA',
    });
    expect(reuse.brandId).toBe('b1');

    tx.brand.findFirst.mockResolvedValueOnce(null);
    tx.brand.create.mockResolvedValue({ id: 'b2', name: 'MELAZA' });
    const created = await service.resolveClassification(tx as any, {
      groupCode: 'RVH', subgroupCode: 'CAR', brandCode: 'F03', brandName: 'MELAZA',
    });
    expect(created.brandId).toBe('b2');
    expect(tx.brand.create).toHaveBeenCalledWith({
      data: { name: 'MELAZA', normalizedName: 'MELAZA' },
    });
    expect(created.provisioned).toContain('brand:MELAZA');
  });
});

describe('SolicitudesService.classify con códigos Profit (FASE 8F)', () => {
  it('resuelve códigos a IDs y genera masterCode sin romper compatibilidad', async () => {
    const tx: any = {
      ...createTxMock(),
      requestData: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation((a: any) => Promise.resolve({ id: 'rd1', ...a.data })),
        update: vi.fn().mockImplementation((a: any) => Promise.resolve({ id: 'rd1', ...a.data })),
      },
      request: { update: vi.fn() },
      auditEvent: { create: vi.fn() },
      workflowInstance: {},
      workflowTask: { updateMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    };
    tx.catalogGroup.findUnique.mockImplementation(async (a: any) =>
      a.where.code ? { id: 'g-rvh', code: 'RVH' } : { id: a.where.id, code: 'RVH' },
    );
    tx.catalogSubgroup.findFirst.mockResolvedValue({ id: 'sg-car', code: 'CAR' });
    tx.catalogSubgroup.findUnique.mockResolvedValue({ id: 'sg-car', code: 'CAR' });
    tx.masterItem.findFirst.mockResolvedValue(null);

    const prisma: any = {
      request: { findUnique: vi.fn().mockResolvedValue({ id: 'req-1', status: 'PENDIENTE_ALMACEN' }) },
      $transaction: (fn: any) => fn(tx),
    };
    const catalogos = new CatalogosService({} as any);
    const service = new SolicitudesService(prisma, catalogos as any);

    const result = await service.classify(
      'req-1',
      { groupCode: 'RVH', subgroupCode: 'CAR' } as any,
      'u3',
      'c1',
    );

    expect(tx.requestData.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ requestId: 'req-1', groupId: 'g-rvh', subgroupId: 'sg-car' }),
    });
    expect(result.masterCode).toMatch(/^RVHCAR-/);
  });
});
