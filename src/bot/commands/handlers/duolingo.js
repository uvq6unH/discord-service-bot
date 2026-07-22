import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const SUPPORTED_LANGUAGES = {
  ru: { name: 'Tiếng Nga (Russian)', emoji: '🇷🇺' },
  zh: { name: 'Tiếng Trung (Chinese)', emoji: '🇨🇳' },
  en: { name: 'Tiếng Anh (English)', emoji: '🇬🇧' }
};

function getDayKey(utcOffsetMinutes = 0) {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const local = new Date(utc + utcOffsetMinutes * 60000);
  return local.toISOString().split('T')[0];
}

function getPreviousDayKey(utcOffsetMinutes = 0) {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const local = new Date(utc + utcOffsetMinutes * 60000 - 24 * 60 * 60 * 1000);
  return local.toISOString().split('T')[0];
}

async function getRandomQuestionsSmart(stateStore, guildId, userId, lang, level, count = 5) {
  const pool = await stateStore.getDuolingoQuestions(lang, level);
  if (pool.length === 0) return [];

  // Get user's completed lessons history
  const history = await stateStore.getDuolingoHistory(guildId, userId).catch(() => []);
  
  // Collect all question prompts answered in the last 2 completed lessons
  const recentlyAnsweredPrompts = new Set();
  history.slice(0, 2).forEach(lesson => {
    if (lesson.results) {
      lesson.results.forEach(res => {
        if (res.prompt) recentlyAnsweredPrompts.add(res.prompt);
      });
    }
  });

  // Filter out recently answered questions
  const freshQuestions = pool.filter(q => !recentlyAnsweredPrompts.has(q.prompt));

  // If we have enough fresh questions, sample from them
  let selected = [];
  if (freshQuestions.length >= count) {
    selected = [...freshQuestions].sort(() => 0.5 - Math.random()).slice(0, count);
  } else {
    // If not enough, take all fresh questions and fill the remaining slots from the recently answered ones
    const sortedFresh = [...freshQuestions].sort(() => 0.5 - Math.random());
    const remainingCount = count - sortedFresh.length;
    
    const usedQuestions = pool.filter(q => recentlyAnsweredPrompts.has(q.prompt));
    const sortedUsed = [...usedQuestions].sort(() => 0.5 - Math.random());
    
    selected = [...sortedFresh, ...sortedUsed.slice(0, remainingCount)];
  }

  // Shuffle the final selected questions so they don't appear in the same order
  return selected.sort(() => 0.5 - Math.random());
}

function buildProgressBar(current, total = 5) {
  const filled = '🟩'.repeat(current);
  const empty = '⬜'.repeat(total - current);
  return `${filled}${empty}`;
}

function renderLessonMessage(session) {
  const langMeta = SUPPORTED_LANGUAGES[session.language] || { name: session.language, emoji: '🌐' };
  const levelMeta = { name: session.level === 'advanced' ? 'Nâng cao' : 'Cơ bản' };
  const question = session.questions[session.currentIndex];

  if (session.status === 'completed') {
    const xpPerCorrect = session.level === 'advanced' ? 15 : 10;
    const base = session.score * xpPerCorrect;
    const bonus = session.score === 5 ? (session.level === 'advanced' ? 15 : 10) : 0;
    const totalXp = base + bonus;

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Hoàn Thành Bài Học / Lesson Completed!`)
      .setDescription(
        `Chúc mừng bạn đã hoàn thành bài học **${langMeta.name}** [${levelMeta.name}]!\n\n` +
        `📊 **Kết quả**: \`${session.score}/5\` câu trả lời đúng\n` +
        `✨ **Kinh nghiệm nhận được**: \`+${totalXp} XP\` (bao gồm ${bonus > 0 ? `bonus ${bonus} XP` : '0 bonus'})\n` +
        `🔥 **Streak hiện tại**: \`${session.streak} ngày\``
      )
      .setColor(0xf1c40f)
      .setTimestamp();

    if (session.results && session.results.length > 0) {
      let reviewText = '';
      session.results.forEach((res, idx) => {
        const icon = res.isCorrect ? '✅' : '❌';
        reviewText += `**Câu ${idx + 1}:** ${res.prompt}\n`;
        reviewText += `${icon} Bạn chọn: *${res.userAnswer}*\n`;
        if (!res.isCorrect) {
          reviewText += `🔑 Đáp án đúng: *${res.correctAnswer}*\n`;
        }
        reviewText += `💡 *${res.explanation}*\n\n`;
      });
      
      if (reviewText.length > 1024) {
        embed.addFields({ name: '📝 Xem lại bài học (Detailed Review) - Phần 1', value: reviewText.slice(0, 1000) + '...' });
        embed.addFields({ name: '📝 Xem lại bài học (Detailed Review) - Phần 2', value: reviewText.slice(1000, 2000) });
      } else {
        embed.addFields({ name: '📝 Xem lại bài học (Detailed Review)', value: reviewText });
      }
    }

    return { embeds: [embed], components: [] };
  }

  if (session.status === 'quit') {
    const embed = new EmbedBuilder()
      .setTitle(`❌ Bài Học Đã Hủy / Lesson Aborted`)
      .setDescription('Bạn đã hủy bài học này. Đừng nản chí, hãy luyện tập lại khi sẵn sàng nhé!')
      .setColor(0x95a5a6)
      .setTimestamp();

    return { embeds: [embed], components: [] };
  }

  const embed = new EmbedBuilder()
    .setTitle(`${langMeta.emoji} Duolingo Lesson: ${langMeta.name} [${levelMeta.name}]`)
    .setColor(session.answered ? (session.lastAnswerCorrect ? 0x2ecc71 : 0xe74c3c) : 0x5865F2)
    .addFields(
      { name: 'Tiến trình (Progress)', value: `${buildProgressBar(session.currentIndex + 1)} Câu ${session.currentIndex + 1}/5` }
    );

  const questionTypeNames = {
    choice: 'Dịch nghĩa (Translate)',
    pronunciation: 'Đọc phiên âm (Pronunciation)',
    fill: 'Điền vào chỗ trống (Fill in the blank)',
    unscramble: 'Ghép từ thành câu (Word Unscramble)'
  };
  const qTypeName = questionTypeNames[question.type] || 'Học tập';

  embed.addFields({ name: `Loại bài tập: ${qTypeName}`, value: `**${question.prompt}**` });

  if (question.type === 'unscramble') {
    embed.addFields({
      name: '✍️ Câu đã ghép (Assembled)',
      value: session.assembled && session.assembled.length > 0
        ? `**${session.assembled.join(' ')}**`
        : '*(Vui lòng click các nút từ bên dưới để ghép câu)*'
    });
  } else {
    const optionsText = question.options.map((opt, idx) => `**${String.fromCharCode(65 + idx)}.** ${opt}`).join('\n');
    embed.addFields({ name: 'Lựa chọn (Options)', value: optionsText });
  }

  if (session.answered) {
    const prefix = session.lastAnswerCorrect ? '✅ **Chính xác! (Correct!)**' : '❌ **Sai rồi! (Incorrect!)**';
    let correctAnswerText = '';
    if (question.type === 'unscramble') {
      correctAnswerText = `Đáp án đúng: **${question.answer.join(' ')}**`;
    } else {
      correctAnswerText = `Đáp án đúng: **${String.fromCharCode(65 + question.answer)}. ${question.options[question.answer]}**`;
    }

    embed.addFields({
      name: 'Kết quả (Result)',
      value: `${prefix}\n${!session.lastAnswerCorrect ? correctAnswerText + '\n' : ''}💡 *${question.explanation}*`
    });

    const isLast = session.currentIndex === 4;
    const nextBtn = new ButtonBuilder()
      .setCustomId(`duolingo:next:${session.creatorId}`)
      .setLabel(isLast ? 'Hoàn thành (Finish) 🏆' : 'Tiếp tục (Next) ➡️')
      .setStyle(isLast ? ButtonStyle.Success : ButtonStyle.Primary);

    const quitBtn = new ButtonBuilder()
      .setCustomId(`duolingo:quit:${session.creatorId}`)
      .setLabel('Hủy bài học (Quit)')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(nextBtn, quitBtn);
    return { embeds: [embed], components: [row] };
  } else {
    // Unanswered components layout
    if (question.type === 'unscramble') {
      const components = [];
      
      // Chunk scrambled words into rows of 5 buttons
      const wordButtons = question.scrambled.map((word, idx) => {
        const isUsed = session.assembledIndices && session.assembledIndices.includes(idx);
        return new ButtonBuilder()
          .setCustomId(`duolingo:word:${session.creatorId}:${idx}`)
          .setLabel(word.slice(0, 80))
          .setStyle(isUsed ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(isUsed);
      });

      const chunkSize = 5;
      for (let i = 0; i < wordButtons.length; i += chunkSize) {
        const chunk = wordButtons.slice(i, i + chunkSize);
        components.push(new ActionRowBuilder().addComponents(chunk));
      }

      // Add control row
      const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`duolingo:subunscramble:${session.creatorId}`)
          .setLabel('Xác nhận (Submit) ✔️')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`duolingo:clearunscramble:${session.creatorId}`)
          .setLabel('Xóa (Clear) 🗑️')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`duolingo:quit:${session.creatorId}`)
          .setLabel('Hủy (Quit)')
          .setStyle(ButtonStyle.Secondary)
      );
      components.push(controlRow);

      return { embeds: [embed], components };
    } else {
      // Standard multiple-choice layout
      const row = new ActionRowBuilder().addComponents(
        [0, 1, 2, 3].map(idx =>
          new ButtonBuilder()
            .setCustomId(`duolingo:ans:${session.creatorId}:${idx}`)
            .setLabel(String.fromCharCode(65 + idx))
            .setStyle(ButtonStyle.Secondary)
        )
      );

      const quitRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`duolingo:quit:${session.creatorId}`)
          .setLabel('Hủy bài học (Quit)')
          .setStyle(ButtonStyle.Danger)
      );

      return { embeds: [embed], components: [row, quitRow] };
    }
  }
}

/** @returns {Promise<unknown>|undefined} */
export async function handleDuolingo(ctx) {
  const { client, command, source, args, isInteraction, guild, user, reply } = ctx;

  if (command.type !== 'duolingo') return;

  const stateStore = client.stateStore;

  let action = 'start';
  let language = 'ru';
  let level = 'basic';

  if (isInteraction) {
    action = source.options.getString('action') || 'start';
    language = source.options.getString('language') || 'ru';
    level = source.options.getString('level') || 'basic';
  } else {
    // Prefix arguments parsing: !duolingo [start|leaderboard|stats|history] [ru|zh] [basic|advanced]
    const argsTrim = args ? String(args).trim().toLowerCase() : '';
    const words = argsTrim.split(/\s+/).filter(Boolean);
    
    if (words[0] === 'leaderboard' || words[0] === 'lb' || words[0] === 'top') {
      action = 'leaderboard';
    } else if (words[0] === 'stats' || words[0] === 'me') {
      action = 'stats';
    } else if (words[0] === 'history' || words[0] === 'log' || words[0] === 'his') {
      action = 'history';
    } else {
      action = 'start';
      if (words.includes('zh') || words.includes('trung') || words.includes('china')) {
        language = 'zh';
      } else if (words.includes('en') || words.includes('anh') || words.includes('english')) {
        language = 'en';
      }
      if (words.includes('advanced') || words.includes('nagncao') || words.includes('nâng-cao') || words.includes('kho')) {
        level = 'advanced';
      }
    }
  }

  const config = client.configStore?.cache[guild.id] || {};
  const utcOffset = config.dailyResetUtcOffset || 0;

  // 1. Handle leaderboard action
  if (action === 'leaderboard') {
    const entries = await stateStore.getDuolingoLeaderboard(guild.id, 10, utcOffset);
    if (!entries.length) {
      return reply("📊 Chưa có dữ liệu bảng xếp hạng học tập trên server này. Hãy dùng `/duolingo action:start` để học nhé!");
    }

    const embed = new EmbedBuilder()
      .setTitle(`📊 Bảng Xếp Hạng Học Tập Duolingo — ${guild.name}`)
      .setColor(0x2ecc71)
      .setTimestamp();

    const desc = entries.map((entry, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
      return `${medal} <@${entry.userId}> - **${entry.xp} XP** (Streak: ${entry.streak} 🔥)`;
    }).join('\n');

    embed.setDescription(desc);
    return reply({ embeds: [embed] });
  }

  // 2. Handle stats action
  if (action === 'stats') {
    const stats = await stateStore.getDuolingoStats(guild.id, user.id, utcOffset);
    const embed = new EmbedBuilder()
      .setTitle(`👤 Hồ Sơ Học Tập Duolingo — ${user.username}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setColor(0x2ecc71)
      .addFields(
        { name: 'Tổng kinh nghiệm (Total XP)', value: `\`${stats.xp} XP\``, inline: true },
        { name: 'Chuỗi học tập (Streak)', value: `\`${stats.streak} ngày\` 🔥`, inline: true },
        { name: 'Ngày học cuối (Last Active)', value: `\`${stats.lastActiveDate || 'Chưa từng học'}\``, inline: true }
      )
      .setTimestamp();

    return reply({ embeds: [embed] });
  }

  // 3. Handle history action
  if (action === 'history') {
    const history = await stateStore.getDuolingoHistory(guild.id, user.id);
    if (!history.length) {
      return reply("📜 Bạn chưa hoàn thành bài học nào. Hãy học thử bài đầu tiên bằng cách gõ `/duolingo action:start` nhé!");
    }

    const embed = new EmbedBuilder()
      .setTitle(`📜 Lịch Sử Học Tập Duolingo — ${user.username}`)
      .setColor(0x3498db)
      .setTimestamp();

    let desc = '';
    const last3 = history.slice(0, 3);
    
    last3.forEach((lesson, lIdx) => {
      const timeStr = new Date(lesson.timestamp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      const langMeta = SUPPORTED_LANGUAGES[lesson.language] || { name: lesson.language, emoji: '🌐' };
      const levelName = lesson.level === 'advanced' ? 'Nâng cao' : 'Cơ bản';
      
      desc += `### 📅 Bài học #${lIdx + 1} (${timeStr})\n`;
      desc += `• Ngôn ngữ: **${langMeta.emoji} ${langMeta.name} [${levelName}]**\n`;
      desc += `• Kết quả: **${lesson.score}/5 câu trả lời đúng**\n\n`;

      if (lesson.results && lesson.results.length > 0) {
        lesson.results.forEach((res, rIdx) => {
          const icon = res.isCorrect ? '✅' : '❌';
          desc += `  ${icon} **Q${rIdx + 1}:** ${res.prompt}\n`;
          desc += `     ↳ Trả lời: *${res.userAnswer}* ${!res.isCorrect ? `(Đúng: *${res.correctAnswer}*)` : ''}\n`;
        });
      }
      desc += '\n';
    });

    if (history.length > 3) {
      desc += `### 📚 Các bài học cũ hơn:\n`;
      history.slice(3).forEach((lesson) => {
        const timeStr = new Date(lesson.timestamp).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const langMeta = SUPPORTED_LANGUAGES[lesson.language] || { name: lesson.language, emoji: '🌐' };
        const levelName = lesson.level === 'advanced' ? 'Nâng cao' : 'Cơ bản';
        desc += `• \`${timeStr}\`: ${langMeta.emoji} ${langMeta.name} [${levelName}] — **${lesson.score}/5**\n`;
      });
    }

    embed.setDescription(desc);
    return reply({ embeds: [embed] });
  }

  // 4. Start lesson action
  if (!SUPPORTED_LANGUAGES[language]) {
    return reply("❌ Ngôn ngữ không hỗ trợ. Chỉ hỗ trợ tiếng Nga (`ru`), tiếng Trung (`zh`) hoặc tiếng Anh (`en`).");
  }

  const questions = await getRandomQuestionsSmart(stateStore, guild.id, user.id, language, level, 5);
  if (!questions.length) {
    return reply("❌ Không tìm thấy bộ câu hỏi cho ngôn ngữ hoặc cấp độ này.");
  }

  const session = {
    guildId: guild.id,
    creatorId: user.id,
    createdAt: Date.now(),
    language,
    level,
    questions,
    currentIndex: 0,
    score: 0,
    status: 'active',
    answered: false,
    lastAnswerCorrect: false,
    selectedOption: null,
    assembled: [],
    assembledIndices: [],
    results: [],
    messageId: null
  };

  const payload = renderLessonMessage(session);
  const msg = await reply(payload);
  session.messageId = msg.id;

  await stateStore.setGameSession(guild.id, 'duolingo', msg.id, session);
  return msg;
}

/** Component interaction routing handler */
export async function handleDuolingoButton(interaction) {
  const [_, action, creatorId, extra] = interaction.customId.split(':');
  if (interaction.user.id !== creatorId) {
    return interaction.reply({ content: '❌ Đây không phải bài học của bạn!', ephemeral: true });
  }

  const stateStore = interaction.client.stateStore;
  const config = interaction.client.configStore?.cache[interaction.guildId] || {};

  await interaction.deferUpdate().catch(() => null);

  // Load active session with lock
  await stateStore.withGameSessionLock(interaction.guildId, 'duolingo', interaction.message.id, async () => {
    const session = await stateStore.getGameSession(interaction.guildId, 'duolingo', interaction.message.id);
    if (!session || session.status !== 'active') return;

    if (action === 'quit') {
      session.status = 'quit';
      const payload = renderLessonMessage(session);
      if (interaction.message) {
        await interaction.message.delete().catch(() => null);
      }
      await interaction.channel.send(payload);
      await stateStore.deleteGameSession(interaction.guildId, 'duolingo', interaction.message.id);
      return;
    }

    if (action === 'word') {
      if (session.answered) return;
      const wordIdx = parseInt(extra, 10);
      const question = session.questions[session.currentIndex];
      
      session.assembledIndices ??= [];
      session.assembled ??= [];

      if (!session.assembledIndices.includes(wordIdx)) {
        session.assembledIndices.push(wordIdx);
        session.assembled.push(question.scrambled[wordIdx]);
      }

      const payload = renderLessonMessage(session);
      if (interaction.message) {
        await interaction.message.delete().catch(() => null);
      }
      const newMsg = await interaction.channel.send(payload);
      
      session.messageId = newMsg.id;
      await stateStore.deleteGameSession(interaction.guildId, 'duolingo', interaction.message.id);
      await stateStore.setGameSession(interaction.guildId, 'duolingo', newMsg.id, session);
      return;
    }

    if (action === 'clearunscramble') {
      if (session.answered) return;
      session.assembled = [];
      session.assembledIndices = [];

      const payload = renderLessonMessage(session);
      if (interaction.message) {
        await interaction.message.delete().catch(() => null);
      }
      const newMsg = await interaction.channel.send(payload);
      
      session.messageId = newMsg.id;
      await stateStore.deleteGameSession(interaction.guildId, 'duolingo', interaction.message.id);
      await stateStore.setGameSession(interaction.guildId, 'duolingo', newMsg.id, session);
      return;
    }

    if (action === 'subunscramble') {
      if (session.answered) return;
      
      session.assembled ??= [];
      if (session.assembled.length === 0) {
        return interaction.followUp({ content: '⚠️ Bạn phải chọn ít nhất một từ để ghép câu!', ephemeral: true });
      }

      const question = session.questions[session.currentIndex];
      
      const assembledStr = session.assembled.join(' ').trim().toLowerCase();
      const answerStr = question.answer.join(' ').trim().toLowerCase();
      
      session.answered = true;
      session.lastAnswerCorrect = (assembledStr === answerStr);
      if (session.lastAnswerCorrect) {
        session.score += 1;
      }

      // Add to results history
      session.results ??= [];
      session.results.push({
        prompt: question.prompt,
        type: question.type,
        userAnswer: session.assembled.join(' '),
        correctAnswer: question.answer.join(' '),
        isCorrect: session.lastAnswerCorrect,
        explanation: question.explanation
      });

      const payload = renderLessonMessage(session);
      if (interaction.message) {
        await interaction.message.delete().catch(() => null);
      }
      const newMsg = await interaction.channel.send(payload);
      
      session.messageId = newMsg.id;
      await stateStore.deleteGameSession(interaction.guildId, 'duolingo', interaction.message.id);
      await stateStore.setGameSession(interaction.guildId, 'duolingo', newMsg.id, session);
      return;
    }

    if (action === 'ans') {
      if (session.answered) return; // already answered
      const optIdx = parseInt(extra, 10);
      const question = session.questions[session.currentIndex];
      
      session.answered = true;
      session.selectedOption = optIdx;
      session.lastAnswerCorrect = (optIdx === question.answer);
      if (session.lastAnswerCorrect) {
        session.score += 1;
      }

      // Add to results history
      session.results ??= [];
      session.results.push({
        prompt: question.prompt,
        type: question.type,
        userAnswer: question.options[optIdx],
        correctAnswer: question.options[question.answer],
        isCorrect: session.lastAnswerCorrect,
        explanation: question.explanation
      });

      const payload = renderLessonMessage(session);
      if (interaction.message) {
        await interaction.message.delete().catch(() => null);
      }
      const newMsg = await interaction.channel.send(payload);
      
      session.messageId = newMsg.id;
      await stateStore.deleteGameSession(interaction.guildId, 'duolingo', interaction.message.id);
      await stateStore.setGameSession(interaction.guildId, 'duolingo', newMsg.id, session);
      return;
    }

    if (action === 'next') {
      if (!session.answered) return;

      if (session.currentIndex < 4) {
        // Go to next question
        session.currentIndex += 1;
        session.answered = false;
        session.selectedOption = null;
        session.assembled = [];
        session.assembledIndices = [];
        
        const payload = renderLessonMessage(session);
        if (interaction.message) {
          await interaction.message.delete().catch(() => null);
        }
        const newMsg = await interaction.channel.send(payload);
        
        session.messageId = newMsg.id;
        await stateStore.deleteGameSession(interaction.guildId, 'duolingo', interaction.message.id);
        await stateStore.setGameSession(interaction.guildId, 'duolingo', newMsg.id, session);
      } else {
        // Complete the lesson!
        session.status = 'completed';

        // Calculate rewards
        const xpPerCorrect = session.level === 'advanced' ? 15 : 10;
        const base = session.score * xpPerCorrect;
        const bonus = session.score === 5 ? (session.level === 'advanced' ? 15 : 10) : 0;
        const xpGained = base + bonus;

        // Calculate streak
        const dayKey = getDayKey(config.dailyResetUtcOffset || 0);
        const prevDayKey = getPreviousDayKey(config.dailyResetUtcOffset || 0);

        const stats = await stateStore.getDuolingoStats(interaction.guildId, creatorId, config.dailyResetUtcOffset || 0);
        
        if (stats.lastActiveDate === dayKey) {
          // Already completed a lesson today, streak remains unchanged
        } else if (stats.lastActiveDate === prevDayKey) {
          stats.streak += 1;
        } else {
          stats.streak = 1; // start new streak
        }

        stats.lastActiveDate = dayKey;
        stats.xp += xpGained;
        session.streak = stats.streak;

        // Save stats
        await stateStore.saveDuolingoStats(interaction.guildId, creatorId, stats);

        // Push completed lesson results to history
        const historyEntry = {
          timestamp: Date.now(),
          language: session.language,
          level: session.level,
          score: session.score,
          results: session.results || []
        };
        await stateStore.pushDuolingoHistory(interaction.guildId, creatorId, historyEntry).catch(err => {
          console.error('[duolingo] Failed to push history:', err);
        });
        
        const payload = renderLessonMessage(session);
        if (interaction.message) {
          await interaction.message.delete().catch(() => null);
        }
        await interaction.channel.send(payload);
        await stateStore.deleteGameSession(interaction.guildId, 'duolingo', interaction.message.id);
      }
    }
  });
}
