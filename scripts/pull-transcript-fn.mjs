import { readFileSync, writeFileSync } from 'node:fs';

const raw = readFileSync(
  'C:/Users/xenon/.cursor/projects/d-CODE-Code-discord-service-bot-render/agent-transcripts/50f372a1-bb0c-4b75-b876-63789ea0ae3a/50f372a1-bb0c-4b75-b876-63789ea0ae3a.jsonl',
  'utf8'
);

function unescapeJsonString(s) {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

// Find export async function runBuiltInCommand in escaped content
const marker = 'export async function runBuiltInCommand';
let best = '';
let pos = 0;
while (true) {
  const idx = raw.indexOf(marker, pos);
  if (idx < 0) break;
  // grab a large window and try to find matching function end
  const window = raw.slice(idx, idx + 120000);
  // In JSON, newlines are \\n
  const endMarkers = [
    '\\n}\\n\\nexport',
    '\\n}\\n\\nconst ',
    '\\n}\\n\\nfunction ',
    'return reply(renderCommandResponse'
  ];
  let end = window.length;
  for (const em of endMarkers) {
    const e = window.indexOf(em, marker.length);
    if (e > 0 && e < end) end = e + (em.startsWith('return') ? em.length : 3);
  }
  let chunk = window.slice(0, end);
  chunk = unescapeJsonString(chunk);
  if (chunk.length > best.length) best = chunk;
  pos = idx + 1;
}
writeFileSync('scripts/transcript-runBuiltInCommand.js', best);
console.log('saved fn', best.length, 'lines', best.split('\n').length);

// Also try async function runBuiltInCommand (pre-export)
pos = 0;
let best2 = '';
const marker2 = 'async function runBuiltInCommand';
while (true) {
  const idx = raw.indexOf(marker2, pos);
  if (idx < 0) break;
  const window = raw.slice(idx, idx + 120000);
  const ret = window.indexOf('return reply(renderCommandResponse');
  if (ret > 0) {
    const chunk = unescapeJsonString(window.slice(0, ret + 'return reply(renderCommandResponse'.length + 200));
    if (chunk.length > best2.length) best2 = chunk;
  }
  pos = idx + 1;
}
writeFileSync('scripts/transcript-runBuiltInCommand2.js', best2);
console.log('saved fn2', best2.length);
