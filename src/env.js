/**
 * env.js
 *
 * Cung cấp 3 hàm validate riêng biệt:
 *   validateBotEnvironment()    — dùng trong index.bot.js
 *   validateServerEnvironment() — dùng trong index.server.js
 *   validateEnvironment()       — legacy, dùng trong index.js (monolith)
 */

const placeholderValues = new Set([
  'your_discord_bot_token',
  'your_application_client_id',
  'your_application_client_secret',
  'change_this_to_a_long_random_string',
  'change_this_to_a_long_random_string_at_least_32_chars',
  'dev-secret-change-me',
]);

function isBlank(value) {
  return String(value ?? '').trim() === '';
}

function isPlaceholder(value) {
  return placeholderValues.has(String(value ?? '').trim());
}

function checkWeak(env, keys, weak) {
  for (const key of keys) {
    if (!isBlank(env[key]) && isPlaceholder(env[key])) weak.push(key);
  }
}

// ── Bot process ───────────────────────────────────────────────────────────────

export function validateBotEnvironment(env = process.env) {
  const missing = [];
  const weak    = [];
  const isProd  = env.NODE_ENV === 'production';

  if (isBlank(env.DISCORD_TOKEN)) missing.push('DISCORD_TOKEN');

  if (isProd && (isBlank(env.UPSTASH_REDIS_REST_URL) || isBlank(env.UPSTASH_REDIS_REST_TOKEN))) {
    missing.push('UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN');
  }

  checkWeak(env, ['DISCORD_TOKEN', 'RIOT_API_KEY', 'TFT_API_KEY'], weak);

  if (missing.length) {
    throw new Error(`[bot] Missing required env: ${[...new Set(missing)].join(', ')}`);
  }
  if (weak.length) {
    console.warn(`[bot:env] Placeholder/weak values detected: ${[...new Set(weak)].join(', ')}`);
  }
}

// ── Dashboard process ─────────────────────────────────────────────────────────

export function validateServerEnvironment(env = process.env) {
  const missing = [];
  const weak    = [];
  const isProd  = env.NODE_ENV === 'production';

  const required = [
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_REDIRECT_URI',
    'SESSION_SECRET',
  ];

  for (const key of required) {
    if (isBlank(env[key])) missing.push(key);
  }

  if (isProd && (isBlank(env.UPSTASH_REDIS_REST_URL) || isBlank(env.UPSTASH_REDIS_REST_TOKEN))) {
    missing.push('UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN');
  }

  if (!isBlank(env.SESSION_SECRET) && String(env.SESSION_SECRET).trim().length < 32) {
    weak.push('SESSION_SECRET (quá ngắn, cần ≥32 ký tự)');
  }

  checkWeak(env, [...required], weak);

  if (missing.length) {
    throw new Error(`[server] Missing required env: ${[...new Set(missing)].join(', ')}`);
  }
  if (weak.length) {
    console.warn(`[server:env] Placeholder/weak values: ${[...new Set(weak)].join(', ')}`);
  }
}

// ── Legacy (monolith index.js) ────────────────────────────────────────────────

export function validateEnvironment(env = process.env) {
  validateBotEnvironment(env);
  validateServerEnvironment(env);
}
