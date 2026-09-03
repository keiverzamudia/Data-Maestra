import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { SolicitudesService } from '../solicitudes/solicitud.service';
import { flattenRequestData } from '../../comun/utilidades/flatten-request-data';

const REQUEST_INCLUDE = {
  company: true,
  department: true,
  requester: true,
  requestData: true,
  accountingCodes: true,
  workflowInstance: true,
} as const;

@Injectable()
export class ContabilidadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestsService: SolicitudesService,
  ) {}

  async findPendingApproval() {
    const rows = await this.prisma.request.findMany({
      where: { status: 'PENDIENTE_CONTABILIDAD' },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(flattenRequestData);
  }

  async findOneForReview(id: string) {
    const raw = await this.prisma.request.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });

    if (!raw) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    return flattenRequestData(raw);
  }

  async approve(
    id: string,
    accountingCodes: Array<{ code: string; description: string; position?: string }>,
    userId: string,
    companyId: string,
  ) {
    const request = await this.findOneForReview(id);

    if (request.status !== 'PENDIENTE_CONTABILIDAD') {
      throw new NotFoundException(`Request ${id} is not pending accounting approval`);
    }

    this.validateAccountingCodes(accountingCodes);

    if (accountingCodes.length > 0) {
      await this.prisma.requestAccountingCode.createMany({
        data: accountingCodes.map((ac) => ({
          requestId: id,
          code: ac.code.trim(),
          description: ac.description.trim(),
          position: ac.position?.trim() || null,
        })),
      });
    }

    return this.requestsService.approve(id, { action: 'APPROVE', comment: 'Accounting approved' }, userId, companyId);
  }

  /**
   * Valida posiciones c1..c10 (Fase 8E):
   * - máximo 10, una sola cuenta por posición, posición válida c1..c10,
   * - código y descripción no vacíos y del mismo registro (esto último
   *   lo garantiza la UI al seleccionar el objeto Cuenta completo).
   * Sin `position` (llamadas anteriores a 8E) se acepta por compatibilidad.
   */
  private validateAccountingCodes(codes: Array<{ code: string; description: string; position?: string }>) {
    if (codes.length > 10) {
      throw new BadRequestException('Máximo 10 posiciones contables (c1..c10).');
    }
    const seen = new Set<string>();
    for (const ac of codes) {
      if (!ac.code?.trim() || !ac.description?.trim()) {
        throw new BadRequestException('Cada código contable requiere código y descripción del mismo registro.');
      }
      if (ac.position == null || ac.position === '') continue;
      const pos = ac.position.trim();
      if (!/^c([1-9]|10)$/.test(pos)) {
        throw new BadRequestException(`Posición inválida: "${ac.position}". Use c1..c10.`);
      }
      if (seen.has(pos)) {
        throw new BadRequestException(`Posición duplicada: ${pos}. Una sola cuenta por posición.`);
      }
      seen.add(pos);
    }
  }

  async reject(id: string, comment?: string, userId?: string, companyId?: string) {
    const request = await this.findOneForReview(id);

    if (request.status !== 'PENDIENTE_CONTABILIDAD') {
      throw new NotFoundException(`Request ${id} is not pending accounting approval`);
    }

    if (!comment || !comment.trim()) {
      throw new BadRequestException('El motivo del rechazo es obligatorio');
    }

    return this.requestsService.approve(id, { action: 'RETURN', comment }, userId!, companyId!);
  }
}
