import api from './axios';

export const auditApi = {
  list: (params) => api.get('/audit-logs', { params }).then((r) => r.data),
};
