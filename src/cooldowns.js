const defaultCooldownMs = Number.parseInt(process.env.COMMAND_COOLDOWN_MS, 10) || 3_000;
const riotCooldownMs = Number.parseInt(process.env.RIOT_COMMAND_COOLDOWN_MS, 10) || 15_000;
const gameCooldownMs = Number.parseInt(process.env.GAME_COMMAND_COOLDOWN_MS, 10) || 5_000;
const cleanupIntervalMs = 60_000;

const riotCommandTypes = new Set([
  'lsd', 'lolprofile', 'lolmatch', 'lolchamp', 'lolitem', 'lolrunes', 'lolpatch', 'lollink', 'lolunlink',
  'tftlsd', 'tftprofile', 'tftmatch', 'tftlink', 'tftunlink'
]);
const gameCommandTypes = new Set(['blackjack', 'poker', 'coinflip', 'dice', 'slots']);
const adminCommandTypes = new Set(['purge', 'say', 'announce', 'warn', 'kick', 'ban', 'timeout', 'ecoadd', 'ecoset', 'ecoremove']);

export class CommandCooldowns {
  constructor() {
    this.entries = new Map();
    this.cleanup = setInterval(() => this.prune(), cleanupIntervalMs);
    this.cleanup.unref?.();
  }

  cooldownFor(commandType) {
    if (riotCommandTypes.has(commandType)) return riotCooldownMs;
    if (gameCommandTypes.has(commandType)) return gameCooldownMs;
    if (adminCommandTypes.has(commandType)) return Math.min(defaultCooldownMs, 2_000);
    return defaultCooldownMs;
  }

  check({ guildId, userId, commandType, bypass = false }) {
    if (bypass) return { allowed: true, retryAfterMs: 0 };
    const cooldownMs = this.cooldownFor(commandType);
    if (cooldownMs <= 0) return { allowed: true, retryAfterMs: 0 };

    const now = Date.now();
    const key = `${guildId}:${userId}:${commandType}`;
    const nextAllowedAt = this.entries.get(key) ?? 0;
    if (nextAllowedAt > now) {
      return { allowed: false, retryAfterMs: nextAllowedAt - now };
    }

    this.entries.set(key, now + cooldownMs);
    return { allowed: true, retryAfterMs: 0 };
  }

  prune() {
    const now = Date.now();
    for (const [key, nextAllowedAt] of this.entries.entries()) {
      if (nextAllowedAt <= now) this.entries.delete(key);
    }
  }
}

export function formatRetryAfter(ms) {
  return `${Math.max(1, Math.ceil(ms / 1000))}s`;
}
