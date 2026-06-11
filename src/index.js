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
import { createBot } from './bot.js';
import { startKeepalive } from './utils/keepalive.js';
import { loginWithRetry } from './utils/loginWithRetry.js';
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

// ── Boot: login → listen → keepalive ─────────────────────────────────────────
await loginWithRetry(botClient, token, { logPrefix: 'app' });

httpServer = app.listen(port, () => {
  console.log(`[app] Dashboard running at http://localhost:${port}`);
  console.log(`[app] Bot: ${botClient.user?.tag}`);
  startKeepalive(port);
});