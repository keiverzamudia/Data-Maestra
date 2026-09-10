import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../comun/prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resuelve códigos Profit (FASE 8F) a IDs locales para RequestData.
   * - Grupo: debe existir (catálogo local cubre los 38 de Profit).
   * - Subgrupo: debe pertenecer al grupo (clave compuesta); rechaza
   *   combinaciones inválidas Grupo A + subgrupo de Grupo B.
   * - Categoría: reutiliza por código global; si falta, la crea bajo el
   *   subgrupo seleccionado (Profit la define independiente).
   * - Marca (colores Profit): reutiliza por nombre normalizado; si falta,
   *   la crea (requiere brandName). Solo catálogo local, nunca Profit.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async resolveClassification(tx: any, codes: ClassificationCodes): Promise<ResolvedClassification> {
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

  /**
   * Verifica códigos Profit contra el espejo local SIN escribir (dry-run).
   * Misma lógica de existencia/combinación que resolveClassification, pero la
   * provisión de categoría/marca faltante se reporta en `wouldProvision`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async checkClassification(db: any, codes: ClassificationCodes): Promise<ClassificationCheck> {
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
