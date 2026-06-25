import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { sendLog } from '../../logging.js';
import { resolveMentionedUser } from '../../embeds.js';
import {
  CURRENCIES, GAME_CURRENCY, blackjackSessions, pokerSessions, createDeck, createBlackjackPlayer,
  validateGameBet, parseBetCommand, parseBet, formatCurrency, currencyMeta, normalizeCurrency,
  isCurrencyToken, playCoinflip, playDice, playSlots, buildBlackjackPayload, buildPokerPayload,
  persistGameSession, scheduleSessionExpiry
} from '../../games.js';

/** @returns {Promise<unknown>|undefined} */
export async function handleEconomy(ctx) {
  const {
    client, config, command, source, args, isInteraction, guild, channel, user, permissions,
    reply, context, actorMember
  } = ctx;
  const _eco = new Set(['balance', 'daily', 'economyleaderboard', 'blackjack', 'poker', 'coinflip', 'dice', 'slots', 'ecoadd', 'ecoset', 'ecoremove']);
  if (!_eco.has(command.type)) return;

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
          .setDescription(CURRENCIES.map((currency) => formatCurrency(config, currency, balance[currency] ?? 0)).join('\n'))
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
    const claimed = CURRENCIES
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
    // validateGameBet already deducted bet via tryDebitBalance -- do NOT deduct again
    const deck = createDeck();
    const session = {
      guildId: guild.id,
      currency,
      bet,
      deck,
      dealer: [deck.pop(), deck.pop()],
      players: [createBlackjackPlayer(user, bet, deck, balance[currency] ?? 0)],
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

    // validateGameBet already deducted bet via tryDebitBalance -- do NOT deduct again
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
    const currency = GAME_CURRENCY;
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
    // tryDebitBalance already deducted bet; on win return 2x stake, on loss do nothing
    const delta = game.outcome === 'win' ? bet * 2 : 0;
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

    const target = isInteraction ? source.options.getString('prediction') : parts[1];
    const game = playDice(target);
    // tryDebitBalance already deducted bet; on win return multiplier * stake, on loss do nothing
    const delta = game.outcome === 'win' ? bet * game.multiplier : 0;
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
    // tryDebitBalance already deducted bet; on win return multiplier * stake, on loss do nothing
    const delta = game.multiplier > 0 ? bet * game.multiplier : 0;
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
}