import {
  handleLsd, handleLolProfile, handleLolMatch, handleLolChamp, handleLolItem, handleLolRunes,
  handleLolPatch, handleLolLink, handleLolUnlink
} from '../../../lolCommands.js';
import {
  handleTftLsd, handleTftProfile, handleTftMatch, handleTftLink, handleTftUnlink
} from '../../../tftCommands.js';

/** @returns {Promise<unknown>|undefined} */
export async function handleRiot(ctx) {
  const {
    client, config, command, source, args, isInteraction, guild, channel, user, permissions,
    reply, context, actorMember
  } = ctx;
  const _lol = ['lsd','lolprofile','lolmatch','lolchamp','lolitem','lolrunes','lolpatch','lollink','lolunlink'];
  const _tft = ['tftlsd','tftprofile','tftmatch','tftlink','tftunlink'];
  if (!_lol.includes(command.type) && !_tft.includes(command.type)) return;

  const LOL_CMDS = ['lsd', 'lolprofile', 'lolmatch', 'lolchamp', 'lolitem', 'lolrunes', 'lolpatch', 'lollink', 'lolunlink'];
  if (LOL_CMDS.includes(command.type)) {
    const lolArgs = isInteraction ? '' : args;
    // stateStore is not in scope of runBuiltInCommand ΓÇö use client.stateStore (set in createBot)
    const ss = client.stateStore;
    const lolCtx = { source, args: lolArgs, isInteraction, stateStore: ss, guildId: guild.id, config, reply };
    if (command.type === 'lsd') return handleLsd(lolCtx);
    if (command.type === 'lolprofile') return handleLolProfile(lolCtx);
    if (command.type === 'lolmatch') return handleLolMatch(lolCtx);
    if (command.type === 'lolchamp') return handleLolChamp({ ...lolCtx });
    if (command.type === 'lolitem') return handleLolItem({ ...lolCtx });
    if (command.type === 'lolrunes') return handleLolRunes({ ...lolCtx });
    if (command.type === 'lolpatch') return handleLolPatch({ ...lolCtx });
    if (command.type === 'lollink') return handleLolLink(lolCtx);
    if (command.type === 'lolunlink') return handleLolUnlink({ source, isInteraction, stateStore: ss, guildId: guild.id, reply });
  }

  // ΓöÇΓöÇ Teamfight Tactics commands ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const TFT_CMDS = ['tftlsd', 'tftprofile', 'tftmatch', 'tftlink', 'tftunlink'];
  if (TFT_CMDS.includes(command.type)) {
    const ss = client.stateStore;
    const tftArgs = isInteraction ? '' : args;
    const tftCtx = { source, args: tftArgs, isInteraction, stateStore: ss, guildId: guild.id, config, reply };
    if (command.type === 'tftlsd')     return handleTftLsd(tftCtx);
    if (command.type === 'tftprofile') return handleTftProfile(tftCtx);
    if (command.type === 'tftmatch')   return handleTftMatch(tftCtx);
    if (command.type === 'tftlink')    return handleTftLink(tftCtx);
    if (command.type === 'tftunlink')  return handleTftUnlink({ source, isInteraction, stateStore: ss, guildId: guild.id, reply });
  }
}
