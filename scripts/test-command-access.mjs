import { PermissionFlagsBits } from 'discord.js';
import { memberCanUseCommand, sanitizeAnnouncementText } from '../src/commandAccess.js';

const permissions = {
  has: (flag) => flag === PermissionFlagsBits.ManageMessages
};

const member = {
  id: '1',
  permissions,
  roles: { cache: new Map() }
};

const warnCommand = { type: 'warn', allowedRoles: [] };
const pingCommand = { type: 'ping', allowedRoles: [] };

if (!memberCanUseCommand(member, warnCommand)) {
  console.error('Expected member with ManageMessages to use warn');
  process.exit(1);
}

if (!memberCanUseCommand(member, pingCommand)) {
  console.error('Expected everyone to use ping');
  process.exit(1);
}

const everyoneMember = {
  id: '2',
  permissions: { has: () => false },
  roles: { cache: new Map() }
};

if (memberCanUseCommand(everyoneMember, warnCommand)) {
  console.error('Expected member without perms to be denied warn');
  process.exit(1);
}

if (!sanitizeAnnouncementText('@everyone hi').includes('\u200b')) {
  console.error('Expected announcement sanitizer to neutralize mentions');
  process.exit(1);
}

console.log('[test-command-access] OK');
