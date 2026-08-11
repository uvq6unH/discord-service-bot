import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { createCounterChannel, refreshCounterNames, calculateCounterStat, formatCountNumber } from '../../services/countersEngine.js';

export async function handleCountersCommand(ctx) {
  const { command, reply, args, source, guild, actorMember, configStore, isInteraction } = ctx;
  if (!command) return undefined;

  const cmdName = command.name?.toLowerCase();
  const cmdType = command.type?.toLowerCase();

  if (cmdName === 'counter' || cmdType === 'counter' || cmdName === 'counters' || cmdType === 'counters') {
    if (!actorMember?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return reply({ content: '❌ Bạn cần quyền **Administrator** để sử dụng lệnh quản lý Counter.', ephemeral: true });
    }

    let sub = undefined;
    if (isInteraction && source?.options) {
      sub = source.options.getSubcommand(false);
    } else if (args?.length) {
      sub = Array.isArray(args) ? args[0]?.toLowerCase() : args.split(/\s+/)[0]?.toLowerCase();
    }

    const store = configStore || ctx.client?.configStore;

    try {
      // /counter sync — create missing channels + refresh names
      if (sub === 'sync') {
        const config = await store.getGuildConfig(guild.id);
        const counters = config.counters || [];
        let created = 0;
        for (const c of counters) {
          if (!c.channelId && c.enabled !== false) {
            const res = await createCounterChannel(guild, c, store).catch(() => null);
            if (res?.success) created++;
          }
        }
        await refreshCounterNames(guild, store).catch(() => null);

        const embed = new EmbedBuilder()
          .setTitle('📊 Counters Sync')
          .setDescription(`Đã tạo **${created}** kênh mới và cập nhật tên tất cả kênh Counter.`)
          .setColor(0x00FF88)
          .setTimestamp();
        return reply({ embeds: [embed] });
      }

      // /counter setup — create default counters
      if (sub === 'setup') {
        const config = await store.getGuildConfig(guild.id);
        const existing = config.counters || [];

        const defaultCounters = [
          {
            id: `counter_mem_${Date.now()}_1`,
            type: 'members',
            channelNameTemplate: '👥 Members: {count}',
            enabled: true,
            isGoal: false
          },
          {
            id: `counter_usr_${Date.now()}_2`,
            type: 'users',
            channelNameTemplate: '👤 Users: {count}',
            enabled: true,
            isGoal: false
          }
        ];

        const updatedCounters = [...existing, ...defaultCounters];
        await store.updateGuildConfig(guild.id, {
          countersEnabled: true,
          counters: updatedCounters
        });

        // Create channels immediately
        let created = 0;
        for (const c of defaultCounters) {
          const res = await createCounterChannel(guild, c, store).catch(() => null);
          if (res?.success) created++;
        }

        const embed = new EmbedBuilder()
          .setTitle('⚡ Default Counters Setup')
          .setDescription(`Đã tạo **${created}** kênh Counter mặc định (**Members** & **Users**).`)
          .setColor(0x00FF88)
          .setTimestamp();
        return reply({ embeds: [embed] });
      }

      // /counter list or default
      const config = await store.getGuildConfig(guild.id);
      const counters = config.counters || [];

      if (counters.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle('📊 Server Counters')
          .setDescription('Chưa có Counter nào.\n👉 Dùng `/counter setup` hoặc **Dashboard** để tạo!')
          .setColor(0xFFAA00);
        return reply({ embeds: [embed] });
      }

      const lines = await Promise.all(counters.map(async (c, i) => {
        const val = await calculateCounterStat(guild, c);
        const typeStr = c.type;
        const status = c.enabled !== false ? '🟢' : '🔴';
        return `**${i + 1}.** ${status} \`${c.channelNameTemplate}\` (${typeStr}: **${formatCountNumber(val)}**)`;
      }));

      const embed = new EmbedBuilder()
        .setTitle(`📊 Server Counters (${counters.length})`)
        .setDescription(lines.join('\n'))
        .setColor(0x00FF88)
        .setTimestamp();

      return reply({ embeds: [embed] });
    } catch (err) {
      console.error('[countersCommand] Error:', err.message);
      return reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true });
    }
  }

  return undefined;
}
