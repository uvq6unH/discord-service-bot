import { readFileSync, writeFileSync } from 'node:fs';

const path =
  'C:/Users/xenon/.cursor/projects/d-CODE-Code-discord-service-bot-render/agent-transcripts/50f372a1-bb0c-4b75-b876-63789ea0ae3a/50f372a1-bb0c-4b75-b876-63789ea0ae3a.jsonl';
const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);

for (let i = 0; i < lines.length; i++) {
  let row;
  try {
    row = JSON.parse(lines[i]);
  } catch {
    continue;
  }
  const content = row.message?.content;
  if (!Array.isArray(content)) continue;
  for (const part of content) {
    if (part.type === 'tool_use' && part.name === 'Read') {
      const p = part.input?.path || '';
      if (p.includes('bot.js') || p.includes('commands.js')) {
        console.log('line', i + 1, 'Read', p, 'offset', part.input?.offset, 'limit', part.input?.limit);
      }
    }
    if (part.type === 'tool_use' && part.name === 'Write') {
      const p = part.input?.path || '';
      if (p.includes('commands.js') && part.input?.contents?.includes('runBuiltInCommand')) {
        writeFileSync('scripts/transcript-commands.js', part.input.contents);
        console.log('WROTE transcript-commands.js', part.input.contents.length);
      }
    }
    // tool results sometimes in user messages
    if (typeof part.text === 'string' && part.text.includes("command.type === 'help'")) {
      writeFileSync('scripts/transcript-help-snippet.txt', part.text);
      console.log('found help in text at line', i + 1, part.text.length);
    }
  }
}

// Also search raw for help block
const raw = readFileSync(path, 'utf8');
const marker = "  if (command.type === 'help')";
const idx = raw.indexOf(marker);
console.log('raw marker index', idx);
if (idx >= 0) {
  const snippet = raw.slice(idx, idx + 50000);
  const end = snippet.indexOf('return reply(renderCommandResponse');
  console.log('end at', end);
  if (end > 0) writeFileSync('scripts/transcript-raw-body.txt', snippet.slice(0, end));
}
