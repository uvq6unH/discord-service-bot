/**
 * index.server.js — Dashboard process entry point
 *
 * Chạy RIÊNG BIỆT với bot (index.bot.js).
 * Express + OAuth. Không import Discord.js Client.
 * Giao tiếp read-only với Redis (ConfigStore + StateStore).
 *
 * Start:  node src/index.server.js
 */

import 'dotenv/config';

import { ConfigStore }            from './configStore.js';
import { StateStore }             from './stateStore.js';
import { createServer }           from './server.js';
import { validateServerEnvironment } from './env.js';
import { createUpstashFromEnv }       from './upstash.js';

// ── Validate ──────────────────────────────────────────────────────────────────
try {
  validateServerEnvironment();
} catch (error) {
  console.error(error.message);
  console.error('Copy .env.example to .env, hoặc set biến môi trường trên host.');
  process.exit(1);
}

const port      = Number(process.env.DASHBOARD_PORT ?? process.env.PORT ?? 10001);
const configPath = process.env.CONFIG_PATH ?? './data/configs.json';
const statePath  = process.env.STATE_PATH  ?? './data/state.json';

// ── Global error guards ───────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[server:unhandledRejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[server:uncaughtException]', error);
  setTimeout(() => process.exit(1), 500);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGINT',  () => { console.log('[server] SIGINT — exiting.'); process.exit(0); });
process.on('SIGTERM', () => { console.log('[server] SIGTERM — exiting.'); process.exit(0); });

// ── Boot ──────────────────────────────────────────────────────────────────────

// Dashboard không cần botClient — truyền null.
// server.js đã handle botClient === null: các route cần bot sẽ trả lỗi 503.
const sharedRedis = createUpstashFromEnv();
const configStore = new ConfigStore(configPath, { redis: sharedRedis });
const stateStore  = new StateStore(statePath, { redis: sharedRedis });

const app = createServer({
  configStore,
  stateStore,
  botClient: null,   // Không có bot trong process này
  redis: sharedRedis,
});

app.listen(port, () => {
  console.log(`[server] Dashboard running at http://localhost:${port}`);
});
