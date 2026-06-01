import { readFileSync, writeFileSync } from 'node:fs';

const raw = readFileSync(
  'C:/Users/xenon/.cursor/projects/d-CODE-Code-discord-service-bot-render/agent-transcripts/50f372a1-bb0c-4b75-b876-63789ea0ae3a/50f372a1-bb0c-4b75-b876-63789ea0ae3a.jsonl',
  'utf8'
);

const chunks = [];
for (const line of raw.split('\n')) {
  if (!line.includes('StrReplace') || !line.includes('bot.js')) continue;
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    continue;
  }
  for (const part of row.message?.content || []) {
    if (part.name !== 'StrReplace') continue;
    const p = part.input?.path || '';
    if (!p.replace(/\\/g, '/').endsWith('src/bot.js')) continue;
    const old = part.input?.old_string || '';
    if (old.includes('command.type') || old.includes('runBuiltInCommand')) {
      chunks.push(old);
    }
  }
}

chunks.sort((a, b) => b.length - a.length);
writeFileSync('scripts/strreplace-chunks.txt', chunks.map((c, i) => `=== CHUNK ${i} len=${c.length} ===\n${c}`).join('\n\n'));
console.log('chunks', chunks.length, 'total chars', chunks.reduce((s, c) => s + c.length, 0));

// Merge unique if-blocks
const blocks = new Set();
for (const c of chunks) {
  const re = /  if \(command\.type[\s\S]*?(?=\n  if \(command\.type|\n  if \(\[|\n  \/\/ ──|$)/g;
  let m;
  while ((m = re.exec(c)) !== null) blocks.add(m[0].trimEnd());
}
const sorted = [...blocks].sort();
writeFileSync('scripts/collected-if-blocks.txt', sorted.join('\n\n'));
console.log('if blocks', sorted.length);
