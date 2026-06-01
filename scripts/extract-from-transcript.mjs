import { readFileSync, writeFileSync } from 'node:fs';

const path =
  'C:/Users/xenon/.cursor/projects/d-CODE-Code-discord-service-bot-render/agent-transcripts/50f372a1-bb0c-4b75-b876-63789ea0ae3a/50f372a1-bb0c-4b75-b876-63789ea0ae3a.jsonl';
const raw = readFileSync(path, 'utf8');

// Unescape JSON string fragments containing command handlers
const hits = [];
let pos = 0;
while (true) {
  const idx = raw.indexOf("command.type === 'help'", pos);
  if (idx < 0) break;
  hits.push(idx);
  pos = idx + 1;
}
console.log('help hits', hits.length, hits.slice(0, 5));

// Try to extract largest JSON-escaped block with runBuiltInCommand
const markers = [
  "async function runBuiltInCommand",
  'export async function runBuiltInCommand',
  "if (command.type === 'help')",
  "if (command.type === 'balance')"
];
for (const m of markers) {
  const i = raw.indexOf(m);
  console.log(m, i);
}

// Parse each line for StrReplace on bot.js with long old_string
const lines = raw.split('\n');
const chunks = [];
for (const line of lines) {
  if (!line.includes('bot.js') || !line.includes('StrReplace')) continue;
  try {
    const row = JSON.parse(line);
    for (const part of row.message?.content || []) {
      if (part.name !== 'StrReplace') continue;
      const old = part.input?.old_string || '';
      if (old.includes('command.type') || old.includes('runBuiltInCommand')) {
        chunks.push({ len: old.length, preview: old.slice(0, 120), old });
      }
    }
  } catch {
    /* skip */
  }
}
chunks.sort((a, b) => b.len - a.len);
console.log('StrReplace chunks', chunks.length);
for (const c of chunks.slice(0, 5)) {
  console.log('len', c.len, c.preview);
}
if (chunks[0]) {
  writeFileSync('scripts/transcript-largest-chunk.txt', chunks[0].old);
}

// Extract from Write extract-p2 - the writeFileSync commands.js line
const writeIdx = raw.indexOf("writeFileSync('src/bot/commands.js'");
const writeIdx2 = raw.indexOf('writeFileSync(\'src/bot/commands.js\'');
console.log('writeFileSync commands.js', writeIdx, writeIdx2);

// Find botLines.slice(148, 799) context - maybe entire function in nearby StrReplace
const sliceIdx = raw.indexOf('botLines.slice(148, 799)');
console.log('slice ref', sliceIdx);
