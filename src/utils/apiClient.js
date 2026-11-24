/**
 * Shared client fetch helper with uniform profile scoping and JSON error handling.
 */
export function buildProfileScopedUrl(url, profileId) {
  if (!profileId) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}profile=${encodeURIComponent(profileId)}`;
}

export async function apiRequest(
  url,
  { method = 'GET', body, profileId = '', headers = {}, signal, keepalive = false } = {}
) {
  const finalUrl = buildProfileScopedUrl(url, profileId);
  const reqHeaders = { ...headers };
  if (profileId) {
    reqHeaders['X-Howard-Profile'] = profileId;
  }
  const init = {
    method,
    headers: reqHeaders,
    signal,
    keepalive
  };
  if (body !== undefined) {
    reqHeaders['Content-Type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const res = await fetch(finalUrl, init);
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const err = new Error(
      data?.error || `Request failed (${res.status} ${res.statusText || ''})`.trim()
    );
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data;
}
