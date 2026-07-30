import React, { useState } from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useMusic } from '../hooks/useMusic.js';
import { useGuild } from '../../../shared/hooks/useGuild.js';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';
import { useNotify } from '../../../shared/context/NotificationContext.jsx';
import { Mic, Radio, Volume2, ShieldCheck, Wand2 } from 'lucide-react';
import { apiFetch } from '../../../api.js';

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

const VOICE_TYPES = ['voice', 'setup'];

export default function VoiceServicesPage() {
  const { config, loading, updateConfig } = useMusic();
  const { guildData, selectedGuild } = useGuild();
  const { t } = useLanguage();
  const notify = useNotify();
  const [settingUp, setSettingUp] = useState(false);

  if (loading || !config) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        {t("LAUNCHING VOICEMASTER VC CONSOLE...")}
      </div>
    );
  }

  const roles = guildData?.roles ?? [];
  const channels = guildData?.channels ?? [];
  const categories = (channels || []).filter(c => c.type === 4);

  const voiceCmds = (config.core?.commands ?? []).filter(c => VOICE_TYPES.includes(c.type));
  const isTempVcActive = Boolean(config.tempVcEnabled);
  const masterChannel = channels.find(c => c.id === config.tempVcMasterChannelId);
  const parentCategory = categories.find(c => c.id === config.tempVcCategoryId);

  const handleRunAutoSetup = async () => {
    setSettingUp(true);
    try {
      const selectedGuildId = localStorage.getItem('selectedGuildId') || selectedGuild?.id || '';
      const res = await apiFetch(`/api/guilds/${selectedGuildId}/temp-vc-setup`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.error) {
        notify.error(data.error);
        return;
      }
      updateConfig({ tempVcEnabled: true });
      notify.success(data.message || 'Đã khởi tạo hệ thống VoiceMaster thành công!');
    } catch (err) {
      notify.error(err.message || 'Lỗi hệ thống khi khởi tạo VoiceMaster');
    } finally {
      setSettingUp(false);
    }
  };

  const handleResetSetup = async () => {
    setSettingUp(true);
    try {
      const selectedGuildId = localStorage.getItem('selectedGuildId') || selectedGuild?.id || '';
      const res = await apiFetch(`/api/guilds/${selectedGuildId}/temp-vc-reset`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.error) {
        notify.error(data.error);
        return;
      }
      updateConfig({
        tempVcEnabled: false,
        tempVcMasterChannelId: '',
        tempVcCategoryId: '',
        tempVcControlChannelId: ''
      });
      notify.success(data.message || 'Đã reset VoiceMaster!');
    } catch (err) {
      notify.error(err.message || 'Lỗi hệ thống khi reset VoiceMaster');
    } finally {
      setSettingUp(false);
    }
  };

  const serverName = selectedGuild?.name ? selectedGuild.name.toUpperCase() : '';

  return (
    <Workspace>
      <HeaderZone
        title={serverName ? `${serverName} // VOICEMASTER VC ENGINE` : 'VOICEMASTER VC ENGINE'}
        subtitle={t("Automated Join-to-Create Temporary Voice Channels, Interactive Control Panels & Voice Moderation")}
      />

      <StatusZone>
        <KpiTile
          label={t("Voice Engine Status")}
          value={isTempVcActive ? t("ACTIVE") : t("DISABLED")}
          sub="VOICEMASTER_NODE"
        />
        <KpiTile
          label={t("Master Join Channel")}
          value={masterChannel ? `#${masterChannel.name}` : t("NOT_SET")}
          sub="JOIN_TO_CREATE"
        />
        <KpiTile
          label={t("Temp VC Category")}
          value={parentCategory ? parentCategory.name : t("DEFAULT_CATEGORY")}
          sub="CATEGORY_CONTAINER"
        />
      </StatusZone>

      <div className="grid-12">
        {/* Master Voice Engine Config Panel */}
        <div className="col-span-12">
          <Panel title={t("AUTOMATED JOIN-TO-CREATE CONFIGURATION (VOICEMASTER)")} accent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              
              {/* Discord Command Instructions Box */}
              <div style={{
                padding: 'var(--space-4)',
                background: 'rgba(0, 255, 136, 0.05)',
                border: '1px solid var(--accent)',
                borderRadius: '4px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '13px', color: 'var(--accent)' }}>
                  <Wand2 size={18} />
                  {t("Discord Command Automated Setup")}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-1)', marginTop: 'var(--space-2)', lineHeight: '1.5' }}>
                  Gõ lệnh <code style={{ background: 'var(--surface-2)', padding: '2px 6px', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>hb setup</code> hoặc <code style={{ background: 'var(--surface-2)', padding: '2px 6px', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>/setup</code> trực tiếp trong Discord Server để Bot **tự động tạo toàn bộ hệ thống VoiceMaster** (Category, Kênh ➕ Join to Create & Control Panel 🎛️ voice-interface)!
                </div>
              </div>

              {/* Status and Direct Web Setup Trigger */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-4)',
                background: 'var(--surface-1)',
                border: '1px solid var(--border)'
              }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '13px', color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <Mic size={16} color="var(--accent)" />
                    Trạng thái hệ thống: {isTempVcActive ? '🟢 ĐÃ BẬT (ACTIVE)' : '⚪ CHƯA TẠO (STANDBY)'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
                    • Category: {parentCategory ? parentCategory.name : (config.tempVcCategoryId ? config.tempVcCategoryId : 'Chưa khởi tạo')}<br />
                    • Master Channel: {masterChannel ? `🔊 ${masterChannel.name}` : (config.tempVcMasterChannelId ? config.tempVcMasterChannelId : 'Chưa khởi tạo')}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={settingUp}
                    onClick={handleRunAutoSetup}
                    style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', padding: 'var(--space-2) var(--space-4)' }}
                  >
                    {settingUp ? '⏳ Creating...' : '⚡ Auto-Setup Now (Web)'}
                  </button>

                  {isTempVcActive && (
                    <button
                      type="button"
                      className="btn btn--outline"
                      disabled={settingUp}
                      onClick={handleResetSetup}
                      style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', padding: 'var(--space-2) var(--space-4)', color: 'var(--red)' }}
                    >
                      🗑️ Reset
                    </button>
                  )}
                </div>
              </div>

            </div>
          </Panel>
        </div>

        {/* Voice Control Commands Panel */}
        <div className="col-span-12" style={{ marginTop: 'var(--space-6)' }}>
          <Panel title={t("VOICE CONTROL COMMAND ROUTING")} accent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {voiceCmds.map(c => (
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

        {/* VoiceMaster Features Showcase */}
        <div className="col-span-12" style={{ marginTop: 'var(--space-6)' }}>
          <Panel title={t("VOICEMASTER CONTROL SUITE ACTIONS")} accent>
            <DataSlab
              label={t("Channel Security Controls")}
              value="/voice lock • /voice unlock • /voice permit • /voice reject"
              sub={t("Manage member permissions, lock channels & kick unwanted users")}
              highlight
            />
            <DataSlab
              label={t("Channel Management & Customization")}
              value="/voice name • /voice limit • /voice bitrate • /voice invite"
              sub={t("Change room name, set user limit (1-99), adjust audio bitrate & send invites")}
            />
            <DataSlab
              label={t("Ownership Management")}
              value="/voice claim • /voice transfer"
              sub={t("Claim room ownership when host leaves or transfer ownership to friends")}
            />
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
