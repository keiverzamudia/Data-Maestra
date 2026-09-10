import { Injectable, NotFoundException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { SolicitudesService } from '../solicitudes/solicitud.service';
import { ProfitAdapterService } from '../profit/profit-adapter.service';
import { flattenRequestData } from '../../comun/utilidades/flatten-request-data';

const REQUEST_INCLUDE = {
  company: true,
  department: true,
  requester: true,
  requestData: true,
  accountingCodes: true,
  workflowInstance: true,
  // 12E — trazabilidad: quién aprobó cada etapa (actor real, sin usuario conectado).
  approvals: {
    include: { actor: { select: { id: true, username: true, displayName: true } } },
    orderBy: { createdAt: 'desc' },
  },
} as const;

@Injectable()
export class ContabilidadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestsService: SolicitudesService,
    private readonly profit: ProfitAdapterService,
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
    // 12G — observaciones opcionales de la decisión; van como comentario del approval.
    comment?: string,
  ) {
    const request = await this.findOneForReview(id);

    if (request.status !== 'PENDIENTE_CONTABILIDAD') {
      throw new NotFoundException(`Request ${id} is not pending accounting approval`);
    }

    this.validateAccountingCodes(accountingCodes);

    // 12C — el grupo debe tener estándar en Profit (lin_art.dis_cen); si no,
    // la aprobación se bloquea hasta configurarlo en Profit. Sin conteo fijo:
    // mínimo 1 posición, máximo c1..c10.
    await this.requireGroupStandard(request.groupId);

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

    return this.requestsService.approve(id, { action: 'APPROVE', comment: comment?.trim() || 'Accounting approved' }, userId, companyId);
  }

  /**
   * Valida posiciones c1..c10 (8E, regla 12C):
   * - mínimo 1 posición, máximo 10, una sola cuenta por posición,
   * - posición válida c1..c10, código y descripción no vacíos.
   * Sin `position` (llamadas anteriores a 8E) se acepta por compatibilidad.
   */
  private validateAccountingCodes(codes: Array<{ code: string; description: string; position?: string }>) {
    if (codes.length < 1) {
      throw new BadRequestException('Se requiere mínimo 1 posición contable (c1..c10).');
    }
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

  /**
   * 12C — Exige estándar contable del grupo en Profit antes de aprobar.
   * Resuelve el código Profit del grupo local y consulta lin_art.dis_cen en vivo.
   * Sin estándar → 400 con guía (configurar en Profit y reverificar).
   * Profit inaccesible → 503 (fail-closed con mensaje explícito).
   */
  private async requireGroupStandard(groupId?: string | null) {
    if (!groupId) {
      throw new BadRequestException('La solicitud no tiene grupo clasificado.');
    }
    const group = await this.prisma.catalogGroup.findUnique({ where: { id: groupId } });
    const groupCode = group?.sourceCode?.trim() || group?.code?.trim();
    if (!groupCode) {
      throw new BadRequestException('El grupo no tiene código Profit asociado.');
    }
    let standard;
    try {
      standard = await this.profit.getGroupAccountingStandard(groupCode);
    } catch (err: any) {
      throw new ServiceUnavailableException(
        `No se pudo consultar Profit para el grupo ${groupCode}: ${err?.message ?? 'sin respuesta'}. Reintente.`,
      );
    }
    if (!standard.configured) {
      throw new BadRequestException(
        `El grupo ${groupCode} no tiene información contable configurada en Profit. ` +
        `Configúrela directamente en Profit y verifique nuevamente.`,
      );
    }
  }

  async reject(id: string, comment?: string, userId?: string, companyId?: string) {    const request = await this.findOneForReview(id);

    if (request.status !== 'PENDIENTE_CONTABILIDAD') {
      throw new NotFoundException(`Request ${id} is not pending accounting approval`);
    }

    if (!comment || !comment.trim()) {
      throw new BadRequestException('El motivo del rechazo es obligatorio');
    }

    return this.requestsService.approve(id, { action: 'RETURN', comment }, userId!, companyId!);
  }
}
