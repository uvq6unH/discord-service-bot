import React from 'react';
import { useGuild } from '../contexts/GuildContext.jsx';

function GuildIcon({ guild }) {
  const { selectedGuild, selectGuild } = useGuild();
  const isSelected = selectedGuild?.id === guild.id;
  const notPresent = !guild.botPresent;

  return (
    <button
      className={`guild-btn${isSelected ? ' guild-btn--active' : ''}${notPresent ? ' guild-btn--invite' : ''}`}
      onClick={() => selectGuild(guild)}
      title={notPresent ? `${guild.name} — Nhấn để mời bot vào server` : guild.name}
    >
      {guild.icon
        ? <img
            src={guild.icon}
            alt={guild.name}
            className="guild-icon"
            onError={e => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextSibling && (e.currentTarget.nextSibling.style.display = 'flex');
            }}
          />
        : null}
      <span
        className="guild-icon guild-icon--text"
        style={{ display: guild.icon ? 'none' : 'flex' }}
      >
        {guild.name.slice(0, 2).toUpperCase()}
      </span>
      {notPresent && (
        <span className="guild-badge guild-badge--invite" title="Mời bot vào server này">
          <i className="ti ti-plus" />
        </span>
      )}
    </button>
  );
}

export default function ServerRail({ guilds, loading, user }) {
  // Tách guilds thành 2 nhóm: bot đã có mặt | chưa invite
  const present = guilds.filter(g => g.botPresent);
  const notPresent = guilds.filter(g => !g.botPresent);

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
            : (
              <>
                {present.map(g => <GuildIcon key={g.id} guild={g} />)}
                {notPresent.length > 0 && present.length > 0 && (
                  <div className="rail-section-divider" title="Servers chưa có bot" />
                )}
                {notPresent.map(g => <GuildIcon key={g.id} guild={g} />)}
              </>
            )
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
