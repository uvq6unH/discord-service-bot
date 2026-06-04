// ── Music Command Handler (discord-player backend) ────────────────────────────
// Handles: play/p, skip/s, stop, pause, resume/r, queue/q, np, loop, volume/vol

import { EmbedBuilder } from 'discord.js';
import { QueryType, useQueue } from 'discord-player';
import { getMusicPlayer, buildSearchQuery, fmt } from '../../music/resolver.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function sourceLabel(extractor) {
  if (!extractor) return '🎵';
  // discord-player v7 trả extractor là object có .identifier, không phải string
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
      { name: 'Requested by', value: `<@${track.requestedBy?.id ?? '?'}>`, inline: true }
    );
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  return embed;
}

// nodeOptions dùng chung — leaveOnEnd/leaveOnEmpty luôn bật
const NODE_OPTIONS = (textChannel) => ({
  metadata: { textChannel },
  volume: 80,
  leaveOnEmpty: true,
  leaveOnEmptyCooldown: 5000,
  leaveOnEnd: true,
  leaveOnEndCooldown: 30000,   // 30s trước khi rời sau khi hết nhạc
  selfDeaf: true,
});

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

    try {
      const { query, source, fallbackTitle } = await buildSearchQuery(input);

      const initialEngine = (source === 'youtube' || source === 'soundcloud' || source === 'direct')
        ? QueryType.AUTO
        : QueryType.SOUNDCLOUD_SEARCH;

      let track;
      let usedFallback = false;

      try {
        console.log('[music] play attempt 1 | query:', query, '| engine:', initialEngine);
        const result = await player.play(voiceChannel, query, {
          nodeOptions: NODE_OPTIONS(message.channel),
          requestedBy: message.author,
          searchEngine: initialEngine,
        });
        track = result.track;
        console.log('[music] play attempt 1 OK | track:', track?.title, '| extractor:', track?.extractor?.identifier ?? track?.extractor);
      } catch (firstErr) {
        // ── YouTube bị chặn → fallback SoundCloud ──────────────────────────
        // QUAN TRỌNG: discord-player có thể đã join voice và tạo queue trước
        // khi throw. Phải destroy queue đó trước khi retry, nếu không queue rỗng
        // sẽ trigger leaveOnEnd và bot sẽ disconnect ngay sau khi vào lại.
        const existingQueue = useQueue(guildId);
        if (existingQueue) {
          existingQueue.delete();
          // Chờ một tick để voice connection được giải phóng
          await new Promise(r => setTimeout(r, 300));
        }

        const isYtBlock = source === 'youtube' && (
          firstErr.message?.toLowerCase().includes('no results') ||
          firstErr.message?.toLowerCase().includes('sign in') ||
          firstErr.message?.toLowerCase().includes('bot') ||
          firstErr.message?.toLowerCase().includes('not available') ||
          firstErr.message?.toLowerCase().includes('unavailable')
        );

        if (isYtBlock && fallbackTitle) {
          console.warn(`[music] YouTube blocked → SoundCloud fallback: "${fallbackTitle}"`);
          if (loadingMsg) {
            await loadingMsg.edit(`🔍 YouTube bị chặn — đang tìm **"${fallbackTitle}"** trên SoundCloud...`).catch(() => null);
          }
          console.log('[music] play attempt 2 (SC fallback) | query:', fallbackTitle);
          const result2 = await player.play(voiceChannel, fallbackTitle, {
            nodeOptions: NODE_OPTIONS(message.channel),
            requestedBy: message.author,
            searchEngine: QueryType.SOUNDCLOUD_SEARCH,
          });
          track = result2.track;
          console.log('[music] play attempt 2 OK | track:', track?.title, '| extractor:', track?.extractor?.identifier ?? track?.extractor);
          usedFallback = true;
        } else {
          throw firstErr;
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
      // Nếu còn queue treo thì dọn luôn
      useQueue(guildId)?.delete();
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
