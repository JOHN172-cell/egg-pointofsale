const ACCESS_TOKEN_KEY = 'sylcat_access_token';
const REFRESH_TOKEN_KEY = 'sylcat_refresh_token';
const SESSION_EXPIRY_KEY = 'sylcat_token_expiry';

let accessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY) || '';
let refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY) || '';
let expiresAt = Number(sessionStorage.getItem(SESSION_EXPIRY_KEY)) || 0;
let refreshPromise = null;

function setTokens(session) {
  accessToken = session.access_token || '';
  refreshToken = session.refresh_token || '';
  expiresAt = Number(session.expires_at) * 1000 || 0;
  sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  sessionStorage.setItem(SESSION_EXPIRY_KEY, String(expiresAt));
}

export function clearSession() {
  accessToken = '';
  refreshToken = '';
  expiresAt = 0;
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_EXPIRY_KEY);
}

async function refreshSession() {
  if (!refreshToken) return false;
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    }).then(async response => {
      if (!response.ok) {
        clearSession();
        return false;
      }
      setTokens(await response.json());
      return true;
    }).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function request(path, options = {}, retry = true) {
  if (refreshToken && expiresAt && expiresAt - Date.now() < 60_000) {
    await refreshSession();
  }
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401 && retry && refreshToken && await refreshSession()) {
    return request(path, options, false);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return result;
}

export async function login(email, password) {
  const result = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  }, false);
  setTokens(result);
  return result.user;
}

export async function currentSession() {
  if (!accessToken) return null;
  try {
    const { user } = await request('/api/auth/session');
    return user;
  } catch (error) {
    if (error.status === 401) clearSession();
    throw error;
  }
}

export async function logout() {
  try {
    await request('/api/auth/logout', { method: 'POST' }, false);
  } finally {
    clearSession();
  }
}

export const api = {
  get: path => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) })
};
