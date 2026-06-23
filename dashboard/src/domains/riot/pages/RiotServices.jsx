import React from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useRiot } from '../hooks/useRiot.js';

export default function RiotServicesPage() {
  const { config, loading, updateConfig, handleApiKeyChange } = useRiot();

  if (loading || !config) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        LAUNCHING RIOT SERVICES MONITOR...
      </div>
    );
  }

  const isRiotConfigured = config.riotApiKeyConfigured ?? false;
  const isTftConfigured = config.tftApiKeyConfigured ?? false;
  const isLolEnabled = config.lolEnabled ?? false;
  const isTftEnabled = config.tftEnabled ?? false;

  return (
    <Workspace>
      {/* 1. Header Zone */}
      <HeaderZone
        title="RIOT TELEMETRY PIPELINE"
        subtitle="Manage authentication tokens, API keys, and active game tracking modules for League and TFT."
      />

      {/* 2. Status Zone */}
      <StatusZone>
        <KpiTile 
          label="Riot API Auth Status" 
          value={isRiotConfigured ? 'NOMINAL' : 'OFFLINE'} 
          sub="RIOT_KEY_STATE"
        />
        <KpiTile 
          label="TFT API Auth Status" 
          value={isTftConfigured ? 'NOMINAL' : 'OFFLINE'} 
          sub="TFT_KEY_STATE"
        />
        <KpiTile 
          label="League Tracking System" 
          value={isLolEnabled ? 'ACTIVE' : 'INACTIVE'} 
          sub="LOL_TRACKER_STATE"
        />
        <KpiTile 
          label="TFT tracking System" 
          value={isTftEnabled ? 'ACTIVE' : 'INACTIVE'} 
          sub="TFT_TRACKER_STATE"
        />
      </StatusZone>

      {/* 3. Workspace Zone */}
      <div className="grid-12">
        {/* Panel 1: Riot API keys */}
        <div className="col-span-6">
          <Panel title="API CREDENTIALS DATABASE" accent>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                Riot API Token (LoL)
                {isRiotConfigured && (
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: 'var(--space-half) var(--space-1-5)', backgroundColor: 'var(--green-dim)', color: 'var(--green)', border: '1px solid var(--green)' }}>
                    CONFIGURED
                  </span>
                )}
              </label>
              <input
                type="password"
                className="form-input"
                style={{ fontFamily: 'var(--font-mono)' }}
                placeholder={isRiotConfigured ? '•••••••••••••••••••••••••••••••• (Leave blank to keep current)' : 'RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
                onChange={e => handleApiKeyChange('riotApiKey', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                TFT API Token (Optional)
                {isTftConfigured && (
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: 'var(--space-half) var(--space-1-5)', backgroundColor: 'var(--green-dim)', color: 'var(--green)', border: '1px solid var(--green)' }}>
                    CONFIGURED
                  </span>
                )}
              </label>
              <input
                type="password"
                className="form-input"
                style={{ fontFamily: 'var(--font-mono)' }}
                placeholder={isTftConfigured ? '•••••••••••••••••••••••••••••••• (Leave blank to keep current)' : 'Leave blank to use primary Riot key'}
                onChange={e => handleApiKeyChange('tftApiKey', e.target.value)}
              />
            </div>
            
            <span style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              &gt;&gt;&gt; Tokens are encrypted in Redis memory. Acquire developmental/production keys from developer.riotgames.com.
            </span>
          </Panel>
        </div>

        {/* Panel 2: Telemetry module switches */}
        <div className="col-span-6">
          <Panel title="TRACKING & TELEMETRY MODULES" accent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              
              {/* LoL Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-half)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 'bold', color: 'var(--text-1)' }}>
                    LEAGUE OF LEGENDS TELEMETRY
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                    Enables active rank tracking, match logs, and stats.
                  </span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    className="toggle-switch__input"
                    checked={isLolEnabled}
                    onChange={e => updateConfig({ lolEnabled: e.target.checked })}
                  />
                  <div className="toggle-switch__track">
                    <div className="toggle-switch__thumb" />
                  </div>
                </label>
              </div>

              {isLolEnabled && (
                <div style={{ paddingLeft: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)', borderLeft: '2px solid var(--accent)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-3)' }}>AVAILABLE OPERATOR COMMANDS:</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1-5)' }}>
                    {['/rank', '/profile', '/mastery', '/live', '/history'].map(cmd => (
                      <code key={cmd} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', padding: 'var(--space-half) var(--space-1-5)', backgroundColor: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                        {cmd}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

              {/* TFT Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-half)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 'bold', color: 'var(--text-1)' }}>
                    TEAMFIGHT TACTICS TELEMETRY
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                    Enables TFT rank tracking and composition snapshots.
                  </span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    className="toggle-switch__input"
                    checked={isTftEnabled}
                    onChange={e => updateConfig({ tftEnabled: e.target.checked })}
                  />
                  <div className="toggle-switch__track">
                    <div className="toggle-switch__thumb" />
                  </div>
                </label>
              </div>

              {isTftEnabled && (
                <div style={{ paddingLeft: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)', borderLeft: '2px solid var(--accent)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-3)' }}>AVAILABLE OPERATOR COMMANDS:</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1-5)' }}>
                    {['/tftrank', '/tftprofile', '/tftcomp', '/tftlive'].map(cmd => (
                      <code key={cmd} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', padding: 'var(--space-half) var(--space-1-5)', backgroundColor: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                        {cmd}
                      </code>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
