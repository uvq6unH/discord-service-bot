import { readFileSync, writeFileSync } from 'node:fs';

const lines = readFileSync('scripts/head-bot-utf8.js', 'utf8').split('\n');

const helpHits = lines
  .map((l, i) => (l.includes("if (command.type === 'help')") ? i : -1))
  .filter((i) => i >= 0);
const start = helpHits[helpHits.length - 1];
let end = -1;
for (let i = lines.length - 1; i > start; i--) {
  if (lines[i].trim() === 'return reply(renderCommandResponse(command.response, { client, context, config, args }));') {
    end = i;
    break;
  }
}
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}

let body = lines.slice(start, end).join('\n');

body = body.replace(/\bcurrencies\b/g, 'CURRENCIES').replace(/\bgameCurrency\b/g, 'GAME_CURRENCY');

// warnings permission gate (audit H-01)
body = body.replace(
  `    if (command.type === 'clearwarns') {
      if (!permissions?.has(PermissionFlagsBits.ManageMessages)) {`,
  `    if (command.type === 'warnings') {
      if (!hasModerationPermission(permissions, 'warnings')) {
        return reply(isInteraction ? { content: 'You need moderation permission to view warnings.', ephemeral: true } : 'You need moderation permission to view warnings.');
      }
    }

    if (command.type === 'clearwarns') {
      if (!permissions?.has(PermissionFlagsBits.ManageMessages)) {`
);

// role hierarchy (audit C-04)
body = body.replace(
  `    if (!target.member && command.type !== 'warn') {
      return reply(isInteraction ? { content: 'Target member not found.', ephemeral: true } : 'Target member not found.');
    }

    if (command.type === 'kick') {`,
  `    if (!target.member && command.type !== 'warn') {
      return reply(isInteraction ? { content: 'Target member not found.', ephemeral: true } : 'Target member not found.');
    }

    const hierarchy = canModerateMember(actorMember, target.member);
    if (!hierarchy.ok) {
      return reply(isInteraction ? { content: hierarchy.reason, ephemeral: true } : hierarchy.reason);
    }

    if (command.type === 'warn') {
      if (!hasModerationPermission(permissions, 'warn')) {
        return reply(isInteraction ? { content: 'You need moderation permission to warn members.', ephemeral: true } : 'You need moderation permission to warn members.');
      }
    }

    if (command.type === 'kick') {`
);

// blackjack: validateGameBet already debits
body = body.replace(
  `    if (!balance) return;
    const reserved = await client.stateStore.adjustBalance(guild.id, user.id, currency, -bet);
    const deck = createDeck();
    const session = {
      guildId: guild.id,
      currency,
      bet,
      deck,
      dealer: [deck.pop(), deck.pop()],
      players: [createBlackjackPlayer(user, bet, deck, reserved[currency] ?? 0)],`,
  `    if (!balance) return;
    const deck = createDeck();
    const session = {
      guildId: guild.id,
      currency,
      bet,
      deck,
      dealer: [deck.pop(), deck.pop()],
      players: [createBlackjackPlayer(user, bet, deck, balance[currency] ?? 0)],`
);

// poker: validateGameBet already debits
body = body.replace(
  `    if (!balance) return;

    await client.stateStore.adjustBalance(guild.id, user.id, currency, -bet);
    const deck = createDeck();
    const session = {
      guildId: guild.id,
      userId: user.id,`,
  `    if (!balance) return;

    const deck = createDeck();
    const session = {
      guildId: guild.id,
      userId: user.id,`
);

// announcement sanitization (audit M-04)
const oldAnnounce = `    const announcement = isInteraction ? source.options.getString('message') : args;
    const targetChannel = await guild.channels.fetch(config.announcementChannelId).catch(() => null);
    if (!targetChannel?.isTextBased()) {
      return reply(isInteraction ? { content: 'Announcement channel not found.', ephemeral: true } : 'Announcement channel not found.');
    }
    if (/@(?:everyone|here)\\b/.test(config.announcementMention) &&
        !guild.members.me?.permissions.has(PermissionFlagsBits.MentionEveryone)) {
      return reply(isInteraction ? { content: 'Bot needs Mention Everyone permission for @everyone/@here announcements.', ephemeral: true } : 'Bot needs Mention Everyone permission for @everyone/@here announcements.');
    }
    const content = \`\${config.announcementMention ? \`\${config.announcementMention}\\n\` : ''}\${announcement}\`;
    await targetChannel.send({ embeds: [new EmbedBuilder().setTitle('Announcement').setDescription(content).setColor(0x2864d8)] });`;

const newAnnounce = `    const announcement = sanitizeAnnouncementText(isInteraction ? source.options.getString('message') : args);
    const targetChannel = await guild.channels.fetch(config.announcementChannelId).catch(() => null);
    if (!targetChannel?.isTextBased()) {
      return reply(isInteraction ? { content: 'Announcement channel not found.', ephemeral: true } : 'Announcement channel not found.');
    }
    const mentionPrefix = String(config.announcementMention ?? '').trim();
    if (/@(?:everyone|here)\\b/.test(mentionPrefix) &&
        !guild.members.me?.permissions.has(PermissionFlagsBits.MentionEveryone)) {
      return reply(isInteraction ? { content: 'Bot needs Mention Everyone permission for @everyone/@here announcements.', ephemeral: true } : 'Bot needs Mention Everyone permission for @everyone/@here announcements.');
    }
    await targetChannel.send({
      content: mentionPrefix || undefined,
      embeds: [new EmbedBuilder().setTitle('Announcement').setDescription(announcement).setColor(0x2864d8)]
    });`;

if (!body.includes(oldAnnounce)) {
  console.warn('announce block not found for replace');
} else {
  body = body.replace(oldAnnounce, newAnnounce);
}

writeFileSync('scripts/commands-body.txt', `${body}\n`, 'utf8');
console.log('lines', body.split('\n').length, 'bytes', Buffer.byteLength(body, 'utf8'));
