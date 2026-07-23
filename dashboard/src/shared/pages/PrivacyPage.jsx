import React from 'react';

export default function PrivacyPage() {
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
      <h1 style={{ color: '#f0f6fc', borderBottom: '1px solid #30363d', paddingBottom: '10px', fontSize: '28px' }}>Privacy Policy</h1>
      <p style={{ color: '#8b949e' }}>Last updated: July 23, 2026</p>

      <h2 style={{ color: '#f0f6fc', marginTop: '24px', fontSize: '20px' }}>1. Data We Collect</h2>
      <p>We collect and store only the minimal necessary data to provide bot services:</p>
      <ul>
        <li><strong>Server Information:</strong> Guild ID, configuration preferences, and custom commands.</li>
        <li><strong>User Telemetry:</strong> User ID, XP/Level status, virtual economy balances, and warning logs.</li>
      </ul>

      <h2 style={{ color: '#f0f6fc', marginTop: '24px', fontSize: '20px' }}>2. How We Use Data</h2>
      <p>Data is used exclusively to facilitate in-server features like leveling, economy games, custom settings, and audit logging. We do not sell, trade, or share your data with third parties.</p>

      <h2 style={{ color: '#f0f6fc', marginTop: '24px', fontSize: '20px' }}>3. Data Retention and Deletion</h2>
      <p>Configuration and telemetry data are stored on our secure Upstash Cloud database. If you wish to delete your data, please remove the bot from your server or contact the bot operator.</p>
    </div>
  );
}
