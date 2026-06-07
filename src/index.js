/**
 * src/index.js — Monolith entry point (1 Render service)
 *
 * Khởi động bot + dashboard trong cùng 1 process:
 *   1 Redis  · 1 ConfigStore  · 1 StateStore
 *   1 Discord Client  · 1 Express Server
 *
 * Dashboard nhìn thấy botClient thật → không còn 503 trên guild/members/channels.
 *
 * Khi nào dùng file này:
 *   - Render Free / Starter (1 web service)
 *   - VPS đơn giản, không cần tách process
 *
 * Khi nào KHÔNG dùng:
 *   - Muốn restart bot mà không ngắt dashboard → dùng pm2.config.cjs
 *   - Muốn scale độc lập → dùng render.yaml (2 service)
 *
 * Start: node src/index.js
 */

import 'dotenv/config';

// libsodium phải ready trước khi @discordjs/voice mã hoá audio
import sodium from 'libsodium-wrappers';
await sodium.ready;

import { ConfigStore }        from './configStore.js';
import { StateStore }         from './stateStore.js';
import { createBot, startKeepalive } from './bot.js';
import { createServer }       from './server.js';
import { validateEnvironment } from './env.js';
import { createUpstashFromEnv } from './upstash.js';

// ── Validate ──────────────────────────────────────────────────────────────────
try {
  validateEnvironment();
} catch (error) {
  console.error(error.message);
  console.error('Copy .env.example to .env, hoặc set biến môi trường trên host.');
  process.exit(1);
}

// ── Config ────────────────────────────────────────────────────────────────────
const port       = Number(process.env.PORT ?? 10000);
const configPath = process.env.CONFIG_PATH ?? './data/configs.json';
const statePath  = process.env.STATE_PATH  ?? './data/state.json';
const token      = process.env.DISCORD_TOKEN;

// ── Global error guards ───────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[app:unhandledRejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[app:uncaughtException]', error);
  setTimeout(() => process.exit(1), 500);
});

// ── Shared singletons ─────────────────────────────────────────────────────────
const redis       = createUpstashFromEnv();
const configStore = new ConfigStore(configPath);
const stateStore  = new StateStore(statePath, { redis });

// ── Discord bot ───────────────────────────────────────────────────────────────
const botClient = createBot(configStore, stateStore, redis);

// ── Express server (nhận botClient thật, không phải null) ─────────────────────
const app = createServer({
  configStore,
  stateStore,
  botClient,   // ← đây là điểm khác biệt so với index.server.js
  redis,
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
let isShuttingDown = false;
let httpServer;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[app:shutdown] ${signal} received, shutting down…`);

  try {
    // Dừng nhận request mới trước
    await new Promise((resolve) => {
      if (httpServer) {
        httpServer.close(resolve);
      } else {
        resolve();
      }
    });
    console.log('[app:shutdown] HTTP server closed.');
  } catch (err) {
    console.error('[app:shutdown] Error closing HTTP server:', err);
  }

  try {
    botClient?.destroy();
    console.log('[app:shutdown] Discord client destroyed.');
  } catch (err) {
    console.error('[app:shutdown] Error destroying bot client:', err);
  }

  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── Boot: login bot, rồi mới listen HTTP ─────────────────────────────────────
async function loginWithRetry(maxRetries = 10, baseDelay = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await botClient.login(token);
      console.log('[app] Discord bot logged in.');
      return;
    } catch (err) {
      const isTransient =
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT'  ||
        err.code === 'ENOTFOUND'  ||
        String(err.message).includes('connect') ||
        String(err.message).includes('network');

      if (!isTransient || attempt === maxRetries) {
        console.error(`[app:login] Fatal on attempt ${attempt}:`, err.message);
        process.exit(1);
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 30_000);
      console.warn(`[app:login] Attempt ${attempt} failed (${err.message}). Retry in ${delay / 1000}s…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

await loginWithRetry();

httpServer = app.listen(port, () => {
  console.log(`[app] Dashboard running at http://localhost:${port}`);
  console.log(`[app] Bot: ${botClient.user?.tag}`);
  startKeepalive(port);
});
