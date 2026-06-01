export const defaultConfig = {
  enabled: true,
  prefix: '!',
  commands: [
    {
      enabled: true,
      type: 'ping',
      name: 'ping',
      description: 'Check bot latency',
      response: 'Pong. {ping}ms'
    },
    {
      enabled: true,
      type: 'help',
      name: 'help',
      description: 'Show command list',
      response: 'Commands:\n{commands}'
    },
    {
      enabled: true,
      type: 'config',
      name: 'config',
      description: 'Show current server config',
      response: 'Prefix: {prefix}\nWelcome: {welcomeStatus}\nAuto reply: {autoReplyStatus}\nCommands: {commandCount}\nRiot API: {riotKeyStatus}\nTFT API: {tftKeyStatus}'
    },
    {
      enabled: true,
      type: 'server',
      name: 'server',
      description: 'Show server info',
      response: 'Server info'
    },
    {
      enabled: true,
      type: 'user',
      name: 'user',
      description: 'Show user info',
      response: 'User info'
    },
    {
      enabled: true,
      type: 'avatar',
      name: 'avatar',
      description: 'Show user avatar',
      response: 'Avatar'
    },
    {
      enabled: true,
      type: 'say',
      name: 'say',
      description: 'Make the bot send a message',
      response: '{args}'
    },
    {
      enabled: true,
      type: 'purge',
      name: 'purge',
      description: 'Delete recent messages',
      response: 'Deleted {count} messages.'
    },
    {
      enabled: true,
      type: 'warn',
      name: 'warn',
      description: 'Warn a user',
      response: 'Warned {target}. Reason: {reason}'
    },
    {
      enabled: true,
      type: 'kick',
      name: 'kick',
      description: 'Kick a user',
      response: 'Kicked {target}. Reason: {reason}'
    },
    {
      enabled: true,
      type: 'ban',
      name: 'ban',
      description: 'Ban a user',
      response: 'Banned {target}. Reason: {reason}'
    },
    {
      enabled: true,
      type: 'timeout',
      name: 'timeout',
      description: 'Timeout a user in minutes',
      response: 'Timed out {target} for {minutes} minutes. Reason: {reason}'
    },
    {
      enabled: true,
      type: 'warnings',
      name: 'warnings',
      description: 'Show warnings for a user',
      response: 'Warnings for {target}: {count}'
    },
    {
      enabled: true,
      type: 'clearwarns',
      name: 'clearwarns',
      description: 'Clear warnings for a user',
      response: 'Cleared {count} warnings for {target}.'
    },
    {
      enabled: true,
      type: 'rank',
      name: 'rank',
      description: 'Show your XP rank',
      response: 'Rank'
    },
    {
      enabled: true,
      type: 'leaderboard',
      name: 'leaderboard',
      description: 'Show XP leaderboard',
      response: 'Leaderboard'
    },
    {
      enabled: true,
      type: 'balance',
      name: 'balance',
      description: 'Show economy balance',
      response: 'Balance'
    },
    {
      enabled: true,
      type: 'daily',
      name: 'daily',
      description: 'Claim daily rewards',
      response: 'Daily claimed'
    },
    {
      enabled: true,
      type: 'economyleaderboard',
      name: 'economy-leaderboard',
      description: 'Show economy leaderboard',
      response: 'Economy leaderboard'
    },
    {
      enabled: true,
      type: 'blackjack',
      name: 'blackjack',
      description: 'Play turn-based blackjack with buttons',
      response: 'Blackjack'
    },
    {
      enabled: true,
      type: 'poker',
      name: 'poker',
      description: 'Play Jacks or Better video poker',
      response: 'Poker'
    },
    {
      enabled: true,
      type: 'coinflip',
      name: 'coinflip',
      description: 'Flip a coin with a bet',
      response: 'Coinflip'
    },
    {
      enabled: true,
      type: 'dice',
      name: 'dice',
      description: 'Guess a dice roll with a bet',
      response: 'Dice'
    },
    {
      enabled: true,
      type: 'slots',
      name: 'slots',
      description: 'Spin slots with a bet',
      response: 'Slots'
    },
    {
      enabled: true,
      type: 'ecoadd',
      name: 'eco-add',
      description: 'Admin: add currency to a user',
      response: 'Added {amount} {currency} to {target}.'
    },
    {
      enabled: true,
      type: 'ecoset',
      name: 'eco-set',
      description: 'Admin: set a user currency balance',
      response: 'Set {target} to {amount} {currency}.'
    },
    {
      enabled: true,
      type: 'ecoremove',
      name: 'eco-remove',
      description: 'Admin: remove currency from a user',
      response: 'Removed {amount} {currency} from {target}.'
    },
    {
      enabled: true,
      type: 'announce',
      name: 'announce',
      description: 'Send an announcement',
      response: '{args}'
    },
    {
      enabled: true,
      type: 'ticketpanel',
      name: 'ticketpanel',
      description: 'Post a ticket panel',
      response: 'Need help? Open a ticket.'
    },
    {
      enabled: true,
      type: 'rolepanel',
      name: 'rolepanel',
      description: 'Post a self-role panel',
      response: 'Choose your roles.'
    },
    // ── League of Legends ───────────────────────────────────────────────────
    { enabled: true, type: 'lsd', name: 'lsd', description: 'Lịch sử 5 trận đấu gần nhất' },
    { enabled: true, type: 'lolprofile', name: 'lol', description: 'Hồ sơ người chơi LoL (rank, mastery)' },
    { enabled: true, type: 'lolmatch', name: 'lolmatch', description: 'Chi tiết một trận đấu cụ thể' },
    { enabled: true, type: 'lolchamp', name: 'lolchamp', description: 'Thông tin tướng LoL' },
    { enabled: true, type: 'lolitem', name: 'lolitem', description: 'Thông tin trang bị LoL' },
    { enabled: true, type: 'lolrunes', name: 'lolrunes', description: 'Bảng ngọc LoL' },
    { enabled: true, type: 'lolpatch', name: 'lolpatch', description: 'Phiên bản LoL mới nhất' },
    { enabled: true, type: 'lollink', name: 'lollink', description: 'Liên kết tài khoản LoL với Discord' },
    { enabled: true, type: 'lolunlink', name: 'lolunlink', description: 'Bỏ liên kết tài khoản LoL' },
    // ── Teamfight Tactics ────────────────────────────────────────────────────
    { enabled: true, type: 'tftlsd', name: 'tftlsd', description: 'Lịch sử 5 trận TFT gần nhất (hạng, bài, con, đồ)' },
    { enabled: true, type: 'tftprofile', name: 'tft', description: 'Hồ sơ TFT (rank, avg placement, traits)' },
    { enabled: true, type: 'tftmatch', name: 'tftmatch', description: 'Chi tiết trận TFT (bài chơi, con, đồ, augment)' },
    { enabled: true, type: 'tftlink', name: 'tftlink', description: 'Liên kết tài khoản TFT với Discord' },
    { enabled: true, type: 'tftunlink', name: 'tftunlink', description: 'Bỏ liên kết tài khoản TFT' }
  ],
  moderationEnabled: true,
  autoModEnabled: false,
  deleteBlockedMessages: true,
  antiLinkEnabled: false,
  badWords: [],
  blockedMessage: '{user}, message blocked.',
  rolesEnabled: false,
  autoRoleId: '',
  selfRolePanelTitle: 'Choose roles',
  selfRolePanelMessage: 'Click a button to toggle a role.',
  selfRoles: [],
  ticketsEnabled: false,
  ticketCategoryId: '',
  ticketLogChannelId: '',
  ticketPanelTitle: 'Support tickets',
  ticketPanelMessage: 'Need help? Open a ticket and the team will respond.',
  levelsEnabled: false,
  xpPerMessage: 5,
  levelUpMessage: '{user} reached level {level}.',
  economyEnabled: false,
  currencySilverName: 'Bạc',
  currencySilverIcon: '🥈',
  currencyGoldName: 'Vàng',
  currencyGoldIcon: '🪙',
  currencyDiamondName: 'Kim cương',
  currencyDiamondIcon: '💎',
  dailyEnabled: true,
  dailyCooldownHours: 24,
  dailyResetUtcOffset: 420,
  riotApiKey: '',
  tftApiKey: '',
  dailySilverAmount: 100,
  dailyGoldAmount: 5,
  dailyDiamondAmount: 0,
  blackjackEnabled: true,
  blackjackMinBet: 10,
  blackjackMaxBet: 1000,
  pokerEnabled: true,
  pokerMinBet: 10,
  pokerMaxBet: 1000,
  coinflipEnabled: true,
  coinflipMinBet: 10,
  coinflipMaxBet: 1000,
  diceEnabled: true,
  diceMinBet: 10,
  diceMaxBet: 1000,
  slotsEnabled: true,
  slotsMinBet: 10,
  slotsMaxBet: 1000,
  announcementsEnabled: false,
  announcementChannelId: '',
  announcementMention: '',
  welcomeEnabled: false,
  welcomeChannelId: '',
  welcomeMessage: 'Welcome {user} to {server}.',
  logChannelId: '',
  autoReplyEnabled: false,
  autoReplies: [
    {
      keyword: 'hello bot',
      response: 'Hello. Bot is online.'
    }
  ]
};

export const COMMAND_TYPES = new Set([
  'custom',
  'ping',
  'help',
  'config',
  'server',
  'user',
  'avatar',
  'say',
  'purge',
  'warn',
  'kick',
  'ban',
  'timeout',
  'warnings',
  'clearwarns',
  'rank',
  'leaderboard',
  'balance',
  'daily',
  'economyleaderboard',
  'blackjack',
  'poker',
  'coinflip',
  'dice',
  'slots',
  'ecoadd',
  'ecoset',
  'ecoremove',
  'announce',
  'ticketpanel',
  'rolepanel',
  // ── League of Legends ──────────────────────────────────────────────────────
  'lsd',
  'lolprofile',
  'lolmatch',
  'lolchamp',
  'lolitem',
  'lolrunes',
  'lolpatch',
  'lollink',
  'lolunlink',
  // ── Teamfight Tactics ──────────────────────────────────────────────────────
  'tftlsd',
  'tftprofile',
  'tftmatch',
  'tftlink',
  'tftunlink'
]);
export const builtInTypesByName = new Map(
  defaultConfig.commands.filter((command) => command.type !== 'custom').map((command) => [command.name, command.type])
);