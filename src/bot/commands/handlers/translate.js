import { EmbedBuilder } from 'discord.js';
import { translationService } from '../../../services/translation.service.js';
import { SUPPORTED_LANGUAGES, ALIAS_MAP } from '../../../services/translation/languages.js';

function truncate(str, limit = 1000) {
  if (str.length <= limit) return str;
  return str.slice(0, limit) + '...';
}

/** @returns {Promise<unknown>|undefined} */
export async function handleTranslate(ctx) {
  const { client, command, source, args, isInteraction, user, reply } = ctx;

  if (command.type !== 'translate') return;

  let sourceLang = 'auto';
  let targetLang = isInteraction ? source.options.getString('target') : null;
  let textToTranslate = '';
  let userSpecifiedTarget = false;

  if (isInteraction) {
    textToTranslate = source.options.getString('text');
    sourceLang = source.options.getString('source') || 'auto';
    if (targetLang) {
      userSpecifiedTarget = true;
    } else {
      targetLang = 'vi'; // default target
    }
  } else {
    // prefix command argument parsing (e.g. !translate [src] [target] [text])
    const argsTrim = args ? String(args).trim() : '';
    if (!argsTrim) {
      return reply("Vui lòng nhập nội dung cần dịch. Ví dụ: `/translate text:Hello` hoặc `!translate Hello`.");
    }

    const words = argsTrim.split(/\s+/);
    const firstWord = words[0]?.toLowerCase();
    const secondWord = words[1]?.toLowerCase();

    const firstMapped = ALIAS_MAP[firstWord];
    const secondMapped = secondWord ? ALIAS_MAP[secondWord] : null;

    if (firstMapped && secondMapped) {
      sourceLang = firstMapped;
      targetLang = secondMapped;
      userSpecifiedTarget = true;
      const afterFirst = argsTrim.substring(argsTrim.indexOf(words[0]) + words[0].length).trim();
      textToTranslate = afterFirst.substring(afterFirst.indexOf(words[1]) + words[1].length).trim();
    } else if (firstMapped) {
      sourceLang = 'auto';
      targetLang = firstMapped;
      userSpecifiedTarget = true;
      textToTranslate = argsTrim.substring(argsTrim.indexOf(words[0]) + words[0].length).trim();
    } else {
      sourceLang = 'auto';
      targetLang = 'vi';
      textToTranslate = argsTrim;
    }
  }

  if (!textToTranslate?.trim()) {
    return reply("Vui lòng nhập nội dung cần dịch.");
  }

  try {
    const result = await translationService.translate(textToTranslate, targetLang, sourceLang, userSpecifiedTarget);
    
    const actualTarget = result.actualTargetLang;
    const detected = result.detectedLang;

    // Resolve language metadata from registry
    const srcLangMeta = SUPPORTED_LANGUAGES[detected] || { name: detected.toUpperCase(), emoji: '🔍' };
    const targetLangMeta = SUPPORTED_LANGUAGES[actualTarget] || { name: targetLang.toUpperCase(), emoji: '🔍' };

    const embed = new EmbedBuilder()
      .setTitle(`${srcLangMeta.emoji} ➡️ ${targetLangMeta.emoji} Bản Dịch / Translation`)
      .setColor(0x5865F2)
      .addFields(
        { name: `Bản gốc (${srcLangMeta.name})`, value: truncate(textToTranslate) },
        { name: `Bản dịch (${targetLangMeta.name})`, value: truncate(result.translatedText) }
      )
      .setFooter({
        text: `Yêu cầu bởi ${user.username} • Dịch tự động qua Google`,
        iconURL: user.displayAvatarURL({ size: 128 })
      });

    return reply({ embeds: [embed] });
  } catch (error) {
    console.error("[Translate Command] Error:", error);
    // User-friendly error message, no exceptions bubbled to Discord users
    return reply("Không thể dịch văn bản lúc này. Vui lòng thử lại sau.");
  }
}
