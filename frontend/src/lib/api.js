const baseUrl = import.meta.env?.VITE_API_BASE ?? '';

export async function apiGet(path) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}
