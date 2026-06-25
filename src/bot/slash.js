import { ApplicationCommandOptionType } from 'discord.js';
import { buildLolSlashOptions } from '../lolCommands.js';
import { buildTftSlashOptions } from '../tftCommands.js';

export function buildSlashCommands(config) {
  return config.commands
    .filter((command) => command.enabled && !command.type.startsWith('music'))
    .map((command) => ({
      name: command.name,
      description: command.description || `Run ${command.name}`,
      dmPermission: false,
      options: buildSlashOptions(command)
    }));
}

function buildSlashOptions(command) {
  if (command.type === 'help') {
    return [
      {
        name: 'group',
        description: 'Chọn nhóm câu lệnh cần trợ giúp',
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: '⚙️ Lệnh Chung & Custom', value: 'general' },
          { name: '👤 Thành Viên & Cấp Độ', value: 'user' },
          { name: '🖥️ Máy Chủ & Phát Thanh', value: 'server' },
          { name: '🛡️ Kiểm Duyệt & Bảo Mật', value: 'moderation' },
          { name: '🔔 Tương Tác & Nút Bấm', value: 'interactions' },
          { name: '⚔️ League of Legends & TFT', value: 'lol' },
        ]
      }
    ];
  }

  if (['warnings', 'clearwarns'].includes(command.type)) {
    return [
      {
        name: 'target',
        description: 'Target user',
        type: ApplicationCommandOptionType.User,
        required: true
      }
    ];
  }

  if (command.type === 'balance') {
    return [
      {
        name: 'target',
        description: 'User to inspect',
        type: ApplicationCommandOptionType.User,
        required: false
      }
    ];
  }

  if (command.type === 'economyleaderboard') {
    return [
      {
        name: 'currency',
        description: 'Currency leaderboard',
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: 'Bạc', value: 'silver' },
          { name: 'Vàng', value: 'gold' },
          { name: 'Kim cương', value: 'diamond' }
        ]
      }
    ];
  }

  if (['blackjack', 'poker', 'slots'].includes(command.type)) {
    return [
      {
        name: 'bet',
        description: 'Bet amount',
        type: ApplicationCommandOptionType.Integer,
        minValue: 1,
        required: true
      },
    ];
  }

  if (command.type === 'coinflip') {
    return [
      {
        name: 'bet',
        description: 'Bet amount',
        type: ApplicationCommandOptionType.Integer,
        minValue: 1,
        required: true
      },
      {
        name: 'side',
        description: 'Pick heads or tails',
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: 'Heads', value: 'heads' },
          { name: 'Tails', value: 'tails' }
        ]
      }
    ];
  }

  if (command.type === 'dice') {
    return [
      {
        name: 'bet',
        description: 'Bet amount',
        type: ApplicationCommandOptionType.Integer,
        minValue: 1,
        required: true
      },
      {
        name: 'prediction',
        description: 'Chọn số (1-6), hoặc Tài/Xỉu/Chẵn/Lẻ',
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          { name: '1', value: '1' },
          { name: '2', value: '2' },
          { name: '3', value: '3' },
          { name: '4', value: '4' },
          { name: '5', value: '5' },
          { name: '6', value: '6' },
          { name: 'Tài (High: 4-6)', value: 'high' },
          { name: 'Xỉu (Low: 1-3)', value: 'low' },
          { name: 'Chẵn (Even)', value: 'even' },
          { name: 'Lẻ (Odd)', value: 'odd' }
        ]
      }
    ];
  }

  if (['ecoadd', 'ecoset', 'ecoremove'].includes(command.type)) {
    return [
      {
        name: 'target',
        description: 'Target user',
        type: ApplicationCommandOptionType.User,
        required: true
      },
      {
        name: 'currency',
        description: 'Currency',
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          { name: 'Bạc', value: 'silver' },
          { name: 'Vàng', value: 'gold' },
          { name: 'Kim cương', value: 'diamond' }
        ]
      },
      {
        name: 'amount',
        description: 'Amount',
        type: ApplicationCommandOptionType.Integer,
        minValue: 0,
        required: true
      }
    ];
  }

  if (['warn', 'kick', 'ban'].includes(command.type)) {
    return [
      {
        name: 'target',
        description: 'Target user',
        type: ApplicationCommandOptionType.User,
        required: true
      },
      {
        name: 'reason',
        description: 'Reason',
        type: ApplicationCommandOptionType.String,
        required: false
      }
    ];
  }

  if (command.type === 'timeout') {
    return [
      {
        name: 'target',
        description: 'Target user',
        type: ApplicationCommandOptionType.User,
        required: true
      },
      {
        name: 'minutes',
        description: 'Timeout duration in minutes',
        type: ApplicationCommandOptionType.Integer,
        minValue: 1,
        maxValue: 10080,
        required: true
      },
      {
        name: 'reason',
        description: 'Reason',
        type: ApplicationCommandOptionType.String,
        required: false
      }
    ];
  }

  if (['user', 'avatar', 'rank'].includes(command.type)) {
    return [
      {
        name: 'target',
        description: 'User to inspect',
        type: ApplicationCommandOptionType.User,
        required: false
      }
    ];
  }

  if (command.type === 'say') {
    return [
      {
        name: 'message',
        description: 'Message to send',
        type: ApplicationCommandOptionType.String,
        required: true
      }
    ];
  }

  if (command.type === 'announce') {
    return [
      {
        name: 'message',
        description: 'Announcement text',
        type: ApplicationCommandOptionType.String,
        required: true
      }
    ];
  }

  if (command.type === 'purge') {
    return [
      {
        name: 'amount',
        description: 'Number of messages to delete, 1-100',
        type: ApplicationCommandOptionType.Integer,
        minValue: 1,
        maxValue: 100,
        required: true
      }
    ];
  }

  if (command.type === 'lolquiz') {
    return [];
  }

  // ── League of Legends ───────────────────────────────────────────────────
  if (['lsd', 'lolprofile', 'lolmatch', 'lolchamp', 'lolitem', 'lolrunes', 'lolpatch', 'lollink', 'lolunlink'].includes(command.type)) {
    return buildLolSlashOptions(command.type);
  }

  // ── Teamfight Tactics ────────────────────────────────────────────────────
  if (['tftlsd', 'tftprofile', 'tftmatch', 'tftlink', 'tftunlink'].includes(command.type)) {
    return buildTftSlashOptions(command.type);
  }

  return [
    {
      name: 'args',
      description: 'Optional text arguments',
      type: ApplicationCommandOptionType.String,
      required: false
    }
  ];
}