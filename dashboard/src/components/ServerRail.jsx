import React, { useState } from 'react';
import { useGuild } from '../contexts/GuildContext.jsx';
import { api } from '../api.js';

/* ── Invite modal khi bot chưa trong server ─────────────────────────────── */
function InviteModal({ guild, onClose }) {
  const [loading, setLoading] = useState(false);

  async function handleInvite() {
    setLoading(true);
    try {
      const { url } = await api.inviteUrl(guild.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      const clientId = window.__BOT_CLIENT_ID__ ?? '';
      const url = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=8&guild_id=${guild.id}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setLoading(false);
      onClose();
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal__icon">
          <i className="ti ti-robot-off" />
        </div>
        <h3>Bot chưa ở trong server này</h3>
        <p>
          <strong style={{ color: 'var(--text-1)' }}>{guild.name}</strong> chưa có bot.
          Mời bot vào server để sử dụng dashboard và các tính năng.
        </p>
        <div className="modal__actions">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Hủy</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleInvite}
            disabled={loading}
          >
            <i className="ti ti-external-link" />
            {loading ? 'Đang mở…' : 'Mời Bot'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Guild icon button ───────────────────────────────────────────────────── */
function GuildIcon({ guild, onInviteRequest }) {
  const { selectedGuild, selectGuild } = useGuild();
  const isSelected = selectedGuild?.id === guild.id;
  const notPresent = !guild.botPresent;

  function handleClick() {
    if (notPresent) {
      onInviteRequest(guild);   // show modal, không block dashboard
    } else {
      selectGuild(guild);
    }
  }

  return (
    <button
      className={[
        'guild-btn',
        isSelected    ? 'guild-btn--active' : '',
        notPresent    ? 'guild-btn--invite' : '',
      ].filter(Boolean).join(' ')}
      onClick={handleClick}
      title={notPresent ? `${guild.name} — Mời bot vào server` : guild.name}
    >
      {guild.icon ? (
        <img
          src={guild.icon}
          alt={guild.name}
          className="guild-icon"
          onError={e => {
            e.currentTarget.style.display = 'none';
            const sib = e.currentTarget.nextElementSibling;
            if (sib) sib.style.display = 'flex';
          }}
        />
      ) : null}
      <span
        className="guild-icon guild-icon--text"
        style={{ display: guild.icon ? 'none' : 'flex' }}
      >
        {guild.name.slice(0, 2).toUpperCase()}
      </span>
      {notPresent && (
        <span className="guild-badge guild-badge--invite">
          <i className="ti ti-plus" />
        </span>
      )}
    </button>
  );
}

/* ── Server Rail ─────────────────────────────────────────────────────────── */
export default function ServerRail({ guilds, loading, user }) {
  const [inviteTarget, setInviteTarget] = useState(null);

  const present    = guilds.filter(g => g.botPresent);
  const notPresent = guilds.filter(g => !g.botPresent);

  return (
    <>
      <nav className="server-rail">
        <div className="rail-top">
          <div className="rail-logo" title="Bot Dashboard">
            <i className="ti ti-robot" />
          </div>
          <div className="rail-divider" />

          <div className="server-list">
            {loading ? (
              [1, 2, 3].map(i => <div key={i} className="server-skeleton" />)
            ) : (
              <>
                {present.map(g => (
                  <GuildIcon
                    key={g.id}
                    guild={g}
                    onInviteRequest={setInviteTarget}
                  />
                ))}

                {notPresent.length > 0 && (
                  <>
                    {present.length > 0 && <div className="rail-divider" style={{ margin: '6px auto' }} />}
                    {notPresent.map(g => (
                      <GuildIcon
                        key={g.id}
                        guild={g}
                        onInviteRequest={setInviteTarget}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="rail-bottom">
          <div className="user-pill">
            {user?.avatar ? (
              <img
                src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`}
                alt=""
                className="user-avatar-sm"
              />
            ) : (
              <div className="user-avatar-sm" style={{
                background: 'var(--surface-3)',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: 'var(--text-3)',
              }}>
                {user?.username?.slice(0, 1)?.toUpperCase() ?? '?'}
              </div>
            )}
            <span className="user-name-sm">{user?.username}</span>
            <a href="/auth/logout" className="logout-icon" title="Đăng xuất">
              <i className="ti ti-logout" style={{ fontSize: 14 }} />
            </a>
          </div>
        </div>
      </nav>

      {inviteTarget && (
        <InviteModal
          guild={inviteTarget}
          onClose={() => setInviteTarget(null)}
        />
      )}
    </>
  );
}
