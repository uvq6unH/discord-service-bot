/**
 * Smoke test for economy debit locking (no Discord required).
 */
import { StateStore } from '../src/stateStore.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = await mkdtemp(path.join(tmpdir(), 'dsb-economy-'));
const store = new StateStore(path.join(dir, 'state.json'));
await store.ready;

const guildId = '123456789012345678';
const userId = '987654321098765432';

await store.setBalance(guildId, userId, 'silver', 100);

const results = await Promise.all([
  store.tryDebitBalance(guildId, userId, 'silver', 60),
  store.tryDebitBalance(guildId, userId, 'silver', 60),
  store.tryDebitBalance(guildId, userId, 'silver', 60)
]);

const okCount = results.filter((r) => r.ok).length;
if (okCount !== 1) {
  console.error(`Expected exactly 1 successful debit, got ${okCount}`);
  process.exit(1);
}

const balance = await store.getBalance(guildId, userId);
if (balance.silver !== 40) {
  console.error(`Expected balance 40, got ${balance.silver}`);
  process.exit(1);
}

await rm(dir, { recursive: true, force: true });
console.log('[test-economy-lock] OK');
