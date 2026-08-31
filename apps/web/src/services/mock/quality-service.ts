import { qualityResults } from '../../mock/extras';
import type { QualityService } from '../../contracts';

const delay = (ms = 150) => new Promise(r => setTimeout(r, ms));

export const mockQualityService: QualityService = {
  async list() {
    await delay();
    return [...qualityResults];
  },
};
