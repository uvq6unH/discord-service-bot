import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  LayoutDashboard, Users, Terminal, Coins,
  ShieldCheck, Sword, Activity, BarChart2,
} from 'lucide-react';
import { useGuild } from '../contexts/GuildContext.jsx';
import { ThemePicker } from './ui.jsx';

const NAV_ITEMS = [
  { to: '/overview',   Icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/members',    Icon: Users,           label: 'Thành viên' },
  { to: '/commands',   Icon: Terminal,        label: 'Lệnh' },
  { to: '/economy',    Icon: Coins,           label: 'Kinh tế' },
  { to: '/moderation', Icon: ShieldCheck,     label: 'Kiểm duyệt' },
  { to: '/lol',        Icon: Sword,           label: 'LoL & TFT' },
  { to: '/analytics',  Icon: BarChart2,       label: 'Analytics' },
  { to: '/system',     Icon: Activity,        label: 'Hệ thống' },
];

export default function PluginNav() {
  const { selectedGuild } = useGuild();
  if (!selectedGuild) return null;

  return (
    <nav className="plugin-nav">
      <div className="nav-guild-header">
        {selectedGuild.icon ? (
          <img
            src={selectedGuild.icon}
            alt=""
            className="nav-guild-icon"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="nav-guild-icon--text">
            {selectedGuild.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <span className="nav-guild-name">{selectedGuild.name}</span>
      </div>

      <div className="nav-section-label">Menu</div>

      {NAV_ITEMS.map(({ to, Icon, label }, index) => (
        <motion.div
          key={to}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.035, duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <NavLink
            to={to}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <Icon size={15} strokeWidth={1.75} />
            <span>{label}</span>
          </NavLink>
        </motion.div>
      ))}

      {/* Theme picker — bottom of nav */}
      <ThemePicker />
    </nav>
  );
}
