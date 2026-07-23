import React from 'react';

export default function TermsPage() {
  return (
    <div style={{
      maxWidth: '800px',
      margin: '60px auto',
      padding: '40px 24px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#c9d1d9',
      backgroundColor: '#0d1117',
      lineHeight: '1.6',
      borderRadius: '8px',
      border: '1px solid #30363d'
    }}>
      <h1 style={{ color: '#f0f6fc', borderBottom: '1px solid #30363d', paddingBottom: '10px', fontSize: '28px' }}>Terms of Service</h1>
      <p style={{ color: '#8b949e' }}>Last updated: July 23, 2026</p>
      
      <h2 style={{ color: '#f0f6fc', marginTop: '24px', fontSize: '20px' }}>1. Acceptance of Terms</h2>
      <p>By inviting this Bot to your server or using the associated Dashboard, you agree to comply with and be bound by these Terms of Service. If you do not agree, please remove the bot from your server.</p>

      <h2 style={{ color: '#f0f6fc', marginTop: '24px', fontSize: '20px' }}>2. Use of Service</h2>
      <p>You agree to use this bot only for lawful purposes in accordance with Discord's Terms of Service and Developer Policy. Abuse, spamming commands, or attempting to compromise the service is strictly prohibited.</p>

      <h2 style={{ color: '#f0f6fc', marginTop: '24px', fontSize: '20px' }}>3. Limitation of Liability</h2>
      <p>The Bot and Dashboard are provided "as is" without warranty of any kind. The developers are not liable for any service interruptions, data loss, or server moderation issues resulting from the use of the bot.</p>

      <h2 style={{ color: '#f0f6fc', marginTop: '24px', fontSize: '20px' }}>4. Modifications</h2>
      <p>These terms may be updated at any time. Continued use of the bot after updates constitutes acceptance of the new terms.</p>
    </div>
  );
}
