import api from './axios';

export const authApi = {
  register: (payload) => api.post('/auth/register', payload).then((r) => r.data),
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  changePassword: (payload) => api.post('/auth/change-password', payload).then((r) => r.data),
};
