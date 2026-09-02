import type { FinalReviewService } from '../../contratos';
import type { Request } from '../../tipos';

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
