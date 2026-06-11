/**
 * src/index.js — Monolith entry point (1 Render service)
 *
 * Bot + Dashboard trong cùng 1 process:
 *   1 Redis · 1 ConfigStore · 1 StateStore · 1 Discord Client · 1 Express Server
 *
 * Start:  node src/index.js
 * Render: Build = pnpm install && pnpm build:ui  |  Start = node src/index.js
 */

import 'dotenv/config';

import sodium from 'libsodium-wrappers';
await sodium.ready;

import { ConfigStore } from './configStore.js';
import { StateStore } from './stateStore.js';
import { createBot, startKeepalive } from './bot.js';
import { createServer } from './server.js';
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
const port = Number(process.env.PORT ?? 10000);
const configPath = process.env.CONFIG_PATH ?? './data/configs.json';
const statePath = process.env.STATE_PATH ?? './data/state.json';
const token = process.env.DISCORD_TOKEN;

// ── Global error guards ───────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[app:unhandledRejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[app:uncaughtException]', error);
  setTimeout(() => process.exit(1), 500);
});

// ── Shared singletons ─────────────────────────────────────────────────────────
const redis = createUpstashFromEnv();
const configStore = new ConfigStore(configPath);
const stateStore = new StateStore(statePath, { redis });

// ── Discord bot ───────────────────────────────────────────────────────────────
const botClient = createBot(configStore, stateStore, redis);

// ── Express server ────────────────────────────────────────────────────────────
const app = createServer({
  configStore,
  stateStore,
  botClient,
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
    await new Promise((resolve) => httpServer ? httpServer.close(resolve) : resolve());
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

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── Login với retry ───────────────────────────────────────────────────────────
async function loginWithRetry(maxRetries = 10, baseDelay = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await botClient.login(token);
      console.log('[app] Discord bot logged in.');
      return;
    } catch (err) {
      // Phân loại transient dựa trên error code (không phải string match — ít false-positive hơn).
      // Discord.js ném HTTPError với status code khi token sai — đó là fatal, không retry.
      const TRANSIENT_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN']);
      const isTransient = TRANSIENT_CODES.has(err.code) || err.status >= 500 || err.status === 429;

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

// ── Boot: login → listen → keepalive ─────────────────────────────────────────
await loginWithRetry();

httpServer = app.listen(port, () => {
  console.log(`[app] Dashboard running at http://localhost:${port}`);
  console.log(`[app] Bot: ${botClient.user?.tag}`);
  startKeepalive(port);
});