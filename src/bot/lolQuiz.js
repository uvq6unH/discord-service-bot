import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, AttachmentBuilder } from 'discord.js';
import { getRandomCandidate, getCandidateAbilities, getEmojiClues, compareAttributes, getQuizCandidates } from './lolQuizData.js';
import { findChampion, getChampionDetail, getItemData, getRuneData, getLatestPatch } from '../lolApi.js';
import { Jimp } from 'jimp';
import path from 'node:path';
import fs from 'node:fs';

// Map to hold active quiz sessions in memory.
// Keyed by channelId:userId.
export const activeQuizSessions = new Map();

/** Helper to build session key */
function sKey(channelId, userId) {
  return `${channelId}:${userId}`;
}

async function sendOrUpdateQuizMessage(interaction, session, payload) {
  try {
    await interaction.deferUpdate().catch(() => null);
    if (interaction.message) {
      await interaction.message.delete().catch(() => null);
    } else if (session.messageId) {
      const channel = interaction.channel || await interaction.client.channels.fetch(interaction.channelId).catch(() => null);
      if (channel) {
        const oldMsg = await channel.messages.fetch(session.messageId).catch(() => null);
        if (oldMsg) {
          await oldMsg.delete().catch(() => null);
        }
      }
    }
    const newMsg = await interaction.channel.send(payload);
    session.messageId = newMsg.id;
  } catch (err) {
    console.error('[lolQuiz] Failed to resend quiz message:', err);
  }
}

/**
 * Generates a grid image containing champion avatars for the Connections game.
 */
export async function generateGridImage(champions, channelId) {
  const count = champions.length;
  if (count === 0) return null;

  const cols = 4;
  const rows = Math.ceil(count / cols);
  const iconSize = 80;
  const padding = 10;
  
  const width = cols * iconSize + (cols + 1) * padding;
  const height = rows * iconSize + (rows + 1) * padding;

  const gridImage = new Jimp({ width, height, color: 0x1e1e24ff });

  const promises = champions.map(async (champ, idx) => {
    try {
      const img = await Jimp.read(champ.iconUrl);
      img.resize({ w: iconSize, h: iconSize });

      const colIdx = idx % cols;
      const rowIdx = Math.floor(idx / cols);

      const x = padding + colIdx * (iconSize + padding);
      const y = padding + rowIdx * (iconSize + padding);

      gridImage.composite(img, x, y);
    } catch (err) {
      console.error(`[lolQuiz] Failed to load icon for Connections grid: ${champ.name}`, err.message);
    }
  });

  await Promise.all(promises);

  const tempDir = path.join(process.cwd(), 'data', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const outPath = path.join(tempDir, `connections_${channelId}.png`);
  await gridImage.write(outPath);
  return outPath;
}

/**
 * Finds DDragon item icon URL from Vietnamese item name
 */
async function getItemIconUrl(nameString) {
  try {
    const engNameMatch = nameString.match(/\(([^)]+)\)/);
    const engName = engNameMatch ? engNameMatch[1].trim() : nameString.trim();
    
    const itemData = await getItemData('en_US');
    if (!itemData || !itemData.data) return null;
    
    const foundEntry = Object.entries(itemData.data).find(([id, item]) => 
      item.name.toLowerCase() === engName.toLowerCase()
    );
    
    if (foundEntry) {
      const itemId = foundEntry[0];
      const patch = await getLatestPatch();
      return `https://ddragon.leagueoflegends.com/cdn/${patch}/img/item/${itemId}.png`;
    }
    return null;
  } catch (err) {
    console.error(`[lolQuiz] Failed to find item icon for: ${nameString}`, err.message);
    return null;
  }
}

/**
 * Finds DDragon rune icon URL from Vietnamese rune name
 */
async function getRuneIconUrl(runeString) {
  try {
    const viName = runeString.split('(')[0].trim();
    const runeData = await getRuneData('vi_VN');
    if (!runeData || !Array.isArray(runeData)) return null;
    
    for (const path of runeData) {
      if (!path.slots) continue;
      for (const slot of path.slots) {
        if (!slot.runes) continue;
        const foundRune = slot.runes.find(r => r.name.toLowerCase() === viName.toLowerCase());
        if (foundRune) {
          return `https://ddragon.leagueoflegends.com/cdn/img/${foundRune.icon}`;
        }
      }
    }
    return null;
  } catch (err) {
    console.error(`[lolQuiz] Failed to find rune icon for: ${runeString}`, err.message);
    return null;
  }
}

/**
 * Generates a banner image combining Rune icon and Core Item icons
 */
export async function generateBuildBanner(runeString, coreItems, channelId) {
  try {
    const runeUrl = await getRuneIconUrl(runeString);
    const itemUrls = await Promise.all(coreItems.map(item => getItemIconUrl(item)));
    
    const urls = [runeUrl, ...itemUrls].filter(Boolean);
    if (urls.length === 0) return null;
    
    const iconSize = 64;
    const padding = 10;
    const width = padding + (iconSize + padding) * urls.length;
    const height = padding + iconSize + padding;
    
    const banner = new Jimp({ width, height, color: 0x1e1e24ff });
    
    const promises = urls.map(async (url, idx) => {
      try {
        const img = await Jimp.read(url);
        img.resize({ w: iconSize, h: iconSize });
        const x = padding + idx * (iconSize + padding);
        const y = padding;
        banner.composite(img, x, y);
      } catch (err) {
        console.error(`[lolQuiz] Failed to load build image: ${url}`, err.message);
      }
    });
    
    await Promise.all(promises);
    
    const tempDir = path.join(process.cwd(), 'data', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const outPath = path.join(tempDir, `build_${channelId}.png`);
    await banner.write(outPath);
    return outPath;
  } catch (err) {
    console.error('[lolQuiz] Failed to generate build banner:', err);
    return null;
  }
}

/**
 * Starts a new quiz session in a channel
 */
export async function startQuiz(ctx, mode, options = {}) {
  const channelId = ctx.channel.id;
  const guildId = ctx.guild.id;
  const userId = ctx.user.id;

  // Check if this user already has a session in this channel
  if (activeQuizSessions.has(sKey(channelId, userId))) {
    const existing = activeQuizSessions.get(sKey(channelId, userId));
    return ctx.reply({
      content: `⚠️ Bạn đang có một quiz **${existing.mode.toUpperCase()}** đang diễn ra! Hãy hoàn thành hoặc bấm nút **Bỏ cuộc** trước khi bắt đầu quiz mới.`,
      ephemeral: true
    });
  }

  const isDaily = !!options.isDaily;
  const vnOffset = 7 * 60 * 60 * 1000; // Vietnam offset (+7h)
  const dayKey = Math.floor((Date.now() + vnOffset) / 86400000);

  if (isDaily) {
    const stateStore = ctx.client.stateStore;
    const played = await stateStore.hasPlayedDailyQuiz(userId, mode, dayKey);
    if (played) {
      const nextVnReset = (Math.floor((Date.now() + vnOffset) / 86400000) + 1) * 86400000 - vnOffset;
      const diffMs = nextVnReset - Date.now();
      const diffHrs = Math.floor(diffMs / 3600000);
      const diffMins = Math.floor((diffMs % 3600000) / 60000);
      return ctx.reply({
        content: `⚠️ Bạn đã tham gia thử thách Daily Quiz ngày hôm nay rồi! Vui lòng quay lại sau **${diffHrs} giờ ${diffMins} phút** nhé.`,
        ephemeral: true
      });
    }
  }

  let target = null;
  const candidates = await getQuizCandidates();
  if (!candidates.length) {
    return ctx.reply({ content: '❌ Không thể tải dữ liệu tướng từ Riot API / CDragon. Vui lòng thử lại sau!', ephemeral: true });
  }

  if (isDaily) {
    // Select target champion deterministically for the daily challenge
    target = candidates[dayKey % candidates.length];
  } else {
    // Select target champion randomly
    target = candidates[Math.floor(Math.random() * candidates.length)];
  }

  const session = {
    guildId,
    channelId,
    creatorId: userId,
    mode,
    target,
    guesses: [],
    maxGuesses: mode === 'classic' ? 8 : 5,
    createdAt: Date.now(),
    status: 'active',
    isDaily,
    dayKey,
    hintCount: 0,
    revealedAttributes: new Set(['gender', 'region', 'range']) // Start with gender, region, range revealed in Classic
  };

  // Pre-load mode specific data
  if (mode === 'ability') {
    const abilities = await getCandidateAbilities(target.alias);
    if (!abilities.length) {
      return ctx.reply({ content: '❌ Lỗi khi tải kỹ năng của tướng. Vui lòng thử lại!', ephemeral: true });
    }
    // Pick a random ability as the core clue
    session.abilities = abilities;
    session.abilityIndex = Math.floor(Math.random() * abilities.length);
  } else if (mode === 'emoji') {
    session.emojiClues = getEmojiClues(target.alias);
  } else if (mode === 'connections') {
    const { generateConnectionsGame, CONNECTIONS_CATEGORIES } = await import('./lolQuizCustomData.js');
    const selectedCats = generateConnectionsGame(CONNECTIONS_CATEGORIES);
    const candidatesList = await getQuizCandidates();
    
    const gameChamps = [];
    selectedCats.forEach((cat, catIdx) => {
      cat.champions.forEach(champName => {
        const cand = candidatesList.find(c => 
          c.name.toLowerCase() === champName.toLowerCase() || 
          c.alias.toLowerCase() === champName.toLowerCase().replace(/[\s'.&]/g, '')
        );
        gameChamps.push({
          id: cand ? cand.alias : champName,
          name: cand ? cand.name : champName,
          iconUrl: cand ? cand.iconUrl : `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/characters/${champName.toLowerCase()}/hud/passive.png`,
          categoryIdx: catIdx
        });
      });
    });

    const shuffledChamps = [...gameChamps].sort(() => 0.5 - Math.random());
    const gridPath = await generateGridImage(shuffledChamps, channelId + '_' + userId);

    session.connectionsGame = {
      categories: selectedCats.map((c, idx) => ({ name: c.name, difficulty: c.difficulty, idx, champions: c.champions })),
      champions: gameChamps,
      shuffledChamps,
      completedGroups: [],
      selectedIds: [],
      lives: 4,
      gridPath
    };
    session.maxGuesses = 4;
  } else if (mode === 'build_guesser') {
    const { BUILD_PRESETS } = await import('./lolQuizCustomData.js');
    const preset = BUILD_PRESETS[Math.floor(Math.random() * BUILD_PRESETS.length)];
    
    const bannerPath = await generateBuildBanner(preset.rune, preset.coreItems, channelId + '_' + userId);
    
    session.buildGame = {
      preset,
      guesses: [],
      hintLevel: 0,
      lives: 5,
      bannerPath
    };
    session.maxGuesses = 5;
  } else if (mode === 'daily_description') {
    // Ability Text Description mode for Daily Quiz
    const detail = await getChampionDetail(target.alias, 'vi_VN').catch(() => null);
    if (!detail) {
      return ctx.reply({ content: '❌ Lỗi khi tải chi tiết tướng cho thử thách Daily. Vui lòng thử lại!', ephemeral: true });
    }
    const abilitiesList = [];
    if (detail.passive) {
      abilitiesList.push({ name: detail.passive.name || 'Nội tại', desc: detail.passive.description || '', type: 'Nội tại' });
    }
    if (detail.spells && detail.spells.length) {
      const keys = ['Q', 'W', 'E', 'R'];
      detail.spells.forEach((s, idx) => {
        abilitiesList.push({ name: s.name || 'Kỹ năng', desc: s.description || '', type: keys[idx] || 'Kỹ năng' });
      });
    }

    if (!abilitiesList.length) {
      return ctx.reply({ content: '❌ Tướng Daily không có chiêu thức để mô tả.', ephemeral: true });
    }

    // Pick deterministic ability based on dayKey
    const ability = abilitiesList[dayKey % abilitiesList.length];
    let desc = (ability.desc || '').replace(/<[^>]+>/g, ''); // strip HTML tags
    
    // Redact champion name, alias, and spell name case-insensitively
    const nameRegex = new RegExp(target.name, 'gi');
    const aliasRegex = new RegExp(target.alias, 'gi');
    const spellNameRegex = new RegExp(ability.name, 'gi');

    desc = desc.replace(nameRegex, '`[TÊN TƯỚNG ĐÃ ẨN]`')
               .replace(aliasRegex, '`[TÊN TƯỚNG ĐÃ ẨN]`')
               .replace(spellNameRegex, '`[TÊN CHIÊU THỨC ĐÃ ẨN]`');

    session.abilityDescription = desc;
    session.abilityType = ability.type;
  }

  activeQuizSessions.set(sKey(channelId, userId), session);

  // Build and send initial message
  const replyPayload = buildQuizEmbed(session);
  const msg = await ctx.reply(replyPayload);

  // Save the message ID in the session for updates
  session.messageId = msg.id;

  // Set automatic expiry after 5 minutes of inactivity
  scheduleExpiry(sKey(channelId, userId));
}

/**
 * Handles Button clicks (Bỏ cuộc / Gợi ý / Bắt đầu Đoán)
 */
export async function handleQuizButton(interaction) {
  const customId = interaction.customId;

  if (customId.startsWith('quiz:select_')) {
    const parts = customId.split(':');
    const mode = parts[1].replace('select_', ''); // 'classic', 'ability', 'emoji', 'daily', 'leaderboard', 'menu'
    const creatorId = parts[2];

    if (interaction.user.id !== creatorId) {
      return interaction.reply({
        content: '❌ Chỉ người sử dụng lệnh ban đầu mới có thể lựa chọn chế độ chơi!',
        ephemeral: true
      });
    }

    let selectedMode = mode;
    if (mode === 'menu') {
      selectedMode = interaction.values[0];
    }

    if (selectedMode === 'leaderboard') {
      const mockCtx = {
        client: interaction.client,
        guild: interaction.guild,
        user: interaction.user,
        isInteraction: true,
        reply: async (payload) => {
          if (payload.embeds) {
            await interaction.deferUpdate().catch(() => null);
            if (interaction.message) {
              await interaction.message.delete().catch(() => null);
            }
            await interaction.channel.send({ embeds: payload.embeds, components: [] });
          } else {
            const content = typeof payload === 'string' ? payload : (payload.content || 'Error');
            await interaction.reply({ content, ephemeral: true });
          }
        }
      };
      return showLeaderboard(mockCtx);
    }

    const isDaily = selectedMode === 'daily';
    const actualMode = isDaily ? 'daily_description' : selectedMode;

    const mockCtx = {
      client: interaction.client,
      guild: interaction.guild,
      user: interaction.user,
      channel: interaction.channel,
      isInteraction: true,
      reply: async (payload) => {
        if (payload.embeds) {
          const updatePayload = { embeds: payload.embeds, components: payload.components };
          if (payload.files) {
            updatePayload.files = payload.files;
          }
          await interaction.deferUpdate().catch(() => null);
          if (interaction.message) {
            await interaction.message.delete().catch(() => null);
          }
          const newMsg = await interaction.channel.send(updatePayload);
          return newMsg;
        } else {
          const content = typeof payload === 'string' ? payload : (payload.content || 'Error');
          await interaction.reply({ content, ephemeral: payload.ephemeral ?? true });
          return { id: 'error' };
        }
      }
    };

    return startQuiz(mockCtx, actualMode, { isDaily });
  }

  const channelId = interaction.channelId;

  // Extract creatorId from the last segment of customId (all quiz buttons now embed it)
  const idParts = customId.split(':');
  const creatorId = idParts[idParts.length - 1];
  const sessionKeyStr = sKey(channelId, creatorId);
  const session = activeQuizSessions.get(sessionKeyStr);

  if (!session) {
    return interaction.reply({
      content: '❌ Trận đấu quiz này đã kết thúc hoặc hết hạn.',
      ephemeral: true
    });
  }

  // Access control: only the quiz creator can interact
  if (interaction.user.id !== creatorId) {
    return interaction.reply({
      content: '❌ Đây không phải quiz của bạn! Hãy bắt đầu quiz riêng bằng lệnh `/lolquiz`.',
      ephemeral: true
    });
  }

  // Handle Connections selection toggle (button grid click)
  if (customId.startsWith('quiz:connections_toggle:')) {
    const toggleParts = customId.split(':');
    const champId = toggleParts[2];
    // creatorId is already extracted and verified above

    const game = session.connectionsGame;
    const selectedIds = game.selectedIds || [];
    const idx = selectedIds.indexOf(champId);

    if (idx !== -1) {
      // Unselect
      selectedIds.splice(idx, 1);
    } else {
      // Select (limit to 4)
      if (selectedIds.length >= 4) {
        return interaction.reply({
          content: '⚠️ Bạn chỉ được chọn tối đa 4 tướng!',
          ephemeral: true
        });
      }
      selectedIds.push(champId);
    }
    game.selectedIds = selectedIds;
    resetExpiry(sessionKeyStr);
    
    const payload = buildQuizEmbed(session);
    await sendOrUpdateQuizMessage(interaction, session, payload);
    return;
  }

  // Handle Connections clear selection
  if (customId.startsWith('quiz:connections_clear:')) {
    const game = session.connectionsGame;
    game.selectedIds = [];
    resetExpiry(sessionKeyStr);
    
    const payload = buildQuizEmbed(session);
    await sendOrUpdateQuizMessage(interaction, session, payload);
    return;
  }

  // Handle Connections submit check
  if (customId.startsWith('quiz:connections_submit:')) {
    const game = session.connectionsGame;
    const selectedIds = game.selectedIds || [];
    
    if (selectedIds.length !== 4) {
      return interaction.reply({ content: '❌ Bạn phải chọn chính xác 4 tướng trước khi gửi!', ephemeral: true });
    }

    // Find categoryIdx for each select item
    const categoriesMatched = selectedIds.map(id => {
      const champ = game.champions.find(c => c.id === id);
      return champ ? champ.categoryIdx : null;
    });

    if (categoriesMatched.includes(null)) {
      return interaction.reply({ content: '❌ Lựa chọn tướng không hợp lệ.', ephemeral: true });
    }

    const firstIdx = categoriesMatched[0];
    const isCorrect = categoriesMatched.every(idx => idx === firstIdx);

    if (isCorrect) {
      if (game.completedGroups.includes(firstIdx)) {
        return interaction.reply({ content: '⚠️ Bạn đã tìm thấy nhóm này trước đó rồi!', ephemeral: true });
      }

      game.completedGroups.push(firstIdx);
      // Remove from current grid
      game.shuffledChamps = game.shuffledChamps.filter(c => !selectedIds.includes(c.id));
      game.selectedIds = []; // clear selection
      
      // Regenerate the grid image with the remaining champions
      if (game.shuffledChamps.length > 0) {
        game.gridPath = await generateGridImage(game.shuffledChamps, channelId + '_' + session.creatorId);
      } else {
        game.gridPath = null;
      }
      
      if (game.completedGroups.length === 4) {
        session.status = 'won';
        activeQuizSessions.delete(sessionKeyStr);
      }
      resetExpiry(sessionKeyStr);

      const payload = buildQuizEmbed(session);
      await sendOrUpdateQuizMessage(interaction, session, payload);
      
      const cat = game.categories.find(c => c.idx === firstIdx);
      const diffIcon = cat.difficulty === 'easy' ? '🟩' : (cat.difficulty === 'medium' ? '🟦' : (cat.difficulty === 'hard' ? '🟪' : '🟨'));
      await interaction.followUp({
        content: `🎉 Chính xác! **${cat.name}:** ${cat.champions.join(', ')}`,
        ephemeral: true
      });
    } else {
      game.lives -= 1;
      
      const counts = {};
      categoriesMatched.forEach(idx => { counts[idx] = (counts[idx] || 0) + 1; });
      const isOneAway = Object.values(counts).some(cnt => cnt === 3);
      let oneAwayMsg = '';
      if (isOneAway) {
        oneAwayMsg = '\n⚠️ **Một tướng nữa thôi là đúng nhóm! (One away)**';
      }

      if (game.lives <= 0) {
        session.status = 'lost';
        activeQuizSessions.delete(sessionKeyStr);
      }
      resetExpiry(sessionKeyStr);

      const payload = buildQuizEmbed(session);
      await sendOrUpdateQuizMessage(interaction, session, payload);
      
      if (session.status !== 'lost') {
        await interaction.followUp({
          content: `❌ Lựa chọn chưa chính xác! Bạn còn ${game.lives} mạng sống.${oneAwayMsg}`,
          ephemeral: true
        });
      } else {
        await interaction.followUp({
          content: `💀 Bạn đã thua cuộc! Xem đáp án chi tiết phía trên.`,
          ephemeral: true
        });
      }
    }
    return;
  }

  // Handle Build Guesser guess
  if (customId.startsWith('quiz:build_guess:')) {
    const bgParts = customId.split(':');
    const champName = bgParts[2];

    const game = session.buildGame;
    const isCorrect = champName.toLowerCase() === game.preset.champion.toLowerCase();

    if (isCorrect) {
      session.status = 'won';
      activeQuizSessions.delete(sessionKeyStr);
    } else {
      game.guesses.push(champName);
      game.lives -= 1;
      if (game.lives <= 0) {
        session.status = 'lost';
        activeQuizSessions.delete(sessionKeyStr);
      } else {
        game.hintLevel += 1;
      }
    }
    resetExpiry(sessionKeyStr);

    const payload = buildQuizEmbed(session);
    await sendOrUpdateQuizMessage(interaction, session, payload);

    if (!isCorrect && session.status !== 'lost') {
      const nextHint = game.preset.hints[game.hintLevel - 1];
      await interaction.followUp({
        content: `❌ Đoán sai! Bạn còn ${game.lives} lượt đoán.\n💡 **Gợi ý lối chơi mới:** ${nextHint}`,
        ephemeral: true
      });
    }
    return;
  }

  if (customId.startsWith('quiz:forfeit:')) {
    session.status = 'lost';
    activeQuizSessions.delete(sessionKeyStr);

    if (session.isDaily) {
      try {
        await interaction.client.stateStore.setPlayedDailyQuiz(session.creatorId, session.mode, session.dayKey);
      } catch (err) {
        console.error('[lolQuiz] Failed to set daily played status on forfeit:', err);
      }
    }

    const payload = buildQuizEmbed(session);
    await sendOrUpdateQuizMessage(interaction, session, payload);

    let answerMsg = '';
    if (session.mode === 'connections') {
      answerMsg = 'đã được hiển thị ở bảng trên';
    } else if (session.mode === 'build_guesser') {
      answerMsg = `là **${session.buildGame.preset.champion}**`;
    } else {
      answerMsg = `là **${session.target.name}**`;
    }
    await interaction.followUp({ content: `🏳️ Bạn đã bỏ cuộc! Đáp án đúng ${answerMsg}.` });
    return;
  } else if (customId.startsWith('quiz:hint:')) {
    if (session.mode === 'classic') {
      const revealed = session.revealedAttributes || new Set(['gender', 'region', 'range']);
      const allAttribs = ['resource', 'species', 'releaseYear', 'position'];
      const hidden = allAttribs.filter(a => !revealed.has(a));

      let attributeRevealMsg = '';
      if (hidden.length > 0) {
        // Reveal a random hidden attribute
        const toReveal = hidden[Math.floor(Math.random() * hidden.length)];
        revealed.add(toReveal);
        session.revealedAttributes = revealed;

        // Update the embed in-place to reveal the new attribute
        const payload = buildQuizEmbed(session);
        await sendOrUpdateQuizMessage(interaction, session, payload);

        const nameMap = {
          resource: 'Tài nguyên',
          species: 'Chủng tộc',
          releaseYear: 'Năm ra mắt',
          position: 'Đường đi'
        };
        attributeRevealMsg = `• Đã mở thêm gợi ý thuộc tính: **${nameMap[toReveal]}**\n`;
      }

      if (attributeRevealMsg) {
        // Fetch and show the progressive text hint in followUp
        const textHint = await getQuizHint(session);
        await interaction.followUp({
          content: `💡 **Gợi ý mới:**\n${attributeRevealMsg}${textHint}`,
          ephemeral: true
        });
      } else {
        // All columns revealed, show text hints only
        await interaction.deferReply({ ephemeral: true });
        const textHint = await getQuizHint(session);
        await interaction.editReply({
          content: `💡 **Gợi ý mới:**\n• *Toàn bộ cột thuộc tính đã được hiển thị.*\n${textHint}`
        });
      }
    } else {
      await interaction.deferReply({ ephemeral: true });
      const hintMessage = await getQuizHint(session);
      await interaction.editReply({ content: hintMessage });
    }
  } else if (customId.startsWith('quiz:guess_button:')) {
    // Show Modal for text input guessing
    const modal = new ModalBuilder()
      .setCustomId(`quiz:guess_modal:${session.creatorId}`)
      .setTitle('Đoán Tướng Liên Minh');

    const guessInput = new TextInputBuilder()
      .setCustomId('guess_input')
      .setLabel('Tên tướng (ví dụ: Ahri, Yasuo, Lee Sin...)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Gõ tên tướng League of Legends tại đây...')
      .setRequired(true);

    const firstActionRow = new ActionRowBuilder().addComponents(guessInput);
    modal.addComponents(firstActionRow);

    await interaction.showModal(modal);
  }
}

/**
 * Handle a guess submitted via Modal
 */
export async function handleQuizModalSubmit(interaction) {
  const channelId = interaction.channelId;
  // Extract creatorId from modal customId: quiz:guess_modal:{creatorId}
  const modalParts = interaction.customId.split(':');
  const creatorId = modalParts[2];
  const sessionKeyStr = sKey(channelId, creatorId || interaction.user.id);
  const session = activeQuizSessions.get(sessionKeyStr);

  if (!session) {
    return interaction.reply({
      content: '❌ Trận đấu quiz này đã kết thúc hoặc hết hạn.',
      ephemeral: true
    });
  }

  if (interaction.user.id !== session.creatorId) {
    return interaction.reply({
      content: '❌ Đây không phải quiz của bạn!',
      ephemeral: true
    });
  }

  const guessInput = interaction.fields.getTextInputValue('guess_input');
  if (!guessInput) {
    return interaction.reply({
      content: '❌ Vui lòng nhập tên tướng bạn muốn đoán.',
      ephemeral: true
    });
  }

  const found = await findChampion(guessInput);
  if (!found) {
    return interaction.reply({
      content: `❌ Không tìm thấy tướng nào khớp với tên "${guessInput}". Vui lòng thử lại!`,
      ephemeral: true
    });
  }

  // Get full meta for the guessed champion
  const candidates = await getQuizCandidates();
  const guessedCandidate = candidates.find(c => c.alias === found.alias || c.key === found.key);
  if (!guessedCandidate) {
    return interaction.reply({
      content: `❌ Lỗi dữ liệu khi tìm kiếm thuộc tính của tướng ${found.name}.`,
      ephemeral: true
    });
  }

  // Check if already guessed
  if (session.guesses.some(g => g.alias === guessedCandidate.alias)) {
    return interaction.reply({
      content: `⚠️ Bạn đã đoán **${guessedCandidate.name}** trước đó rồi!`,
      ephemeral: true
    });
  }

  // Add guess to history
  session.guesses.push(guessedCandidate);
  resetExpiry(sessionKeyStr);

  const isCorrect = guessedCandidate.alias === session.target.alias;
  const isGameOver = isCorrect || session.guesses.length >= session.maxGuesses;

  if (isCorrect) {
    session.status = 'won';
    
    // Award points if daily
    if (session.isDaily) {
      try {
        const config = await interaction.client.configStore.getGuildConfig(session.guildId);
        const scoring = config?.quizScoring || { guess1: 100, guess2: 80, guess3: 60, guess4: 40, guess5: 20, guess6: 15, guess7: 10, guess8: 5, fail: 0 };
        const guessCount = session.guesses.length;
        const pointsAmount = scoring[`guess${guessCount}`] ?? 5;
        
        session.pointsEarned = pointsAmount;
        await interaction.client.stateStore.adjustQuizPoints(session.guildId, session.creatorId, pointsAmount);
      } catch (err) {
        console.error('[lolQuiz] Failed to award quiz points:', err);
      }
    }
  } else if (isGameOver) {
    session.status = 'lost';
  }

  // Save daily status on completion
  if (isGameOver) {
    activeQuizSessions.delete(sessionKeyStr);
    if (session.isDaily) {
      try {
        await interaction.client.stateStore.setPlayedDailyQuiz(session.creatorId, session.mode, session.dayKey);
      } catch (err) {
        console.error('[lolQuiz] Failed to save daily played state:', err);
      }
    }
  }

  // Build the updated embed payload
  const replyPayload = buildQuizEmbed(session);

  // Update original message
  await sendOrUpdateQuizMessage(interaction, session, replyPayload);
}

/**
 * Fetch dynamic progressive hints based on target champion details
 */
export async function getQuizHint(session) {
  session.hintCount = (session.hintCount || 0) + 1;
  const detail = await getChampionDetail(session.target.alias, 'vi_VN').catch(() => null);

  if (!detail) {
    return `💡 **Gợi ý ${session.hintCount}:** Tướng này ra mắt năm **${session.target.meta.releaseYear}** và dùng tài nguyên: **${session.target.meta.resource}**.`;
  }

  const step = session.hintCount;
  if (step === 1) {
    return `💡 **Gợi ý 1 (Danh hiệu):** Tướng này được gọi là: **"${detail.title}"**.`;
  }
  if (step === 2) {
    const roles = detail.tags.join(', ');
    return `💡 **Gợi ý 2 (Vai trò):** Tướng này có vai trò chính: **${roles}**.`;
  }
  if (step === 3) {
    // Redact champion name/alias in lore/blurb
    let blurb = detail.blurb || detail.lore || '';
    const nameRegex = new RegExp(session.target.name, 'gi');
    const aliasRegex = new RegExp(session.target.alias, 'gi');
    
    blurb = blurb.replace(/<[^>]+>/g, ''); // strip html tags
    blurb = blurb.replace(nameRegex, '`[TÊN TƯỚNG ĐÃ ẨN]`').replace(aliasRegex, '`[TÊN TƯỚNG ĐÃ ẨN]`');
    if (blurb.length > 250) {
      blurb = blurb.slice(0, 250) + '...';
    }
    return `💡 **Gợi ý 3 (Tiểu sử):**\n> ${blurb}`;
  }
  
  // Spell name hint
  const spells = detail.spells || [];
  const spellNames = spells.map(s => s.name).filter(Boolean);
  if (spellNames.length > 0) {
    const randomSpell = spellNames[Math.floor(Math.random() * spellNames.length)];
    return `💡 **Gợi ý 4 (Tên kỹ năng):** Một trong các chiêu thức của tướng này có tên là: **"${randomSpell}"**.`;
  }

  return `💡 **Gợi ý cuối cùng:** Tướng này thuộc vùng đất **${session.target.meta.region}**, ra mắt năm **${session.target.meta.releaseYear}**.`;
}

/**
 * Renders the leaderboard ranking list
 */
export async function showLeaderboard(ctx) {
  const guildId = ctx.guild.id;
  const isInteraction = ctx.isInteraction;
  const reply = ctx.reply;

  const leaderboard = await ctx.client.stateStore.getQuizLeaderboard(guildId, 10);
  
  const embed = new EmbedBuilder()
    .setTitle('🏆 Bảng Xếp Hạng Điểm LoL Quiz')
    .setColor(0xc89b3c)
    .setDescription('Top 10 cao thủ thông thái có điểm tích lũy Daily Quiz cao nhất server:');

  if (!leaderboard || leaderboard.length === 0) {
    embed.addFields({ name: 'Trống', value: 'Chưa có ai ghi điểm trên bảng xếp hạng. Hãy tham gia `/lolquiz daily` ngay!' });
  } else {
    const lines = leaderboard.map((entry, idx) => {
      let medal = '';
      if (idx === 0) medal = '🥇 ';
      else if (idx === 1) medal = '🥈 ';
      else if (idx === 2) medal = '🥉 ';
      return `\`${idx + 1}.\` ${medal}<@${entry.userId}>: **${entry.points}** điểm`;
    });
    embed.addFields({ name: 'Bảng xếp hạng', value: lines.join('\n') });
  }

  await reply(isInteraction ? { embeds: [embed] } : { embeds: [embed] });
}

/**
 * Utility to format classic attributes beautifully in Vietnamese
 */
function formatAttributeLine(guess, comp) {
  const translateGender = (g) => {
    if (g === 'Male') return 'Nam';
    if (g === 'Female') return 'Nữ';
    return 'Khác';
  };
  const translatePosition = (p) => {
    const mapping = {
      'Top': 'Top',
      'Jungle': 'Rừng',
      'Mid': 'Mid',
      'Bot': 'Bot',
      'Support': 'Sp'
    };
    return Array.isArray(p) ? p.map(x => mapping[x] || x).join(',') : (mapping[p] || p);
  };
  const translateSpecies = (s) => {
    const mapping = {
      'Human': 'Người',
      'Vastaya': 'Vastaya',
      'Yordle': 'Yordle',
      'Darkin': 'Darkin',
      'Undead': 'Xác sống',
      'God': 'Thần',
      'Spirit': 'Tinh linh',
      'Aspect': 'Thượng nhân',
      'Demon': 'Ác quỷ',
      'Dragon': 'Rồng',
      'Celestial': 'Vũ trụ',
      'Minotaur': 'Nhân ngưu',
      'Golem': 'Golem',
      'Voidborn': 'Hư không',
      'Void-Being': 'Hư không',
      'Troll': 'Troll',
      'Iceborn': 'Thể băng',
      'Gargoyle': 'Thạch tượng',
      'Cat': 'Mèo',
      'Revenant': 'Hồn ma'
    };
    return Array.isArray(s) ? s.map(x => mapping[x] || x).join(',') : (mapping[s] || s);
  };
  const translateResource = (r) => {
    const mapping = {
      'Mana': 'Mana',
      'Energy': 'Nội năng',
      'None': 'Không',
      'Rage': 'Nộ',
      'Fury': 'Nộ',
      'Courage': 'Dũng khí',
      'Shield': 'Giáp',
      'Heat': 'Nhiệt',
      'Ferocity': 'Hung tợn',
      'Flow': 'Nhịp độ',
      'Grit': 'Gan góc',
      'Blood': 'Máu',
      'Health': 'Máu'
    };
    return mapping[r] || r;
  };
  const translateRange = (r) => {
    if (r === 'Melee') return 'Cận';
    if (r === 'Ranged') return 'Xa';
    return r;
  };
  const translateRegion = (reg) => {
    const mapping = {
      'Ionia': 'Ionia',
      'Demacia': 'Demacia',
      'Noxus': 'Noxus',
      'Piltover': 'Piltover',
      'Zaun': 'Zaun',
      'Freljord': 'Freljord',
      'Shadow Isles': 'Đảo Bóng Đêm',
      'Bilgewater': 'Bilgewater',
      'Shurima': 'Shurima',
      'Targon': 'Targon',
      'Ixtal': 'Ixtal',
      'Void': 'Hư Không',
      'Runeterra': 'Runeterra',
      'Bandle City': 'T.Phố Bandle',
      'Camavor': 'Camavor'
    };
    return Array.isArray(reg) ? reg.map(x => mapping[x] || x).join(',') : (mapping[reg] || reg);
  };

  const genStatus = comp.gender === 'correct' ? '🟩' : '🟥';
  const posStatus = comp.position === 'correct' ? '🟩' : (comp.position === 'partial' ? '🟧' : '🟥');
  const specStatus = comp.species === 'correct' ? '🟩' : (comp.species === 'partial' ? '🟧' : '🟥');
  const resStatus = comp.resource === 'correct' ? '🟩' : '🟥';
  const ranStatus = comp.range === 'correct' ? '🟩' : '🟥';
  const regStatus = comp.region === 'correct' ? '🟩' : (comp.region === 'partial' ? '🟧' : '🟥');
  const yearStatus = comp.releaseYear === 'correct' ? '🟩' : (comp.releaseYear === 'lower' ? '⬆️' : '⬇️');

  return `👤 ${translateGender(guess.meta.gender)}${genStatus} | ` +
         `🏃 ${translatePosition(guess.meta.position)}${posStatus} | ` +
         `🧬 ${translateSpecies(guess.meta.species)}${specStatus} | ` +
         `🔋 ${translateResource(guess.meta.resource)}${resStatus} | ` +
         `🏹 ${translateRange(guess.meta.range)}${ranStatus} | ` +
         `🗺️ ${translateRegion(guess.meta.region)}${regStatus} | ` +
         `📅 ${guess.meta.releaseYear}${yearStatus}`;
}

/**
 * Utility to format target attributes dynamically based on revealed ones
 */
function formatTargetAttributeRow(session) {
  const targetMeta = session.target.meta;
  
  const translateGender = (g) => {
    if (g === 'Male') return 'Nam';
    if (g === 'Female') return 'Nữ';
    return 'Khác';
  };
  const translatePosition = (p) => {
    const mapping = { 'Top': 'Top', 'Jungle': 'Rừng', 'Mid': 'Mid', 'Bot': 'Bot', 'Support': 'Sp' };
    return Array.isArray(p) ? p.map(x => mapping[x] || x).join(',') : (mapping[p] || p);
  };
  const translateSpecies = (s) => {
    const mapping = {
      'Human': 'Người', 'Vastaya': 'Vastaya', 'Yordle': 'Yordle', 'Darkin': 'Darkin',
      'Undead': 'Xác sống', 'God': 'Thần', 'Spirit': 'Tinh linh', 'Aspect': 'Thượng nhân',
      'Demon': 'Ác quỷ', 'Dragon': 'Rồng', 'Celestial': 'Vũ trụ', 'Minotaur': 'Nhân ngưu',
      'Golem': 'Golem', 'Voidborn': 'Hư không', 'Void-Being': 'Hư không', 'Troll': 'Troll',
      'Iceborn': 'Thể băng', 'Gargoyle': 'Thạch tượng', 'Cat': 'Mèo', 'Revenant': 'Hồn ma'
    };
    return Array.isArray(s) ? s.map(x => mapping[x] || x).join(',') : (mapping[s] || s);
  };
  const translateResource = (r) => {
    const mapping = {
      'Mana': 'Mana', 'Energy': 'Nội năng', 'None': 'Không', 'Rage': 'Nộ', 'Fury': 'Nộ',
      'Courage': 'Dũng khí', 'Shield': 'Giáp', 'Heat': 'Nhiệt', 'Ferocity': 'Hung tợn',
      'Flow': 'Nhịp độ', 'Grit': 'Gan góc', 'Blood': 'Máu', 'Health': 'Máu'
    };
    return mapping[r] || r;
  };
  const translateRange = (r) => {
    if (r === 'Melee') return 'Cận';
    if (r === 'Ranged') return 'Xa';
    return r;
  };
  const translateRegion = (reg) => {
    const mapping = {
      'Ionia': 'Ionia', 'Demacia': 'Demacia', 'Noxus': 'Noxus', 'Piltover': 'Piltover', 'Zaun': 'Zaun',
      'Freljord': 'Freljord', 'Shadow Isles': 'Đảo Bóng Đêm', 'Bilgewater': 'Bilgewater', 'Shurima': 'Shurima',
      'Targon': 'Targon', 'Ixtal': 'Ixtal', 'Void': 'Hư Không', 'Runeterra': 'Runeterra', 'Bandle City': 'T.Phố Bandle',
      'Camavor': 'Camavor'
    };
    return Array.isArray(reg) ? reg.map(x => mapping[x] || x).join(',') : (mapping[reg] || reg);
  };

  const rev = session.revealedAttributes || new Set(['gender', 'region', 'range']);

  const gVal = rev.has('gender') ? translateGender(targetMeta.gender) : '❓';
  const pVal = rev.has('position') ? translatePosition(targetMeta.position) : '❓';
  const sVal = rev.has('species') ? translateSpecies(targetMeta.species) : '❓';
  const rVal = rev.has('resource') ? translateResource(targetMeta.resource) : '❓';
  const ranVal = rev.has('range') ? translateRange(targetMeta.range) : '❓';
  const regVal = rev.has('region') ? translateRegion(targetMeta.region) : '❓';
  const yVal = rev.has('releaseYear') ? String(targetMeta.releaseYear) : '❓';

  return `👤 ${gVal} | 🏃 ${pVal} | 🧬 ${sVal} | 🔋 ${rVal} | 🏹 ${ranVal} | 🗺️ ${regVal} | 📅 ${yVal}`;
}

/**
 * Builds the Embed and Action Row components based on current game state
 */
export function buildQuizEmbed(session) {
  const embed = new EmbedBuilder()
    .setColor(session.status === 'won' ? 0x22c55e : (session.status === 'lost' ? 'Red' : 0xc89b3c));

  const totalGuesses = session.guesses.length;
  const isDailyPrefix = session.isDaily ? 'Daily ' : '';

  // Mode-specific configurations
  if (session.mode === 'classic') {
    embed.setTitle(`🎯 LoL Quiz — ${isDailyPrefix}Classic (Đoán Tướng)`);
    
    let desc = `Đoán tướng bí ẩn dựa trên các thuộc tính so sánh!\nBấm nút **[✍️ Đoán]** bên dưới để gõ đáp án.\nLượt đoán: \`${totalGuesses}/${session.maxGuesses}\``;
    embed.setDescription(desc);

    // Render revealed / unrevealed target attributes
    embed.addFields({
      name: 'Tướng bí ẩn (Thuộc tính)',
      value: formatTargetAttributeRow(session)
    });

    if (totalGuesses > 0) {
      const lines = session.guesses.map((guess, idx) => {
        const comp = compareAttributes(guess.meta, session.target.meta);
        return `\`${idx + 1}.\` **${guess.name}**:\n${formatAttributeLine(guess, comp)}`;
      });

      embed.addFields({
        name: 'Lịch sử đoán tướng',
        value: lines.join('\n')
      });
    }

    embed.addFields({
      name: 'Chú thích thuộc tính',
      value: '👤 Giới tính | 🏃 Đường đi | 🧬 Chủng tộc | 🔋 Tài nguyên | 🏹 Tầm đánh | 🗺️ Vùng đất | 📅 Năm ra mắt'
    });
  } else if (session.mode === 'ability') {
    const ability = session.abilities[session.abilityIndex];
    embed.setTitle(`🔮 LoL Quiz — ${isDailyPrefix}Ability (Đoán Kỹ Năng)`);
    embed.setDescription(`Tướng nào sở hữu kỹ năng này?\nBấm nút **[✍️ Đoán]** bên dưới để gõ đáp án.\nLượt đoán: \`${totalGuesses}/${session.maxGuesses}\``);

    embed.setImage(ability.iconUrl);
    embed.addFields({
      name: 'Loại kỹ năng',
      value: `Kỹ năng: **${ability.type}**`
    });

    const wrongGuesses = session.guesses.filter(g => g.alias !== session.target.alias);
    if (wrongGuesses.length > 0) {
      embed.addFields({
        name: 'Các tướng đã đoán sai',
        value: wrongGuesses.map(g => `❌ ${g.name}`).join(', ')
      });
    }
  } else if (session.mode === 'emoji') {
    embed.setTitle(`😎 LoL Quiz — ${isDailyPrefix}Emoji (Đoán Biểu Tượng)`);
    embed.setDescription(`Đoán xem tướng nào được mô tả bởi các emoji sau:\nBấm nút **[✍️ Đoán]** bên dưới để gõ đáp án.\nLượt đoán: \`${totalGuesses}/${session.maxGuesses}\``);

    embed.addFields({
      name: 'Gợi ý Emoji',
      value: `## ${session.emojiClues.join(' ')}`
    });

    const wrongGuesses = session.guesses.filter(g => g.alias !== session.target.alias);
    if (wrongGuesses.length > 0) {
      embed.addFields({
        name: 'Các tướng đã đoán sai',
        value: wrongGuesses.map(g => `❌ ${g.name}`).join(', ')
      });
    }
  } else if (session.mode === 'daily_description') {
    embed.setTitle(`🔮 LoL Quiz — ${isDailyPrefix}Daily Challenge (Mô tả Kỹ Năng)`);
    embed.setDescription(`Tướng nào sở hữu kỹ năng có mô tả cực khó dưới đây?\nBấm nút **[✍️ Đoán]** bên dưới để gõ đáp án.\nLượt đoán: \`${totalGuesses}/${session.maxGuesses}\``);

    embed.addFields(
      {
        name: 'Loại chiêu thức',
        value: `Chiêu: **${session.abilityType}**`
      },
      {
        name: 'Mô tả chiêu thức (Đã ẩn tên)',
        value: `> ${session.abilityDescription}`
      }
    );

    const wrongGuesses = session.guesses.filter(g => g.alias !== session.target.alias);
    if (wrongGuesses.length > 0) {
      embed.addFields({
        name: 'Các tướng đã đoán sai',
        value: wrongGuesses.map(g => `❌ ${g.name}`).join(', ')
      });
    }
  } else if (session.mode === 'connections') {
    const game = session.connectionsGame;
    embed.setTitle('🧩 LoL Quiz — Connections (Ghép Nhóm Tướng)');
    
    let desc = `Hãy chọn tối đa 4 tướng ở menu bên dưới, sau đó bấm nút **[🚀 Gửi đáp án]** để kiểm tra kết quả.\n` +
               `Mạng sống còn lại: ${'❤️'.repeat(game.lives)}${'🖤'.repeat(4 - game.lives)}\n\n`;

    if (game.completedGroups.length > 0) {
      desc += `**Các nhóm đã tìm được:**\n`;
      game.completedGroups.forEach(catIdx => {
        const cat = game.categories.find(c => c.idx === catIdx);
        const diffIcon = cat.difficulty === 'easy' ? '🟩' : (cat.difficulty === 'medium' ? '🟦' : (cat.difficulty === 'hard' ? '🟪' : '🟨'));
        desc += `${diffIcon} **${cat.name}:** ${cat.champions.join(', ')}\n`;
      });
      desc += `\n`;
    }

    if (session.status === 'active') {
      const selectedNames = (game.selectedIds || []).map(id => {
        const c = game.champions.find(x => x.id === id);
        return c ? c.name : id;
      });
      desc += `👉 **Đang chọn (${selectedNames.length}/4):** ${selectedNames.length > 0 ? selectedNames.join(', ') : '*Chưa chọn*'}\n\n`;
    }

    embed.setDescription(desc);

    if (game.gridPath && fs.existsSync(game.gridPath)) {
      embed.setImage('attachment://connections_grid.png');
    }

    if (session.status === 'won') {
      embed.addFields({
        name: '🎉 CHIẾN THẮNG!',
        value: `Chúc mừng! Bạn đã tìm ra tất cả các nhóm liên kết của ngày hôm nay!`
      });
    } else if (session.status === 'lost') {
      embed.addFields({
        name: '💀 BẠN ĐÃ THUA CUỘC!',
        value: `Bạn đã hết mạng sống. Tất cả các đáp án:\n` +
               game.categories.map(c => `• **${c.name}:** ${c.champions.join(', ')}`).join('\n')
      });
    }
  } else if (session.mode === 'build_guesser') {
    const game = session.buildGame;
    const preset = game.preset;
    embed.setTitle('🛡️ LoL Quiz — Build Guesser (Đoán Lối Chơi)');
    
    let desc = `Đoán tướng dựa trên lối chơi (ngọc, kỹ năng, trang bị khuyên dùng)!\n` +
               `Mạng sống còn lại: ${'❤️'.repeat(game.lives)}${'🖤'.repeat(5 - game.lives)}\n\n` +
               `🛡️ **Ngọc Siêu Cấp:** ${preset.rune}\n` +
               `⚔️ **Thứ tự nâng tối đa:** ${preset.skillOrder}\n` +
               `🎒 **Trang bị cốt lõi:** ${preset.coreItems.join(', ')}\n\n`;

    if (game.guesses.length > 0) {
      desc += `**Các tướng đã đoán sai:** ${game.guesses.map(g => `❌ ${g}`).join(', ')}\n\n`;
    }

    if (game.hintLevel > 0) {
      desc += `**💡 Gợi ý đã mở:**\n`;
      for (let i = 0; i < game.hintLevel; i++) {
        desc += `• *Gợi ý ${i + 1}:* ${preset.hints[i]}\n`;
      }
    }

    embed.setDescription(desc);

    if (game.bannerPath && fs.existsSync(game.bannerPath)) {
      embed.setImage('attachment://build_banner.png');
    }

    if (session.status === 'won') {
      embed.addFields({
        name: '🎉 CHIẾN THẮNG!',
        value: `Chúc mừng! Tướng sở hữu lối chơi này chính xác là **${preset.champion}**!`
      });
    } else if (session.status === 'lost') {
      embed.addFields({
        name: '💀 BẠN ĐÃ THUA CUỘC!',
        value: `Lối chơi này thuộc về tướng **${preset.champion}**.`
      });
    }
  }

  // End state handling
  if (session.mode !== 'connections' && session.mode !== 'build_guesser') {
    if (session.status === 'won') {
      let pointsMsg = '';
      if (session.isDaily && session.pointsEarned !== undefined) {
        pointsMsg = `\n🎁 Điểm thưởng: **+${session.pointsEarned}** điểm!`;
      }
      embed.addFields({
        name: '🎉 CHIẾN THẮNG!',
        value: `Chúc mừng! Tướng bí ẩn chính xác là **${session.target.name}**!\nTổng số lượt đoán: \`${totalGuesses}\`${pointsMsg}`
      });
      embed.setThumbnail(session.target.iconUrl);
    } else if (session.status === 'lost') {
      embed.addFields({
        name: '💀 BẠN ĐÃ THUA!',
        value: `Đáp án đúng là **${session.target.name}**.`
      });
      embed.setThumbnail(session.target.iconUrl);
    }
  }

  // Create action components if active
  const components = [];
  if (session.status === 'active') {
    if (session.mode === 'connections') {
      const game = session.connectionsGame;
      
      // Split remaining champions into chunks of 4 for ActionRows
      const chunkSize = 4;
      for (let i = 0; i < game.shuffledChamps.length; i += chunkSize) {
        const chunk = game.shuffledChamps.slice(i, i + chunkSize);
        const row = new ActionRowBuilder();
        chunk.forEach(c => {
          const isSelected = (game.selectedIds || []).includes(c.id);
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`quiz:connections_toggle:${c.id}:${session.creatorId}`)
              .setLabel(c.name)
              .setStyle(isSelected ? ButtonStyle.Primary : ButtonStyle.Secondary)
          );
        });
        components.push(row);
      }

      // Control row
      const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`quiz:connections_submit:${session.creatorId}`)
          .setLabel('🚀 Gửi đáp án')
          .setStyle(ButtonStyle.Success)
          .setDisabled((game.selectedIds || []).length !== 4),
        new ButtonBuilder()
          .setCustomId(`quiz:connections_clear:${session.creatorId}`)
          .setLabel('✖️ Bỏ chọn')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled((game.selectedIds || []).length === 0),
        new ButtonBuilder()
          .setCustomId(`quiz:forfeit:${session.creatorId}`)
          .setLabel('🏳️ Bỏ cuộc')
          .setStyle(ButtonStyle.Danger)
      );
      components.push(controlRow);
    } else if (session.mode === 'build_guesser') {
      const game = session.buildGame;
      const preset = game.preset;
      const row1 = new ActionRowBuilder();
      preset.recommendations.forEach(champName => {
        const isGuessedWrong = game.guesses.includes(champName);
        row1.addComponents(
          new ButtonBuilder()
            .setCustomId(`quiz:build_guess:${champName}:${session.creatorId}`)
            .setLabel(champName)
            .setStyle(isGuessedWrong ? ButtonStyle.Danger : ButtonStyle.Secondary)
            .setDisabled(isGuessedWrong)
        );
      });
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`quiz:forfeit:${session.creatorId}`)
          .setLabel('🏳️ Bỏ cuộc')
          .setStyle(ButtonStyle.Danger)
      );
      components.push(row1, row2);
    } else {
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`quiz:guess_button:${session.creatorId}`)
            .setLabel('✍️ Đoán')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`quiz:hint:${session.creatorId}`)
            .setLabel('💡 Gợi ý')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`quiz:forfeit:${session.creatorId}`)
            .setLabel('🏳️ Bỏ cuộc')
            .setStyle(ButtonStyle.Danger)
        );
      components.push(row);
    }
  }

  const payload = { embeds: [embed], components };
  if (session.mode === 'connections' && session.connectionsGame && session.connectionsGame.gridPath && fs.existsSync(session.connectionsGame.gridPath)) {
    payload.files = [new AttachmentBuilder(session.connectionsGame.gridPath, { name: 'connections_grid.png' })];
  } else if (session.mode === 'build_guesser' && session.buildGame && session.buildGame.bannerPath && fs.existsSync(session.buildGame.bannerPath)) {
    payload.files = [new AttachmentBuilder(session.buildGame.bannerPath, { name: 'build_banner.png' })];
  }
  return payload;
}

// Timeout handlers
const timeouts = new Map();

function scheduleExpiry(key) {
  if (timeouts.has(key)) clearTimeout(timeouts.get(key));
  const t = setTimeout(() => {
    const session = activeQuizSessions.get(key);
    if (session && session.status === 'active') {
      activeQuizSessions.delete(key);
      console.log(`[lolQuiz] Quiz session ${key} expired due to inactivity.`);
    }
    timeouts.delete(key);
  }, 5 * 60 * 1000); // 5 minutes expiry
  timeouts.set(key, t);
}

function resetExpiry(key) {
  scheduleExpiry(key);
}
