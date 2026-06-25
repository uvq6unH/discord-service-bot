export function buildCommandList(config) {
  const prefix = config.prefix === '/' ? '/' : config.prefix || '!';
  return config.commands
    .filter((command) => command.enabled)
    .map((command) => {
      const description = command.description ? ` - ${command.description}` : '';
      return `${prefix}${command.name}${description}`;
    })
    .join('\n');
}

function getContextValue(context, key) {
  return typeof context[key] === 'function' ? context[key]() : context[key];
}

export function renderCommandResponse(template, { client, context, config, args }) {
  const commandCount = config.commands.filter((command) => command.enabled).length;
  const riotKey = config.riotApiKey;
  const tftKey = config.tftApiKey;
  const riotKeyStatus = riotKey ? '✅ Đã cấu hình' : '❌ Chưa cấu hình';
  const tftKeyStatus = tftKey ? '✅ Riêng' : (riotKey ? '♻️ Dùng chung LoL key' : '❌ Chưa cấu hình');
  const tpl = String(template ?? '').trim();
  if (!tpl) return '';
  return tpl
    .replaceAll('{args}', args)
    .replaceAll('{autoReplyStatus}', config.autoReplyEnabled ? 'on' : 'off')
    .replaceAll('{channel}', `<#${getContextValue(context, 'channelId')}>`)
    .replaceAll('{commandCount}', String(commandCount))
    .replaceAll('{commands}', buildCommandList(config))
    .replaceAll('{ping}', String(client.ws.ping))
    .replaceAll('{prefix}', config.prefix || '!')
    .replaceAll('{riotKeyStatus}', riotKeyStatus)
    .replaceAll('{tftKeyStatus}', tftKeyStatus)
    .replaceAll('{server}', getContextValue(context, 'guildName'))
    .replaceAll('{user}', `<@${getContextValue(context, 'userId')}>`)
    .replaceAll('{username}', getContextValue(context, 'username'))
    .replaceAll('{welcomeStatus}', config.welcomeEnabled ? 'on' : 'off');
}