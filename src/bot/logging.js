export function formatMessage(template, member) {
  return template
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name);
}

export async function sendLog(guild, config, message) {
  if (!config.logChannelId) {
    return;
  }

  const channel = await guild.channels.fetch(config.logChannelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send(message).catch(() => null);
  }
}

export async function sendTicketLog(guild, config, message) {
  const channelId = config.ticketLogChannelId || config.logChannelId;
  if (!channelId) {
    return;
  }

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send(message).catch(() => null);
  }
}

// ── Live System Console Logs ──────────────────────────────────────────────────

const _inMemoryLiveLogs = [
  {
    id: 'sys-init',
    ts: new Date().toISOString(),
    type: 'INFO',
    message: 'System live telemetry log collector initialized',
    metadata: 'ENGINE_READY'
  }
];

const _sseSubscribers = new Set();

export function subscribeLiveLogs(cb) {
  _sseSubscribers.add(cb);
  return () => _sseSubscribers.delete(cb);
}

export async function pushLiveLog(redis, { type = 'INFO', message = '', metadata = '' }) {
  const item = {
    id: Math.random().toString(36).slice(2, 9),
    ts: new Date().toISOString(),
    type: String(type).toUpperCase(),
    message: String(message),
    metadata: metadata ? String(metadata) : ''
  };

  _inMemoryLiveLogs.unshift(item);
  if (_inMemoryLiveLogs.length > 100) _inMemoryLiveLogs.pop();

  for (const cb of _sseSubscribers) {
    try { cb(item); } catch {}
  }

  if (redis) {
    try {
      await redis.rpush('telemetry:live_logs', JSON.stringify(item)).catch(() => null);
      await redis._request(['LTRIM', 'telemetry:live_logs', '-100', '-1']).catch(() => null);
    } catch {}
  }

  return item;
}

export async function getLiveLogs(redis) {
  if (redis) {
    try {
      const rawLogs = await redis._request(['LRANGE', 'telemetry:live_logs', '0', '-1']);
      if (Array.isArray(rawLogs) && rawLogs.length > 0) {
        return rawLogs.map(r => (typeof r === 'string' ? JSON.parse(r) : r)).reverse();
      }
    } catch {}
  }
  return _inMemoryLiveLogs;
}
