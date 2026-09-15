import { BadRequestException, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { ProfitAdapterService } from '../profit/profit-adapter.service';
import { CatalogVisibilityService, type CatalogType } from './catalog-visibility.service';

export interface ClassificationCodes {
  groupCode: string;
  subgroupCode: string;
  categoryCode?: string;
  categoryName?: string;
  brandCode?: string;
  brandName?: string;
}

export interface ResolvedClassification {
  groupId: string;
  subgroupId: string;
  categoryId?: string;
  brandId?: string;
  /** Etiquetas de filas locales creadas (catálogo completado). */
  provisioned: string[];
}

/** Resultado de verificación sin escritura (dry-run, FASE 14C-FORM §24). */
export interface ClassificationCheck {
  groupId?: string;
  subgroupId?: string;
  categoryId?: string;
  brandId?: string;
  /** Acciones que ESCRIBIRÍA resolveClassification (provisión local). */
  wouldProvision: string[];
}

@Injectable()
export class CatalogosService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly profit?: ProfitAdapterService,
    @Optional() private readonly visibility?: CatalogVisibilityService,
  ) {}

  /**
   * Resuelve códigos Profit (FASE 8F) a IDs locales para RequestData.
   * Fuente única: existencia en Profit + visibilidad Data-Maestra (misma
   * fuente que los selectores). Sin capa de visibilidad (tests legacy):
   * comportamiento local anterior.
   * - Grupo: debe existir en Profit y estar visible; se espeja en local.
   * - Subgrupo: debe pertenecer al grupo y estar visible (padre incluido).
   * - Categoría: reutiliza por código global; si falta, la crea bajo el
   *   subgrupo seleccionado (Profit la define independiente).
   * - Marca (colores Profit): reutiliza por nombre normalizado; si falta,
   *   la crea (requiere brandName). Solo catálogo local, nunca Profit.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async resolveClassification(tx: any, codes: ClassificationCodes, opts: { companyId?: string } = {}): Promise<ResolvedClassification> {
    const groupCode = codes.groupCode.trim();
    const subgroupCode = codes.subgroupCode.trim();
    if (!this.visibility || !this.profit) {
      return this.resolveLegacy(tx, codes);
    }
    const scope = opts.companyId ?? '';

    const group = await this.requireGroup(groupCode, scope, tx);
    const subgroup = await this.requireSubgroup(groupCode, subgroupCode, scope, tx);

    const provisioned: string[] = [];
    let categoryId: string | undefined;
    if (codes.categoryCode?.trim()) {
      const catCode = codes.categoryCode.trim();
      await this.requireCatalogItem('CATEGORY', catCode, scope, 'categoría');
      const existing = await tx.catalogCategory.findFirst({ where: { code: catCode } });
      if (existing) {
        categoryId = existing.id;
      } else {
        const created = await tx.catalogCategory.create({
          data: { subgroupId: subgroup.id, code: catCode, name: codes.categoryName?.trim() || catCode },
        });
        categoryId = created.id;
        provisioned.push(`category:${catCode}`);
      }
    }

    let brandId: string | undefined;
    if (codes.brandCode?.trim()) {
      const brandName = codes.brandName?.trim() || codes.brandCode.trim();
      await this.requireCatalogItem('BRAND', codes.brandCode.trim(), scope, 'marca');
      const normalized = brandName.toUpperCase();
      const existing = await tx.brand.findFirst({ where: { normalizedName: normalized } });
      if (existing) {
        brandId = existing.id;
      } else {
        const created = await tx.brand.create({
          data: { name: brandName, normalizedName: normalized },
        });
        brandId = created.id;
        provisioned.push(`brand:${normalized}`);
      }
    }

    return { groupId: group.id, subgroupId: subgroup.id, categoryId, brandId, provisioned };
  }

  /**
   * Verifica códigos Profit contra la fuente única SIN escribir (dry-run).
   * Misma lógica de existencia/visibilidad/combinación que resolveClassification.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async checkClassification(db: any, codes: ClassificationCodes, opts: { companyId?: string } = {}): Promise<ClassificationCheck> {
    const groupCode = codes.groupCode.trim();
    const subgroupCode = codes.subgroupCode.trim();
    if (!this.visibility || !this.profit) {
      return this.checkLegacy(db, codes);
    }
    const scope = opts.companyId ?? '';

    const group = await this.requireGroupReadonly(groupCode, scope, db);
    await this.requireSubgroupReadonly(groupCode, subgroupCode, scope);

    const wouldProvision: string[] = [];
    let categoryId: string | undefined;
    if (codes.categoryCode?.trim()) {
      await this.requireCatalogItem('CATEGORY', codes.categoryCode.trim(), scope, 'categoría');
      const existing = await db.catalogCategory.findFirst({ where: { code: codes.categoryCode.trim() } });
      if (existing) categoryId = existing.id;
      else wouldProvision.push(`category:${codes.categoryCode.trim()}`);
    }

    let brandId: string | undefined;
    if (codes.brandCode?.trim()) {
      await this.requireCatalogItem('BRAND', codes.brandCode.trim(), scope, 'marca');
      const normalized = (codes.brandName?.trim() || codes.brandCode.trim()).toUpperCase();
      const existing = await db.brand.findFirst({ where: { normalizedName: normalized } });
      if (existing) brandId = existing.id;
      else wouldProvision.push(`brand:${normalized}`);
    }

    return { groupId: group.id, subgroupId: (await db.catalogSubgroup.findFirst({ where: { groupId: group.id, code: subgroupCode } }))?.id, categoryId, brandId, wouldProvision };
  }

  /**
   * Valida unidad/tipo/impuesto contra existencia Profit + visibilidad
   * (mensajes §61). Sin capa (legacy): solo existencia viva para unidad.
   */
  async checkUnit(unitCode: string, companyId?: string): Promise<void> {
    const code = (unitCode ?? '').trim();
    if (!code) throw new BadRequestException('unitCode (unidad Profit) es requerido');
    if (!this.visibility || !this.profit) {
      if (!this.profit) {
        throw new ServiceUnavailableException('Validación Profit no disponible (adapter sin configurar)');
      }
      const unit = await this.profit.getUnit(code);
      if (!unit) throw new BadRequestException(`Unidad Profit inexistente: ${code} (uni_venta debe existir en dbo.unidades)`);
      return;
    }
    const scope = companyId ?? '';
    const exists = await this.visibility.checkExists('UNIT', code);
    if (!exists.exists) {
      if (!exists.live) {
        throw new ServiceUnavailableException('No fue posible consultar el catálogo de Profit.');
      }
      throw new BadRequestException(`La unidad ${code} no existe en Profit.`);
    }
    const visible = await this.visibility.isVisible('UNIT', code, { companyId: scope || undefined });
    if (!visible) {
      throw new BadRequestException(`La unidad ${code} existe en Profit pero está deshabilitada para Data-Maestra.`);
    }
  }

  /** Dominio + visibilidad para tipo de artículo e impuesto (tolerante sin capa). */
  async checkArticleType(code: string, companyId?: string): Promise<void> {
    await this.checkSimpleCatalog('ARTICLE_TYPE', code, companyId, 'tipo de artículo');
  }

  async checkTaxType(code: string, companyId?: string): Promise<void> {
    await this.checkSimpleCatalog('TAX', code, companyId, 'impuesto');
  }

  private async checkSimpleCatalog(type: CatalogType, code: string, companyId: string | undefined, label: string): Promise<void> {
    const c = (code ?? '').trim();
    if (!c) throw new BadRequestException(`${label}: código requerido`);
    if (!this.visibility || !this.profit) return;
    const scope = companyId ?? '';
    const exists = await this.visibility.checkExists(type, c);
    if (!exists.exists) {
      if (!exists.live) throw new ServiceUnavailableException('No fue posible consultar el catálogo de Profit.');
      throw new BadRequestException(`El ${label} ${c} no existe en Profit.`);
    }
    const visible = await this.visibility.isVisible(type, c, { companyId: scope || undefined });
    if (!visible) {
      throw new BadRequestException(`El ${label} ${c} existe en Profit pero está deshabilitado para Data-Maestra.`);
    }
  }

  private async requireGroup(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    groupCode: string, scope: string, tx: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const exists = await this.visibility!.checkExists('GROUP', groupCode);
    if (!exists.exists) {
      if (!exists.live) throw new ServiceUnavailableException('No fue posible consultar el catálogo de Profit.');
      throw new BadRequestException(`El grupo ${groupCode} no existe en Profit.`);
    }
    const visible = await this.visibility!.isVisible('GROUP', groupCode, { companyId: scope || undefined });
    if (!visible) {
      throw new BadRequestException(`El grupo ${groupCode} existe en Profit pero está deshabilitado para Data-Maestra.`);
    }
    const name = exists.description ?? groupCode;
    let group = await tx.catalogGroup.findUnique({ where: { code: groupCode } });
    if (!group) {
      group = await tx.catalogGroup.create({
        data: { code: groupCode, name, active: true, sourceSystem: 'PROFIT', sourceCode: groupCode },
      });
    } else if (group.name !== name || !group.active) {
      group = await tx.catalogGroup.update({
        where: { code: groupCode },
        data: { name, active: true, sourceSystem: 'PROFIT', sourceCode: groupCode },
      });
    }
    return group;
  }

  private async requireSubgroup(
    groupCode: string, subgroupCode: string, scope: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const exists = await this.visibility!.checkExists('SUBGROUP', subgroupCode, { parentCode: groupCode });
    if (!exists.exists) {
      if (!exists.live) throw new ServiceUnavailableException('No fue posible consultar el catálogo de Profit.');
      throw new BadRequestException(
        `Subgrupo ${subgroupCode} no pertenece al grupo ${groupCode} (combinación inválida)`,
      );
    }
    const visible = await this.visibility!.isVisible('SUBGROUP', subgroupCode, {
      companyId: scope || undefined, parentCode: groupCode,
    });
    if (!visible) {
      throw new BadRequestException(`El subgrupo ${subgroupCode} existe en Profit pero está deshabilitado para Data-Maestra.`);
    }
    const group = await tx.catalogGroup.findUnique({ where: { code: groupCode } });
    if (!group) throw new BadRequestException(`El grupo ${groupCode} no existe en Profit.`);
    let subgroup = await tx.catalogSubgroup.findFirst({ where: { groupId: group.id, code: subgroupCode } });
    const name = exists.description ?? subgroupCode;
    if (!subgroup) {
      subgroup = await tx.catalogSubgroup.create({
        data: { groupId: group.id, code: subgroupCode, name, active: true, sourceSystem: 'PROFIT', sourceCode: subgroupCode },
      });
    } else if (subgroup.name !== name || !subgroup.active) {
      subgroup = await tx.catalogSubgroup.update({
        where: { id: subgroup.id },
        data: { name, active: true, sourceSystem: 'PROFIT', sourceCode: subgroupCode },
      });
    }
    return subgroup;
  }

  private async requireGroupReadonly(
    groupCode: string, scope: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const exists = await this.visibility!.checkExists('GROUP', groupCode);
    if (!exists.exists) {
      if (!exists.live) throw new ServiceUnavailableException('No fue posible consultar el catálogo de Profit.');
      throw new BadRequestException(`El grupo ${groupCode} no existe en Profit.`);
    }
    const visible = await this.visibility!.isVisible('GROUP', groupCode, { companyId: scope || undefined });
    if (!visible) {
      throw new BadRequestException(`El grupo ${groupCode} existe en Profit pero está deshabilitado para Data-Maestra.`);
    }
    const group = await db.catalogGroup.findUnique({ where: { code: groupCode } });
    if (!group) throw new BadRequestException(`El grupo ${groupCode} no existe en Profit.`);
    return group;
  }

  private async requireSubgroupReadonly(
    groupCode: string, subgroupCode: string, scope: string,
  ): Promise<void> {
    const exists = await this.visibility!.checkExists('SUBGROUP', subgroupCode, { parentCode: groupCode });
    if (!exists.exists) {
      if (!exists.live) throw new ServiceUnavailableException('No fue posible consultar el catálogo de Profit.');
      throw new BadRequestException(
        `Subgrupo ${subgroupCode} no pertenece al grupo ${groupCode} (combinación inválida)`,
      );
    }
    const visible = await this.visibility!.isVisible('SUBGROUP', subgroupCode, {
      companyId: scope || undefined, parentCode: groupCode,
    });
    if (!visible) {
      throw new BadRequestException(`El subgrupo ${subgroupCode} existe en Profit pero está deshabilitado para Data-Maestra.`);
    }
  }

  private async requireCatalogItem(type: CatalogType, code: string, scope: string, label: string): Promise<void> {
    const exists = await this.visibility!.checkExists(type, code);
    if (!exists.exists) {
      if (!exists.live) throw new ServiceUnavailableException('No fue posible consultar el catálogo de Profit.');
      throw new BadRequestException(`La ${label} ${code} no existe en Profit.`);
    }
    const visible = await this.visibility!.isVisible(type, code, { companyId: scope || undefined });
    if (!visible) {
      throw new BadRequestException(`La ${label} ${code} existe en Profit pero está deshabilitada para Data-Maestra.`);
    }
  }

  /**
   * Comportamiento local anterior (sin capa de visibilidad): preservado para
   * compatibilidad de tests y como degradación documentada.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async resolveLegacy(tx: any, codes: ClassificationCodes): Promise<ResolvedClassification> {
    const groupCode = codes.groupCode.trim();
    const subgroupCode = codes.subgroupCode.trim();

    const group = await tx.catalogGroup.findUnique({ where: { code: groupCode } });
    if (!group) {
      throw new BadRequestException(`Grupo Profit inexistente en catálogo local: ${groupCode}`);
    }

    const subgroup = await tx.catalogSubgroup.findFirst({
      where: { groupId: group.id, code: subgroupCode },
    });
    if (!subgroup) {
      throw new BadRequestException(
        `Subgrupo ${subgroupCode} no pertenece al grupo ${groupCode} (combinación inválida)`,
      );
    }

    const provisioned: string[] = [];
    let categoryId: string | undefined;
    if (codes.categoryCode?.trim()) {
      const catCode = codes.categoryCode.trim();
      const existing = await tx.catalogCategory.findFirst({ where: { code: catCode } });
      if (existing) {
        categoryId = existing.id;
      } else {
        const created = await tx.catalogCategory.create({
          data: { subgroupId: subgroup.id, code: catCode, name: codes.categoryName?.trim() || catCode },
        });
        categoryId = created.id;
        provisioned.push(`category:${catCode}`);
      }
    }

    let brandId: string | undefined;
    if (codes.brandCode?.trim()) {
      const brandName = codes.brandName?.trim() || codes.brandCode.trim();
      const normalized = brandName.toUpperCase();
      const existing = await tx.brand.findFirst({ where: { normalizedName: normalized } });
      if (existing) {
        brandId = existing.id;
      } else {
        const created = await tx.brand.create({
          data: { name: brandName, normalizedName: normalized },
        });
        brandId = created.id;
        provisioned.push(`brand:${normalized}`);
      }
    }

    return { groupId: group.id, subgroupId: subgroup.id, categoryId, brandId, provisioned };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async checkLegacy(db: any, codes: ClassificationCodes): Promise<ClassificationCheck> {
    const groupCode = codes.groupCode.trim();
    const subgroupCode = codes.subgroupCode.trim();

    const group = await db.catalogGroup.findUnique({ where: { code: groupCode } });
    if (!group) {
      throw new BadRequestException(`Grupo Profit inexistente en catálogo local: ${groupCode}`);
    }

    const subgroup = await db.catalogSubgroup.findFirst({
      where: { groupId: group.id, code: subgroupCode },
    });
    if (!subgroup) {
      throw new BadRequestException(
        `Subgrupo ${subgroupCode} no pertenece al grupo ${groupCode} (combinación inválida)`,
      );
    }

    const wouldProvision: string[] = [];
    let categoryId: string | undefined;
    if (codes.categoryCode?.trim()) {
      const existing = await db.catalogCategory.findFirst({ where: { code: codes.categoryCode.trim() } });
      if (existing) categoryId = existing.id;
      else wouldProvision.push(`category:${codes.categoryCode.trim()}`);
    }

    let brandId: string | undefined;
    if (codes.brandCode?.trim()) {
      const normalized = (codes.brandName?.trim() || codes.brandCode.trim()).toUpperCase();
      const existing = await db.brand.findFirst({ where: { normalizedName: normalized } });
      if (existing) brandId = existing.id;
      else wouldProvision.push(`brand:${normalized}`);
    }

    return { groupId: group.id, subgroupId: subgroup.id, categoryId, brandId, wouldProvision };
  }

  findAllGroups() {
    return this.prisma.catalogGroup.findMany({
      orderBy: { code: 'asc' },
    });
  }

  findAllSubgroups(groupId?: string) {
    return this.prisma.catalogSubgroup.findMany({
      where: groupId ? { groupId } : undefined,
      orderBy: { code: 'asc' },
    });
  }

  findAllCategories(subgroupId?: string) {
    return this.prisma.catalogCategory.findMany({
      where: subgroupId ? { subgroupId } : undefined,
      orderBy: { code: 'asc' },
    });
  }

  findAllBrands() {
    return this.prisma.brand.findMany({
      orderBy: { name: 'asc' },
    });
  }

  findAllUnits() {
    return this.prisma.unitOfMeasure.findMany({
      orderBy: { code: 'asc' },
    });
  }
}
