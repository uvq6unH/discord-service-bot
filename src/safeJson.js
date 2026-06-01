import { open, readFile, stat } from 'node:fs/promises';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export async function readJsonFile(filePath, maxBytes = DEFAULT_MAX_BYTES) {
  const handle = await open(filePath, 'r');
  try {
    const fileStat = await handle.stat();
    if (fileStat.size > maxBytes) {
      throw new Error(`File exceeds maximum size of ${maxBytes} bytes: ${filePath}`);
    }
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } finally {
    await handle.close();
  }
}

export async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    return error.code === 'ENOENT' ? false : Promise.reject(error);
  }
}
