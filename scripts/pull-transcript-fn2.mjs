import { readFileSync, writeFileSync } from 'node:fs';

const raw = readFileSync(
  'C:/Users/xenon/.cursor/projects/d-CODE-Code-discord-service-bot-render/agent-transcripts/50f372a1-bb0c-4b75-b876-63789ea0ae3a/50f372a1-bb0c-4b75-b876-63789ea0ae3a.jsonl',
  'utf8'
);

function unescape(s) {
  return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

// Search all occurrences of runBuiltInCommand with context
const needle = 'runBuiltInCommand(ctx)';
const positions = [];
let p = 0;
while ((p = raw.indexOf(needle, p)) !== -1) {
  positions.push(p);
  p++;
}
console.log('ctx positions', positions.length);

// Search memberCanUseCommand inside function body pattern
const needle2 = 'memberCanUseCommand(actorMember, command)';
p = 0;
const pos2 = [];
while ((p = raw.indexOf(needle2, p)) !== -1) {
  pos2.push(p);
  p++;
}
console.log('memberCanUse positions', pos2.length, pos2.slice(0, 3));

// For each position, try extract backwards to async function and forward to renderCommandResponse
for (const startApprox of pos2.slice(0, 3)) {
  const back = raw.slice(Math.max(0, startApprox - 8000), startApprox);
  const fwd = raw.slice(startApprox, startApprox + 80000);
  const fnStart = back.lastIndexOf('async function runBuiltInCommand');
  const fnStart2 = back.lastIndexOf('export async function runBuiltInCommand');
  const s = Math.max(fnStart, fnStart2);
  if (s < 0) continue;
  const absStart = Math.max(0, startApprox - 8000) + s;
  const ret = fwd.indexOf('return reply(renderCommandResponse');
  if (ret < 0) continue;
  let chunk = raw.slice(absStart, startApprox + ret + 80);
  chunk = unescape(chunk);
  writeFileSync('scripts/candidate-body.js', chunk);
  console.log('candidate', chunk.length, 'starts', chunk.slice(0, 80));
}

// Grep for help block escaped
const helpEsc = "if (command.type === 'help')";
let hp = 0;
const helpPos = [];
while ((hp = raw.indexOf(helpEsc, hp)) !== -1) {
  helpPos.push(hp);
  hp++;
}
console.log('help positions', helpPos.length);
if (helpPos[0]) {
  const chunk = unescape(raw.slice(helpPos[0], helpPos[0] + 60000));
  const ret = chunk.indexOf('return reply(renderCommandResponse');
  if (ret > 0) {
    const bodyStart = chunk.indexOf("if (command.type === 'help')");
    writeFileSync('scripts/commands-body.txt', chunk.slice(bodyStart, ret).trimEnd() + '\n');
    console.log('WROTE body', chunk.slice(bodyStart, ret).length);
  }
}
