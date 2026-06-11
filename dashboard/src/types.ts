// ─────────────────────────────────────────────────────────────────────────────
// types.ts — Single source of truth cho toàn bộ app
// ─────────────────────────────────────────────────────────────────────────────

// ── Auth ──────────────────────────────────────────────────────────────────────

export type UserRole = 'owner' | 'admin' | 'moderator' | 'viewer';

export interface DiscordUser {
  id: string;
  username: string;
  avatar: string | null;
  loggedIn: boolean;
  /** Role trong guild đang selected — do server trả về kèm /auth/me hoặc riêng */
  role?: UserRole;
}

// ── Guild ─────────────────────────────────────────────────────────────────────

export interface Guild {
  id: string;
  name: string;
  icon: string | null;
  botPresent: boolean;
  /** User có quyền manage server không */
  isOwner?: boolean;
}

export interface DiscordChannel {
  id: string;
  name: string;
  /** 0 = text, 2 = voice, 4 = category, 5 = announcement */
  type: 0 | 2 | 4 | 5;
}

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
}

export interface GuildData {
  channels: DiscordChannel[];
  roles: DiscordRole[];
  cacheAgeMs?: number;
  stale?: boolean;
}

// ── Commands ──────────────────────────────────────────────────────────────────

export interface CommandConfig {
  type: string;
  enabled: boolean;
  allowedRoles?: string[];
}

export interface CustomCommand extends CommandConfig {
  type: 'custom';
  /** Unique stable id — không dùng name làm key */
  id: string;
  name: string;
  description: string;
  response: string;
}

export interface AutoReply {
  keyword: string;
  response: string;
}

// ── Reminder ─────────────────────────────────────────────────────────────────

export type RepeatInterval = 'none' | 'hourly' | 'daily' | 'weekly';

export interface Reminder {
  id: string;
  userIds: string[];
  channelId: string;
  message: string;
  /** ISO 8601 string */
  time: string;
  repeat: RepeatInterval;
}

// ── Self-role ─────────────────────────────────────────────────────────────────

export interface SelfRole {
  label: string;
  roleId: string;
}

// ── GuildConfig — toàn bộ config của 1 guild ─────────────────────────────────
// Server-only fields (không gửi lên trong PUT) được mark readonly

export interface GuildConfig {
  // ─ Read-only server metadata ─
  readonly guildId?: string;
  readonly riotApiKeyConfigured?: boolean;
  readonly tftApiKeyConfigured?: boolean;
  readonly slashSync?: unknown;

  // ─ General ─
  enabled?: boolean;
  prefix?: string;
  logChannelId?: string;

  // ─ Welcome ─
  welcomeEnabled?: boolean;
  welcomeChannelId?: string;
  welcomeMessage?: string;

  // ─ Announcements ─
  announcementsEnabled?: boolean;
  announcementChannelId?: string;
  announcementMention?: string;

  // ─ Music ─
  musicEnabled?: boolean;
  musicPrefix?: string;

  // ─ Reminders ─
  remindersEnabled?: boolean;
  reminders?: Reminder[];

  // ─ Levels / XP ─
  levelsEnabled?: boolean;
  xpPerMessage?: number;
  levelUpMessage?: string;

  // ─ Economy ─
  economyEnabled?: boolean;
  currencySilverName?: string;
  currencySilverIcon?: string;
  currencyGoldName?: string;
  currencyGoldIcon?: string;
  currencyDiamondName?: string;
  currencyDiamondIcon?: string;
  dailyEnabled?: boolean;
  dailySilverAmount?: number;
  dailyGoldAmount?: number;
  dailyDiamondAmount?: number;
  dailyCooldownHours?: number;
  dailyResetUtcOffset?: number;
  blackjackEnabled?: boolean;
  blackjackMinBet?: number;
  blackjackMaxBet?: number;
  pokerEnabled?: boolean;
  pokerMinBet?: number;
  pokerMaxBet?: number;
  coinflipEnabled?: boolean;
  coinflipMinBet?: number;
  coinflipMaxBet?: number;
  diceEnabled?: boolean;
  diceMinBet?: number;
  diceMaxBet?: number;
  slotsEnabled?: boolean;
  slotsMinBet?: number;
  slotsMaxBet?: number;

  // ─ Commands ─
  commands?: (CommandConfig | CustomCommand)[];
  autoReplyEnabled?: boolean;
  autoReplies?: AutoReply[];
  mentionReactEnabled?: boolean;
  mentionReactEmoji?: string;

  // ─ Moderation ─
  moderationEnabled?: boolean;
  autoModEnabled?: boolean;
  deleteBlockedMessages?: boolean;
  antiLinkEnabled?: boolean;
  blockedMessage?: string;
  badWords?: string[];

  // ─ Tickets ─
  ticketsEnabled?: boolean;
  ticketCategoryId?: string;
  ticketLogChannelId?: string;
  ticketPanelTitle?: string;
  ticketPanelMessage?: string;

  // ─ Roles ─
  rolesEnabled?: boolean;
  autoRoleId?: string;
  selfRolePanelTitle?: string;
  selfRolePanelMessage?: string;
  selfRoles?: SelfRole[];

  // ─ LoL / TFT API keys ─
  riotApiKey?: string;
  tftApiKey?: string;
}

// ── Save payload — strip server-only fields ───────────────────────────────────

export type GuildConfigPatch = Omit<
  GuildConfig,
  'guildId' | 'riotApiKeyConfigured' | 'tftApiKeyConfigured' | 'slashSync'
>;

// ── API responses ─────────────────────────────────────────────────────────────

export interface MembersResponse {
  members: Member[];
  total: number;
  page: number;
}

export interface Member {
  id: string;
  username: string;
  displayName?: string;
  avatar: string | null;
  joinedAt?: string;
}

export interface InviteUrlResponse {
  url: string;
}

export interface StatusResponse {
  online: boolean;
  uptime?: number;
  memUsed?: number;
  memTotal?: number;
  ping?: number;
  guildCount?: number;
  lastHeartbeat?: string;
  cacheAgeMs?: number;
}

// ── Context value types ───────────────────────────────────────────────────────

export interface AuthContextValue {
  user: DiscordUser | null;
  loading: boolean;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface GuildContextValue {
  selectedGuild: Guild | null;
  config: GuildConfig | undefined;
  guildData: GuildData;
  configLoading: boolean;
  dirty: boolean;
  saveStatus: SaveStatus;
  selectGuild: (guild: Guild) => void;
  updateConfig: (patch: Partial<GuildConfig>) => void;
  saveConfig: () => Promise<void>;
}

// ── Permission helpers ────────────────────────────────────────────────────────

export const ROLE_RANK: Record<UserRole, number> = {
  owner:     4,
  admin:     3,
  moderator: 2,
  viewer:    1,
};

/** Trả về true nếu user có ít nhất role yêu cầu */
export function hasPermission(user: DiscordUser | null, required: UserRole): boolean {
  if (!user?.role) return false;
  return ROLE_RANK[user.role] >= ROLE_RANK[required];
}
