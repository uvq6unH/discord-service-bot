/**
 * utils/loginWithRetry.js — Shared Discord login helper với exponential backoff.
 *
 * Dùng chung cho cả index.js (monolith) và index.bot.js (split mode).
 * Phân loại lỗi transient bằng error code thay vì string match để tránh
 * false-positive (e.g. error messages chứa "connect" không liên quan).
 *
 * Transient: ECONNRESET, ETIMEDOUT, ENOTFOUND, ECONNREFUSED, EAI_AGAIN,
 *            Discord server errors (status >= 500), rate limits (status 429).
 * Fatal: sai token (401/403), lỗi không phân loại được → process.exit(1).
 */

const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNREFUSED',
  'EAI_AGAIN',
]);

/**
 * @param {import('discord.js').Client} client
 * @param {string} token
 * @param {object} [opts]
 * @param {number} [opts.maxRetries=10]
 * @param {number} [opts.baseDelay=5000]   ms — doubles mỗi lần, tối đa 30 s
 * @param {string} [opts.logPrefix='app']  prefix cho console.log
 */
export async function loginWithRetry(client, token, { maxRetries = 10, baseDelay = 5_000, logPrefix = 'app' } = {}) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await client.login(token);
      console.log(`[${logPrefix}] Discord bot logged in.`);
      return;
    } catch (err) {
      const isTransient =
        TRANSIENT_CODES.has(err.code) ||
        err.status >= 500 ||
        err.status === 429;

      if (!isTransient || attempt === maxRetries) {
        console.error(`[${logPrefix}:login] Fatal on attempt ${attempt}:`, err.message);
        process.exit(1);
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 30_000);
      console.warn(`[${logPrefix}:login] Attempt ${attempt} failed (${err.message}). Retry in ${delay / 1_000}s…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
