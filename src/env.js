const requiredBaseEnv = ['DISCORD_TOKEN'];
const requiredProductionEnv = [
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_REDIRECT_URI',
  'SESSION_SECRET'
];

const placeholderValues = new Set([
  'your_discord_bot_token',
  'your_application_client_id',
  'your_application_client_secret',
  'change_this_to_a_long_random_string',
  'change_this_to_a_long_random_string_at_least_32_chars',
  'dev-secret-change-me'
]);

function isBlank(value) {
  return String(value ?? '').trim() === '';
}

function isPlaceholder(value) {
  return placeholderValues.has(String(value ?? '').trim());
}

export function validateEnvironment(env = process.env) {
  const missing = [];
  const weak = [];
  const isProduction = env.NODE_ENV === 'production';

  for (const key of requiredBaseEnv) {
    if (isBlank(env[key])) missing.push(key);
  }

  if (isProduction) {
    for (const key of requiredProductionEnv) {
      if (isBlank(env[key])) missing.push(key);
    }
  }

  for (const key of [...requiredBaseEnv, ...requiredProductionEnv, 'RIOT_API_KEY', 'TFT_API_KEY']) {
    if (!isBlank(env[key]) && isPlaceholder(env[key])) weak.push(key);
  }

  if (!isBlank(env.SESSION_SECRET) && String(env.SESSION_SECRET).trim().length < 32) {
    weak.push('SESSION_SECRET');
  }

  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${[...new Set(missing)].join(', ')}`);
  }

  if (weak.length) {
    console.warn(`[env] Placeholder or weak environment value detected: ${[...new Set(weak)].join(', ')}. Rotate/set real secrets before production use.`);
  }

  if (isProduction && (isBlank(env.UPSTASH_REDIS_REST_URL) || isBlank(env.UPSTASH_REDIS_REST_TOKEN))) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production.');
  }
}
