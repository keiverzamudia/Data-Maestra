import type { Notification } from '../../tipos';
import { api } from './api-client';

export const apiNotificacionService = {
  async getNotificaciones(): Promise<Notification[]> {
    return api.get<Notification[]>('/api/v1/notificaciones');
  },

  async getUnreadCount(): Promise<number> {
    const result = await api.get<{ count: number }>('/api/v1/notificaciones/unread-count');
    return result.count;
  },

  async markAsRead(id: string): Promise<void> {
    await api.patch(`/api/v1/notificaciones/${id}/read`);
  },

  async markAllAsRead(): Promise<void> {
    await api.patch('/api/v1/notificaciones/read-all');
  },
};
