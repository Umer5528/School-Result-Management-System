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
  getSubjectSubmission: (id, subjectId, classId = null) => {
    const url = classId
      ? `/result-sessions/${id}/subjects/${subjectId}/classes/${classId}/submission`
      : `/result-sessions/${id}/subjects/${subjectId}/submission`;
    return api.get(url).then((r) => r.data);
  },
  editSubjectSubmission: (id, subjectId, payload, classId = null) => {
    const url = classId
      ? `/result-sessions/${id}/subjects/${subjectId}/classes/${classId}/submission`
      : `/result-sessions/${id}/subjects/${subjectId}/submission`;
    return api.put(url, payload).then((r) => r.data);
  },
  reopenSubject: (id, subjectId, classId = null) => {
    const url = classId
      ? `/result-sessions/${id}/subjects/${subjectId}/classes/${classId}/reopen`
      : `/result-sessions/${id}/subjects/${subjectId}/submission`;
    return (classId ? api.post(url) : api.delete(url)).then((r) => r.data);
  },
  lockSubject: (id, subjectId, classId = null) =>
    api.patch(`/result-sessions/${id}/subjects/${subjectId}/lock`, null, { params: { classId } }).then((r) => r.data),
  unlockSubject: (id, subjectId, classId = null) =>
    api.patch(`/result-sessions/${id}/subjects/${subjectId}/unlock`, null, { params: { classId } }).then((r) => r.data),
  disableSubjectLink: (id, subjectId) =>
    api.patch(`/result-sessions/${id}/subjects/${subjectId}/disable`).then((r) => r.data),
  enableSubjectLink: (id, subjectId) =>
    api.patch(`/result-sessions/${id}/subjects/${subjectId}/enable`).then((r) => r.data),
  regenerateSubjectToken: (id, subjectId) =>
    api.post(`/result-sessions/${id}/subjects/${subjectId}/regenerate-token`).then((r) => r.data),

  // Per-class finalization
  generateClassFinal: (id, classId) =>
    api.post(`/result-sessions/${id}/classes/${classId}/generate-final`).then((r) => r.data),

  // Permanent deletion
  deleteClassResultPermanently: (id, classId) =>
    api.delete(`/result-sessions/${id}/classes/${classId}/permanent`).then((r) => r.data),
  deleteEntireExamPermanently: (id) =>
    api.delete(`/result-sessions/${id}/permanent`).then((r) => r.data),
};
