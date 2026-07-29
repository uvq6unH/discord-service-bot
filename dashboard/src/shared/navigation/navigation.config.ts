export interface NavItem {
  to: string;
  label: string;
  icon: string;
}

export interface DomainConfig {
  id: string;
  label: string;
  description: string;
  accentColor: string; // Used for domain identification markers
  items: NavItem[];
}

export const NAVIGATION_SCHEMA: DomainConfig[] = [
  {
    id: "core",
    label: "CORE OPERATIONS",
    description: "Quản trị Discord Server",
    accentColor: "var(--accent-core)", // White/Slate
    items: [
      { to: "/overview", label: "OVERVIEW", icon: "Activity" },
      { to: "/members", label: "MEMBERS", icon: "Users" },
      { to: "/moderation", label: "MODERATION", icon: "Shield" },
      { to: "/commands", label: "COMMANDS", icon: "Terminal" },
      { to: "/audit-logs", label: "AUDIT LOGS", icon: "FileText" },
      { to: "/economy", label: "ECONOMY", icon: "Coins" },
      { to: "/analytics", label: "ANALYTICS", icon: "BarChart2" },
      { to: "/system", label: "SYSTEM", icon: "Server" }
    ]
  },
  {
    id: "utility",
    label: "UTILITY SERVICES",
    description: "Tiện ích máy chủ & Hẹn giờ",
    accentColor: "var(--accent-reminder)", // Blue/Cyan
    items: [
      { to: "/utilities", label: "UTILITY SERVICES", icon: "Wrench" },
      { to: "/reminders", label: "REMINDERS & ALERTS", icon: "Bell" }
    ]
  },
  {
    id: "riot",
    label: "RIOT SERVICES",
    description: "League & TFT Trackers",
    accentColor: "var(--accent-riot)", // Red
    items: [
      { to: "/riot", label: "RIOT TELEMETRY", icon: "Sword" },
      { to: "/esports", label: "ESPORTS TOURNAMENTS", icon: "Trophy" }
    ]
  },
  {
    id: "music",
    label: "AUDIO & VOICE SERVICES",
    description: "Lavalink Audio & VoiceMaster VC Engine",
    accentColor: "var(--accent-music)", // Amber
    items: [
      { to: "/music", label: "AUDIO CONSOLE", icon: "Music" },
      { to: "/voice", label: "VOICEMASTER VC ENGINE", icon: "Mic" }
    ]
  },
  {
    id: "ai",
    label: "AI SERVICES",
    description: "Neural Agent Console",
    accentColor: "var(--accent-riot)",
    items: [{ to: "/ai", label: "AI CONSOLE", icon: "Brain" }]
  }
];
