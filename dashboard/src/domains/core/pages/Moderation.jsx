import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import PermissionGuard from '../components/PermissionGuard.jsx';
import { useModeration } from '../hooks/useModeration.js';
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

function BadWordsEditor({ words, onChange }) {
  const [input, setInput] = useState('');
  const { t } = useLanguage();
  
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
            {t("[ NO FORBIDDEN WORDS CONFIGURED ]")}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <input 
          className="form-input" 
          style={{ fontSize: '12px', flex: 1 }}
          placeholder={t("Add word trigger...")}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addWord()} 
        />
        <button className="btn btn--secondary" onClick={addWord} style={{ padding: 'var(--space-2) var(--space-3)' }}>
          {t("ADD")}
        </button>
      </div>
    </div>
  );
}

function SelfRoleEditor({ roles, allRoles, onChange }) {
  const { t } = useLanguage();
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
        <div key={i} className="self-role-editor-row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
          <input 
            className="form-input" 
            style={{ fontSize: '12px' }} 
            placeholder={t("Button label...")}
            value={r.label} 
            onChange={e => update(i, 'label', e.target.value)} 
          />
          <select 
            className="form-select" 
            style={{ fontSize: '12px' }} 
            value={r.roleId} 
            onChange={e => update(i, 'roleId', e.target.value)}
          >
            <option value="">{t("-- Select Role --")}</option>
            {visible.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
          <button className="btn btn--danger" onClick={() => remove(i)} style={{ padding: 'var(--space-2) var(--space-3)' }}>
            ×
          </button>
        </div>
      ))}
      {roles.length === 0 && (
        <p style={{ color: 'var(--text-3)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
          {t("[ NO SELF-ASSIGN ROLES REGISTERED ]")}
        </p>
      )}
      <button className="btn btn--secondary" style={{ alignSelf: 'flex-start' }} onClick={add}>
        {t("+ ADD ROLE BUTTON")}
      </button>
    </div>
  );
}

export default function ModerationPage() {
  const location = useLocation();
  const highlight = location.state?.highlight;
  const {
    config,
    loading,
    guildData,
    userRole,
    updateConfig,
    handleThresholdChange
  } = useModeration();
  const { t } = useLanguage();

  if (loading || !config) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        {t("LOADING MODERATION PARAMS...")}
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
          title={t("AUTOMATED MODERATION CONTROL")}
          subtitle={t("Configure security firewalls, filters, ticket panels, and user self-assignment roles.")}
        />

        {/* 2. Status Zone */}
        <StatusZone>
          <KpiTile 
            label={t("Active Security Shield")} 
            value={mod.enabled ? t('ACTIVE') : t('INACTIVE')} 
            sub="GLOBAL_MOD_STATE"
          />
          <KpiTile 
            label={t("Filter Triggers")} 
            value={config.badWords?.length ?? 0} 
            sub="FORBIDDEN_WORDS_LIST"
          />
          <KpiTile 
            label={t("Self-Roles Registered")} 
            value={config.selfRoles?.length ?? 0} 
            sub="SELF_ASSIGN_ITEMS"
          />
        </StatusZone>

        {/* 3. Workspace Zone */}
        <div className="grid-12">
          {/* Panel 1: AutoMod Global Settings */}
          <div className="col-span-6">
            <Panel title={t("AUTO-MODERATION ENGINE")} accent className={highlight === 'automod' ? 'flash-target' : ''}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-2)' }}>
                    {t("GLOBAL AUTOMOD POWER")}
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
                    {t("ANTI SPAM SHIELD")}
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
                    {t("ANTI LINK PROTOCOL")}
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
                    {t("ANTI RAID EMERGENCY PROTOCOL")}
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
                  <label className="form-label">{t("Auto-Warn Threshold")}</label>
                  <input
                    type="number"
                    className="form-input"
                    disabled={!mod.enabled}
                    value={mod.warnThreshold ?? 3}
                    onChange={e => handleThresholdChange('warnThreshold', e.target.value)}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                    {t("Warns required before automated ban.")}
                  </span>
                </div>
              </div>
            </Panel>

            <Panel title={t("WORD FILTER DICTIONARY")} style={{ marginTop: 'var(--space-5)' }} className={highlight === 'wordfilter' ? 'flash-target' : ''}>
              <div className="form-group">
                <label className="form-label">{t("Forbidden Words Registry")}</label>
                <BadWordsEditor
                  words={config.badWords ?? []}
                  onChange={v => updateConfig({ badWords: v })}
                />
              </div>
            </Panel>
          </div>

          {/* Panel 2: Ticket and Self Role */}
          <div className="col-span-6">
            <Panel title={t("TICKET CONSOLE SYSTEM")} className={highlight === 'tickets' ? 'flash-target' : ''}>
              <div className="form-group">
                <label className="form-label">{t("Ticket Category Target")}</label>
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
                <label className="form-label">{t("Ticket Logging Target Channel")}</label>
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
                <label className="form-label">{t("Console panel Title")}</label>
                <input
                  className="form-input"
                  value={config.ticketPanelTitle ?? ''}
                  onChange={e => updateConfig({ ticketPanelTitle: e.target.value })}
                  placeholder="SUPPORT TICKETS"
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t("Console Panel Message Body")}</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={config.ticketPanelMessage ?? ''}
                  onChange={e => updateConfig({ ticketPanelMessage: e.target.value })}
                  placeholder="Need assistance? Open a ticket."
                />
              </div>
            </Panel>

            <Panel title={t("SELF-ROLE ASSIGNMENT")} style={{ marginTop: 'var(--space-5)' }} className={highlight === 'selfroles' ? 'flash-target' : ''}>
              <div className="form-group">
                <label className="form-label">{t("Auto-Gained Role on Join")}</label>
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
                <label className="form-label">{t("Self-Role Selector Panel Title")}</label>
                <input
                  className="form-input"
                  value={config.selfRolePanelTitle ?? ''}
                  onChange={e => updateConfig({ selfRolePanelTitle: e.target.value })}
                  placeholder="CLAIM YOUR ROLES"
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t("Custom Role Options Buttons")}</label>
                <SelfRoleEditor
                  roles={config.selfRoles ?? []}
                  allRoles={roles}
                  onChange={v => updateConfig({ selfRoles: v })}
                />
              </div>
            </Panel>
          </div>

          {/* Moderation Commands Panel */}
          <div className="col-span-12" style={{ marginTop: 'var(--space-5)' }}>
            <Panel title={t("MODERATION COMMANDS ROUTING")} accent>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {(config.moderation?.commands ?? []).map(c => {
                  return (
                    <CommandConfigRow
                      key={c.type}
                      cmd={c}
                      roles={roles}
                      onUpdate={updatedCmd => {
                        const currentList = config.moderation?.commands ?? [];
                        const updatedList = currentList.map(x => x.type === c.type ? updatedCmd : x);
                        updateConfig({ moderation: { ...mod, commands: updatedList } });
                      }}
                    />
                  );
                })}
              </div>
            </Panel>
          </div>
        </div>
      </Workspace>
    </PermissionGuard>
  );
}
