import React from 'react';
import { NavLink } from 'react-router-dom';
import { useGuild } from '../contexts/GuildContext.jsx';
import { ThemeToggle } from './ui.jsx';

const NAV_ITEMS = [
  { to: '/overview',    icon: 'ti-layout-dashboard', label: 'Dashboard' },
  { to: '/members',     icon: 'ti-users',            label: 'Thành viên' },
  { to: '/commands',    icon: 'ti-terminal-2',       label: 'Lệnh' },
  { to: '/economy',     icon: 'ti-coin',             label: 'Kinh tế' },
  { to: '/moderation',  icon: 'ti-shield-check',     label: 'Kiểm duyệt' },
  { to: '/lol',         icon: 'ti-sword',            label: 'LoL & TFT' },
  { to: '/system',      icon: 'ti-activity',         label: 'Hệ thống' },
];

export default function PluginNav({ theme, onThemeToggle }) {
  const { selectedGuild } = useGuild();
  if (!selectedGuild) return null;

  return (
    <nav className="plugin-nav">
      {/* Server header */}
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

      {NAV_ITEMS.map(({ to, icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <i className={`ti ${icon}`} />
          <span>{label}</span>
        </NavLink>
      ))}

      {/* Theme toggle — cuối nav, tự đẩy xuống bottom bằng margin-top: auto */}
      <div style={{ marginTop: 'auto', paddingTop: 'var(--s3)' }}>
        <ThemeToggle theme={theme} onToggle={onThemeToggle} />
      </div>
    </nav>
  );
}
