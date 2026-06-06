// ── Music Command Handler (Lavalink v4 backend) ────────────────────────────────
// Handles: play/p, skip/s, stop, pause, resume/r, queue/q, np, loop, volume/vol
//
// Requires lavalink.js to have been initialised (initLavalink called in bot.js).

import { EmbedBuilder } from 'discord.js';
import {
  getLavalinkManager,
  buildLavalinkQuery,
  sourceLabel,
  fmt,
} from '../../music/lavalink.js';

// ── Embed builder ─────────────────────────────────────────────────────────────

function trackEmbed(track, title, color, extra = {}) {
  const info = track.info;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(`**[${info.title}](${info.uri})**`)
    .addFields(
      { name: 'Duration',      value: info.isStream ? '🔴 Live' : fmt(info.length), inline: true },
      { name: 'Source',        value: sourceLabel(track), inline: true },
      { name: 'Requested by',  value: `<@${track.requester?.id ?? info.requester ?? '?'}>`, inline: true }
    );
  if (info.artworkUrl) embed.setThumbnail(info.artworkUrl);
  if (extra.footer)    embed.setFooter({ text: extra.footer });
  return embed;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function handleMusicCommand({ message, subcommand, args, config }) {
  const guildId     = message.guild.id;
  const musicPrefix = config.musicPrefix || 'hb';
  const manager     = getLavalinkManager();

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
      // Get or create player for this guild
      let player = manager.getPlayer(guildId);
      if (!player) {
        player = await manager.createPlayer({
          guildId,
          voiceChannelId: voiceChannel.id,
          textChannelId:  message.channel.id,
          selfDeaf:       true,
          volume:         80,
        });
      }

      // Store textChannel ref for event callbacks
      player.set('textChannel', message.channel);

      // Connect if not already connected
      if (!player.connected) {
        await player.connect();
      }

      // Resolve query — URL first, then ytsearch, fallback scsearch
      const { query, isUrl, searchTerm } = buildLavalinkQuery(input);

      let res = await player.search({ query }, message.author);

      // YouTube search returned no results or is blocked → fallback SoundCloud
      if (
        !isUrl &&
        (res.loadType === 'empty' || res.loadType === 'error' || !res.tracks?.length)
      ) {
        console.warn(`[music] ytsearch failed for "${searchTerm}" — trying scsearch`);
        res = await player.search({ query: `scsearch:${searchTerm}` }, message.author);
      }

      if (res.loadType === 'error') {
        throw new Error(res.exception?.message ?? 'Lavalink search error');
      }
      if (res.loadType === 'empty' || !res.tracks?.length) {
        throw new Error('Không tìm thấy bài nhạc nào.');
      }

      // Add track(s) to queue
      const wasPlaying = player.playing || player.paused;
      let addedCount = 0;

      if (res.loadType === 'playlist') {
        for (const track of res.playlist.tracks) {
          await player.queue.add(track);
        }
        addedCount = res.playlist.tracks.length;
      } else {
        await player.queue.add(res.tracks[0]);
        addedCount = 1;
      }

      // Start playback if not already running
      if (!wasPlaying) await player.play();

      const firstTrack = res.loadType === 'playlist'
        ? res.playlist.tracks[0]
        : res.tracks[0];

      const isNowPlaying = !wasPlaying;
      let embedTitle, embedColor;

      if (res.loadType === 'playlist') {
        embedTitle = `✅ Đã thêm playlist (${addedCount} bài)`;
        embedColor = 0x57F287;
      } else {
        embedTitle = isNowPlaying ? '🎵 Now Playing' : '✅ Đã thêm vào hàng nhạc';
        embedColor = isNowPlaying ? 0x5865F2 : 0x57F287;
      }

      const ytFallback = !isUrl &&
        res.tracks[0]?.info?.sourceName === 'soundcloud' &&
        query.startsWith('ytsearch:') === false;

      const embed = trackEmbed(firstTrack, embedTitle, embedColor,
        ytFallback ? { footer: '⚠️ YouTube không có kết quả — đã tìm qua SoundCloud' } : {}
      );

      if (res.loadType === 'playlist') {
        embed.addFields({ name: 'Playlist', value: res.playlist.name ?? 'Unknown', inline: false });
      }

      return loadingMsg
        ? loadingMsg.edit({ content: '', embeds: [embed] })
        : message.reply({ embeds: [embed] });

    } catch (err) {
      console.error('[music] play error:', err.message);
      const errMsg = `❌ ${err.message}`;
      return loadingMsg
        ? loadingMsg.edit(errMsg)
        : message.reply(errMsg);
    }
  }

  // ── Helper: get active player ─────────────────────────────────────────────
  const player = manager.getPlayer(guildId);

  // ── skip / s ──────────────────────────────────────────────────────────────
  if (subcommand === 'skip' || subcommand === 's') {
    if (!player?.playing) return message.reply('❌ Không có bài nhạc nào đang phát!');
    await player.skip();
    return message.reply('⏭️ Đã bỏ qua bài hiện tại.');
  }

  // ── stop ──────────────────────────────────────────────────────────────────
  if (subcommand === 'stop') {
    if (!player) return message.reply('❌ Bot đang không phát nhạc!');
    await player.destroy();
    return message.reply('⏹️ Đã dừng phát nhạc và rời Voice Channel.');
  }

  // ── pause ─────────────────────────────────────────────────────────────────
  if (subcommand === 'pause') {
    if (!player?.playing) return message.reply('❌ Không có bài nhạc nào đang phát!');
    if (player.paused)    return message.reply('⏸️ Đã tạm dừng rồi.');
    await player.pause(true);
    return message.reply('⏸️ Đã tạm dừng.');
  }

  // ── resume / r ────────────────────────────────────────────────────────────
  if (subcommand === 'resume' || subcommand === 'r') {
    if (!player)          return message.reply('❌ Không có hàng nhạc nào!');
    if (!player.paused)   return message.reply('▶️ Đang phát rồi!');
    await player.pause(false);
    return message.reply('▶️ Đã tiếp tục phát.');
  }

  // ── loop / l ──────────────────────────────────────────────────────────────
  if (subcommand === 'loop' || subcommand === 'l') {
    if (!player) return message.reply('❌ Không có hàng nhạc nào!');
    // Cycle: off → track → queue → off
    const modes = ['off', 'track', 'queue'];
    const current = player.repeatMode ?? 'off';
    const next = modes[(modes.indexOf(current) + 1) % modes.length];
    await player.setRepeatMode(next);
    const label = { off: '❌ TẮT', track: '🔂 Lặp bài', queue: '🔁 Lặp hàng' }[next];
    return message.reply(`Loop: **${label}**`);
  }

  // ── queue / q ─────────────────────────────────────────────────────────────
  if (subcommand === 'queue' || subcommand === 'q') {
    const current  = player?.queue?.current;
    const upcoming = player?.queue?.tracks ?? [];

    if (!current && !upcoming.length) {
      return message.reply('📭 Hàng nhạc trống!');
    }

    const lines = [];
    if (current) {
      const i = current.info;
      lines.push(`▶️ **Đang phát:** [${i.title}](${i.uri}) \`${fmt(i.length)}\` — <@${current.requester?.id ?? '?'}>`);
    }
    if (upcoming.length) {
      lines.push('');
      lines.push('**Hàng chờ:**');
      upcoming.slice(0, 10).forEach((t, idx) => {
        lines.push(`\`${idx + 1}.\` [${t.info.title}](${t.info.uri}) \`${fmt(t.info.length)}\` — <@${t.requester?.id ?? '?'}>`);
      });
      if (upcoming.length > 10) lines.push(`*... và **${upcoming.length - 10}** bài nữa*`);
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎶 Hàng nhạc')
      .setDescription(lines.join('\n') || '*(trống)*')
      .setFooter({ text: `${(upcoming.length + (current ? 1 : 0))} bài tổng cộng` });

    return message.reply({ embeds: [embed] });
  }

  // ── np / nowplaying ───────────────────────────────────────────────────────
  if (subcommand === 'np' || subcommand === 'nowplaying') {
    const current = player?.queue?.current;
    if (!current) return message.reply('❌ Không có bài nhạc nào đang phát!');

    const info     = current.info;
    const pos      = player.position ?? 0;
    const len      = info.length ?? 0;
    const barLen   = 20;
    const filled   = len > 0 ? Math.round((pos / len) * barLen) : 0;
    const bar      = '█'.repeat(filled) + '░'.repeat(barLen - filled);
    const progress = `\`${fmt(pos)} ${bar} ${fmt(len)}\``;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎵 Now Playing')
      .setDescription(`**[${info.title}](${info.uri})**\n${progress}`)
      .addFields(
        { name: 'Duration',     value: info.isStream ? '🔴 Live' : fmt(info.length), inline: true },
        { name: 'Source',       value: sourceLabel(current), inline: true },
        { name: 'Requested by', value: `<@${current.requester?.id ?? '?'}>`, inline: true }
      );
    if (info.artworkUrl) embed.setThumbnail(info.artworkUrl);

    return message.reply({ embeds: [embed] });
  }

  // ── volume / vol ──────────────────────────────────────────────────────────
  if (subcommand === 'volume' || subcommand === 'vol') {
    const vol = parseInt(args, 10);
    if (isNaN(vol) || vol < 0 || vol > 200) return message.reply('❌ Volume phải từ **0–200**');
    if (!player) return message.reply('❌ Không có hàng nhạc nào!');
    await player.setVolume(vol);
    return message.reply(`🔊 Volume: **${vol}%**`);
  }

  // ── help (fallback) ───────────────────────────────────────────────────────
  const p = musicPrefix;
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎵 Music Commands')
    .setDescription(
      `**Music prefix:** \`${p}\`\n\n` +
      `Hỗ trợ: YouTube, SoundCloud, Spotify\\*, Apple Music\\*, URL trực tiếp\n` +
      `\\* *Lấy metadata Spotify/Apple → phát audio YouTube*`
    )
    .addFields(
      { name: `\`${p} play <link hoặc tên>\``, value: 'Phát nhạc — YT / SC / Spotify / URL' },
      { name: `\`${p} skip\` / \`${p} s\``,    value: 'Bỏ qua bài hiện tại' },
      { name: `\`${p} stop\``,                  value: 'Dừng phát và rời Voice Channel' },
      { name: `\`${p} pause\` / \`${p} resume\``, value: 'Tạm dừng / tiếp tục phát' },
      { name: `\`${p} queue\` / \`${p} q\``,   value: 'Xem danh sách hàng nhạc' },
      { name: `\`${p} np\``,                    value: 'Xem bài đang phát (+ progress bar)' },
      { name: `\`${p} loop\``,                  value: 'Cycle: TẮT → Lặp bài → Lặp hàng' },
      { name: `\`${p} volume <0–200>\``,        value: 'Điều chỉnh âm lượng (mặc định 80%)' }
    );

  return message.reply({ embeds: [embed] });
}
