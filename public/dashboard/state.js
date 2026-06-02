// ── State ───────────────────────────────────────────────────────────────────
export let currentGuildId = null;
export function setCurrentGuildId(id) { currentGuildId = id; }
window.currentGuildData = { channels: [], roles: [] };

// ── DOM refs ────────────────────────────────────────────────────────────────
export const configForm = document.querySelector('#configForm');
export const emptyState = document.querySelector('#emptyState');
export const saveBar = document.querySelector('#saveBar');
export const saveMsg = document.querySelector('#saveMsg');
export const saveBtnBar = document.querySelector('#saveBtnBar');
export const statusDot = document.querySelector('.status-dot');
export const statusText = document.querySelector('#statusText');
export const guildNameEl = document.querySelector('#guildName');
export const guildMetaEl = document.querySelector('#guildMeta');
export const guildIconEl = document.querySelector('#guildIcon');
export const mobileGuildNameEl = document.querySelector('#mobileGuildName');
export const mobileGuildMetaEl = document.querySelector('#mobileGuildMeta');
export const mobilePageSelect = document.querySelector('#mobilePageSelect');
export const pageTitle = document.querySelector('#pageTitle');
export const accessBanner = document.querySelector('#accessBanner');
export const accessBannerMsg = document.querySelector('#accessBannerMsg');
export const serverList = document.querySelector('#serverList');
export const autoRepliesEl = document.querySelector('#autoReplies');
export const selfRolesEl = document.querySelector('#selfRoles');
export const commandSearchEl = document.querySelector('#commandSearch');
export const commandFilterEl = document.querySelector('#commandFilter');

export const navItems = [...document.querySelectorAll('.nav-item')];
export const pages = [...document.querySelectorAll('.page')];

export const pageTitles = {
  overview: 'Dashboard',
  'commands-general': 'Lệnh & Custom',
  'user-levels': 'Cấp độ & XP',
  economy: 'Tiền ảo',
  'auto-replies': 'Tự động trả lời',
  'moderation-automod': 'Kiểm duyệt',
  'server-broadcast': 'Thông báo',
  interactions: 'Ticket & Roles',
  'lol-tft': 'LoL & TFT',
  advanced: 'Nâng cao',
};

export const pageOrder = [
  'overview',
  'commands-general',
  'user-levels',
  'economy',
  'auto-replies',
  'moderation-automod',
  'server-broadcast',
  'interactions',
  'lol-tft',
  'advanced',
];

// ── Fields list ─────────────────────────────────────────────────────────────
export const FIELDS = [
  'enabled', 'prefix', 'logChannelId',
  'moderationEnabled', 'autoModEnabled', 'deleteBlockedMessages', 'antiLinkEnabled', 'blockedMessage',
  'rolesEnabled', 'autoRoleId', 'selfRolePanelTitle', 'selfRolePanelMessage',
  'ticketsEnabled', 'ticketCategoryId', 'ticketLogChannelId', 'ticketPanelTitle', 'ticketPanelMessage',
  'levelsEnabled', 'xpPerMessage', 'levelUpMessage',
  'economyEnabled', 'currencySilverName', 'currencySilverIcon', 'currencyGoldName', 'currencyGoldIcon',
  'currencyDiamondName', 'currencyDiamondIcon', 'dailyEnabled', 'dailyCooldownHours', 'dailySilverAmount',
  'dailyGoldAmount', 'dailyDiamondAmount', 'blackjackEnabled', 'blackjackMinBet', 'blackjackMaxBet',
  'pokerEnabled', 'pokerMinBet', 'pokerMaxBet',
  'coinflipEnabled', 'coinflipMinBet', 'coinflipMaxBet', 'diceEnabled', 'diceMinBet', 'diceMaxBet',
  'slotsEnabled', 'slotsMinBet', 'slotsMaxBet',
  'announcementsEnabled', 'announcementChannelId', 'announcementMention',
  'welcomeEnabled', 'welcomeChannelId', 'welcomeMessage',
  'autoReplyEnabled',
  'mentionReactEnabled', 'mentionReactEmoji',
  'riotApiKey', 'tftApiKey',
];