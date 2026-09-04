import api from './axios';

export const draftsApi = {
  get: () => api.get('/drafts/mine').then((r) => r.data),
  save: (payload) => api.put('/drafts/mine', payload).then((r) => r.data),
  discard: () => api.delete('/drafts/mine').then((r) => r.data),
};
