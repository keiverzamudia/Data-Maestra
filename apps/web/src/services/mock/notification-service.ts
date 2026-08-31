import { notifications } from '../../mock/extras';
import type { NotificationService } from '../../contracts';

export const mockNotificationService: NotificationService = {
  async list() {
    return [...notifications];
  },
  async unreadCount() {
    return notifications.filter(n => !n.read).length;
  },
};
