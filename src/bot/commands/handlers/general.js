import { PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { buildServerEmbed, buildUserEmbed, buildAvatarEmbed, resolveMentionedUser } from '../../embeds.js';
import { renderCommandResponse } from '../../responses.js';
import { sanitizeAnnouncementText } from '../../../commandAccess.js';

/** @returns {Promise<unknown>|undefined} */
export async function handleGeneral(ctx) {
  const {
    client, config, command, source, args, isInteraction, guild, channel, user, permissions,
    reply, context, actorMember
  } = ctx;
  const _general = new Set(['custom', 'ping', 'config', 'server', 'user', 'avatar', 'say', 'announce']);
  if (!_general.has(command.type)) return;

  if (['custom', 'ping'].includes(command.type)) {
    return reply(renderCommandResponse(command.response, { client, context, config, args }));
  }

  if (command.type === 'config') {
    const totalCommands = config.commands?.filter(c => c.enabled)?.length ?? 0;
    const customCommands = config.commands?.filter(c => c.enabled && c.isCustom)?.length ?? 0;
    const riotStatus = config.riotApiKey ? '🟢 Đã cấu hình API' : '🔴 Chưa cấu hình';
    const tftStatus = config.tftApiKey ? '🟢 API riêng' : (config.riotApiKey ? '♻️ Dùng chung LoL API' : '🔴 Chưa cấu hình');
    const selfRoleStatus = config.rolesEnabled ? '🟢 Đã bật' : '🔴 Đã tắt';
    const autoReplyStatus = config.autoReplyEnabled ? '🟢 Đã bật' : '🔴 Đã tắt';
    const welcomeStatus = config.welcomeEnabled ? '🟢 Đã bật' : '🔴 Đã tắt';
    const esportsStatus = config.esportsNotifyEnabled ? '🟢 Đã bật Broadcast' : '🔴 Đã tắt';

    const embed = new EmbedBuilder()
      .setTitle(`⚙️ ║ HỆ THỐNG CẤU HÌNH SERVER — ${(guild?.name || 'DISCORD').toUpperCase()}`)
      .setDescription(`> 🛡️ *Bảng tổng quan trạng thái cấu hình của Bot trong máy chủ ${guild?.name || 'Discord'}.*`)
      .addFields(
        {
          name: '🌐 **CẤU HÌNH HỆ THỐNG & CƠ BẢN**',
          value:
            `> 📌 **Tiền tố (Prefix):** \`${config.prefix || '/'}\`\n` +
            `> 🎭 **Tự nhận Role (Self-Role):** ${selfRoleStatus}\n` +
            `> 💬 **Tự động phản hồi:** ${autoReplyStatus}\n` +
            `> 👋 **Thông báo Chào mừng:** ${welcomeStatus}`,
          inline: false
        },
        {
          name: '📊 **THỐNG KÊ LỆNH SLASH & CUSTOM**',
          value:
            `> ⚡ **Tổng số lệnh khả dụng:** \`${totalCommands}\` lệnh\n` +
            `> 🛠️ **Lệnh Custom tùy chỉnh:** \`${customCommands}\` lệnh`,
          inline: false
        },
        {
          name: '⚔️ **RIOT GAMES & ESPORTS TOURNAMENTS**',
          value:
            `> 🎮 **LoL Riot API Key:** ${riotStatus}\n` +
            `> 🥊 **ĐTCL (TFT) API Key:** ${tftStatus}\n` +
            `> 🏆 **Esports Match Broadcast:** ${esportsStatus}`,
          inline: false
        }
      )
      .setColor(0x5865F2)
      .setThumbnail(guild?.iconURL({ size: 256 }) ?? client.user.displayAvatarURL())
      .setFooter({ text: '💡 Quản trị viên có thể tùy chỉnh chi tiết tại Dashboard Web • XeNon Bot' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('🌐 Mở Dashboard Web')
        .setStyle(ButtonStyle.Link)
        .setURL('http://localhost:3000'),
      new ButtonBuilder()
        .setCustomId(`config:help`)
        .setLabel('❓ Xem Hướng Dẫn')
        .setStyle(ButtonStyle.Secondary)
    );

    return reply({ embeds: [embed], components: [row] });
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
      return channel.send(sanitizeAnnouncementText(messageText));
    }
    if (!channel.permissionsFor(client.user)?.has(PermissionFlagsBits.ManageMessages)) {
      return reply('Bot needs Manage Messages permission to remove the original command message.');
    }
    try {
      await source.delete();
    } catch {
      return reply('Could not delete the original command message. Check bot permissions and channel overrides.');
    }
    return channel.send(sanitizeAnnouncementText(messageText));
  }

  if (command.type === 'announce') {
    if (!permissions?.has(PermissionFlagsBits.ManageGuild)) {
      return reply(isInteraction ? { content: 'You need Manage Server permission.', ephemeral: true } : 'You need Manage Server permission.');
    }
    if (!config.announcementsEnabled || !config.announcementChannelId) {
      return reply(isInteraction ? { content: 'Announcements are not configured. Set a channel in the dashboard.', ephemeral: true } : 'Announcements are not configured.');
    }
    const messageText = isInteraction ? source.options.getString('message') : args;
    if (!messageText?.trim()) {
      return reply(isInteraction ? { content: 'Missing announcement message.', ephemeral: true } : 'Missing announcement message.');
    }
    const announcementChannel = await guild.channels.fetch(config.announcementChannelId).catch(() => null);
    if (!announcementChannel?.isTextBased()) {
      return reply(isInteraction ? { content: 'Announcement channel not found or invalid.', ephemeral: true } : 'Announcement channel not found.');
    }
    const mention = config.announcementMention
      ? sanitizeAnnouncementText(config.announcementMention) + ' '
      : '';
    await announcementChannel.send(mention + sanitizeAnnouncementText(messageText));
    return reply(isInteraction
      ? { content: `Announcement sent to <#${config.announcementChannelId}>.`, ephemeral: true }
      : `Announcement sent to <#${config.announcementChannelId}>.`);
  }
}