import React from 'react';
import { Bot, CheckCircle2, ShieldCheck, Cpu, Activity, Terminal } from 'lucide-react';

export default function SystemBootLoader({ progress = 0, currentStep = 'INITIATING SYSTEM BOOT...', telemetryLogs = [], fadingOut = false }) {
  const roundedProgress = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#0A0A0A',
        backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
        zIndex: 999999,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '0',
        color: 'var(--text-1)',
        fontFamily: 'var(--font-mono)',
        opacity: fadingOut ? 0 : 1,
        transition: 'opacity 0.3s ease-out',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      <div className="scanline-overlay" />

      {/* 1. Top Status Header */}
      <header
        style={{
          height: '56px',
          width: '100%',
          backgroundColor: 'var(--surface-0)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
          padding: '0 32px',
          boxSizing: 'border-box',
          fontSize: '11px',
          letterSpacing: '0.05em'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="pulse-led" />
          <span style={{ fontWeight: 'bold', color: 'var(--text-1)' }}>
            MISSION CONTROL // BOOT TELEMETRY
          </span>
          <span style={{ color: 'var(--text-3)' }}>|</span>
          <span style={{ color: 'var(--text-3)' }}>SECURE INITIALIZATION PROTOCOL</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', color: 'var(--text-3)' }}>
          <span>NODE: PROD_CLUSTER_01</span>
          <span>SYS_REV: v4.0.0</span>
        </div>
      </header>

      {/* 2. Main Center Console */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justify: 'center',
          padding: '40px 24px',
          boxSizing: 'border-box'
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '680px',
            backgroundColor: 'var(--surface-0)',
            border: '1px solid var(--border-strong)',
            padding: '36px',
            display: 'flex',
            flexDirection: 'column',
            gap: '28px',
            boxShadow: '0 30px 60px rgba(0, 0, 0, 0.9)'
          }}
        >
          {/* Brand & Large Percentage */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  border: '1px solid var(--accent)',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'center',
                  color: 'var(--accent)'
                }}
              >
                <Bot size={28} />
              </div>
              <div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', letterSpacing: '0.08em', margin: 0, lineHeight: 1 }}>
                  DISCORD SERVICE BOT
                </h1>
                <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: '4px 0 0 0', fontFamily: 'var(--font-mono)' }}>
                  COMMUNITY OPERATIONS & TELEMETRY ENGINE
                </p>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '48px',
                  fontWeight: 'bold',
                  color: 'var(--accent)',
                  lineHeight: 1
                }}
              >
                {roundedProgress}%
              </span>
            </div>
          </div>

          {/* Segmented Progress Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div
              style={{
                width: '100%',
                height: '16px',
                backgroundColor: 'var(--surface-2)',
                border: '1px solid var(--border)',
                padding: '2px',
                boxSizing: 'border-box'
              }}
            >
              <div
                style={{
                  width: `${roundedProgress}%`,
                  height: '100%',
                  backgroundColor: 'var(--accent)',
                  transition: 'width 0.15s ease-out'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-3)' }}>
              <span style={{ color: 'var(--text-2)' }}>STATUS: {currentStep}</span>
              <span>{roundedProgress === 100 ? 'READY' : 'WARMING UP...'}</span>
            </div>
          </div>

          {/* Telemetry Step Logs */}
          <div
            style={{
              backgroundColor: 'var(--surface-1)',
              border: '1px solid var(--border)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            {telemetryLogs.map((log, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'space-between',
                  fontSize: '12px',
                  color: log.done ? 'var(--text-1)' : 'var(--text-3)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {log.done ? (
                    <CheckCircle2 size={14} style={{ color: 'var(--green)' }} />
                  ) : (
                    <div
                      style={{
                        width: '6px',
                        height: '6px',
                        backgroundColor: 'var(--text-3)',
                        borderRadius: '50%',
                        marginLeft: '4px',
                        marginRight: '4px'
                      }}
                    />
                  )}
                  <span style={{ fontWeight: log.done ? 'bold' : 'normal' }}>{log.label}</span>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 'bold',
                    fontFamily: 'var(--font-mono)',
                    color: log.done ? 'var(--green)' : 'var(--text-3)'
                  }}
                >
                  {log.done ? '[OK]' : '[PENDING]'}
                </span>
              </div>
            ))}
          </div>

        </div>
      </main>

      {/* 3. Bottom Footer Status Bar */}
      <footer
        style={{
          height: '40px',
          width: '100%',
          backgroundColor: 'var(--surface-0)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
          padding: '0 32px',
          boxSizing: 'border-box',
          fontSize: '10px',
          color: 'var(--text-3)'
        }}
      >
        <span>HOST: RENDER_CLUSTER_PROD</span>
        <span>SECURITY: ENCRYPTED TLS 1.3</span>
        <span>AUTHENTICATED DISCORD SESSION</span>
      </footer>
    </div>
  );
}
