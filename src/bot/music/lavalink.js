// ── Lavalink Client Wrapper ────────────────────────────────────────────────────
// Replaces discord-player + play-dl with Lavalink v4.
//
// Audio pipeline:
//   Bot (Node.js)  ──sendVoiceUpdate──►  Discord Gateway
//   Bot (Node.js)  ──REST/WS──────────►  Lavalink Server (Java)
//                                              ↓
//                                        youtube-source plugin
//                                        LavaSrc (Spotify / Apple / Deezer)
//
// Source priority (search fallback order):
//   1. Direct URL  →  detected automatically by Lavalink
//   2. ytsearch    →  YouTube via youtube-source plugin
//   3. scsearch    →  SoundCloud
//
// Environment variables required:
//   LAVALINK_HOST     — hostname or IP of Lavalink server (default: localhost)
//   LAVALINK_PORT     — port (default: 2333)
//   LAVALINK_PASSWORD — server password (default: youshallnotpass)
//   LAVALINK_SECURE   — "true" if using wss/https (default: false)

import { LavalinkManager } from 'lavalink-client';

/** @type {LavalinkManager | null} */
let _manager = null;

// ── Node configuration ────────────────────────────────────────────────────────

function buildNodeConfig() {
  return {
    host:     process.env.LAVALINK_HOST     ?? 'localhost',
    port:     Number(process.env.LAVALINK_PORT ?? 2333),
    authorization: process.env.LAVALINK_PASSWORD ?? 'youshallnotpass',
    secure:   process.env.LAVALINK_SECURE === 'true',
    id:       'main',
    retryAmount: 10,
    retryDelay:  5000,
  };
}

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Call once inside ClientReady.
 * @param {import('discord.js').Client} client
 * @returns {Promise<LavalinkManager>}
 */
export async function initLavalink(client) {
  if (_manager) return _manager;

  _manager = new LavalinkManager({
    nodes: [buildNodeConfig()],

    // Forward raw voice state / server events to Lavalink
    sendToShard: (guildId, payload) => {
      const guild = client.guilds.cache.get(guildId);
      if (guild?.shard) guild.shard.send(payload);
    },

    // Player defaults applied per-guild
    playerOptions: {
      // Leave voice channel after queue ends (ms to wait)
      leaveOnEnd:            true,
      leaveOnEndCooldown:    90_000,   // 90 s — enough time to queue another track
      // Leave voice channel when everyone leaves
      leaveOnEmpty:          true,
      leaveOnEmptyCooldown:  20_000,   // 20 s — survive brief disconnects
      // Don't destroy player just because the queue is empty for a moment
      selfDeaf: true,
      // Volume (0–200)
      defaultVolume: 80,
    },

    // Provide current user id to the manager
    client: {
      id:   client.user?.id,
      username: client.user?.username ?? 'Bot',
    },
  });

  // ── Manager events ─────────────────────────────────────────────────────────

  _manager.on('nodeConnect', (node) => {
    console.log(`[lavalink] Node "${node.id}" connected (${node.options.host}:${node.options.port})`);
  });

  _manager.on('nodeDisconnect', (node, reason) => {
    console.warn(`[lavalink] Node "${node.id}" disconnected — code ${reason?.code ?? '?'}, reason: ${reason?.reason ?? '?'}`);
  });

  _manager.on('nodeError', (node, error) => {
    console.error(`[lavalink] Node "${node.id}" error:`, error?.message ?? error);
  });

  _manager.on('nodeReconnecting', (node) => {
    console.log(`[lavalink] Node "${node.id}" reconnecting…`);
  });

  // ── Player events ──────────────────────────────────────────────────────────

  _manager.on('trackStart', (player, track) => {
    console.log(`[lavalink] trackStart: "${track.info.title}" | guild ${player.guildId}`);
    const ch = player.get('textChannel');
    ch?.send(`▶️ Bắt đầu phát: **${track.info.title}**`).catch(() => null);
  });

  _manager.on('trackEnd', (player, track, payload) => {
    console.log(`[lavalink] trackEnd: "${track.info.title}" | reason: ${payload.reason}`);
  });

  _manager.on('trackError', (player, track, payload) => {
    console.error(`[lavalink] trackError: "${track?.info?.title}" | ${payload?.exception?.message}`);
    const ch = player.get('textChannel');
    ch?.send(`⚠️ Lỗi phát nhạc: ${payload?.exception?.message ?? 'unknown error'}`).catch(() => null);
  });

  _manager.on('trackStuck', (player, track, payload) => {
    console.warn(`[lavalink] trackStuck: "${track.info.title}" | threshold ${payload.thresholdMs}ms — skipping`);
    player.skip().catch(() => null);
  });

  _manager.on('queueEnd', (player) => {
    console.log(`[lavalink] queueEnd | guild ${player.guildId}`);
    const ch = player.get('textChannel');
    ch?.send('📭 Hàng nhạc đã hết.').catch(() => null);
  });

  _manager.on('playerCreate', (player) => {
    console.log(`[lavalink] playerCreate | guild ${player.guildId}`);
  });

  _manager.on('playerDestroy', (player) => {
    console.log(`[lavalink] playerDestroy | guild ${player.guildId}`);
  });

  // ── Forward Discord voice events to Lavalink ───────────────────────────────
  // Must forward VOICE_STATE_UPDATE and VOICE_SERVER_UPDATE.
  // We register these listeners here; bot.js raw listener calls forwardVoiceEvent().

  // ── Init nodes ─────────────────────────────────────────────────────────────
  await _manager.init({
    id:       client.user.id,
    username: client.user.username,
  });

  console.log('[lavalink] Manager initialised. Connecting to node…');
  return _manager;
}

// ── Getters ───────────────────────────────────────────────────────────────────

/** Returns the LavalinkManager. Throws if initLavalink() hasn't been called. */
export function getLavalinkManager() {
  if (!_manager) throw new Error('[lavalink] Manager not initialised — call initLavalink() first');
  return _manager;
}

/**
 * Forward raw Discord gateway packets to the Lavalink manager.
 * Call this from bot.js raw event listener.
 * @param {{ t: string, d: object }} packet
 * @param {string} shardId
 */
export function forwardVoiceEvent(packet, shardId) {
  if (_manager && (packet.t === 'VOICE_STATE_UPDATE' || packet.t === 'VOICE_SERVER_UPDATE')) {
    _manager.sendRawData(packet.d, shardId).catch(() => null);
  }
}

// ── Source detection ──────────────────────────────────────────────────────────

/**
 * Given a user input string, return the Lavalink search query string.
 *
 * Lavalink v4 + youtube-source + LavaSrc accept:
 *   - Any https:// URL directly (YouTube, SoundCloud, Spotify, etc.)
 *   - "ytsearch:query"  — search YouTube
 *   - "scsearch:query"  — search SoundCloud
 *   - "ytmsearch:query" — search YouTube Music (if plugin enabled)
 *   - "spsearch:query"  — search Spotify (LavaSrc)
 *
 * Priority:
 *   URL → pass as-is (Lavalink auto-detects source)
 *   text → ytsearch first; music.js falls back to scsearch on error
 */
export function buildLavalinkQuery(input) {
  const trimmed = input.trim();

  // Direct URL — let Lavalink figure out the source
  if (/^https?:\/\//i.test(trimmed)) {
    return { query: trimmed, isUrl: true };
  }

  // Text search — start with YouTube
  return { query: `ytsearch:${trimmed}`, isUrl: false, searchTerm: trimmed };
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function sourceLabel(track) {
  const src = track?.info?.sourceName ?? '';
  if (src === 'youtube')     return '▶️ YouTube';
  if (src === 'soundcloud')  return '🔶 SoundCloud';
  if (src === 'spotify')     return '💚 Spotify';
  if (src === 'applemusic')  return '🍎 Apple Music';
  if (src === 'deezer')      return '🎵 Deezer';
  if (src === 'http')        return '🔗 Direct';
  return '🎵';
}

export function fmt(ms) {
  if (!ms || isNaN(ms)) return '?:??';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
