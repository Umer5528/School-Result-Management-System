import api from './axios';

export const classProfilesApi = {
  recent: () => api.get('/class-profiles/recent').then((r) => r.data),
  lookup: (className, section) =>
    api.get('/class-profiles/lookup', { params: { class: className, section } }).then((r) => r.data),
};
