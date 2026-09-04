import api from './axios';

export const announcementsApi = {
  list: () => api.get('/announcements').then((r) => r.data),
  create: (payload) => api.post('/announcements', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/announcements/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/announcements/${id}`).then((r) => r.data),
};
