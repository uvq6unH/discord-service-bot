/**
 * utils/keepalive.js — Self-ping để giữ Render free tier không spin down.
 *
 * Tách ra khỏi bot.js để index.server.js (dashboard process) có thể import
 * mà không kéo theo toàn bộ dependency graph của Discord client.
 *
 * Render free tier spin down sau 15 phút không có HTTP traffic.
 * Gọi startKeepalive(port) từ entry point SAU KHI HTTP server đã listen.
 */

/**
 * @param {number|string} [port]  Port của HTTP server cần ping. Default: PORT env.
 * @returns {NodeJS.Timeout}      setInterval handle (đã .unref())
 */
export function startKeepalive(port = process.env.PORT ?? 10000) {
  const INTERVAL_MS = 5 * 60_000;
  const RETRY_DELAY = 10_000;
  const MAX_RETRIES = 3;

  async function ping(attempt = 1) {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      console.log(`[keepalive] /health → ${res.status}, uptime ${Math.floor(process.uptime())}s`);
      if (!res.ok && attempt < MAX_RETRIES) {
        setTimeout(() => ping(attempt + 1), RETRY_DELAY);
      }
    } catch (err) {
      console.warn(`[keepalive] attempt ${attempt} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) setTimeout(() => ping(attempt + 1), RETRY_DELAY);
    }
  }

  const handle = setInterval(() => ping(), INTERVAL_MS);
  handle.unref();
  console.log(`[keepalive] Started — pinging /health every ${INTERVAL_MS / 60_000} min on port ${port}`);
  return handle;
}
