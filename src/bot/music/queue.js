// ── Music Queue ───────────────────────────────────────────────────────────────
// Per-guild in-memory state for the music player.

export class GuildMusicQueue {
  constructor(guildId) {
    this.guildId = guildId;
    /** @type {import('./resolver.js').Track[]} */
    this.tracks = [];          // upcoming tracks
    /** @type {import('./resolver.js').Track|null} */
    this.current = null;       // currently playing
    this.connection = null;    // VoiceConnection
    this.player = null;        // AudioPlayer
    this.textChannel = null;   // channel to send "now playing" messages
    this.loop = false;         // loop current track
    this.volume = 0.8;         // 0.0 – 1.0
  }

  enqueue(track) {
    this.tracks.push(track);
  }

  /** Pop the next track. Respects loop mode. */
  advance() {
    if (this.loop && this.current) return this.current;
    this.current = this.tracks.shift() ?? null;
    return this.current;
  }

  clear() {
    this.tracks = [];
    this.current = null;
  }

  get size() {
    return this.tracks.length + (this.current ? 1 : 0);
  }
}

// Global registry: guildId → GuildMusicQueue
const _queues = new Map();

export function getQueue(guildId) {
  if (!_queues.has(guildId)) _queues.set(guildId, new GuildMusicQueue(guildId));
  return _queues.get(guildId);
}

export function deleteQueue(guildId) {
  _queues.delete(guildId);
}
