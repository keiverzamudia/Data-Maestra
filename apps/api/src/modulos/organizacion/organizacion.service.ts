import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../comun/prisma/prisma.service';

@Injectable()
export class OrganizacionService {
  constructor(private readonly prisma: PrismaService) {}

  async findCompanies() {
    return this.prisma.company.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }

  async findDepartments(companyId?: string) {
    return this.prisma.department.findMany({
      where: {
        active: true,
        ...(companyId ? { companyId } : {}),
      },
      include: { company: { select: { id: true, name: true, code: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findUsers(companyId?: string) {
    return this.prisma.user.findMany({
      where: { active: true },
      include: {
        userRoles: {
          where: companyId ? { companyId } : undefined,
          include: {
            role: { select: { id: true, code: true, name: true } },
            company: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { displayName: 'asc' },
    });
  }

  async findRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
    });
  }
}
