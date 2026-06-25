import React, { useState, useEffect } from 'react';
import GuildRail from '../navigation/GuildRail.jsx';
import DomainRail from '../navigation/DomainRail.jsx';
import { useLocation } from 'react-router-dom';
import { NAVIGATION_SCHEMA } from '../navigation/navigation.config.ts';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function AppShell({
  guilds,
  selectedGuild,
  user,
  selectGuild,
  onInviteRequest,
  saveConfig,
  saveStatus,
  dirty,
  children
}) {
  const location = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
  };

  // Find active domain to apply dynamic class styling accent
  const activeDomain = NAVIGATION_SCHEMA.find(domain =>
    domain.items.some(item => location.pathname.startsWith(item.to))
  ) ?? NAVIGATION_SCHEMA[0];

  const domainClass = `domain-${activeDomain.id}`;

  return (
    <div className={`app-container ${domainClass}`}>
      <a href="#main-content" className="skip-link">{t("Bỏ qua điều hướng")}</a>
      {/* 1. Left Guild Rail */}
      <GuildRail
        guilds={guilds}
        selectedGuild={selectedGuild}
        user={user}
        selectGuild={selectGuild}
        onInviteRequest={onInviteRequest}
      />

      {/* 2. Second Domain Rail */}
      <DomainRail selectedGuild={selectedGuild} />

      {/* 3. Right workspace viewport */}
      <div className="workspace-wrapper">
        {/* Header Zone */}
        <header className="main-header" aria-label="System Telemetry">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', padding: 'var(--space-1) var(--space-2)', color: 'var(--accent)' }}>
              NODE_ID // {selectedGuild?.id ? selectedGuild.id.slice(0, 8) : 'DISCONNECTED'}
            </span>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
              SYS_REV_4.0.0
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            {/* Theme Toggle */}
            <button 
              onClick={toggleTheme}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                padding: 'var(--space-1) var(--space-2)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-2)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-1)',
                outline: 'none'
              }}
              title={t("Toggle Theme")}
            >
              {theme === 'dark' ? '🌙 DARK' : '☀️ LIGHT'}
            </button>

            {/* Language Switcher */}
            <button 
              onClick={() => setLanguage(language === 'en' ? 'vi' : 'en')}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                padding: 'var(--space-1) var(--space-2)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-2)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-1)',
                outline: 'none'
              }}
              title={t("Toggle Language")}
            >
              🌐 {language === 'en' ? 'EN' : 'VI'}
            </button>

            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-2)' }}>
              USER // {user?.username?.toUpperCase()}
            </span>
            <div style={{
              width: '8px',
              height: '8px',
              backgroundColor: 'var(--green)',
              boxShadow: '0 0 8px var(--green)'
            }} />
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="workspace-content" id="main-content" tabIndex={-1} style={{ outline: 'none' }}>
          {children}
        </main>

        {/* Global Save Telemetry Bar */}
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: 'var(--surface-0)',
          border: '1px solid var(--border-strong)',
          borderLeft: '4px solid var(--accent)',
          padding: 'var(--space-4) var(--space-6)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-6)',
          transform: dirty || saveStatus === 'saved' || saveStatus === 'error' ? 'translateY(0)' : 'translateY(150%)',
          transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 1000
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-2)' }}>
            {saveStatus === 'saving' && t('>>> COMMITTING TELEMETRY CHANGES...')}
            {saveStatus === 'saved'  && t('>>> TELEMETRY COMMITTED SUCCESSFULLY.')}
            {saveStatus === 'error'  && t('>>> ERROR COMMITTING CONFIG.')}
            {saveStatus === 'idle'   && t('>>> UNCOMMITTED TELEMETRY DETECTED.')}
          </span>
          <button
            className="btn btn--primary"
            onClick={saveConfig}
            disabled={saveStatus === 'saving'}
            style={{ padding: 'var(--space-1-5) var(--space-3)' }}
          >
            {saveStatus === 'saving' ? t('Committing...') : t('Commit Changes')}
          </button>
        </div>
      </div>
    </div>
  );
}
