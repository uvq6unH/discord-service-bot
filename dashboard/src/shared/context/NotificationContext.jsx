import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notification, setNotification] = useState(null);
  const timerRef = useRef(null);

  const showNotification = useCallback(({ type = 'success', message = '' }) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setNotification({ type, message });
    timerRef.current = setTimeout(() => {
      setNotification(null);
    }, 3500);
  }, []);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setNotification(null);
  }, []);

  const notify = {
    success: (msg) => showNotification({ type: 'success', message: msg }),
    error: (msg) => showNotification({ type: 'error', message: msg }),
    info: (msg) => showNotification({ type: 'info', message: msg }),
    dismiss
  };

  return (
    <NotificationContext.Provider value={notify}>
      {children}

      {/* Unified Cyberpunk Global Notification Banner (Bottom-Right) */}
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 999999,
        pointerEvents: notification ? 'auto' : 'none',
        transform: notification ? 'translateY(0)' : 'translateY(150%)',
        opacity: notification ? 1 : 0,
        transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease',
        background: 'var(--surface-1)',
        border: `1px solid ${
          notification?.type === 'error' ? 'var(--red)' :
          notification?.type === 'info' ? 'var(--accent)' : 'var(--green)'
        }`,
        color: notification?.type === 'error' ? 'var(--red)' :
               notification?.type === 'info' ? 'var(--accent)' : 'var(--green)',
        padding: 'var(--space-3) var(--space-4)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        maxWidth: '480px',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        lineHeight: 1.4,
        borderRadius: 'var(--r1)'
      }}>
        <span style={{ flex: 1 }}>
          {notification?.type === 'error' ? '✖ ' : notification?.type === 'info' ? 'ℹ ' : '✔ '}
          {notification?.message}
        </span>
        <button
          onClick={dismiss}
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: '0 4px',
            fontSize: '14px',
            fontWeight: 'bold',
            opacity: 0.7
          }}
        >
          ×
        </button>
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotify() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotify must be used within a NotificationProvider');
  }
  return context;
}
