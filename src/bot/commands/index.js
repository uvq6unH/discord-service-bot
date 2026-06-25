import { renderCommandResponse } from '../responses.js';
import { createCommandContext } from './runtime.js';
import { handleHelp } from './handlers/help.js';
import { handleGeneral } from './handlers/general.js';
import { handleModeration } from './handlers/moderation.js';
import { handleLevels } from './handlers/levels.js';
import { handleEconomy } from './handlers/economy.js';
import { handlePanels } from './handlers/panels.js';
import { handleRiot } from './handlers/riot.js';

const HANDLERS = [
  handleHelp,
  handleGeneral,
  handleModeration,
  handleLevels,
  handleEconomy,
  handlePanels,
  handleRiot
];

export async function runBuiltInCommand(params) {
  const ctx = await createCommandContext(params);
  if (ctx.denied) return ctx.deniedResult;

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
