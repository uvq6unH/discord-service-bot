export function noApiKeyMsg(isInteraction, message = '❌ Bot chưa được cấu hình Riot API Key.') {
  return isInteraction ? { content: message, ephemeral: true } : message;
}

export function formatRiotError(err) {
  if (err.status === 404) {
    if (err.message && (err.message.startsWith('Champion not found') || err.message.startsWith('Not found'))) {
      return `❌ Không tìm thấy dữ liệu: ${err.message}`;
    }
    return '❌ Không tìm thấy người chơi. Kiểm tra lại Riot ID và khu vực.';
  }
  if (err.status === 429) {
    return '❌ Đã vượt giới hạn API. Vui lòng thử lại sau vài giây.';
  }
  if (err.status === 403) {
    const isRiotApi = err.body && String(err.body).includes('status_code');
    if (isRiotApi) {
      return '❌ API Key không hợp lệ hoặc đã hết hạn. Refresh key tại developer.riotgames.com.';
    }
    return `❌ Lỗi dữ liệu (403): ${err.message}`;
  }
  return `❌ Lỗi: ${err.message}`;
}

export async function editOrReply(source, isInteraction, payload) {
  if (isInteraction) {
    if (source.deferred || source.replied) {
      return source.editReply(payload);
    }
    return source.reply(payload);
  }
  return source.reply(payload);
}

const REGION_IDS = new Set([
  'vn2', 'na1', 'euw1', 'kr', 'jp1', 'sg2', 'eun1', 'br1', 'la1', 'la2',
  'oc1', 'ph2', 'ru', 'th2', 'tr1', 'tw2'
]);

/**
 * Parse summoner + region from slash args or prefix text; fall back to linked account.
 */
export async function resolveRiotSummonerInput({
  source,
  args,
  isInteraction,
  stateStore,
  guildId,
  getLinkedAccount,
  defaultRegion = 'vn2'
}) {
  let riotIdStr;
  let region;

  if (isInteraction) {
    riotIdStr = source.options.getString('summoner');
    region = (source.options.getString('region') ?? defaultRegion).toLowerCase();
  } else {
    const parts = args.trim().split(/\s+/);
    region = parts.length && REGION_IDS.has(parts[parts.length - 1]?.toLowerCase())
      ? parts.pop().toLowerCase()
      : defaultRegion;
    riotIdStr = parts.join(' ');
  }

  if (!riotIdStr) {
    const userId = isInteraction ? source.user.id : source.author.id;
    const linked = await getLinkedAccount(guildId, userId);
    if (linked) {
      riotIdStr = linked.riotId;
      region = linked.region;
    }
  }

  return { riotIdStr, region };
}
