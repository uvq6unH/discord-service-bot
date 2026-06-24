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
  if (init.body && !(init.body instanceof FormData)) {
    if (typeof init.body === 'object') {
      // Object → stringify
      headers.set('Content-Type', 'application/json');
      init = { ...init, body: JSON.stringify(init.body) };
    } else if (typeof init.body === 'string' && !headers.has('Content-Type')) {
      // String đã stringify → chỉ set header nếu chưa có
      headers.set('Content-Type', 'application/json');
    }
  }

  let res = await fetch(url, { ...init, headers });

  // Retry một lần nếu CSRF expired — phân biệt với 403 do thiếu quyền guild.
  // Server trả { error: 'Invalid CSRF token' } khi CSRF hết hạn; còn lại là
  // permission denied → không retry (sẽ fail lần 2 giống hệt, waste 1 request).
  if (res.status === 403 && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    let iscsrfError = false;
    try {
      const clone = res.clone();
      const body = await clone.json();
      iscsrfError = /csrf/i.test(body?.error ?? '');
    } catch { /* ignore parse error */ }

    if (iscsrfError) {
      csrfToken = null;
      try {
        headers.set('X-CSRF-Token', await ensureCsrfToken());
        res = await fetch(url, { ...init, headers });
      } catch { /* ignore */ }
    }
  }

  // Auth expired
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok && !allowNotOk) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const msg = body?.error ?? body?.message ?? `HTTP ${res.status} ${res.statusText}`;
    console.error('[apiFetch] error', res.status, url, body);
    throw new Error(msg);
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

  /** Lưu config — trả về { config, slashSync } */
  saveConfig: async (guildId, config) => {
    const res = await apiFetch(
      `/api/config?guildId=${encodeURIComponent(guildId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Đảm bảo body luôn là string — apiFetch chỉ stringify nếu typeof === 'object'
        // nhưng nếu đã stringify rồi thì sẽ double-encode
        body: typeof config === 'string' ? config : JSON.stringify(config),
      }
    );
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = {}; }
    return data.config ?? data;
  },

  /** Lấy channels + roles của guild (cho dropdown) */
  guildData: (guildId) =>
    apiFetch(`/api/guild-data?guildId=${encodeURIComponent(guildId)}`).then(r => r.json()),

  /** Lấy members page */
  members: (guildId, page = 1, search = '', limit = 20) =>
    apiFetch(`/api/members?guildId=${encodeURIComponent(guildId)}&page=${page}&search=${encodeURIComponent(search)}&limit=${limit}`).then(r => r.json()),

  /** Invite URL */
  inviteUrl: (guildId) =>
    apiFetch(`/api/invite-url?guildId=${encodeURIComponent(guildId)}`).then(r => r.json()),

  /** Lấy role của user hiện tại trong một guild cụ thể */
  myRole: (guildId) =>
    apiFetch(`/api/my-role?guildId=${encodeURIComponent(guildId)}`).then(r => r.json()),

  /** Health check */
  health: () => apiFetch('/health', {}, { allowNotOk: true }).then(r => r.json()),

  /** Bot/system status — heartbeats + stats counters */
  status: () => apiFetch('/api/status').then(r => r.json()),
};