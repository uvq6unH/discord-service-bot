/**
 * src/contexts/GuildContext.jsx — re-export bridge
 * Single source of truth: src/app/services/guild/GuildContext.jsx
 * File này giữ để backward compat với ServerRail, PluginNav, pages cũ
 */
export { GuildProvider, useGuild } from '../app/services/guild/GuildContext.jsx';
