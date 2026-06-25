import React, { useState } from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useMusic } from '../hooks/useMusic.js';
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

export default function MusicServicesPage() {
  const { 
    config, 
    loading, 
    updateConfig, 
    handleVolumeChange, 
    handlePrefixChange 
  } = useMusic();
  const { guildData } = useGuild();
  const { t } = useLanguage();

  if (loading || !config) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        {t("INITIALIZING AUDIO CORE TELEMETRY...")}
      </div>
    );
  }

  const roles = guildData?.roles ?? [];
  const isMusicEnabled = config.musicEnabled ?? false;
  const music = config.music ?? {};
  const volume = music.defaultVolume ?? 70;

  return (
    <Workspace>
      {/* 1. Header Zone */}
      <HeaderZone
        title={t("AUDIO STREAM CONTROLLER")}
        subtitle={t("Manage active Lavalink voice connections, player volumes, and song request command routing.")}
      />

      {/* 2. Status Zone */}
      <StatusZone>
        <KpiTile 
          label={t("Audio Core Status")} 
          value={isMusicEnabled ? t('NOMINAL') : t('OFFLINE')} 
          sub="LAVALINK_STREAM_STATE"
        />
        <KpiTile 
          label={t("Default Volume Cap")} 
          value={`${volume}%`} 
          sub="INITIAL_DB_VOLUME"
        />
        <KpiTile 
          label={t("Audio Command Prefix")} 
          value={config.musicPrefix ? `"${config.musicPrefix}"` : '"hb"'} 
          sub="TEXT_INVOCATION_PREFIX"
        />
        <KpiTile 
          label={t("Active Audio Nodes")} 
          value={isMusicEnabled ? '1 / 1 ' + t('ONLINE') : '0 / 0 ' + t('OFFLINE')} 
          sub="LAVALINK_NODE_POOL"
        />
      </StatusZone>

      {/* 3. Workspace Zone */}
      <div className="grid-12">
        {/* Panel 1: Audio Core Configuration */}
        <div className="col-span-6">
          <Panel title={t("AUDIO ENGINE CONFIG")} accent>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-2)' }}>
                {t("GLOBAL AUDIO STREAM MODULE")}
              </span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  className="toggle-switch__input"
                  checked={isMusicEnabled}
                  onChange={e => updateConfig({ musicEnabled: e.target.checked })}
                />
                <div className="toggle-switch__track">
                  <div className="toggle-switch__thumb" />
                </div>
              </label>
            </div>

            <div className="form-group" style={{ opacity: isMusicEnabled ? 1 : 0.4, marginTop: 'var(--space-3)' }}>
              <label className="form-label">{t("Audio Invocation Prefix")}</label>
              <input
                className="form-input"
                style={{ width: '120px', fontFamily: 'var(--font-mono)' }}
                disabled={!isMusicEnabled}
                value={config.musicPrefix ?? 'hb'}
                placeholder="hb"
                onChange={e => handlePrefixChange(e.target.value)}
              />
            </div>
          </Panel>

          <Panel title={t("LAVALINK AUDIO NODE POOL")} style={{ marginTop: 'var(--space-5)' }}>
            <DataSlab 
              label="NODE // US_EAST_PRIMARY" 
              value={isMusicEnabled ? t('ONLINE') : t('OFFLINE')} 
              sub={t("Lavalink socket server connection state")}
              highlight={isMusicEnabled}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              &gt;&gt;&gt; {t("Audio nodes are configured inside server configs. Shard allocation is automated.")}
            </span>
          </Panel>
        </div>

        {/* Panel 2: Stream Defaults */}
        <div className="col-span-6">
          <Panel title={t("PLAYBACK COEFFICIENTS")} accent>
            <div className="form-group" style={{ opacity: isMusicEnabled ? 1 : 0.4 }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{t("INITIAL VOLUME THRESHOLD")}</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{volume}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                className="form-input"
                style={{ cursor: 'pointer', padding: 0 }}
                disabled={!isMusicEnabled}
                value={volume}
                onChange={e => handleVolumeChange(e.target.value)}
              />
            </div>
            
            <div style={{ paddingLeft: 'var(--space-4)', borderLeft: '2px solid var(--accent)', marginTop: 'var(--space-2)', opacity: isMusicEnabled ? 1 : 0.4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-3)' }}>{t("SUPPORTED VOICE SCHEMAS:")}</span>
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
                {['Youtube', 'Spotify', 'Soundcloud', 'Twitch'].map(provider => (
                  <span key={provider} style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', padding: 'var(--space-half) var(--space-1-5)', backgroundColor: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                    {provider.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          </Panel>
        </div>

        {/* Music Commands Panel */}
        <div className="col-span-12" style={{ marginTop: 'var(--space-6)' }}>
          <Panel title={t("AUDIO SYSTEM COMMANDS ROUTING")} accent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {(config.music?.commands ?? []).map(c => {
                const prefix = config.musicPrefix ? `${config.musicPrefix} ` : 'hb ';
                return (
                  <CommandConfigRow
                    key={c.type}
                    cmd={c}
                    roles={roles}
                    displayPrefix={prefix}
                    onUpdate={updatedCmd => {
                      const currentList = config.music?.commands ?? [];
                      const updatedList = currentList.map(x => x.type === c.type ? updatedCmd : x);
                      updateConfig({ music: { ...music, commands: updatedList } });
                    }}
                  />
                );
              })}
            </div>
          </Panel>
        </div>

      </div>
    </Workspace>
  );
}
