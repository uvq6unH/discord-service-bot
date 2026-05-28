/**
 * Discord OAuth2 middleware + routes.
 *
 * Flow:
 *   /auth/login  → redirect to Discord
 *   /auth/callback → exchange code → store user in session
 *   /auth/logout → clear session
 *
 * Middleware:
 *   requireAuth  → protect API routes (returns 401 JSON)
 *   requirePage  → protect HTML pages (redirects to /auth/login)
 *
 * After login, user must have MANAGE_GUILD permission on the
 * requested guild to access its config.
 */

const DISCORD_API = 'https://discord.com/api/v10';
// MANAGE_GUILD permission bit
const MANAGE_GUILD = 0x20n;

function hasManageGuild(permissions) {
  // permissions comes as a string from Discord API
  return (BigInt(permissions) & MANAGE_GUILD) === MANAGE_GUILD;
}

export function createAuthRouter(botClient) {
  const clientId     = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri  = process.env.DISCORD_REDIRECT_URI;

  // If OAuth env vars are not set, return a no-op router so the app still
  // boots in dev without them (but dashboard will be unprotected).
  if (!clientId || !clientSecret || !redirectUri) {
    console.warn('[auth] DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET / DISCORD_REDIRECT_URI not set — dashboard is UNPROTECTED.');
    return {
      router: null,
      requireAuth: (_req, _res, next) => next(),
      requirePage: (_req, _res, next) => next(),
      requireGuildAccess: (_req, _res, next) => next(),
    };
  }

  // Lazy import express Router to avoid circular deps
  const { Router } = await import('express').then(m => m).catch(() => require('express'));

  // Use a plain object as a router factory since we're in ESM
  const routes = [];

  function get(path, handler) { routes.push({ method: 'GET', path, handler }); }
  function attachTo(app) {
    for (const r of routes) app[r.method.toLowerCase()](r.path, r.handler);
  }

  // GET /auth/login
  get('/auth/login', (req, res) => {
    const state = Math.random().toString(36).slice(2);
    req.session.oauthState = state;
    // Save the page they were trying to visit
    req.session.returnTo = req.query.returnTo || '/';

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds guilds.members.read',
      state,
      prompt: 'none', // skip consent screen if already authorized
    });
    res.redirect(`https://discord.com/oauth2/authorize?${params}`);
  });

  // GET /auth/callback
  get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code || state !== req.session.oauthState) {
      return res.status(400).send('OAuth state mismatch. Please try again.');
    }
    req.session.oauthState = null;

    try {
      // Exchange code for tokens
      const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      });
      const tokens = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokens.error_description ?? 'Token exchange failed');

      // Fetch the user's identity
      const userRes = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const user = await userRes.json();
      if (!userRes.ok) throw new Error('Failed to fetch user info');

      req.session.user = {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        accessToken: tokens.access_token,
      };

      const returnTo = req.session.returnTo || '/';
      req.session.returnTo = null;
      res.redirect(returnTo);
    } catch (err) {
      console.error('[auth] callback error:', err.message);
      res.status(500).send(`Login failed: ${err.message}`);
    }
  });

  // GET /auth/logout
  get('/auth/logout', (req, res) => {
    req.session = null;
    res.redirect('/');
  });

  // GET /auth/me — used by the dashboard to show logged-in user
  get('/auth/me', (req, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ loggedIn: false });
    }
    const { id, username, avatar } = req.session.user;
    res.json({ loggedIn: true, id, username, avatar });
  });

  // ── Middleware ──────────────────────────────────────────────────────────────

  function requireAuth(req, res, next) {
    if (!req.session?.user) {
      return res.status(401).json({ error: 'Unauthorized', loginUrl: '/auth/login' });
    }
    next();
  }

  function requirePage(req, res, next) {
    if (!req.session?.user) {
      return res.redirect(`/auth/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
    }
    next();
  }

  async function requireGuildAccess(req, res, next) {
    if (!req.session?.user) {
      return res.status(401).json({ error: 'Unauthorized', loginUrl: '/auth/login' });
    }

    const guildId = String(req.query.guildId ?? req.body?.guildId ?? '').trim();
    if (!guildId) return next(); // guildId validation is done elsewhere

    try {
      // Check via bot client first (faster, no extra API call)
      const guild = botClient.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(403).json({ error: 'Bot is not in that server.' });
      }

      // Fetch the member to check their permissions
      const member = await guild.members.fetch(req.session.user.id).catch(() => null);
      if (!member) {
        return res.status(403).json({ error: 'Bạn không phải thành viên của server này.' });
      }

      if (!member.permissions.has('ManageGuild') && !member.permissions.has('Administrator')) {
        return res.status(403).json({ error: 'Bạn cần quyền Quản lý Máy chủ (Manage Guild) để cấu hình bot.' });
      }

      next();
    } catch (err) {
      console.error('[auth] guild access check error:', err.message);
      res.status(500).json({ error: 'Không thể kiểm tra quyền truy cập.' });
    }
  }

  return { attachTo, requireAuth, requirePage, requireGuildAccess };
}
