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

// --- lightweight GET cache (no external query library) ---
// Opt-in per call via { cacheTtl }. Keeps reference data (products, parties,
// expense heads) hot so navigating back to a screen is instant instead of
// re-fetching from a remote backend. In-flight requests are de-duped. ANY
// successful mutation (non-GET) clears the cache, so reads never go stale after
// a create/edit/post. Calls without cacheTtl behave exactly as before.
const getCache = new Map(); // key -> { at, data }
const inflight = new Map(); // key -> Promise

export function clearApiCache() {
  getCache.clear();
  inflight.clear();
}

export async function apiFetch(path, { method = 'GET', body, auth = true, cacheTtl = 0 } = {}) {
  const isGet = method === 'GET';

  if (isGet && cacheTtl > 0) {
    const hit = getCache.get(path);
    if (hit && Date.now() - hit.at < cacheTtl) return hit.data;
    const pending = inflight.get(path);
    if (pending) return pending;
  }

  const run = (async () => {
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
    if (!isGet) clearApiCache(); // a mutation invalidates all cached reads
    return payload?.data ?? payload;
  })();

  if (isGet && cacheTtl > 0) {
    inflight.set(path, run);
    try {
      const data = await run;
      getCache.set(path, { at: Date.now(), data });
      return data;
    } finally {
      inflight.delete(path);
    }
  }
  return run;
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
