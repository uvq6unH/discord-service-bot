// ── Music Resolver ────────────────────────────────────────────────────────────
// Resolves a user-provided string (URL or search query) into a playable Track,
// and creates an audio stream for @discordjs/voice.
//
// Supported sources:
//   • YouTube  – direct URL or search query
//   • Spotify  – track URL (metadata via oEmbed → search on YouTube)
//   • SoundCloud – direct URL
//   • Direct URL – any https:// link (audio file, livestream, etc.)
//
// ffmpeg-static provides the FFmpeg binary so no system package is needed.

import playdl from 'play-dl';

// Set FFMPEG_PATH from ffmpeg-static as early as possible so prism-media picks it up.
// This is done lazily to avoid import-time failures if the package isn't installed yet.
let _ffmpegInitialized = false;
async function ensureFfmpeg() {
  if (_ffmpegInitialized) return;
  try {
    const { default: ffmpegPath } = await import('ffmpeg-static');
    if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;
    _ffmpegInitialized = true;
    console.log('[music] ffmpeg-static path:', ffmpegPath);
  } catch {
    console.warn('[music] ffmpeg-static not found — falling back to system ffmpeg');
    _ffmpegInitialized = true;
  }
}

/**
 * @typedef {Object} Track
 * @property {string} title
 * @property {string} url           - playable URL (always a YouTube/SC/direct link)
 * @property {number} duration      - seconds (0 if unknown)
 * @property {string} durationFmt   - human-readable "m:ss"
 * @property {string|null} thumbnail
 * @property {'youtube'|'spotify'|'soundcloud'|'direct'} source
 * @property {string} requestedBy   - Discord user ID
 */

/** Normalize a YouTube URL — ensures it is always a full https:// URL.
 *  play-dl's video_details.url can occasionally be a relative path or bare video ID. */
function normalizeYouTubeUrl(url, fallbackInput) {
  if (!url && fallbackInput) return fallbackInput; // keep original input as last resort
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;           // already absolute
  if (url.startsWith('/')) return `https://www.youtube.com${url}`; // relative path
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return `https://www.youtube.com/watch?v=${url.trim()}`; // bare ID
  return url;
}

/** Detect source type from input string */
function detectSource(input) {
  if (/youtu\.be|youtube\.com/i.test(input)) return 'youtube';
  if (/spotify\.com\/track\//i.test(input)) return 'spotify';
  if (/soundcloud\.com\//i.test(input)) return 'soundcloud';
  if (/^https?:\/\//i.test(input)) return 'direct';
  return 'search';
}

/** Format seconds → "m:ss" */
function fmt(sec) {
  if (!sec || isNaN(sec)) return '?:??';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Fetch Spotify track title+artist using public oEmbed (no credentials needed) */
async function spotifyTitle(url) {
  const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`Spotify oEmbed failed: ${res.status}`);
  const data = await res.json();
  return data.title; // e.g. "Blinding Lights - The Weeknd"
}

/**
 * Resolve a user input string into a Track object.
 * Throws if resolution fails.
 * @param {string} input
 * @returns {Promise<Track>}
 */
export async function resolveTrack(input) {
  const source = detectSource(input.trim());

  // ── YouTube ──────────────────────────────────────────────────────────────
  if (source === 'youtube') {
    const info = await playdl.video_info(input);
    const v = info.video_details;
    const resolvedUrl = normalizeYouTubeUrl(v.url, input);
    if (!resolvedUrl) throw new Error('play-dl trả về URL trống cho video này');
    return {
      title: v.title ?? 'Unknown',
      url: resolvedUrl,
      duration: v.durationInSec ?? 0,
      durationFmt: fmt(v.durationInSec),
      thumbnail: v.thumbnails?.[0]?.url ?? null,
      source: 'youtube',
      requestedBy: ''
    };
  }

  // ── Spotify (resolve to YouTube) ─────────────────────────────────────────
  if (source === 'spotify') {
    let searchQuery;
    try {
      searchQuery = await spotifyTitle(input);
    } catch {
      // Fallback: extract path segment as query
      const m = input.match(/track\/([A-Za-z0-9]+)/);
      searchQuery = m ? m[1] : input;
    }

    const results = await playdl.search(searchQuery, { source: { youtube: 'video' }, limit: 1 });
    if (!results.length) throw new Error('Không tìm thấy bài hát trên YouTube');
    const v = results[0];
    const resolvedUrl = normalizeYouTubeUrl(v.url);
    if (!resolvedUrl) throw new Error(`play-dl trả về URL trống cho "${searchQuery}"`);
    return {
      title: searchQuery,            // Spotify title is more accurate
      url: resolvedUrl,
      duration: v.durationInSec ?? 0,
      durationFmt: fmt(v.durationInSec),
      thumbnail: v.thumbnails?.[0]?.url ?? null,
      source: 'spotify',
      requestedBy: ''
    };
  }

  // ── SoundCloud ───────────────────────────────────────────────────────────
  if (source === 'soundcloud') {
    const sc = await playdl.soundcloud(input);
    const durSec = Math.floor((sc.durationInMs ?? 0) / 1000);
    return {
      title: sc.name ?? 'SoundCloud track',
      url: sc.url,
      duration: durSec,
      durationFmt: fmt(durSec),
      thumbnail: sc.thumbnail ?? null,
      source: 'soundcloud',
      requestedBy: ''
    };
  }

  // ── Direct URL ───────────────────────────────────────────────────────────
  if (source === 'direct') {
    const name = decodeURIComponent(input.split('/').pop()?.split('?')[0] ?? 'audio');
    return {
      title: name,
      url: input,
      duration: 0,
      durationFmt: 'Live',
      thumbnail: null,
      source: 'direct',
      requestedBy: ''
    };
  }

  // ── Search query (YouTube) ───────────────────────────────────────────────
  const results = await playdl.search(input, { source: { youtube: 'video' }, limit: 1 });
  if (!results.length) throw new Error('Không tìm thấy kết quả nào');
  const v = results[0];
  const resolvedUrl = normalizeYouTubeUrl(v.url);
  if (!resolvedUrl) throw new Error(`play-dl trả về URL trống cho "${input}"`);
  return {
    title: v.title ?? input,
    url: resolvedUrl,
    duration: v.durationInSec ?? 0,
    durationFmt: fmt(v.durationInSec),
    thumbnail: v.thumbnails?.[0]?.url ?? null,
    source: 'youtube',
    requestedBy: ''
  };
}

/**
 * Create a streamable audio source for a resolved Track.
 * Returns { stream, type } compatible with @discordjs/voice createAudioResource.
 * @param {Track} track
 */
export async function createAudioStream(track) {
  await ensureFfmpeg();

  // Guard: validate URL before passing to play-dl — prevents "Invalid URL" crashes
  if (!track.url || !/^https?:\/\//i.test(track.url)) {
    throw new Error(`URL không hợp lệ: "${track.url ?? '(trống)'}"`);
  }

  if (track.source === 'soundcloud') {
    const sc = await playdl.soundcloud(track.url);
    return await playdl.stream_from_info(sc, { quality: 2 });
  }

  if (track.source === 'direct') {
    // Let ffmpeg handle arbitrary audio URLs
    const streamInfo = await playdl.stream(track.url, { quality: 2 }).catch(async () => {
      // play-dl may refuse non-YT; fall through to raw fetch
      const res = await fetch(track.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { stream: res.body, type: 'arbitrary' };
    });
    return streamInfo;
  }

  // YouTube (covers both 'youtube' and 'spotify' which resolved to YT URL)
  return await playdl.stream(track.url, { quality: 2 });
}

export { fmt };