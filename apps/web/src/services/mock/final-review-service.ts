import type { FinalReviewService } from '../../contracts';
import type { Request } from '../../types';

const requests: Request[] = [];

export const mockFinalReviewService: FinalReviewService = {
  async getPendingReviews() {
    return requests.filter(r => r.status === 'PENDING_FINAL_REVIEW');
  },

  async approveReview(id) {
    const r = requests.find(x => x.id === id);
    if (r) r.status = 'APPROVED';
  },

  async rejectReview(id) {
    const r = requests.find(x => x.id === id);
    if (r) r.status = 'REJECTED';
  },
};
