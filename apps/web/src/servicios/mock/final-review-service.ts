import type { FinalReviewService } from '../../contratos';
import type { Request } from '../../tipos';

const requests: Request[] = [];

export const mockFinalReviewService: FinalReviewService = {
  async getPendingReviews() {
    return requests.filter(r => r.status === 'PENDIENTE_VALIDACION_MAESTRA');
  },

  async getReviewDetail(id: string) {
    const r = requests.find(x => x.id === id);
    if (!r) throw new Error('No encontrada');
    return r;
  },

  async approveReview(id) {
    const r = requests.find(x => x.id === id);
    if (r) r.status = 'APROBADO_FINAL';
  },

  async rejectReview(id) {
    const r = requests.find(x => x.id === id);
    if (r) r.status = 'RECHAZADO';
  },
};
