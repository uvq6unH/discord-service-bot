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

    const styleMap = {
      Primary: ButtonStyle.Primary,
      Secondary: ButtonStyle.Secondary,
      Success: ButtonStyle.Success,
      Danger: ButtonStyle.Danger,
    };

    if (isInteraction) {
      await source.reply({ content: 'Role panel(s) posted.', ephemeral: true });
    }

    const targetPanels = panels.length > 0 ? panels : [{
      title: config.selfRolePanelTitle || 'Choose roles',
      description: config.selfRolePanelMessage || 'Click a button to toggle a role.',
      color: '#5865F2',
      roles: legacyRoles
    }];

    for (const panel of targetPanels) {
      const colorInt = Number.parseInt((panel.color || '#5865F2').replace('#', ''), 16) || 0x5865F2;
      const embed = new EmbedBuilder()
        .setTitle(panel.title || 'Choose roles')
        .setDescription(panel.description || 'Click a button to toggle a role.')
        .setColor(colorInt);

      const buttons = (panel.roles ?? []).slice(0, 25).map((r) => {
        const btn = new ButtonBuilder()
          .setCustomId(`selfrole:${r.roleId}`)
          .setLabel(r.label || r.roleId)
          .setStyle(styleMap[r.style] ?? ButtonStyle.Secondary);
        if (r.emoji) {
          btn.setEmoji(r.emoji);
        }
        return btn;
      });

      const rows = [];
      for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
      }

      await channel.send({ embeds: [embed], components: rows });
    }
  }
}
