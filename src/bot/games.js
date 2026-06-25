import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';
import { createMutexPool } from '../asyncMutex.js';

const gameSessionMutex = createMutexPool();

export const CURRENCIES = ['silver', 'gold', 'diamond'];
export const GAME_CURRENCY = 'silver';
export const blackjackSessions = new Map();
export const pokerSessions = new Map();
export const GAME_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export function normalizeCurrency(value) {
  const input = String(value ?? '').trim().toLowerCase();
  if (['silver', 'bac', 'bạc'].includes(input)) return 'silver';
  if (['gold', 'vang', 'vàng'].includes(input)) return 'gold';
  if (['diamond', 'kimcuong', 'kim-cuong', 'kim cương'].includes(input)) return 'diamond';
  return 'silver';
}

export function isCurrencyToken(value) {
  const input = String(value ?? '').trim().toLowerCase();
  return ['silver', 'bac', 'bạc', 'gold', 'vang', 'vàng', 'diamond', 'kimcuong', 'kim-cuong', 'kim cương'].includes(input);
}

export function currencyMeta(config, currency) {
  const meta = {
    silver: { name: config.currencySilverName, icon: config.currencySilverIcon },
    gold: { name: config.currencyGoldName, icon: config.currencyGoldIcon },
    diamond: { name: config.currencyDiamondName, icon: config.currencyDiamondIcon }
  }[currency] ?? { name: 'Bạc', icon: '🥈' };
  return { name: meta.name || currency, icon: meta.icon || '' };
}

export function formatCurrency(config, currency, amount) {
  const meta = currencyMeta(config, currency);
  return `${meta.icon} ${amount.toLocaleString('vi-VN')} ${meta.name}`.trim();
}

export function parseBet(value) {
  const amount = Number.parseInt(value, 10);
  return Number.isFinite(amount) ? amount : 0;
}

export function createDeck() {
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

export function playCoinflip(choice) {
  const normalizedChoice = ['tails', 'tail', 't', 'ngua'].includes(String(choice ?? '').toLowerCase()) ? 'tails' : 'heads';
  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  return { choice: normalizedChoice, result, outcome: normalizedChoice === result ? 'win' : 'lose' };
}

export function playDice(target) {
  const roll = Math.floor(Math.random() * 6) + 1;
  const input = String(target ?? '').trim().toLowerCase();
  
  let isWin = false;
  let multiplier = 0;
  let displayChoice = input;

  if (['odd', 'le', 'lẻ'].includes(input)) {
    isWin = roll % 2 !== 0;
    multiplier = 2;
    displayChoice = 'Lẻ';
  } else if (['even', 'chan', 'chẵn'].includes(input)) {
    isWin = roll % 2 === 0;
    multiplier = 2;
    displayChoice = 'Chẵn';
  } else if (['high', 'tai', 'tài'].includes(input)) {
    isWin = roll >= 4;
    multiplier = 2;
    displayChoice = 'Tài';
  } else if (['low', 'xiu', 'xỉu'].includes(input)) {
    isWin = roll <= 3;
    multiplier = 2;
    displayChoice = 'Xỉu';
  } else {
    const num = Number.parseInt(input, 10);
    const validNum = Number.isInteger(num) && num >= 1 && num <= 6 ? num : 1;
    isWin = roll === validNum;
    multiplier = 6;
    displayChoice = `Số ${validNum}`;
  }

  return {
    target: displayChoice,
    roll,
    outcome: isWin ? 'win' : 'lose',
    multiplier
  };
}

export function playSlots() {
  const symbols = ['7', 'BAR', 'Cherry', 'Bell', 'Gem'];
  const reels = Array.from({ length: 3 }, () => symbols[Math.floor(Math.random() * symbols.length)]);
  const unique = new Set(reels);
  let multiplier = 0;
  if (unique.size === 1) {
    multiplier = reels[0] === '7' ? 20 : 8;
  } else if (unique.size === 2) {
    multiplier = 1.5;
  }
  return { reels, multiplier, outcome: multiplier > 0 ? 'win' : 'lose' };
}

function getGameBetLimits(config, game) {
  return {
    min: config[`${game}MinBet`] ?? config.blackjackMinBet,
    max: config[`${game}MaxBet`] ?? config.blackjackMaxBet
  };
}

export function parseBetCommand({ isInteraction, source, args, defaultCurrencyIndex = 1 }) {
  const parts = args.split(/\s+/).filter(Boolean);
  return {
    parts,
    bet: isInteraction ? source.options.getInteger('bet') : parseBet(parts[0]),
    currency: GAME_CURRENCY
  };
}

export async function validateGameBet({ client, guildId, userId, config, currency, bet, game, disabledMessage, reply, isInteraction }) {
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

  const debit = await client.stateStore.tryDebitBalance(guildId, userId, currency, bet);
  if (!debit.ok) {
    const message = `Not enough ${currencyMeta(config, currency).name}.`;
    await reply(isInteraction ? { content: message, ephemeral: true } : message);
    return null;
  }

  return debit.balance;
}

export async function expireSessionWithRefund(client, type, map, id) {
  const session = map.get(id);
  if (!session) return;
  if (session.timeout) clearTimeout(session.timeout);
  map.delete(id);

  if (session.status !== 'active') return;

  try {
    const result = await client.stateStore.refundAndDeleteGameSession(session.guildId, type, id);
    console.log(`[game] Expired ${type} session ${id}${result.refunded ? ' and refunded bet(s)' : ''}`);
  } catch (err) {
    console.error(`[game] Failed to refund expired ${type} session ${id}:`, err.message);
  }
}

export function expireSession(map, id) {
  const session = map.get(id);
  if (session?.timeout) clearTimeout(session.timeout);
  map.delete(id);
}

export async function deletePersistedSession(client, type, session, messageId) {
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

export async function persistGameSession(client, type, messageId, session) {
  await client.stateStore.setGameSession(session.guildId, type, messageId, serializeSession(session));
}

export function withGameSessionLock(client, gameType, guildId, messageId, fn) {
  if (client?.stateStore?.withGameSessionLock) {
    return client.stateStore.withGameSessionLock(guildId, gameType, messageId, fn);
  }
  return gameSessionMutex(`${gameType}:${guildId}:${messageId}`, fn);
}

export async function getGameSession(client, type, map, guildId, messageId) {
  let session = map.get(messageId);
  if (session && session.guildId !== guildId) return null;
  if (!session) {
    session = await client.stateStore.getGameSession(guildId, type, messageId);
    if (type === 'poker') revivePokerSession(session);
    if (session?.status === 'active') {
      session.timeout = scheduleSessionExpiry(client, type, map, messageId, session);
      map.set(messageId, session);
    }
  }
  return session;
}

function remainingSessionTtl(session) {
  const createdAt = Number(session?.createdAt);
  if (!Number.isFinite(createdAt) || createdAt <= 0) return GAME_SESSION_TTL_MS;
  return Math.max(0, createdAt + GAME_SESSION_TTL_MS - Date.now());
}

export function scheduleSessionExpiry(client, type, map, id, session = map.get(id)) {
  return setTimeout(() => expireSessionWithRefund(client, type, map, id), remainingSessionTtl(session));
}

export function refreshSessionExpiry(client, type, map, id) {
  const session = map.get(id);
  if (!session) return;
  if (session.timeout) clearTimeout(session.timeout);
  session.timeout = scheduleSessionExpiry(client, type, map, id, session);
}

function visibleDealerHand(session, reveal = false) {
  return reveal ? formatHand(session.dealer) : `${session.dealer[0].rank}${session.dealer[0].suit} ??`;
}

export function isPair(hand) {
  return hand.length === 2 && hand[0].rank === hand[1].rank;
}

function isNaturalBlackjack(hand) {
  return hand.length === 2 && handValue(hand) === 21;
}

export function createBlackjackPlayer(user, bet, deck, balanceAfterReserved) {
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

export function activeBlackjackPlayer(session) {
  return session.players[session.activePlayerIndex];
}

export function activeBlackjackHand(session) {
  const player = activeBlackjackPlayer(session);
  return player?.hands[player.activeHandIndex];
}

export function drawToBlackjackHand(session, handState) {
  handState.cards.push(session.deck.pop());
  if (handValue(handState.cards) >= 21) {
    handState.done = true;
  }
}

export function advanceBlackjackHand(session) {
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

// Standard casino dealer rules (Stand on all 17s).
function shouldDealerHit(session) {
  const dealerValue = handValue(session.dealer);
  return dealerValue < 17;
}

export function buildBlackjackPayload(config, session) {
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

export async function finishBlackjackSession(client, session, config) {
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

export function buildPokerPayload(config, session) {
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

export async function finishPokerSession(client, session, config, canceled = false) {
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

export async function handleBlackjackButton(interaction, { client, config }) {
  return withGameSessionLock(client, 'blackjack', interaction.guild.id, interaction.message.id, async () => {
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
      session.players.push(createBlackjackPlayer(interaction.user, session.bet, session.deck, balance[session.currency] ?? 0));
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
  });
}

export async function handlePokerButton(interaction, { client, config }) {
  return withGameSessionLock(client, 'poker', interaction.guild.id, interaction.message.id, async () => {
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
    }
  });
}
