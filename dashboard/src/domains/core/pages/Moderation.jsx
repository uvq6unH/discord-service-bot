import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import MasonryGrid from '../../../shared/primitives/MasonryGrid.jsx';
import PermissionGuard from '../components/PermissionGuard.jsx';
import { useModeration } from '../hooks/useModeration.js';
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
                const handleRoleToggle = (roleId) => {
                  const nextRoles = active
                    ? allowedRoles.filter(id => id !== roleId && id !== role.name)
                    : [...allowedRoles, roleId];
                  handleFieldChange('allowedRoles', nextRoles);
                };
                return (
                  <button
                    key={role.id}
                    type="button"
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

function SelfRolePanelsManager({ panels = [], legacyRoles = [], allRoles = [], channels = [], onUpdatePanels, selectedGuildId }) {
  const { t } = useLanguage();
  const [activePanelIdx, setActivePanelIdx] = useState(0);
  const [posting, setPosting] = useState(false);

  const textChannels = channels.filter(c => c.type === 0 || c.type === 5);
  const visibleRoles = allRoles.filter(r => r.name !== '@everyone');

  // Fallback if panels is empty but legacyRoles exist
  const currentPanels = panels.length > 0 ? panels : [
    {
      id: 'panel_default',
      title: '🎮 CLAIM YOUR ROLES',
      description: 'Nhấp vào các nút bên dưới để nhận hoặc hủy Role:',
      channelId: '',
      color: '#5865F2',
      roles: legacyRoles
    }
  ];

  const safeIdx = Math.min(activePanelIdx, Math.max(0, currentPanels.length - 1));
  const activePanel = currentPanels[safeIdx] ?? currentPanels[0];

  const updateActivePanel = (patch) => {
    const nextPanels = currentPanels.map((p, idx) => {
      if (idx === safeIdx) {
        return { ...p, ...patch };
      }
      return p;
    });
    onUpdatePanels(nextPanels);
  };

  const addPanel = () => {
    const newPanel = {
      id: `panel_${Date.now()}`,
      title: `Group ${currentPanels.length + 1} Roles`,
      description: 'Click a button below to toggle your role.',
      channelId: '',
      color: '#5865F2',
      roles: []
    };
    const nextPanels = [...currentPanels, newPanel];
    onUpdatePanels(nextPanels);
    setActivePanelIdx(nextPanels.length - 1);
  };

  const removeActivePanel = () => {
    if (currentPanels.length <= 1) {
      toast.error('Cần giữ ít nhất 1 nhóm Self-Role Panel!');
      return;
    }
    const nextPanels = currentPanels.filter((_, idx) => idx !== safeIdx);
    onUpdatePanels(nextPanels);
    setActivePanelIdx(Math.max(0, safeIdx - 1));
  };

  const handlePostPanel = async () => {
    if (!activePanel.channelId) {
      toast.error('Vui lòng chọn Kênh Discord trước khi đăng Panel!');
      return;
    }
    if (!activePanel.roles || activePanel.roles.length === 0) {
      toast.error('Vui lòng thêm ít nhất 1 Role vào nhóm Panel này!');
      return;
    }

    setPosting(true);
    try {
      const res = await api.postSelfRolePanel(selectedGuildId, activePanel.id);
      if (res.error) {
        toast.error(res.error);
      } else {
        const targetChan = textChannels.find(c => c.id === activePanel.channelId);
        toast.success(`🚀 Đã đăng thành công Panel "${activePanel.title}" vào kênh #${targetChan?.name ?? 'Discord'}!`);
      }
    } catch (err) {
      toast.error(`Lỗi đăng Panel: ${err.message}`);
    } finally {
      setPosting(false);
    }
  };

  const addRoleToPanel = () => {
    const currentRoles = activePanel.roles ?? [];
    updateActivePanel({
      roles: [...currentRoles, { label: '', roleId: '', emoji: '', style: 'Secondary' }]
    });
  };

  const updateRoleInPanel = (roleIdx, patch) => {
    const currentRoles = [...(activePanel.roles ?? [])];
    currentRoles[roleIdx] = { ...currentRoles[roleIdx], ...patch };
    updateActivePanel({ roles: currentRoles });
  };

  const removeRoleFromPanel = (roleIdx) => {
    const currentRoles = (activePanel.roles ?? []).filter((_, idx) => idx !== roleIdx);
    updateActivePanel({ roles: currentRoles });
  };

  const presetColors = ['#5865F2', '#ED4245', '#57F287', '#FEE75C', '#EB459E', '#202225'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Panel Group Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-3)' }}>
        {currentPanels.map((p, idx) => (
          <button
            key={p.id || idx}
            type="button"
            className={`btn ${idx === safeIdx ? 'btn--primary' : 'btn--secondary'}`}
            style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', padding: 'var(--space-1-5) var(--space-3)' }}
            onClick={() => setActivePanelIdx(idx)}
          >
            {p.title || `Group ${idx + 1}`} ({p.roles?.length ?? 0})
          </button>
        ))}
        <button
          type="button"
          className="btn btn--secondary"
          style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', padding: 'var(--space-1-5) var(--space-3)' }}
          onClick={addPanel}
        >
          + {t("NEW GROUP")}
        </button>
      </div>

      {/* Active Panel Config Box */}
      <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        
        {/* Top Actions & Channel Target */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <label className="form-label" style={{ fontSize: '10px' }}>{t("Target Discord Channel")}</label>
            <select
              className="form-select"
              style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}
              value={activePanel.channelId ?? ''}
              onChange={e => updateActivePanel({ channelId: e.target.value })}
            >
              <option value="">{t("-- Select Target Channel --")}</option>
              {textChannels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: '16px' }}>
            <button
              type="button"
              className="btn btn--danger"
              style={{ padding: 'var(--space-2) var(--space-3)', fontSize: '11px' }}
              onClick={removeActivePanel}
              title={t("Delete Panel Group")}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Embed Details: Title, Color, Description */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <label className="form-label" style={{ fontSize: '10px' }}>{t("Embed Panel Title")}</label>
              <IMEInput
                className="form-input"
                style={{ fontSize: '12px' }}
                value={activePanel.title}
                placeholder="🎮 CLAIM YOUR ROLES"
                onChange={e => updateActivePanel({ title: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '10px' }}>{t("Embed Accent Color")}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1-5)' }}>
                {presetColors.map(c => (
                  <div
                    key={c}
                    onClick={() => updateActivePanel({ color: c })}
                    style={{
                      width: '24px',
                      height: '24px',
                      backgroundColor: c,
                      cursor: 'pointer',
                      border: activePanel.color === c ? '2px solid var(--text-1)' : '1px solid var(--border)',
                      boxSizing: 'border-box'
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={activePanel.color || '#5865F2'}
                  onChange={e => updateActivePanel({ color: e.target.value })}
                  style={{ width: '28px', height: '28px', padding: 0, border: '1px solid var(--border)', cursor: 'pointer', background: 'none' }}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '10px' }}>{t("Embed Description Message")}</label>
            <textarea
              className="form-input"
              rows={2}
              style={{ fontSize: '12px', resize: 'vertical', fontFamily: 'var(--font-body)' }}
              value={activePanel.description}
              placeholder="Click a button below to toggle your role..."
              onChange={e => updateActivePanel({ description: e.target.value })}
            />
          </div>
        </div>

        {/* Role Buttons Config List */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
          <label className="form-label" style={{ fontSize: '10px', marginBottom: 'var(--space-2)' }}>{t("Role Buttons Config")}</label>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {(activePanel.roles ?? []).map((r, roleIdx) => (
              <div key={roleIdx} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface-2)', padding: 'var(--space-2)', border: '1px solid var(--border)' }}>
                
                {/* Emoji */}
                <input
                  className="form-input"
                  style={{ width: '50px', fontSize: '12px', textAlign: 'center' }}
                  placeholder="🎯"
                  value={r.emoji ?? ''}
                  onChange={e => updateRoleInPanel(roleIdx, { emoji: e.target.value })}
                />

                {/* Label */}
                <IMEInput
                  className="form-input"
                  style={{ flex: 1, minWidth: '120px', fontSize: '12px' }}
                  placeholder={t("Button Label")}
                  value={r.label}
                  onChange={e => updateRoleInPanel(roleIdx, { label: e.target.value })}
                />

                {/* Role select */}
                <select
                  className="form-select"
                  style={{ width: '150px', fontSize: '12px' }}
                  value={r.roleId}
                  onChange={e => updateRoleInPanel(roleIdx, { roleId: e.target.value })}
                >
                  <option value="">{t("-- Select Role --")}</option>
                  {visibleRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>

                {/* Style select */}
                <select
                  className="form-select"
                  style={{ width: '110px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}
                  value={r.style ?? 'Secondary'}
                  onChange={e => updateRoleInPanel(roleIdx, { style: e.target.value })}
                >
                  <option value="Primary">BLURPLE</option>
                  <option value="Secondary">GREY</option>
                  <option value="Success">GREEN</option>
                  <option value="Danger">RED</option>
                </select>

                {/* Delete button */}
                <button
                  type="button"
                  className="btn btn--danger"
                  style={{ padding: 'var(--space-1-5) var(--space-2)' }}
                  onClick={() => removeRoleFromPanel(roleIdx)}
                >
                  ×
                </button>
              </div>
            ))}

            {(activePanel.roles ?? []).length === 0 && (
              <p style={{ color: 'var(--text-3)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                {t("[ NO ROLES ADDED TO THIS PANEL ]")}
              </p>
            )}

            <button
              type="button"
              className="btn btn--secondary"
              style={{ alignSelf: 'flex-start', marginTop: 'var(--space-2)', fontSize: '11px' }}
              onClick={addRoleToPanel}
            >
              + {t("ADD ROLE BUTTON")}
            </button>
          </div>
        </div>

        {/* POST PANEL DIRECTLY TO DISCORD BUTTON */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-4)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn--primary"
            disabled={posting}
            style={{ padding: 'var(--space-2-5) var(--space-5)', fontFamily: 'var(--font-mono)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
            onClick={handlePostPanel}
          >
            🚀 {posting ? t("POSTING TO DISCORD...") : t("POST PANEL TO DISCORD CHANNEL")}
          </button>
        </div>

      </div>
    </div>
  );
}

export default function ModerationPage() {
  const location = useLocation();
  const highlight = location.state?.highlight;
  const { selectedGuild } = useGuild();
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

  const serverName = selectedGuild?.name ? selectedGuild.name.toUpperCase() : '';

  return (
    <PermissionGuard role={userRole} allowed={['owner', 'admin', 'moderator']}>
      <Workspace>
        {/* 1. Header Zone */}
        <HeaderZone
          title={serverName ? `${serverName} // AUTOMATED MODERATION CONTROL` : 'AUTOMATED MODERATION CONTROL'}
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
        <MasonryGrid cols={2} gap={20}>
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: mod.enabled ? 1 : 0.4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-2)' }}>
                  {t("AUTO-DELETE BLOCKED MESSAGES")}
                </span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    className="toggle-switch__input"
                    disabled={!mod.enabled}
                    checked={config.deleteBlockedMessages ?? true}
                    onChange={e => updateConfig({ deleteBlockedMessages: e.target.checked })}
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

          <Panel title={t("TICKET CONSOLE SYSTEM")} className={highlight === 'tickets' ? 'flash-target' : ''}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 'bold', color: 'var(--text-1)' }}>
                {t("ENABLE TICKET SYSTEM")}
              </span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  className="toggle-switch__input"
                  checked={config.ticketsEnabled ?? false}
                  onChange={e => updateConfig({ ticketsEnabled: e.target.checked })}
                />
                <div className="toggle-switch__track">
                  <div className="toggle-switch__thumb" />
                </div>
              </label>
            </div>

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

          <Panel title={t("WORD FILTER DICTIONARY")} className={highlight === 'wordfilter' ? 'flash-target' : ''}>
            <div className="form-group">
              <label className="form-label">{t("Forbidden Words Registry")}</label>
              <BadWordsEditor
                words={config.badWords ?? []}
                onChange={v => updateConfig({ badWords: v })}
              />
            </div>
          </Panel>

          <Panel title={t("SELF-ROLE ASSIGNMENT")} className={highlight === 'selfroles' ? 'flash-target' : ''}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 'bold', color: 'var(--text-1)' }}>
                {t("ENABLE SELF-ROLE SYSTEM")}
              </span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  className="toggle-switch__input"
                  checked={config.rolesEnabled ?? false}
                  onChange={e => updateConfig({ rolesEnabled: e.target.checked })}
                />
                <div className="toggle-switch__track">
                  <div className="toggle-switch__thumb" />
                </div>
              </label>
            </div>

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
              <label className="form-label">{t("Self-Role Panel Groups Config & Direct Discord Dispatcher")}</label>
              <SelfRolePanelsManager
                panels={config.selfRolePanels ?? []}
                legacyRoles={config.selfRoles ?? []}
                allRoles={roles}
                channels={channels}
                selectedGuildId={selectedGuild?.id}
                onUpdatePanels={newPanels => updateConfig({ selfRolePanels: newPanels })}
              />
            </div>
          </Panel>
        </MasonryGrid>

        {/* Moderation Commands Panel */}
        <div className="grid-12" style={{ marginTop: 'var(--space-5)' }}>
          <div className="col-span-12">
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
