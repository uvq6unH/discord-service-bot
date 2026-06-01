// ── Auth check ──────────────────────────────────────────────────────────────
const me = await fetch('/auth/me').then(r => r.json()).catch(() => ({ loggedIn: false }));
if (!me.loggedIn) { location.href = '/login.html'; }

const userAvatar = document.querySelector('#userAvatar');
const userName = document.querySelector('#userName');
if (userAvatar && me.avatar) userAvatar.src = `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64`;
if (userName) userName.textContent = me.username;

let csrfToken = null;
async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;
  const res = await fetch('/api/csrf-token');
  if (!res.ok) throw new Error('Failed to load CSRF token');
  const data = await res.json();
  csrfToken = data.csrfToken;
  return csrfToken;
}

// Intercept 401/403 and attach CSRF on mutating API calls
const _fetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers ?? {});

  if (url.startsWith('/api') && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('X-CSRF-Token', await ensureCsrfToken());
  }

  let res = await _fetch(input, { ...init, headers });
  if (res.status === 403 && url.startsWith('/api')) {
    csrfToken = null;
    headers.set('X-CSRF-Token', await ensureCsrfToken());
    res = await _fetch(input, { ...init, headers });
  }
  if (res.status === 401) location.href = '/login.html';
  return res;
};

await ensureCsrfToken().catch(() => null);
