// ── Lavalink Client Wrapper ────────────────────────────────────────────────────
// Audio pipeline:
//   Bot (Node.js)  ──sendVoiceUpdate──►  Discord Gateway
//   Bot (Node.js)  ──REST/WS──────────►  Lavalink Server (Java)
//                                              ↓
//                                        youtube-source plugin
//                                        LavaSrc (Spotify / Apple / Deezer)
//
// Environment variables:
//   LAVALINK_HOST      — hostname (default: localhost)
//   LAVALINK_PORT      — port     (default: 2333)
//   LAVALINK_PASSWORD  — password (default: youshallnotpass)
//   LAVALINK_SECURE    — "true" for wss/https (default: false)
//
// Public nodes for testing (no self-host needed):
//   Host: lavalink.darrennathanael.com  Port: 80  Password: LL.darrennathanael.com  Secure: false

import { LavalinkManager } from 'lavalink-client';

/** @type {LavalinkManager | null} */
let _manager = null;

// ── Node config ───────────────────────────────────────────────────────────────

function buildNodeConfig() {
  return {
    host:          process.env.LAVALINK_HOST     ?? 'localhost',
    port:          Number(process.env.LAVALINK_PORT ?? 2333),
    authorization: process.env.LAVALINK_PASSWORD ?? 'youshallnotpass',
    secure:        process.env.LAVALINK_SECURE === 'true',
    id:            'main',
    retryAmount:   20,      // keep retrying indefinitely while bot is alive
    retryDelay:    10_000,  // 10 s between retries
  };
}

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Call once inside ClientReady.
 * Never throws — connection failures are logged and retried in background.
 * @param {import('discord.js').Client} client
 * @returns {Promise<LavalinkManager>}
 */
export async function initLavalink(client) {
  if (_manager) return _manager;

  _manager = new LavalinkManager({
    nodes: [buildNodeConfig()],

    // Forward raw voice state/server events to Lavalink
    sendToShard: (guildId, payload) => {
      const guild = client.guilds.cache.get(guildId);
      if (guild?.shard) guild.shard.send(payload);
    },

    client: {
      id:       client.user?.id,
      username: client.user?.username ?? 'Bot',
    },

    playerOptions: {
      leaveOnEnd:           true,
      leaveOnEndCooldown:   90_000,  // 90 s — time to queue next track
      leaveOnEmpty:         true,
      leaveOnEmptyCooldown: 20_000,  // 20 s — survive brief disconnects
      selfDeaf:             true,
      defaultVolume:        80,
    },
  });

  // ── Node events ────────────────────────────────────────────────────────────

  _manager.on('nodeConnect', (node) => {
    console.log(`[lavalink] ✅ Node "${node.id}" connected → ${node.options.host}:${node.options.port}`);
  });

  _manager.on('nodeDisconnect', (node, reason) => {
    console.warn(`[lavalink] ⚠️ Node "${node.id}" disconnected — code ${reason?.code ?? '?'} | will retry every 10 s`);
  });

  _manager.on('nodeError', (node, error) => {
    // Log but DO NOT rethrow — prevents unhandled rejection from killing the process
    console.error(`[lavalink] ❌ Node "${node.id}" error: ${error?.message ?? error}`);
  });

  _manager.on('nodeReconnecting', (node) => {
    console.log(`[lavalink] 🔄 Node "${node.id}" reconnecting…`);
  });

  _manager.on('nodeDestroy', (node, destroyReason) => {
    console.warn(`[lavalink] 💀 Node "${node.id}" destroyed — reason: ${destroyReason ?? 'unknown'}`);
  });

  // ── Player events ──────────────────────────────────────────────────────────

  _manager.on('trackStart', (player, track) => {
    console.log(`[lavalink] ▶️ trackStart: "${track.info.title}" | guild ${player.guildId}`);
    const ch = player.get('textChannel');
    ch?.send(`▶️ Bắt đầu phát: **${track.info.title}**`).catch(() => null);
  });

  _manager.on('trackEnd', (player, track, payload) => {
    console.log(`[lavalink] ⏹ trackEnd: "${track.info.title}" | reason: ${payload.reason}`);
  });

  _manager.on('trackError', (player, track, payload) => {
    console.error(`[lavalink] ❌ trackError: "${track?.info?.title}" | ${payload?.exception?.message}`);
    const ch = player.get('textChannel');
    ch?.send(`⚠️ Lỗi phát nhạc: ${payload?.exception?.message ?? 'unknown error'}`).catch(() => null);
    // Auto-skip to next track
    player.skip().catch(() => null);
  });

  _manager.on('trackStuck', (player, track, payload) => {
    console.warn(`[lavalink] ⚠️ trackStuck: "${track.info.title}" | ${payload.thresholdMs}ms — skipping`);
    player.skip().catch(() => null);
  });

  _manager.on('queueEnd', (player) => {
    console.log(`[lavalink] 📭 queueEnd | guild ${player.guildId}`);
    const ch = player.get('textChannel');
    ch?.send('📭 Hàng nhạc đã hết.').catch(() => null);
  });

  _manager.on('playerCreate', (player) => {
    console.log(`[lavalink] playerCreate | guild ${player.guildId}`);
  });

  _manager.on('playerDestroy', (player) => {
    console.log(`[lavalink] playerDestroy | guild ${player.guildId}`);
  });

  // ── manager-level error catch ─────────────────────────────────────────────
  _manager.on('error', (err) => {
    console.error('[lavalink] manager error (caught):', err?.message ?? err);
  });

  // ── Init manager ───────────────────────────────────────────────────────────
  try {
    await _manager.init({
      id:       client.user.id,
      username: client.user.username,
    });
    console.log('[lavalink] Manager initialised. Connecting to node…');
  } catch (err) {
    console.error('[lavalink] Initial node connection failed (will retry):', err?.message ?? err);
  }

  // ── Patch NodeManager emitter — nguồn gốc crash ERR_UNHANDLED_ERROR ────────
  // lavalink-client v2 emit 'error' lên nodeManager (EventEmitter nội bộ).
  // Nếu nodeManager không có listener 'error', Node.js throw và kill process.
  // Phải patch SAU khi _manager.init() vì nodeManager chỉ tồn tại sau đó.
  try {
    const nm = _manager.nodeManager;
    if (nm && typeof nm.on === 'function' && nm.listenerCount('error') === 0) {
      nm.on('error', (err) => {
        // lavalink-client đôi khi emit AsyncFunction object thay vì Error — bỏ qua
        if (typeof err === 'function') return;
        console.error('[lavalink] nodeManager error (caught):', err?.message ?? err);
      });
    }
  } catch (_) {}

  return _manager;
}

// ── Getters ───────────────────────────────────────────────────────────────────

/**
 * Returns the LavalinkManager.
 * Returns null if initLavalink() hasn't been called yet — callers must handle null.
 */
export function getLavalinkManager() {
  return _manager;
}

/**
 * Forward raw Discord gateway packets to Lavalink.
 * Call from bot.js raw event listener.
 */
export function forwardVoiceEvent(packet, shardId) {
  if (_manager && (packet.t === 'VOICE_STATE_UPDATE' || packet.t === 'VOICE_SERVER_UPDATE')) {
    _manager.sendRawData(packet.d, shardId).catch(() => null);
  }
}

// ── Source detection ──────────────────────────────────────────────────────────

/**
 * Build Lavalink search query from user input.
 * Priority: direct URL → ytsearch (fallback to scsearch handled in music.js)
 */
export function buildLavalinkQuery(input) {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return { query: trimmed, isUrl: true };
  }
  return { query: `ytsearch:${trimmed}`, isUrl: false, searchTerm: trimmed };
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function sourceLabel(track) {
  const src = track?.info?.sourceName ?? '';
  if (src === 'youtube')    return '▶️ YouTube';
  if (src === 'soundcloud') return '🔶 SoundCloud';
  if (src === 'spotify')    return '💚 Spotify';
  if (src === 'applemusic') return '🍎 Apple Music';
  if (src === 'deezer')     return '🎵 Deezer';
  if (src === 'http')       return '🔗 Direct';
  return '🎵';
}

export function fmt(ms) {
  if (!ms || isNaN(ms)) return '?:??';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
