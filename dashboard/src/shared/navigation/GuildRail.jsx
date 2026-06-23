import React from 'react';
import { Bot, LogOut, Plus } from 'lucide-react';

export default function GuildRail({ guilds, selectedGuild, user, selectGuild, onInviteRequest }) {
  const present = guilds.filter(g => g.botPresent);
  const notPresent = guilds.filter(g => !g.botPresent);

  const handleLogout = () => {
    window.location.href = '/auth/logout';
  };

  return (
    <nav className="guild-rail" aria-label="Servers">
      {/* Top Logo */}
      <div 
        style={{ color: 'var(--text-1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40px', width: '40px', border: '1px solid var(--border)' }}
        title="Mission Control Console"
      >
        <Bot size={20} />
      </div>

      <div style={{ width: '24px', height: '1px', backgroundColor: 'var(--border)', margin: 'var(--space-1) 0' }} />

      {/* Guild Switcher List */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: '100%', alignItems: 'center' }}>
        {/* Present servers */}
        {present.map(guild => {
          const isActive = selectedGuild?.id === guild.id;
          return (
            <button
              key={guild.id}
              onClick={() => selectGuild(guild)}
              style={{
                width: '40px',
                height: '40px',
                border: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: 'var(--surface-0)',
                color: 'var(--text-1)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: '14px',
                fontWeight: 'bold',
                position: 'relative'
              }}
              title={guild.name}
            >
              {guild.icon ? (
                <img 
                  src={guild.icon} 
                  alt="" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : null}
              <span>{guild.name.slice(0, 2).toUpperCase()}</span>
            </button>
          );
        })}

        {notPresent.length > 0 && (
          <>
            <div style={{ width: '20px', height: '1px', backgroundColor: 'var(--border)', margin: 'var(--space-1) 0' }} />
            {/* Inviteable servers */}
            {notPresent.map(guild => (
              <button
                key={guild.id}
                onClick={() => onInviteRequest(guild)}
                style={{
                  width: '40px',
                  height: '40px',
                  border: '1px dashed var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text-3)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  position: 'relative'
                }}
                title={`${guild.name} (Chưa cài bot)`}
              >
                {guild.icon ? (
                  <img 
                    src={guild.icon} 
                    alt="" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4 }}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : null}
                <span>{guild.name.slice(0, 2).toUpperCase()}</span>
                <span style={{ position: 'absolute', right: '-2px', bottom: '-2px', background: 'var(--surface-3)', border: '1px solid var(--border)', width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'var(--text-1)' }}>
                  <Plus size={8} />
                </span>
              </button>
            ))}
          </>
        )}
      </div>

      {/* Bottom Profile and Logout */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', width: '100%' }}>
        {user?.avatar && (
          <img
            src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`}
            alt=""
            style={{ width: '32px', height: '32px', border: '1px solid var(--border)' }}
            title={`${user.username}`}
          />
        )}
        <button
          onClick={handleLogout}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-3)',
            cursor: 'pointer',
            padding: 'var(--space-1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Đăng xuất"
          aria-label="Logout"
        >
          <LogOut size={16} />
        </button>
      </div>
    </nav>
  );
}
