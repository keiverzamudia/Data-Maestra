import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../comun/prisma/prisma.service';

@Injectable()
export class PanelService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(companyId?: string) {
    const where = companyId ? { companyId } : {};

    const [
      pendingRequests,
      inApproval,
      returnedRequests,
      completedRequests,
      totalRequests,
      recentImports,
    ] = await Promise.all([
      this.prisma.request.count({
        where: { ...where, status: { in: ['PENDIENTE_GERENTE', 'PENDIENTE_ALMACEN'] } },
      }),
      this.prisma.request.count({
        where: { ...where, status: { in: ['PENDIENTE_CONTABILIDAD', 'PENDIENTE_VALIDACION_MAESTRA'] } },
      }),
      this.prisma.request.count({
        where: { ...where, status: 'DEVUELTO' },
      }),
      this.prisma.request.count({
        where: { ...where, status: 'APROBADO_FINAL' },
      }),
      this.prisma.request.count({ where }),
      this.prisma.importRun.count({
        where: companyId ? { companyId } : {},
      }),
    ]);

    return {
      pendingRequests,
      inApproval,
      returnedRequests,
      completedRequests,
      totalRequests,
      recentImports,
      activeMasterItems: 0,
      pendingHomologation: 0,
      pendingSourceItems: 0,
      pendingMatches: 0,
      qualityIssues: 0,
    };
  }

  async getRecentActivity(companyId?: string) {
    const where = companyId ? { companyId } : {};

    const recentRequests = await this.prisma.request.findMany({
      where,
      include: {
        requester: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return recentRequests.map(r => ({
      id: r.id,
      requestNumber: r.requestNumber,
      description: r.requestedDescription,
      status: r.status,
      actor: r.requester?.displayName || '—',
      createdAt: r.createdAt,
    }));
  }
}
