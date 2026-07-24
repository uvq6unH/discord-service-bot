import React from 'react';

export default function PermissionGuard({ role, allowed = ['owner', 'admin'], fallback = null, children }) {
  const isAllowed = allowed.includes(role);
  if (isAllowed) return children;
  
  return fallback || (
    <div style={{ 
      padding: 'var(--space-6)', 
      border: '1px solid var(--red)', 
      backgroundColor: 'var(--red-dim)', 
      color: 'var(--red)', 
      fontFamily: 'var(--font-mono)', 
      fontSize: '12px' 
    }}>
      ACCESS_DENIED // SECURITY CLEARANCE INSUFFICIENT
    </div>
  );
}
