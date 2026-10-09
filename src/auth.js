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

export function createAuthRouter(botClient, redis = null, guildService = null) {
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

  // Caching helpers linked to centralized guildService
  async function getCachedGuilds(userId) {
    if (!guildService) return null;
    const cache = await guildService.getCachedGuilds(userId);
    return cache ? cache.guilds : null;
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

  // In-flight authorization code exchange cache to prevent race conditions & duplicate token burn
  const inFlightExchanges = new Map();

  // GET /auth/callback
  router.get('/auth/callback', async (req, res) => {
    // 1. Ignore prefetch requests (Chrome / Edge / Firefox speculative prefetch)
    const isPrefetch = req.headers['purpose'] === 'prefetch' ||
      req.headers['sec-purpose'] === 'prefetch' ||
      req.headers['x-moz'] === 'prefetch';
    if (isPrefetch) {
      return res.status(204).end();
    }

    // 2. If user already has an active authenticated session, redirect smoothly to dashboard
    if (req.session?.user?.id) {
      const returnTo = safeReturnTo(req.session.returnTo);
      return res.redirect(returnTo);
    }

    const { code, state } = req.query;

    // 3. Validate code and state parameters
    if (!code || typeof code !== 'string') {
      return res.redirect('/login?error=missing_code');
    }

    const hasInFlight = inFlightExchanges.has(code);
    if (!hasInFlight) {
      if (!req.session?.oauthState || state !== req.session.oauthState) {
        console.warn(`[auth] state mismatch: query state=${String(state).slice(0, 8)}..., session state=${String(req.session?.oauthState).slice(0, 8)}...`);
        return res.redirect('/login?error=state_mismatch');
      }

      // Clear oauthState and persist immediately so duplicate requests cannot pass state validation
      req.session.oauthState = null;
      await new Promise((resolve) => req.session.save(resolve));
    }

    try {
      // 4. In-flight promise deduplication for concurrent requests with identical code
      let exchangePromise = inFlightExchanges.get(code);
      if (!exchangePromise) {
        exchangePromise = (async () => {
          let tokenRes;
          let attempt = 0;
          while (attempt < 2) {
            attempt++;
            const tokenController = new AbortController();
            const tokenTimeout = setTimeout(() => tokenController.abort(), 10_000);
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

            if (tokenRes.status === 429 && attempt === 1) {
              const retryAfter = parseFloat(tokenRes.headers.get('retry-after') || '0');
              if (retryAfter > 0 && retryAfter <= 3) {
                console.warn(`[auth] Discord token rate limit (429), waiting ${retryAfter}s before retry...`);
                await new Promise((r) => setTimeout(r, Math.ceil(retryAfter * 1000) + 100));
                continue;
              }
            }
            break;
          }

          if (tokenRes.status === 429) {
            throw new Error('RATE_LIMITED');
          }

          const rawTokenText = await tokenRes.text();
          let tokens;
          try {
            tokens = JSON.parse(rawTokenText);
          } catch {
            tokens = null;
          }

          if (!tokenRes.ok || !tokens) {
            console.error('[auth] token exchange failed:', tokenRes.status, rawTokenText);
            if (tokens?.error === 'invalid_grant') {
              throw new Error('INVALID_GRANT');
            }
            if (tokens?.error === 'redirect_uri_mismatch') {
              throw new Error('REDIRECT_URI_MISMATCH');
            }
            throw new Error(tokens?.error_description ?? tokens?.error ?? 'TOKEN_EXCHANGE_FAILED');
          }

          // Fetch Discord User Info
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

          if (userRes.status === 429) {
            throw new Error('RATE_LIMITED');
          }

          if (!userRes.ok) {
            console.error('[auth] user fetch failed:', userRes.status);
            throw new Error('USER_FETCH_FAILED');
          }

          const user = await userRes.json();
          return {
            tokens,
            user,
          };
        })();

        inFlightExchanges.set(code, exchangePromise);
        exchangePromise
          .catch(() => {})
          .finally(() => {
            setTimeout(() => inFlightExchanges.delete(code), 6_000);
          });
      }

      const { tokens, user } = await exchangePromise;

      const newUser = {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + (tokens.expires_in ?? 604800) * 1000,
      };
      const returnTo = safeReturnTo(req.session.returnTo);

      // Regenerate session ID after successful auth to prevent session fixation.
      req.session.regenerate((err) => {
        if (err) {
          console.error('[auth] session regenerate error after login:', err);
          return res.redirect('/login?error=session_error');
        }
        req.session.user = newUser;
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('[auth] session save error after login:', saveErr);
            return res.redirect('/login?error=session_error');
          }
          console.log('[auth] session set for', newUser.username);
          res.redirect(returnTo);
        });
      });
    } catch (err) {
      console.error('[auth] callback error:', err.message);
      if (err.message === 'RATE_LIMITED') {
        return res.redirect('/login?error=rate_limited');
      }
      if (err.message === 'INVALID_GRANT') {
        return res.redirect('/login?error=code_expired');
      }
      if (err.message === 'REDIRECT_URI_MISMATCH') {
        return res.redirect('/login?error=redirect_uri_mismatch');
      }
      return res.redirect('/login?error=login_failed');
    }
  });

  // GET /auth/logout
  router.get('/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/login');
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
  async function refreshAccessToken(req) {
    const refreshToken = req.session?.user?.refreshToken;
    if (!refreshToken) return null;
    try {
      const res = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });
      if (!res.ok) return null;
      const tokens = await res.json();
      req.session.user.accessToken  = tokens.access_token;
      req.session.user.refreshToken = tokens.refresh_token;
      req.session.user.expiresAt    = Date.now() + (tokens.expires_in ?? 604800) * 1000;
      await new Promise((resolve) => req.session.save(resolve));
      console.log('[auth] Access token refreshed for', req.session.user.id);
      return tokens.access_token;
    } catch (err) {
      console.warn('[auth] refreshAccessToken failed:', err.message);
      return null;
    }
  }

  // Removed old fetchUserGuilds in favor of guildService.fetchAndCacheUserGuilds

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
      if (!req.session.user.accessToken && !req.session.user.refreshToken) {
        return res.status(401).json({ error: 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại.', loginUrl: '/auth/login' });
      }

      const userId = req.session.user.id;
      let accessToken = req.session.user.accessToken;
      const expiresAt = req.session.user.expiresAt ?? 0;
      if (Date.now() > expiresAt - 60_000) {
        const newToken = await refreshAccessToken(req);
        if (newToken) accessToken = newToken;
      }

      if (!guildService) {
        return res.status(500).json({ error: 'Guild service is not initialized.' });
      }

      // Authoritative unified pipeline call
      const resState = await guildService.fetchAndCacheUserGuilds(userId, accessToken);

      if (resState.status === 'syncing') {
        return res.status(202).json({ status: 'syncing', retryAfter: resState.retryAfter ?? 2 });
      }

      if (resState.status === 'error' && (!resState.guilds || resState.guilds.length === 0)) {
        return res.status(503).json({ error: 'Không thể tải danh sách server từ Discord. Vui lòng thử lại.' });
      }

      const userGuilds = resState.guilds || [];
      if (!hasManagePermission(userGuilds, guildId)) {
        const botGuild = botClient?.guilds?.cache?.get(guildId);
        if (botGuild) {
          try {
            const member = await botGuild.members.fetch(userId).catch(() => null);
            if (member && (botGuild.ownerId === userId || member.permissions.has('ManageGuild') || member.permissions.has('Administrator'))) {
              console.log('[auth] secondary fallback guild access granted for', userId, 'in', guildId);
              return next();
            }
          } catch { /* ignore */ }
        }
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