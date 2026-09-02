import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../comun/prisma/prisma.service';

export interface CatalogImportRow {
  groupCode: string;
  groupName: string;
  subgroupCode: string;
  subgroupName: string;
}

export interface CatalogImportResult {
  groups: { found: number; created: number; updated: number; unchanged: number; errors: string[] };
  subgroups: { found: number; created: number; updated: number; unchanged: number; errors: string[] };
  localGroupsPreserved: string[];
  localSubgroupsPreserved: string[];
}

@Injectable()
export class CatalogImportService {
  constructor(private readonly prisma: PrismaService) {}

  async importFromRows(rows: CatalogImportRow[]): Promise<CatalogImportResult> {
    const result: CatalogImportResult = {
      groups: { found: rows.length, created: 0, updated: 0, unchanged: 0, errors: [] },
      subgroups: { found: rows.length, created: 0, updated: 0, unchanged: 0, errors: [] },
      localGroupsPreserved: [],
      localSubgroupsPreserved: [],
    };

    const uniqueGroupCodes = [...new Set(rows.map(r => r.groupCode))];

    const existingGroups = await this.prisma.catalogGroup.findMany();
    const existingGroupMap = new Map(existingGroups.map(g => [g.code, g]));

    const existingSubgroups = await this.prisma.catalogSubgroup.findMany();
    const existingSubgroupMap = new Map(
      existingSubgroups.map(s => [`${s.groupId}:${s.code}`, s])
    );

    for (const groupCode of uniqueGroupCodes) {
      const groupRows = rows.filter(r => r.groupCode === groupCode);
      const groupName = groupRows[0]?.groupName ?? '';

      try {
        const existing = existingGroupMap.get(groupCode);

        if (existing) {
          if (existing.name !== groupName) {
            await this.prisma.catalogGroup.update({
              where: { id: existing.id },
              data: { name: groupName, sourceSystem: 'PROFIT', sourceCode: groupCode },
            });
            result.groups.updated++;
          } else if (!existing.sourceSystem) {
            await this.prisma.catalogGroup.update({
              where: { id: existing.id },
              data: { sourceSystem: 'PROFIT', sourceCode: groupCode },
            });
            result.groups.updated++;
          } else {
            result.groups.unchanged++;
          }
        } else {
          await this.prisma.catalogGroup.create({
            data: {
              code: groupCode,
              name: groupName,
              sourceSystem: 'PROFIT',
              sourceCode: groupCode,
            },
          });
          result.groups.created++;
        }
      } catch (err: any) {
        result.groups.errors.push(`Group ${groupCode}: ${err.message}`);
      }
    }

    const refreshedGroups = await this.prisma.catalogGroup.findMany();
    const groupIdByCode = new Map(refreshedGroups.map(g => [g.code, g.id]));

    for (const row of rows) {
      const groupId = groupIdByCode.get(row.groupCode);
      if (!groupId) {
        result.subgroups.errors.push(`Subgroup ${row.subgroupCode}: parent group ${row.groupCode} not found`);
        continue;
      }

      try {
        const subgroupKey = `${groupId}:${row.subgroupCode}`;
        const existing = existingSubgroupMap.get(subgroupKey);

        if (existing) {
          if (existing.name !== row.subgroupName) {
            await this.prisma.catalogSubgroup.update({
              where: { id: existing.id },
              data: { name: row.subgroupName, sourceSystem: 'PROFIT', sourceCode: row.subgroupCode },
            });
            result.subgroups.updated++;
          } else if (!existing.sourceSystem) {
            await this.prisma.catalogSubgroup.update({
              where: { id: existing.id },
              data: { sourceSystem: 'PROFIT', sourceCode: row.subgroupCode },
            });
            result.subgroups.updated++;
          } else {
            result.subgroups.unchanged++;
          }
        } else {
          await this.prisma.catalogSubgroup.create({
            data: {
              groupId,
              code: row.subgroupCode,
              name: row.subgroupName,
              sourceSystem: 'PROFIT',
              sourceCode: row.subgroupCode,
            },
          });
          result.subgroups.created++;
        }
      } catch (err: any) {
        result.subgroups.errors.push(`Subgroup ${row.groupCode}/${row.subgroupCode}: ${err.message}`);
      }
    }

    const finalGroups = await this.prisma.catalogGroup.findMany();
    const localGroups = finalGroups.filter(g => g.sourceSystem !== 'PROFIT');
    result.localGroupsPreserved = localGroups.map(g => `${g.code} (${g.name})`);

    const finalSubgroups = await this.prisma.catalogSubgroup.findMany();
    const localSubgroups = finalSubgroups.filter(s => s.sourceSystem !== 'PROFIT');
    result.localSubgroupsPreserved = localSubgroups.map(s => {
      const group = finalGroups.find(g => g.id === s.groupId);
      return `${group?.code}/${s.code} (${s.name})`;
    });

    return result;
  }

  parseCsvLine(line: string): CatalogImportRow | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    const parts = trimmed.split(';');
    if (parts.length < 4) return null;

    const clean = (s: string) => s.replace(/^"|"$/g, '').trim();

    return {
      groupCode: clean(parts[0] ?? ''),
      groupName: clean(parts[1] ?? ''),
      subgroupCode: clean(parts[2] ?? ''),
      subgroupName: clean(parts[3] ?? ''),
    };
  }

  parseCsvContent(content: string): CatalogImportRow[] {
    const lines = content.split('\n').filter(l => l.trim());
    const rows: CatalogImportRow[] = [];

    for (const line of lines) {
      const row = this.parseCsvLine(line);
      if (row) rows.push(row);
    }

    return rows;
  }
}
