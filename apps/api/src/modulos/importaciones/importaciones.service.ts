import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../comun/prisma/prisma.service';

@Injectable()
export class ImportacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async findImportRuns(companyId?: string) {
    return this.prisma.importRun.findMany({
      where: companyId ? { companyId } : undefined,
      orderBy: { startedAt: 'desc' },
      include: {
        _count: { select: { sourceItems: true } },
      },
    });
  }

  async findImportRunById(id: string) {
    return this.prisma.importRun.findUnique({
      where: { id },
      include: {
        sourceItems: { orderBy: { createdAt: 'desc' } },
        _count: { select: { sourceItems: true } },
      },
    });
  }

  async createImportRun(data: {
    sourceName: string;
    companyId?: string;
    rowsRead?: number;
    rowsImported?: number;
    rowsUnchanged?: number;
    rowsFailed?: number;
    rowsSkipped?: number;
    errorSummary?: string;
  }) {
    return this.prisma.importRun.create({
      data: {
        sourceName: data.sourceName,
        companyId: data.companyId,
        status: 'COMPLETED',
        rowsRead: data.rowsRead ?? 0,
        rowsImported: data.rowsImported ?? 0,
        rowsUnchanged: data.rowsUnchanged ?? 0,
        rowsFailed: data.rowsFailed ?? 0,
        rowsSkipped: data.rowsSkipped ?? 0,
        errorSummary: data.errorSummary,
        finishedAt: new Date(),
      },
    });
  }

  async findSourceItems(importRunId?: string, companyId?: string) {
    return this.prisma.sourceItem.findMany({
      where: {
        ...(importRunId ? { importRunId } : {}),
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSourceItem(data: {
    importRunId?: string;
    companyId?: string;
    sourceRecordId: string;
    sourceCode?: string;
    originalDescription: string;
    normalizedDescription?: string;
    brand?: string;
    manufacturer?: string;
    model?: string;
    partNumber?: string;
    status?: string;
  }) {
    return this.prisma.sourceItem.create({
      data: {
        importRunId: data.importRunId,
        companyId: data.companyId,
        sourceRecordId: data.sourceRecordId,
        sourceCode: data.sourceCode,
        originalDescription: data.originalDescription,
        normalizedDescription: data.normalizedDescription,
        brand: data.brand,
        manufacturer: data.manufacturer,
        model: data.model,
        partNumber: data.partNumber,
        status: data.status ?? 'IMPORTED',
      },
    });
  }
}
