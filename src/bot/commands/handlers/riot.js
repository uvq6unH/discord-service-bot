import {
  handleLsd, handleLolProfile, handleLolMatch, handleLolChamp, handleLolItem, handleLolRunes,
  handleLolPatch, handleLolLink, handleLolUnlink
} from '../../../lolCommands.js';
import {
  handleTftLsd, handleTftProfile, handleTftMatch, handleTftLink, handleTftUnlink
} from '../../../tftCommands.js';

const LOL_CMDS = new Set(['lsd', 'lolprofile', 'lolmatch', 'lolchamp', 'lolitem', 'lolrunes', 'lolpatch', 'lollink', 'lolunlink']);
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
