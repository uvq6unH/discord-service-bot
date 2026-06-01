/**
 * Discord OAuth2 middleware + routes.
 */

import { Router } from 'express';
import crypto from 'node:crypto';

const DISCORD_API = 'https://discord.com/api/v10';

function safeReturnTo(value) {
  const fallback = '/';
  if (typeof value !== 'string') {
    return fallback;
  }

  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback;
  }

  try {
    const parsed = new URL(value, 'http://localhost');
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function createAuthRouter(botClient) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  const isProduction = process.env.NODE_ENV === 'production';

  const allowDevAuth = process.env.ALLOW_DEV_AUTH === 'true';
  const hostedRuntime = Boolean(process.env.RENDER) || Boolean(process.env.RAILWAY_ENVIRONMENT);

  if (!clientId || !clientSecret || !redirectUri) {
    if (isProduction || hostedRuntime) {
      throw new Error('Missing Discord OAuth env vars in production: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI.');
    }

    if (!allowDevAuth) {
      throw new Error(
        'Discord OAuth is not configured. Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI, or set ALLOW_DEV_AUTH=true for local development only.'
      );
    }

    console.warn('[auth] ALLOW_DEV_AUTH=true — dashboard is UNPROTECTED (local dev only).');
    const devRouter = Router();
    const devUser = {
      id: process.env.DEV_USER_ID || botClient.user?.id || 'dev-user',
      username: process.env.DEV_USERNAME || 'Dev User',
      avatar: null,
      dev: true,
    };

    function ensureDevSession(req, _res, next) {
      req.session.user ??= devUser;
      next();
    }

    devRouter.use(ensureDevSession);
    devRouter.get('/auth/login', (_req, res) => res.redirect('/'));
    devRouter.get('/auth/logout', (_req, res) => res.redirect('/'));
    devRouter.get('/auth/me', (req, res) => {
      const { id, username, avatar, dev } = req.session.user;
      res.json({ loggedIn: true, id, username, avatar, dev });
    });

    return {
      router: devRouter,
      attachTo: (app) => app.use(devRouter),
      requireAuth: ensureDevSession,
      requirePage: ensureDevSession,
      requireGuildAccess: ensureDevSession,
    };
  }

  const router = Router();

  // GET /auth/login
  router.get('/auth/login', (req, res) => {
    const state = crypto.randomBytes(32).toString('base64url');
    req.session.oauthState = state;
    req.session.returnTo = safeReturnTo(req.query.returnTo);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds guilds.members.read',
      state,
      prompt: 'none',
    });
    res.redirect(`https://discord.com/oauth2/authorize?${params}`);
  });

  // GET /auth/callback
  router.get('/auth/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code || state !== req.session.oauthState) {
      return res.status(400).send('OAuth state mismatch. Please try again.');
    }
    req.session.oauthState = null;

    try {
      const tokenController = new AbortController();
      const tokenTimeout = setTimeout(() => tokenController.abort(), 10_000);
      let tokenRes;
      try {
        tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
          }),
          signal: tokenController.signal,
        });
      } finally {
        clearTimeout(tokenTimeout);
      }
      const tokenCt = tokenRes.headers.get('content-type') ?? '';
      if (!tokenCt.includes('application/json')) {
        throw new Error(`Unexpected response from Discord token endpoint: ${tokenRes.status} ${tokenRes.statusText}`);
      }
      const tokens = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokens.error_description ?? 'Token exchange failed');

      const userController = new AbortController();
      const userTimeout = setTimeout(() => userController.abort(), 10_000);
      let userRes;
      try {
        userRes = await fetch(`${DISCORD_API}/users/@me`, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
          signal: userController.signal,
        });
      } finally {
        clearTimeout(userTimeout);
      }
      const userCt = userRes.headers.get('content-type') ?? '';
      if (!userCt.includes('application/json')) {
        throw new Error(`Unexpected response from Discord users endpoint: ${userRes.status} ${userRes.statusText}`);
      }
      const user = await userRes.json();
      if (!userRes.ok) throw new Error('Failed to fetch user info');

      req.session.user = {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
      };

      const returnTo = safeReturnTo(req.session.returnTo);
      req.session.returnTo = null;
      res.redirect(returnTo);
    } catch (err) {
      console.error('[auth] callback error:', err.message);
      res.status(500).send('Login failed. Please try again later.');
    }
  });

  // GET /auth/logout
  router.get('/auth/logout', (req, res) => {
    req.session = null;
    res.redirect('/login.html');
  });

  // GET /auth/me
  router.get('/auth/me', (req, res) => {
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
    if (!guildId) return next();

    try {
      const guild = botClient.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(403).json({ error: 'Bot chưa được mời vào server này.' });
      }

      const member = await guild.members.fetch(req.session.user.id).catch(() => null);
      if (!member) {
        return res.status(403).json({ error: 'Bạn không phải thành viên của server này.' });
      }

      if (!member.permissions.has('ManageGuild') && !member.permissions.has('Administrator')) {
        return res.status(403).json({ error: 'Bạn cần quyền Quản lý Máy chủ để cấu hình bot.' });
      }

      next();
    } catch (err) {
      console.error('[auth] guild access check error:', err.message);
      res.status(500).json({ error: 'Không thể kiểm tra quyền truy cập.' });
    }
  }

  function attachTo(app) {
    app.use(router);
  }

  return { router, attachTo, requireAuth, requirePage, requireGuildAccess };
}