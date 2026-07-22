// ── Music Command Handler (Lavalink v4 backend) ────────────────────────────────
// Handles: play/p, skip/s, stop, pause, resume/r, queue/q, np, loop, volume/vol
//
// Requires lavalink.js to have been initialised (initLavalink called in bot.js).

import { EmbedBuilder } from 'discord.js';
import { memberCanUseCommand } from '../../../commandAccess.js';
import {
  getLavalinkManager,
  buildLavalinkQuery,
  sourceLabel,
  fmt,
  buildMusicControlRow,
} from '../../music/lavalink.js';

// ── Embed builder ─────────────────────────────────────────────────────────────

function trackEmbed(track, title, color, extra = {}) {
  const info = track.info;
  const durationMs = info.duration ?? info.length ?? track.duration;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(`**[${info.title}](${info.uri})**`)
    .addFields(
      { name: 'Duration',      value: info.isStream ? '🔴 Live' : fmt(durationMs), inline: true },
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

  // Lavalink not yet connected — give friendly error instead of crash
  if (!manager) {
    return message.reply('⚠️ Hệ thống nhạc chưa sẵn sàng — Lavalink đang kết nối, thử lại sau vài giây.');
  }

  const musicCommands = config.music?.commands ?? [];
  const cmd = musicCommands.find(c => {
    // Check custom name
    if (c.name === subcommand) return true;
    // Check default aliases/names
    if (c.type === 'musicplay' && (subcommand === 'play' || subcommand === 'p')) return true;
    if (c.type === 'musicskip' && (subcommand === 'skip' || subcommand === 's')) return true;
    if (c.type === 'musicstop' && subcommand === 'stop') return true;
    if (c.type === 'musicpause' && subcommand === 'pause') return true;
    if (c.type === 'musicresume' && (subcommand === 'resume' || subcommand === 'r')) return true;
    if (c.type === 'musicloop' && (subcommand === 'loop' || subcommand === 'l')) return true;
    if (c.type === 'musicqueue' && (subcommand === 'queue' || subcommand === 'q')) return true;
    if (c.type === 'musicnp' && (subcommand === 'np' || subcommand === 'nowplaying')) return true;
    if (c.type === 'musicvolume' && (subcommand === 'volume' || subcommand === 'vol')) return true;
    if (c.type === 'musicremove' && (subcommand === 'remove' || subcommand === 'rm' || subcommand === 'delete')) return true;
    return false;
  });

  if (cmd) {
    if (!cmd.enabled) {
      return message.reply('❌ Lệnh này đã bị vô hiệu hóa.');
    }
    if (!memberCanUseCommand(message.member, cmd)) {
      return message.reply('❌ Bạn không có quyền sử dụng lệnh này.');
    }
  } else {
    if (subcommand && subcommand !== 'help') {
      return message.reply(`❌ Lệnh không hợp lệ. Gõ \`${musicPrefix}\` hoặc \`${musicPrefix} help\` để xem hướng dẫn.`);
    }
  }

  // ── play / p ──────────────────────────────────────────────────────────────
  if (cmd?.type === 'musicplay') {
    const input = args.trim();
    if (!input) {
      return message.reply(
        `❌ Thiếu link hoặc tên bài nhạc.\n📌 Ví dụ: \`${musicPrefix} play tên bài\` hoặc \`${musicPrefix} play https://soundcloud.com/...\``
      );
    }

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) return message.reply('❌ Bạn cần vào một **Voice Channel** trước!');

    // Check Lavalink node is actually connected
    // manager.nodes là MiniMap (extends Map) — dùng .values() thay .filter()
    const allNodes = [...(manager.nodeManager?.nodes?.values() ?? [])];
    const hasConnected = allNodes.some(n => n.connected);
    if (!hasConnected) {
      return message.reply('⚠️ Lavalink server chưa kết nối. Đang thử lại tự động — vui lòng thử lại sau 10 giây.');
    }

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

      let res;
      let ytFallbackNeeded = false;

      try {
        res = await player.search({ query }, message.author);
        if (
          !isUrl &&
          (res.loadType === 'empty' || res.loadType === 'error' || !res.tracks?.length)
        ) {
          ytFallbackNeeded = true;
        }
      } catch (err) {
        if (!isUrl) {
          console.warn(`[music] ytsearch failed or timed out for "${searchTerm}":`, err.message || err);
          ytFallbackNeeded = true;
        } else {
          throw err;
        }
      }

      if (ytFallbackNeeded) {
        console.log(`[music] Trying SoundCloud search fallback for "${searchTerm}"...`);
        try {
          res = await player.search({ query: `scsearch:${searchTerm}` }, message.author);
        } catch (scErr) {
          console.error(`[music] scsearch also failed for "${searchTerm}":`, scErr.message || scErr);
          throw new Error('Hết thời gian tìm kiếm trên cả YouTube và SoundCloud. Vui lòng thử lại sau.');
        }
      }

      if (!res || res.loadType === 'error') {
        throw new Error(res?.exception?.message ?? 'Lavalink search error');
      }
      if (res.loadType === 'empty' || !res.tracks?.length) {
        throw new Error('Không tìm thấy bài nhạc nào.');
      }

      // Add track(s) to queue
      const wasPlaying = player.playing || player.paused;
      let addedCount = 0;

      if (res.loadType === 'playlist') {
        // lavalink-client v2: all tracks (including playlist) are on res.tracks
        const playlistTracks = res.tracks ?? res.playlist?.tracks ?? [];
        for (const track of playlistTracks) {
          player.queue.add(track);
        }
        addedCount = playlistTracks.length;
      } else {
        player.queue.add(res.tracks[0]);
        addedCount = 1;
      }

      // Start playback if not already running
      if (!wasPlaying) await player.play();

      const firstTrack = res.loadType === 'playlist'
        ? (res.tracks ?? res.playlist?.tracks ?? [])[0]
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
        embed.addFields({ name: 'Playlist', value: res.playlist?.name ?? res.playlistInfo?.name ?? 'Unknown', inline: false });
      }

      const components = [buildMusicControlRow(player)];
      return loadingMsg
        ? loadingMsg.edit({ content: '', embeds: [embed], components })
        : message.reply({ embeds: [embed], components });

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
  if (cmd?.type === 'musicskip') {
    if (!player?.playing) return message.reply('❌ Không có bài nhạc nào đang phát!');
    await player.skip();
    return message.reply('⏭️ Đã bỏ qua bài hiện tại.');
  }

  // ── stop ──────────────────────────────────────────────────────────────────
  if (cmd?.type === 'musicstop') {
    if (!player) return message.reply('❌ Bot đang không phát nhạc!');
    await player.destroy();
    return message.reply('⏹️ Đã dừng phát nhạc và rời Voice Channel.');
  }

  // ── pause ─────────────────────────────────────────────────────────────────
  if (cmd?.type === 'musicpause') {
    if (!player)          return message.reply('❌ Không có bài nhạc nào đang phát!');
    if (player.paused)    return message.reply('⏸️ Đã tạm dừng rồi.');
    if (typeof player.pause === 'function') {
      await player.pause();
    } else {
      await player.pause(true);
    }
    return message.reply('⏸️ Đã tạm dừng.');
  }

  // ── resume / r ────────────────────────────────────────────────────────────
  if (cmd?.type === 'musicresume') {
    if (!player)          return message.reply('❌ Không có hàng nhạc nào!');
    if (!player.paused)   return message.reply('▶️ Đang phát rồi!');
    if (typeof player.resume === 'function') {
      await player.resume();
    } else {
      await player.pause(false);
    }
    return message.reply('▶️ Đã tiếp tục phát.');
  }

  // ── loop / l ──────────────────────────────────────────────────────────────
  if (cmd?.type === 'musicloop') {
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
  if (cmd?.type === 'musicqueue') {
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
  if (cmd?.type === 'musicnp') {
    const current = player?.queue?.current;
    if (!current) return message.reply('❌ Không có bài nhạc nào đang phát!');

    const info     = current.info;
    const pos      = player.position ?? 0;
    const len      = info.duration ?? info.length ?? current.duration ?? 0;
    const barLen   = 20;
    const filled   = len > 0 ? Math.round((pos / len) * barLen) : 0;
    const bar      = '█'.repeat(filled) + '░'.repeat(barLen - filled);
    const progress = `\`${fmt(pos)} ${bar} ${fmt(len)}\``;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎵 Now Playing')
      .setDescription(`**[${info.title}](${info.uri})**\n${progress}`)
      .addFields(
        { name: 'Duration',     value: info.isStream ? '🔴 Live' : fmt(len), inline: true },
        { name: 'Source',       value: sourceLabel(current), inline: true },
        { name: 'Requested by', value: `<@${current.requester?.id ?? '?'}>`, inline: true }
      );
    if (info.artworkUrl) embed.setThumbnail(info.artworkUrl);

    return message.reply({ embeds: [embed], components: [buildMusicControlRow(player)] });
  }

  // ── volume / vol ──────────────────────────────────────────────────────────
  if (cmd?.type === 'musicvolume') {
    const vol = parseInt(args, 10);
    if (isNaN(vol) || vol < 0 || vol > 200) return message.reply('❌ Volume phải từ **0–200**');
    if (!player) return message.reply('❌ Không có hàng nhạc nào!');
    await player.setVolume(vol);
    return message.reply(`🔊 Volume: **${vol}%**`);
  }

  // ── remove ────────────────────────────────────────────────────────────────
  if (cmd?.type === 'musicremove') {
    if (!player) return message.reply('❌ Không có hàng nhạc nào!');
    const upcoming = player.queue.tracks ?? [];
    if (!upcoming.length) return message.reply('📭 Hàng chờ hiện tại đang trống!');

    const indexStr = args.trim();
    if (!indexStr) {
      return message.reply(`❌ Vui lòng cung cấp số thứ tự bài hát cần xóa.\n📌 Ví dụ: \`${musicPrefix} remove 3\``);
    }

    const index = parseInt(indexStr, 10);
    if (isNaN(index) || index < 1 || index > upcoming.length) {
      return message.reply(`❌ Số thứ tự không hợp lệ. Vui lòng nhập từ **1** đến **${upcoming.length}**.`);
    }

    const removedTrack = upcoming[index - 1];
    await player.queue.remove(index - 1);

    return message.reply(`🗑️ Đã xóa bài **${removedTrack.info.title}** khỏi hàng chờ.`);
  }

  // ── help (fallback) ───────────────────────────────────────────────────────
  const playCmd   = musicCommands.find(c => c.type === 'musicplay');
  const skipCmd   = musicCommands.find(c => c.type === 'musicskip');
  const stopCmd   = musicCommands.find(c => c.type === 'musicstop');
  const pauseCmd  = musicCommands.find(c => c.type === 'musicpause');
  const resumeCmd = musicCommands.find(c => c.type === 'musicresume');
  const loopCmd   = musicCommands.find(c => c.type === 'musicloop');
  const queueCmd  = musicCommands.find(c => c.type === 'musicqueue');
  const npCmd     = musicCommands.find(c => c.type === 'musicnp');
  const volumeCmd = musicCommands.find(c => c.type === 'musicvolume');
  const removeCmd = musicCommands.find(c => c.type === 'musicremove');

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
      { name: `\`${p} ${playCmd?.name || 'play'} <link hoặc tên>\``, value: playCmd?.description || 'Phát nhạc — YT / SC / Spotify / URL' },
      { name: `\`${p} ${skipCmd?.name || 'skip'}\` / \`${p} s\``,    value: skipCmd?.description || 'Bỏ qua bài hiện tại' },
      { name: `\`${p} ${stopCmd?.name || 'stop'}\``,                  value: stopCmd?.description || 'Dừng phát và rời Voice Channel' },
      { name: `\`${p} ${pauseCmd?.name || 'pause'}\` / \`${p} ${resumeCmd?.name || 'resume'}\``, value: 'Tạm dừng / tiếp tục phát' },
      { name: `\`${p} ${queueCmd?.name || 'queue'}\` / \`${p} q\``,   value: queueCmd?.description || 'Xem danh sách hàng nhạc' },
      { name: `\`${p} ${npCmd?.name || 'np'}\``,                    value: npCmd?.description || 'Xem bài đang phát (+ progress bar)' },
      { name: `\`${p} ${loopCmd?.name || 'loop'}\``,                  value: loopCmd?.description || 'Cycle: TẮT → Lặp bài → Lặp hàng' },
      { name: `\`${p} ${volumeCmd?.name || 'volume'} <0–200>\``,        value: volumeCmd?.description || 'Điều chỉnh âm lượng (mặc định 80%)' },
      { name: `\`${p} ${removeCmd?.name || 'remove'} <số thứ tự>\``,   value: removeCmd?.description || 'Xóa bài hát khỏi hàng chờ bằng số thứ tự' }
    );

  return message.reply({ embeds: [embed] });
}
