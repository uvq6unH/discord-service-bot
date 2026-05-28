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

const groupMap = {
  ping: 'general',
  help: 'general',
  custom: 'general',
  user: 'user',
  avatar: 'user',
  rank: 'user',
  leaderboard: 'user',
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
  ticketpanel: 'interactions',
  rolepanel: 'interactions'
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
  }
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
        .setDefault(selectedGroup === 'interactions')
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
        `• 🔔 **Tương Tác**: Tự nhận vai trò, kênh Ticket.`
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
  return template
    .replaceAll('{args}', args)
    .replaceAll('{autoReplyStatus}', config.autoReplyEnabled ? 'on' : 'off')
    .replaceAll('{channel}', `<#${getContextValue(context, 'channelId')}>`)
    .replaceAll('{commandCount}', String(commandCount))
    .replaceAll('{commands}', buildCommandList(config))
    .replaceAll('{ping}', String(client.ws.ping))
    .replaceAll('{prefix}', config.prefix || '!')
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
          { name: '🔔 Tương Tác & Nút Bấm', value: 'interactions' }
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
      await target.member.kick(reason);
    }

    if (command.type === 'ban') {
      if (!permissions?.has(PermissionFlagsBits.BanMembers)) {
        return reply(isInteraction ? { content: 'You need Ban Members permission.', ephemeral: true } : 'You need Ban Members permission.');
      }
      await target.member.ban({ reason });
    }

    if (command.type === 'timeout') {
      if (!permissions?.has(PermissionFlagsBits.ModerateMembers)) {
        return reply(isInteraction ? { content: 'You need Moderate Members permission.', ephemeral: true } : 'You need Moderate Members permission.');
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
    for (const guild of readyClient.guilds.cache.values()) {
      configStore
        .getGuildConfig(guild.id)
        .then((config) => readyClient.syncGuildCommands(guild.id, config))
        .catch((error) => console.warn(`Could not sync commands for ${guild.id}: ${error.message}`));
    }
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
    await guild.commands.set(commands);
    return { synced: true, count: commands.length };
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
      if (interaction.customId === 'ticket:create') {
        if (!config.ticketsEnabled) {
          await interaction.reply({ content: 'Tickets are disabled.', ephemeral: true });
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
        await sendLog(interaction.guild, config, `Ticket #${number} opened by ${interaction.user.tag}.`);
        return;
      }

      if (interaction.customId === 'ticket:close') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
          await interaction.reply({ content: 'You need Manage Channels permission.', ephemeral: true });
          return;
        }
        await interaction.reply({ content: 'Closing ticket in 3 seconds.', ephemeral: true });
        await sendLog(interaction.guild, config, `Ticket closed: ${interaction.channel.name}`);
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