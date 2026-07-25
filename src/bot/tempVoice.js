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

const _localTempVcStore = new Map(); // channelId -> { ownerId, isLocked, userLimit }

export function buildTempVcControlPanel(channel, ownerId) {
  const embed = new EmbedBuilder()
    .setTitle('⚙️ Welcome to your own temporary voice channel')
    .setDescription(
      `Control your channel using the menus below:\n` +
      `• Use the dropdowns to manage settings and permissions\n` +
      `• Alternatively use \`/voice\` or \`hb voice\` commands\n` +
      `• Channel Owner: <@${ownerId}>\n\n` +
      `Create a **user profile** on the dashboard to save and load your custom channel settings!`
    )
    .setThumbnail('https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f399.png')
    .setColor(0x5865F2)
    .setFooter({ text: 'VoiceMaster Engine • Powered by Antigravity' });

  const settingsSelect = new StringSelectMenuBuilder()
    .setCustomId(`tempvc_settings:${channel.id}:${ownerId}`)
    .setPlaceholder('Change channel settings')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Lock Channel')
        .setValue('lock')
        .setDescription('Prevent new members from joining')
        .setEmoji('🔒'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Unlock Channel')
        .setValue('unlock')
        .setDescription('Allow members to join')
        .setEmoji('🔓'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Rename Channel')
        .setValue('rename')
        .setDescription('Change channel name')
        .setEmoji('✏️'),
      new StringSelectMenuOptionBuilder()
        .setLabel('User Limit')
        .setValue('limit')
        .setDescription('Set max user limit (0 - 99)')
        .setEmoji('👥'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Bitrate Quality')
        .setValue('bitrate')
        .setDescription('Adjust channel audio bitrate')
        .setEmoji('🔊'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Claim Ownership')
        .setValue('claim')
        .setDescription('Claim ownership if owner left')
        .setEmoji('👑')
    );

  const permissionsSelect = new StringSelectMenuBuilder()
    .setCustomId(`tempvc_permissions:${channel.id}:${ownerId}`)
    .setPlaceholder('Change channel permissions')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Permit Member')
        .setValue('permit')
        .setDescription('Grant a member access to locked channel')
        .setEmoji('🟢'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Reject Member')
        .setValue('reject')
        .setDescription('Kick & ban a member from channel')
        .setEmoji('🔴'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Kick Member')
        .setValue('kick')
        .setDescription('Disconnect a member from channel')
        .setEmoji('🥾'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Hide Channel')
        .setValue('hide')
        .setDescription('Hide channel from everyone')
        .setEmoji('👁️'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Unhide Channel')
        .setValue('unhide')
        .setDescription('Make channel visible to everyone')
        .setEmoji('👁️‍🗨️')
    );

  const row1 = new ActionRowBuilder().addComponents(settingsSelect);
  const row2 = new ActionRowBuilder().addComponents(permissionsSelect);
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tempvc_load_settings:${channel.id}:${ownerId}`)
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

export async function handleVoiceStateUpdate(oldState, newState, configStore, redis) {
  const guild = newState.guild || oldState.guild;
  if (!guild) return;

  const config = await configStore.getGuildConfig(guild.id).catch(() => null);
  if (!config || !config.tempVcEnabled) return;

  const masterChannelId = config.tempVcMasterChannelId;
  if (!masterChannelId) return;

  // 1. User Joined Master Join-to-Create Channel
  if (newState.channelId === masterChannelId && oldState.channelId !== masterChannelId) {
    const member = newState.member;
    if (!member) return;

    try {
      const masterChannel = newState.channel;
      const parentCategory = config.tempVcCategoryId || masterChannel?.parentId || undefined;
      const roomName = `🔊 ${member.displayName}'s Room`.slice(0, 90);

      const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
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

      // Create temporary voice channel with built-in text chat
      const newChannel = await guild.channels.create({
        name: roomName,
        type: ChannelType.GuildVoice,
        parent: parentCategory,
        permissionOverwrites: overwrites,
      });

      _localTempVcStore.set(newChannel.id, { ownerId: member.id, isLocked: false });
      if (redis) {
        await redis.hset(`guild:${guild.id}:temp_vcs`, newChannel.id, member.id).catch(() => null);
      }

      // Move member to new channel
      let moved = false;
      try {
        await member.voice.setChannel(newChannel);
        moved = true;
      } catch (moveErr) {
        console.warn(`[tempVoice] Primary setChannel failed (${moveErr.message}), trying newState.setChannel`);
        try {
          await newState.setChannel(newChannel);
          moved = true;
        } catch (e2) {
          console.error(`[tempVoice] Failed to move member ${member.user.tag}:`, e2.message);
        }
      }

      // Post VoiceMaster Control Interface into the channel's text chat
      const controlPanel = buildTempVcControlPanel(newChannel, member.id);
      await newChannel.send(controlPanel).catch(() => null);

      console.log(`[tempVoice] Created temp voice channel "${roomName}" (${newChannel.id}) for ${member.user.tag} (moved: ${moved})`);
    } catch (err) {
      console.error('[tempVoice] Error creating temp channel:', err.message);
    }
  }

  // 2. User Left a Channel — Delete if temp channel is empty
  const prevChannel = oldState.channel;
  if (prevChannel && prevChannel.id !== masterChannelId) {
    let isTempVc = _localTempVcStore.has(prevChannel.id);
    if (!isTempVc && redis) {
      const ownerId = await redis.hget(`guild:${guild.id}:temp_vcs`, prevChannel.id).catch(() => null);
      if (ownerId) isTempVc = true;
    }

    if (isTempVc && prevChannel.members.size === 0) {
      try {
        _localTempVcStore.delete(prevChannel.id);
        if (redis) {
          await redis.hdel(`guild:${guild.id}:temp_vcs`, prevChannel.id).catch(() => null);
        }
        await prevChannel.delete('Temp Voice Channel is empty');
        console.log(`[tempVoice] Deleted empty temp voice channel (${prevChannel.id})`);
      } catch (err) {
        console.error('[tempVoice] Error deleting empty temp channel:', err.message);
      }
    }
  }
}
