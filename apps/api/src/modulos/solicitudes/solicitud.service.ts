import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ServiceUnavailableException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { ClassifyRequestDto } from './dto/classify-request.dto';
import { ApprovalDto } from './dto/approval.dto';
import { CatalogosService } from '../catalogos/catalogos.service';
import { ProfitArticleCreationService, type CreationPlan, type CreationResult } from '../profit/profit-article-creation.service';
import type { ProfitArticleInput } from '../profit/profit-article.payload';
import { buildProfitArticlePayload } from '../profit/profit-article.payload';
import { serializarDis } from '../contabilidad/dis.utils';
import {
  checkTaxCoherence,
  isArticleTypeCode,
  isTaxTypeCode,
} from '../profit/article-taxonomy';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { SseService } from '../notificaciones/sse.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { flattenRequestData } from '../../comun/utilidades/flatten-request-data';
import { getNextWorkflowState, isTerminalWorkflowState, WORKFLOW_STATES } from './workflow-states';

/**
 * 12F — Mensajes accionables por etapa (QUÉ + DÓNDE + QUÉ HACER).
 * Reglas de destinatarios sin cambios (11G); solo mejora el texto.
 */
export function stepNotificationMessage(
  stepCode: string,
  requestNumber: string,
  action?: string,
  comment?: string,
): { title: string; body: string; toRequester: boolean } {
  if (action === 'RETURN') {
    return {
      title: `Tu solicitud ${requestNumber} fue devuelta para corrección.`,
      body: `Motivo: ${comment ?? 'sin motivo registrado'}. Acción requerida: corregir y reenviar.`,
      toRequester: true,
    };
  }
  if (action === 'REJECT') {
    return {
      title: `Tu solicitud ${requestNumber} fue rechazada.`,
      body: `Motivo: ${comment ?? 'sin motivo registrado'}.`,
      toRequester: true,
    };
  }
  // 16A — Contabilidad es la última aprobación humana: se avisa al solicitante.
  if (stepCode === 'CONTABILIDAD_APROBADA') {
    return {
      title: `Tu solicitud ${requestNumber} fue aprobada por Contabilidad.`,
      body: `La solicitud ${requestNumber} completó la aprobación contable y está lista para su registro en Profit.`,
      toRequester: true,
    };
  }
  const queue: Record<string, string> = {
    PENDIENTE_GERENTE: 'aprobación de gerente',
    PENDIENTE_ALMACEN: 'clasificación',
    // 15A — cola del Encargado de Almacén (reutiliza ALMACEN_APROBADO).
    ALMACEN_APROBADO: 'aprobación del encargado de almacén',
    PENDIENTE_CONTABILIDAD: 'aprobación contable',
  };
  const what = queue[stepCode] ?? 'atención';
  return {
    title: `${requestNumber} requiere ${what}.`,
    body: `La solicitud ${requestNumber} está pendiente de ${what}.`,
    toRequester: false,
  };
}

@Injectable()
export class SolicitudesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogosService: CatalogosService,
    private readonly notificaciones: NotificacionesService,
    private readonly sse: SseService,
    private readonly authService: AutenticacionService,
    // Opcional al final para compatibilidad posicional en tests (Nest resuelve por tipo).
    // La validación Profit vive en CatalogosService (fuente única con visibilidad).
    private readonly profitCreation?: ProfitArticleCreationService,
  ) {}

  async create(dto: CreateRequestDto, userId: string, companyId: string, departmentId: string) {
    const requestNumber = await this.generateRequestNumber();

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.request.create({
        data: {
          requestNumber,
          companyId,
          departmentId,
          requesterId: userId,
          requestedDescription: dto.requestedDescription,
          purpose: dto.purpose,
          priority: dto.priority ?? 0,
          referencePhotoUri: dto.referencePhotoUri,
          status: 'BORRADOR',
        },
      });

      await tx.auditEvent.create({
        data: {
          correlationId: request.id,
          requestId: request.id,
          actorId: userId,
          actorCompanyId: companyId,
          entityType: 'Request',
          entityId: request.id,
          action: 'CREATED',
          afterData: JSON.stringify({
            requestNumber,
            status: 'BORRADOR',
            requestedDescription: dto.requestedDescription,
          }),
        },
      });

      return request;
    });
  }

  async findAll(filters: { companyId?: string; status?: string; search?: string }) {
    const where: Record<string, unknown> = {};

    if (filters.companyId) {
      where.companyId = filters.companyId;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.search) {
      where.OR = [
        { requestNumber: { contains: filters.search } },
        { requestedDescription: { contains: filters.search } },
        { purpose: { contains: filters.search } },
      ];
    }

    return this.prisma.request.findMany({
      where,
      include: {
        company: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true, managerId: true } },
        requester: { select: { id: true, username: true, displayName: true } },
        requestData: true,
        workflowInstance: { select: { id: true, currentStepCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    }).then(rows => rows.map(flattenRequestData));
  }

  // =====================================================================
  // 13A — Visibilidad server-side por rol/empresa/departamento/etapa.
  // Reglas con permisos efectivos reales (DENEGADO > CONCEDIDO > HEREDADO).
  // =====================================================================

  static readonly COMPLETADA = ['CONTABILIDAD_APROBADA', 'INSERTADO_PROFIT'];
  static readonly RECHAZADA = ['RECHAZADO'];
  static readonly PAGE_SIZES = [25, 50, 100];

  /** Paso → permiso de acción que lo atiende (misma regla que notificaciones 11G/12F). */
  private static readonly QUEUE_PERMISSION: Record<string, string> = {
    PENDIENTE_ALMACEN: 'WAREHOUSE.CLASSIFY',
    // 15A — ALMACEN_APROBADO es la cola del Encargado de Almacén, no de Almacén.
    ALMACEN_APROBADO: 'WAREHOUSE_MANAGER.APPROVE',
    PENDIENTE_CONTABILIDAD: 'ACCOUNTING.APPROVE',
  };

  private async getViewer(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) {
      throw new ForbiddenException('Usuario inactivo o inexistente.');
    }
    const memberships = await this.authService.getMemberships(userId);
    const companies = [...new Set(memberships.map(m => m.companyId))];
    const permsByCompany = new Map<string, string[]>();
    for (const c of companies) {
      const eff = await this.authService.getEffectivePermissions(userId, c);
      permsByCompany.set(c, eff.permissions);
    }
    const global = await this.authService.getEffectivePermissions(userId);
    const managedDepts = await this.prisma.department.findMany({
      where: { managerId: userId },
      select: { id: true, companyId: true },
    });
    return {
      userId,
      isAdmin: global.permissions.includes('ADMIN.MANAGE'),
      companies,
      permsByCompany,
      managedDepts,
    };
  }

  private queueStepsFor(viewer: Awaited<ReturnType<SolicitudesService['getViewer']>>, companyId: string): string[] {
    const perms = viewer.permsByCompany.get(companyId) ?? [];
    const steps: string[] = [];
    for (const [step, perm] of Object.entries(SolicitudesService.QUEUE_PERMISSION)) {
      if (perms.includes(perm)) steps.push(step);
    }
    return steps;
  }

  /**
   * WHERE base de una pestaña. Activas = lo que debe atender/ver ahora;
   * historial = participación real (aprobó/rechazó/clasificó) o propio.
   * NOTA 13B: Request NO tiene relación `auditEvents` en Prisma; la
   * participación por clasificación se resuelve en dos pasos (ids vía
   * auditEvent + `id: { in }`). Un filtro de relación inexistente = 500.
   */
  private async buildScopeWhere(
    viewer: Awaited<ReturnType<SolicitudesService['getViewer']>>,
    scope: 'activas' | 'historial',
  ): Promise<Record<string, unknown>> {
    if (viewer.isAdmin) return {};
    if (scope === 'historial') {
      const classified = await this.prisma.auditEvent.findMany({
        where: { actorId: viewer.userId, action: 'CLASSIFIED' },
        select: { requestId: true },
      });
      const classifiedIds = [...new Set(
        classified.map(c => c.requestId).filter((id): id is string => !!id),
      )];
      const or: Record<string, unknown>[] = [
        { requesterId: viewer.userId },
        { approvals: { some: { actorId: viewer.userId } } },
      ];
      if (classifiedIds.length > 0) or.push({ id: { in: classifiedIds } });
      return { OR: or };
    }
    const clauses: Record<string, unknown>[] = [
      // Propias activas (no terminales).
      {
        requesterId: viewer.userId,
        status: {
          notIn: [...SolicitudesService.COMPLETADA, ...SolicitudesService.RECHAZADA],
        },
      },
    ];
    for (const companyId of viewer.companies) {
      const steps = this.queueStepsFor(viewer, companyId);
      if (steps.length > 0) {
        clauses.push({ companyId, status: { in: steps } });
      }
      // Gerencia: PENDIENTE_GERENTE de departamentos que dirige en esa empresa.
      const managedHere = viewer.managedDepts.filter(d => d.companyId === companyId).map(d => d.id);
      if (managedHere.length > 0) {
        clauses.push({ companyId, departmentId: { in: managedHere }, status: 'PENDIENTE_GERENTE' });
      }
    }
    return { OR: clauses };
  }

  private filtersWhere(filters: {
    search?: string;
    status?: string;
    statuses?: string[];
    bucket?: string;
    requesterId?: string;
    departmentId?: string;
    companyId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (filters.companyId) where.companyId = filters.companyId;
    if (filters.departmentId) where.departmentId = filters.departmentId;
    if (filters.requesterId) where.requesterId = filters.requesterId;
    // 14G: filtro multi-estado para bandejas (whitelist; prevalece sobre status singular).
    const valid = (filters.statuses ?? []).filter((s): s is string =>
      (WORKFLOW_STATES as readonly string[]).includes(s),
    );
    if (valid.length > 0) where.status = { in: valid };
    else if (filters.status) where.status = filters.status;
    if (filters.bucket === 'completadas') {
      where.status = { in: SolicitudesService.COMPLETADA };
    } else if (filters.bucket === 'rechazadas') {
      where.status = { in: SolicitudesService.RECHAZADA };
    } else if (filters.bucket === 'proceso') {
      where.status = { notIn: [...SolicitudesService.COMPLETADA, ...SolicitudesService.RECHAZADA] };
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { requestNumber: { contains: q } },
        { requestedDescription: { contains: q } },
        { purpose: { contains: q } },
        // 14L: búsqueda también por códigos aprobados y part number.
        { requestData: { masterCode: { contains: q } } },
        { requestData: { partNumber: { contains: q } } },
        { requestData: { profitCode: { contains: q } } },
      ];
    }
    if (filters.dateFrom || filters.dateTo) {
      const createdAt: Record<string, unknown> = {};
      if (filters.dateFrom) createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) createdAt.lte = new Date(filters.dateTo);
      where.createdAt = createdAt;
    }
    return where;
  }

  private participationOf(row: {
    requesterId: string;
    approvals?: { action: string; createdAt: Date | string }[];
    classifiedAt?: (Date | string)[];
  }, userId: string): { accion: string; fecha: string } | null {
    const mine = (row.approvals ?? []).filter(a => (a as { actorId?: string }).actorId === userId);
    const events = [
      ...mine.map(a => ({ action: a.action, createdAt: a.createdAt })),
      ...(row.classifiedAt ?? []).map(createdAt => ({ action: 'CLASSIFIED', createdAt })),
    ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    if (row.requesterId === userId && events.length === 0) {
      return { accion: 'Creé', fecha: '' };
    }
    const last = events[0];
    if (!last) return null;
    const label: Record<string, string> = {
      APPROVE: 'Aprobé',
      RETURN: 'Devolví',
      REJECT: 'Rechacé',
      SUBMIT: 'Envié',
      CLASSIFIED: 'Clasifiqué',
    };
    return { accion: label[last.action] ?? last.action, fecha: new Date(last.createdAt).toISOString() };
  }

  /**
   * 13A — Lista paginada con visibilidad server-side. Devuelve envelope
   * {items, total, filteredTotal, page, limit} + participación propia.
   */
  async findScoped(
    userId: string,
    opts: {
      scope?: string;
      search?: string;
      status?: string;
      statuses?: string[];
      bucket?: string;
      requesterId?: string;
      mine?: boolean;
      sort?: string;
      departmentId?: string;
      companyId?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const viewer = await this.getViewer(userId);
    const scope = opts.scope === 'historial' ? 'historial' : 'activas';
    const base = await this.buildScopeWhere(viewer, scope);
    // 14L: mine=true fuerza requesterId al usuario de la sesión (ignora spoof).
    const extra = this.filtersWhere(opts.mine ? { ...opts, requesterId: userId } : opts);
    const hasExtra = Object.keys(extra).length > 0;
    // AND explícito: los filtros jamás amplían el alcance del scope.
    const filtered = hasExtra ? { AND: [base, extra] } : base;
    const limit = SolicitudesService.PAGE_SIZES.includes(opts.limit ?? 0) ? opts.limit! : 25;
    const rawPage = Number(opts.page);
    const page = Number.isFinite(rawPage) ? Math.max(Math.floor(rawPage), 1) : 1;
    // 14L: orden whitelist (default: más recientes).
    const orderBy = opts.sort === 'antiguas'
      ? { createdAt: 'asc' as const }
      : opts.sort === 'actualizadas'
        ? { updatedAt: 'desc' as const }
        : { createdAt: 'desc' as const };
    const include = {
      company: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true, managerId: true } },
      requester: { select: { id: true, username: true, displayName: true } },
      requestData: true,
      workflowInstance: { select: { id: true, currentStepCode: true } },
      approvals: {
        where: { actorId: userId },
        select: { action: true, actorId: true, createdAt: true },
      },
    };
    const [items, total, filteredTotal] = await Promise.all([
      this.prisma.request.findMany({
        where: filtered,
        include,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.request.count({ where: base }),
      this.prisma.request.count({ where: filtered }),
    ]);
    // Clasificaciones propias de la página (sin relación Prisma en Request).
    const classifiedRows = await this.prisma.auditEvent.findMany({
      where: { actorId: userId, action: 'CLASSIFIED', requestId: { in: items.map(r => r.id) } },
      select: { requestId: true, createdAt: true },
    });
    const classifiedByRequest = new Map<string, (Date | string)[]>();
    for (const c of classifiedRows) {
      if (!c.requestId) continue;
      if (!classifiedByRequest.has(c.requestId)) classifiedByRequest.set(c.requestId, []);
      classifiedByRequest.get(c.requestId)!.push(c.createdAt);
    }
    return {
      items: items.map(r => ({
        ...flattenRequestData(r),
        miParticipacion: this.participationOf(
          { ...(r as unknown as Record<string, unknown>), classifiedAt: classifiedByRequest.get(r.id) ?? [] } as never,
          userId,
        ),
      })),
      total,
      filteredTotal,
      page,
      limit,
    };
  }

  /** 13A — Contadores server-side sobre lo visible (nunca de la página). */
  async resumen(userId: string) {
    const viewer = await this.getViewer(userId);
    const activas = await this.buildScopeWhere(viewer, 'activas');
    const historial = await this.buildScopeWhere(viewer, 'historial');
    const [nActivas, nHistorial, nCompletadas, nRechazadas] = await Promise.all([
      this.prisma.request.count({ where: activas }),
      this.prisma.request.count({ where: historial }),
      this.prisma.request.count({
        where: { ...historial, status: { in: SolicitudesService.COMPLETADA } },
      }),
      this.prisma.request.count({
        where: { ...historial, status: { in: SolicitudesService.RECHAZADA } },
      }),
    ]);
    return {
      activas: nActivas,
      historial: nHistorial,
      completadas: nCompletadas,
      rechazadas: nRechazadas,
      enProceso: Math.max(nHistorial - nCompletadas - nRechazadas, 0),
    };
  }

  /**
   * 13A — Guarda de visibilidad para detalle e historial: admin, propio,
   * participante real, gerente del departamento o cola correspondiente.
   * 404 en ambos casos (no revela existencia).
   */
  async assertCanView(userId: string, requestId: string) {
    const viewer = await this.getViewer(userId);
    if (viewer.isAdmin) return;
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
      select: { id: true, requesterId: true, companyId: true, departmentId: true, status: true },
    });
    if (!request) throw new NotFoundException(`Request ${requestId} not found`);
    if (request.requesterId === userId) return;
    const [approval, classified] = await Promise.all([
      this.prisma.approval.findFirst({ where: { requestId, actorId: userId }, select: { id: true } }),
      this.prisma.auditEvent.findFirst({ where: { requestId, actorId: userId, action: 'CLASSIFIED' }, select: { id: true } }),
    ]);
    if (approval || classified) return;
    if (viewer.managedDepts.some(d => d.id === request.departmentId)) return;
    const steps = this.queueStepsFor(viewer, request.companyId);
    if (!viewer.companies.includes(request.companyId) || !steps.includes(request.status)) {
      throw new NotFoundException(`Request ${requestId} not found`);
    }
  }

  async findOne(id: string, userId?: string) {
    if (userId) await this.assertCanView(userId, id);
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true, managerId: true } },
        requester: { select: { id: true, username: true, displayName: true } },
        requestData: true,
        workflowInstance: {
          include: {
            tasks: {
              include: {
                assignedToUser: { select: { id: true, username: true, displayName: true } },
              },
            },
          },
        },
        approvals: {
          include: { actor: { select: { id: true, username: true, displayName: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    return flattenRequestData(request);
  }

  async submit(id: string, userId: string, companyId: string) {
    const request = await this.prisma.request.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    if (request.status !== 'BORRADOR') {
      throw new BadRequestException(`Request ${id} is not in BORRADOR status`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.request.update({
        where: { id },
        data: { status: 'PENDIENTE_GERENTE' },
      });

      const instance = await tx.workflowInstance.create({
        data: {
          requestId: id,
          currentStepCode: 'PENDIENTE_GERENTE',
          version: 1,
        },
      });

      await tx.workflowTask.create({
        data: {
          instanceId: instance.id,
          stepCode: 'PENDIENTE_GERENTE',
          status: 'PENDING',
        },
      });

      await tx.workflowHistory.create({
        data: {
          instanceId: instance.id,
          fromStep: 'BORRADOR',
          toStep: 'PENDIENTE_GERENTE',
          action: 'SUBMIT',
          actorId: userId,
        },
      });

      await tx.approval.create({
        data: {
          requestId: id,
          stepCode: 'PENDIENTE_GERENTE',
          actorId: userId,
          action: 'SUBMIT',
          fromStatus: 'BORRADOR',
          toStatus: 'PENDIENTE_GERENTE',
        },
      });

      await tx.auditEvent.create({
        data: {
          correlationId: instance.id,
          requestId: id,
          actorId: userId,
          actorCompanyId: companyId,
          entityType: 'Request',
          entityId: id,
          action: 'SUBMITTED',
          beforeData: JSON.stringify({ status: 'BORRADOR' }),
          afterData: JSON.stringify({ status: 'PENDIENTE_GERENTE' }),
        },
      });

      // 11G/12F — avisa al gerente (individual). Emisión SSE post-commit.
      const created = await this.notificaciones.notifyRequestStep(tx, {
        requestId: id,
        requestNumber: request.requestNumber,
        companyId,
        departmentId: request.departmentId,
        stepCode: 'PENDIENTE_GERENTE',
        actorId: userId,
        ...stepNotificationMessage('PENDIENTE_GERENTE', request.requestNumber, 'SUBMIT'),
      });

      return { updated, created };
    }).then(({ updated, created }) => {
      this.sse.emitMany(created);
      return updated;
    });
  }

  async approve(id: string, dto: ApprovalDto, userId: string, companyId: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: { workflowInstance: true },
    });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    if (isTerminalWorkflowState(request.status)) {
      throw new BadRequestException(`Request ${id} cannot be processed in ${request.status} status`);
    }

    if ((dto.action === 'REJECT' || dto.action === 'RETURN') && !dto.comment) {
      throw new BadRequestException('Comment is required for REJECT and RETURN actions');
    }

    const nextStatus = getNextWorkflowState(request.status, dto.action);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.request.update({
        where: { id },
        data: { status: nextStatus },
      });

      if (request.workflowInstance) {
        await tx.workflowHistory.create({
          data: {
            instanceId: request.workflowInstance.id,
            fromStep: request.status,
            toStep: nextStatus,
            action: dto.action,
            actorId: userId,
            comment: dto.comment,
          },
        });

        await tx.workflowTask.updateMany({
          where: {
            instanceId: request.workflowInstance.id,
            stepCode: request.status,
            status: 'PENDING',
          },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });

        if (dto.action === 'RETURN') {
          const existingTask = await tx.workflowTask.findUnique({
            where: {
              instanceId_stepCode: {
                instanceId: request.workflowInstance.id,
                stepCode: nextStatus,
              },
            },
          });

          if (existingTask) {
            await tx.workflowTask.update({
              where: { id: existingTask.id },
              data: { status: 'PENDING', completedAt: null },
            });
          } else {
            await tx.workflowTask.create({
              data: {
                instanceId: request.workflowInstance.id,
                stepCode: nextStatus,
                status: 'PENDING',
              },
            });
          }
        } else if (dto.action === 'APPROVE') {
          const existingTask = await tx.workflowTask.findUnique({
            where: {
              instanceId_stepCode: {
                instanceId: request.workflowInstance.id,
                stepCode: nextStatus,
              },
            },
          });

          if (existingTask) {
            await tx.workflowTask.update({
              where: { id: existingTask.id },
              data: { status: 'PENDING', completedAt: null },
            });
          } else {
            await tx.workflowTask.create({
              data: {
                instanceId: request.workflowInstance.id,
                stepCode: nextStatus,
                status: 'PENDING',
              },
            });
          }
        }

        await tx.workflowInstance.update({
          where: { id: request.workflowInstance.id },
          data: { currentStepCode: nextStatus },
        });
      }

      await tx.approval.create({
        data: {
          requestId: id,
          stepCode: request.status,
          actorId: userId,
          action: dto.action,
          fromStatus: request.status,
          toStatus: nextStatus,
          comment: dto.comment,
        },
      });

      await tx.auditEvent.create({
        data: {
          correlationId: request.id,
          requestId: id,
          actorId: userId,
          actorCompanyId: companyId,
          entityType: 'Request',
          entityId: id,
          action: dto.action,
          beforeData: JSON.stringify({ status: request.status }),
          afterData: JSON.stringify({ status: nextStatus }),
        },
      });

      // 11G/12F — cola del paso siguiente; en RETURN/REJECT/final también al solicitante.
      const msg = stepNotificationMessage(nextStatus, request.requestNumber, dto.action, dto.comment);
      const created = await this.notificaciones.notifyRequestStep(tx, {
        requestId: id,
        requestNumber: request.requestNumber,
        companyId: request.companyId,
        departmentId: request.departmentId,
        stepCode: nextStatus,
        actorId: userId,
        extraUserIds: msg.toRequester ? [request.requesterId] : [],
        title: msg.title,
        body: msg.body,
      });

      return { updated, created };
    }).then(({ updated, created }) => {
      // 12F — SSE post-commit: si falla, la DB ya es fuente de verdad.
      this.sse.emitMany(created);
      return updated;
    });
  }

  /**
   * Guardar Borrador de clasificación (fase borrador): persiste el progreso
   * parcial SIN cambiar el estado (PENDIENTE_ALMACEN → PENDIENTE_ALMACEN), SIN
   * notificar y SIN tocar workflow. Finalizar es `approve()` (Almacén verifica
   * completitud y avanza a ALMACEN_APROBADO). Los campos no aportados se
   * conservan (patch parcial); el masterCode solo se genera cuando hay grupo
   * y subgrupo efectivos.
   */
  async classify(id: string, dto: ClassifyRequestDto, userId: string, companyId: string) {
    const request = await this.prisma.request.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    if (request.status !== 'PENDIENTE_ALMACEN') {
      throw new BadRequestException(`Request ${id} solo admite borrador en PENDIENTE_ALMACEN (estado: ${request.status})`);
    }

    // FASE 14C-FORM §5/§13: dominio de tipo e impuesto (membership; la
    // coherencia tipo→tasa es advertencia, no bloqueo: Profit tiene excepciones).
    if (dto.articleType !== undefined && !isArticleTypeCode(dto.articleType)) {
      throw new BadRequestException(`articleType inválido: ${dto.articleType} (dominio CK_art_TIPO: V/F/C/S/M/N/E)`);
    }
    if (dto.taxType !== undefined && !isTaxTypeCode(dto.taxType)) {
      throw new BadRequestException(`taxType inválido: ${dto.taxType} (tabulado 1-9; no usar co_imp)`);
    }
    if (dto.unitCode !== undefined) {
      await this.assertProfitUnit(dto.unitCode, companyId);
    }

    return this.prisma.$transaction(async (tx) => {
      // FASE 8F: si vienen códigos Profit, se resuelven a IDs locales
      // (con provisión local de categoría/marca faltante). Si no, vía IDs legacy.
      let groupId = dto.groupId;
      let subgroupId = dto.subgroupId;
      let categoryId = dto.categoryId;
      let brandId = dto.brandId;
      let provisioned: string[] = [];
      if (dto.groupCode || dto.subgroupCode) {
        if (!dto.groupCode || !dto.subgroupCode) {
          throw new BadRequestException('groupCode y subgroupCode son requeridos juntos');
        }
        const resolved = await this.catalogosService.resolveClassification(tx, {
          groupCode: dto.groupCode,
          subgroupCode: dto.subgroupCode,
          categoryCode: dto.categoryCode,
          categoryName: dto.categoryName,
          brandCode: dto.brandCode,
          brandName: dto.brandName,
        }, { companyId });
        groupId = resolved.groupId;
        subgroupId = resolved.subgroupId;
        if (dto.categoryCode) categoryId = resolved.categoryId;
        if (dto.brandCode) brandId = resolved.brandId;
        provisioned = resolved.provisioned;
      }
      const existing = await tx.requestData.findUnique({ where: { requestId: id } });

      // Borrador parcial: grupo/subgrupo efectivos = lo aportado o lo ya
      // guardado. Sin ambos aún no hay masterCode (no se exige para progresar).
      const effGroupId = groupId ?? (existing as { groupId?: string | null } | null)?.groupId ?? null;
      const effSubgroupId = subgroupId ?? (existing as { subgroupId?: string | null } | null)?.subgroupId ?? null;
      let masterCode: string | null = (existing as { masterCode?: string | null } | null)?.masterCode ?? null;
      if (effGroupId && effSubgroupId) {
        masterCode = await this.generateMasterCode(effGroupId, effSubgroupId, tx);
      }

      // Patch parcial: solo campos aportados (undefined nunca pisa valores
      // guardados; Prisma los omite). masterCode solo si pudo generarse.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = {};
      if (groupId !== undefined) patch.groupId = groupId;
      if (subgroupId !== undefined) patch.subgroupId = subgroupId;
      if (categoryId !== undefined) patch.categoryId = categoryId;
      if (brandId !== undefined) patch.brandId = brandId;
      if (dto.unitId !== undefined) patch.unitId = dto.unitId;
      if (dto.partNumber !== undefined) patch.partNumber = dto.partNumber;
      if (dto.application !== undefined) patch.application = dto.application;
      if (dto.articleType !== undefined) patch.articleType = dto.articleType;
      if (dto.articleTypeManual !== undefined) patch.articleTypeManual = dto.articleTypeManual;
      if (dto.taxType !== undefined) patch.taxType = dto.taxType;
      if (dto.unitCode !== undefined) patch.unitCode = dto.unitCode.trim() || undefined;
      if (dto.brandCode !== undefined) patch.brandCode = dto.brandCode.trim() || undefined;
      if (masterCode) patch.masterCode = masterCode;

      const requestData = existing
        ? await tx.requestData.update({ where: { requestId: id }, data: patch })
        : await tx.requestData.create({ data: { requestId: id, ...patch } });

      // Borrador: sin cambio de estado, sin workflow, sin notificaciones.
      // Finalizar es approve() (verifica completitud y avanza a ALMACEN_APROBADO).

      await tx.auditEvent.create({
        data: {
          correlationId: request.id,
          requestId: id,
          actorId: userId,
          actorCompanyId: companyId,
          entityType: 'RequestData',
          entityId: requestData.id,
          action: 'CLASSIFIED',
          afterData: JSON.stringify({
            groupId: effGroupId,
            subgroupId: effSubgroupId,
            categoryId,
            brandId,
            groupCode: dto.groupCode,
            subgroupCode: dto.subgroupCode,
            categoryCode: dto.categoryCode,
            brandCode: dto.brandCode,
            articleType: dto.articleType,
            articleTypeManual: dto.articleTypeManual ?? false,
            taxType: dto.taxType,
            unitCode: dto.unitCode?.trim() || undefined,
            provisioned,
            masterCode,
            draft: true,
          }),
        },
      });

      return { requestData, masterCode };
    });
  }

  /**
   * Valida que un código de unidad exista en Profit y esté visible en
   * Data-Maestra (fail-closed: el trigger TrigI_art rechazaría una unidad
   * inexistente; DM debe validar ANTES con la misma fuente del selector).
   */
  private async assertProfitUnit(unitCode: string, companyId?: string): Promise<void> {
    const code = (unitCode ?? '').trim();
    if (!code) throw new BadRequestException('unitCode (unidad Profit) es requerido');
    await this.catalogosService.checkUnit(code, companyId);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private normalizeDescription(v: any): string {
    return String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  }

  /**
   * Dry-run "Validar artículo" (FASE 14C-FORM §24). Ejecuta todas las
   * validaciones SIN escribir: ni RequestData, ni provisión de catálogos,
   * ni Profit. states: COMPLETO | FALTA | ERROR | NO_APLICA.
   */
  async validateClassification(id: string, dto: ClassifyRequestDto) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) throw new NotFoundException(`Request ${id} not found`);

    type CheckStatus = 'COMPLETO' | 'FALTA' | 'ERROR' | 'NO_APLICA';
    const checks: { key: string; label: string; status: CheckStatus; detail?: string }[] = [];
    const warnings: string[] = [];
    let wouldProvision: string[] = [];
    const push = (key: string, label: string, status: CheckStatus, detail?: string) =>
      checks.push({ key, label, status, detail });

    // 1. Validación local: estado + descripción.
    if (request.status !== 'PENDIENTE_ALMACEN' && request.status !== 'ALMACEN_APROBADO') {
      push('estado', 'Estado clasificable', 'ERROR', `Estado actual: ${request.status}`);
    } else {
      push('estado', 'Estado clasificable', 'COMPLETO', request.status);
    }
    const desc = this.normalizeDescription((request as { requestedDescription?: string }).requestedDescription);
    if (desc.length >= 3) push('descripcion', 'Descripción', 'COMPLETO', `${desc.length} caracteres normalizados`);
    else push('descripcion', 'Descripción', 'ERROR', 'Vacía o menor a 3 caracteres');

    // 2-3. Catálogos + combinación grupo/subgrupo (espejo local, sin provisión).
    if (dto.groupCode || dto.subgroupCode) {
      if (!dto.groupCode || !dto.subgroupCode) {
        push('grupo', 'Grupo Profit', 'ERROR', 'groupCode y subgroupCode son requeridos juntos');
        push('subgrupo', 'Subgrupo del grupo', 'FALTA');
      } else {
        try {
          const checked = await this.catalogosService.checkClassification(this.prisma, {
            groupCode: dto.groupCode,
            subgroupCode: dto.subgroupCode,
            categoryCode: dto.categoryCode,
            categoryName: dto.categoryName,
            brandCode: dto.brandCode,
            brandName: dto.brandName,
          }, { companyId: (request as { companyId?: string }).companyId });
          wouldProvision = checked.wouldProvision;
          push('grupo', 'Grupo Profit', 'COMPLETO', dto.groupCode.trim());
          push('subgrupo', 'Subgrupo del grupo', 'COMPLETO', `${dto.groupCode.trim()}/${dto.subgroupCode.trim()}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          push('grupo', 'Grupo Profit', 'ERROR', msg);
          push('subgrupo', 'Subgrupo del grupo', 'ERROR', msg);
        }
      }
    } else if (dto.groupId && dto.subgroupId) {
      push('grupo', 'Grupo (legacy)', 'COMPLETO', 'Por ID local');
      push('subgrupo', 'Subgrupo (legacy)', 'COMPLETO', 'Por ID local');
    } else {
      push('grupo', 'Grupo Profit', 'FALTA', 'Sin seleccionar');
      push('subgrupo', 'Subgrupo del grupo', 'FALTA', 'Sin seleccionar');
    }

    // 4. Tipo + visibilidad (misma fuente del selector).
    if (dto.articleType === undefined) {
      push('tipo', 'Tipo de artículo', 'FALTA', 'Requerido para futura creación Profit');
    } else if (!isArticleTypeCode(dto.articleType)) {
      push('tipo', 'Tipo de artículo', 'ERROR', `Fuera del dominio CK_art_TIPO: ${dto.articleType}`);
    } else {
      try {
        await this.catalogosService.checkArticleType(dto.articleType, (request as { companyId?: string }).companyId);
        push('tipo', 'Tipo de artículo', 'COMPLETO', dto.articleType);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/No fue posible consultar/.test(msg)) {
          warnings.push(`Visibilidad de tipo no verificable: ${msg}`);
          push('tipo', 'Tipo de artículo', 'COMPLETO', dto.articleType);
        } else {
          push('tipo', 'Tipo de artículo', 'ERROR', msg);
        }
      }
    }
    if (dto.taxType === undefined) {
      push('impuesto', 'Impuesto (tipo_imp)', 'COMPLETO', 'Se derivará por regla tipo→tasa');
    } else if (!isTaxTypeCode(dto.taxType)) {
      push('impuesto', 'Impuesto (tipo_imp)', 'ERROR', `Fuera de tabulado 1-9: ${dto.taxType}`);
    } else {
      try {
        await this.catalogosService.checkTaxType(dto.taxType, (request as { companyId?: string }).companyId);
        push('impuesto', 'Impuesto (tipo_imp)', 'COMPLETO', `Tasa ${dto.taxType}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/No fue posible consultar/.test(msg)) {
          warnings.push(`Visibilidad de impuesto no verificable: ${msg}`);
          push('impuesto', 'Impuesto (tipo_imp)', 'COMPLETO', `Tasa ${dto.taxType}`);
        } else {
          push('impuesto', 'Impuesto (tipo_imp)', 'ERROR', msg);
        }
      }
      if (dto.articleType !== undefined && isArticleTypeCode(dto.articleType)) {
        const coh = checkTaxCoherence(dto.articleType, dto.taxType);
        if (coh.warning) warnings.push(coh.warning);
      }
    }

    // 5. Unidad Profit (misma fuente del selector: existencia + visibilidad).
    if (!dto.unitCode?.trim()) {
      push('unidad', 'Unidad Profit', 'FALTA', 'Requerida: el trigger TrigI_art exige suni_venta en dbo.unidades');
    } else {
      try {
        await this.catalogosService.checkUnit(dto.unitCode.trim(), (request as { companyId?: string }).companyId);
        push('unidad', 'Unidad Profit', 'COMPLETO', dto.unitCode.trim());
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/No fue posible consultar/.test(msg)) {
          warnings.push(`Visibilidad de unidad no verificable: ${msg}`);
          push('unidad', 'Unidad Profit', 'COMPLETO', dto.unitCode.trim());
        } else {
          push('unidad', 'Unidad Profit', 'ERROR', msg);
        }
      }
    }

    // 7. Duplicidad: mismo normalizado ya homologado (advertencia, no bloquea).
    if (desc.length >= 3) {
      try {
        const dup = await this.prisma.masterItem.findFirst({ where: { normalizedDescription: desc } });
        if (dup) warnings.push(`Posible duplicado: ya existe el master ${(dup as { masterCode?: string }).masterCode ?? dup.id}`);
        push('duplicidad', 'Duplicidad', 'COMPLETO', dup ? 'Posible coincidencia (ver advertencia)' : 'Sin coincidencias');
      } catch {
        push('duplicidad', 'Duplicidad', 'NO_APLICA', 'No verificable en este momento');
      }
    } else {
      push('duplicidad', 'Duplicidad', 'NO_APLICA', 'Requiere descripción válida');
    }

    const required = ['estado', 'descripcion', 'grupo', 'subgrupo', 'tipo', 'unidad'];
    const ready = required.every((k) => checks.find((c) => c.key === k)?.status === 'COMPLETO');
    return { ready, checks, warnings, wouldProvision };
  }

  /**
   * Construye el input Profit desde la clasificación guardada (14E §24: usa
   * los datos del formulario 14C-FORM, sin duplicarlos ni reinventarlos).
   */
  private async buildProfitInput(id: string): Promise<{ request: any; input: ProfitArticleInput; warnings: string[] }> {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: { requestData: true, accountingCodes: true },
    });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    const rd = (request as any).requestData;
    if (!rd?.groupId || !rd?.subgroupId) {
      throw new BadRequestException(`Request ${id} sin clasificación de grupo/subgrupo`);
    }
    const [group, subgroup, category] = await Promise.all([
      this.prisma.catalogGroup.findUnique({ where: { id: rd.groupId } }),
      this.prisma.catalogSubgroup.findUnique({ where: { id: rd.subgroupId } }),
      rd.categoryId ? this.prisma.catalogCategory.findUnique({ where: { id: rd.categoryId } }) : null,
    ]);
    if (!group || !subgroup) throw new BadRequestException(`Clasificación huérfana en request ${id}`);
    const warnings: string[] = [];
    if (!rd.articleType || !rd.unitCode || !rd.taxType) {
      throw new BadRequestException(`Request ${id} sin tipo/unidad/impuesto (clasificación incompleta para Profit)`);
    }
    if (!rd.brandCode) warnings.push('Sin código de marca guardado: se usará 01 (NO APLICA)');
    // dis_cen: MISMA fuente (códigos validados en Contabilidad) y MISMA
    // construcción (serializarDis) que la interfaz contable. Sin códigos
    // validados se envía vacío, como antes.
    let disCen = '';
    try {
      const rec: Record<string, string> = {};
      for (const a of (request as any).accountingCodes ?? []) {
        if (a?.position && a?.code) rec[String(a.position).trim()] = String(a.code).trim();
      }
      if (Object.values(rec).some((c) => !!c)) disCen = serializarDis(rec);
    } catch {
      disCen = '';
    }
    const input: ProfitArticleInput = {
      description: (request as any).requestedDescription ?? '',
      articleType: rd.articleType,
      groupCode: (group as any).code,
      subgroupCode: (subgroup as any).code,
      unitCode: rd.unitCode,
      taxType: rd.taxType,
      categoryCode: (category as any)?.code,
      colorCode: rd.brandCode ?? undefined,
      disCen: disCen || undefined,
    };
    return { request, input, warnings };
  }

  private profitEngine(): ProfitArticleCreationService {
    if (!this.profitCreation) throw new ServiceUnavailableException('Motor de creación Profit no disponible');
    return this.profitCreation;
  }

  /** Código de integración para auditoría (nunca falla: '' si no resolvible). */
  private safeIntegrationUser(): string {
    try {
      const fn = (this.profitEngine() as any)?.integrationUserCode;
      return typeof fn === 'function' ? fn.call(this.profitEngine()) : '';
    } catch {
      return '';
    }
  }

  /** Plan sin escritura: payload + candidato + disponibilidad (§22). */
  async planProfitCreation(id: string, userId: string, companyId: string): Promise<CreationPlan & { requestId: string }> {
    const { request, input, warnings } = await this.buildProfitInput(id);
    const plan = await this.profitEngine().plan(input);
    await this.prisma.auditEvent.create({
      data: {
        correlationId: request.id,
        requestId: id,
        actorId: userId,
        actorCompanyId: companyId,
        entityType: 'Request',
        entityId: id,
        action: 'PROFIT_PLAN',
        afterData: JSON.stringify({ coArt: plan.candidate, available: plan.available, warnings }),
      },
    });
    return { requestId: id, ...plan, warnings: [...warnings, ...plan.warnings] };
  }

  /**
   * correlationId de integración (14F §20): DM-PROFIT-AAAAMMDD-NNNNNN.
   * Sufijo = dígitos finales del requestNumber (único por solicitud).
   * 14K.3: Number('REQ-0055') es NaN → se extraen los dígitos finales.
   */
  private profitCorrelationId(requestNumber: unknown): string {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const m = String(requestNumber ?? '').match(/(\d+)\s*$/);
    const n = (m?.[1] ?? '0').padStart(6, '0').slice(-6);
    return `DM-PROFIT-${ymd}-${n}`;
  }

  private async profitAudit(
    requestId: string,
    correlationId: string,
    userId: string,
    companyId: string,
    action: string,
    after: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        correlationId,
        requestId,
        actorId: userId,
        actorCompanyId: companyId,
        entityType: 'Request',
        entityId: requestId,
        action,
        afterData: JSON.stringify(after),
      },
    });
  }

  /**
   * Bloqueo en memoria contra doble ejecución del mismo request (14K.5).
   * Segunda barrera tras la transición atómica; el backend es la autoridad
   * (nunca solo el disabled del botón). Por instancia; la transición
   * condicional cubre el caso multi-instancia.
   */
  private readonly profitLocks = new Map<string, number>();

  /**
   * Creación controlada en Profit (14E/14F, 16A). Gates: CONTABILIDAD_APROBADA
   * + PROFIT.WRITE (controller) + flag (adapter) + payload válido.
   * Transiciones directas CONTABILIDAD_APROBADA → PROCESANDO_PROFIT →
   * INSERTADO_PROFIT | ERROR_PROFIT (técnicas, sin APPROVE posterior).
   * Idempotencia (§25): INSERTADO_PROFIT no es CONTABILIDAD_APROBADA → 400, sin INSERT.
   */
  async createInProfit(id: string, userId: string, companyId: string): Promise<CreationResult & { requestId: string; correlationId: string }> {
    const { request, input } = await this.buildProfitInput(id);
    if ((request as any).status !== 'CONTABILIDAD_APROBADA') {
      throw new BadRequestException(`Request ${id} no está en CONTABILIDAD_APROBADA (estado: ${(request as any).status})`);
    }
    // Fail-fast ANTES de cambiar estado: flag + destino explícito.
    this.profitEngine().assertAvailable();
    if (this.profitLocks.has(id)) {
      throw new ConflictException(`Request ${id} ya tiene una operación Profit en curso (PROFIT_WRITE_IN_PROGRESS)`);
    }
    this.profitLocks.set(id, Date.now());
    try {
      return await this.runProfitCreation(id, userId, companyId, request, input);
    } finally {
      this.profitLocks.delete(id);
    }
  }

  private async runProfitCreation(
    id: string,
    userId: string,
    companyId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request: any,
    input: ProfitArticleInput,
  ): Promise<CreationResult & { requestId: string; correlationId: string }> {
    const correlationId = this.profitCorrelationId(request.requestNumber);
    const base = {
      requestId: id,
      masterCode: request.requestData?.masterCode ?? null,
      actor: userId,
      correlationId,
    };
    // Transición ATÓMICA: solo un ganador entre llamadas concurrentes.
    const claimed = await this.prisma.request.updateMany({
      where: { id, status: 'CONTABILIDAD_APROBADA' },
      data: { status: 'PROCESANDO_PROFIT' },
    });
    if (claimed.count === 0) {
      throw new ConflictException(`Request ${id} ya no está disponible para registro (PROFIT_WRITE_IN_PROGRESS)`);
    }
    await this.profitAudit(id, correlationId, userId, companyId, 'PROFIT_WRITE_STARTED', { ...base });

    const t0 = Date.now();
    let result: CreationResult;
    try {
      result = await this.profitEngine().allocateAndInsert(input);
    } catch (err: any) {
      result = {
        ok: false,
        coArt: '',
        attempts: [],
        reconcile: 'RECONCILIATION_ERROR',
        differences: [],
        errorCode: 'ERROR_PROFIT_ENGINE',
        errorDetail: String(err?.message ?? err).slice(0, 500),
      };
    }
    const durationMs = Date.now() - t0;

    await this.prisma.request.update({
      where: { id },
      data: { status: result.ok ? 'INSERTADO_PROFIT' : 'ERROR_PROFIT' },
    });
    // 14L: el código Profit queda en la solicitud (visible en bandejas).
    if (result.ok && result.coArt) {
      await this.prisma.requestData.update({
        where: { requestId: id },
        data: { profitCode: result.coArt },
      });
    }
    // Auditoría §24: STARTED ya emitido; resultado + colisiones por separado.
    const outcome = result.ok
      ? 'PROFIT_WRITE_SUCCEEDED'
      : result.errorCode === 'ERROR_PROFIT_AMBIGUOUS'
        ? 'PROFIT_WRITE_RESULT_UNKNOWN'
        : 'PROFIT_WRITE_FAILED';
    await this.profitAudit(id, correlationId, userId, companyId, outcome, {
      ...base,
      co_art: result.coArt || null,
      integrationUser: this.safeIntegrationUser() || null,
      alreadyRegistered: result.alreadyRegistered ?? false,
      reconcile: result.reconcile,
      differences: result.differences,
      attempts: result.attempts.map((a) => ({ attempt: a.attempt, candidate: a.candidate, outcome: a.outcome })),
      errorCode: result.errorCode ?? null,
      durationMs,
    });
    const collisions = result.attempts.filter((a) => a.outcome === 'COLLISION').map((a) => a.candidate);
    if (collisions.length > 0) {
      await this.profitAudit(id, correlationId, userId, companyId, 'CODE_COLLISION_RESOLVED', {
        ...base,
        chain: collisions,
        final: result.coArt || null,
      });
    }
    return { requestId: id, correlationId, ...result };
  }

  /**
   * Verificación posterior (14F.2): relectura + reconciliación de un co_art
   * contra lo esperado. Solo lectura: NO cambia estados, NO reintenta.
   * La recuperación de ERROR_PROFIT es una nueva creación (nuevo código).
   */
  async verifyProfitCreation(id: string, coArt: string, userId: string, companyId: string) {
    const { request, input } = await this.buildProfitInput(id);
    const code = (coArt ?? '').trim();
    if (!code) throw new BadRequestException('coArt es requerido para verificar');
    const payload = buildProfitArticlePayload(code, input);
    const v = await this.profitEngine().verifyAndReconcile(code, payload);
    await this.prisma.auditEvent.create({
      data: {
        correlationId: request.id,
        requestId: id,
        actorId: userId,
        actorCompanyId: companyId,
        entityType: 'Request',
        entityId: id,
        action: 'PROFIT_VERIFY',
        afterData: JSON.stringify({ requestId: id, co_art: code, reconcile: v.status, differences: v.differences }),
      },
    });
    return { requestId: id, coArt: code, reconcile: v.status, differences: v.differences };
  }

  /**
   * Recuperación segura de ERROR_PROFIT (14K.5, 16A). NO escribe: registra la
   * intención, re-ejecuta el dry-run completo y, solo si READY, re-encola a
   * CONTABILIDAD_APROBADA con NUEVO correlationId (el historial por intento queda
   * separado). La escritura posterior exige nueva confirmación humana.
   */
  async requestProfitRetry(id: string, userId: string, companyId: string) {
    const { request, input, warnings } = await this.buildProfitInput(id);
    if (request.status !== 'ERROR_PROFIT') {
      throw new BadRequestException(`Request ${id} no está en ERROR_PROFIT (estado: ${request.status})`);
    }
    const correlationId = this.profitCorrelationId(request.requestNumber);
    const base = {
      requestId: id,
      masterCode: request.requestData?.masterCode ?? null,
      actor: userId,
      correlationId,
    };
    let plan: CreationPlan;
    try {
      plan = await this.profitEngine().plan(input);
    } catch (err: any) {
      await this.profitAudit(id, correlationId, userId, companyId, 'PROFIT_RETRY_BLOCKED', {
        ...base, reason: String(err?.message ?? err).slice(0, 300),
      });
      throw new BadRequestException(`Reintento bloqueado: ${err?.message ?? err}`);
    }
    await this.prisma.request.update({ where: { id }, data: { status: 'CONTABILIDAD_APROBADA' } });
    await this.profitAudit(id, correlationId, userId, companyId, 'PROFIT_RETRY_REQUESTED', {
      ...base,
      candidate: plan.candidate,
      available: plan.available,
      warnings: [...warnings, ...plan.warnings],
    });
    return {
      requestId: id,
      correlationId,
      ready: true,
      candidate: plan.candidate,
      available: plan.available,
      payload: plan.payload,
      warnings: [...warnings, ...plan.warnings],
    };
  }

  /**
   * Historial inmutable de intentos (14K.5): agrupa eventos PROFIT_* por
   * correlationId (uno por invocación de createInProfit). Solo lectura.
   */
  async profitAttempts(id: string, userId?: string) {
    if (userId) await this.assertCanView(userId, id);
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    const events = await this.prisma.auditEvent.findMany({
      where: { requestId: id, action: { startsWith: 'PROFIT_' } },
      orderBy: { createdAt: 'asc' },
    });
    const byCorr = new Map<string, any[]>();
    for (const e of events) {
      const list = byCorr.get(e.correlationId) ?? [];
      list.push(e);
      byCorr.set(e.correlationId, list);
    }
    const parse = (e: any) => {
      try { return JSON.parse(e.afterData ?? '{}'); } catch { return {}; }
    };
    let n = 0;
    const attempts = [...byCorr.entries()]
      .filter(([, evs]) => evs.some((e) => e.action === 'PROFIT_WRITE_STARTED'))
      .map(([correlationId, evs]) => {
        n++;
        const get = (a: string) => evs.find((e) => e.action === a);
        const started = get('PROFIT_WRITE_STARTED');
        const outcomeEv = evs.find((e) => ['PROFIT_WRITE_SUCCEEDED', 'PROFIT_WRITE_FAILED', 'PROFIT_WRITE_RESULT_UNKNOWN'].includes(e.action));
        const collision = get('CODE_COLLISION_RESOLVED');
        const sAfter = started ? parse(started) : {};
        const oAfter = outcomeEv ? parse(outcomeEv) : {};
        return {
          attempt: n,
          correlationId,
          createdAt: started?.createdAt ?? evs[0]?.createdAt,
          actorId: started?.actorId ?? null,
          masterCode: sAfter.masterCode ?? null,
          coArt: oAfter.co_art ?? sAfter.co_art ?? null,
          result: !outcomeEv ? 'UNKNOWN'
            : outcomeEv.action === 'PROFIT_WRITE_SUCCEEDED' ? 'SUCCESS'
            : outcomeEv.action === 'PROFIT_WRITE_RESULT_UNKNOWN' ? 'UNKNOWN' : 'FAILED',
          reconcile: oAfter.reconcile ?? null,
          errorCode: oAfter.errorCode ?? null,
          durationMs: oAfter.durationMs ?? null,
          collisions: collision ? parse(collision).chain ?? [] : [],
        };
      });
    const verifications = events
      .filter((e) => e.action === 'PROFIT_VERIFY')
      .map((e) => ({ createdAt: e.createdAt, actorId: e.actorId, ...(parse(e) as object) }));
    return { requestId: id, attempts, verifications };
  }

  async getHistory(id: string, userId?: string) {
    if (userId) await this.assertCanView(userId, id);
    const request = await this.prisma.request.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    return this.prisma.workflowHistory.findMany({
      where: {
        instance: { requestId: id },
      },
      include: {
        actor: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async savePhoto(id: string, file: { filename: string; mimetype: string; size: number }) {
    const request = await this.prisma.request.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    const photoUri = `requests/${file.filename}`;

    await this.prisma.request.update({
      where: { id },
      data: { referencePhotoUri: photoUri },
    });

    return { referencePhotoUri: photoUri };
  }

  private async generateRequestNumber(): Promise<string> {
    const last = await this.prisma.request.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { requestNumber: true },
    });

    let nextNumber = 1;
    if (last?.requestNumber) {
      const match = last.requestNumber.match(/REQ-(\d+)/);
      if (match?.[1]) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    return `REQ-${String(nextNumber).padStart(4, '0')}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async generateMasterCode(groupId: string, subgroupId: string, tx: any): Promise<string> {
    const group = await tx.catalogGroup.findUnique({ where: { id: groupId } });
    const subgroup = await tx.catalogSubgroup.findUnique({ where: { id: subgroupId } });

    const groupCode = group?.code ?? 'XX';
    const subgroupCode = subgroup?.code ?? 'XX';

    const lastItem = await tx.masterItem.findFirst({
      where: { groupId, subgroupId },
      orderBy: { masterCode: 'desc' },
      select: { masterCode: true },
    });

    let seq = 1;
    if (lastItem?.masterCode) {
      const match = lastItem.masterCode.match(/-(\d+)$/);
      if (match?.[1]) {
        seq = parseInt(match[1], 10) + 1;
      }
    }

    return `${groupCode}${subgroupCode}-${String(seq).padStart(5, '0')}`;
  }
}
