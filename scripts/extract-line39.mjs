import { readFileSync, writeFileSync } from 'node:fs';

const lines = readFileSync(
  'C:/Users/xenon/.cursor/projects/d-CODE-Code-discord-service-bot-render/agent-transcripts/50f372a1-bb0c-4b75-b876-63789ea0ae3a/50f372a1-bb0c-4b75-b876-63789ea0ae3a.jsonl',
  'utf8'
).split('\n');

const line39 = lines[38]; // 0-based
const row = JSON.parse(line39);
for (const part of row.message?.content || []) {
  if (part.name !== 'StrReplace') continue;
  const old = part.input?.old_string || '';
  if (old.length > 500) {
    writeFileSync(`scripts/l39-replace-${old.length}.txt`, old);
    console.log('wrote', old.length, part.input.path);
  }
}
