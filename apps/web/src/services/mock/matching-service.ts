import { matchCandidates } from '../../mock/source-items';
import type { MatchingService } from '../../contracts';

const delay = (ms = 150) => new Promise(r => setTimeout(r, ms));

export const mockMatchingService: MatchingService = {
  async list() {
    await delay();
    return [...matchCandidates];
  },
  async decide(id, action) {
    await delay();
    const c = matchCandidates.find(x => x.id === id);
    if (c) {
      c.status = action === 'ACCEPTED' ? 'CONFIRMED_SAME' : action === 'REJECTED' ? 'CONFIRMED_DIFFERENT' : 'IGNORED';
    }
  },
};
