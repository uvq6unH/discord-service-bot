import { readFileSync, writeFileSync } from 'node:fs';

const raw = readFileSync(
  'C:/Users/xenon/.cursor/projects/d-CODE-Code-discord-service-bot-render/agent-transcripts/50f372a1-bb0c-4b75-b876-63789ea0ae3a/50f372a1-bb0c-4b75-b876-63789ea0ae3a.jsonl',
  'utf8'
);

function unescape(s) {
  return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

const anchor = raw.indexOf('memberCanUseCommand(actorMember, command)');
console.log('anchor', anchor);
const window = raw.slice(anchor - 15000, anchor + 100000);
writeFileSync('scripts/window-raw.txt', unescape(window));
console.log('window unescaped', unescape(window).length);

// find runBuiltInCommand in window
const w = unescape(window);
const fn = w.indexOf('async function runBuiltInCommand');
const efn = w.indexOf('export async function runBuiltInCommand');
console.log('fn offsets', fn, efn);

// Maybe it's in StrReplace - search for purge command
const purge = raw.indexOf("command.type === 'purge'");
console.log('purge', purge);
if (purge > 0) {
  const c = unescape(raw.slice(purge - 500, purge + 80000));
  writeFileSync('scripts/purge-context.js', c);
  console.log('purge ctx len', c.length);
}
