import { Injectable } from '@nestjs/common';

@Injectable()
export class MasterCodeService {
  generateMasterCode(
    groupCode: string,
    subgroupCode: string,
    sequence: number,
  ): string {
    const seq = String(sequence).padStart(6, '0');
    return `${groupCode}${subgroupCode}${seq}`;
  }
}
