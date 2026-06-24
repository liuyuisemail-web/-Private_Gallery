const API_BASE = 'http://localhost:3001';

let token = localStorage.getItem('token');

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('token', t);
  else localStorage.removeItem('token');
}

export function getToken() {
  return token;
}

export function imageUrl(imageId) {
  return `${API_BASE}/api/images/${imageId}/file?token=${encodeURIComponent(token || '')}`;
}

async function request(url, options = {}) {
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

export const api = {
  register: (username, password) =>
    request('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    }),

  login: (username, password) =>
    request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    }),

  getMe: () => request('/api/me'),

  getImages: () => request('/api/images'),

  uploadImage: (file) => {
    const form = new FormData();
    form.append('image', file);
    return request('/api/images', { method: 'POST', body: form });
  },

  deleteImage: (id) => request(`/api/images/${id}`, { method: 'DELETE' }),
};
