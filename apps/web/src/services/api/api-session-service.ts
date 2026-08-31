import type { SessionUser } from '../../contracts';
import { api } from './api-client';

export async function getSession(): Promise<SessionUser | null> {
  try {
    return await api.get<SessionUser>('/api/v1/auth/session');
  } catch {
    return null;
  }
}
