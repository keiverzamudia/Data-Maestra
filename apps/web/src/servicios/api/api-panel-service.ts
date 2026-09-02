import { api } from './api-client';

interface DashboardStats {
  pendingRequests: number;
  inApproval: number;
  returnedRequests: number;
  completedRequests: number;
  totalRequests: number;
  recentImports: number;
  activeMasterItems: number;
  pendingHomologation: number;
  pendingSourceItems: number;
  pendingMatches: number;
  qualityIssues: number;
}

interface ActivityItem {
  id: string;
  requestNumber: string;
  description: string;
  status: string;
  actor: string;
  createdAt: string;
}

export const apiPanelService = {
  async getStats(companyId?: string): Promise<DashboardStats> {
    const qs = companyId ? `?companyId=${companyId}` : '';
    return api.get<DashboardStats>(`/api/v1/panel/stats${qs}`);
  },

  async getActivity(companyId?: string): Promise<ActivityItem[]> {
    const qs = companyId ? `?companyId=${companyId}` : '';
    return api.get<ActivityItem[]>(`/api/v1/panel/activity${qs}`);
  },
};
