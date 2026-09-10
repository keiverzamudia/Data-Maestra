import type { FinalReviewService } from '../../contratos';
import type { Request } from '../../tipos';
import { api } from './api-client';

export const apiFinalReviewService: FinalReviewService = {
  async getPendingReviews(companyId) {
    const sp = new URLSearchParams();
    if (companyId) sp.set('companyId', companyId);
    const qs = sp.toString();
    return api.get<Request[]>(`/api/v1/final-review/pending${qs ? `?${qs}` : ''}`);
  },

  async getReviewDetail(id: string) {
    return api.get<Request>(`/api/v1/final-review/${encodeURIComponent(id)}`);
  },

  async approveReview(id) {
    await api.post(`/api/v1/final-review/${id}/approve`);
  },

  async rejectReview(id, comment) {
    await api.post(`/api/v1/final-review/${id}/reject`, { comment });
  },
};
