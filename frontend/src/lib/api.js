const baseUrl = import.meta.env?.VITE_API_BASE ?? '';

async function request(method, path, body) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
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
    throw error;
  }
  return parsed;
}

export const apiGet = (path) => request('GET', path);
export const apiPost = (path, body) => request('POST', path, body);
