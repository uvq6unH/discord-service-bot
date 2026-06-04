// ── Music Resolver (discord-player backend) ───────────────────────────────────
// Thin wrapper around discord-player's Player so the rest of the codebase
// keeps the same import surface: resolveTrack / createAudioStream / getQueue.
//
// SOURCE STRATEGY (no YouTube scraping):
//   1. SoundCloud  — free, no auth, stable API  ← primary search source
//   2. Spotify     — metadata only via oEmbed → re-search on SoundCloud
//   3. Direct URL  — any https:// audio link
//
// discord-player handles voice connection + queue internally per guild.

import { Player, useMainPlayer, useQueue } from 'discord-player';
import { DefaultExtractors } from '@discord-player/extractor';
import { createRequire } from 'module';

// ── FFmpeg bootstrap ──────────────────────────────────────────────────────────
// discord-player needs ffmpeg to transcode audio. ffmpeg-static bundles a
// static binary but discord-player won't find it automatically — we must set
// process.env.FFMPEG_PATH before constructing the Player.
//
// Resolution order:
//   1. FFMPEG_PATH env var (explicit override — set this in Render dashboard)
//   2. ffmpeg-static bundled binary  ← installed as a dep
//   3. system ffmpeg on PATH (Render doesn't have this on free tier)

// ── Opus / audio encoder check ───────────────────────────────────────────────
// Log which encoder is available so we can diagnose "joins but no audio" issues.
// discord-player v7 prefers: mediaplex > @discordjs/opus > opusscript
{
  const _req = createRequire(import.meta.url);
  const encoders = ['mediaplex', '@discordjs/opus', 'opusscript'];
  let found = false;
  for (const enc of encoders) {
    try {
      _req(enc);
      console.log('[music] opus encoder available:', enc);
      found = true;
      break;
    } catch { /* not installed */ }
  }
  if (!found) console.error('[music] ⚠️ NO OPUS ENCODER FOUND — audio will not work! Install mediaplex.');
}

if (!process.env.FFMPEG_PATH) {
  try {
    const _require = createRequire(import.meta.url);
    const ffmpegPath = _require('ffmpeg-static');
    if (ffmpegPath) {
      process.env.FFMPEG_PATH = ffmpegPath;
      console.log('[music] ffmpeg-static registered:', ffmpegPath);
    }
  } catch {
    console.warn('[music] ffmpeg-static not found — relying on system ffmpeg or FFMPEG_PATH env');
  }
}

// ── Player singleton ──────────────────────────────────────────────────────────

let _player = null;

/**
 * Call once at bot startup with the Discord.js Client.
 * Loads extractors (SoundCloud, Vimeo, direct attachments, etc.)
 * @param {import('discord.js').Client} client
 */
export async function initMusicPlayer(client) {
  if (_player) return _player;

  _player = new Player(client, {
    skipFFmpeg: false,
    connectionTimeout: 15000,
  });

  // Verify ffmpeg binary is actually executable on this host
  try {
    const { spawnSync } = await import('child_process');
    const ffmpegBin = process.env.FFMPEG_PATH ?? 'ffmpeg';
    const probe = spawnSync(ffmpegBin, ['-version'], { timeout: 5000, encoding: 'utf8' });
    if (probe.status === 0) {
      console.log('[music] ffmpeg OK:', probe.stdout.split('\n')[0]);
    } else {
      console.error('[music] ⚠️ ffmpeg binary not working! stderr:', probe.stderr?.slice(0, 200));
    }
  } catch (e) {
    console.error('[music] ⚠️ ffmpeg probe failed:', e.message);
  }

  // Load all built-in extractors.
  // SoundCloud extractor works without credentials.
  // YouTube extractor is included but will be skipped if bot-detection fires.
  await _player.extractors.loadMulti(DefaultExtractors);

  _player.events.on('playerError', (queue, error) => {
    console.error('[discord-player] playerError:', error?.message, error?.stack);
    queue.metadata?.textChannel
      ?.send(`⚠️ Lỗi phát nhạc: ${error.message}`)
      .catch(() => null);
  });

  _player.events.on('error', (queue, error) => {
    console.error('[discord-player] error:', error?.message, error?.stack);
    queue.metadata?.textChannel
      ?.send(`⚠️ Stream error: ${error?.message}`)
      .catch(() => null);
  });

  _player.events.on('audioTrackAdd', (queue, track) => {
    console.log('[discord-player] track added:', track.title, '| extractor:', track.extractor?.identifier ?? track.extractor);
  });

  _player.events.on('playerStart', (queue, track) => {
    console.log('[discord-player] playerStart:', track.title);
    queue.metadata?.textChannel
      ?.send(`▶️ Bắt đầu phát: **${track.title}**`)
      .catch(() => null);
  });

  _player.events.on('emptyChannel', (queue) => {
    console.log('[discord-player] emptyChannel — leaving');
  });

  _player.events.on('emptyQueue', (queue) => {
    console.log('[discord-player] emptyQueue | tracks played:', queue.history?.tracks?.size ?? '?');
  });

  // Log khi stream thực sự bắt đầu đọc data
  _player.events.on('playerFinish', (queue, track) => {
    console.log('[discord-player] playerFinish:', track?.title, '| duration:', track?.duration);
  });

  console.log('[music] discord-player ready, extractors:',
    _player.extractors.store.map(e => e.identifier).join(', '));

  return _player;
}

export function getMusicPlayer() {
  return _player ?? useMainPlayer();
}

// ── fmt helper (re-exported for embeds) ──────────────────────────────────────

export function fmt(sec) {
  if (!sec || isNaN(sec)) return '?:??';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Spotify oEmbed title fetch ────────────────────────────────────────────────

async function spotifyTitle(url) {
  const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`Spotify oEmbed ${res.status}`);
  return (await res.json()).title;
}

// ── YouTube oEmbed title fetch ────────────────────────────────────────────────
// Uses YouTube's public oEmbed endpoint — no scraping, no auth.
// Returns null on failure (private/age-gated/deleted videos).

async function youtubeTitle(url) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    return (await res.json()).title ?? null;
  } catch {
    return null;
  }
}

// ── detectSource ──────────────────────────────────────────────────────────────

export function detectSource(input) {
  if (/youtu\.be|youtube\.com/i.test(input)) return 'youtube';
  if (/spotify\.com\/track\//i.test(input)) return 'spotify';
  if (/soundcloud\.com\//i.test(input)) return 'soundcloud';
  if (/^https?:\/\//i.test(input)) return 'direct';
  return 'search';
}

// ── buildSearchQuery ──────────────────────────────────────────────────────────
// Converts any user input into a query string discord-player can search.
//
// YouTube URLs: pass direct URL first; also pre-fetch the video title via oEmbed
//   so music.js can SoundCloud-fallback without an extra HTTP call if blocked.
// Spotify URLs: resolve title via oEmbed → SoundCloud search.

export async function buildSearchQuery(input) {
  const source = detectSource(input.trim());

  if (source === 'spotify') {
    try {
      const title = await spotifyTitle(input.trim());
      return { query: title, source: 'spotify', originalUrl: input.trim() };
    } catch {
      return { query: input.trim(), source: 'spotify', originalUrl: input.trim() };
    }
  }

  if (source === 'youtube') {
    const fallbackTitle = await youtubeTitle(input.trim()); // null if unavailable
    return { query: input.trim(), source: 'youtube', originalUrl: input.trim(), fallbackTitle };
  }

  return { query: input.trim(), source, originalUrl: input.trim() };
}
