import React, { useState } from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useCommands } from '../hooks/useCommands.js';
import { useGuild } from '../../../shared/hooks/useGuild.js';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';
import { Wrench, Mic, Languages, BellRing } from 'lucide-react';

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
                style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}
                value={name}
                onChange={e => handleFieldChange('name', e.target.value.toLowerCase().replace(/\s+/g, ''))}
              />
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '10px' }}>{t("Description")}</label>
            <input
              className="form-input"
              style={{ fontSize: '12px' }}
              value={description}
              onChange={e => handleFieldChange('description', e.target.value)}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '10px' }}>{t("Allowed Roles (Empty = All Allowed)")}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
              {roles.map(role => {
                const active = allowedRoles.includes(role.id);
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => handleRoleToggle(role.id)}
                    style={{
                      padding: 'var(--space-1) var(--space-2)',
                      fontSize: '11px',
                      border: '1px solid var(--border)',
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

const UTILITY_TYPES = ['translate', 'duolingo', 'voice', 'setup-temp-vc'];

export default function UtilityServicesPage() {
  const { config, loading, updateConfig } = useCommands();
  const { guildData } = useGuild();
  const { t } = useLanguage();

  if (loading || !config) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        {t("LAUNCHING UTILITY SERVICES CONSOLE...")}
      </div>
    );
  }

  const roles = guildData?.roles ?? [];
  const channels = guildData?.channels ?? [];
  const categories = (channels || []).filter(c => c.type === 4);

  const utilityCmds = (config.core?.commands ?? []).filter(c => UTILITY_TYPES.includes(c.type));
  const isTempVcActive = Boolean(config.tempVcEnabled);

  return (
    <Workspace>
      <HeaderZone
        title={t("UTILITY & VOICE SERVICES")}
        subtitle={t("Manage language translation, Duolingo learning modules, and VoiceMaster temporary voice channels.")}
      />

      <StatusZone>
        <KpiTile
          label={t("Translation Engine")}
          value={t("ACTIVE")}
          sub="MULTI_LANG_PARSER"
        />
        <KpiTile
          label={t("Duolingo Module")}
          value={t("ACTIVE")}
          sub="GAMIFIED_LEARNING"
        />
        <KpiTile
          label={t("Temp Voice System")}
          value={isTempVcActive ? t("ACTIVE") : t("DISABLED")}
          sub="VOICEMASTER_ENGINE"
        />
      </StatusZone>

      <div className="grid-12">
        {/* Temp Voice Channels Config Panel */}
        <div className="col-span-12">
          <Panel title={t("VOICEMASTER TEMP VOICE ENGINE")} accent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '13px', color: 'var(--text-1)' }}>
                    {t("Join-to-Create Voice Engine")}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
                    {t("Automatically generate temporary voice channels when members join the master channel")}
                  </div>
                </div>

                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    className="toggle-switch__input"
                    checked={isTempVcActive}
                    onChange={(e) => updateConfig({ tempVcEnabled: e.target.checked })}
                  />
                  <div className="toggle-switch__track">
                    <div className="toggle-switch__thumb" />
                  </div>
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                    {t("Master Join-to-Create Voice Channel")}
                  </label>
                  <select
                    className="form-input"
                    style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', width: '100%' }}
                    value={config.tempVcMasterChannelId || ''}
                    onChange={(e) => updateConfig({ tempVcMasterChannelId: e.target.value })}
                  >
                    <option value="">-- {t("Select Voice Channel")} --</option>
                    {(channels || []).filter(c => c.type === 2).map(c => (
                      <option key={c.id} value={c.id}>🔊 {c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                    {t("Temp VC Parent Category")}
                  </label>
                  <select
                    className="form-input"
                    style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', width: '100%' }}
                    value={config.tempVcCategoryId || ''}
                    onChange={(e) => updateConfig({ tempVcCategoryId: e.target.value })}
                  >
                    <option value="">-- {t("Select Category")} --</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>📁 {c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

            </div>
          </Panel>
        </div>

        {/* Utility Commands Routing Panel */}
        <div className="col-span-12" style={{ marginTop: 'var(--space-6)' }}>
          <Panel title={t("UTILITY COMMANDS ROUTING")} accent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {utilityCmds.map(c => (
                <CommandConfigRow
                  key={c.type}
                  cmd={c}
                  roles={roles}
                  onUpdate={updatedCmd => {
                    const currentList = config.core?.commands ?? [];
                    const updatedList = currentList.map(x => {
                      const isMatch = (x.type && c.type && x.type === c.type) || (x.name && c.name && x.name === c.name);
                      return isMatch ? updatedCmd : x;
                    });
                    updateConfig({ core: { commands: updatedList } });
                  }}
                />
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
