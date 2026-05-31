import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from 'discord.js';
import {
  handleLsd, handleLolProfile, handleLolMatch, handleLolChamp,
  handleLolItem, handleLolRunes, handleLolPatch,
  handleLolLink, handleLolUnlink, buildLolSlashOptions
} from './lolCommands.js';
import {
  handleTftLsd, handleTftProfile, handleTftMatch,
  handleTftLink, handleTftUnlink, buildTftSlashOptions
} from './tftCommands.js';

const groupMap = {
  ping: 'general',
  help: 'general',
  custom: 'general',
  user: 'user',
  avatar: 'user',
  rank: 'user',
  leaderboard: 'user',
  balance: 'user',
  daily: 'user',
  economyleaderboard: 'user',
  blackjack: 'games',
  poker: 'games',
  coinflip: 'games',
  dice: 'games',
  slots: 'games',
  server: 'server',
  say: 'server',
  purge: 'server',
  announce: 'server',
  warn: 'moderation',
  kick: 'moderation',
  ban: 'moderation',
  timeout: 'moderation',
  warnings: 'moderation',
  clearwarns: 'moderation',
  ecoadd: 'moderation',
  ecoset: 'moderation',
  ecoremove: 'moderation',
  ticketpanel: 'interactions',
  rolepanel: 'interactions',
  lsd: 'lol',
  lolprofile: 'lol',
  lolmatch: 'lol',
  lolchamp: 'lol',
  lolitem: 'lol',
  lolrunes: 'lol',
  lolpatch: 'lol',
  lollink: 'lol',
  lolunlink: 'lol',
  // ── TFT — grouped with LoL ──
  tftlsd: 'lol',
  tftprofile: 'lol',
  tftmatch: 'lol',
  tftlink: 'lol',
  tftunlink: 'lol'
};

const groupMetadata = {
  general: {
    title: '⚙️ Lệnh Chung & Custom',
    description: 'Các lệnh cơ bản và lệnh tùy chỉnh trên máy chủ.'
  },
  user: {
    title: '👤 Thành Viên & Cấp Độ',
    description: 'Các lệnh xem hồ sơ thành viên, hình đại diện và hệ thống cấp độ XP.'
  },
  server: {
    title: '🖥️ Máy Chủ & Phát Thanh',
    description: 'Các lệnh hiển thị thông tin máy chủ, phát thông báo và dọn dẹp.'
  },
  moderation: {
    title: '🛡️ Kiểm Duyệt & Bảo Mật',
    description: 'Các lệnh xử phạt thành viên vi phạm (ban, kick, timeout, cảnh cáo).'
  },
  interactions: {
    title: '🔔 Tương Tác & Nút Bấm',
    description: 'Các lệnh đăng bảng chọn vai trò tự động và tạo kênh hỗ trợ (ticket).'
  },
  games: {
    title: '🎮 Trò Chơi',
    description: 'Blackjack, Poker, Coinflip, Dice và Slots — đặt cược bằng tiền ảo của server.'
  },
  lol: {
    title: '⚔️ League of Legends & TFT',
    description: 'Tra cứu lịch sử đấu LoL/TFT, hồ sơ người chơi, thông tin tướng, trang bị, bảng ngọc và chi tiết trận TFT.'
  },
};

async function buildHelpPayload(client, config, guild, userId, selectedGroup = null) {
  const guildCommands = await guild.commands.fetch().catch(() => new Map());
  const cmdMap = new Map();
  for (const cmd of guildCommands.values()) {
    cmdMap.set(cmd.name, cmd.id);
  }

  const prefix = config.prefix || '!';

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`help_select:${userId}`)
    .setPlaceholder('Chọn danh mục câu lệnh...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Lệnh Chung & Custom')
        .setValue('help_group:general')
        .setDescription('Các lệnh cơ bản và lệnh tự tạo')
        .setEmoji('⚙️')
        .setDefault(selectedGroup === 'general'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Thành Viên & Cấp Độ')
        .setValue('help_group:user')
        .setDescription('Xem thông tin, avatar và điểm XP')
        .setEmoji('👤')
        .setDefault(selectedGroup === 'user'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Máy Chủ & Phát Thanh')
        .setValue('help_group:server')
        .setDescription('Thông tin server và phát thông báo')
        .setEmoji('🖥️')
        .setDefault(selectedGroup === 'server'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Kiểm Duyệt')
        .setValue('help_group:moderation')
        .setDescription('Các lệnh ban, kick, timeout bảo mật')
        .setEmoji('🛡️')
        .setDefault(selectedGroup === 'moderation'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Tương Tác & Nút Bấm')
        .setValue('help_group:interactions')
        .setDescription('Đăng bảng ticket hỗ trợ và tự chọn role')
        .setEmoji('🔔')
        .setDefault(selectedGroup === 'interactions'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Trò Chơi')
        .setValue('help_group:games')
        .setDescription('Blackjack, Poker, Coinflip, Dice, Slots')
        .setEmoji('🎮')
        .setDefault(selectedGroup === 'games'),
      new StringSelectMenuOptionBuilder()
        .setLabel('League of Legends & TFT')
        .setValue('help_group:lol')
        .setDescription('Tra cứu đấu LoL/TFT, hồ sơ, tướng, trang bị, bảng ngọc')
        .setEmoji('⚔️')
        .setDefault(selectedGroup === 'lol' || selectedGroup === 'tft'),
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const embed = new EmbedBuilder()
    .setColor(0x6366f1)
    .setThumbnail(guild.iconURL({ size: 256 }) || client.user.displayAvatarURL());

  if (!selectedGroup) {
    embed.setTitle(`Hướng Dẫn Sử Dụng Bot - ${guild.name}`)
      .setDescription(
        `Chào mừng bạn đến với bảng hướng dẫn! Máy chủ đang sử dụng tiền tố là \`${prefix}\`.\n\n` +
        `Vui lòng chọn một danh mục câu lệnh từ trình đơn bên dưới để xem chi tiết các lệnh.\n\n` +
        `**Các danh mục khả dụng:**\n` +
        `• ⚙️ **Lệnh Chung & Custom**: Các lệnh cơ bản.\n` +
        `• 👤 **Thành Viên & Cấp Độ**: Thẻ thông tin, cấp độ XP.\n` +
        `• 🖥️ **Máy Chủ & Phát Thanh**: Thông tin server, gửi thông báo.\n` +
        `• 🛡️ **Kiểm Duyệt**: Ban, kick, dọn tin nhắn.\n` +
        `• 🔔 **Tương Tác**: Tự nhận vai trò, kênh Ticket.\n` +
        `• 🎮 **Trò Chơi**: Blackjack, Poker, Coinflip, Dice, Slots.\n` +
        `• ⚔️ **League of Legends**: Tra cứu hồ sơ, tướng, lịch sử đấu.`
      )
      .setFooter({ text: 'Sử dụng select menu bên dưới để duyệt lệnh' });
  } else {
    const meta = groupMetadata[selectedGroup];
    const groupCommands = config.commands.filter(cmd => cmd.enabled && groupMap[cmd.type] === selectedGroup);

    embed.setTitle(meta.title)
      .setDescription(meta.description + '\n\n' + (groupCommands.length ? '' : '*Không có lệnh nào được bật trong nhóm này.*'));

    for (const cmd of groupCommands) {
      const isSlash = cmdMap.has(cmd.name);
      const cmdDisplay = isSlash ? `</${cmd.name}:${cmdMap.get(cmd.name)}>` : `\`${prefix}${cmd.name}\``;
      embed.addFields({
        name: cmdDisplay,
        value: cmd.description || 'Không có mô tả.',
        inline: false
      });
    }

    embed.setFooter({ text: `Danh mục: ${meta.title} | Tổng số: ${groupCommands.length} lệnh` });
  }

  return { embeds: [embed], components: [row] };
}

function formatMessage(template, member) {
  return template
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name);
}

async function sendLog(guild, config, message) {
  if (!config.logChannelId) {
    return;
  }

  const channel = await guild.channels.fetch(config.logChannelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send(message).catch(() => null);
  }
}

async function sendTicketLog(guild, config, message) {
  const channelId = config.ticketLogChannelId || config.logChannelId;
  if (!channelId) {
    return;
  }

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send(message).catch(() => null);
  }
}

async function hasAllowedRole(guild, userId, command) {
  if (!Array.isArray(command.allowedRoles) || command.allowedRoles.length === 0) {
    return true;
  }

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    return false;
  }

  if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }

  return command.allowedRoles.some((roleId) => member.roles.cache.has(roleId));
}

const currencies = ['silver', 'gold', 'diamond'];
const gameCurrency = 'silver';
const blackjackSessions = new Map();
const pokerSessions = new Map();
const gameSessionTtlMs = 2 * 60 * 60 * 1000;

function normalizeCurrency(value) {
  const input = String(value ?? '').trim().toLowerCase();
  if (['silver', 'bac', 'bạc'].includes(input)) return 'silver';
  if (['gold', 'vang', 'vàng'].includes(input)) return 'gold';
  if (['diamond', 'kimcuong', 'kim-cuong', 'kim cương'].includes(input)) return 'diamond';
  return 'silver';
}

function isCurrencyToken(value) {
  const input = String(value ?? '').trim().toLowerCase();
  return ['silver', 'bac', 'bạc', 'gold', 'vang', 'vàng', 'diamond', 'kimcuong', 'kim-cuong', 'kim cương'].includes(input);
}

function currencyMeta(config, currency) {
  const meta = {
    silver: { name: config.currencySilverName, icon: config.currencySilverIcon },
    gold: { name: config.currencyGoldName, icon: config.currencyGoldIcon },
    diamond: { name: config.currencyDiamondName, icon: config.currencyDiamondIcon }
  }[currency] ?? { name: 'Bạc', icon: '🥈' };
  return { name: meta.name || currency, icon: meta.icon || '' };
}

function formatCurrency(config, currency, amount) {
  const meta = currencyMeta(config, currency);
  return `${meta.icon} ${amount.toLocaleString('vi-VN')} ${meta.name}`.trim();
}

function parseBet(value) {
  const amount = Number.parseInt(value, 10);
  return Number.isFinite(amount) ? amount : 0;
}

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) deck.push({ rank, suit });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === 'A') {
      aces += 1;
      total += 11;
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function formatHand(hand) {
  return hand.map((card) => `${card.rank}${card.suit}`).join(' ');
}

function playBlackjack() {
  const deck = createDeck();
  const player = [deck.pop(), deck.pop()];
  const dealer = [deck.pop(), deck.pop()];

  while (handValue(player) < 17) player.push(deck.pop());
  while (handValue(dealer) < 17) dealer.push(deck.pop());

  const playerValue = handValue(player);
  const dealerValue = handValue(dealer);
  let outcome = 'lose';
  if (playerValue > 21) outcome = 'lose';
  else if (dealerValue > 21 || playerValue > dealerValue) outcome = 'win';
  else if (playerValue === dealerValue) outcome = 'push';

  return { player, dealer, playerValue, dealerValue, outcome };
}

function playCoinflip(choice) {
  const normalizedChoice = ['tails', 'tail', 't', 'ngua'].includes(String(choice ?? '').toLowerCase()) ? 'tails' : 'heads';
  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  return { choice: normalizedChoice, result, outcome: normalizedChoice === result ? 'win' : 'lose' };
}

function playDice(target) {
  const normalizedTarget = Math.max(1, Math.min(6, Number.parseInt(target, 10) || 1));
  const roll = Math.floor(Math.random() * 6) + 1;
  return { target: normalizedTarget, roll, outcome: normalizedTarget === roll ? 'win' : 'lose' };
}

function playSlots() {
  const symbols = ['7', 'BAR', 'Cherry', 'Bell', 'Gem'];
  const reels = Array.from({ length: 3 }, () => symbols[Math.floor(Math.random() * symbols.length)]);
  const unique = new Set(reels);
  let multiplier = 0;
  if (unique.size === 1) multiplier = reels[0] === '7' ? 10 : 5;
  else if (unique.size === 2) multiplier = 2;
  return { reels, multiplier, outcome: multiplier > 0 ? 'win' : 'lose' };
}

function getGameBetLimits(config, game) {
  return {
    min: config[`${game}MinBet`] ?? config.blackjackMinBet,
    max: config[`${game}MaxBet`] ?? config.blackjackMaxBet
  };
}

function parseBetCommand({ isInteraction, source, args, defaultCurrencyIndex = 1 }) {
  const parts = args.split(/\s+/).filter(Boolean);
  return {
    parts,
    bet: isInteraction ? source.options.getInteger('bet') : parseBet(parts[0]),
    currency: gameCurrency
  };
}

async function validateGameBet({ client, guildId, userId, config, currency, bet, game, disabledMessage, reply, isInteraction }) {
  if (!config.economyEnabled || config[`${game}Enabled`] === false) {
    await reply(isInteraction ? { content: disabledMessage, ephemeral: true } : disabledMessage);
    return null;
  }

  const limits = getGameBetLimits(config, game);
  if (!Number.isInteger(bet) || bet < limits.min || bet > limits.max) {
    const message = `Bet must be between ${limits.min} and ${limits.max}.`;
    await reply(isInteraction ? { content: message, ephemeral: true } : message);
    return null;
  }

  const balance = await client.stateStore.getBalance(guildId, userId);
  if ((balance[currency] ?? 0) < bet) {
    const message = `Not enough ${currencyMeta(config, currency).name}.`;
    await reply(isInteraction ? { content: message, ephemeral: true } : message);
    return null;
  }

  return balance;
}

async function expireSessionWithRefund(client, type, map, id) {
  const session = map.get(id);
  if (!session) return;
  if (session.timeout) clearTimeout(session.timeout);
  map.delete(id);

  if (session.status !== 'active') return;

  // Refund bets for sessions abandoned via TTL
  try {
    if (type === 'blackjack' && Array.isArray(session.players)) {
      for (const player of session.players) {
        const totalBet = player.hands
          ? player.hands.reduce((sum, h) => sum + (h.bet ?? 0), 0)
          : (player.bet ?? 0);
        if (totalBet > 0 && player.userId && session.currency) {
          await client.stateStore.adjustBalance(session.guildId, player.userId, session.currency, totalBet);
        }
      }
    } else if (type === 'poker' && session.userId && session.bet > 0 && session.currency) {
      await client.stateStore.adjustBalance(session.guildId, session.userId, session.currency, session.bet);
    }
    await client.stateStore.deleteGameSession(session.guildId, type, id).catch(() => null);
    console.log(`[game] Refunded expired ${type} session ${id}`);
  } catch (err) {
    console.error(`[game] Failed to refund expired ${type} session ${id}:`, err.message);
  }
}

function expireSession(map, id) {
  const session = map.get(id);
  if (session?.timeout) clearTimeout(session.timeout);
  map.delete(id);
}

async function deletePersistedSession(client, type, session, messageId) {
  if (!session?.guildId) return;
  await client.stateStore.deleteGameSession(session.guildId, type, messageId).catch(() => null);
}

function revivePokerSession(session) {
  if (session && !(session.held instanceof Set)) {
    session.held = new Set(session.held ?? []);
  }
  return session;
}

function serializeSession(session) {
  const copy = { ...session };
  delete copy.timeout;
  if (copy.held instanceof Set) {
    copy.held = [...copy.held];
  }
  return copy;
}

async function persistGameSession(client, type, messageId, session) {
  await client.stateStore.setGameSession(session.guildId, type, messageId, serializeSession(session));
}

async function getGameSession(client, type, map, guildId, messageId) {
  let session = map.get(messageId);
  if (!session) {
    session = await client.stateStore.getGameSession(guildId, type, messageId);
    if (type === 'poker') revivePokerSession(session);
    if (session?.status === 'active') {
      session.timeout = scheduleSessionExpiry(client, type, map, messageId);
      map.set(messageId, session);
    }
  }
  return session;
}

function scheduleSessionExpiry(client, type, map, id) {
  return setTimeout(() => expireSessionWithRefund(client, type, map, id), gameSessionTtlMs);
}

function refreshSessionExpiry(client, type, map, id) {
  const session = map.get(id);
  if (!session) return;
  if (session.timeout) clearTimeout(session.timeout);
  session.timeout = scheduleSessionExpiry(client, type, map, id);
}

function visibleDealerHand(session, reveal = false) {
  return reveal ? formatHand(session.dealer) : `${session.dealer[0].rank}${session.dealer[0].suit} ??`;
}

function isPair(hand) {
  return hand.length === 2 && hand[0].rank === hand[1].rank;
}

function isNaturalBlackjack(hand) {
  return hand.length === 2 && handValue(hand) === 21;
}

function createBlackjackPlayer(user, bet, deck, balanceAfterReserved) {
  return {
    userId: user.id,
    username: user.username,
    hands: [{ cards: [deck.pop(), deck.pop()], bet, done: false, didDouble: false }],
    activeHandIndex: 0,
    balanceAfterReserved
  };
}

function blackjackHands(session) {
  return session.players.flatMap((player) => player.hands.map((handState) => ({ player, handState })));
}

function activeBlackjackPlayer(session) {
  return session.players[session.activePlayerIndex];
}

function activeBlackjackHand(session) {
  const player = activeBlackjackPlayer(session);
  return player?.hands[player.activeHandIndex];
}

function drawToBlackjackHand(session, handState) {
  handState.cards.push(session.deck.pop());
  if (handValue(handState.cards) >= 21) {
    handState.done = true;
  }
}

function advanceBlackjackHand(session) {
  while (session.activePlayerIndex < session.players.length) {
    const player = activeBlackjackPlayer(session);
    while (player.activeHandIndex < player.hands.length && player.hands[player.activeHandIndex].done) {
      player.activeHandIndex += 1;
    }
    if (player.activeHandIndex < player.hands.length) return;
    session.activePlayerIndex += 1;
  }
}

function settleBlackjackSession(client, session) {
  while (shouldDealerHit(session)) {
    session.dealer.push(session.deck.pop());
  }

  const dealerValue = handValue(session.dealer);
  let totalPayout = 0;
  const results = [];
  for (const { player, handState } of blackjackHands(session)) {
    if (handState.outcome === 'canceled') {
      // Refund the original bet on cancel
      handState.payout = handState.bet ?? 0;
      results.push(`${player.username}: ${formatHand(handState.cards)} - canceled (refunded)`);
      continue;
    }
    const playerValue = handValue(handState.cards);
    let outcome = 'lose';
    let payout = 0;
    if (playerValue > 21) {
      outcome = 'bust';
    } else if (isNaturalBlackjack(handState.cards) && player.hands.length === 1 && !isNaturalBlackjack(session.dealer)) {
      outcome = 'blackjack';
      payout = Math.floor(handState.bet * 2.5);
    } else if (dealerValue > 21 || playerValue > dealerValue) {
      outcome = 'win';
      payout = handState.bet * 2;
    } else if (playerValue === dealerValue) {
      outcome = 'push';
      payout = handState.bet;
    }
    handState.outcome = outcome;
    handState.payout = payout;
    totalPayout += payout;
    results.push(`${player.username}: ${formatHand(handState.cards)} (${playerValue}) - ${outcome}`);
  }

  session.status = 'finished';
  return { totalPayout, results };
}

function hasSoftAce(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === 'A') {
      aces += 1;
      total += 11;
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }
  return aces > 0 && total <= 21;
}

function chance(percent) {
  return Math.random() * 100 < percent;
}

function shouldDealerHit(session) {
  const dealerValue = handValue(session.dealer);
  if (dealerValue <= 11) return true;
  if (dealerValue >= 21) return false;

  const livePlayerValues = blackjackHands(session)
    .map(({ handState }) => handValue(handState.cards))
    .filter((value) => value <= 21);
  if (livePlayerValues.length === 0) return false;

  const bestPlayerValue = Math.max(...livePlayerValues);
  const soft = hasSoftAce(session.dealer);

  if (dealerValue < bestPlayerValue) {
    if (dealerValue <= 15) return true;
    if (dealerValue === 16) return chance(75);
    if (dealerValue === 17 && soft) return chance(55);
    if (dealerValue === 17) return chance(25);
    if (dealerValue === 18) return chance(10);
  }

  if (dealerValue <= 14) return chance(70);
  if (dealerValue === 15) return chance(45);
  if (dealerValue === 16) return chance(30);
  if (dealerValue === 17 && soft) return chance(20);
  return false;
}

function buildBlackjackPayload(config, session) {
  const finished = session.status === 'finished';
  const activePlayer = activeBlackjackPlayer(session);
  const fields = [
    `Currency: ${currencyMeta(config, session.currency).name}`,
    `Table bet: ${formatCurrency(config, session.currency, session.bet)}`,
    finished ? '' : `Turn: ${activePlayer ? `<@${activePlayer.userId}>` : 'dealer'}`,
    `Dealer: ${visibleDealerHand(session, finished)} (${finished ? handValue(session.dealer) : '?'})`,
    ...session.players.flatMap((player, playerIndex) =>
      player.hands.map((handState, handIndex) => {
        const marker = !finished && playerIndex === session.activePlayerIndex && handIndex === player.activeHandIndex ? '>' : '-';
        const suffix = handState.outcome ? ` | ${handState.outcome}` : '';
        return `${marker} <@${player.userId}> hand ${handIndex + 1}: ${formatHand(handState.cards)} (${handValue(handState.cards)}) | Bet ${handState.bet}${suffix}`;
      })
    )
  ].filter(Boolean);

  if (finished) {
    fields.push(`Payout: ${formatCurrency(config, session.currency, session.totalPayout ?? 0)}`);
    fields.push(...session.players.map((player) => `<@${player.userId}> balance: ${formatCurrency(config, session.currency, player.finalBalance ?? 0)}`));
  }

  const active = activeBlackjackHand(session);
  const canAct = !finished && active;
  const canDouble = canAct && active.cards.length === 2 && !active.didDouble && activePlayer.balanceAfterReserved >= active.bet;
  const canSplit = canAct && activePlayer.hands.length < 2 && isPair(active.cards) && activePlayer.balanceAfterReserved >= active.bet;
  const embed = new EmbedBuilder()
    .setTitle(finished ? 'Blackjack - finished' : 'Blackjack')
    .setDescription(fields.join('\n'))
    .setColor(finished ? 0x5865f2 : 0x3ba55d)
    .setFooter({ text: 'Only the current player can act. Others can Join with the same Silver bet before dealer resolves.' });

  const components = canAct
    ? [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bj:join').setLabel('Join').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('bj:hit').setLabel('Hit').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bj:stand').setLabel('Theo / Stand').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('bj:double').setLabel('x2').setStyle(ButtonStyle.Success).setDisabled(!canDouble),
        new ButtonBuilder().setCustomId('bj:split').setLabel('Split').setStyle(ButtonStyle.Success).setDisabled(!canSplit)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bj:cancel').setLabel('Huy').setStyle(ButtonStyle.Danger)
      )
    ]
    : [];

  return { embeds: [embed], components };
}

async function finishBlackjackSession(client, session, config) {
  const result = settleBlackjackSession(client, session);
  session.totalPayout = result.totalPayout;
  if (result.totalPayout > 0) {
    for (const player of session.players) {
      const playerPayout = player.hands.reduce((sum, handState) => sum + (handState.payout ?? 0), 0);
      const next = playerPayout > 0
        ? await client.stateStore.adjustBalance(session.guildId, player.userId, session.currency, playerPayout)
        : await client.stateStore.getBalance(session.guildId, player.userId);
      player.finalBalance = next[session.currency] ?? 0;
    }
  } else {
    for (const player of session.players) {
      const balance = await client.stateStore.getBalance(session.guildId, player.userId);
      player.finalBalance = balance[session.currency] ?? 0;
    }
  }
  return buildBlackjackPayload(config, session);
}

function rankNumber(rank) {
  if (rank === 'A') return 14;
  if (rank === 'K') return 13;
  if (rank === 'Q') return 12;
  if (rank === 'J') return 11;
  return Number(rank);
}

function evaluateVideoPoker(hand) {
  const values = hand.map((card) => rankNumber(card.rank)).sort((a, b) => a - b);
  const suits = new Set(hand.map((card) => card.suit));
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a);
  const isFlush = suits.size === 1;
  const wheel = values.join(',') === '2,3,4,5,14';
  const isStraight = wheel || values.every((value, index) => index === 0 || value === values[index - 1] + 1);
  const highPair = [...counts.entries()].some(([value, count]) => count === 2 && value >= 11);

  if (isFlush && values.join(',') === '10,11,12,13,14') return { name: 'Royal flush', multiplier: 250 };
  if (isFlush && isStraight) return { name: 'Straight flush', multiplier: 50 };
  if (groups[0] === 4) return { name: 'Four of a kind', multiplier: 25 };
  if (groups[0] === 3 && groups[1] === 2) return { name: 'Full house', multiplier: 9 };
  if (isFlush) return { name: 'Flush', multiplier: 6 };
  if (isStraight) return { name: 'Straight', multiplier: 4 };
  if (groups[0] === 3) return { name: 'Three of a kind', multiplier: 3 };
  if (groups[0] === 2 && groups[1] === 2) return { name: 'Two pair', multiplier: 2 };
  if (highPair) return { name: 'Jacks or better', multiplier: 1 };
  return { name: 'No win', multiplier: 0 };
}

function buildPokerPayload(config, session) {
  const finished = session.status === 'finished';
  const heldText = session.held.size ? [...session.held].map((index) => index + 1).join(', ') : 'none';
  const result = finished ? evaluateVideoPoker(session.hand) : null;
  const embed = new EmbedBuilder()
    .setTitle(finished ? 'Video Poker - finished' : 'Video Poker - Jacks or Better')
    .setDescription([
      `Bet: ${formatCurrency(config, session.currency, session.bet)}`,
      `Hand: ${session.hand.map((card, index) => `${index + 1}:${card.rank}${card.suit}${session.held.has(index) ? '*' : ''}`).join(' ')}`,
      `Held: ${heldText}`,
      finished ? `Result: ${result.name} (${result.multiplier}x)` : 'Select cards to hold, then Draw.',
      finished ? `Balance: ${formatCurrency(config, session.currency, session.finalBalance ?? 0)}` : ''
    ].filter(Boolean).join('\n'))
    .setColor(finished ? 0x5865f2 : 0xd8b428)
    .setFooter({ text: 'Pay table: Jacks+ 1x, two pair 2x, trips 3x, straight 4x, flush 6x, full house 9x, quads 25x.' });

  const components = finished
    ? []
    : [
      new ActionRowBuilder().addComponents(
        ...session.hand.map((card, index) =>
          new ButtonBuilder()
            .setCustomId(`vp:hold:${session.userId}:${index}`)
            .setLabel(`${index + 1}${session.held.has(index) ? ' held' : ''}`)
            .setStyle(session.held.has(index) ? ButtonStyle.Success : ButtonStyle.Secondary)
        )
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`vp:draw:${session.userId}`).setLabel('Draw').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`vp:cancel:${session.userId}`).setLabel('Huy').setStyle(ButtonStyle.Danger)
      )
    ];

  return { embeds: [embed], components };
}

async function finishPokerSession(client, session, config, canceled = false) {
  session.status = 'finished';
  let payout = 0;
  if (canceled) {
    // Refund the full bet on cancel
    payout = session.bet;
  } else {
    for (let i = 0; i < session.hand.length; i += 1) {
      if (!session.held.has(i)) {
        session.hand[i] = session.deck.pop();
      }
    }
    payout = session.bet * evaluateVideoPoker(session.hand).multiplier;
  }
  session.payout = payout;
  if (payout > 0) {
    const next = await client.stateStore.adjustBalance(session.guildId, session.userId, session.currency, payout);
    session.finalBalance = next[session.currency] ?? 0;
  } else {
    const balance = await client.stateStore.getBalance(session.guildId, session.userId);
    session.finalBalance = balance[session.currency] ?? 0;
  }
  return buildPokerPayload(config, session);
}

function buildCommandList(config) {
  const prefix = config.prefix === '/' ? '/' : config.prefix || '!';
  return config.commands
    .filter((command) => command.enabled)
    .map((command) => {
      const description = command.description ? ` - ${command.description}` : '';
      return `${prefix}${command.name}${description}`;
    })
    .join('\n');
}

function getContextValue(context, key) {
  return typeof context[key] === 'function' ? context[key]() : context[key];
}

function renderCommandResponse(template, { client, context, config, args }) {
  const commandCount = config.commands.filter((command) => command.enabled).length;
  const riotKey = config.riotApiKey;
  const tftKey = config.tftApiKey;
  const riotKeyStatus = riotKey ? `✅ Đã cấu hình (${riotKey.slice(0, 8)}…)` : '❌ Chưa cấu hình';
  const tftKeyStatus = tftKey ? `✅ Riêng (${tftKey.slice(0, 8)}…)` : (riotKey ? '♻️ Dùng chung LoL key' : '❌ Chưa cấu hình');
  return template
    .replaceAll('{args}', args)
    .replaceAll('{autoReplyStatus}', config.autoReplyEnabled ? 'on' : 'off')
    .replaceAll('{channel}', `<#${getContextValue(context, 'channelId')}>`)
    .replaceAll('{commandCount}', String(commandCount))
    .replaceAll('{commands}', buildCommandList(config))
    .replaceAll('{ping}', String(client.ws.ping))
    .replaceAll('{prefix}', config.prefix || '!')
    .replaceAll('{riotKeyStatus}', riotKeyStatus)
    .replaceAll('{tftKeyStatus}', tftKeyStatus)
    .replaceAll('{server}', getContextValue(context, 'guildName'))
    .replaceAll('{user}', `<@${getContextValue(context, 'userId')}>`)
    .replaceAll('{username}', getContextValue(context, 'username'))
    .replaceAll('{welcomeStatus}', config.welcomeEnabled ? 'on' : 'off');
}

function buildSlashCommands(config) {
  return config.commands
    .filter((command) => command.enabled)
    .map((command) => ({
      name: command.name,
      description: command.description || `Run ${command.name}`,
      dmPermission: false,
      options: buildSlashOptions(command)
    }));
}

function buildSlashOptions(command) {
  if (command.type === 'help') {
    return [
      {
        name: 'group',
        description: 'Chọn nhóm câu lệnh cần trợ giúp',
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: '⚙️ Lệnh Chung & Custom', value: 'general' },
          { name: '👤 Thành Viên & Cấp Độ', value: 'user' },
          { name: '🖥️ Máy Chủ & Phát Thanh', value: 'server' },
          { name: '🛡️ Kiểm Duyệt & Bảo Mật', value: 'moderation' },
          { name: '🔔 Tương Tác & Nút Bấm', value: 'interactions' },
          { name: '⚔️ League of Legends & TFT', value: 'lol' },
        ]
      }
    ];
  }

  if (['warnings', 'clearwarns'].includes(command.type)) {
    return [
      {
        name: 'target',
        description: 'Target user',
        type: ApplicationCommandOptionType.User,
        required: true
      }
    ];
  }

  if (command.type === 'balance') {
    return [
      {
        name: 'target',
        description: 'User to inspect',
        type: ApplicationCommandOptionType.User,
        required: false
      }
    ];
  }

  if (command.type === 'economyleaderboard') {
    return [
      {
        name: 'currency',
        description: 'Currency leaderboard',
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: 'Bạc', value: 'silver' },
          { name: 'Vàng', value: 'gold' },
          { name: 'Kim cương', value: 'diamond' }
        ]
      }
    ];
  }

  if (['blackjack', 'poker', 'slots'].includes(command.type)) {
    return [
      {
        name: 'bet',
        description: 'Bet amount',
        type: ApplicationCommandOptionType.Integer,
        minValue: 1,
        required: true
      },
    ];
  }

  if (command.type === 'coinflip') {
    return [
      {
        name: 'bet',
        description: 'Bet amount',
        type: ApplicationCommandOptionType.Integer,
        minValue: 1,
        required: true
      },
      {
        name: 'side',
        description: 'Pick heads or tails',
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: 'Heads', value: 'heads' },
          { name: 'Tails', value: 'tails' }
        ]
      }
    ];
  }

  if (command.type === 'dice') {
    return [
      {
        name: 'bet',
        description: 'Bet amount',
        type: ApplicationCommandOptionType.Integer,
        minValue: 1,
        required: true
      },
      {
        name: 'number',
        description: 'Pick a number from 1 to 6',
        type: ApplicationCommandOptionType.Integer,
        minValue: 1,
        maxValue: 6,
        required: true
      }
    ];
  }

  if (['ecoadd', 'ecoset', 'ecoremove'].includes(command.type)) {
    return [
      {
        name: 'target',
        description: 'Target user',
        type: ApplicationCommandOptionType.User,
        required: true
      },
      {
        name: 'currency',
        description: 'Currency',
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          { name: 'Bạc', value: 'silver' },
          { name: 'Vàng', value: 'gold' },
          { name: 'Kim cương', value: 'diamond' }
        ]
      },
      {
        name: 'amount',
        description: 'Amount',
        type: ApplicationCommandOptionType.Integer,
        minValue: 0,
        required: true
      }
    ];
  }

  if (['warn', 'kick', 'ban'].includes(command.type)) {
    return [
      {
        name: 'target',
        description: 'Target user',
        type: ApplicationCommandOptionType.User,
        required: true
      },
      {
        name: 'reason',
        description: 'Reason',
        type: ApplicationCommandOptionType.String,
        required: false
      }
    ];
  }

  if (command.type === 'timeout') {
    return [
      {
        name: 'target',
        description: 'Target user',
        type: ApplicationCommandOptionType.User,
        required: true
      },
      {
        name: 'minutes',
        description: 'Timeout duration in minutes',
        type: ApplicationCommandOptionType.Integer,
        minValue: 1,
        maxValue: 10080,
        required: true
      },
      {
        name: 'reason',
        description: 'Reason',
        type: ApplicationCommandOptionType.String,
        required: false
      }
    ];
  }

  if (['user', 'avatar', 'rank'].includes(command.type)) {
    return [
      {
        name: 'target',
        description: 'User to inspect',
        type: ApplicationCommandOptionType.User,
        required: false
      }
    ];
  }

  if (command.type === 'say') {
    return [
      {
        name: 'message',
        description: 'Message to send',
        type: ApplicationCommandOptionType.String,
        required: true
      }
    ];
  }

  if (command.type === 'announce') {
    return [
      {
        name: 'message',
        description: 'Announcement text',
        type: ApplicationCommandOptionType.String,
        required: true
      }
    ];
  }

  if (command.type === 'purge') {
    return [
      {
        name: 'amount',
        description: 'Number of messages to delete, 1-100',
        type: ApplicationCommandOptionType.Integer,
        minValue: 1,
        maxValue: 100,
        required: true
      }
    ];
  }

  // ── League of Legends ───────────────────────────────────────────────────
  if (['lsd', 'lolprofile', 'lolmatch', 'lolchamp', 'lolitem', 'lolrunes', 'lolpatch', 'lollink', 'lolunlink'].includes(command.type)) {
    return buildLolSlashOptions(command.type);
  }

  // ── Teamfight Tactics ────────────────────────────────────────────────────
  if (['tftlsd', 'tftprofile', 'tftmatch', 'tftlink', 'tftunlink'].includes(command.type)) {
    return buildTftSlashOptions(command.type);
  }

  return [
    {
      name: 'args',
      description: 'Optional text arguments',
      type: ApplicationCommandOptionType.String,
      required: false
    }
  ];
}

function buildServerEmbed(guild) {
  return new EmbedBuilder()
    .setTitle(guild.name)
    .setThumbnail(guild.iconURL({ size: 256 }))
    .addFields(
      { name: 'Members', value: String(guild.memberCount ?? 'Unknown'), inline: true },
      { name: 'Channels', value: String(guild.channels.cache.size), inline: true },
      { name: 'Roles', value: String(guild.roles.cache.size), inline: true },
      { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
    )
    .setColor(0x2864d8);
}

function buildUserEmbed(user, member = null) {
  const embed = new EmbedBuilder()
    .setTitle(user.tag ?? user.username)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'User ID', value: user.id, inline: true },
      { name: 'Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
    )
    .setColor(0x2864d8);

  if (member?.joinedTimestamp) {
    embed.addFields({ name: 'Joined', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true });
  }

  return embed;
}

function buildAvatarEmbed(user) {
  return new EmbedBuilder()
    .setTitle(`${user.username}'s avatar`)
    .setImage(user.displayAvatarURL({ size: 1024 }))
    .setColor(0x2864d8);
}

async function resolveMentionedUser(client, guild, args, fallbackUser) {
  const id = args.match(/\d{17,20}/)?.[0] ?? fallbackUser.id;
  const member = await guild.members.fetch(id).catch(() => null);
  const user = member?.user ?? (await client.users.fetch(id).catch(() => null)) ?? fallbackUser;
  return { user, member };
}

async function runBuiltInCommand({ client, config, command, source, args }) {
  const isInteraction = 'isChatInputCommand' in source;
  const guild = source.guild;
  const channel = source.channel;
  const user = isInteraction ? source.user : source.author;
  const permissions = isInteraction ? source.memberPermissions : source.member?.permissions;

  const reply = async (payload) => {
    if (isInteraction) {
      if (source.deferred || source.replied) {
        return source.followUp(payload);
      }
      return source.reply(payload);
    }
    return source.reply(payload);
  };

  const context = {
    channelId: channel.id,
    guildName: guild.name,
    userId: user.id,
    username: user.username
  };

  const hasCommandAccess = await hasAllowedRole(guild, user.id, command);
  if (!hasCommandAccess) {
    return reply(isInteraction ? { content: 'You do not have permission to use this command.', ephemeral: true } : 'You do not have permission to use this command.');
  }

  if (command.type === 'help') {
    let selectedGroup = null;
    if (isInteraction) {
      selectedGroup = source.options.getString('group');
    } else {
      const lowerArgs = args?.trim().toLowerCase();
      if (['chung', 'general', 'custom', 'lệnh chung'].includes(lowerArgs)) {
        selectedGroup = 'general';
      } else if (['thành viên', 'user', 'member', 'levels', 'xp', 'rank', 'cấp độ'].includes(lowerArgs)) {
        selectedGroup = 'user';
      } else if (['máy chủ', 'server', 'broadcast', 'phát thanh', 'announcement'].includes(lowerArgs)) {
        selectedGroup = 'server';
      } else if (['kiểm duyệt', 'moderation', 'mod', 'security', 'bảo mật'].includes(lowerArgs)) {
        selectedGroup = 'moderation';
      } else if (['tương tác', 'interactions', 'role', 'ticket', 'nút bấm'].includes(lowerArgs)) {
        selectedGroup = 'interactions';
      } else if (['lol', 'league', 'liên minh', 'lsd', 'tướng', 'tft', 'teamfight', 'tactics', 'tftlsd', 'đấu trường'].includes(lowerArgs)) {
        selectedGroup = 'lol';
      }
    }

    const payload = await buildHelpPayload(client, config, guild, user.id, selectedGroup);
    return reply(payload);
  }

  if (['custom', 'ping', 'config'].includes(command.type)) {
    return reply(renderCommandResponse(command.response, { client, context, config, args }));
  }

  if (command.type === 'server') {
    return reply({ embeds: [buildServerEmbed(guild)] });
  }

  if (command.type === 'user' || command.type === 'avatar') {
    const selectedUser = isInteraction ? source.options.getUser('target') ?? user : null;
    const target = selectedUser
      ? { user: selectedUser, member: await guild.members.fetch(selectedUser.id).catch(() => null) }
      : await resolveMentionedUser(client, guild, args, user);
    const embed = command.type === 'avatar' ? buildAvatarEmbed(target.user) : buildUserEmbed(target.user, target.member);
    return reply({ embeds: [embed] });
  }

  if (command.type === 'say') {
    if (!permissions?.has(PermissionFlagsBits.ManageMessages) && !permissions?.has(PermissionFlagsBits.ManageGuild)) {
      return reply(isInteraction ? { content: 'You need Manage Messages or Manage Server permission.', ephemeral: true } : 'You need Manage Messages or Manage Server permission.');
    }

    const messageText = isInteraction ? source.options.getString('message') : args;
    if (!messageText?.trim()) {
      return reply(isInteraction ? { content: 'Missing message.', ephemeral: true } : 'Missing message.');
    }
    if (isInteraction) {
      await source.reply({ content: 'Sent.', ephemeral: true });
      return channel.send(messageText);
    }
    await source.delete().catch(() => null);
    return channel.send(messageText);
  }

  if (command.type === 'purge') {
    const amount = isInteraction ? source.options.getInteger('amount') : Number.parseInt(args, 10);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      return reply(isInteraction ? { content: 'Amount must be between 1 and 100.', ephemeral: true } : 'Amount must be between 1 and 100.');
    }
    if (!permissions?.has(PermissionFlagsBits.ManageMessages)) {
      return reply(isInteraction ? { content: 'You need Manage Messages permission.', ephemeral: true } : 'You need Manage Messages permission.');
    }
    if (!channel.permissionsFor(client.user)?.has(PermissionFlagsBits.ManageMessages)) {
      return reply(isInteraction ? { content: 'Bot needs Manage Messages permission in this channel.', ephemeral: true } : 'Bot needs Manage Messages permission in this channel.');
    }
    const deleted = await channel.bulkDelete(amount, true);
    const content = renderCommandResponse(command.response, {
      client,
      context,
      config,
      args: String(amount)
    }).replaceAll('{count}', String(deleted.size));
    return reply(isInteraction ? { content, ephemeral: true } : content);
  }

  if (['warn', 'kick', 'ban', 'timeout'].includes(command.type)) {
    if (!config.moderationEnabled) {
      return reply(isInteraction ? { content: 'Moderation is disabled.', ephemeral: true } : 'Moderation is disabled.');
    }

    const targetUser = isInteraction ? source.options.getUser('target') : null;
    const target = targetUser
      ? { user: targetUser, member: await guild.members.fetch(targetUser.id).catch(() => null) }
      : await resolveMentionedUser(client, guild, args, user);
    const reason = isInteraction
      ? source.options.getString('reason') ?? 'No reason provided'
      : args.replace(/<@!?\d{17,20}>/, '').replace(/\b\d+\b/, '').trim() || 'No reason provided';

    if (!target.member && command.type !== 'warn') {
      return reply(isInteraction ? { content: 'Target member not found.', ephemeral: true } : 'Target member not found.');
    }

    if (command.type === 'kick') {
      if (!permissions?.has(PermissionFlagsBits.KickMembers)) {
        return reply(isInteraction ? { content: 'You need Kick Members permission.', ephemeral: true } : 'You need Kick Members permission.');
      }
      if (!guild.members.me?.permissions.has(PermissionFlagsBits.KickMembers)) {
        return reply(isInteraction ? { content: 'Bot needs Kick Members permission.', ephemeral: true } : 'Bot needs Kick Members permission.');
      }
      await target.member.kick(reason);
    }

    if (command.type === 'ban') {
      if (!permissions?.has(PermissionFlagsBits.BanMembers)) {
        return reply(isInteraction ? { content: 'You need Ban Members permission.', ephemeral: true } : 'You need Ban Members permission.');
      }
      if (!guild.members.me?.permissions.has(PermissionFlagsBits.BanMembers)) {
        return reply(isInteraction ? { content: 'Bot needs Ban Members permission.', ephemeral: true } : 'Bot needs Ban Members permission.');
      }
      await target.member.ban({ reason });
    }

    if (command.type === 'timeout') {
      if (!permissions?.has(PermissionFlagsBits.ModerateMembers)) {
        return reply(isInteraction ? { content: 'You need Moderate Members permission.', ephemeral: true } : 'You need Moderate Members permission.');
      }
      if (!guild.members.me?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return reply(isInteraction ? { content: 'Bot needs Moderate Members permission.', ephemeral: true } : 'Bot needs Moderate Members permission.');
      }
      const minutes = isInteraction ? source.options.getInteger('minutes') : Number.parseInt(args.match(/\b\d+\b/)?.[0] ?? '10', 10);
      await target.member.timeout(Math.min(minutes, 10080) * 60 * 1000, reason);
      const content = command.response
        .replaceAll('{target}', `<@${target.user.id}>`)
        .replaceAll('{reason}', reason)
        .replaceAll('{minutes}', String(minutes));
      await sendLog(guild, config, content);
      return reply(isInteraction ? { content, ephemeral: true } : content);
    }

    const content = command.response.replaceAll('{target}', `<@${target.user.id}>`).replaceAll('{reason}', reason);
    if (command.type === 'warn') {
      await client.stateStore.addWarning(guild.id, target.user.id, user.id, reason);
    }
    await sendLog(guild, config, content);
    return reply(isInteraction ? { content, ephemeral: true } : content);
  }

  if (['warnings', 'clearwarns'].includes(command.type)) {
    if (!config.moderationEnabled) {
      return reply(isInteraction ? { content: 'Moderation is disabled.', ephemeral: true } : 'Moderation is disabled.');
    }
    const targetUser = isInteraction ? source.options.getUser('target') : null;
    const target = targetUser
      ? { user: targetUser, member: await guild.members.fetch(targetUser.id).catch(() => null) }
      : await resolveMentionedUser(client, guild, args, user);

    if (command.type === 'clearwarns') {
      if (!permissions?.has(PermissionFlagsBits.ManageMessages)) {
        return reply(isInteraction ? { content: 'You need Manage Messages permission.', ephemeral: true } : 'You need Manage Messages permission.');
      }
      const count = await client.stateStore.clearWarnings(guild.id, target.user.id);
      const content = command.response.replaceAll('{target}', `<@${target.user.id}>`).replaceAll('{count}', String(count));
      await sendLog(guild, config, content);
      return reply(isInteraction ? { content, ephemeral: true } : content);
    }

    const warnings = await client.stateStore.getWarnings(guild.id, target.user.id);
    const embed = new EmbedBuilder()
      .setTitle(`Warnings for ${target.user.username}`)
      .setColor(0xd88928)
      .setDescription(
        warnings.length
          ? warnings
            .slice(-10)
            .map((warning, index) => `${index + 1}. <t:${Math.floor(new Date(warning.createdAt).getTime() / 1000)}:R> by <@${warning.moderatorId}> - ${warning.reason}`)
            .join('\n')
          : 'No warnings.'
      );
    return reply({ embeds: [embed], ephemeral: isInteraction });
  }

  if (command.type === 'rank') {
    if (!config.levelsEnabled) {
      return reply(isInteraction ? { content: 'Levels are disabled.', ephemeral: true } : 'Levels are disabled.');
    }
    const targetUser = isInteraction ? source.options.getUser('target') ?? user : null;
    const target = targetUser
      ? { user: targetUser, member: await guild.members.fetch(targetUser.id).catch(() => null) }
      : await resolveMentionedUser(client, guild, args, user);
    const rank = await client.stateStore.getRank(guild.id, target.user.id);
    return reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`${target.user.username}'s rank`)
          .addFields({ name: 'Level', value: String(rank.level), inline: true }, { name: 'XP', value: String(rank.xp), inline: true })
          .setColor(0x2864d8)
      ]
    });
  }

  if (command.type === 'leaderboard') {
    if (!config.levelsEnabled) {
      return reply(isInteraction ? { content: 'Levels are disabled.', ephemeral: true } : 'Levels are disabled.');
    }
    const top = await client.stateStore.getLeaderboard(guild.id, 10);
    const description = top.length
      ? top.map((entry, index) => `${index + 1}. <@${entry.userId}> - level ${entry.level}, ${entry.xp} XP`).join('\n')
      : 'No XP yet.';
    return reply({ embeds: [new EmbedBuilder().setTitle('Leaderboard').setDescription(description).setColor(0x2864d8)] });
  }

  if (command.type === 'balance') {
    if (!config.economyEnabled) {
      return reply(isInteraction ? { content: 'Economy is disabled.', ephemeral: true } : 'Economy is disabled.');
    }
    const targetUser = isInteraction ? source.options.getUser('target') ?? user : null;
    const target = targetUser
      ? { user: targetUser, member: await guild.members.fetch(targetUser.id).catch(() => null) }
      : await resolveMentionedUser(client, guild, args, user);
    const balance = await client.stateStore.getBalance(guild.id, target.user.id);
    return reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`${target.user.username}'s balance`)
          .setDescription(currencies.map((currency) => formatCurrency(config, currency, balance[currency] ?? 0)).join('\n'))
          .setColor(0xd8b428)
      ]
    });
  }

  if (command.type === 'daily') {
    if (!config.economyEnabled || !config.dailyEnabled) {
      return reply(isInteraction ? { content: 'Daily rewards are disabled.', ephemeral: true } : 'Daily rewards are disabled.');
    }
    const rewards = {
      silver: config.dailySilverAmount,
      gold: config.dailyGoldAmount,
      diamond: config.dailyDiamondAmount
    };
    // dailyResetUtcOffset from config (minutes, e.g. 420 = UTC+7).
    // Falls back to DAILY_RESET_UTC_OFFSET_MINUTES env var, then UTC+7.
    const utcOffset =
      Number.isFinite(config.dailyResetUtcOffset)
        ? config.dailyResetUtcOffset
        : (Number.parseInt(process.env.DAILY_RESET_UTC_OFFSET_MINUTES, 10) || 420);
    const result = await client.stateStore.claimDaily(guild.id, user.id, rewards, {
      utcOffsetMinutes: utcOffset
    });
    if (!result.claimed) {
      return reply(isInteraction ? { content: `You can claim daily again <t:${Math.floor(result.nextAt / 1000)}:R>.`, ephemeral: true } : `You can claim daily again <t:${Math.floor(result.nextAt / 1000)}:R>.`);
    }
    const claimed = currencies
      .filter((currency) => rewards[currency] > 0)
      .map((currency) => formatCurrency(config, currency, rewards[currency]))
      .join('\n') || 'No rewards configured.';
    return reply({ embeds: [new EmbedBuilder().setTitle('Daily claimed').setDescription(claimed).setColor(0x3ba55d)] });
  }

  if (command.type === 'economyleaderboard') {
    if (!config.economyEnabled) {
      return reply(isInteraction ? { content: 'Economy is disabled.', ephemeral: true } : 'Economy is disabled.');
    }
    const currency = normalizeCurrency(isInteraction ? source.options.getString('currency') : args.split(/\s+/)[0]);
    const top = await client.stateStore.getEconomyLeaderboard(guild.id, currency, 10);
    const meta = currencyMeta(config, currency);
    const description = top.length
      ? top.map((entry, index) => `${index + 1}. <@${entry.userId}> - ${formatCurrency(config, currency, entry.amount)}`).join('\n')
      : `No ${meta.name} yet.`;
    return reply({ embeds: [new EmbedBuilder().setTitle(`${meta.icon} ${meta.name} leaderboard`).setDescription(description).setColor(0xd8b428)] });
  }

  if (command.type === 'blackjack') {
    const { bet, currency } = parseBetCommand({ isInteraction, source, args });
    const balance = await validateGameBet({
      client,
      guildId: guild.id,
      userId: user.id,
      config,
      currency,
      bet,
      game: 'blackjack',
      disabledMessage: 'Blackjack is disabled.',
      reply,
      isInteraction
    });
    if (!balance) return;
    const reserved = await client.stateStore.adjustBalance(guild.id, user.id, currency, -bet);
    const deck = createDeck();
    const session = {
      guildId: guild.id,
      currency,
      bet,
      deck,
      dealer: [deck.pop(), deck.pop()],
      players: [createBlackjackPlayer(user, bet, deck, reserved[currency] ?? 0)],
      activePlayerIndex: 0,
      status: 'active',
      createdAt: Date.now()
    };

    const sent = await reply(buildBlackjackPayload(config, session));
    const message = isInteraction ? await source.fetchReply().catch(() => null) : sent;
    if (message?.id) {
      session.messageId = message.id;
      session.timeout = scheduleSessionExpiry(client, 'blackjack', blackjackSessions, message.id);
      blackjackSessions.set(message.id, session);
      await persistGameSession(client, 'blackjack', message.id, session);
    }
    return;
  }

  if (command.type === 'poker') {
    const { bet, currency } = parseBetCommand({ isInteraction, source, args });
    const balance = await validateGameBet({
      client,
      guildId: guild.id,
      userId: user.id,
      config,
      currency,
      bet,
      game: 'poker',
      disabledMessage: 'Poker is disabled.',
      reply,
      isInteraction
    });
    if (!balance) return;

    await client.stateStore.adjustBalance(guild.id, user.id, currency, -bet);
    const deck = createDeck();
    const session = {
      guildId: guild.id,
      userId: user.id,
      currency,
      bet,
      deck,
      hand: [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()],
      held: new Set(),
      status: 'active',
      createdAt: Date.now()
    };
    const sent = await reply(buildPokerPayload(config, session));
    const message = isInteraction ? await source.fetchReply().catch(() => null) : sent;
    if (message?.id) {
      session.messageId = message.id;
      session.timeout = scheduleSessionExpiry(client, 'poker', pokerSessions, message.id);
      pokerSessions.set(message.id, session);
      await persistGameSession(client, 'poker', message.id, session);
    }
    return;
  }

  if (command.type === 'coinflip') {
    const parts = args.split(/\s+/).filter(Boolean);
    const bet = isInteraction ? source.options.getInteger('bet') : parseBet(parts[0]);
    const sideArg = isInteraction ? source.options.getString('side') : parts[1];
    const currency = gameCurrency;
    const balance = await validateGameBet({
      client,
      guildId: guild.id,
      userId: user.id,
      config,
      currency,
      bet,
      game: 'coinflip',
      disabledMessage: 'Coinflip is disabled.',
      reply,
      isInteraction
    });
    if (!balance) return;

    const game = playCoinflip(sideArg);
    const delta = game.outcome === 'win' ? bet : -bet;
    const nextBalance = await client.stateStore.adjustBalance(guild.id, user.id, currency, delta);
    return reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(game.outcome === 'win' ? 'Coinflip - won' : 'Coinflip - lost')
          .setDescription([
            `Bet: ${formatCurrency(config, currency, bet)}`,
            `Pick: ${game.choice}`,
            `Result: ${game.result}`,
            `Balance: ${formatCurrency(config, currency, nextBalance[currency] ?? balance[currency])}`
          ].join('\n'))
          .setColor(game.outcome === 'win' ? 0x3ba55d : 0xed4245)
      ]
    });
  }

  if (command.type === 'dice') {
    const { parts, bet, currency } = parseBetCommand({ isInteraction, source, args, defaultCurrencyIndex: 2 });
    const balance = await validateGameBet({
      client,
      guildId: guild.id,
      userId: user.id,
      config,
      currency,
      bet,
      game: 'dice',
      disabledMessage: 'Dice is disabled.',
      reply,
      isInteraction
    });
    if (!balance) return;

    const target = isInteraction ? source.options.getInteger('number') : parts[1];
    const game = playDice(target);
    const delta = game.outcome === 'win' ? bet * 5 : -bet;
    const nextBalance = await client.stateStore.adjustBalance(guild.id, user.id, currency, delta);
    return reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(game.outcome === 'win' ? 'Dice - won' : 'Dice - lost')
          .setDescription([
            `Bet: ${formatCurrency(config, currency, bet)}`,
            `Pick: ${game.target}`,
            `Roll: ${game.roll}`,
            `Payout: ${game.outcome === 'win' ? '6x' : '0x'}`,
            `Balance: ${formatCurrency(config, currency, nextBalance[currency] ?? balance[currency])}`
          ].join('\n'))
          .setColor(game.outcome === 'win' ? 0x3ba55d : 0xed4245)
      ]
    });
  }

  if (command.type === 'slots') {
    const { bet, currency } = parseBetCommand({ isInteraction, source, args });
    const balance = await validateGameBet({
      client,
      guildId: guild.id,
      userId: user.id,
      config,
      currency,
      bet,
      game: 'slots',
      disabledMessage: 'Slots is disabled.',
      reply,
      isInteraction
    });
    if (!balance) return;

    const game = playSlots();
    const delta = game.multiplier > 0 ? bet * (game.multiplier - 1) : -bet;
    const nextBalance = await client.stateStore.adjustBalance(guild.id, user.id, currency, delta);
    return reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(game.outcome === 'win' ? 'Slots - won' : 'Slots - lost')
          .setDescription([
            `Bet: ${formatCurrency(config, currency, bet)}`,
            `Reels: ${game.reels.join(' | ')}`,
            `Payout: ${game.multiplier}x`,
            `Balance: ${formatCurrency(config, currency, nextBalance[currency] ?? balance[currency])}`
          ].join('\n'))
          .setColor(game.outcome === 'win' ? 0x3ba55d : 0xed4245)
      ]
    });
  }

  if (['ecoadd', 'ecoset', 'ecoremove'].includes(command.type)) {
    if (!config.economyEnabled) {
      return reply(isInteraction ? { content: 'Economy is disabled.', ephemeral: true } : 'Economy is disabled.');
    }
    if (!permissions?.has(PermissionFlagsBits.ManageGuild)) {
      return reply(isInteraction ? { content: 'You need Manage Server permission.', ephemeral: true } : 'You need Manage Server permission.');
    }
    const parts = args.split(/\s+/).filter(Boolean);
    const targetUser = isInteraction ? source.options.getUser('target') : null;
    const target = targetUser
      ? { user: targetUser, member: await guild.members.fetch(targetUser.id).catch(() => null) }
      : await resolveMentionedUser(client, guild, args, user);
    const currency = normalizeCurrency(isInteraction ? source.options.getString('currency') : parts.find(isCurrencyToken) ?? 'silver');
    const amount = isInteraction ? source.options.getInteger('amount') : parseBet(parts.find((part) => /^\d+$/.test(part)));
    if (!Number.isInteger(amount) || amount < 0) {
      return reply(isInteraction ? { content: 'Amount must be a positive number.', ephemeral: true } : 'Amount must be a positive number.');
    }
    const next = command.type === 'ecoset'
      ? await client.stateStore.setBalance(guild.id, target.user.id, currency, amount)
      : await client.stateStore.adjustBalance(guild.id, target.user.id, currency, command.type === 'ecoremove' ? -amount : amount);
    const content = command.response
      .replaceAll('{target}', `<@${target.user.id}>`)
      .replaceAll('{amount}', String(amount))
      .replaceAll('{currency}', currencyMeta(config, currency).name);
    await sendLog(guild, config, content);
    return reply(isInteraction ? { content: `${content} Balance: ${formatCurrency(config, currency, next[currency])}`, ephemeral: true } : `${content} Balance: ${formatCurrency(config, currency, next[currency])}`);
  }

  if (command.type === 'announce') {
    if (!config.announcementsEnabled || !config.announcementChannelId) {
      return reply(isInteraction ? { content: 'Announcements are not configured.', ephemeral: true } : 'Announcements are not configured.');
    }
    if (!permissions?.has(PermissionFlagsBits.ManageGuild)) {
      return reply(isInteraction ? { content: 'You need Manage Server permission.', ephemeral: true } : 'You need Manage Server permission.');
    }
    const announcement = isInteraction ? source.options.getString('message') : args;
    const targetChannel = await guild.channels.fetch(config.announcementChannelId).catch(() => null);
    if (!targetChannel?.isTextBased()) {
      return reply(isInteraction ? { content: 'Announcement channel not found.', ephemeral: true } : 'Announcement channel not found.');
    }
    const content = `${config.announcementMention ? `${config.announcementMention}\n` : ''}${announcement}`;
    await targetChannel.send({ embeds: [new EmbedBuilder().setTitle('Announcement').setDescription(content).setColor(0x2864d8)] });
    return reply(isInteraction ? { content: 'Announcement sent.', ephemeral: true } : 'Announcement sent.');
  }

  if (command.type === 'ticketpanel') {
    if (!config.ticketsEnabled) {
      return reply(isInteraction ? { content: 'Tickets are disabled.', ephemeral: true } : 'Tickets are disabled.');
    }
    if (!permissions?.has(PermissionFlagsBits.ManageGuild)) {
      return reply(isInteraction ? { content: 'You need Manage Server permission.', ephemeral: true } : 'You need Manage Server permission.');
    }
    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return reply(isInteraction ? { content: 'Bot needs Manage Channels permission.', ephemeral: true } : 'Bot needs Manage Channels permission.');
    }
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket:create').setLabel('Open ticket').setStyle(ButtonStyle.Primary)
    );
    await channel.send({
      embeds: [new EmbedBuilder().setTitle(config.ticketPanelTitle).setDescription(config.ticketPanelMessage).setColor(0x2864d8)],
      components: [row]
    });
    return reply(isInteraction ? { content: 'Ticket panel posted.', ephemeral: true } : 'Ticket panel posted.');
  }

  if (command.type === 'rolepanel') {
    if (!config.rolesEnabled || config.selfRoles.length === 0) {
      return reply(isInteraction ? { content: 'Self roles are not configured.', ephemeral: true } : 'Self roles are not configured.');
    }
    if (!permissions?.has(PermissionFlagsBits.ManageGuild)) {
      return reply(isInteraction ? { content: 'You need Manage Server permission.', ephemeral: true } : 'You need Manage Server permission.');
    }
    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return reply(isInteraction ? { content: 'Bot needs Manage Roles permission.', ephemeral: true } : 'Bot needs Manage Roles permission.');
    }
    const rows = [];
    for (let i = 0; i < config.selfRoles.length; i += 5) {
      rows.push(
        new ActionRowBuilder().addComponents(
          config.selfRoles.slice(i, i + 5).map((role) =>
            new ButtonBuilder()
              .setCustomId(`selfrole:${role.roleId}`)
              .setLabel(role.label)
              .setStyle(ButtonStyle.Secondary)
          )
        )
      );
    }
    await channel.send({
      embeds: [new EmbedBuilder().setTitle(config.selfRolePanelTitle).setDescription(config.selfRolePanelMessage).setColor(0x2864d8)],
      components: rows
    });
    return reply(isInteraction ? { content: 'Role panel posted.', ephemeral: true } : 'Role panel posted.');
  }

  // ── League of Legends commands ──────────────────────────────────────────────
  const LOL_CMDS = ['lsd', 'lolprofile', 'lolmatch', 'lolchamp', 'lolitem', 'lolrunes', 'lolpatch', 'lollink', 'lolunlink'];
  if (LOL_CMDS.includes(command.type)) {
    const lolArgs = isInteraction ? '' : args;
    // stateStore is not in scope of runBuiltInCommand — use client.stateStore (set in createBot)
    const ss = client.stateStore;
    const lolCtx = { source, args: lolArgs, isInteraction, stateStore: ss, guildId: guild.id, config, reply };
    if (command.type === 'lsd') return handleLsd(lolCtx);
    if (command.type === 'lolprofile') return handleLolProfile(lolCtx);
    if (command.type === 'lolmatch') return handleLolMatch(lolCtx);
    if (command.type === 'lolchamp') return handleLolChamp({ ...lolCtx });
    if (command.type === 'lolitem') return handleLolItem({ ...lolCtx });
    if (command.type === 'lolrunes') return handleLolRunes({ ...lolCtx });
    if (command.type === 'lolpatch') return handleLolPatch({ ...lolCtx });
    if (command.type === 'lollink') return handleLolLink(lolCtx);
    if (command.type === 'lolunlink') return handleLolUnlink({ source, isInteraction, stateStore: ss, guildId: guild.id, reply });
  }

  // ── Teamfight Tactics commands ──────────────────────────────────────────────
  const TFT_CMDS = ['tftlsd', 'tftprofile', 'tftmatch', 'tftlink', 'tftunlink'];
  if (TFT_CMDS.includes(command.type)) {
    const ss = client.stateStore;
    const tftArgs = isInteraction ? '' : args;
    const tftCtx = { source, args: tftArgs, isInteraction, stateStore: ss, guildId: guild.id, config, reply };
    if (command.type === 'tftlsd')     return handleTftLsd(tftCtx);
    if (command.type === 'tftprofile') return handleTftProfile(tftCtx);
    if (command.type === 'tftmatch')   return handleTftMatch(tftCtx);
    if (command.type === 'tftlink')    return handleTftLink(tftCtx);
    if (command.type === 'tftunlink')  return handleTftUnlink({ source, isInteraction, stateStore: ss, guildId: guild.id, reply });
  }

  return reply(renderCommandResponse(command.response, { client, context, config, args }));
}

export function createBot(configStore, stateStore) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
  });
  client.stateStore = stateStore;

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Discord bot logged in as ${readyClient.user.tag}`);

    // Run async startup tasks without blocking the event loop
    (async () => {
      // 1. Wait for stores to finish loading from disk before doing anything
      await configStore.ready;
      await stateStore.ready;

      // 2. Purge stale game sessions and refund bets
      await stateStore.purgeStaleGameSessions().catch((err) =>
        console.error('[bot] Failed to purge stale game sessions:', err.message)
      );

      // 3. Sync slash commands for every guild — await each one so errors surface clearly
      const guilds = [...readyClient.guilds.cache.values()];
      console.log(`[bot] Syncing slash commands for ${guilds.length} guild(s)...`);
      let synced = 0;
      for (const guild of guilds) {
        try {
          const config = await configStore.getGuildConfig(guild.id);
          const result = await readyClient.syncGuildCommands(guild.id, config);
          console.log(`[bot] ✅ Synced ${result.count} commands → ${guild.name} (${guild.id})`);
          synced += 1;
        } catch (error) {
          console.error(`[bot] ❌ Failed to sync commands for ${guild.name} (${guild.id}): ${error.message}`);
        }
      }
      console.log(`[bot] Command sync complete: ${synced}/${guilds.length} guilds OK`);
    })().catch((err) => console.error('[bot] Startup error:', err));
  });

  // ── Resilience: log disconnects and errors instead of silently dying ────────
  client.on(Events.ShardDisconnect, (event, shardId) => {
    console.warn(`[bot] Shard ${shardId} disconnected (code ${event.code}). Discord.js will auto-reconnect.`);
  });

  client.on(Events.ShardReconnecting, (shardId) => {
    console.log(`[bot] Shard ${shardId} reconnecting…`);
  });

  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    console.log(`[bot] Shard ${shardId} resumed (${replayedEvents} events replayed).`);
  });

  client.on(Events.ShardError, (error, shardId) => {
    console.error(`[bot] Shard ${shardId} error:`, error.message);
    // Do NOT re-throw — discord.js handles its own reconnect logic.
  });

  client.on(Events.Error, (error) => {
    console.error('[bot] Client error:', error.message);
  });

  client.on(Events.Warn, (info) => {
    console.warn('[bot] Warning:', info);
  });
  // ────────────────────────────────────────────────────────────────────────────

  client.syncGuildCommands = async (guildId, config) => {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return { synced: false, reason: 'guild_not_found' };
    }

    const commands = buildSlashCommands(config);

    // Validate: Discord requires name 1-32 chars, description 1-100 chars
    for (const cmd of commands) {
      if (!cmd.name || cmd.name.length > 32) {
        console.warn(`[sync] Skipping invalid command name: "${cmd.name}"`);
        continue;
      }
      if (!cmd.description || cmd.description.length > 100) {
        cmd.description = (cmd.description ?? cmd.name).slice(0, 100);
      }
    }

    const validCommands = commands.filter((cmd) => cmd.name && cmd.name.length <= 32);
    await guild.commands.set(validCommands);
    return { synced: true, count: validCommands.length };
  };

  client.on(Events.GuildMemberAdd, async (member) => {
    const config = await configStore.getGuildConfig(member.guild.id);
    if (config.rolesEnabled && config.autoRoleId) {
      await member.roles.add(config.autoRoleId).catch(() => null);
    }

    if (!config.enabled || !config.welcomeEnabled || !config.welcomeChannelId) {
      return;
    }

    const channel = await member.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
    if (!channel?.isTextBased()) {
      return;
    }

    await channel.send(formatMessage(config.welcomeMessage, member)).catch(() => null);
    await sendLog(member.guild, config, `Welcomed ${member.user.tag}.`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isStringSelectMenu() && interaction.guild) {
      if (interaction.customId.startsWith('help_select:')) {
        const targetUserId = interaction.customId.slice('help_select:'.length);
        if (interaction.user.id !== targetUserId) {
          await interaction.reply({
            content: '❌ Chỉ người sử dụng lệnh ban đầu mới có thể tương tác với menu này!',
            ephemeral: true
          });
          return;
        }

        const selectedValue = interaction.values[0];
        const group = selectedValue.startsWith('help_group:') ? selectedValue.slice('help_group:'.length) : null;

        const config = await configStore.getGuildConfig(interaction.guild.id);
        const payload = await buildHelpPayload(client, config, interaction.guild, targetUserId, group);
        await interaction.update(payload);
        return;
      }
    }

    if (interaction.isButton() && interaction.guild) {
      const config = await configStore.getGuildConfig(interaction.guild.id);
      if (interaction.customId.startsWith('bj:')) {
        const [, action] = interaction.customId.split(':');
        const session = await getGameSession(client, 'blackjack', blackjackSessions, interaction.guild.id, interaction.message.id);
        if (!session || session.status !== 'active') {
          await interaction.reply({ content: 'Blackjack session expired.', ephemeral: true });
          return;
        }
        refreshSessionExpiry(client, 'blackjack', blackjackSessions, interaction.message.id);

        if (action === 'join') {
          if (session.players.some((player) => player.userId === interaction.user.id)) {
            await interaction.reply({ content: 'You are already at this table.', ephemeral: true });
            return;
          }
          const balance = await validateGameBet({
            client,
            guildId: session.guildId,
            userId: interaction.user.id,
            config,
            currency: session.currency,
            bet: session.bet,
            game: 'blackjack',
            disabledMessage: 'Blackjack is disabled.',
            reply: (payload) => interaction.reply(payload),
            isInteraction: true
          });
          if (!balance) return;
          const reserved = await client.stateStore.adjustBalance(session.guildId, interaction.user.id, session.currency, -session.bet);
          session.players.push(createBlackjackPlayer(interaction.user, session.bet, session.deck, reserved[session.currency] ?? 0));
          await persistGameSession(client, 'blackjack', interaction.message.id, session);
          await interaction.update(buildBlackjackPayload(config, session));
          return;
        }

        const player = activeBlackjackPlayer(session);
        if (!player || interaction.user.id !== player.userId) {
          await interaction.reply({ content: 'Not your turn yet.', ephemeral: true });
          return;
        }

        const hand = activeBlackjackHand(session);
        if (!hand) {
          const payload = await finishBlackjackSession(client, session, config);
          expireSession(blackjackSessions, interaction.message.id);
          await deletePersistedSession(client, 'blackjack', session, interaction.message.id);
          await interaction.update(payload);
          return;
        }

        if (action === 'hit') {
          drawToBlackjackHand(session, hand);
        } else if (action === 'stand') {
          hand.done = true;
        } else if (action === 'double') {
          if (hand.cards.length !== 2 || hand.didDouble || player.balanceAfterReserved < hand.bet) {
            await interaction.reply({ content: 'Cannot double this hand.', ephemeral: true });
            return;
          }
          player.balanceAfterReserved -= hand.bet;
          await client.stateStore.adjustBalance(session.guildId, player.userId, session.currency, -hand.bet);
          hand.bet *= 2;
          hand.didDouble = true;
          hand.cards.push(session.deck.pop());
          hand.done = true;
        } else if (action === 'split') {
          if (player.hands.length >= 2 || !isPair(hand.cards) || player.balanceAfterReserved < hand.bet) {
            await interaction.reply({ content: 'Cannot split this hand.', ephemeral: true });
            return;
          }
          player.balanceAfterReserved -= hand.bet;
          await client.stateStore.adjustBalance(session.guildId, player.userId, session.currency, -hand.bet);
          const secondCard = hand.cards.pop();
          hand.cards.push(session.deck.pop());
          player.hands.splice(player.activeHandIndex + 1, 0, {
            cards: [secondCard, session.deck.pop()],
            bet: hand.bet,
            done: false,
            didDouble: false
          });
        } else if (action === 'cancel') {
          for (const handState of player.hands) {
            handState.done = true;
            handState.outcome = 'canceled';
            handState.payout = 0;
          }
        }

        advanceBlackjackHand(session);
        const payload = session.activePlayerIndex >= session.players.length
          ? await finishBlackjackSession(client, session, config)
          : buildBlackjackPayload(config, session);
        if (session.status === 'finished') {
          expireSession(blackjackSessions, interaction.message.id);
          await deletePersistedSession(client, 'blackjack', session, interaction.message.id);
        } else {
          await persistGameSession(client, 'blackjack', interaction.message.id, session);
        }
        await interaction.update(payload);
        return;
      }

      if (interaction.customId.startsWith('vp:')) {
        const [, action, targetUserId, indexValue] = interaction.customId.split(':');
        const session = await getGameSession(client, 'poker', pokerSessions, interaction.guild.id, interaction.message.id);
        if (!session || session.status !== 'active') {
          await interaction.reply({ content: 'Poker session expired.', ephemeral: true });
          return;
        }
        refreshSessionExpiry(client, 'poker', pokerSessions, interaction.message.id);
        if (interaction.user.id !== targetUserId || interaction.user.id !== session.userId) {
          await interaction.reply({ content: 'This is not your poker hand.', ephemeral: true });
          return;
        }

        if (action === 'hold') {
          const index = Number.parseInt(indexValue, 10);
          if (session.held.has(index)) session.held.delete(index);
          else session.held.add(index);
          await persistGameSession(client, 'poker', interaction.message.id, session);
          await interaction.update(buildPokerPayload(config, session));
          return;
        }

        if (action === 'draw' || action === 'cancel') {
          const payload = await finishPokerSession(client, session, config, action === 'cancel');
          expireSession(pokerSessions, interaction.message.id);
          await deletePersistedSession(client, 'poker', session, interaction.message.id);
          await interaction.update(payload);
          return;
        }
      }

      if (interaction.customId === 'ticket:create') {
        if (!config.ticketsEnabled) {
          await interaction.reply({ content: 'Tickets are disabled.', ephemeral: true });
          return;
        }
        if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
          await interaction.reply({ content: 'Bot needs Manage Channels permission.', ephemeral: true });
          return;
        }
        const number = await stateStore.nextTicketNumber(interaction.guild.id);
        const channel = await interaction.guild.channels.create({
          name: `ticket-${number}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90),
          type: ChannelType.GuildText,
          parent: config.ticketCategoryId || undefined,
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
          ]
        });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket:close').setLabel('Close ticket').setStyle(ButtonStyle.Danger)
        );
        await channel.send({
          content: `<@${interaction.user.id}>`,
          embeds: [new EmbedBuilder().setTitle(`Ticket #${number}`).setDescription('Support will respond here.').setColor(0x2864d8)],
          components: [row]
        });
        await interaction.reply({ content: `Ticket created: <#${channel.id}>`, ephemeral: true });
        await sendTicketLog(interaction.guild, config, `Ticket #${number} opened by ${interaction.user.tag}.`);
        return;
      }

      if (interaction.customId === 'ticket:close') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
          await interaction.reply({ content: 'You need Manage Channels permission.', ephemeral: true });
          return;
        }
        await interaction.reply({ content: 'Closing ticket in 3 seconds.', ephemeral: true });
        await sendTicketLog(interaction.guild, config, `Ticket closed: ${interaction.channel.name}`);
        setTimeout(() => interaction.channel.delete().catch(() => null), 3000);
        return;
      }

      if (interaction.customId.startsWith('selfrole:')) {
        if (!config.rolesEnabled) {
          await interaction.reply({ content: 'Roles are disabled.', ephemeral: true });
          return;
        }
        const roleId = interaction.customId.slice('selfrole:'.length);
        const roleConfig = config.selfRoles.find((role) => role.roleId === roleId);
        if (!roleConfig) {
          await interaction.reply({ content: 'Role is not configured anymore.', ephemeral: true });
          return;
        }
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
          await interaction.reply({ content: 'Bot needs Manage Roles permission.', ephemeral: true });
          return;
        }
        const hasRole = member.roles.cache.has(roleId);
        if (hasRole) {
          await member.roles.remove(roleId);
          await interaction.reply({ content: `Removed ${roleConfig.label}.`, ephemeral: true });
        } else {
          await member.roles.add(roleId);
          await interaction.reply({ content: `Added ${roleConfig.label}.`, ephemeral: true });
        }
        return;
      }
    }

    if (!interaction.isChatInputCommand() || !interaction.guild) {
      return;
    }

    const config = await configStore.getGuildConfig(interaction.guild.id);
    if (!config.enabled) {
      await interaction.reply({ content: 'Bot is disabled for this server.', ephemeral: true });
      return;
    }

    const command = config.commands.find((item) => item.enabled && item.name === interaction.commandName);
    if (!command) {
      await interaction.reply({ content: 'Command is not enabled.', ephemeral: true });
      return;
    }

    const args = interaction.options.getString('args') ?? '';
    await runBuiltInCommand({
      client,
      config,
      command,
      source: interaction,
      args
    });
  });

  client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.author.bot) {
      return;
    }

    const config = await configStore.getGuildConfig(message.guild.id);
    if (!config.enabled) {
      return;
    }

    const content = message.content.trim();
    const prefix = config.prefix || '!';

    if (config.autoModEnabled && !message.member?.permissions?.has(PermissionFlagsBits.ManageMessages)) {
      const lowerContent = content.toLowerCase();
      const hasBadWord = config.badWords.some((word) => lowerContent.includes(word.toLowerCase()));
      const hasBlockedLink = config.antiLinkEnabled && /https?:\/\/|discord\.gg\//i.test(content);

      if (hasBadWord || hasBlockedLink) {
        if (config.deleteBlockedMessages) {
          await message.delete().catch(() => null);
        }

        const blocked = renderCommandResponse(config.blockedMessage, {
          client,
          config,
          args: '',
          context: {
            channelId: message.channel.id,
            guildName: message.guild.name,
            userId: message.author.id,
            username: message.author.username
          }
        });
        await message.channel.send(blocked).catch(() => null);
        await sendLog(message.guild, config, `AutoMod blocked ${message.author.tag}: ${hasBlockedLink ? 'link' : 'bad word'}`);
        return;
      }
    }

    if (content.startsWith(prefix)) {
      const body = content.slice(prefix.length).trim();
      const [commandName, ...argParts] = body.split(/\s+/);
      const command = config.commands.find((item) => item.enabled && item.name === commandName?.toLowerCase());

      if (command) {
        await runBuiltInCommand({
          client,
          config,
          command,
          source: message,
          args: argParts.join(' ')
        });
        return;
      }

      return;
    }

    if (config.levelsEnabled) {
      const rank = await stateStore.addXp(message.guild.id, message.author.id, config.xpPerMessage);
      if (rank.leveledUp) {
        const levelMessage = config.levelUpMessage
          .replaceAll('{user}', `<@${message.author.id}>`)
          .replaceAll('{username}', message.author.username)
          .replaceAll('{level}', String(rank.level))
          .replaceAll('{xp}', String(rank.xp));
        await message.channel.send(levelMessage).catch(() => null);
      }
    }

    if (!config.autoReplyEnabled) {
      return;
    }

    const lowerContent = content.toLowerCase();
    const match = config.autoReplies.find((reply) => lowerContent.includes(reply.keyword.toLowerCase()));
    if (match) {
      await message.reply(match.response);
    }
  });

  // ── Self-ping keepalive ──────────────────────────────────────────────────
  // Thay thế UptimeRobot: bot tự gửi tin nhắn vào channel keepalive mỗi 14 phút
  // để Render không spin down process. Channel ID set qua env KEEPALIVE_CHANNEL_ID.
  // Nếu không có channel ID, chỉ log heartbeat để giữ event loop active.
  (function startKeepalive() {
    const INTERVAL_MS = 14 * 60 * 1000; // 14 phút — Render spin down sau 15 phút

    setInterval(async () => {
      const channelId = process.env.KEEPALIVE_CHANNEL_ID;
      if (!channelId) {
        // Không có channel → chỉ log để event loop không idle
        console.log(`[keepalive] heartbeat — uptime ${Math.floor(process.uptime())}s, ws.ping ${client.ws.ping}ms`);
        return;
      }
      try {
        const ch = await client.channels.fetch(channelId).catch(() => null);
        if (!ch?.isTextBased()) return;
        // Gửi tin nhắn invisible (zero-width space) để không spam visible
        await ch.send('\u200b').catch(() => null);
        console.log(`[keepalive] sent heartbeat to #${ch.name ?? channelId}`);
      } catch (err) {
        console.warn('[keepalive] error:', err.message);
      }
    }, INTERVAL_MS);
  })();

  return client;
}