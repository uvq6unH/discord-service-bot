/**
 * api.js — Centralized API client
 *
 * - Tự động attach CSRF token cho mutating requests
 * - Redirect về /login khi 401
 * - Throw Error rõ ràng thay vì silent fail
 */

let csrfToken = null;

async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;
  const res = await fetch('/api/csrf-token');
  if (!res.ok) throw new Error('Failed to load CSRF token');
  const data = await res.json();
  csrfToken = data.csrfToken;
  return csrfToken;
}

export function clearCsrfToken() {
  csrfToken = null;
}

/**
 * apiFetch — wrapper quanh fetch với CSRF + auth handling.
 * Throw Error nếu response không ok (trừ khi caller muốn handle).
 */
export async function apiFetch(url, init = {}, { allowNotOk = false } = {}) {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers ?? {});

  // Attach CSRF cho write operations
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    try {
      headers.set('X-CSRF-Token', await ensureCsrfToken());
    } catch {
      // CSRF fetch failed — proceed anyway, server sẽ từ chối nếu cần
    }
  }

  // Default content-type cho JSON body
  if (init.body && typeof init.body === 'object' && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    init = { ...init, body: JSON.stringify(init.body) };
  }

  let res = await fetch(url, { ...init, headers });

  // Retry một lần nếu CSRF expired
  if (res.status === 403 && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    csrfToken = null;
    try {
      headers.set('X-CSRF-Token', await ensureCsrfToken());
      res = await fetch(url, { ...init, headers });
    } catch { /* ignore */ }
  }

  // Auth expired
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok && !allowNotOk) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }

  return res;
}

// ── Typed API helpers ──────────────────────────────────────────────────────────

export const api = {
  /** Lấy thông tin user đang đăng nhập */
  me: () => apiFetch('/auth/me').then(r => r.json()),

  /** Lấy danh sách guild của user */
  guilds: () => apiFetch('/api/guilds').then(r => r.json()),

  /** Lấy config của một guild */
  config: (guildId) =>
    apiFetch(`/api/config?guildId=${encodeURIComponent(guildId)}`).then(r => r.json()),

  /** Lưu config */
  saveConfig: (guildId, config) =>
    apiFetch('/api/config', { method: 'POST', body: { guildId, ...config } }).then(r => r.json()),

  /** Lấy channels + roles của guild (cho dropdown) */
  guildData: (guildId) =>
    apiFetch(`/api/guild-data?guildId=${encodeURIComponent(guildId)}`).then(r => r.json()),

  /** Lấy members page */
  members: (guildId, page = 1, search = '') =>
    apiFetch(`/api/members?guildId=${encodeURIComponent(guildId)}&page=${page}&search=${encodeURIComponent(search)}`).then(r => r.json()),

  /** Invite URL */
  inviteUrl: (guildId) =>
    apiFetch(`/api/invite-url?guildId=${encodeURIComponent(guildId)}`).then(r => r.json()),

  /** Health check */
  health: () => apiFetch('/health', {}, { allowNotOk: true }).then(r => r.json()),
};
