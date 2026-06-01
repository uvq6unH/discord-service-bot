import { PermissionFlagsBits } from 'discord.js';

/** Built-in commands that must not be available to everyone when allowedRoles is empty. */
export const STAFF_COMMAND_TYPES = new Set([
  'say',
  'purge',
  'warn',
  'kick',
  'ban',
  'timeout',
  'warnings',
  'clearwarns',
  'announce',
  'ecoadd',
  'ecoset',
  'ecoremove',
  'ticketpanel',
  'rolepanel'
]);

export function hasModerationPermission(permissions, commandType) {
  if (!permissions) {
    return false;
  }
  switch (commandType) {
    case 'warn':
    case 'warnings':
      return permissions.has(PermissionFlagsBits.ManageMessages)
        || permissions.has(PermissionFlagsBits.ModerateMembers);
    case 'clearwarns':
      return permissions.has(PermissionFlagsBits.ManageMessages);
    case 'kick':
      return permissions.has(PermissionFlagsBits.KickMembers);
    case 'ban':
      return permissions.has(PermissionFlagsBits.BanMembers);
    case 'timeout':
      return permissions.has(PermissionFlagsBits.ModerateMembers);
    default:
      return false;
  }
}

export function hasStaffDiscordPermission(member, commandType) {
  if (!member) {
    return false;
  }
  const permissions = member.permissions;
  if (permissions.has(PermissionFlagsBits.Administrator)
    || permissions.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }

  switch (commandType) {
    case 'say':
    case 'purge':
    case 'clearwarns':
      return permissions.has(PermissionFlagsBits.ManageMessages);
    case 'warn':
    case 'warnings':
      return hasModerationPermission(permissions, commandType);
    case 'kick':
    case 'ban':
    case 'timeout':
      return hasModerationPermission(permissions, commandType);
    case 'announce':
    case 'ecoadd':
    case 'ecoset':
    case 'ecoremove':
    case 'ticketpanel':
    case 'rolepanel':
      return permissions.has(PermissionFlagsBits.ManageGuild);
    default:
      return false;
  }
}

export function memberCanUseCommand(member, command) {
  if (!member) {
    return false;
  }

  const hasRoleAllowList = Array.isArray(command.allowedRoles) && command.allowedRoles.length > 0;
  if (hasRoleAllowList) {
    if (member.permissions.has(PermissionFlagsBits.Administrator)
      || member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return true;
    }
    return command.allowedRoles.some((roleId) => member.roles.cache.has(roleId));
  }

  if (STAFF_COMMAND_TYPES.has(command.type)) {
    return hasStaffDiscordPermission(member, command.type);
  }

  return true;
}

/** Neutralize @everyone / @here in user-authored announcement text. */
export function sanitizeAnnouncementText(text) {
  return String(text ?? '')
    .replace(/@everyone/gi, '@\u200beveryone')
    .replace(/@here/gi, '@\u200bhere');
}

export function canModerateMember(actorMember, targetMember) {
  if (!targetMember) {
    return { ok: true };
  }
  if (!actorMember) {
    return { ok: false, reason: 'Could not verify your server membership.' };
  }
  if (targetMember.id === actorMember.id) {
    return { ok: false, reason: 'You cannot moderate yourself.' };
  }
  if (targetMember.id === targetMember.guild.ownerId) {
    return { ok: false, reason: 'Cannot moderate the server owner.' };
  }
  if (actorMember.id === actorMember.guild.ownerId) {
    return { ok: true };
  }
  if (targetMember.roles.highest.position >= actorMember.roles.highest.position) {
    return { ok: false, reason: 'You cannot moderate a member with an equal or higher role.' };
  }
  const botMember = targetMember.guild.members.me;
  if (botMember && targetMember.roles.highest.position >= botMember.roles.highest.position) {
    return { ok: false, reason: 'Bot cannot moderate this member (role hierarchy).' };
  }
  return { ok: true };
}
