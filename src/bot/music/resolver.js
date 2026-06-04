// ── Music Resolver ────────────────────────────────────────────────────────────
// Resolves a user-provided string (URL or search query) into a playable Track,
// and creates an audio stream for @discordjs/voice.
//
// Supported sources:
//   • YouTube  – direct URL or search query  (via yt-dlp)
//   • Spotify  – track URL (metadata via oEmbed → search on YouTube via yt-dlp)
//   • SoundCloud – direct URL                (via play-dl, unchanged)
//   • Direct URL – any https:// link         (via play-dl/fetch, unchanged)
//
// WHY yt-dlp FOR YOUTUBE:
//   YouTube now requires "Sign in to confirm you're not a bot" for unauthenticated
//   server-side requests. play-dl's YouTube backend is blocked on hosting IPs.
//   yt-dlp is updated continuously to bypass these restrictions and supports
//   --cookies-from-browser / cookie files for authenticated extraction.
//
// SETUP (one-time, see README section "Music – YouTube Setup"):
//   1. Install yt-dlp:  pip install -U yt-dlp   (or use prebuilt binary)
//   2. Set env var YTDLP_PATH if yt-dlp is not on PATH (optional)
//   3. Optionally set YTDLP_COOKIES_FILE=/path/to/cookies.txt for auth

import { spawn, spawnSync } from 'child_process';
import { Readable } from 'stream';
import playdl from 'play-dl';

// ── yt-dlp binary resolution ─────────────────────────────────────────────────

let _ytdlpBin = null;
function getYtdlpBin() {
  if (_ytdlpBin) return _ytdlpBin;
  const candidates = [
    process.env.YTDLP_PATH,
    'yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
  ].filter(Boolean);

  for (const bin of candidates) {
    try {
      const r = spawnSync(bin, ['--version'], { timeout: 5000 });
      if (r.status === 0) {
        _ytdlpBin = bin;
        console.log(`[music] yt-dlp found: ${bin} (${r.stdout.toString().trim()})`);
        return _ytdlpBin;
      }
    } catch { /* try next */ }
  }
  throw new Error(
    'yt-dlp không tìm thấy. Cài bằng: pip install -U yt-dlp\n' +
    'Hoặc đặt YTDLP_PATH=/đường/dẫn/yt-dlp trong env.'
  );
}

// ── ffmpeg-static setup ───────────────────────────────────────────────────────

let _ffmpegInitialized = false;
let _ffmpegBin = 'ffmpeg';
async function ensureFfmpeg() {
  if (_ffmpegInitialized) return;
  try {
    const { default: ffmpegPath } = await import('ffmpeg-static');
    if (ffmpegPath) {
      process.env.FFMPEG_PATH = ffmpegPath;
      _ffmpegBin = ffmpegPath;
    }
    _ffmpegInitialized = true;
    console.log('[music] ffmpeg-static path:', ffmpegPath);
  } catch {
    console.warn('[music] ffmpeg-static not found — falling back to system ffmpeg');
    _ffmpegInitialized = true;
  }
}

// ── yt-dlp helpers ────────────────────────────────────────────────────────────

/** Build common yt-dlp args (cookie file, no playlist, etc.) */
function ytdlpBaseArgs() {
  const args = [
    '--no-playlist',
    '--no-warnings',
    // iOS player client bypasses YouTube's bot-detection — no cookies needed
    '--extractor-args', 'youtube:player_client=ios,web',
    '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ];
  if (process.env.YTDLP_COOKIES_FILE) {
    args.push('--cookies', process.env.YTDLP_COOKIES_FILE);
  }
  return args;
}

/**
 * Run yt-dlp --dump-json to get video metadata.
 * @param {string} urlOrQuery  Full URL or "ytsearch:query string"
 * @returns {Promise<object>}  Parsed JSON info dict
 */
async function ytdlpInfo(urlOrQuery) {
  const bin = getYtdlpBin();
  const args = [
    ...ytdlpBaseArgs(),
    '--dump-json',
    '--skip-download',
    urlOrQuery,
  ];

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const proc = spawn(bin, args, { timeout: 20000 });
    proc.stdout.on('data', d => (stdout += d));
    proc.stderr.on('data', d => (stderr += d));
    proc.on('close', code => {
      if (code !== 0) {
        // Surface the most useful line from stderr
        const msg = stderr.split('\n').find(l => l.includes('ERROR') || l.includes('Sign in')) ?? stderr.trim();
        return reject(new Error(msg || `yt-dlp exited ${code}`));
      }
      try {
        // yt-dlp may emit multiple JSON lines (playlist); take the first
        const firstLine = stdout.trim().split('\n')[0];
        resolve(JSON.parse(firstLine));
      } catch {
        reject(new Error('yt-dlp trả về JSON không hợp lệ'));
      }
    });
    proc.on('error', err => reject(new Error(`Không thể chạy yt-dlp: ${err.message}`)));
  });
}

/**
 * Create a Readable audio stream via yt-dlp piped through ffmpeg.
 * Returns a Node.js Readable stream (PCM/opus depends on ffmpeg args).
 * We output Opus in an ogg container so @discordjs/voice can consume it directly.
 * @param {string} url  YouTube watch URL
 * @returns {Promise<{ stream: Readable, type: 'opus' | 'arbitrary' }>}
 */
async function ytdlpStream(url) {
  await ensureFfmpeg();
  const bin = getYtdlpBin();

  // yt-dlp outputs best audio to stdout, ffmpeg re-encodes to opus/ogg for discord
  const ytArgs = [
    ...ytdlpBaseArgs(),
    '-f', 'bestaudio[ext=webm]/bestaudio/best',
    '-o', '-',   // pipe to stdout
    '--quiet',
    url,
  ];

  const ffArgs = [
    '-i', 'pipe:0',
    '-vn',
    '-acodec', 'libopus',
    '-f', 'opus',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1',
  ];

  const ytProc = spawn(bin, ytArgs);
  const ffProc = spawn(_ffmpegBin, ffArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

  // Pipe yt-dlp stdout → ffmpeg stdin
  ytProc.stdout.pipe(ffProc.stdin);

  // Forward yt-dlp stderr to console for debugging
  ytProc.stderr.on('data', d => {
    const msg = d.toString().trim();
    if (msg) console.debug('[yt-dlp]', msg);
  });
  ffProc.stderr.on('data', d => {
    const msg = d.toString().trim();
    if (msg) console.debug('[ffmpeg]', msg);
  });

  // If yt-dlp dies, kill ffmpeg too
  ytProc.on('close', code => {
    if (code !== 0) ffProc.stdin.destroy(new Error(`yt-dlp exited ${code}`));
  });

  return { stream: ffProc.stdout, type: 'opus' };
}

// ── General helpers ───────────────────────────────────────────────────────────

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
 * @typedef {Object} Track
 * @property {string} title
 * @property {string} url           - canonical URL
 * @property {number} duration      - seconds (0 if unknown)
 * @property {string} durationFmt   - human-readable "m:ss"
 * @property {string|null} thumbnail
 * @property {'youtube'|'spotify'|'soundcloud'|'direct'} source
 * @property {string} requestedBy   - Discord user ID
 */

// ── resolveTrack ──────────────────────────────────────────────────────────────

/**
 * Resolve a user input string into a Track object.
 * Throws if resolution fails.
 * @param {string} input
 * @returns {Promise<Track>}
 */
export async function resolveTrack(input) {
  const source = detectSource(input.trim());

  // ── YouTube (direct URL) ──────────────────────────────────────────────────
  if (source === 'youtube') {
    const info = await ytdlpInfo(input.trim());
    return {
      title: info.title ?? 'Unknown',
      url: info.webpage_url ?? input.trim(),
      duration: info.duration ?? 0,
      durationFmt: fmt(info.duration),
      thumbnail: info.thumbnail ?? null,
      source: 'youtube',
      requestedBy: '',
    };
  }

  // ── Spotify (resolve title → search on YouTube via yt-dlp) ───────────────
  if (source === 'spotify') {
    let searchQuery;
    try {
      searchQuery = await spotifyTitle(input);
    } catch {
      const m = input.match(/track\/([A-Za-z0-9]+)/);
      searchQuery = m ? m[1] : input;
    }

    const info = await ytdlpInfo(`ytsearch1:${searchQuery}`);
    return {
      title: searchQuery,  // Spotify title is more descriptive
      url: info.webpage_url,
      duration: info.duration ?? 0,
      durationFmt: fmt(info.duration),
      thumbnail: info.thumbnail ?? null,
      source: 'spotify',
      requestedBy: '',
    };
  }

  // ── SoundCloud ───────────────────────────────────────────────────────────
  // play-dl handles SoundCloud fine (no auth wall), keep as-is
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
      requestedBy: '',
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
      requestedBy: '',
    };
  }

  // ── Search query → YouTube via yt-dlp ────────────────────────────────────
  const info = await ytdlpInfo(`ytsearch1:${input.trim()}`);
  return {
    title: info.title ?? input,
    url: info.webpage_url,
    duration: info.duration ?? 0,
    durationFmt: fmt(info.duration),
    thumbnail: info.thumbnail ?? null,
    source: 'youtube',
    requestedBy: '',
  };
}

// ── createAudioStream ─────────────────────────────────────────────────────────

/**
 * Create a streamable audio source for a resolved Track.
 * Returns { stream, type } compatible with @discordjs/voice createAudioResource.
 * @param {Track} track
 */
export async function createAudioStream(track) {
  await ensureFfmpeg();

  if (!track.url || !/^https?:\/\//i.test(track.url)) {
    throw new Error(`URL không hợp lệ: "${track.url ?? '(trống)'}"`);
  }

  // SoundCloud — play-dl still works fine
  if (track.source === 'soundcloud') {
    const sc = await playdl.soundcloud(track.url);
    return await playdl.stream_from_info(sc, { quality: 2 });
  }

  // Direct URL — try play-dl first, fall back to raw fetch
  if (track.source === 'direct') {
    const streamInfo = await playdl.stream(track.url, { quality: 2 }).catch(async () => {
      const res = await fetch(track.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { stream: res.body, type: 'arbitrary' };
    });
    return streamInfo;
  }

  // YouTube + Spotify (resolved to YT URL) — use yt-dlp
  return await ytdlpStream(track.url);
}

export { fmt };