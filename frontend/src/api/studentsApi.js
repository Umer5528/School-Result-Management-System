import api from './axios';

export const studentsApi = {
  list: (params) => api.get('/students', { params }).then((r) => r.data),
  groups: () => api.get('/students/groups').then((r) => r.data),
  create: (payload) => api.post('/students', payload).then((r) => r.data),
  bulkImport: (payload) => api.post('/students/bulk-import', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/students/${id}`, payload).then((r) => r.data),
  deactivate: (id) => api.patch(`/students/${id}/deactivate`).then((r) => r.data),
  reactivate: (id) => api.patch(`/students/${id}/reactivate`).then((r) => r.data),
  remove: (id) => api.delete(`/students/${id}`).then((r) => r.data),
};
