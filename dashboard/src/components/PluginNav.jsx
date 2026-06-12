import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  SquaresFour, Users, Terminal, Coins,
  Shield, Sword, Activity, ChartBar,
} from '@phosphor-icons/react';
import { useGuild } from '../contexts/GuildContext.jsx';

const NAV_ITEMS = [
  { to: '/overview',   Icon: SquaresFour, label: 'Dashboard' },
  { to: '/members',    Icon: Users,       label: 'Thanh vien' },
  { to: '/commands',   Icon: Terminal,    label: 'Lenh' },
  { to: '/economy',    Icon: Coins,       label: 'Kinh te' },
  { to: '/moderation', Icon: Shield,      label: 'Kiem duyet' },
  { to: '/lol',        Icon: Sword,       label: 'LoL & TFT' },
  { to: '/analytics',  Icon: ChartBar,    label: 'Analytics' },
  { to: '/system',     Icon: Activity,    label: 'He thong' },
];

export default function PluginNav() {
  const { selectedGuild } = useGuild();
  if (!selectedGuild) return null;

  return (
    <nav className="plugin-nav">
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--s2)',
        padding: 'var(--s2) var(--s3) var(--s4)',
        marginBottom: 'var(--s1)',
      }}>
        {selectedGuild.icon ? (
          <img
            src={selectedGuild.icon}
            alt=""
            style={{ width: 24, height: 24, borderRadius: 'var(--r2)', flexShrink: 0 }}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div style={{
            width: 24, height: 24, borderRadius: 'var(--r2)', flexShrink: 0,
            background: 'var(--surface-3)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: 'var(--text-3)',
          }}>
            {selectedGuild.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <span style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-1)',
          letterSpacing: '-.02em', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {selectedGuild.name}
        </span>
      </div>

      <div className="nav-section-label">Menu</div>

      {NAV_ITEMS.map(({ to, Icon, label }, index) => (
        <motion.div
          key={to}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.04, duration: 0.2 }}
        >
          <NavLink
            to={to}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <Icon size={16} weight="regular" />
            <span>{label}</span>
          </NavLink>
        </motion.div>
      ))}
    </nav>
  );
}
