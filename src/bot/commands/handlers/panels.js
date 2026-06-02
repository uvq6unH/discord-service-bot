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
    const roles = config.selfRoles ?? [];
    if (roles.length === 0) {
      return reply(isInteraction
        ? { content: 'No self-roles configured. Add roles in the dashboard first.', ephemeral: true }
        : 'No self-roles configured. Add roles in the dashboard first.');
    }
    const embed = new EmbedBuilder()
      .setTitle(config.selfRolePanelTitle)
      .setDescription(config.selfRolePanelMessage)
      .setColor(0x5865f2);
    // Discord limit: max 5 buttons per row, 5 rows per message = 25 buttons
    const buttons = roles.slice(0, 25).map((r) =>
      new ButtonBuilder()
        .setCustomId(`selfrole:${r.roleId}`)
        .setLabel(r.label || r.roleId)
        .setStyle(ButtonStyle.Secondary)
    );
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
    if (isInteraction) {
      await source.reply({ content: 'Panel posted.', ephemeral: true });
    }
    return channel.send({ embeds: [embed], components: rows });
  }
}
