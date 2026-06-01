import { readFileSync, writeFileSync } from 'node:fs';

const lines = readFileSync('src/bot.js', 'utf8').split('\n');

const responses = `import { buildCommandList as listCommands } from './responses.js';

function getContextValue(context, key) {
  return typeof context[key] === 'function' ? context[key]() : context[key];
}

${lines.slice(790, 826).join('\n').replace(/^function buildCommandList/, 'export function buildCommandList').replace(/^function renderCommandResponse/, 'export function renderCommandResponse')}
`;

writeFileSync('src/bot/responses.js', lines.slice(790, 826).join('\n')
  .replace(/^function buildCommandList/, 'export function buildCommandList')
  .replace(/^function getContextValue/, 'function getContextValue')
  .replace(/^function renderCommandResponse/, 'export function renderCommandResponse'));

const slashHeader = `import { ApplicationCommandOptionType } from 'discord.js';
import { buildLolSlashOptions } from '../lolCommands.js';
import { buildTftSlashOptions } from '../tftCommands.js';

`;

writeFileSync('src/bot/slash.js', slashHeader + lines.slice(827, 1086).join('\n')
  .replace(/^function buildSlashCommands/, 'export function buildSlashCommands')
  .replace(/^function buildSlashOptions/, 'export function buildSlashOptions'));

console.log('Wrote responses.js and slash.js');
