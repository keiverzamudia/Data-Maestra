import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { SolicitudesService } from '../solicitudes/solicitud.service';
import { flattenRequestData } from '../../comun/utilidades/flatten-request-data';

/**
 * FASE 15A — Aprobación gerencial de Almacén (Encargado de Almacén).
 *
 * Cola propia: solicitudes en ALMACEN_APROBADO (clasificación completada por
 * Almacén, pendiente de revisión independiente). Reutiliza el modelo existente
 * (Request/WorkflowTask/WorkflowTransition/approval/history/audit) delegando
 * en SolicitudesService.approve; no crea tablas ni transiciones nuevas.
 * La aprobación avanza a PENDIENTE_CONTABILIDAD vía la transición existente.
 */
const REQUEST_INCLUDE = {
  company: true,
  department: true,
  requester: true,
  requestData: true,
  workflowInstance: true,
  approvals: {
    include: { actor: { select: { id: true, username: true, displayName: true } } },
    orderBy: { createdAt: 'desc' },
  },
} as const;

@Injectable()
export class AprobacionAlmacenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestsService: SolicitudesService,
  ) {}

  async findPendingApproval(companyId?: string) {
    const rows = await this.prisma.request.findMany({
      where: { status: 'ALMACEN_APROBADO', ...(companyId ? { companyId } : {}) },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(flattenRequestData);
  }

  async findOneForApproval(id: string, companyId?: string) {
    const raw = await this.prisma.request.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });

    if (!raw || raw.status !== 'ALMACEN_APROBADO') {
      throw new NotFoundException(`Request ${id} is not pending warehouse-manager approval`);
    }
    if (companyId && raw.companyId !== companyId) {
      throw new NotFoundException(`Request ${id} is not pending warehouse-manager approval`);
    }

    return flattenRequestData(raw);
  }

  /**
   * Aprueba la clasificación y envía a Contabilidad (transición existente
   * ALMACEN_APROBADO → PENDIENTE_CONTABILIDAD con auditoría/historial/SSE).
   * Una segunda aprobación encuentra otro estado y recibe error controlado.
   */
  async approve(id: string, userId: string, companyId: string) {
    await this.findOneForApproval(id, companyId);
    await this.assertClassificationComplete(id);
    return this.requestsService.approve(
      id,
      { action: 'APPROVE', comment: 'Aprobación del Encargado de Almacén' },
      userId,
      companyId,
    );
  }

  /** Devuelve la solicitud (regla existente: ALMACEN_APROBADO → PENDIENTE_GERENTE). */
  async returnRequest(id: string, comment: string | undefined, userId: string, companyId: string) {
    await this.findOneForApproval(id, companyId);
    if (!comment?.trim()) {
      throw new BadRequestException('El motivo de la devolución es obligatorio.');
    }
    return this.requestsService.approve(id, { action: 'RETURN', comment }, userId, companyId);
  }

  /** Rechaza la solicitud (regla existente: ALMACEN_APROBADO → RECHAZADO). */
  async reject(id: string, comment: string | undefined, userId: string, companyId: string) {
    await this.findOneForApproval(id, companyId);
    if (!comment?.trim()) {
      throw new BadRequestException('El motivo del rechazo es obligatorio.');
    }
    return this.requestsService.approve(id, { action: 'REJECT', comment }, userId, companyId);
  }

  /** Misma completitud que exige Almacén antes de avanzar (14C-FORM §23). */
  private async assertClassificationComplete(id: string): Promise<void> {
    const requestData = await this.prisma.requestData.findUnique({ where: { requestId: id } });
    if (!requestData || !requestData.groupId || !requestData.subgroupId || !requestData.masterCode) {
      throw new BadRequestException('No se puede aprobar: la clasificación de Almacén está incompleta. Faltan grupo, subgrupo o código master.');
    }
    const rd = requestData as { articleType?: string | null; unitCode?: string | null; taxType?: string | null };
    const missing: string[] = [];
    if (!rd.articleType) missing.push('tipo de artículo');
    if (!rd.unitCode) missing.push('unidad Profit');
    if (!rd.taxType) missing.push('impuesto (tipo_imp)');
    if (missing.length > 0) {
      throw new BadRequestException(`No se puede aprobar: faltan datos para Profit: ${missing.join(', ')}.`);
    }
  }
}
