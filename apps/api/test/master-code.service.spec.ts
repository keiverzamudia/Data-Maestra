import { describe, it, expect } from 'vitest';
import { MasterCodeService } from '../src/shared/master-code/master-code.service';

describe('MasterCodeService', () => {
  let service: MasterCodeService;

  beforeEach(() => {
    service = new MasterCodeService();
  });

  describe('generateMasterCode', () => {
    it('concatenates group code, subgroup code, and zero-padded sequence', () => {
      const result = service.generateMasterCode('RVH', 'CAR', 1);
      expect(result).toBe('RVHCAR000001');
    });

    it('pads sequence to 6 digits with leading zeros', () => {
      expect(service.generateMasterCode('ABC', 'DEF', 42)).toBe('ABCDEF000042');
    });

    it('handles sequence 0', () => {
      expect(service.generateMasterCode('A', 'B', 0)).toBe('AB000000');
    });

    it('handles large sequence numbers', () => {
      expect(service.generateMasterCode('GRP', 'SUB', 999999)).toBe('GRPSUB999999');
    });

    it('handles single-character codes', () => {
      expect(service.generateMasterCode('X', 'Y', 1)).toBe('XY000001');
    });

    it('handles empty codes', () => {
      expect(service.generateMasterCode('', '', 1)).toBe('000001');
    });
  });
});
