/**
 * shared/layouts/domains.js — Domain Navigation Configuration
 * Community Operations Platform
 *
 * Tuân thủ MIGRATION.md:
 * - Core Operations: quản trị Discord server
 * - Riot Services: domain độc lập
 * - Music Services: domain độc lập
 * - Reminder Services: domain độc lập
 */

// Lucide icons
import {
  LayoutDashboard,
  Users,
  Terminal,
  Coins,
  ShieldCheck,
  BarChart2,
  Activity,
  Sword,
  Music,
  Bell,
} from 'lucide-react';

export const DOMAINS = [
  {
    id: 'core',
    label: 'Core Operations',
    description: 'Quản trị Discord Server',
    pages: [
      { to: '/overview',    Icon: LayoutDashboard, label: 'Overview'     },
      { to: '/members',     Icon: Users,           label: 'Members'      },
      { to: '/moderation',  Icon: ShieldCheck,     label: 'Moderation'   },
      { to: '/commands',    Icon: Terminal,        label: 'Commands'     },
      { to: '/economy',     Icon: Coins,           label: 'Economy'      },
      { to: '/analytics',   Icon: BarChart2,       label: 'Analytics'    },
      { to: '/system',      Icon: Activity,        label: 'System'       },
    ],
  },
  {
    id: 'riot',
    label: 'Riot Services',
    description: 'TFT · League · Match Tracking',
    pages: [
      { to: '/riot', Icon: Sword, label: 'Riot Services' },
    ],
  },
  {
    id: 'music',
    label: 'Music Services',
    description: 'Lavalink · Queues · Playback',
    pages: [
      { to: '/music', Icon: Music, label: 'Music Services' },
    ],
  },
  {
    id: 'reminder',
    label: 'Reminder Services',
    description: 'Jobs · Reminders · Events',
    pages: [
      { to: '/reminders', Icon: Bell, label: 'Reminders' },
    ],
  },
];

/** Flatten all pages for route matching */
export const ALL_PAGES = DOMAINS.flatMap(d => d.pages.map(p => ({ ...p, domainId: d.id })));

/** Find domain by current path */
export function getDomainByPath(pathname) {
  const page = ALL_PAGES.find(p => pathname.startsWith(p.to));
  return page ? DOMAINS.find(d => d.id === page.domainId) : DOMAINS[0];
}
