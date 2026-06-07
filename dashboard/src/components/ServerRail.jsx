import React from 'react';
import { useGuild } from '../contexts/GuildContext.jsx';

function GuildIcon({ guild }) {
  const { selectedGuild, selectGuild } = useGuild();
  const isSelected = selectedGuild?.id === guild.id;

  return (
    <button
      className={`guild-btn${isSelected ? ' guild-btn--active' : ''}`}
      onClick={() => selectGuild(guild)}
      title={guild.name}
    >
      {guild.icon
        ? <img
            src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=48`}
            alt={guild.name}
            className="guild-icon"
          />
        : <span className="guild-icon guild-icon--text">
            {guild.name.slice(0, 2).toUpperCase()}
          </span>
      }
      {!guild.botPresent && (
        <span className="guild-badge" title="Bot chưa trong server">+</span>
      )}
    </button>
  );
}

export default function ServerRail({ guilds, loading, user }) {
  return (
    <nav className="server-rail">
      <div className="rail-top">
        <div className="rail-logo" title="Bot Dashboard">
          <i className="ti ti-robot" />
        </div>
        <div className="rail-divider" />
        <div className="server-list">
          {loading
            ? [1, 2, 3].map(i => <div key={i} className="server-skeleton" />)
            : guilds.map(g => <GuildIcon key={g.id} guild={g} />)
          }
        </div>
      </div>

      <div className="rail-bottom">
        <div className="user-pill">
          {user?.avatar && (
            <img
              src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`}
              alt=""
              className="user-avatar-sm"
            />
          )}
          <span className="user-name-sm">{user?.username}</span>
          <a href="/auth/logout" className="logout-icon" title="Đăng xuất">
            <i className="ti ti-logout" />
          </a>
        </div>
      </div>
    </nav>
  );
}
