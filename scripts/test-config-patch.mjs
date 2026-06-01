import { pickBoolean, pickFlag } from '../src/configPatch.js';

const current = { enabled: true, dailyEnabled: true, deleteBlockedMessages: true };

const partial = {};
if (pickBoolean(partial, 'enabled', current) !== true) {
  console.error('pickBoolean should preserve enabled when omitted');
  process.exit(1);
}

const disabled = { enabled: false };
if (pickBoolean(disabled, 'enabled', current) !== false) {
  console.error('pickBoolean should apply explicit false');
  process.exit(1);
}

if (pickFlag(partial, 'dailyEnabled', current) !== true) {
  console.error('pickFlag should preserve dailyEnabled when omitted');
  process.exit(1);
}

console.log('[test-config-patch] OK');
