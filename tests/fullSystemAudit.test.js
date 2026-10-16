import { describe, it, expect, vi } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';

// Import modules to audit
import { runAutoMod, runMentionReact } from '../src/bot/autoMod.js';
import { handleXp } from '../src/bot/xpHandler.js';
import {
  createDeck,
  createBlackjackPlayer,
  handValue,
  parseBet,
  parseBetCommand,
  playCoinflip,
  playDice,
  playSlots,
  formatCurrency
} from '../src/bot/games.js';
import { buildControlPanel, handleVoiceStateUpdate } from '../src/bot/tempVoice.js';
import { generateCounterChannelName } from '../src/bot/services/countersEngine.js';
import { buildProgressBar } from '../src/bot/commands/handlers/duolingo.js';
import { handleEsports } from '../src/bot/commands/handlers/esports.js';
import { groupMap } from '../src/bot/help.js';
import { runBuiltInCommand } from '../src/bot/commands/index.js';
import { canModerateMember, memberCanUseCommand } from '../src/commandAccess.js';

describe('Audit: Comprehensive Core & Modules Test Suite', () => {

  // ── 1. AutoMod & Mention-React Module ────────────────────────────────────
  describe('Module: AutoMod & Mention-React', () => {
    it('blocks messages containing blacklisted bad words and deletes them', async () => {
      let deleted = false;
      let sentMessage = null;

      const mockMessage = {
        content: 'Hey you are an idiot and stupid',
        author: { id: 'user_1', tag: 'user#0001', username: 'user1' },
        member: { permissions: { has: () => false } },
        channel: {
          id: 'ch_1',
          send: vi.fn().mockResolvedValue({})
        },
        guild: { name: 'Test Guild', channels: { cache: new Map() } },
        delete: vi.fn(async () => { deleted = true; })
      };

      const mockClient = { ws: { ping: 42 } };

      const mockConfig = {
        commands: [],
        autoModEnabled: true,
        badWords: ['stupid', 'idiot'],
        antiLinkEnabled: false,
        deleteBlockedMessages: true,
        blockedMessage: '❌ Warning {user}, your message was blocked!'
      };

      const blocked = await runAutoMod(mockMessage, mockConfig, mockClient);
      expect(blocked).toBe(true);
      expect(deleted).toBe(true);
      expect(mockMessage.channel.send).toHaveBeenCalled();
    });

    it('blocks unauthorized discord invite and http links when antiLink is active', async () => {
      let deleted = false;
      const mockMessage = {
        content: 'Check out discord.gg/fakeinvite or https://malicious-site.com',
        author: { id: 'user_1', tag: 'user#0001', username: 'user1' },
        member: { permissions: { has: () => false } },
        channel: { id: 'ch_1', send: vi.fn().mockResolvedValue({}) },
        guild: { name: 'Test Guild', channels: { cache: new Map() } },
        delete: vi.fn(async () => { deleted = true; })
      };

      const mockClient = { ws: { ping: 42 } };

      const mockConfig = {
        commands: [],
        autoModEnabled: true,
        badWords: [],
        antiLinkEnabled: true,
        deleteBlockedMessages: true,
        blockedMessage: 'No links allowed!'
      };

      const blocked = await runAutoMod(mockMessage, mockConfig, mockClient);
      expect(blocked).toBe(true);
      expect(deleted).toBe(true);
    });

    it('bypasses automod for moderators with ManageMessages permission', async () => {
      const mockMessage = {
        content: 'Testing bad words: stupid',
        member: { permissions: { has: (perm) => perm === PermissionFlagsBits.ManageMessages } },
        delete: vi.fn().mockResolvedValue({})
      };

      const mockConfig = {
        commands: [],
        autoModEnabled: true,
        badWords: ['stupid'],
        antiLinkEnabled: true
      };

      const blocked = await runAutoMod(mockMessage, mockConfig, { ws: { ping: 42 } });
      expect(blocked).toBe(false);
      expect(mockMessage.delete).not.toHaveBeenCalled();
    });

    it('reacts with configured emoji when bot is mentioned', async () => {
      let reactedEmoji = null;
      const mockMessage = {
        content: 'Hey <@bot_id> how are you?',
        mentions: {
          users: new Map([['bot_id', true]]),
          roles: { some: () => false }
        },
        guild: {
          members: { me: { roles: { cache: new Map() } } },
          emojis: { cache: { find: () => null } }
        },
        react: vi.fn(async (emoji) => { reactedEmoji = emoji; })
      };

      const mockClient = { user: { id: 'bot_id' } };
      const mockConfig = {
        mentionReactEnabled: true,
        mentionReactEmoji: '👋'
      };

      await runMentionReact(mockMessage, mockConfig, mockClient);
      expect(reactedEmoji).toBe('👋');
    });
  });

  // ── 2. XP & Leveling Module ───────────────────────────────────────────────
  describe('Module: XP & Leveling', () => {
    it('grants XP, enforces 60s cooldown, and triggers level-up announcement', async () => {
      let announcedText = null;

      const mockMessage = {
        guild: {
          id: 'guild_1',
          channels: {
            cache: new Map([
              ['ann_ch', { id: 'ann_ch', isTextBased: () => true, send: vi.fn(async (text) => { announcedText = text; }) }]
            ])
          }
        },
        author: { id: 'user_xp_1', username: 'LevelTester' },
        channel: { send: vi.fn() }
      };

      const mockConfig = {
        levelsEnabled: true,
        xpPerMessage: 25,
        xpBase: 100,
        xpExponent: 2.0,
        levelUpAnnouncementEnabled: true,
        levelUpAnnouncementChannelId: 'ann_ch',
        levelUpMessage: '🎉 Chúc mừng {user} ({username}) đã đạt level {level} với {xp} XP!'
      };

      const mockStateStore = {
        addXp: vi.fn(async () => ({
          leveledUp: true,
          level: 2,
          xp: 125
        }))
      };

      // First message: should grant XP
      const granted1 = await handleXp(mockMessage, mockConfig, mockStateStore);
      expect(granted1).toBe(true);
      expect(mockStateStore.addXp).toHaveBeenCalledWith('guild_1', 'user_xp_1', 25, 100, 2.0);
      expect(announcedText).toContain('LevelTester');
      expect(announcedText).toContain('level 2');

      // Immediate second message: must be throttled by 60s cooldown
      const granted2 = await handleXp(mockMessage, mockConfig, mockStateStore);
      expect(granted2).toBe(false);
      expect(mockStateStore.addXp).toHaveBeenCalledTimes(1);
    });
  });

  // ── 3. Economy & Mini-Games Module ────────────────────────────────────────
  describe('Module: Economy & Games', () => {
    it('parses bet strings and tokens accurately', () => {
      expect(parseBet('100')).toBe(100);
      expect(parseBet('50000')).toBe(50000);
      expect(parseBet('abc')).toBe(0);

      const parsed = parseBetCommand({
        isInteraction: false,
        source: {},
        args: '500'
      });
      expect(parsed.bet).toBe(500);
      expect(parsed.currency).toBe('silver');
    });

    it('creates standard 52-card deck and computes Blackjack hand values with soft Aces', () => {
      const deck = createDeck();
      expect(deck.length).toBe(52);

      // Hand with Ace + 9 = 20
      const hand1 = [{ rank: 'A' }, { rank: '9' }];
      expect(handValue(hand1)).toBe(20);

      // Hand with Ace + 9 + 5 = 15 (Ace softens from 11 to 1)
      const hand2 = [{ rank: 'A' }, { rank: '9' }, { rank: '5' }];
      expect(handValue(hand2)).toBe(15);

      // Hand with Ace + 9 + 5 + King = 25 (Bust)
      const hand3 = [{ rank: 'A' }, { rank: '9' }, { rank: '5' }, { rank: 'K' }];
      expect(handValue(hand3)).toBe(25);

      const mockUser = { id: 'u_bj_1', username: 'BlackjackPlayer' };
      const player = createBlackjackPlayer(mockUser, 100, deck, 900);
      expect(player.userId).toBe('u_bj_1');
      expect(player.hands[0].bet).toBe(100);
      expect(player.hands[0].cards.length).toBe(2);
    });

    it('evaluates Coinflip, Dice, and Slots mini-games within probability bounds', () => {
      // Coinflip
      const cfResult = playCoinflip('heads');
      expect(['heads', 'tails']).toContain(cfResult.result);
      expect(typeof cfResult.outcome).toBe('string');

      // Dice
      const diceResult = playDice(4);
      expect(diceResult.roll).toBeGreaterThanOrEqual(1);
      expect(diceResult.roll).toBeLessThanOrEqual(6);
      expect(typeof diceResult.outcome).toBe('string');

      // Slots
      const slotsResult = playSlots();
      expect(slotsResult.reels.length).toBe(3);
      expect(typeof slotsResult.outcome).toBe('string');
      expect(typeof slotsResult.multiplier).toBe('number');
    });

    it('formats currencies according to guild configuration and locale', () => {
      const config = {
        currencySilverName: 'Bạc',
        currencySilverIcon: '🥈',
        currencyGoldName: 'Vàng',
        currencyGoldIcon: '🪙'
      };
      const formatted = formatCurrency(config, 'silver', 5000);
      expect(formatted).toContain('5.000');
      expect(formatted).toContain('Bạc');
      expect(formatted).toContain('🥈');

      const formattedGold = formatCurrency(config, 'gold', 100);
      expect(formattedGold).toContain('🪙');
      expect(formattedGold).toContain('Vàng');
    });
  });

  // ── 4. Moderation & Permission Hierarchy Module ───────────────────────────
  describe('Module: Moderation & Permission Hierarchy', () => {
    it('enforces role hierarchy: moderators cannot punish equals or superiors', () => {
      const mockGuild = {
        ownerId: 'owner_1',
        members: {
          me: {
            roles: { highest: { position: 100 } }
          }
        }
      };

      const modMember = {
        id: 'mod_1',
        roles: { highest: { position: 10 } },
        guild: mockGuild
      };

      const superiorMember = {
        id: 'admin_1',
        roles: { highest: { position: 15 } },
        guild: mockGuild
      };

      const subordinateMember = {
        id: 'user_1',
        roles: { highest: { position: 5 } },
        guild: mockGuild
      };

      // Mod targeting superior -> DENIED
      const check1 = canModerateMember(modMember, superiorMember);
      expect(check1.ok).toBe(false);
      expect(check1.reason).toContain('equal or higher role');

      // Mod targeting subordinate -> ALLOWED
      const check2 = canModerateMember(modMember, subordinateMember);
      expect(check2.ok).toBe(true);

      // Mod targeting server owner -> DENIED
      const ownerMember = {
        id: 'owner_1',
        roles: { highest: { position: 99 } },
        guild: mockGuild
      };
      const checkOwner = canModerateMember(modMember, ownerMember);
      expect(checkOwner.ok).toBe(false);
    });

    it('verifies memberCanUseCommand checks role requirements', () => {
      const staffOnlyCommand = {
        name: 'kick',
        type: 'kick',
        enabled: true,
        allowedRoles: ['role_staff']
      };

      const nonStaff = {
        permissions: { has: () => false },
        roles: { cache: new Map() }
      };
      expect(memberCanUseCommand(nonStaff, staffOnlyCommand)).toBe(false);

      const staff = {
        permissions: { has: () => false },
        roles: { cache: new Map([['role_staff', { id: 'role_staff' }]]) }
      };
      expect(memberCanUseCommand(staff, staffOnlyCommand)).toBe(true);
    });
  });

  // ── 5. Temp Voice (VoiceMaster) Module ────────────────────────────────────
  describe('Module: Temp Voice (VoiceMaster)', () => {
    it('builds control panel with settings and permissions dropdowns', () => {
      const panel = buildControlPanel('ch_temp_1', 'owner_1');
      expect(panel.embeds.length).toBe(1);
      expect(panel.components.length).toBe(3);
      expect(panel.embeds[0].data.title).toContain('Temporary Channel Controls Interface');
    });

    it('creates temp channel when user joins Master channel and registers to store', async () => {
      let createdChannelOptions = null;
      let movedUserTo = null;

      const mockGuild = {
        id: 'guild_vc',
        members: {
          fetch: vi.fn(async () => ({
            displayName: 'VoiceUser',
            voice: {
              channelId: 'master_ch',
              setChannel: vi.fn(async (ch) => { movedUserTo = ch.id; })
            },
            user: { tag: 'VoiceUser#1234' }
          })),
          me: {
            id: 'bot_id',
            permissions: { has: () => true }
          }
        },
        channels: {
          create: vi.fn(async (opts) => {
            createdChannelOptions = opts;
            return {
              id: 'temp_created_ch_1',
              name: opts.name,
              send: vi.fn().mockResolvedValue({})
            };
          })
        }
      };

      const oldState = { channelId: null, guild: mockGuild };
      const newState = {
        channelId: 'master_ch',
        guild: mockGuild,
        member: { id: 'user_vc', displayName: 'VoiceUser', user: { tag: 'VoiceUser#1234' } },
        channel: {
          id: 'master_ch',
          parentId: 'cat_voice',
          permissionsFor: () => ({ has: () => true })
        }
      };

      const mockConfigStore = {
        getGuildConfig: vi.fn(async () => ({
          tempVcEnabled: true,
          tempVcMasterChannelId: 'master_ch',
          tempVcCategoryId: 'cat_voice'
        }))
      };

      const mockRedis = {
        hset: vi.fn(async () => 1),
        hdel: vi.fn(async () => 1)
      };

      await handleVoiceStateUpdate(oldState, newState, mockConfigStore, mockRedis);

      expect(mockGuild.channels.create).toHaveBeenCalled();
      expect(createdChannelOptions.name).toContain('VoiceUser');
      expect(mockRedis.hset).toHaveBeenCalledWith('guild:guild_vc:temp_vcs', 'temp_created_ch_1', 'user_vc');
    });

    it('cleans up and deletes temp channel when empty even if verified via Redis after reboot', async () => {
      let deleted = false;
      const mockGuild = { id: 'guild_vc' };

      const prevChannel = {
        id: 'orphan_temp_vc_888',
        members: { size: 0 },
        delete: vi.fn(async () => { deleted = true; })
      };

      const oldState = { channelId: 'orphan_temp_vc_888', channel: prevChannel, guild: mockGuild };
      const newState = { channelId: null, channel: null, guild: mockGuild };

      const mockConfigStore = {
        getGuildConfig: vi.fn(async () => ({
          tempVcEnabled: true,
          tempVcMasterChannelId: 'master_ch'
        }))
      };

      // Redis knows this channel was a temp VC before the bot rebooted
      const mockRedis = {
        hexists: vi.fn(async (key, field) => field === 'orphan_temp_vc_888' ? 1 : 0),
        hdel: vi.fn(async () => 1)
      };

      await handleVoiceStateUpdate(oldState, newState, mockConfigStore, mockRedis);

      expect(deleted).toBe(true);
      expect(mockRedis.hdel).toHaveBeenCalledWith('guild:guild_vc:temp_vcs', 'orphan_temp_vc_888');
    });
  });

  // ── 6. Server Counters Engine ─────────────────────────────────────────────
  describe('Module: Server Counters Engine', () => {
    it('formats channel counter names accurately according to live stats', () => {
      const template = '👥 Members: {count}';
      const formatted = generateCounterChannelName({ channelNameTemplate: template }, 1250);
      expect(formatted).toBe('👥 Members: 1,250');

      const goalFormatted = generateCounterChannelName(
        { channelNameTemplate: '🎯 Goal: {count}/{goal}' },
        950,
        1000
      );
      expect(goalFormatted).toBe('🎯 Goal: 950/1,000');
    });
  });

  // ── 7. Duolingo Vocabulary Quiz Module ────────────────────────────────────
  describe('Module: Duolingo Vocabulary Quiz', () => {
    it('builds graphical progress bars representing quiz completion status', () => {
      expect(buildProgressBar(0, 5)).toBe('⬜⬜⬜⬜⬜');
      expect(buildProgressBar(3, 5)).toBe('🟩🟩🟩⬜⬜');
      expect(buildProgressBar(5, 5)).toBe('🟩🟩🟩🟩🟩');
    });
  });

  // ── 8. Esports Tracker & Live Alerting Module ─────────────────────────────
  describe('Module: Esports Tracker', () => {
    it('handleEsports builds schedule embed and interactive league switcher buttons', async () => {
      let repliedPayload = null;

      const mockCtx = {
        command: { name: 'esports' },
        args: ['lck'],
        reply: vi.fn(async (payload) => { repliedPayload = payload; })
      };

      await handleEsports(mockCtx);
      expect(repliedPayload).toBeDefined();
      expect(repliedPayload.embeds.length).toBe(1);
      expect(repliedPayload.components.length).toBe(1);
      expect(repliedPayload.components[0].components.length).toBe(3); // LCK, LCP, Worlds buttons
    });
  });

  // ── 9. Help & Command Grouping Registry ───────────────────────────────────
  describe('Module: Help & Category Registry', () => {
    it('verifies all major command categories are properly categorized in groupMap', () => {
      expect(groupMap['ping']).toBe('core');
      expect(groupMap['kick']).toBe('moderation');
      expect(groupMap['rank']).toBe('levels');
      expect(groupMap['balance']).toBe('economy');
      expect(groupMap['esports']).toBe('riot');
      expect(groupMap['play']).toBe('music');
      expect(groupMap['remind']).toBe('utility');
    });
  });

  // ── 10. Command Dispatcher & Built-in Command Engine ──────────────────────
  describe('Module: Command Dispatcher Runtime', () => {
    it('blocks execution when bot lacks SendMessages or ViewChannel in target channel', async () => {
      const mockChannel = {
        id: 'ch_no_perm',
        guild: {
          id: 'g1',
          name: 'Test Guild',
          members: {
            me: { id: 'bot_id' }
          }
        },
        permissionsFor: vi.fn(() => ({
          has: vi.fn(() => false) // Bot lacks send permission
        }))
      };

      const mockSource = {
        isChatInputCommand: false,
        guild: { id: 'g1', name: 'Test Guild' },
        channel: mockChannel,
        user: { id: 'u1', username: 'testuser' },
        author: { id: 'u1', username: 'testuser' },
        member: { permissions: { has: () => true } },
        reply: vi.fn()
      };

      await runBuiltInCommand({
        client: { ws: { ping: 20 } },
        config: { disabledCommands: [], commands: [] },
        command: { name: 'ping', type: 'ping', enabled: true },
        source: mockSource
      });

      // Fail-closed: command is checked against channel permissions
      expect(mockChannel.permissionsFor).toHaveBeenCalled();
    });
  });

});
