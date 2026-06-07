import React from 'react';
import { NavLink } from 'react-router-dom';
import { useGuild } from '../contexts/GuildContext.jsx';

const NAV_ITEMS = [
  { to: '/overview',   icon: 'ti-layout-dashboard', label: 'Dashboard' },
  { to: '/members',    icon: 'ti-users',             label: 'Thành viên' },
  { to: '/commands',   icon: 'ti-terminal-2',        label: 'Lệnh & Custom' },
  { to: '/economy',    icon: 'ti-coin',              label: 'Tiền ảo' },
  { to: '/moderation', icon: 'ti-shield-check',      label: 'Kiểm duyệt' },
  { to: '/lol',        icon: 'ti-sword',             label: 'LoL & TFT' },
];

export default function PluginNav() {
  const { selectedGuild } = useGuild();
  if (!selectedGuild) return null;

  return (
    <nav className="plugin-nav">
      <div className="plugin-nav-header">
        {selectedGuild.icon && (
          <img
            src={`https://cdn.discordapp.com/icons/${selectedGuild.id}/${selectedGuild.icon}.png?size=32`}
            alt=""
            className="plugin-nav-icon"
          />
        )}
        <span className="plugin-nav-guild">{selectedGuild.name}</span>
      </div>
      <ul className="nav-list">
        {NAV_ITEMS.map(({ to, icon, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
            >
              <i className={`ti ${icon}`} />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
