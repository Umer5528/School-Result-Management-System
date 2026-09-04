import api from './axios';

export const teachersApi = {
  list: (params) => api.get('/teachers', { params }).then((r) => r.data),
  pending: (params) => api.get('/teachers/pending', { params }).then((r) => r.data),
  get: (id) => api.get(`/teachers/${id}`).then((r) => r.data),
  getResults: (id, params) => api.get(`/teachers/${id}/results`, { params }).then((r) => r.data),
  getStudents: (id, params) => api.get(`/teachers/${id}/students`, { params }).then((r) => r.data),
  getResultSessions: (id, params) => api.get(`/teachers/${id}/result-sessions`, { params }).then((r) => r.data),
  getResultSession: (id, sessionId) =>
    api.get(`/teachers/${id}/result-sessions/${sessionId}`).then((r) => r.data),
  getSubjectSubmission: (id, sessionId, subjectId) =>
    api.get(`/teachers/${id}/result-sessions/${sessionId}/subjects/${subjectId}/submission`).then((r) => r.data),
  disableSubjectLink: (id, sessionId, subjectId) =>
    api.patch(`/teachers/${id}/result-sessions/${sessionId}/subjects/${subjectId}/disable`).then((r) => r.data),
  reopenSubjectSubmission: (id, sessionId, subjectId) =>
    api.delete(`/teachers/${id}/result-sessions/${sessionId}/subjects/${subjectId}/submission`).then((r) => r.data),
  create: (payload) => api.post('/teachers', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/teachers/${id}`, payload).then((r) => r.data),
  approve: (id) => api.patch(`/teachers/${id}/approve`).then((r) => r.data),
  reject: (id, reason) => api.patch(`/teachers/${id}/reject`, { reason }).then((r) => r.data),
  suspend: (id) => api.patch(`/teachers/${id}/suspend`).then((r) => r.data),
  reactivate: (id) => api.patch(`/teachers/${id}/reactivate`).then((r) => r.data),
  resetPassword: (id) => api.post(`/teachers/${id}/reset-password`).then((r) => r.data),
  promote: (id, permissions) => api.patch(`/teachers/${id}/promote`, { permissions }).then((r) => r.data),
  demote: (id) => api.patch(`/teachers/${id}/demote`).then((r) => r.data),
  updatePermissions: (id, permissions) =>
    api.patch(`/teachers/${id}/permissions`, { permissions }).then((r) => r.data),
};
