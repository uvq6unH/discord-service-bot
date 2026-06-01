import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readJsonFile } from '../src/safeJson.js';

const dir = await mkdtemp(path.join(tmpdir(), 'dsb-json-'));
const filePath = path.join(dir, 'sample.json');

await writeFile(filePath, JSON.stringify({ ok: true }), 'utf8');
const data = await readJsonFile(filePath);
if (!data.ok) {
  console.error('Expected parsed JSON');
  process.exit(1);
}

const bigPath = path.join(dir, 'big.json');
await writeFile(bigPath, '{"a":' + '"x"'.repeat(200) + '}');

let failed = false;
try {
  await readJsonFile(bigPath, 32);
} catch (error) {
  failed = error.message.includes('maximum size');
}

if (!failed) {
  console.error('Expected size limit error');
  process.exit(1);
}

await rm(dir, { recursive: true, force: true });
console.log('[test-safe-json] OK');
