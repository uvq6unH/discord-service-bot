import React, { useState } from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import PermissionGuard from '../components/PermissionGuard.jsx';
import { useModeration } from '../hooks/useModeration.js';

function BadWordsEditor({ words, onChange }) {
  const [input, setInput] = useState('');
  
  const addWord = () => {
    const w = input.trim().toLowerCase();
    if (!w || words.includes(w)) {
      setInput('');
      return;
    }
    onChange([...words, w]);
    setInput('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1-5)', minHeight: '28px' }}>
        {words.map(w => (
          <span key={w} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-1-5)',
            background: 'var(--red-dim)',
            border: '1px solid var(--red)',
            color: 'var(--red)',
            padding: 'var(--space-half) var(--space-2)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)'
          }}>
            {w}
            <button 
              onClick={() => onChange(words.filter(x => x !== w))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, fontWeight: 'bold' }}
            >
              ×
            </button>
          </span>
        ))}
        {words.length === 0 && (
          <span style={{ color: 'var(--text-3)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
            [ NO FORBIDDEN WORDS CONFIGURED ]
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <input 
          className="form-input" 
          style={{ fontSize: '12px', flex: 1 }}
          placeholder="Add word trigger..." 
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addWord()} 
        />
        <button className="btn btn--secondary" onClick={addWord} style={{ padding: 'var(--space-2) var(--space-3)' }}>
          ADD
        </button>
      </div>
    </div>
  );
}

function SelfRoleEditor({ roles, allRoles, onChange }) {
  const visible = allRoles.filter(r => r.name !== '@everyone');
  const add = () => onChange([...roles, { label: '', roleId: '' }]);
  const remove = (idx) => onChange(roles.filter((_, i) => i !== idx));
  const update = (idx, field, val) => {
    const next = [...roles];
    next[idx] = { ...next[idx], [field]: val };
    onChange(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {roles.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: 'var(--space-2)', alignItems: 'center' }}>
          <input 
            className="form-input" 
            style={{ fontSize: '12px' }} 
            placeholder="Button label..."
            value={r.label} 
            onChange={e => update(i, 'label', e.target.value)} 
          />
          <select 
            className="form-select" 
            style={{ fontSize: '12px' }} 
            value={r.roleId} 
            onChange={e => update(i, 'roleId', e.target.value)}
          >
            <option value="">-- Select Role --</option>
            {visible.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
          <button className="btn btn--danger" onClick={() => remove(i)} style={{ padding: 'var(--space-2) var(--space-3)' }}>
            ×
          </button>
        </div>
      ))}
      {roles.length === 0 && (
        <p style={{ color: 'var(--text-3)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
          [ NO SELF-ASSIGN ROLES REGISTERED ]
        </p>
      )}
      <button className="btn btn--secondary" style={{ alignSelf: 'flex-start' }} onClick={add}>
        + ADD ROLE BUTTON
      </button>
    </div>
  );
}

export default function ModerationPage() {
  const {
    config,
    loading,
    guildData,
    userRole,
    updateConfig,
    handleThresholdChange
  } = useModeration();

  if (loading || !config) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        LOADING MODERATION PARAMS...
      </div>
    );
  }

  const mod = config.moderation ?? {};
  const channels = guildData.channels ?? [];
  const roles = guildData.roles ?? [];
  const textChannels = channels.filter(c => c.type === 0 || c.type === 5);
  const categoryChannels = channels.filter(c => c.type === 4);

  return (
    <PermissionGuard role={userRole} allowed={['owner', 'admin', 'moderator']}>
      <Workspace>
        {/* 1. Header Zone */}
        <HeaderZone
          title="AUTOMATED MODERATION CONTROL"
          subtitle="Configure security firewalls, filters, ticket panels, and user self-assignment roles."
        />

        {/* 2. Status Zone */}
        <StatusZone>
          <KpiTile 
            label="Active Security Shield" 
            value={mod.enabled ? 'ACTIVE' : 'INACTIVE'} 
            sub="GLOBAL_MOD_STATE"
          />
          <KpiTile 
            label="Filter Triggers" 
            value={config.badWords?.length ?? 0} 
            sub="FORBIDDEN_WORDS_LIST"
          />
          <KpiTile 
            label="Self-Roles Registered" 
            value={config.selfRoles?.length ?? 0} 
            sub="SELF_ASSIGN_ITEMS"
          />
        </StatusZone>

        {/* 3. Workspace Zone */}
        <div className="grid-12">
          {/* Panel 1: AutoMod Global Settings */}
          <div className="col-span-6">
            <Panel title="AUTO-MODERATION ENGINE" accent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-2)' }}>
                    GLOBAL AUTOMOD POWER
                  </span>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      className="toggle-switch__input"
                      checked={mod.enabled ?? false}
                      onChange={e => updateConfig({ moderation: { ...mod, enabled: e.target.checked } })}
                    />
                    <div className="toggle-switch__track">
                      <div className="toggle-switch__thumb" />
                    </div>
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: mod.enabled ? 1 : 0.4 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-2)' }}>
                    ANTI SPAM SHIELD
                  </span>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      className="toggle-switch__input"
                      disabled={!mod.enabled}
                      checked={mod.antiSpam ?? false}
                      onChange={e => updateConfig({ moderation: { ...mod, antiSpam: e.target.checked } })}
                    />
                    <div className="toggle-switch__track">
                      <div className="toggle-switch__thumb" />
                    </div>
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: mod.enabled ? 1 : 0.4 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-2)' }}>
                    ANTI LINK PROTOCOL
                  </span>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      className="toggle-switch__input"
                      disabled={!mod.enabled}
                      checked={mod.antiLink ?? false}
                      onChange={e => updateConfig({ moderation: { ...mod, antiLink: e.target.checked } })}
                    />
                    <div className="toggle-switch__track">
                      <div className="toggle-switch__thumb" />
                    </div>
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: mod.enabled ? 1 : 0.4 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-2)' }}>
                    ANTI RAID EMERGENCY PROTOCOL
                  </span>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      className="toggle-switch__input"
                      disabled={!mod.enabled}
                      checked={mod.antiRaid ?? false}
                      onChange={e => updateConfig({ moderation: { ...mod, antiRaid: e.target.checked } })}
                    />
                    <div className="toggle-switch__track">
                      <div className="toggle-switch__thumb" />
                    </div>
                  </label>
                </div>

                <div className="form-group" style={{ opacity: mod.enabled ? 1 : 0.4 }}>
                  <label className="form-label">Auto-Warn Threshold</label>
                  <input
                    type="number"
                    className="form-input"
                    disabled={!mod.enabled}
                    value={mod.warnThreshold ?? 3}
                    onChange={e => handleThresholdChange('warnThreshold', e.target.value)}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                    Warns required before automated ban.
                  </span>
                </div>
              </div>
            </Panel>

            <Panel title="WORD FILTER DICTIONARY" style={{ marginTop: 'var(--space-5)' }}>
              <div className="form-group">
                <label className="form-label">Forbidden Words Registry</label>
                <BadWordsEditor
                  words={config.badWords ?? []}
                  onChange={v => updateConfig({ badWords: v })}
                />
              </div>
            </Panel>
          </div>

          {/* Panel 2: Ticket and Self Role */}
          <div className="col-span-6">
            <Panel title="TICKET CONSOLE SYSTEM">
              <div className="form-group">
                <label className="form-label">Ticket Category Target</label>
                <select
                  className="form-select"
                  value={config.ticketCategoryId ?? ''}
                  onChange={e => updateConfig({ ticketCategoryId: e.target.value })}
                >
                  <option value="">-- None --</option>
                  {categoryChannels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Ticket Logging Target Channel</label>
                <select
                  className="form-select"
                  value={config.ticketLogChannelId ?? ''}
                  onChange={e => updateConfig({ ticketLogChannelId: e.target.value })}
                >
                  <option value="">-- None --</option>
                  {textChannels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Console panel Title</label>
                <input
                  className="form-input"
                  value={config.ticketPanelTitle ?? ''}
                  onChange={e => updateConfig({ ticketPanelTitle: e.target.value })}
                  placeholder="SUPPORT TICKETS"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Console Panel Message Body</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={config.ticketPanelMessage ?? ''}
                  onChange={e => updateConfig({ ticketPanelMessage: e.target.value })}
                  placeholder="Need assistance? Open a ticket."
                />
              </div>
            </Panel>

            <Panel title="SELF-ROLE ASSIGNMENT" style={{ marginTop: 'var(--space-5)' }}>
              <div className="form-group">
                <label className="form-label">Auto-Gained Role on Join</label>
                <select
                  className="form-select"
                  value={config.autoRoleId ?? ''}
                  onChange={e => updateConfig({ autoRoleId: e.target.value })}
                >
                  <option value="">-- None --</option>
                  {roles.filter(r => r.name !== '@everyone').map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Self-Role Selector Panel Title</label>
                <input
                  className="form-input"
                  value={config.selfRolePanelTitle ?? ''}
                  onChange={e => updateConfig({ selfRolePanelTitle: e.target.value })}
                  placeholder="CLAIM YOUR ROLES"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Custom Role Options Buttons</label>
                <SelfRoleEditor
                  roles={config.selfRoles ?? []}
                  allRoles={roles}
                  onChange={v => updateConfig({ selfRoles: v })}
                />
              </div>
            </Panel>
          </div>
        </div>
      </Workspace>
    </PermissionGuard>
  );
}
