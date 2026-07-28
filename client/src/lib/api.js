// Tiny fetch wrapper. Base URL is empty by default so requests hit the Vite
// dev proxy (/api -> server); set VITE_API_BASE_URL for a deployed backend.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const API_PREFIX = '/api/v1';

const TOKEN_KEY = 'auth_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** Thrown on non-2xx responses; carries status + server message. */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${API_PREFIX}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // no/invalid JSON body
  }

  if (!res.ok) {
    throw new ApiError(res.status, payload?.message || `Request failed (${res.status})`);
  }
  return payload?.data ?? payload;
}

// Fetch a binary endpoint (with auth) and save it as a download.
export async function downloadFile(path, filename) {
  const token = tokenStore.get();
  const res = await fetch(`${BASE_URL}${API_PREFIX}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
