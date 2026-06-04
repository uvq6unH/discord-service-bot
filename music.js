// ── Music Command Handler (discord-player backend) ────────────────────────────
// Handles: play/p, skip/s, stop, pause, resume/r, queue/q, np, loop, volume/vol

import { EmbedBuilder } from 'discord.js';
import { QueryType, useQueue } from 'discord-player';
import { getMusicPlayer, buildSearchQuery, fmt } from '../../music/resolver.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function sourceLabel(extractor) {
  if (!extractor) return '🎵';
  // discord-player v7 returns the extractor as an object with an `identifier`
  // property; older versions / some tracks pass a plain string.
  const id = (typeof extractor === 'string'
    ? extractor
    : extractor?.identifier ?? extractor?.constructor?.name ?? String(extractor)
  ).toLowerCase();
  if (id.includes('soundcloud')) return '🔶 SoundCloud';
  if (id.includes('youtube'))    return '▶️ YouTube';
  if (id.includes('spotify'))    return '💚 Spotify';
  if (id.includes('vimeo'))      return '🎬 Vimeo';
  return '🔗 Direct';
}

function trackEmbed(track, title, color) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(`**[${track.title}](${track.url})**`)
    .addFields(
      { name: 'Duration', value: track.duration || '?:??', inline: true },
      { name: 'Source', value: sourceLabel(track.extractor), inline: true },
      { name: 'Requested by', value: `<@${track.requestedBy ?? track.requestedBy}>`, inline: true }
    );
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  return embed;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function handleMusicCommand({ message, subcommand, args, config }) {
  const guildId = message.guild.id;
  const musicPrefix = config.musicPrefix || 'hb';
  const player = getMusicPlayer();

  // ── play / p ──────────────────────────────────────────────────────────────
  if (subcommand === 'play' || subcommand === 'p') {
    const input = args.trim();
    if (!input) {
      return message.reply(
        `❌ Thiếu link hoặc tên bài nhạc.\n📌 Ví dụ: \`${musicPrefix} play tên bài\` hoặc \`${musicPrefix} play https://soundcloud.com/...\``
      );
    }

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) return message.reply('❌ Bạn cần vào một **Voice Channel** trước!');

    const botMember = message.guild.members.me;
    if (!voiceChannel.permissionsFor(botMember)?.has(['Connect', 'Speak'])) {
      return message.reply('❌ Bot không có quyền **Connect** hoặc **Speak** trong kênh của bạn!');
    }

    const loadingMsg = await message.reply('🔍 Đang tìm kiếm bài nhạc...').catch(() => null);

    // ── playWithQuery ─────────────────────────────────────────────────────────
    // Extracted so we can call it twice: once with the YouTube URL, then again
    // with a SoundCloud title-search if the first attempt is blocked.
    const playOptions = (searchEngine) => ({
      nodeOptions: {
        metadata: { textChannel: message.channel },
        volume: 80,
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 5000,
        leaveOnEnd: true,
        leaveOnEndCooldown: 10000,
        selfDeaf: true,
      },
      requestedBy: message.author,
      searchEngine,
    });

    try {
      const { query, source, fallbackTitle } = await buildSearchQuery(input);

      // Determine initial search engine
      const initialEngine = (source === 'youtube' || source === 'soundcloud' || source === 'direct')
        ? QueryType.AUTO
        : QueryType.SOUNDCLOUD_SEARCH;

      let track;
      let usedFallback = false;

      try {
        ({ track } = await player.play(voiceChannel, query, playOptions(initialEngine)));
      } catch (firstErr) {
        // YouTube block detection: "No results found", "Sign in", "bot", etc.
        const isYtBlock = source === 'youtube' && (
          firstErr.message?.toLowerCase().includes('no results') ||
          firstErr.message?.toLowerCase().includes('sign in') ||
          firstErr.message?.toLowerCase().includes('bot') ||
          firstErr.message?.toLowerCase().includes('not available')
        );

        if (isYtBlock && fallbackTitle) {
          // Re-try with a SoundCloud title search
          console.warn(`[music] YouTube blocked, falling back to SoundCloud search: "${fallbackTitle}"`);
          if (loadingMsg) await loadingMsg.edit(`🔍 YouTube bị chặn — đang tìm **"${fallbackTitle}"** trên SoundCloud...`).catch(() => null);
          ({ track } = await player.play(voiceChannel, fallbackTitle, playOptions(QueryType.SOUNDCLOUD_SEARCH)));
          usedFallback = true;
        } else {
          throw firstErr; // not a YouTube block, or no title to fall back to
        }
      }

      const queue = useQueue(guildId);
      const isFirst = !queue || queue.size <= 1;

      const embed = new EmbedBuilder()
        .setColor(isFirst ? 0x5865F2 : 0x57F287)
        .setTitle(isFirst ? '🎵 Now Playing' : '✅ Đã thêm vào hàng nhạc')
        .setDescription(`**[${track.title}](${track.url})**`)
        .addFields(
          { name: 'Duration', value: track.duration || '?:??', inline: true },
          { name: 'Source', value: sourceLabel(track.extractor), inline: true },
          { name: 'Requested by', value: `<@${message.author.id}>`, inline: true }
        );
      if (track.thumbnail) embed.setThumbnail(track.thumbnail);
      if (usedFallback) embed.setFooter({ text: '⚠️ YouTube bị chặn — đã tìm qua SoundCloud' });

      return loadingMsg
        ? loadingMsg.edit({ content: '', embeds: [embed] })
        : message.reply({ embeds: [embed] });

    } catch (err) {
      console.error('[music] play error:', err.message);
      const isYtBlock = err.message?.toLowerCase().includes('sign in') ||
                        err.message?.toLowerCase().includes('bot') ||
                        err.message?.toLowerCase().includes('no results');
      const errMsg = isYtBlock
        ? '❌ Không tìm thấy bài nhạc. YouTube đang chặn bot và không có kết quả SoundCloud thay thế.\n💡 Thử: tên bài nhạc, link SoundCloud, hoặc Spotify.'
        : `❌ Không tìm thấy: ${err.message}`;
      return loadingMsg
        ? loadingMsg.edit(errMsg)
        : message.reply(errMsg);
    }
  }

  // ── Helper: get active queue ──────────────────────────────────────────────
  const queue = useQueue(guildId);

  // ── skip / s ──────────────────────────────────────────────────────────────
  if (subcommand === 'skip' || subcommand === 's') {
    if (!queue?.isPlaying()) return message.reply('❌ Không có bài nhạc nào đang phát!');
    queue.node.skip();
    return message.reply('⏭️ Đã bỏ qua bài hiện tại.');
  }

  // ── stop ──────────────────────────────────────────────────────────────────
  if (subcommand === 'stop') {
    if (!queue) return message.reply('❌ Bot đang không phát nhạc!');
    queue.delete();
    return message.reply('⏹️ Đã dừng phát nhạc và rời Voice Channel.');
  }

  // ── pause ─────────────────────────────────────────────────────────────────
  if (subcommand === 'pause') {
    if (!queue?.isPlaying()) return message.reply('❌ Không có bài nhạc nào đang phát!');
    if (queue.node.isPaused()) return message.reply('⏸️ Đã tạm dừng rồi.');
    queue.node.pause();
    return message.reply('⏸️ Đã tạm dừng.');
  }

  // ── resume / r ────────────────────────────────────────────────────────────
  if (subcommand === 'resume' || subcommand === 'r') {
    if (!queue) return message.reply('❌ Không có hàng nhạc nào!');
    if (!queue.node.isPaused()) return message.reply('▶️ Đang phát rồi!');
    queue.node.resume();
    return message.reply('▶️ Đã tiếp tục phát.');
  }

  // ── loop / l ──────────────────────────────────────────────────────────────
  if (subcommand === 'loop' || subcommand === 'l') {
    if (!queue) return message.reply('❌ Không có hàng nhạc nào!');
    const { QueueRepeatMode } = await import('discord-player');
    const current = queue.repeatMode;
    const next = current === QueueRepeatMode.OFF
      ? QueueRepeatMode.TRACK
      : QueueRepeatMode.OFF;
    queue.setRepeatMode(next);
    return message.reply(`🔁 Loop: **${next === QueueRepeatMode.TRACK ? 'BẬT' : 'TẮT'}**`);
  }

  // ── queue / q ─────────────────────────────────────────────────────────────
  if (subcommand === 'queue' || subcommand === 'q') {
    if (!queue?.currentTrack && !queue?.tracks.size) {
      return message.reply('📭 Hàng nhạc trống!');
    }

    const lines = [];
    if (queue.currentTrack) {
      const t = queue.currentTrack;
      lines.push(`▶️ **Đang phát:** [${t.title}](${t.url}) \`${t.duration}\` — <@${t.requestedBy?.id ?? '?'}>`);
    }
    const upcoming = queue.tracks.toArray();
    if (upcoming.length) {
      lines.push('');
      lines.push('**Hàng chờ:**');
      upcoming.slice(0, 10).forEach((t, i) => {
        lines.push(`\`${i + 1}.\` [${t.title}](${t.url}) \`${t.duration}\` — <@${t.requestedBy?.id ?? '?'}>`);
      });
      if (upcoming.length > 10) lines.push(`*... và **${upcoming.length - 10}** bài nữa*`);
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎶 Hàng nhạc')
      .setDescription(lines.join('\n') || '*(trống)*')
      .setFooter({ text: `${queue.size} bài tổng cộng` });

    return message.reply({ embeds: [embed] });
  }

  // ── np / nowplaying ───────────────────────────────────────────────────────
  if (subcommand === 'np' || subcommand === 'nowplaying') {
    if (!queue?.currentTrack) return message.reply('❌ Không có bài nhạc nào đang phát!');
    const t = queue.currentTrack;
    const bar = queue.node.createProgressBar();
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎵 Now Playing')
      .setDescription(`**[${t.title}](${t.url})**\n${bar}`)
      .addFields(
        { name: 'Duration', value: t.duration || '?:??', inline: true },
        { name: 'Source', value: sourceLabel(t.extractor), inline: true },
        { name: 'Requested by', value: `<@${t.requestedBy?.id ?? '?'}>`, inline: true }
      );
    if (t.thumbnail) embed.setThumbnail(t.thumbnail);
    return message.reply({ embeds: [embed] });
  }

  // ── volume / vol ──────────────────────────────────────────────────────────
  if (subcommand === 'volume' || subcommand === 'vol') {
    const vol = parseInt(args, 10);
    if (isNaN(vol) || vol < 0 || vol > 200) return message.reply('❌ Volume phải từ **0–200**');
    if (!queue) return message.reply('❌ Không có hàng nhạc nào!');
    queue.node.setVolume(vol);
    return message.reply(`🔊 Volume: **${vol}%**`);
  }

  // ── help (fallback) ───────────────────────────────────────────────────────
  const p = musicPrefix;
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎵 Music Commands')
    .setDescription(
      `**Music prefix:** \`${p}\`\n\n` +
      `Hỗ trợ: SoundCloud, Spotify (tìm qua SC), YouTube, URL trực tiếp\n` +
      `💡 Nếu YouTube bị chặn, thử link **SoundCloud** hoặc tìm bằng tên bài.`
    )
    .addFields(
      { name: `\`${p} play <link hoặc tên>\``, value: 'Phát nhạc — SC / Spotify / YT / URL' },
      { name: `\`${p} skip\` / \`${p} s\``, value: 'Bỏ qua bài hiện tại' },
      { name: `\`${p} stop\``, value: 'Dừng phát và rời Voice Channel' },
      { name: `\`${p} pause\` / \`${p} resume\``, value: 'Tạm dừng / tiếp tục phát' },
      { name: `\`${p} queue\` / \`${p} q\``, value: 'Xem danh sách hàng nhạc' },
      { name: `\`${p} np\``, value: 'Xem bài đang phát (+ progress bar)' },
      { name: `\`${p} loop\``, value: 'Bật/tắt lặp lại bài hiện tại' },
      { name: `\`${p} volume <0–200>\``, value: 'Điều chỉnh âm lượng (mặc định 80%)' }
    );

  return message.reply({ embeds: [embed] });
}