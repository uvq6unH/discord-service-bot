// ── yt-dlp bootstrap ──────────────────────────────────────────────────────────
// Locates or downloads the yt-dlp binary at runtime so the resolver always has
// a working binary regardless of how the host is provisioned.
//
// Resolution order:
//   1. YTDLP_PATH env var (explicit override)
//   2. `yt-dlp` on PATH
//   3. /usr/local/bin/yt-dlp, /usr/bin/yt-dlp  (common system locations)
//   4. Auto-download to YTDLP_DOWNLOAD_DIR (default: /var/data on Render,
//      otherwise <project>/node_modules/.cache/yt-dlp)

import { spawnSync, execFileSync } from 'child_process';
import { existsSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';

const DOWNLOAD_URL =
    'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

function probe(bin) {
    try {
        const r = spawnSync(bin, ['--version'], { timeout: 8000, encoding: 'utf8' });
        if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
    } catch { /* not found */ }
    return null;
}

function downloadBin(dest) {
    console.log(`[yt-dlp] Downloading binary → ${dest}`);
    // Use curl if available, otherwise wget
    const hasCurl = probe('curl') !== null || spawnSync('curl', ['--version']).status === 0;
    if (hasCurl) {
        execFileSync('curl', ['-fsSL', DOWNLOAD_URL, '-o', dest], { timeout: 60000 });
    } else {
        execFileSync('wget', ['-q', '-O', dest, DOWNLOAD_URL], { timeout: 60000 });
    }
    chmodSync(dest, 0o755);
}

let _resolved = null;

/**
 * Returns the path to a working yt-dlp binary.
 * Downloads it on first call if not found anywhere on the system.
 * Throws only if download also fails.
 */
export function resolveYtdlp() {
    if (_resolved) return _resolved;

    // 1. Explicit env override
    const envPath = process.env.YTDLP_PATH;
    if (envPath) {
        const ver = probe(envPath);
        if (ver) {
            console.log(`[yt-dlp] Using YTDLP_PATH: ${envPath} (${ver})`);
            return (_resolved = envPath);
        }
        console.warn(`[yt-dlp] YTDLP_PATH="${envPath}" set but binary not working — will search/download`);
    }

    // 2-3. System PATH + known locations
    const candidates = ['yt-dlp', '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp'];
    for (const bin of candidates) {
        const ver = probe(bin);
        if (ver) {
            console.log(`[yt-dlp] Found on system: ${bin} (${ver})`);
            return (_resolved = bin);
        }
    }

    // 4. Auto-download to persistent dir
    const downloadDir =
        process.env.YTDLP_DOWNLOAD_DIR ??
        (existsSync('/var/data') ? '/var/data' : join(process.cwd(), 'node_modules', '.cache', 'yt-dlp'));

    mkdirSync(downloadDir, { recursive: true });
    const dest = join(downloadDir, 'yt-dlp');

    if (existsSync(dest)) {
        const ver = probe(dest);
        if (ver) {
            console.log(`[yt-dlp] Using cached binary: ${dest} (${ver})`);
            return (_resolved = dest);
        }
        console.warn(`[yt-dlp] Cached binary at ${dest} not working — re-downloading`);
    }

    downloadBin(dest);

    const ver = probe(dest);
    if (!ver) throw new Error(`[yt-dlp] Downloaded binary at ${dest} still not working`);

    console.log(`[yt-dlp] Downloaded successfully: ${dest} (${ver})`);
    return (_resolved = dest);
}