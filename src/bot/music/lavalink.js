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

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { LavalinkManager } from 'lavalink-client';

/** @type {LavalinkManager | null} */
let _manager = null;

// ── Node config ───────────────────────────────────────────────────────────────

function buildNodeConfigs() {
  const nodes = [];

  const envHost = process.env.LAVALINK_HOST;
  if (envHost && envHost !== 'localhost') {
    nodes.push({
      id: 'main',
      host: envHost,
      port: Number(process.env.LAVALINK_PORT ?? (process.env.LAVALINK_SECURE === 'true' ? 443 : 2333)),
      authorization: process.env.LAVALINK_PASSWORD ?? 'youshallnotpass',
      secure: process.env.LAVALINK_SECURE === 'true',
      retryAmount: 5,
      retryDelay: 10_000,
    });
  } else {
    nodes.push({
      id: 'local',
      host: 'localhost',
      port: Number(process.env.LAVALINK_PORT ?? 2333),
      authorization: process.env.LAVALINK_PASSWORD ?? 'youshallnotpass',
      secure: false,
      retryAmount: 3,
      retryDelay: 5_000,
    });
  }

  // Fallback public Lavalink v4 nodes (ensures music stays active if primary returns 403 or drops)
  nodes.push({
    id: 'public-darren',
    host: 'lavalink.darrennathanael.com',
    port: 443,
    authorization: 'LL.darrennathanael.com',
    secure: true,
    retryAmount: 5,
    retryDelay: 10_000,
  });

  nodes.push({
    id: 'public-jirayu',
    host: 'lavalink.jirayu.net',
    port: 13592,
    authorization: 'youshallnotpass',
    secure: false,
    retryAmount: 5,
    retryDelay: 10_000,
  });

  return nodes;
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
    nodes: buildNodeConfigs(),

    // Forward raw voice state/server events to Lavalink
    sendToShard: (guildId, payload) => {
      const guild = client.guilds.cache.get(guildId);
      if (guild?.shard) guild.shard.send(payload);
    },

    client: {
      id: client.user?.id,
      username: client.user?.username ?? 'Bot',
    },

    playerOptions: {
      leaveOnEnd: true,
      leaveOnEndCooldown: 90_000,  // 90 s — time to queue next track
      leaveOnEmpty: true,
      leaveOnEmptyCooldown: 20_000,  // 20 s — survive brief disconnects
      selfDeaf: true,
      defaultVolume: 80,
    },
  });

  // ── Node events on NodeManager ─────────────────────────────────────────────

  _manager.nodeManager.on('connect', (node) => {
    console.log(`[lavalink] ✅ Node "${node.id}" connected → ${node.options.host}:${node.options.port}`);
  });

  _manager.nodeManager.on('disconnect', (node, reason) => {
    console.warn(`[lavalink] ⚠️ Node "${node.id}" disconnected — code ${reason?.code ?? '?'} | will retry every 10 s`);
  });

  _manager.nodeManager.on('error', (node, error) => {
    // lavalink-client v2 sometimes emits weird function objects as errors — ignore or handle safely
    if (error == null || typeof error === 'function' || typeof error?.message === 'function') return;
    // Log but DO NOT rethrow — prevents unhandled rejection from killing the process
    console.error(`[lavalink] ❌ Node "${node.id}" error: ${error?.message ?? error}`);
  });

  _manager.nodeManager.on('reconnecting', (node) => {
    console.log(`[lavalink] 🔄 Node "${node.id}" reconnecting…`);
  });

  _manager.nodeManager.on('destroy', (node, destroyReason) => {
    console.warn(`[lavalink] 💀 Node "${node.id}" destroyed — reason: ${destroyReason ?? 'unknown'}`);
  });

  // ── Player events ──────────────────────────────────────────────────────────

  _manager.on('trackStart', (player, track) => {
    console.log(`[lavalink] ▶️ trackStart: "${track.info.title}" | guild ${player.guildId}`);
    const ch = player.get('textChannel');
    ch?.send(`▶️ Bắt đầu phát: **${track.info.title}**`).catch(() => null);

    // Persist queue to Redis (TTL 2h)
    const stateStore = client._stateStore;
    if (stateStore && player.guildId) {
      const queueData = {
        current: { title: track.info.title, uri: track.info.uri, author: track.info.author, duration: track.info.duration },
        tracks: (player.queue.tracks || []).map(t => ({ title: t.info?.title, uri: t.info?.uri, author: t.info?.author, duration: t.info?.duration })),
        updatedAt: new Date().toISOString()
      };
      stateStore.saveMusicQueue(player.guildId, queueData).catch(() => null);
    }
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

  _manager.on('queueEnd', async (player) => {
    console.log(`[lavalink] 📭 queueEnd | guild ${player.guildId}`);
    const stateStore = client._stateStore;
    if (stateStore && player.guildId) {
      stateStore.clearMusicQueue(player.guildId).catch(() => null);
    }
    const isAutoplay = player.get('autoplay') ?? true;
    if (isAutoplay && player.queue.previous?.length > 0) {
      const lastTrack = player.queue.previous[player.queue.previous.length - 1];
      const author = lastTrack?.info?.author ?? '';
      const title = lastTrack?.info?.title ?? '';

      if (author || title) {
        try {
          const searchQuery = `ytsearch:${author} ${title} audio`;
          console.log(`[lavalink] 📻 Auto-Play triggering search for "${searchQuery}"...`);
          const res = await player.search({ query: searchQuery }, lastTrack.requester);
          if (res?.tracks?.length > 0) {
            const nextTrack = res.tracks.find(t => t.info.identifier !== lastTrack.info.identifier) ?? res.tracks[0];
            player.queue.add(nextTrack);
            const ch = player.get('textChannel');
            ch?.send(`📻 **Auto-Play (Radio Mode):** Tự động phát bài liên quan tiếp theo: **[${nextTrack.info.title}](${nextTrack.info.uri})**`).catch(() => null);
            await player.play();
            return;
          }
        } catch (err) {
          console.error('[lavalink] Auto-Play search error:', err.message);
        }
      }
    }
    const ch = player.get('textChannel');
    ch?.send('📭 Hàng nhạc đã hết.').catch(() => null);
  });

  _manager.on('playerCreate', (player) => {
    console.log(`[lavalink] playerCreate | guild ${player.guildId}`);
    player.set('autoplay', true); // Mặc định tự động phát nhạc liên quan
  });

  _manager.on('playerDestroy', (player) => {
    console.log(`[lavalink] playerDestroy | guild ${player.guildId}`);
    const stateStore = client._stateStore;
    if (stateStore && player.guildId) {
      stateStore.clearMusicQueue(player.guildId).catch(() => null);
    }
  });

  // ── manager-level error catch ─────────────────────────────────────────────
  _manager.on('error', (err) => {
    console.error('[lavalink] manager error (caught):', err?.message ?? err);
  });

  // ── Init manager ───────────────────────────────────────────────────────────
  try {
    await _manager.init({
      id: client.user.id,
      username: client.user.username,
    });
    console.log('[lavalink] Manager initialised. Connecting to node…');
  } catch (err) {
    console.error('[lavalink] Initial node connection failed (will retry):', err?.message ?? err);
  }

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
    _manager.sendRawData(packet).catch(() => null);
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
  if (src === 'youtube') return '▶️ YouTube';
  if (src === 'soundcloud') return '🔶 SoundCloud';
  if (src === 'spotify') return '💚 Spotify';
  if (src === 'applemusic') return '🍎 Apple Music';
  if (src === 'deezer') return '🎵 Deezer';
  if (src === 'http') return '🔗 Direct';
  return '🎵';
}

export function fmt(msOrTrack) {
  let ms = msOrTrack;
  if (typeof msOrTrack === 'object' && msOrTrack !== null) {
    const info = msOrTrack.info ?? msOrTrack;
    ms = info.duration ?? info.length ?? msOrTrack.duration ?? 0;
  }
  const num = Number(ms);
  if (!num || isNaN(num) || num <= 0) return '?:??';
  const total = Math.floor(num / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
  * Tạo ActionRow chứa các nút bấm tương tác phát nhạc (Pause, Skip, Stop, Shuffle, Auto-Play)
  * @param {import('lavalink-client').Player} [player]
  */
export function buildMusicControlRow(player) {
  const isPaused = player?.paused ?? false;
  const isAutoplay = player?.get('autoplay') ?? true;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music:control:pause_resume')
      .setLabel(isPaused ? '▶️ Tiếp tục' : '⏸️ Tạm dừng')
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music:control:skip')
      .setLabel('⏭️ Bỏ qua')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music:control:stop')
      .setLabel('⏹️ Dừng')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('music:control:shuffle')
      .setLabel('🔀 Trộn bài')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music:control:autoplay')
      .setLabel(isAutoplay ? '📻 Radio: ON' : '📻 Radio: OFF')
      .setStyle(isAutoplay ? ButtonStyle.Success : ButtonStyle.Secondary)
  );
}