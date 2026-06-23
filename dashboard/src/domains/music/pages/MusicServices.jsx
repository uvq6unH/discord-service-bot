import React from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useMusic } from '../hooks/useMusic.js';

export default function MusicServicesPage() {
  const { 
    config, 
    loading, 
    updateConfig, 
    handleVolumeChange, 
    handlePrefixChange 
  } = useMusic();

  if (loading || !config) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        INITIALIZING AUDIO CORE TELEMETRY...
      </div>
    );
  }

  const isMusicEnabled = config.musicEnabled ?? false;
  const music = config.music ?? {};
  const volume = music.defaultVolume ?? 70;

  return (
    <Workspace>
      {/* 1. Header Zone */}
      <HeaderZone
        title="AUDIO STREAM CONTROLLER"
        subtitle="Manage active Lavalink voice connections, player volumes, and song request command routing."
      />

      {/* 2. Status Zone */}
      <StatusZone>
        <KpiTile 
          label="Audio Core Status" 
          value={isMusicEnabled ? 'NOMINAL' : 'OFFLINE'} 
          sub="LAVALINK_STREAM_STATE"
        />
        <KpiTile 
          label="Default Volume Cap" 
          value={`${volume}%`} 
          sub="INITIAL_DB_VOLUME"
        />
        <KpiTile 
          label="Audio Command Prefix" 
          value={config.musicPrefix ? `"${config.musicPrefix}"` : '"hb"'} 
          sub="TEXT_INVOCATION_PREFIX"
        />
        <KpiTile 
          label="Active Audio Nodes" 
          value={isMusicEnabled ? '1 / 1 ONLINE' : '0 / 0 OFFLINE'} 
          sub="LAVALINK_NODE_POOL"
        />
      </StatusZone>

      {/* 3. Workspace Zone */}
      <div className="grid-12">
        {/* Panel 1: Audio Core Configuration */}
        <div className="col-span-6">
          <Panel title="AUDIO ENGINE CONFIG" accent>
            <div style={{ display: 'flex', alignItems: 'center', justifycontent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-2)' }}>
                GLOBAL AUDIO STREAM MODULE
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
              <label className="form-label">Audio Invocation Prefix</label>
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

          <Panel title="LAVALINK AUDIO NODE POOL" style={{ marginTop: 'var(--space-5)' }}>
            <DataSlab 
              label="NODE // US_EAST_PRIMARY" 
              value={isMusicEnabled ? 'ONLINE' : 'OFFLINE'} 
              sub="Lavalink socket server connection state"
              highlight={isMusicEnabled}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              &gt;&gt;&gt; Audio nodes are configured inside server configs. Shard allocation is automated.
            </span>
          </Panel>
        </div>

        {/* Panel 2: Stream Defaults */}
        <div className="col-span-6">
          <Panel title="PLAYBACK COEFFICIENTS" accent>
            <div className="form-group" style={{ opacity: isMusicEnabled ? 1 : 0.4 }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>INITIAL VOLUME THRESHOLD</span>
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
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-3)' }}>SUPPORTED VOICE SCHEMAS:</span>
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
      </div>
    </Workspace>
  );
}
