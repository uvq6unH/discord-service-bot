/**
 * index.bot.js — Bot process entry point (Render Web Service / PM2)
 *
 * Render Free yêu cầu bind HTTP port NGAY LẬP TỨC sau khi process start.
 * → HTTP server phải listen TRƯỚC khi login Discord.
 * → Sau khi login xong, /health trả về bot tag + guild count thực.
 *
 * Giao tiếp với dashboard qua Redis:
 *   Bot writes  → guild_cache, heartbeat:bot, stats:*
 *   Bot reads   → slash_sync_queue (consumer)
 *   Bot writes  → config:guild:* (qua configStore)
 *
 * Render: type = web, startCommand = node src/index.bot.js
 * PM2:    xem pm2.config.cjs (app "discord-bot")
 */

import 'dotenv/config';
import http from 'http';

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

// ── Boot singletons ───────────────────────────────────────────────────────────
const configPath = process.env.CONFIG_PATH ?? './data/configs.json';
const statePath  = process.env.STATE_PATH  ?? './data/state.json';
const token      = process.env.DISCORD_TOKEN;
const botPort    = Number(process.env.PORT ?? 10000);

const sharedRedis = createUpstashFromEnv();
const configStore = new ConfigStore(configPath);
const stateStore  = new StateStore(statePath, { redis: sharedRedis });
const botClient   = createBot(configStore, stateStore, sharedRedis);

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

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── HTTP server — bind TRƯỚC khi login để Render detect port ngay ─────────────
// Render zero-downtime deploy scan port ngay sau process start.
// Nếu bind sau login (~4-5s) → Render không thấy port → deploy fail → SIGTERM.
//
// /health trả về bot status thực sau khi login xong.
// Trước khi login: bot: null, guilds: 0 — vẫn trả 200 để Render pass health check.
http.createServer((req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    bot:    botClient?.user?.tag   ?? null,
    guilds: botClient?.guilds?.cache?.size ?? 0,
    uptime: Math.floor(process.uptime()),
  }));
}).listen(botPort, () => {
  console.log(`[bot:health] HTTP health server listening on port ${botPort}`);
  startKeepalive(botPort);
});

// ── Login Discord — SAU khi HTTP server đã bind ───────────────────────────────
async function loginWithRetry(maxRetries = 10, baseDelay = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await botClient.login(token);
      console.log('[bot] Logged in to Discord.');
      return;
    } catch (err) {
      const isTransient =
        err.code === 'ECONNRESET'   ||
        err.code === 'ETIMEDOUT'    ||
        err.code === 'ENOTFOUND'    ||
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
