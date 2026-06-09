/**
 * index.bot.js — Bot process entry point (Render Worker / PM2)
 *
 * KHÔNG mở HTTP server. KHÔNG expose port.
 * Phải deploy dưới dạng Render Background Worker, không phải Web Service.
 * Web Service mong đợi HTTP port → sẽ báo unhealthy và restart bot.
 *
 * Giao tiếp với dashboard qua Redis:
 *   Bot writes  → guild_cache, heartbeat:bot, stats:*
 *   Bot reads   → slash_sync_queue (consumer)
 *   Bot writes  → config:guild:* (qua configStore)
 *
 * Render: type = worker, startCommand = node src/index.bot.js
 * PM2:    xem pm2.config.cjs (app "discord-bot")
 */

import 'dotenv/config';

// libsodium phải ready trước khi @discordjs/voice mã hoá audio
import sodium from 'libsodium-wrappers';
await sodium.ready;

import { ConfigStore } from './configStore.js';
import { StateStore } from './stateStore.js';
import { createBot, startKeepalive } from './bot.js';
import { validateBotEnvironment } from './env.js';
import { createUpstashFromEnv } from './upstash.js';

// ── Validate ─────────────────────────────────────────────────────────────────
try {
  validateBotEnvironment();
} catch (error) {
  console.error(error.message);
  console.error('Copy .env.example to .env, hoặc set biến môi trường trên host.');
  process.exit(1);
}

// ── Global error guards ───────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[bot:unhandledRejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[bot:uncaughtException]', error);
  setTimeout(() => process.exit(1), 500);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[bot:shutdown] ${signal} received, shutting down…`);
  try {
    botClient?.destroy();
    console.log('[bot:shutdown] Discord client destroyed.');
  } catch (err) {
    console.error('[bot:shutdown] Error during destroy:', err);
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── Boot ──────────────────────────────────────────────────────────────────────
const configPath = process.env.CONFIG_PATH ?? './data/configs.json';
const statePath = process.env.STATE_PATH ?? './data/state.json';
const token = process.env.DISCORD_TOKEN;

const sharedRedis = createUpstashFromEnv();
const configStore = new ConfigStore(configPath);
const stateStore = new StateStore(statePath, { redis: sharedRedis });
const botClient = createBot(configStore, stateStore, sharedRedis);

// Login với retry exponential backoff
async function loginWithRetry(maxRetries = 10, baseDelay = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await botClient.login(token);
      console.log('[bot] Logged in to Discord.');
      return;
    } catch (err) {
      const isTransient =
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ENOTFOUND' ||
        String(err.message).includes('connect') ||
        String(err.message).includes('network');

      if (!isTransient || attempt === maxRetries) {
        console.error(`[bot:login] Fatal on attempt ${attempt}:`, err.message);
        process.exit(1);
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 30_000);
      console.warn(`[bot:login] Attempt ${attempt} failed (${err.message}). Retry in ${delay / 1000}s…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

await loginWithRetry();

// ── Minimal HTTP server ───────────────────────────────────────────────────────
// Render Web Service (Free) yêu cầu bind HTTP port, nếu không sẽ restart liên tục.
// Server này không phục vụ dashboard — chỉ để:
//   1. Render health check pass (không spin down / restart)
//   2. Uptime Robot ping giữ bot sống 24/7 miễn phí
//
// Endpoint duy nhất: GET /health → {"status":"ok","bot":"tag#0000","uptime":123}
import http from 'http';

const botPort = Number(process.env.PORT ?? 10000);

http.createServer((req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    bot: botClient?.user?.tag ?? null,
    guilds: botClient?.guilds?.cache?.size ?? 0,
    uptime: Math.floor(process.uptime()),
  }));
}).listen(botPort, () => {
  console.log(`[bot:health] HTTP health server listening on port ${botPort}`);
  startKeepalive(botPort);
});