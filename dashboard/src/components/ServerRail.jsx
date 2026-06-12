import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Robot, RobotOff, Plus, SignOut, ArrowSquareOut } from '@phosphor-icons/react';
import { useGuild } from '../contexts/GuildContext.jsx';
import { RoleBadge } from './ui.jsx';
import { api } from '../api.js';

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
    <AnimatePresence>
      {guild && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="modal"
            initial={{ scale: 0.95, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal__icon"><RobotOff size={24} /></div>
            <h3>Bot chua o trong server nay</h3>
            <p>
              <strong style={{ color: 'var(--text-1)' }}>{guild.name}</strong> chua co bot.
              Moi bot vao server de su dung dashboard va cac tinh nang.
            </p>
            <div className="modal__actions">
              <button className="btn btn-ghost btn-sm" onClick={onClose}>Huy</button>
              <button className="btn btn-primary btn-sm" onClick={handleInvite} disabled={loading}>
                <ArrowSquareOut size={14} />
                {loading ? 'Dang mo...' : 'Moi Bot'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function GuildIcon({ guild, onInviteRequest }) {
  const { selectedGuild, selectGuild } = useGuild();
  const isSelected = selectedGuild?.id === guild.id;
  const notPresent = !guild.botPresent;

  function handleClick() {
    if (notPresent) onInviteRequest(guild);
    else selectGuild(guild);
  }

  return (
    <button
      className={[
        'guild-btn',
        isSelected ? 'guild-btn--active' : '',
        notPresent ? 'guild-btn--invite' : '',
      ].filter(Boolean).join(' ')}
      onClick={handleClick}
      title={notPresent ? `${guild.name} - Moi bot vao server` : guild.name}
    >
      {guild.icon ? (
        <img
          src={guild.icon} alt={guild.name} className="guild-icon"
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
        <span className="guild-badge guild-badge--invite"><Plus size={10} /></span>
      )}
    </button>
  );
}

export default function ServerRail({ guilds, loading, user }) {
  const [inviteTarget, setInviteTarget] = useState(null);

  const present    = guilds.filter(g => g.botPresent);
  const notPresent = guilds.filter(g => !g.botPresent);

  return (
    <>
      <nav className="server-rail">
        <div className="rail-top">
          <div className="rail-logo" title="Bot Dashboard">
            <Robot size={20} />
          </div>
          <div className="rail-divider" />

          <div className="server-list">
            {loading ? (
              [1, 2, 3].map(i => <div key={i} className="server-skeleton" />)
            ) : (
              <>
                {present.map(g => (
                  <GuildIcon key={g.id} guild={g} onInviteRequest={setInviteTarget} />
                ))}
                {notPresent.length > 0 && (
                  <>
                    {present.length > 0 && <div className="rail-divider" style={{ margin: '6px auto' }} />}
                    {notPresent.map(g => (
                      <GuildIcon key={g.id} guild={g} onInviteRequest={setInviteTarget} />
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
                background: 'var(--surface-3)', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: 'var(--text-3)',
              }}>
                {user?.username?.slice(0, 1)?.toUpperCase() ?? '?'}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="user-name-sm">{user?.username}</span>
              {user?.role && (
                <div style={{ marginTop: 2 }}>
                  <RoleBadge role={user.role} />
                </div>
              )}
            </div>
            <a href="/auth/logout" className="logout-icon" title="Dang xuat">
              <SignOut size={14} />
            </a>
          </div>
        </div>
      </nav>

      <InviteModal guild={inviteTarget} onClose={() => setInviteTarget(null)} />
    </>
  );
}
