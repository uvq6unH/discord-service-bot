import { renderCommandResponse } from '../responses.js';
import { createCommandContext } from './runtime.js';
import { handleHelp } from './handlers/help.js';
import { handleGeneral } from './handlers/general.js';
import { handleModeration } from './handlers/moderation.js';
import { handleLevels } from './handlers/levels.js';
import { handleEconomy } from './handlers/economy.js';
import { handlePanels } from './handlers/panels.js';
import { handleRiot } from './handlers/riot.js';
import { handleTranslate } from './handlers/translate.js';
import { handleDuolingo } from './handlers/duolingo.js';
import { handleEsports } from './handlers/esports.js';

const HANDLERS = [
  handleHelp,
  handleGeneral,
  handleModeration,
  handleLevels,
  handleEconomy,
  handlePanels,
  handleRiot,
  handleTranslate,
  handleDuolingo,
  handleEsports
];

export async function runBuiltInCommand(params) {
  const ctx = await createCommandContext(params);
  if (ctx.denied) return ctx.deniedResult;

  if (params.stateStore && ctx.guild?.id) {
    params.stateStore.recordTelemetryEvent(
      ctx.guild.id,
      ctx.author?.id,
      ctx.command?.name,
      ctx.command?.type
    ).catch(() => null);
  }

  if (params.redis) {
    import('../logging.js').then(({ pushLiveLog }) => {
      pushLiveLog(params.redis, {
        type: 'CMD',
        message: `Executed /${ctx.command?.name ?? 'command'} by ${ctx.author?.tag ?? 'user'} in ${ctx.guild?.name ?? ctx.guild?.id}`,
        metadata: ctx.guild?.id ?? 'GLOBAL'
      }).catch(() => null);
    }).catch(() => null);
  }

  for (const handler of HANDLERS) {
    const result = await handler(ctx);
    if (result !== undefined) return result;
  }

  const responseText = renderCommandResponse(ctx.command.response, {
    client: ctx.client,
    context: ctx.context,
    config: ctx.config,
    args: ctx.args
  });

  return ctx.reply(responseText || '❌ Lệnh custom chưa cấu hình nội dung phản hồi.');
}
