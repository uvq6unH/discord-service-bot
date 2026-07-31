import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from 'discord.js';

// ── In-memory store for temp voice channels ──────────────────────────────────
const _tempChannels = new Map(); // channelId -> { ownerId, isLocked }

/**
 * Build the VoiceMaster Control Panel embed + components.
 * Sent into the text chat area of every newly created temp voice channel.
 */
export function buildControlPanel(channelId, ownerId) {
  const embed = new EmbedBuilder()
    .setTitle('⚙️ Temporary Channel Controls Interface')
    .setDescription(
      `Control your channel using the menus below\n` +
      `• Use the dropdowns to manage settings and permissions\n` +
      `• Alternatively use \`/voice\` commands\n` +
      `• Channel Owner: <@${ownerId}>`
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'VoiceMaster Engine' });

  const settingsMenu = new StringSelectMenuBuilder()
    .setCustomId(`vm:settings:${channelId}:${ownerId}`)
    .setPlaceholder('Change channel settings')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Lock Channel').setValue('lock').setDescription('Prevent new members from joining').setEmoji('🔒'),
      new StringSelectMenuOptionBuilder().setLabel('Unlock Channel').setValue('unlock').setDescription('Allow members to join').setEmoji('🔓'),
      new StringSelectMenuOptionBuilder().setLabel('Rename Channel').setValue('rename').setDescription('Change channel name').setEmoji('✏️'),
      new StringSelectMenuOptionBuilder().setLabel('User Limit').setValue('limit').setDescription('Set max user limit (0–99)').setEmoji('👥'),
      new StringSelectMenuOptionBuilder().setLabel('Bitrate Quality').setValue('bitrate').setDescription('Adjust channel audio bitrate').setEmoji('🔊'),
      new StringSelectMenuOptionBuilder().setLabel('Claim Ownership').setValue('claim').setDescription('Claim ownership if owner left').setEmoji('👑')
    );

  const permissionsMenu = new StringSelectMenuBuilder()
    .setCustomId(`vm:perms:${channelId}:${ownerId}`)
    .setPlaceholder('Change channel permissions')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Permit Member').setValue('permit').setDescription('Grant a member access to locked channel').setEmoji('🟢'),
      new StringSelectMenuOptionBuilder().setLabel('Reject Member').setValue('reject').setDescription('Kick & ban a member from channel').setEmoji('🔴'),
      new StringSelectMenuOptionBuilder().setLabel('Kick Member').setValue('kick_member').setDescription('Disconnect a member from channel').setEmoji('🥾'),
      new StringSelectMenuOptionBuilder().setLabel('Hide Channel').setValue('hide').setDescription('Hide channel from everyone').setEmoji('👁️'),
      new StringSelectMenuOptionBuilder().setLabel('Unhide Channel').setValue('unhide').setDescription('Make channel visible to everyone').setEmoji('👁️‍🗨️')
    );

  const row1 = new ActionRowBuilder().addComponents(settingsMenu);
  const row2 = new ActionRowBuilder().addComponents(permissionsMenu);
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vm:refresh:${channelId}:${ownerId}`)
      .setLabel('Load Settings')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setLabel('Dashboard')
      .setStyle(ButtonStyle.Link)
      .setURL('https://discord-dashboard-g3xb.onrender.com')
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

/**
 * Core VoiceStateUpdate handler.
 * 1) User joins Master channel → create temp VC, move user in, post control panel.
 * 2) Temp VC becomes empty → auto-delete it.
 */
export async function handleVoiceStateUpdate(oldState, newState, configStore, redis) {
  const guild = newState.guild || oldState.guild;
  if (!guild) return;

  const config = await configStore.getGuildConfig(guild.id).catch(() => null);
  if (!config || !config.tempVcEnabled) return;

  const masterChannelId = config.tempVcMasterChannelId;
  if (!masterChannelId) return;

  // ── 1. User joined the Master "Join to Create" channel ───────────────────
  if (newState.channelId === masterChannelId && oldState.channelId !== masterChannelId) {
    const member = newState.member;
    if (!member) return;

    try {
      const masterChannel = newState.channel;
      const parentCategory = config.tempVcCategoryId || masterChannel?.parentId || undefined;
      const roomName = `🔊 ${member.displayName}'s Room`.slice(0, 90);

      // Ensure bot has MoveMembers permission on the Master channel
      const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
      if (me && masterChannel) {
        const botPerms = masterChannel.permissionsFor(me);
        if (!botPerms?.has(PermissionFlagsBits.MoveMembers)) {
          console.warn(`[tempVoice] Bot missing MoveMembers on Master channel ${masterChannelId}, attempting to fix...`);
          await masterChannel.permissionOverwrites.edit(me.id, {
            Connect: true, Speak: true, MoveMembers: true, ManageChannels: true, ViewChannel: true
          }).catch((e) => console.error('[tempVoice] Cannot fix Master channel perms:', e.message));
        }
      }

      // Build permission overwrites for the new temp channel
      const overwrites = [
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.ViewChannel,
          ],
        },
      ];
      if (me) {
        overwrites.push({
          id: me.id,
          allow: [
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.Speak,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ViewChannel,
          ],
        });
      }

      // Create the temporary voice channel
      const tempChannel = await guild.channels.create({
        name: roomName,
        type: ChannelType.GuildVoice,
        parent: parentCategory,
        permissionOverwrites: overwrites,
      });

      // Track it
      _tempChannels.set(tempChannel.id, { ownerId: member.id, isLocked: false });
      if (redis) {
        await redis.hset(`guild:${guild.id}:temp_vcs`, tempChannel.id, member.id).catch(() => null);
      }

      // Move member into the new channel — re-fetch to ensure fresh voice state
      const freshMember = await guild.members.fetch(member.id).catch(() => member);
      if (freshMember.voice?.channelId) {
        try {
          await freshMember.voice.setChannel(tempChannel);
          console.log(`[tempVoice] ✅ Moved ${freshMember.user.tag} → "${roomName}" (${tempChannel.id})`);
        } catch (moveErr) {
          console.error(`[tempVoice] ❌ setChannel failed for ${freshMember.user.tag}: ${moveErr.message} (code: ${moveErr.code})`);
          // Fallback: try via newState
          try {
            await newState.setChannel(tempChannel);
            console.log(`[tempVoice] ✅ Fallback move worked for ${freshMember.user.tag}`);
          } catch (e2) {
            console.error(`[tempVoice] ❌ Fallback also failed: ${e2.message}`);
          }
        }
      } else {
        console.warn(`[tempVoice] ⚠️ ${member.user.tag} left voice before we could move them`);
      }

      // Post the control panel into the channel's text chat
      const panel = buildControlPanel(tempChannel.id, member.id);
      await tempChannel.send(panel).catch(() => null);

      console.log(`[tempVoice] Created "${roomName}" (${tempChannel.id}) for ${member.user.tag}`);
    } catch (err) {
      console.error('[tempVoice] Error creating temp channel:', err.message, err.stack);
    }
  }

  // ── 2. User left a channel — delete if temp channel is now empty ─────────
  const prevChannel = oldState.channel;
  if (prevChannel && prevChannel.id !== masterChannelId) {
    const isTempVc = _tempChannels.has(prevChannel.id);

    if (isTempVc && prevChannel.members.size === 0) {
      try {
        _tempChannels.delete(prevChannel.id);
        if (redis) {
          await redis.hdel(`guild:${guild.id}:temp_vcs`, prevChannel.id).catch(() => null);
        }
        await prevChannel.delete('Temp voice channel is empty');
        console.log(`[tempVoice] Deleted empty temp channel (${prevChannel.id})`);
      } catch (err) {
        console.error('[tempVoice] Error deleting temp channel:', err.message);
      }
    }
  }
}
