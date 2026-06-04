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
// This file re-exports helpers so music.js can stay mostly unchanged.

import { Player, useMainPlayer, useQueue } from 'discord-player';
import { DefaultExtractors } from '@discord-player/extractor';

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
  });

  // Load all built-in extractors.
  // SoundCloud extractor is included and works without credentials.
  // YouTube extractor is included but skipped if bot-detection fires.
  await _player.extractors.loadMulti(DefaultExtractors);

  _player.events.on('playerError', (queue, error) => {
    console.error('[discord-player] playerError:', error.message);
    queue.metadata?.textChannel
      ?.send(`⚠️ Lỗi phát nhạc: ${error.message}`)
      .catch(() => null);
  });

  _player.events.on('error', (queue, error) => {
    console.error('[discord-player] error:', error.message);
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
// For YouTube URLs we still attempt them (discord-player may succeed on some
// regions/IPs); Spotify is converted to a title search on SoundCloud.

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

  return { query: input.trim(), source, originalUrl: input.trim() };
}