import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { SolicitudesService } from './solicitud.service';

/**
 * FASE — Contadores contextuales del usuario autenticado.
 *
 * Fuente ÚNICA para Dashboard, menú lateral y sección "Trabajo pendiente".
 * El alcance se deriva de permisos efectivos + membresías + departamentos
 * dirigidos (mismas reglas que findScoped/resumen). Nunca consulta Profit
 * ni TEmpresas: solo SQLite/Prisma local del workflow de Data-Maestra.
 *
 * Colas de trabajo mutuamente excluyentes (un estado por solicitud):
 *   PENDIENTE_GERENTE | PENDIENTE_ALMACEN | ALMACEN_APROBADO |
 *   PENDIENTE_CONTABILIDAD | CONTABILIDAD_APROBADA/PROCESANDO/ERROR
 * → work.total = suma simple sin doble conteo.
 */
export interface RequestContextSummaryWork {
  /** Solicitudes únicas que requieren acción del usuario (suma de colas). */
  total: number;
  /** Cola /approvals (PENDIENTE_GERENTE en alcance gerencial del usuario). */
  approvals: number;
  /** Cola /warehouse (PENDIENTE_ALMACEN en empresas con permiso de almacén). */
  warehouse: number;
  /** Cola /aprobacion-almacen (ALMACEN_APROBADO). */
  warehouseApproval: number;
  /** Total accionable de Contabilidad (aprobación + registro Profit). */
  accounting: number;
  /** Pendientes de aprobación contable (PENDIENTE_CONTABILIDAD). */
  accountingApproval: number;
  /** Pendientes de Registro Profit (aprobadas aún sin INSERT exitoso). */
  accountingProfitRegistration: number;
  /** Alias de approvals (cola de gerencia; mismo universo en el sistema actual). */
  managementApproval: number;
}

export interface RequestContextSummaryDashboard {
  /** Trabajo pendiente: colas accionables únicas del usuario. */
  pending: number;
  /** Solicitudes en etapas humanas de aprobación dentro del alcance. */
  inApproval: number;
  /** Finalización exitosa (INSERTADO_PROFIT) en el historial del usuario. */
  completed: number;
  /** DEVUELTO + RECHAZADO en el historial del usuario. */
  returned: number;
}

export interface RequestContextSummary {
  work: RequestContextSummaryWork;
  dashboard: RequestContextSummaryDashboard;
}

/** Estados de la cola "Pendientes de Registro Profit" (26R). */
const PROFIT_REGISTRATION_STATUSES = ['CONTABILIDAD_APROBADA', 'PROCESANDO_PROFIT', 'ERROR_PROFIT'];

@Injectable()
export class RequestCountersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requests: SolicitudesService,
  ) {}

  async getContextSummary(userId: string): Promise<RequestContextSummary> {
    const viewer = await this.requests.getViewer(userId);
    const activas = await this.requests.buildScopeWhere(viewer, 'activas');
    const historial = await this.requests.buildScopeWhere(viewer, 'historial');

    const warehouseCompanies = this.requests.companiesWithAnyPermission(viewer, [
      'WAREHOUSE.VIEW',
      'WAREHOUSE.CLASSIFY',
    ]);
    const warehouseApprovalCompanies = this.requests.companiesWithAnyPermission(viewer, [
      'WAREHOUSE_MANAGER.VIEW',
      'WAREHOUSE_MANAGER.APPROVE',
    ]);
    const accountingCompanies = this.requests.companiesWithAnyPermission(viewer, [
      'ACCOUNTING.VIEW',
      'ACCOUNTING.APPROVE',
    ]);
    // Gerencia: solo departamentos dirigidos (o global si admin con MANAGER.APPROVE
    // o ADMIN.MANAGE — el scope de listados ya trata admin como global).
    const hasManagerApproval = viewer.isAdmin
      || viewer.managedDepts.length > 0
      || [...viewer.permsByCompany.values()].some(p => p.includes('MANAGER.APPROVE'));

    const [
      warehouse,
      warehouseApproval,
      accountingApproval,
      accountingProfitRegistration,
      approvals,
      enAprobacion,
      histGroups,
    ] = await Promise.all([
      this.countQueue(viewer, warehouseCompanies, { status: 'PENDIENTE_ALMACEN' }),
      this.countQueue(viewer, warehouseApprovalCompanies, { status: 'ALMACEN_APROBADO' }),
      this.countQueue(viewer, accountingCompanies, { status: 'PENDIENTE_CONTABILIDAD' }),
      this.countQueue(viewer, accountingCompanies, { status: { in: PROFIT_REGISTRATION_STATUSES } }),
      hasManagerApproval
        ? this.countApprovals(activas)
        : Promise.resolve(0),
      this.prisma.request.count({
        where: { AND: [activas, { status: { in: SolicitudesService.EN_APROBACION } }] },
      }),
      this.prisma.request.groupBy({
        by: ['status'],
        where: historial,
        _count: { _all: true },
      }),
    ]);

    const accounting = accountingApproval + accountingProfitRegistration;
    const workTotal = approvals + warehouse + warehouseApproval + accounting;

    const byStatus = new Map<string, number>();
    for (const row of histGroups) {
      byStatus.set(row.status, row._count._all);
    }
    const completed = SolicitudesService.COMPLETADA_EXITOSA.reduce(
      (sum, s) => sum + (byStatus.get(s) ?? 0),
      0,
    );
    const returned = SolicitudesService.NO_EXITOSA.reduce(
      (sum, s) => sum + (byStatus.get(s) ?? 0),
      0,
    );

    return {
      work: {
        total: workTotal,
        approvals,
        warehouse,
        warehouseApproval,
        accounting,
        accountingApproval,
        accountingProfitRegistration,
        managementApproval: approvals,
      },
      dashboard: {
        pending: workTotal,
        inApproval: enAprobacion,
        completed,
        returned,
      },
    };
  }

  /**
   * Conteo de cola por empresa con permiso. Admin con el permiso: universo
   * global (mismo alcance que findScoped admin). Sin permiso en ninguna
   * empresa: 0 (no se muestran módulos ajenos aunque se sea admin).
   */
  private async countQueue(
    viewer: Awaited<ReturnType<SolicitudesService['getViewer']>>,
    companiesWithPermission: string[],
    statusFilter: Record<string, unknown>,
  ): Promise<number> {
    if (companiesWithPermission.length === 0) return 0;
    if (viewer.isAdmin) {
      return this.prisma.request.count({ where: statusFilter });
    }
    return this.prisma.request.count({
      where: {
        AND: [statusFilter, { companyId: { in: companiesWithPermission } }],
      },
    });
  }

  /**
   * Cola de aprobaciones: exactamente el mismo universo que la pestaña
   * /approvals (findScoped + status=PENDIENTE_GERENTE).
   */
  private async countApprovals(
    activas: Record<string, unknown>,
  ): Promise<number> {
    return this.prisma.request.count({
      where: { AND: [activas, { status: 'PENDIENTE_GERENTE' }] },
    });
  }
}
