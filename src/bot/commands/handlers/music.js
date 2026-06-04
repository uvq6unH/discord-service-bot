// ── Music Command Handler ─────────────────────────────────────────────────────
// Called from bot.js when a message matches the music prefix.
// Handles: play/p, skip/s, stop, pause, resume/r, queue/q, np, loop, volume/vol

import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
  NoSubscriberBehavior
} from '@discordjs/voice';
import { EmbedBuilder } from 'discord.js';
import { getQueue, deleteQueue } from '../../music/queue.js';
import { resolveTrack, createAudioStream } from '../../music/resolver.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function sourceLabel(source) {
  return { youtube: '▶️ YouTube', spotify: '💚 Spotify', soundcloud: '🔶 SoundCloud', direct: '🔗 Direct' }[source] ?? source;
}

function nowPlayingEmbed(track) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎵 Now Playing')
    .setDescription(`**[${track.title}](${track.url})**`)
    .addFields(
      { name: 'Duration', value: track.durationFmt, inline: true },
      { name: 'Source', value: sourceLabel(track.source), inline: true },
      { name: 'Requested by', value: `<@${track.requestedBy}>`, inline: true }
    );
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  return embed;
}

// ── Core playback ─────────────────────────────────────────────────────────────

async function playNext(guildId, textChannel) {
  const q = getQueue(guildId);
  const track = q.advance();

  if (!track) {
    // Queue exhausted — leave channel
    q.player?.stop(true);
    try { q.connection?.destroy(); } catch { /* ignored */ }
    deleteQueue(guildId);
    textChannel?.send('👋 Hết hàng nhạc, bot rời Voice Channel.').catch(() => null);
    return;
  }

  q.current = track;

  try {
    const streamInfo = await createAudioStream(track);

    const inputType = streamInfo.type === 'opus' ? StreamType.Opus : StreamType.Arbitrary;
    const resource = createAudioResource(streamInfo.stream, { inputType, inlineVolume: true });
    resource.volume?.setVolume(q.volume);

    q.player.play(resource);

    textChannel?.send({ embeds: [nowPlayingEmbed(track)] }).catch(() => null);
  } catch (err) {
    console.error('[music] Stream error:', err.message);
    textChannel?.send(`⚠️ Không phát được **${track.title}**: ${err.message}. Chuyển bài tiếp...`).catch(() => null);
    setTimeout(() => playNext(guildId, textChannel), 1500);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {{ message: import('discord.js').Message, subcommand: string, args: string, config: object }} opts
 */
export async function handleMusicCommand({ message, subcommand, args, config }) {
  const guildId = message.guild.id;
  const musicPrefix = config.musicPrefix || 'hb';

  // ── play / p ──────────────────────────────────────────────────────────────
  if (subcommand === 'play' || subcommand === 'p') {
    const input = args.trim();
    if (!input) {
      return message.reply(
        `❌ Thiếu link hoặc tên bài nhạc.\n📌 Ví dụ: \`${musicPrefix} play https://youtu.be/...\` hoặc \`${musicPrefix} play tên bài hát\``
      );
    }

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) return message.reply('❌ Bạn cần vào một **Voice Channel** trước!');

    const botMember = message.guild.members.me;
    if (!voiceChannel.permissionsFor(botMember)?.has(['Connect', 'Speak'])) {
      return message.reply('❌ Bot không có quyền **Connect** hoặc **Speak** trong kênh của bạn!');
    }

    const loadingMsg = await message.reply('🔍 Đang tìm kiếm bài nhạc...').catch(() => null);

    let track;
    try {
      track = await resolveTrack(input);
      track.requestedBy = message.author.id;
    } catch (err) {
      return loadingMsg
        ? loadingMsg.edit(`❌ Không tìm thấy: ${err.message}`)
        : message.reply(`❌ Không tìm thấy: ${err.message}`);
    }

    const q = getQueue(guildId);
    q.enqueue(track);

    // If already playing, just add to queue
    if (q.player && q.player.state.status !== AudioPlayerStatus.Idle) {
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Đã thêm vào hàng nhạc')
        .setDescription(`**[${track.title}](${track.url})**`)
        .addFields(
          { name: 'Duration', value: track.durationFmt, inline: true },
          { name: 'Source', value: sourceLabel(track.source), inline: true },
          { name: 'Vị trí', value: `#${q.tracks.length}`, inline: true }
        );
      if (track.thumbnail) embed.setThumbnail(track.thumbnail);
      return loadingMsg
        ? loadingMsg.edit({ content: '', embeds: [embed] })
        : message.reply({ embeds: [embed] });
    }

    // First track — join voice and start playing
    await loadingMsg?.delete().catch(() => null);

    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId,
        adapterCreator: message.guild.voiceAdapterCreator
      });

      const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Pause }
      });

      q.connection = connection;
      q.player = player;
      q.textChannel = message.channel;

      connection.subscribe(player);

      // Auto-advance on track end
      player.on(AudioPlayerStatus.Idle, () => {
        if (q.loop && q.current) q.tracks.unshift({ ...q.current });
        playNext(guildId, q.textChannel);
      });

      player.on('error', (err) => {
        console.error('[music] AudioPlayer error:', err.message);
        q.textChannel?.send(`⚠️ Lỗi phát nhạc: ${err.message}. Đang chuyển bài...`).catch(() => null);
        setTimeout(() => playNext(guildId, q.textChannel), 1500);
      });

      // Handle unexpected disconnects gracefully
      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
          ]);
          // Successfully reconnected
        } catch {
          connection.destroy();
          deleteQueue(guildId);
        }
      });

      await playNext(guildId, message.channel);
    } catch (err) {
      console.error('[music] Join error:', err);
      return message.reply(`❌ Không thể kết nối Voice Channel: ${err.message}`);
    }
    return;
  }

  // ── All other commands require an active queue ────────────────────────────
  const q = getQueue(guildId);
  const active = q.player && q.connection;

  // ── skip / s ──────────────────────────────────────────────────────────────
  if (subcommand === 'skip' || subcommand === 's') {
    if (!active || !q.current) return message.reply('❌ Không có bài nhạc nào đang phát!');
    q.player.stop();
    return message.reply('⏭️ Đã bỏ qua bài hiện tại.');
  }

  // ── stop ──────────────────────────────────────────────────────────────────
  if (subcommand === 'stop') {
    if (!active) return message.reply('❌ Bot đang không phát nhạc!');
    q.loop = false;
    q.clear();
    q.player.stop(true);
    try { q.connection.destroy(); } catch { /* ignored */ }
    deleteQueue(guildId);
    return message.reply('⏹️ Đã dừng phát nhạc và rời Voice Channel.');
  }

  // ── pause ─────────────────────────────────────────────────────────────────
  if (subcommand === 'pause') {
    if (!active) return message.reply('❌ Không có bài nhạc nào đang phát!');
    if (q.player.state.status === AudioPlayerStatus.Paused) return message.reply('⏸️ Đã tạm dừng rồi.');
    q.player.pause();
    return message.reply('⏸️ Đã tạm dừng.');
  }

  // ── resume / r ────────────────────────────────────────────────────────────
  if (subcommand === 'resume' || subcommand === 'r') {
    if (!active) return message.reply('❌ Không có hàng nhạc nào!');
    if (q.player.state.status !== AudioPlayerStatus.Paused) return message.reply('▶️ Đang phát rồi!');
    q.player.unpause();
    return message.reply('▶️ Đã tiếp tục phát.');
  }

  // ── loop / l ──────────────────────────────────────────────────────────────
  if (subcommand === 'loop' || subcommand === 'l') {
    q.loop = !q.loop;
    return message.reply(`🔁 Loop: **${q.loop ? 'BẬT' : 'TẮT'}**`);
  }

  // ── queue / q ─────────────────────────────────────────────────────────────
  if (subcommand === 'queue' || subcommand === 'q') {
    if (!q.current && q.tracks.length === 0) return message.reply('📭 Hàng nhạc trống!');

    const lines = [];
    if (q.current) {
      lines.push(`▶️ **Đang phát:** [${q.current.title}](${q.current.url}) \`${q.current.durationFmt}\` — <@${q.current.requestedBy}>`);
    }
    if (q.tracks.length > 0) {
      lines.push('');
      lines.push('**Hàng chờ:**');
      q.tracks.slice(0, 10).forEach((t, i) => {
        lines.push(`\`${i + 1}.\` [${t.title}](${t.url}) \`${t.durationFmt}\` — <@${t.requestedBy}>`);
      });
      if (q.tracks.length > 10) lines.push(`*... và **${q.tracks.length - 10}** bài nữa*`);
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎶 Hàng nhạc')
      .setDescription(lines.join('\n') || '*(trống)*')
      .setFooter({ text: `${q.size} bài tổng cộng${q.loop ? ' • 🔁 Loop BẬT' : ''}` });

    return message.reply({ embeds: [embed] });
  }

  // ── np / nowplaying ───────────────────────────────────────────────────────
  if (subcommand === 'np' || subcommand === 'nowplaying') {
    if (!q.current) return message.reply('❌ Không có bài nhạc nào đang phát!');
    return message.reply({ embeds: [nowPlayingEmbed(q.current)] });
  }

  // ── volume / vol ──────────────────────────────────────────────────────────
  if (subcommand === 'volume' || subcommand === 'vol') {
    const vol = parseFloat(args);
    if (isNaN(vol) || vol < 0 || vol > 200) return message.reply('❌ Volume phải từ **0–200**');
    q.volume = vol / 100;
    // Apply immediately to the currently playing resource if available
    const resource = q.player?.state?.resource;
    if (resource?.volume) resource.volume.setVolume(q.volume);
    return message.reply(`🔊 Volume: **${vol}%**`);
  }

  // ── help (fallback) ───────────────────────────────────────────────────────
  const p = musicPrefix;
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎵 Music Commands')
    .setDescription(`**Music prefix:** \`${p}\`\n\nHỗ trợ: YouTube, Spotify, SoundCloud, URL trực tiếp`)
    .addFields(
      { name: `\`${p} play <link hoặc tên>\``, value: 'Phát nhạc — YT / Spotify / SC / URL' },
      { name: `\`${p} skip\` / \`${p} s\``, value: 'Bỏ qua bài hiện tại' },
      { name: `\`${p} stop\``, value: 'Dừng phát và rời Voice Channel' },
      { name: `\`${p} pause\` / \`${p} resume\``, value: 'Tạm dừng / tiếp tục phát' },
      { name: `\`${p} queue\` / \`${p} q\``, value: 'Xem danh sách hàng nhạc' },
      { name: `\`${p} np\``, value: 'Xem bài đang phát (Now Playing)' },
      { name: `\`${p} loop\``, value: 'Bật/tắt lặp lại bài hiện tại' },
      { name: `\`${p} volume <0–200>\``, value: 'Điều chỉnh âm lượng (mặc định 80%)' }
    );

  return message.reply({ embeds: [embed] });
}
