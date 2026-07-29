import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits
} from 'discord.js';

/** @returns {Promise<unknown>|undefined} */
export async function handlePanels(ctx) {
  const { config, command, channel, isInteraction, source, reply, permissions } = ctx;
  const _panels = new Set(['ticketpanel', 'rolepanel']);
  if (!_panels.has(command.type)) return;

  if (!permissions?.has(PermissionFlagsBits.ManageGuild)) {
    return reply(isInteraction
      ? { content: 'You need Manage Server permission.', ephemeral: true }
      : 'You need Manage Server permission.');
  }

  if (command.type === 'ticketpanel') {
    if (!config.ticketsEnabled) {
      return reply(isInteraction
        ? { content: 'Tickets are disabled. Enable them in the dashboard first.', ephemeral: true }
        : 'Tickets are disabled. Enable them in the dashboard first.');
    }
    const embed = new EmbedBuilder()
      .setTitle(config.ticketPanelTitle)
      .setDescription(config.ticketPanelMessage)
      .setColor(0x2864d8);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket:create')
        .setLabel('Open ticket')
        .setStyle(ButtonStyle.Primary)
    );
    if (isInteraction) {
      await source.reply({ content: 'Panel posted.', ephemeral: true });
    }
    return channel.send({ embeds: [embed], components: [row] });
  }

  if (command.type === 'rolepanel') {
    if (!config.rolesEnabled) {
      return reply(isInteraction
        ? { content: 'Self-roles are disabled. Enable them in the dashboard first.', ephemeral: true }
        : 'Self-roles are disabled. Enable them in the dashboard first.');
    }

    const panels = config.selfRolePanels ?? [];
    const legacyRoles = config.selfRoles ?? [];

    if (panels.length === 0 && legacyRoles.length === 0) {
      return reply(isInteraction
        ? { content: 'No self-roles configured. Add roles in the dashboard first.', ephemeral: true }
        : 'No self-roles configured. Add roles in the dashboard first.');
    }

    if (isInteraction) {
      await source.reply({ content: 'Role panel(s) posted.', ephemeral: true });
    }

    const targetPanels = panels.length > 0 ? panels : [{
      title: config.selfRolePanelTitle || 'REACT FOR ROLES',
      description: config.selfRolePanelMessage || 'Thả cảm xúc bên dưới để nhận Role tương ứng:',
      color: '#5865F2',
      roles: legacyRoles
    }];

    for (const panel of targetPanels) {
      const colorInt = Number.parseInt((panel.color || '#5865F2').replace('#', ''), 16) || 0x5865F2;

      const rolesListText = (panel.roles ?? []).map(r => {
        const emojiStr = r.emoji && r.emoji.trim() ? `${r.emoji.trim()} ` : '🔹 ';
        const roleMention = r.roleId ? `<@&${r.roleId}>` : r.label;
        const labelStr = r.label && r.label !== r.roleId ? `  •  \`${r.label.toUpperCase()}\`` : '';
        return `> ${emojiStr}┊ ${roleMention}${labelStr}`;
      }).join('\n');

      const divider = '✦ ───────────────────────────── ✦';

      const fullDescription = [
        panel.description ? `> 📜 *${panel.description}*` : '',
        '',
        divider,
        `### 📌 **DANH SÁCH ROLE & REACTION:**`,
        rolesListText || '> *Chưa cấu hình Role nào*',
        divider,
      ].filter(Boolean).join('\n');

      const embed = new EmbedBuilder()
        .setTitle(panel.title ? `🎮 ║ ${panel.title.toUpperCase()}` : '🎮 ║ SELF ROLE SELECTOR')
        .setDescription(fullDescription)
        .setColor(colorInt)
        .setFooter({
          text: '💡 Thả cảm xúc bên dưới để nhận Role • Gỡ cảm xúc để hủy Role',
          iconURL: channel.guild?.iconURL({ size: 64 }) ?? undefined
        })
        .setTimestamp();

      if (panel.thumbnailUrl) {
        embed.setThumbnail(panel.thumbnailUrl);
      }
      if (panel.imageUrl) {
        embed.setImage(panel.imageUrl);
      }

      try {
        const msg = await channel.send({ embeds: [embed] });
        for (const r of (panel.roles ?? [])) {
          if (r.emoji && r.emoji.trim()) {
            await msg.react(r.emoji.trim()).catch(err => console.warn(`[rolepanel] Failed to react ${r.emoji}:`, err.message));
          }
        }
      } catch (err) {
        console.error('[rolepanel] Error posting panel:', err.message);
      }
    }
  }
}
