import React from 'react';
import { Bot } from 'lucide-react';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';

export default function LoginPage() {
  const { t } = useLanguage();

  const handleLogin = () => {
    window.location.href = '/auth/login';
  };

  return (
    <main style={{
      height: '100vh',
      width: '100vw',
      backgroundColor: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-6)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        backgroundColor: 'var(--surface-0)',
        border: '1px solid var(--border-strong)',
        borderTop: '4px solid var(--accent-riot)', // Red accent for login
        padding: 'var(--space-8)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-6)'
      }}>
        {/* Logo */}
        <div style={{
          width: '48px',
          height: '48px',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-1)'
        }}>
          <Bot size={24} />
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '24px',
            letterSpacing: '0.05em',
            color: 'var(--text-1)'
          }}>
            {t("SYSTEM ACCESS REQUIRED")}
          </h1>
          <p style={{
            fontSize: '11px',
            color: 'var(--text-3)',
            fontFamily: 'var(--font-mono)',
            marginTop: 'var(--space-1-5)'
          }}>
            {t("COMMUNITY OPERATIONS PLATFORM // V4.0.0")}
          </p>
        </div>

        <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--border)' }} />

        {/* Button */}
        <button
          className="btn btn--primary"
          style={{ width: '100%', padding: 'var(--space-3)' }}
          onClick={handleLogin}
        >
          {t("AUTHENTICATE DISCORD SESSION")}
        </button>

        {/* Footer */}
        <span style={{
          fontSize: '9px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-3)',
          textAlign: 'center'
        }}>
          {t("SECURE CONNECTION REQUIRED. UNAUTHORIZED ACCESS IS LOGGED.")}
        </span>
      </div>
    </main>
  );
}
