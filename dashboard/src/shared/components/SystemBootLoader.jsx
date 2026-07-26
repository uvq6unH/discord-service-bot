import React from 'react';
import { Bot, CheckCircle2 } from 'lucide-react';

export default function SystemBootLoader({ progress = 0, currentStep = 'INITIATING SYSTEM BOOT...', telemetryLogs = [], fadingOut = false }) {
  const roundedProgress = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div
      className="boot-loader-bg"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justify: 'center',
        padding: 'var(--space-6)',
        color: 'var(--text-1)',
        fontFamily: 'var(--font-mono)',
        opacity: fadingOut ? 0 : 1,
        transition: 'opacity 0.4s ease-in-out',
        pointerEvents: fadingOut ? 'none' : 'auto'
      }}
    >
      <div className="scanline-overlay" />

      {/* Main Brutalist Container */}
      <div
        style={{
          width: '100%',
          maxWidth: '540px',
          backgroundColor: 'var(--surface-0)',
          border: '1px solid var(--border-strong)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justify: 'space-between',
            padding: '12px 16px',
            backgroundColor: 'var(--surface-1)',
            borderBottom: '1px solid var(--border)',
            fontSize: '11px',
            letterSpacing: '0.05em'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="pulse-led" />
            <span style={{ fontWeight: 'bold', color: 'var(--text-1)' }}>
              MISSION CONTROL // SYSTEM BOOT
            </span>
          </div>
          <span style={{ color: 'var(--text-3)' }}>v4.0.0</span>
        </div>

        {/* Inner Content */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Logo & Status Badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  border: '1px solid var(--accent)',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'center',
                  color: 'var(--accent)'
                }}
              >
                <Bot size={24} />
              </div>
              <div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', letterSpacing: '0.08em', margin: 0 }}>
                  DISCORD SERVICE BOT
                </h1>
                <p style={{ fontSize: '10px', color: 'var(--text-3)', margin: '2px 0 0 0' }}>
                  AUTOMATED COMMUNITY OPERATIONS ENGINE
                </p>
              </div>
            </div>

            {/* Percentage Display */}
            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '32px',
                  fontWeight: 'bold',
                  color: 'var(--accent)',
                  lineHeight: 1
                }}
              >
                {roundedProgress}%
              </span>
            </div>
          </div>

          {/* Cyberpunk Segmented Progress Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div
              style={{
                width: '100%',
                height: '14px',
                backgroundColor: 'var(--surface-2)',
                border: '1px solid var(--border)',
                padding: '2px',
                boxSizing: 'border-box',
                position: 'relative'
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

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-3)' }}>
              <span>[STATE: TELEMETRY_WARMUP]</span>
              <span>{currentStep}</span>
            </div>
          </div>

          {/* Telemetry Step Logs */}
          <div
            style={{
              backgroundColor: 'var(--surface-1)',
              border: '1px solid var(--border)',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              minHeight: '110px'
            }}
          >
            {telemetryLogs.map((log, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'space-between',
                  fontSize: '11px',
                  color: log.done ? 'var(--text-1)' : 'var(--text-3)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {log.done ? (
                    <CheckCircle2 size={12} style={{ color: 'var(--green)' }} />
                  ) : (
                    <div
                      style={{
                        width: '6px',
                        height: '6px',
                        backgroundColor: 'var(--text-3)',
                        borderRadius: '50%'
                      }}
                    />
                  )}
                  <span>{log.label}</span>
                </div>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 'bold',
                    color: log.done ? 'var(--green)' : 'var(--text-3)'
                  }}
                >
                  {log.done ? '[OK]' : '[PENDING]'}
                </span>
              </div>
            ))}
          </div>

        </div>

        {/* Footer Hardware Info */}
        <div
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--surface-1)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justify: 'space-between',
            fontSize: '9px',
            color: 'var(--text-3)'
          }}
        >
          <span>HOST: RENDER_CLUSTER_PROD</span>
          <span>MEMORY: 128MB / 512MB</span>
          <span>SECURE PROTOCOL TLS 1.3</span>
        </div>
      </div>
    </div>
  );
}
