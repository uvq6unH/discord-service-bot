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
    .setTitle('⚙️ Welcome to your temporary voice channel')
    .setDescription(
      `Control your channel using the menus below:\n` +
      `• Use the dropdowns to manage settings and permissions\n` +
      `• Alternatively use \`/voice\` commands\n` +
      `• Owner: <@${ownerId}>`
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'VoiceMaster Control Engine • Discord Bot' });

  const settingsSelect = new StringSelectMenuBuilder()
    .setCustomId(`tempvc_settings:${channel.id}:${ownerId}`)
    .setPlaceholder('Change channel settings...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Lock Channel')
        .setValue('lock')
        .setDescription('Prevent new users from joining your voice channel')
        .setEmoji('🔒'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Unlock Channel')
        .setValue('unlock')
        .setDescription('Allow anyone to join your voice channel')
        .setEmoji('🔓'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Rename Channel')
        .setValue('rename')
        .setDescription('Change the name of your voice channel')
        .setEmoji('✏️'),
      new StringSelectMenuOptionBuilder()
        .setLabel('User Limit')
        .setValue('limit')
        .setDescription('Set max user limit for your channel')
        .setEmoji('👥')
    );

  const permissionsSelect = new StringSelectMenuBuilder()
    .setCustomId(`tempvc_permissions:${channel.id}:${ownerId}`)
    .setPlaceholder('Change channel permissions...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Permit Member')
        .setValue('permit')
        .setDescription('Allow a specific user to join locked channel')
        .setEmoji('🟢'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Reject Member')
        .setValue('reject')
        .setDescription('Kick and block a user from channel')
        .setEmoji('🔴'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Claim Ownership')
        .setValue('claim')
        .setDescription('Claim ownership if original owner left')
        .setEmoji('👑')
    );

  const row1 = new ActionRowBuilder().addComponents(settingsSelect);
  const row2 = new ActionRowBuilder().addComponents(permissionsSelect);
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tempvc_refresh:${channel.id}:${ownerId}`)
      .setLabel('Refresh Status')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setLabel('Dashboard')
      .setStyle(ButtonStyle.Link)
      .setURL('http://localhost:10001')
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

      // Create temporary voice channel with built-in text chat
      const newChannel = await guild.channels.create({
        name: roomName,
        type: ChannelType.GuildVoice,
        parent: parentCategory,
        permissionOverwrites: [
          {
            id: member.id,
            allow: [
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MoveMembers,
            ],
          },
        ],
      });

      _localTempVcStore.set(newChannel.id, { ownerId: member.id, isLocked: false });
      if (redis) {
        await redis.hset(`guild:${guild.id}:temp_vcs`, newChannel.id, member.id).catch(() => null);
      }

      // Move member to new channel
      await newState.setChannel(newChannel).catch(() => null);

      // Post VoiceMaster Control Interface into the channel's text chat
      const controlPanel = buildTempVcControlPanel(newChannel, member.id);
      await newChannel.send(controlPanel).catch(() => null);

      console.log(`[tempVoice] Created temp voice channel "${roomName}" (${newChannel.id}) for ${member.user.tag}`);
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
