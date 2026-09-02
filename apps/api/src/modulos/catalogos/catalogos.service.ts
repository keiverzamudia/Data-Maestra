import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../comun/prisma/prisma.service';

@Injectable()
export class CatalogosService {
  constructor(private readonly prisma: PrismaService) {}

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
