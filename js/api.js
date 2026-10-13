let refreshPromise = null;

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }).then(response => response.ok).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function request(path, options = {}, retry = true) {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  if (response.status === 401 && retry && await refreshSession()) {
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
  return result.user;
}

export async function currentSession() {
  const { user } = await request('/api/auth/session');
  return user;
}

export async function logout() {
  await request('/api/auth/logout', { method: 'POST' }, false);
}

export const api = {
  get: path => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) })
};
