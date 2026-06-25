import React, { useState, useEffect } from 'react';
import GuildRail from '../navigation/GuildRail.jsx';
import DomainRail from '../navigation/DomainRail.jsx';
import { useLocation } from 'react-router-dom';
import { NAVIGATION_SCHEMA } from '../navigation/navigation.config.ts';
import { useLanguage } from '../context/LanguageContext.jsx';
import { Menu, X } from 'lucide-react';

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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Close sidebar drawer automatically when switching pages on mobile
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

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
    <div className={`app-container ${domainClass} ${menuOpen ? 'menu-open' : ''}`}>
      <a href="#main-content" className="skip-link">{t("Bỏ qua điều hướng")}</a>
      
      {/* Backdrop overlay for mobile drawer */}
      {menuOpen && (
        <div
          className="mobile-backdrop"
          onClick={() => setMenuOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(3px)',
            zIndex: 90
          }}
        />
      )}

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
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="mobile-menu-toggle"
              style={{
                display: 'none',
                background: 'none',
                border: '1px solid var(--border)',
                padding: 'var(--space-1) var(--space-2)',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-2)',
                outline: 'none',
              }}
              title={menuOpen ? t("Close Menu") : t("Open Menu")}
            >
              {menuOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
            <span className="header-node-id" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', padding: 'var(--space-1) var(--space-2)', color: 'var(--accent)' }}>
              NODE_ID // {selectedGuild?.id ? selectedGuild.id.slice(0, 8) : 'DISCONNECTED'}
            </span>
            <span className="header-sys-rev" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
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

            <span className="header-user-tag" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-2)' }}>
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
        <div className="save-telemetry-bar" style={{
          transform: dirty || saveStatus === 'saved' || saveStatus === 'error' ? 'translateY(0)' : 'translateY(150%)',
          transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
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
