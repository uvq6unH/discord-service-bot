import { describe, it, expect, vi } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { createCommandContext } from '../src/bot/commands/runtime.js';
import { handleGeneral } from '../src/bot/commands/handlers/general.js';
import { handleHelp } from '../src/bot/commands/handlers/help.js';
import { handleLevels } from '../src/bot/commands/handlers/levels.js';
import { handlePanels } from '../src/bot/commands/handlers/panels.js';
import { handleTranslate } from '../src/bot/commands/handlers/translate.js';

describe('Command Runtime & Context (src/bot/commands/runtime.js)', () => {
  function createMockSource({ isInteraction = false, permissions = [], botPerms = true } = {}) {
    const replies = [];
    const base = {
      guild: { id: 'g_1', name: 'Test Guild' },
      channel: {
        id: 'c_1',
        name: 'general',
        permissionsFor: vi.fn(() => ({
          has: vi.fn((flag) => botPerms),
        })),
        send: vi.fn(async (payload) => {
          replies.push(payload);
          return payload;
        }),
      },
      member: {
        roles: { cache: new Map() },
        permissions: {
          has: vi.fn((flag) => permissions.includes(flag)),
        },
      },
      reply: vi.fn(async (payload) => {
        replies.push(payload);
        return payload;
      }),
    };

    if (isInteraction) {
      return {
        ...base,
        isChatInputCommand: () => true,
        user: { id: 'u_int', username: 'InteractUser' },
        memberPermissions: base.member.permissions,
        deferred: false,
        replied: false,
        deferReply: vi.fn(async () => {
          base.deferred = true;
        }),
        editReply: vi.fn(async (payload) => {
          replies.push(payload);
          return payload;
        }),
      };
    }

    return {
      ...base,
      author: { id: 'u_msg', username: 'PrefixUser' },
    };
  }

  it('denies command execution when user lacks required role/permission', async () => {
    const source = createMockSource({ isInteraction: true, permissions: [] });
    const command = { name: 'admin_only', allowedRoles: ['role_admin'], type: 'custom' };

    const ctx = await createCommandContext({
      client: {},
      config: {},
      configStore: {},
      command,
      source,
      args: '',
    });

    expect(ctx.denied).toBe(true);
    expect(source.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('do not have permission'), ephemeral: true })
    );
  });

  it('denies execution when bot lacks ViewChannel or SendMessages permission in channel', async () => {
    const source = createMockSource({ isInteraction: false, botPerms: false });
    const command = { name: 'ping', type: 'ping' };

    const ctx = await createCommandContext({
      client: {},
      config: {},
      configStore: {},
      command,
      source,
      args: '',
    });

    expect(ctx.denied).toBe(true);
  });

  it('creates valid context and auto-defers interaction for long-running command types', async () => {
    const source = createMockSource({ isInteraction: true, permissions: [PermissionFlagsBits.Administrator] });
    const command = { name: 'rank', type: 'rank' };

    const ctx = await createCommandContext({
      client: {},
      config: { commands: [] },
      configStore: {},
      command,
      source,
      args: '',
    });

    expect(ctx.denied).toBe(false);
    expect(source.deferReply).toHaveBeenCalled();
  });
});

describe('General Command Handler (src/bot/commands/handlers/general.js)', () => {
  it('renders ping command response with template parameters', async () => {
    let replyPayload = null;
    const ctx = {
      client: { ws: { ping: 42 } },
      config: { prefix: '!', commands: [] },
      command: { type: 'ping', response: 'Pong! Latency is {ping}ms.' },
      source: {},
      args: '',
      isInteraction: false,
      guild: { name: 'Test' },
      channel: {},
      user: { id: '1', username: 'Test' },
      reply: vi.fn(async (p) => { replyPayload = p; }),
      context: {},
    };

    await handleGeneral(ctx);
    expect(replyPayload).toBe('Pong! Latency is 42ms.');
  });

  it('generates server configuration overview embed for config command', async () => {
    let replyPayload = null;
    const ctx = {
      client: { user: { displayAvatarURL: () => 'https://avatar.url' } },
      config: {
        prefix: '!',
        commands: [{ enabled: true, isCustom: false }],
        riotApiKey: 'mock_key',
        rolesEnabled: true,
        autoReplyEnabled: true,
      },
      command: { type: 'config' },
      source: {},
      args: '',
      guild: { name: 'Audit Guild', iconURL: () => null },
      reply: vi.fn(async (p) => { replyPayload = p; }),
    };

    await handleGeneral(ctx);
    expect(replyPayload).toBeDefined();
    expect(replyPayload.embeds).toBeDefined();
    const embed = replyPayload.embeds[0];
    expect(embed.data.title).toContain('HỆ THỐNG CẤU HÌNH SERVER');
  });
});

describe('Levels Command Handler (src/bot/commands/handlers/levels.js)', () => {
  it('returns disabled notification when levels are turned off in config', async () => {
    let replyPayload = null;
    const ctx = {
      config: { levelsEnabled: false },
      command: { type: 'rank' },
      isInteraction: true,
      reply: vi.fn(async (p) => { replyPayload = p; }),
    };

    await handleLevels(ctx);
    expect(replyPayload).toEqual({ content: 'Levels are disabled.', ephemeral: true });
  });

  it('queries leaderboard and renders description list when levels are enabled', async () => {
    let replyPayload = null;
    const ctx = {
      client: {
        stateStore: {
          getLeaderboard: vi.fn().mockResolvedValue([
            { userId: 'u_1', level: 5, xp: 1200 },
            { userId: 'u_2', level: 3, xp: 500 },
          ]),
        },
      },
      config: { levelsEnabled: true, xpBase: 100, xpExponent: 2.0 },
      command: { type: 'leaderboard' },
      guild: { id: 'g_1' },
      isInteraction: false,
      reply: vi.fn(async (p) => { replyPayload = p; }),
    };

    await handleLevels(ctx);
    expect(replyPayload.embeds[0].data.title).toBe('Leaderboard');
    expect(replyPayload.embeds[0].data.description).toContain('<@u_1> - level 5, 1200 XP');
  });
});

describe('Panels Command Handler (src/bot/commands/handlers/panels.js)', () => {
  it('denies panel creation if member lacks ManageGuild permission', async () => {
    let replyPayload = null;
    const ctx = {
      permissions: { has: () => false },
      command: { type: 'ticketpanel' },
      isInteraction: false,
      reply: vi.fn(async (p) => { replyPayload = p; }),
    };

    await handlePanels(ctx);
    expect(replyPayload).toContain('You need Manage Server permission');
  });

  it('posts ticket panel with button when enabled in config', async () => {
    let channelSendPayload = null;
    const ctx = {
      permissions: { has: () => true },
      config: {
        ticketsEnabled: true,
        ticketPanelTitle: 'Support Desk',
        ticketPanelMessage: 'Click below to open a ticket',
      },
      command: { type: 'ticketpanel' },
      channel: {
        send: vi.fn(async (p) => { channelSendPayload = p; }),
      },
      isInteraction: false,
      reply: vi.fn(),
    };

    await handlePanels(ctx);
    expect(channelSendPayload).toBeDefined();
    expect(channelSendPayload.embeds[0].data.title).toBe('Support Desk');
    expect(channelSendPayload.components.length).toBe(1);
  });
});
