import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { syncAllCountersForGuild, calculateCounterStat, formatCountNumber } from '../../services/countersEngine.js';

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
      // /counter sync
      if (sub === 'sync') {
        const results = await syncAllCountersForGuild(guild, store);
        const embed = new EmbedBuilder()
          .setTitle('📊 Counters Sync Completed')
          .setDescription(`Đã cập nhật đồng bộ **${results.length}** kênh Counter trên máy chủ.`)
          .setColor(0x00FF88)
          .setTimestamp();
        return reply({ embeds: [embed] });
      }

      // /counter setup (bulk default setup: Members & Users)
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

        // Trigger immediate sync
        await syncAllCountersForGuild(guild, store);

        const embed = new EmbedBuilder()
          .setTitle('⚡ Default Counters Setup Complete')
          .setDescription('Đã tự động khởi tạo 2 kênh Counter mặc định (**Members** & **Users**) trên máy chủ!')
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
          .setDescription('Máy chủ chưa cấu hình kênh Counter nào.\n👉 Dùng lệnh `/counter setup` hoặc qua **Web Dashboard (Utility)** để tạo nhanh!')
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
