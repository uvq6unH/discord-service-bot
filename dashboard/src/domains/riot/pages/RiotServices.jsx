import React, { useState } from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useRiot } from '../hooks/useRiot.js';
import { useGuild } from '../../../shared/hooks/useGuild.js';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';

function CommandConfigRow({ cmd, roles, onUpdate, displayPrefix = '/' }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useLanguage();
  
  const isEnabled = cmd.enabled !== false;
  const name = cmd.name;
  const description = cmd.description;
  const allowedRoles = cmd.allowedRoles ?? [];
  
  const handleToggle = (checked) => {
    onUpdate({ ...cmd, enabled: checked });
  };
  
  const handleFieldChange = (field, val) => {
    onUpdate({
      ...cmd,
      [field]: val
    });
  };

  const handleRoleToggle = (roleId) => {
    const nextRoles = allowedRoles.includes(roleId)
      ? allowedRoles.filter(r => r !== roleId)
      : [...allowedRoles, roleId];
    handleFieldChange('allowedRoles', nextRoles);
  };
  
  return (
    <div style={{
      border: '1px solid var(--border)',
      background: isEnabled ? 'var(--surface-0)' : 'var(--surface-1)',
      marginBottom: 'var(--space-2)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-3) var(--space-4)',
        cursor: 'pointer'
      }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 'bold',
            fontSize: '13px',
            color: isEnabled ? 'var(--text-1)' : 'var(--text-3)'
          }}>
            {displayPrefix}{name}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
            ({cmd.type})
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }} onClick={e => e.stopPropagation()}>
          <label className="toggle-switch">
            <input
              type="checkbox"
              className="toggle-switch__input"
              checked={isEnabled}
              onChange={e => handleToggle(e.target.checked)}
            />
            <div className="toggle-switch__track">
              <div className="toggle-switch__thumb" />
            </div>
          </label>
          <button 
            className="btn btn--secondary" 
            style={{ padding: 'var(--space-1) var(--space-2)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'HIDE' : 'EDIT'}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--surface-1)',
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)'
        }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '10px' }}>{t("Custom Name")}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-3)' }}>{displayPrefix}</span>
              <input
                className="form-input"
                style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', flex: 1 }}
                value={name}
                onChange={e => handleFieldChange('name', e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, ''))}
              />
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '10px' }}>{t("Custom Description")}</label>
            <input
              className="form-input"
              style={{ fontSize: '12px' }}
              value={description}
              onChange={e => handleFieldChange('description', e.target.value)}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '10px' }}>{t("Restricted Roles (Empty for Everyone)")}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1.5)', marginTop: 'var(--space-1)' }}>
              {roles.filter(r => r.name !== '@everyone').map(role => {
                const active = allowedRoles.includes(role.id) || allowedRoles.includes(role.name);
                return (
                  <button
                    key={role.id}
                    className="btn"
                    onClick={() => handleRoleToggle(role.id)}
                    style={{
                      fontSize: '10px',
                      padding: 'var(--space-1) var(--space-2)',
                      fontFamily: 'var(--font-mono)',
                      backgroundColor: active ? 'var(--accent-dim)' : 'var(--surface-2)',
                      borderColor: active ? 'var(--accent)' : 'var(--border)',
                      color: active ? 'var(--text-1)' : 'var(--text-3)'
                    }}
                  >
                    {role.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RiotServicesPage() {
  const { config, loading, updateConfig, handleApiKeyChange } = useRiot();
  const { guildData } = useGuild();
  const { t } = useLanguage();

  if (loading || !config) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        {t("LAUNCHING RIOT SERVICES MONITOR...")}
      </div>
    );
  }

  const roles = guildData?.roles ?? [];
  const isRiotConfigured = config.riotApiKeyConfigured ?? false;
  const isTftConfigured = config.tftApiKeyConfigured ?? false;
  const isLolEnabled = config.lolEnabled ?? false;
  const isTftEnabled = config.tftEnabled ?? false;

  const lolCommandTypes = ['lsd', 'lolprofile', 'lolmatch', 'lolchamp', 'lolitem', 'lolrunes', 'lolpatch', 'lollink', 'lolunlink', 'lolquiz'];
  const tftCommandTypes = ['tftlsd', 'tftprofile', 'tftmatch', 'tftlink', 'tftunlink'];

  const lolCommands = (config.riot?.commands ?? []).filter(c => lolCommandTypes.includes(c.type));
  const tftCommands = (config.riot?.commands ?? []).filter(c => tftCommandTypes.includes(c.type));

  const visibleCommands = (config.riot?.commands ?? []).filter(c => {
    if (lolCommandTypes.includes(c.type)) return isLolEnabled;
    if (tftCommandTypes.includes(c.type)) return isTftEnabled;
    return false;
  });

  return (
    <Workspace>
      {/* 1. Header Zone */}
      <HeaderZone
        title={t("RIOT TELEMETRY PIPELINE")}
        subtitle={t("Manage authentication tokens, API keys, and active game tracking modules for League and TFT.")}
      />

      {/* 2. Status Zone */}
      <StatusZone>
        <KpiTile 
          label={t("Riot API Auth Status")} 
          value={isRiotConfigured ? t('NOMINAL') : t('OFFLINE')} 
          sub="RIOT_KEY_STATE"
        />
        <KpiTile 
          label={t("TFT API Auth Status")} 
          value={isTftConfigured ? t('NOMINAL') : t('OFFLINE')} 
          sub="TFT_KEY_STATE"
        />
        <KpiTile 
          label={t("League Tracking System")} 
          value={isLolEnabled ? t('ACTIVE') : t('INACTIVE')} 
          sub="LOL_TRACKER_STATE"
        />
        <KpiTile 
          label={t("TFT tracking System")} 
          value={isTftEnabled ? t('ACTIVE') : t('INACTIVE')} 
          sub="TFT_TRACKER_STATE"
        />
      </StatusZone>

      {/* 3. Workspace Zone */}
      <div className="grid-12">
        {/* Panel 1: Riot API keys */}
        <div className="col-span-6">
          <Panel title={t("API CREDENTIALS DATABASE")} accent>
            <form onSubmit={e => e.preventDefault()}>
              {/* Hidden field to satisfy browser password manager accessibility guidelines */}
              <input type="text" name="username" autocomplete="username" style={{ display: 'none' }} readOnly />
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  {t("Riot API Token (LoL)")}
                  {isRiotConfigured && (
                    <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: 'var(--space-half) var(--space-1-5)', backgroundColor: 'var(--green-dim)', color: 'var(--green)', border: '1px solid var(--green)' }}>
                      {t("CONFIGURED")}
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  className="form-input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  placeholder={isRiotConfigured ? '•••••••••••••••••••••••••••••••• ' + t('(Leave blank to keep current)') : 'RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
                  autocomplete="new-password"
                  onChange={e => handleApiKeyChange('riotApiKey', e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  {t("TFT API Token (Optional)")}
                  {isTftConfigured && (
                    <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: 'var(--space-half) var(--space-1-5)', backgroundColor: 'var(--green-dim)', color: 'var(--green)', border: '1px solid var(--green)' }}>
                      {t("CONFIGURED")}
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  className="form-input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  placeholder={isTftConfigured ? '•••••••••••••••••••••••••••••••• ' + t('(Leave blank to keep current)') : t('Leave blank to use primary Riot key')}
                  autocomplete="new-password"
                  onChange={e => handleApiKeyChange('tftApiKey', e.target.value)}
                />
              </div>
            </form>
            <div style={{ marginTop: 'var(--space-4)', fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              &gt;&gt;&gt; {t("Tokens are encrypted in Redis memory. Acquire developmental/production keys from developer.riotgames.com.")}
            </div>
          </Panel>
        </div>

        {/* Panel 2: Telemetry module switches */}
        <div className="col-span-6">
          <Panel title={t("TRACKING & TELEMETRY MODULES")} accent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              
              {/* LoL Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifycontent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-half)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 'bold', color: 'var(--text-1)' }}>
                    {t("LEAGUE OF LEGENDS TELEMETRY")}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                    {t("Enables active rank tracking, match logs, and stats.")}
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
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-3)' }}>{t("AVAILABLE OPERATOR COMMANDS:")}</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1-5)' }}>
                    {lolCommands.map(cmd => (
                      <code key={cmd.type} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', padding: 'var(--space-half) var(--space-1-5)', backgroundColor: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                        /{cmd.name}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

              {/* TFT Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifycontent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-half)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 'bold', color: 'var(--text-1)' }}>
                    {t("TEAMFIGHT TACTICS TELEMETRY")}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                    {t("Enables TFT rank tracking and composition snapshots.")}
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
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-3)' }}>{t("AVAILABLE OPERATOR COMMANDS:")}</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1-5)' }}>
                    {tftCommands.map(cmd => (
                      <code key={cmd.type} style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', padding: 'var(--space-half) var(--space-1-5)', backgroundColor: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                        /{cmd.name}
                      </code>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </Panel>
        </div>

        {/* Panel 3: LoL Quiz Leaderboard Settings */}
        {isLolEnabled && (
          <div className="col-span-12" style={{ marginTop: 'var(--space-6)' }}>
            <Panel title={t("LOL QUIZ LEADERBOARD SCORING MATRIX")} accent>
              <span style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 'var(--space-4)' }}>
                &gt;&gt;&gt; {t("Configure point rewards based on the number of guesses taken to solve the Daily Quiz.")}
              </span>
              <div className="quiz-scoring-grid">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                  <div key={num}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                        {t("Guess")} {num} {t("Points")}
                      </label>
                      <input
                        type="number"
                        className="form-input"
                        style={{ fontFamily: 'var(--font-mono)' }}
                        min="0"
                        max="10000"
                        value={config.quizScoring?.[`guess${num}`] ?? 0}
                        onChange={e => {
                          const newScoring = { ...config.quizScoring, [`guess${num}`]: parseInt(e.target.value, 10) || 0 };
                          updateConfig({ quizScoring: newScoring });
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                      {t("Failure (Bỏ cuộc)")}
                    </label>
                    <input
                      type="number"
                      className="form-input"
                      style={{ fontFamily: 'var(--font-mono)' }}
                      min="0"
                      max="10000"
                      value={config.quizScoring?.fail ?? 0}
                      onChange={e => {
                        const newScoring = { ...config.quizScoring, fail: parseInt(e.target.value, 10) || 0 };
                        updateConfig({ quizScoring: newScoring });
                      }}
                    />
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        )}

        {/* Esports Tournament Settings Panel */}
        <div className="col-span-12" style={{ marginTop: 'var(--space-6)' }}>
          <Panel title={t("ESPORTS TOURNAMENT SETTINGS")} accent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--text-1)' }}>
                    {t("Automated Esports Live Notifications")}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                    {t("Automatically post live match alerts when major tournaments start")}
                  </div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={Boolean(config.esportsNotifyEnabled)}
                    onChange={(e) => updateConfig({ esportsNotifyEnabled: e.target.checked })}
                  />
                  <span className="slider" />
                </label>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: 'var(--space-1)', color: 'var(--text-2)' }}>
                  {t("Notification Channel")}
                </label>
                <select
                  className="form-input"
                  value={config.esportsChannelId || ''}
                  onChange={(e) => updateConfig({ esportsChannelId: e.target.value })}
                >
                  <option value="">-- {t("Select Channel")} --</option>
                  {(channels || []).filter(c => c.type === 0 || c.type === 5).map(c => (
                    <option key={c.id} value={c.id}>#{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </Panel>
        </div>

        {/* Riot / TFT Commands Panel */}
        {visibleCommands.length > 0 && (
          <div className="col-span-12" style={{ marginTop: 'var(--space-6)' }}>
            <Panel title={t("RIOT TELEMETRY COMMANDS ROUTING")} accent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {visibleCommands.map(c => {
                  return (
                    <CommandConfigRow
                      key={c.type}
                      cmd={c}
                      roles={roles}
                      onUpdate={updatedCmd => {
                        const currentList = config.riot?.commands ?? [];
                        const updatedList = currentList.map(x => x.type === c.type ? updatedCmd : x);
                        updateConfig({ riot: { ...config.riot, commands: updatedList } });
                      }}
                    />
                  );
                })}
              </div>
            </Panel>
          </div>
        )}

      </div>
    </Workspace>
  );
}
