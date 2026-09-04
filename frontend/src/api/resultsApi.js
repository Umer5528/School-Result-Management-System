import api from './axios';

function filenameFromDisposition(header, fallback) {
  const match = /filename="?([^"]+)"?/.exec(header || '');
  return match ? match[1] : fallback;
}

async function downloadBlob(url, fallbackFilename) {
  // Plain <a href> tags can't carry the Authorization header, so these
  // downloads go through axios (which attaches the JWT via the request
  // interceptor) and the file is saved from the returned blob instead.
  const response = await api.get(url, { responseType: 'blob' });
  const filename = filenameFromDisposition(response.headers['content-disposition'], fallbackFilename);
  const blobUrl = window.URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export const resultsApi = {
  list: (params) => api.get('/results', { params }).then((r) => r.data),
  get: (id) => api.get(`/results/${id}`).then((r) => r.data),
  create: (payload) => api.post('/results', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/results/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/results/${id}`).then((r) => r.data),
  overrideStudentStatus: (id, rollNumber, payload) =>
    api.patch(`/results/${id}/students/${encodeURIComponent(rollNumber)}/override`, payload).then((r) => r.data),
  downloadPdf: (id) => downloadBlob(`/results/${id}/pdf`, `result-${id}.pdf`),
  downloadExcel: (id) => downloadBlob(`/results/${id}/excel`, `result-${id}.xlsx`),
};
