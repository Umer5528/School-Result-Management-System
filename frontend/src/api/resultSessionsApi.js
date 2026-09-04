import api from './axios';

export const resultSessionsApi = {
  list: (params) => api.get('/result-sessions', { params }).then((r) => r.data),
  get: (id) => api.get(`/result-sessions/${id}`).then((r) => r.data),
  create: (payload) => api.post('/result-sessions', payload).then((r) => r.data),
  activate: (id) => api.patch(`/result-sessions/${id}/activate`).then((r) => r.data),
  deactivate: (id) => api.patch(`/result-sessions/${id}/deactivate`).then((r) => r.data),
  generateFinal: (id) => api.post(`/result-sessions/${id}/generate-final`).then((r) => r.data),

  // Per-subject link management -- every subject now has its own link,
  // status, and lifecycle, managed independently.
  getSubjectSubmission: (id, subjectId) =>
    api.get(`/result-sessions/${id}/subjects/${subjectId}/submission`).then((r) => r.data),
  editSubjectSubmission: (id, subjectId, payload) =>
    api.put(`/result-sessions/${id}/subjects/${subjectId}/submission`, payload).then((r) => r.data),
  reopenSubject: (id, subjectId) =>
    api.delete(`/result-sessions/${id}/subjects/${subjectId}/submission`).then((r) => r.data),
  lockSubject: (id, subjectId) =>
    api.patch(`/result-sessions/${id}/subjects/${subjectId}/lock`).then((r) => r.data),
  unlockSubject: (id, subjectId) =>
    api.patch(`/result-sessions/${id}/subjects/${subjectId}/unlock`).then((r) => r.data),
  disableSubjectLink: (id, subjectId) =>
    api.patch(`/result-sessions/${id}/subjects/${subjectId}/disable`).then((r) => r.data),
  enableSubjectLink: (id, subjectId) =>
    api.patch(`/result-sessions/${id}/subjects/${subjectId}/enable`).then((r) => r.data),
  regenerateSubjectToken: (id, subjectId) =>
    api.post(`/result-sessions/${id}/subjects/${subjectId}/regenerate-token`).then((r) => r.data),
};
