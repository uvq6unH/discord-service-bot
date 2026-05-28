import 'dotenv/config';
import { ConfigStore } from './configStore.js';
import { StateStore } from './stateStore.js';
import { createBot } from './bot.js';
import { createServer } from './server.js';

const token = process.env.DISCORD_TOKEN;
const port = Number(process.env.PORT ?? 10000);
const configPath = process.env.CONFIG_PATH ?? './data/configs.json';
const statePath = process.env.STATE_PATH ?? './data/state.json';

if (!token) {
  console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and add your bot token.');
  process.exit(1);
}

// ── Global error guards ──────────────────────────────────────────────────────
// Prevent unhandled promise rejections from killing the process.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
  // Give the logger a tick to flush, then exit so pm2/systemd can restart.
  setTimeout(() => process.exit(1), 500);
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[shutdown] Received ${signal}, shutting down gracefully…`);
  try {
    botClient.destroy();
    console.log('[shutdown] Discord client destroyed.');
  } catch (err) {
    console.error('[shutdown] Error during destroy:', err);
  }
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── Boot ─────────────────────────────────────────────────────────────────────
const configStore = new ConfigStore(configPath);
const stateStore  = new StateStore(statePath);
const botClient   = createBot(configStore, stateStore);
const app         = createServer({ configStore, stateStore, botClient });

app.listen(port, () => {
  console.log(`[server] Dashboard running at http://localhost:${port}`);
});

// Login with retry on transient network errors
async function loginWithRetry(maxRetries = 10, baseDelay = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await botClient.login(token);
      return; // success
    } catch (err) {
      const isTransient =
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT'  ||
        err.code === 'ENOTFOUND'  ||
        String(err.message).includes('connect') ||
        String(err.message).includes('network');

      if (!isTransient || attempt === maxRetries) {
        console.error(`[login] Fatal error on attempt ${attempt}:`, err.message);
        process.exit(1);
      }

      const delay = baseDelay * Math.min(attempt, 6); // cap at 30s
      console.warn(`[login] Attempt ${attempt} failed (${err.message}). Retrying in ${delay / 1000}s…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

await loginWithRetry();
