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
      { to: "/economy", label: "ECONOMY", icon: "Coins" },
      { to: "/analytics", label: "ANALYTICS", icon: "BarChart2" },
      { to: "/system", label: "SYSTEM", icon: "Server" }
    ]
  },
  {
    id: "riot",
    label: "RIOT SERVICES",
    description: "League & TFT Trackers",
    accentColor: "var(--accent-riot)", // Red
    items: [{ to: "/riot", label: "RIOT TELEMETRY", icon: "Sword" }]
  },
  {
    id: "music",
    label: "MUSIC SERVICES",
    description: "Lavalink Node Console",
    accentColor: "var(--accent-music)", // Amber
    items: [{ to: "/music", label: "AUDIO CONSOLE", icon: "Music" }]
  },
  {
    id: "reminder",
    label: "REMINDER SERVICES",
    description: "Scheduled Jobs & Tasks",
    accentColor: "var(--accent-reminder)", // Blue
    items: [{ to: "/reminders", label: "REMINDERS", icon: "Bell" }]
  },
  {
    id: "ai",
    label: "AI SERVICES",
    description: "Neural Agent Console",
    accentColor: "var(--accent-riot)",
    items: [{ to: "/ai", label: "AI CONSOLE", icon: "Brain" }]
  }
];
