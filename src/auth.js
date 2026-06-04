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

  // In-process guild cache (per user, 5-minute TTL) — avoids storing 50+ guild
  // objects in the Redis session and logging them on every request.
  const _guildCache = new Map(); // userId -> { guilds, expiresAt }
  const GUILD_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  function getCachedGuilds(userId) {
    const entry = _guildCache.get(userId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { _guildCache.delete(userId); return null; }
    return entry.guilds;
  }

  function setCachedGuilds(userId, guilds) {
    _guildCache.set(userId, { guilds, expiresAt: Date.now() + GUILD_CACHE_TTL });
  }

  // GET /auth/login
  router.get('/auth/login', (req, res) => {
    const returnTo = safeReturnTo(req.query.returnTo);
    const state    = crypto.randomBytes(32).toString('base64url');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds guilds.members.read',
      state,
      prompt: 'none',
    });

    // Regenerate session on each login attempt to:
    //   1. Prevent session fixation attacks
    //   2. Ensure a fresh session ID so concurrent logins (different users,
    //      different browsers) never share oauthState
    // Then save to Redis BEFORE redirecting to Discord so /auth/callback
    // can read back oauthState reliably.
    req.session.regenerate((err) => {
      if (err) {
        console.error('[auth] session regenerate error:', err);
        return res.status(500).send('Login failed. Please try again.');
      }
      req.session.oauthState = state;
      req.session.returnTo   = returnTo;
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('[auth] session save error on login:', saveErr);
          return res.status(500).send('Login failed. Please try again.');
        }
        res.redirect(`https://discord.com/oauth2/authorize?${params}`);
      });
    });
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
      if (!tokenRes.ok) {
        console.error('[auth] token exchange failed:', JSON.stringify(tokens));
        throw new Error(tokens.error_description ?? tokens.error ?? 'Token exchange failed');
      }

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

      const newUser = {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        accessToken: tokens.access_token,
      };
      const returnTo = safeReturnTo(req.session.returnTo);

      // Regenerate session ID after successful auth to prevent session fixation.
      req.session.regenerate((err) => {
        if (err) {
          console.error('[auth] session regenerate error after login:', err);
          return res.status(500).send('Login failed. Please try again.');
        }
        req.session.user = newUser;
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('[auth] session save error after login:', saveErr);
            return res.status(500).send('Login failed. Please try again.');
          }
          console.log('[auth] session set for', newUser.username);
          res.redirect(returnTo);
        });
      });
    } catch (err) {
      console.error('[auth] callback error:', err.message);
      res.status(500).send('Login failed. Please try again later.');
    }
  });

  // GET /auth/logout
  router.get('/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/login.html');
    });
  });

  // GET /auth/me
  router.get('/auth/me', (req, res) => {
    console.log('[auth/me] user:', req.session?.user?.username ?? 'none', '| cookies:', req.headers.cookie ? 'present' : 'MISSING');
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

  // Fetch danh sách guilds của user qua OAuth token, có cache ngắn hạn trong session
  async function fetchUserGuilds(accessToken) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: ctrl.signal,
      });
      if (!res.ok) return null;
      return await res.json(); // array of partial guild objects with `permissions` bitmask
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  // Kiểm tra user có permission ManageGuild (0x20) hoặc Administrator (0x8) trong guild không
  function hasManagePermission(userGuilds, guildId) {
    const g = userGuilds?.find(g => g.id === guildId);
    if (!g) return false;
    if (g.owner) return true; // server owner luôn có toàn quyền
    const perms = BigInt(g.permissions ?? 0);
    const ADMINISTRATOR = 0x8n;
    const MANAGE_GUILD   = 0x20n;
    return (perms & ADMINISTRATOR) === ADMINISTRATOR || (perms & MANAGE_GUILD) === MANAGE_GUILD;
  }

  async function requireGuildAccess(req, res, next) {
    if (!req.session?.user) {
      return res.status(401).json({ error: 'Unauthorized', loginUrl: '/auth/login' });
    }

    const guildId = String(req.query.guildId ?? req.body?.guildId ?? '').trim();
    if (!guildId) return next();

    try {
      const accessToken = req.session.user.accessToken;
      if (!accessToken) {
        // Session cũ chưa có token — yêu cầu login lại
        return res.status(401).json({ error: 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại.', loginUrl: '/auth/login' });
      }

      // Dùng cache guilds trong session để tránh gọi API liên tục
      const userId = req.session.user.id;
      let userGuilds = getCachedGuilds(userId);
      if (!userGuilds) {
        userGuilds = await fetchUserGuilds(accessToken);
        if (!userGuilds) {
          return res.status(403).json({ error: 'Không thể xác minh quyền truy cập. Vui lòng đăng nhập lại.', loginUrl: '/auth/login' });
        }
        setCachedGuilds(userId, userGuilds);
      }

      if (!hasManagePermission(userGuilds, guildId)) {
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