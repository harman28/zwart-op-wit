import { api } from './client.js';

export function login(password: string) {
  return api.post<{ isAdmin: boolean }>('/auth/login', { password });
}
export function logout() {
  return api.post<{ ok: boolean }>('/auth/logout');
}
export function getSession() {
  return api.get<{ isAdmin: boolean }>('/auth/session');
}
export function changePassword(currentPassword: string, newPassword: string) {
  return api.post<{ ok: boolean }>('/auth/change-password', { currentPassword, newPassword });
}
