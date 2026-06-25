import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import {
  handleLsd, handleLolProfile, handleLolMatch, handleLolChamp, handleLolItem, handleLolRunes,
  handleLolPatch, handleLolLink, handleLolUnlink
} from '../../../lolCommands.js';
import {
  handleTftLsd, handleTftProfile, handleTftMatch, handleTftLink, handleTftUnlink
} from '../../../tftCommands.js';

const LOL_CMDS = new Set(['lsd', 'lolprofile', 'lolmatch', 'lolchamp', 'lolitem', 'lolrunes', 'lolpatch', 'lollink', 'lolunlink', 'lolquiz']);
const TFT_CMDS = new Set(['tftlsd', 'tftprofile', 'tftmatch', 'tftlink', 'tftunlink']);

/** @returns {Promise<unknown>|undefined} */
export async function handleRiot(ctx) {
  const {
    client, config, command, source, args, isInteraction, guild,
    reply
  } = ctx;

  if (!LOL_CMDS.has(command.type) && !TFT_CMDS.has(command.type)) return;

  const ss = client.stateStore;

  // ── League of Legends commands ──────────────────────────────────────────────
  if (LOL_CMDS.has(command.type)) {
    const lolArgs = isInteraction ? '' : args;
    const lolCtx = { source, args: lolArgs, isInteraction, stateStore: ss, guildId: guild.id, config, reply };
    if (command.type === 'lsd')        return handleLsd(lolCtx);
    if (command.type === 'lolprofile') return handleLolProfile(lolCtx);
    if (command.type === 'lolmatch')   return handleLolMatch(lolCtx);
    if (command.type === 'lolchamp')   return handleLolChamp({ ...lolCtx });
    if (command.type === 'lolitem')    return handleLolItem({ ...lolCtx });
    if (command.type === 'lolrunes')   return handleLolRunes({ ...lolCtx });
    if (command.type === 'lolpatch')   return handleLolPatch({ ...lolCtx });
    if (command.type === 'lollink')    return handleLolLink(lolCtx);
    if (command.type === 'lolunlink')  return handleLolUnlink({ source, isInteraction, stateStore: ss, guildId: guild.id, reply });
    
    if (command.type === 'lolquiz') {
      const userId = ctx.user.id;
      const embed = new EmbedBuilder()
        .setTitle('🎮 LoL Quiz — Chọn Chế Độ Chơi')
        .setDescription(
          `Chào mừng bạn đến với minigame đoán tướng Liên Minh Huyền Thoại! Hãy chọn một chế độ chơi ở menu thả xuống dưới đây để bắt đầu:\n\n` +
          `• **Classic (Thuộc tính)**: Đoán tướng dựa trên so sánh thuộc tính (giới tính, chủng tộc, vị trí, tài nguyên, tầm đánh, vùng đất, năm ra mắt).\n` +
          `• **Ability (Kỹ năng)**: Đoán tên tướng qua hình ảnh chiêu thức/nội tại.\n` +
          `• **Emoji (Biểu tượng)**: Đoán tướng qua bộ 3 emoji đặc trưng gợi ý.\n` +
          `• **Connections (Ghép nhóm)**: Chọn 4 tướng có chung thuộc tính liên kết trong 16 tướng.\n` +
          `• **Build Guesser (Lối chơi)**: Đoán tướng dựa vào ngọc chính, thứ tự max chiêu và trang bị.\n` +
          `• **Daily Challenge (Mô tả)**: Thử thách đặc biệt hàng ngày, đoán tướng qua mô tả chiêu thức đã ẩn tên (cộng điểm tích lũy).\n` +
          `• **Leaderboard**: Xem bảng xếp hạng điểm thưởng tích lũy Daily Quiz của máy chủ.`
        )
        .setColor(0xc89b3c)
        .setFooter({ text: '👤 Menu chọn chỉ khả dụng với người gọi lệnh.' });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`quiz:select_menu:${userId}`)
        .setPlaceholder('👉 Chọn chế độ chơi tại đây...')
        .addOptions([
          {
            label: '🎯 Classic (Thuộc tính)',
            description: 'Đoán tướng dựa trên so sánh giới tính, vị trí, chủng tộc...',
            value: 'classic'
          },
          {
            label: '🔮 Ability Icon (Kỹ năng)',
            description: 'Đoán tên tướng qua hình ảnh chiêu thức / nội tại',
            value: 'ability'
          },
          {
            label: '😎 Emoji (Biểu tượng)',
            description: 'Đoán tướng qua bộ 3 emoji đặc trưng gợi ý',
            value: 'emoji'
          },
          {
            label: '🧩 Connections (Ghép nhóm)',
            description: 'Chọn các bộ 4 tướng có liên kết chung trong 16 tướng',
            value: 'connections'
          },
          {
            label: '🛡️ Build Guesser (Lối chơi)',
            description: 'Đoán tướng dựa vào ngọc chính, thứ tự max chiêu và trang bị',
            value: 'build_guesser'
          },
          {
            label: '🔮 Daily Challenge (Mô tả)',
            description: 'Thử thách hàng ngày: Đoán tướng qua mô tả chiêu thức đã ẩn tên',
            value: 'daily'
          },
          {
            label: '🏆 Leaderboard (Bảng xếp hạng)',
            description: 'Xem top 10 người chơi có điểm tích lũy daily cao nhất',
            value: 'leaderboard'
          }
        ]);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await reply(isInteraction ? { embeds: [embed], components: [row], fetchReply: true } : { embeds: [embed], components: [row] });
      return true;
    }
  }

  // ── Teamfight Tactics commands ───────────────────────────────────────────────
  if (TFT_CMDS.has(command.type)) {
    const tftArgs = isInteraction ? '' : args;
    const tftCtx = { source, args: tftArgs, isInteraction, stateStore: ss, guildId: guild.id, config, reply };
    if (command.type === 'tftlsd')     return handleTftLsd(tftCtx);
    if (command.type === 'tftprofile') return handleTftProfile(tftCtx);
    if (command.type === 'tftmatch')   return handleTftMatch(tftCtx);
    if (command.type === 'tftlink')    return handleTftLink(tftCtx);
    if (command.type === 'tftunlink')  return handleTftUnlink({ source, isInteraction, stateStore: ss, guildId: guild.id, reply });
  }
}
