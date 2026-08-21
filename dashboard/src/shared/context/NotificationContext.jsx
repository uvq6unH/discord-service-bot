import React, { createContext, useContext } from 'react';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  // All toast popups removed per user requirement.
  // The only confirmation feedback is the bottom commit bar in AppShell.jsx.
  const notify = {
    success: () => {},
    error: () => {},
    info: () => {},
    dismiss: () => {}
  };

  return (
    <NotificationContext.Provider value={notify}>
      {children}
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

