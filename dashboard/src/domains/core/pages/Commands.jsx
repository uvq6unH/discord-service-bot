import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useCommands } from '../hooks/useCommands.js';
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

function CustomCommandEditor({ commands, onChange }) {
  const customs = commands.filter(c => c.type === 'custom');
  const { t } = useLanguage();

  const add = () => onChange([
    ...commands,
    {
      type: 'custom',
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: '',
      description: '',
      response: '',
      enabled: true,
      allowedRoles: [],
    },
  ]);

  const remove = (id) => onChange(commands.filter(c => !(c.type === 'custom' && c.id === id)));

  const update = (id, field, val) =>
    onChange(commands.map(c =>
      c.type === 'custom' && c.id === id ? { ...c, [field]: val } : c
    ));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {customs.length === 0 && (
        <p style={{ color: 'var(--text-3)', fontSize: '13px', fontFamily: 'var(--font-mono)' }}>
          {t("[ NO CUSTOM ROUTED COMMANDS ]")}
        </p>
      )}
      {customs.map((c) => (
        <div key={c.id} style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)'
        }}>
          <div className="custom-command-header-row">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-3)' }}>/</span>
            <input
              className="form-input"
              style={{ width: '150px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
              placeholder={t("command-handle")}
              value={c.name}
              onChange={e => update(c.id, 'name', e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, ''))}
            />
            <input
              className="form-input"
              style={{ flex: 1, fontSize: '12px' }}
              placeholder={t("Description metadata...")}
              value={c.description}
              onChange={e => update(c.id, 'description', e.target.value)}
            />
            <label className="toggle-switch">
              <input
                type="checkbox"
                className="toggle-switch__input"
                checked={c.enabled ?? true}
                onChange={e => update(c.id, 'enabled', e.target.checked)}
              />
              <div className="toggle-switch__track">
                <div className="toggle-switch__thumb" />
              </div>
            </label>
            <button className="btn btn--danger" onClick={() => remove(c.id)} style={{ padding: 'var(--space-2) var(--space-3)' }}>
              ×
            </button>
          </div>
          <textarea
            className="form-input"
            rows={2}
            style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}
            placeholder={t("Command Response template. Variables: {user} {args} {server} {prefix}")}
            value={c.response}
            onChange={e => update(c.id, 'response', e.target.value)}
          />
        </div>
      ))}
      <button className="btn btn--secondary" style={{ alignSelf: 'flex-start' }} onClick={add}>
        {t("+ ADD CUSTOM COMMAND")}
      </button>
    </div>
  );
}

function AutoReplyEditor({ replies, onChange }) {
  const { t } = useLanguage();
  const add = () => onChange([...replies, { keyword: '', response: '' }]);
  const remove = (idx) => onChange(replies.filter((_, i) => i !== idx));
  const update = (idx, field, val) => {
    const next = [...replies];
    next[idx] = { ...next[idx], [field]: val };
    onChange(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {replies.length === 0 && (
        <p style={{ color: 'var(--text-3)', fontSize: '13px', fontFamily: 'var(--font-mono)' }}>
          {t("[ NO KEYWORD AUTO-REPLIES CONFIGURED ]")}
        </p>
      )}
      {replies.map((r, i) => (
        <div key={i} style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)'
        }}>
          <div className="auto-reply-header-row">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-3)' }}>{t("KEYWORD")}</span>
            <input
              className="form-input"
              style={{ width: '180px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
              placeholder={t("Query trigger word...")}
              value={r.keyword}
              onChange={e => update(i, 'keyword', e.target.value.toLowerCase())}
            />
            <div style={{ flex: 1 }} />
            <button className="btn btn--danger" onClick={() => remove(i)} style={{ padding: 'var(--space-2) var(--space-3)' }}>
              ×
            </button>
          </div>
          <textarea
            className="form-input"
            rows={2}
            style={{ fontSize: '12px' }}
            placeholder={t("Reply content body payload...")}
            value={r.response}
            onChange={e => update(i, 'response', e.target.value)}
          />
        </div>
      ))}
      <button className="btn btn--secondary" style={{ alignSelf: 'flex-start' }} onClick={add}>
        {t("+ ADD AUTO-REPLY TRIGGER")}
      </button>
    </div>
  );
}

export default function CommandsPage() {
  const location = useLocation();
  const highlight = location.state?.highlight;
  const { config, loading, updateConfig } = useCommands();
  const { guildData } = useGuild();
  const { t } = useLanguage();

  if (loading || !config) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        {t("LOADING COMMANDS INTERFACE...")}
      </div>
    );
  }

  const roles = guildData?.roles ?? [];
  const builtInCommands = (config.core?.commands ?? []).filter(c => c.type !== 'custom');
  const customsCount = (config.core?.commands ?? []).filter(c => c.type === 'custom').length;
  const autoRepliesCount = (config.autoReplies ?? []).length;

  return (
    <Workspace>
      {/* 1. Header Zone */}
      <HeaderZone
        title={t("COMMAND GATEWAY ROUTING")}
        subtitle={t("Manage available console applications, custom command responders, and automatic keyword listeners.")}
      />

      {/* 2. Status Zone */}
      <StatusZone>
        <KpiTile 
          label={t("Core Commands")} 
          value={builtInCommands.length} 
          sub="SYS_CORE_CMDS"
        />
        <KpiTile 
          label={t("Custom Operations")} 
          value={customsCount} 
          sub="CUSTOM_COMMAND_REGISTRY"
        />
        <KpiTile 
          label={t("Keyword Transponders")} 
          value={autoRepliesCount} 
          sub="AUTO_REPLIES_DB"
        />
      </StatusZone>

      {/* 3. Workspace Zone */}
      <div className="grid-12">
        {/* Core System Commands Panel */}
        <div className="col-span-12">
          <Panel title={t("CORE OPERATIONS MODULES")} accent className={highlight === 'commands' ? 'flash-target' : ''}>
            {/* List core commands */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {builtInCommands.map(c => {
                return (
                  <CommandConfigRow
                    key={c.type}
                    cmd={c}
                    roles={roles}
                    onUpdate={updatedCmd => {
                      const currentList = config.core?.commands ?? [];
                      const updatedList = currentList.map(x => x.type === c.type ? updatedCmd : x);
                      updateConfig({ core: { commands: updatedList } });
                    }}
                  />
                );
              })}
            </div>
          </Panel>
        </div>

        {/* Custom Commands Panels */}
        <div className="col-span-6">
          <Panel title={t("CUSTOM RESPONSE OPERATORS")} accent>
            <CustomCommandEditor
              commands={config.core?.commands ?? []}
              onChange={v => updateConfig({ core: { commands: v } })}
            />
          </Panel>
        </div>

        {/* Auto Reply Panels */}
        <div className="col-span-6">
          <Panel title={t("KEYWORD AUTO-RESPONDERS")} accent>
            <AutoReplyEditor
              replies={config.autoReplies ?? []}
              onChange={v => updateConfig({ autoReplies: v })}
            />
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
