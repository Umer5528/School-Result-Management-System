import api from './axios';

// Unauthenticated, per-subject-link endpoints -- the token already
// identifies exactly one subject within one session, so there's no
// separate "verify then browse subjects" step anymore.
export const publicApi = {
  getSubmissionInfo: (token) => api.get(`/public/submissions/${token}`).then((r) => r.data),
  submit: (token, payload) => api.post(`/public/submissions/${token}/submit`, payload).then((r) => r.data),
};
