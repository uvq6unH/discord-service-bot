import React from 'react';
import { useGuild } from '../hooks/useGuild.js';
import { NavLink } from 'react-router-dom';
import { Bot, Network } from 'lucide-react';

function ScreenLoader({ message, sub }) {
  return (
    <div style={{
      height: 'calc(100vh - 56px)', // subtract header
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-2)',
      fontFamily: 'var(--font-mono)',
      fontSize: '12px',
      gap: 'var(--space-4)',
      backgroundColor: 'var(--bg)'
    }}>
      <div className="loader-spin" style={{
        width: '32px',
        height: '32px',
        border: '2px solid var(--border)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%'
      }} />
      <span style={{ letterSpacing: '2px', color: 'var(--accent)' }}>
        &gt;&gt;&gt; {message.toUpperCase()}
      </span>
      {sub && <span style={{ color: 'var(--text-3)', fontSize: '10px' }}>{sub.toUpperCase()}</span>}
    </div>
  );
}

export default function GuildGuard({ children }) {
  const { selectedGuild, appReady, syncing } = useGuild();

  if (!appReady) {
    return <ScreenLoader message="Syncing Console State" sub="Resolving active guild coordinates..." />;
  }

  if (syncing) {
    return <ScreenLoader message="Syncing Server List" sub="Fetching latest server configurations..." />;
  }

  if (!selectedGuild) {
    return (
      <div style={{
        height: 'calc(100vh - 56px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-10)',
        backgroundColor: 'var(--bg)',
        fontFamily: 'var(--font-mono)',
        textAlign: 'center'
      }}>
        <div style={{
          padding: 'var(--space-6)',
          border: '1px solid var(--border-strong)',
          backgroundColor: 'var(--surface-0)',
          maxWidth: '480px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-6)'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent)'
          }}>
            <Bot size={24} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <h2 style={{ fontSize: '14px', color: 'var(--text-1)', fontWeight: 'bold', margin: 0 }}>
              MISSION CONTROL // SELECT SERVER
            </h2>
            <p style={{ fontSize: '11px', color: 'var(--text-3)', lineHeight: 1.6, margin: 0 }}>
              Vui lòng chọn một máy chủ Discord từ danh sách bên trái để bắt đầu cấu hình bot và theo dõi dữ liệu telemetry.
            </p>
          </div>
          <div style={{
            width: '100%',
            padding: 'var(--space-3)',
            border: '1px dashed var(--border)',
            fontSize: '10px',
            color: 'var(--text-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-2)'
          }}>
            <Network size={12} />
            <span>STATUS // WAITING_FOR_OPERATOR_INPUT</span>
          </div>
          
          {/* Public legal links */}
          <div style={{
            display: 'flex',
            gap: 'var(--space-4)',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            marginTop: 'var(--space-2)'
          }}>
            <NavLink to="/terms" style={{ color: 'var(--text-3)', textDecoration: 'underline' }} className="hover-accent">
              TERMS OF SERVICE
            </NavLink>
            <span style={{ color: 'var(--border)' }}>|</span>
            <NavLink to="/privacy" style={{ color: 'var(--text-3)', textDecoration: 'underline' }} className="hover-accent">
              PRIVACY POLICY
            </NavLink>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
