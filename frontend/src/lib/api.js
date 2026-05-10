const baseUrl = import.meta.env?.VITE_API_BASE ?? '';

let getAuthToken = () => null;

export function setAuthTokenProvider(fn) {
  getAuthToken = typeof fn === 'function' ? fn : () => null;
}

async function authHeaders() {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(method, path, body) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(await authHeaders()),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return readResponse(res, method, path);
}

async function readResponse(res, method, path) {
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* leave as text */
  }
  if (!res.ok) {
    const message = parsed?.error?.message ?? text ?? res.statusText;
    const error = new Error(`${method} ${path} failed: ${res.status} ${message}`);
    error.status = res.status;
    error.code = parsed?.error?.code;
    error.details = parsed?.error?.details;
    throw error;
  }
  return parsed;
}

async function uploadRequest(method, path, formData) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: { Accept: 'application/json', ...(await authHeaders()) },
    body: formData,
  });
  return readResponse(res, method, path);
}

async function blobRequest(method, path, accept) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: { Accept: accept, ...(await authHeaders()) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* leave as text */
    }
    const message = parsed?.error?.message ?? text ?? res.statusText;
    const error = new Error(`${method} ${path} failed: ${res.status} ${message}`);
    error.status = res.status;
    error.code = parsed?.error?.code;
    throw error;
  }
  return res.blob();
}

export const apiGet = (path) => request('GET', path);
export const apiPost = (path, body) => request('POST', path, body);
export const apiPatch = (path, body) => request('PATCH', path, body);
export const apiPut = (path, body) => request('PUT', path, body);
export const apiDelete = (path, body) => request('DELETE', path, body);
export const apiUpload = (path, formData) => uploadRequest('POST', path, formData);
export const apiGetBlob = (path, accept = '*/*') => blobRequest('GET', path, accept);
