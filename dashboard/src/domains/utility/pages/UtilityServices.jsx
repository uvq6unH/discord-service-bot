import React, { useState, useEffect } from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import MasonryGrid from '../../../shared/primitives/MasonryGrid.jsx';
import { useCommands } from '../../core/hooks/useCommands.js';
import { useGuild } from '../../../shared/hooks/useGuild.js';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';
import { apiFetch } from '../../../api.js';
import { Wrench, Mic, Languages, BellRing, BarChart3, RefreshCw, Plus, Trash2, Flame, Check } from 'lucide-react';

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

const UTILITY_TYPES = ['translate', 'duolingo'];

const BUILTIN_COMMAND_NAMES = new Set([
  'ping', 'help', 'config', 'server', 'user', 'avatar', 'say', 'announce', 'translate', 'duolingo',
  'purge', 'warn', 'kick', 'ban', 'timeout', 'warnings', 'clearwarns', 'ticketpanel', 'rolepanel',
  'rank', 'leaderboard', 'balance', 'daily', 'lsd', 'lolprofile', 'lolmatch', 'lolchamp', 'lolitem',
  'lolrunes', 'lolpatch', 'lollink', 'lolunlink', 'tftlsd', 'tftprofile', 'tftmatch', 'tftlink',
  'tftunlink', 'lolquiz', 'play', 'skip', 'stop', 'pause', 'resume', 'loop', 'queue', 'np', 'volume', 'remove'
]);

function CustomCommandEditor({ commands, onChange }) {
  const customs = commands.filter(c => c.type === 'custom' && !BUILTIN_COMMAND_NAMES.has(c.name));
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

  const matchesCmd = (c, targetKey) => {
    if (c.type !== 'custom') return false;
    if (targetKey && c.id) return c.id === targetKey;
    if (targetKey && c.name) return c.name === targetKey;
    return false;
  };

  const remove = (targetKey) => onChange(commands.filter(c => !matchesCmd(c, targetKey)));

  const update = (targetKey, field, val) =>
    onChange(commands.map(c =>
      matchesCmd(c, targetKey) ? { ...c, [field]: val } : c
    ));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {customs.length === 0 && (
        <p style={{ color: 'var(--text-3)', fontSize: '13px', fontFamily: 'var(--font-mono)' }}>
          {t("[ NO CUSTOM ROUTED COMMANDS ]")}
        </p>
      )}
      {customs.map((c, idx) => {
        const itemKey = c.id || c.name || `custom_${idx}`;
        return (
          <div key={itemKey} style={{
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
                onChange={e => update(itemKey, 'name', e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, ''))}
              />
              <input
                className="form-input"
                style={{ flex: 1, fontSize: '12px' }}
                placeholder={t("Description metadata...")}
                value={c.description}
                onChange={e => update(itemKey, 'description', e.target.value)}
              />
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  className="toggle-switch__input"
                  checked={c.enabled ?? true}
                  onChange={e => update(itemKey, 'enabled', e.target.checked)}
                />
                <div className="toggle-switch__track">
                  <div className="toggle-switch__thumb" />
                </div>
              </label>
              <button className="btn btn--danger" onClick={() => remove(itemKey)} style={{ padding: 'var(--space-2) var(--space-3)' }}>
                ×
              </button>
            </div>
            <textarea
              className="form-input"
              rows={2}
              style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}
              placeholder={t("Command Response template. Variables: {user} {args} {server} {prefix}")}
              value={c.response}
              onChange={e => update(itemKey, 'response', e.target.value)}
            />
          </div>
        );
      })}
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

const COUNTER_TYPES = [
  { value: 'members', label: '👥 Total Members' },
  { value: 'users', label: '👤 Human Users (Excl. Bots)' },
  { value: 'bots', label: '🤖 Bots / Apps Count' },
  { value: 'roles', label: '🛡️ Total Roles' },
  { value: 'channels', label: '💬 Total Channels' },
  { value: 'textChannels', label: '📝 Text Channels' },
  { value: 'voiceChannels', label: '🔊 Voice Channels' },
  { value: 'categoryChannels', label: '📁 Category Channels' },
  { value: 'announcementChannels', label: '📢 Announcement Channels' },
  { value: 'stageChannels', label: '🎙️ Stage Channels' },
  { value: 'membersWithRole', label: '🎖️ Members with Role' },
  { value: 'membersWithoutRole', label: '⚪ Members without Role' },
  { value: 'emojis', label: '😃 Total Emojis' },
  { value: 'nitroBoosts', label: '🚀 Nitro Boosts' },
  { value: 'nitroBoostTier', label: '⭐ Nitro Boost Tier' },
  { value: 'onlineMembers', label: '🟢 Estimated Online Members' },
  { value: 'offlineMembers', label: '⚪ Estimated Offline Members' },
  { value: 'static', label: '📌 Static Text' }
];

const TEMPLATE_PRESETS = {
  members: '👥 Members: {count}',
  users: '👤 Users: {count}',
  bots: '🤖 Bots: {count}',
  roles: '🛡️ Roles: {count}',
  channels: '💬 Channels: {count}',
  textChannels: '📝 Text Channels: {count}',
  voiceChannels: '🔊 Voice Channels: {count}',
  categoryChannels: '📁 Categories: {count}',
  announcementChannels: '📢 Announcements: {count}',
  stageChannels: '🎙️ Stages: {count}',
  membersWithRole: '🎖️ Role Members: {count}',
  membersWithoutRole: '⚪ Non-Role Members: {count}',
  emojis: '😃 Emojis: {count}',
  nitroBoosts: '🚀 Boosts: {count}',
  nitroBoostTier: '⭐ Boost Tier: {count}',
  onlineMembers: '🟢 Online: {count}',
  offlineMembers: '⚪ Offline: {count}',
  static: '📌 Stat: {count}'
};

function CountersManager({ guildId, roles = [] }) {
  const { t } = useLanguage();
  const [counters, setCounters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Form state
  const [type, setType] = useState('members');
  const [channelNameTemplate, setChannelNameTemplate] = useState('👥 Members: {count}');
  const [isGoal, setIsGoal] = useState(false);
  const [goalsStr, setGoalsStr] = useState('100, 250, 500, 1000');
  const [roleId, setRoleId] = useState('');

  const loadCounters = async () => {
    if (!guildId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/counters`);
      const data = await res.json();
      setCounters(data.counters || []);
    } catch (err) {
      console.error('Failed to load counters:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCounters();
  }, [guildId]);

  const handleAutoSetup = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/counters`, {
        method: 'POST',
        body: { mode: 'default' }
      });
      const data = await res.json();
      setCounters(data.counters || []);
      setStatusMsg({ success: true, message: 'Đã tự động khởi tạo 2 kênh Counter mặc định (Members & Users)!' });
    } catch (err) {
      setStatusMsg({ success: false, message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCounter = async (e) => {
    e.preventDefault();
    if (!type) return;

    const newCounter = {
      id: `counter_${type}_${Date.now()}`,
      type,
      channelNameTemplate: channelNameTemplate.trim() || (isGoal ? '🎯 Goal: {count}/{goal}' : '👥 Count: {count}'),
      isGoal,
      goals: isGoal ? goalsStr.split(',').map(g => parseInt(g.trim(), 10)).filter(n => !isNaN(n)) : [],
      currentGoalIndex: 0,
      roleId: ['membersWithRole', 'membersWithoutRole'].includes(type) ? roleId : '',
      enabled: true
    };

    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/counters`, {
        method: 'POST',
        body: { counter: newCounter }
      });
      const data = await res.json();
      setCounters(data.counters || []);
      setStatusMsg({ success: true, message: 'Đã tạo kênh Counter mới thành công!' });
      setChannelNameTemplate('👥 Members: {count}');
      setIsGoal(false);
    } catch (err) {
      setStatusMsg({ success: false, message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCounter = async (counterId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa kênh Counter này?')) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/counters/${counterId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      setCounters(data.counters || []);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setStatusMsg(null);
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/counters/sync`, {
        method: 'POST'
      });
      const data = await res.json();
      setCounters(data.counters || []);
      setStatusMsg({ success: true, message: data.message || 'Đã đồng bộ các kênh Counter!' });
    } catch (err) {
      setStatusMsg({ success: false, message: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleCounter = async (counter) => {
    const updated = { ...counter, enabled: !counter.enabled };
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/counters`, {
        method: 'POST',
        body: { counter: updated }
      });
      const data = await res.json();
      setCounters(data.counters || []);
    } catch (err) {
      alert(err.message);
    }
  };

  const insertTag = (tag) => {
    if (!channelNameTemplate.includes(tag)) {
      setChannelNameTemplate(prev => `${prev} ${tag}`.trim());
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Top Header & Sync Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '13px', color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <BarChart3 size={16} color="var(--accent)" />
            {t("Discord Live Stat Counters & Goal Milestones")}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
            Hiển thị thống kê Server dạng kênh Voice tự động cập nhật mỗi 10–15 phút.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={loading}
            onClick={handleAutoSetup}
            style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}
          >
            ⚡ Auto-Setup Default (2 Counters)
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={syncing || loading}
            onClick={handleSyncNow}
            style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={syncing ? 'spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Counters Now'}
          </button>
        </div>
      </div>

      {statusMsg && (
        <div style={{
          padding: 'var(--space-3)',
          background: statusMsg.success ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 71, 87, 0.08)',
          border: `1px solid ${statusMsg.success ? 'var(--accent)' : 'var(--red)'}`,
          color: statusMsg.success ? 'var(--accent)' : 'var(--red)',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px'
        }}>
          {statusMsg.success ? '✔ ' : '✖ '}{statusMsg.message}
        </div>
      )}

      {/* Add New Counter Form */}
      <form onSubmit={handleCreateCounter} style={{
        padding: 'var(--space-4)',
        background: 'var(--surface-1)',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)'
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '12px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={14} />
          {t("THÊM KÊNH COUNTER / GOAL MỚI")}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>Counter Type</label>
            <select
              className="form-input"
              value={type}
              onChange={e => {
                const newType = e.target.value;
                setType(newType);
                const preset = TEMPLATE_PRESETS[newType] || '👥 Count: {count}';
                if (isGoal) {
                  setChannelNameTemplate(preset.replace('{count}', '{count}/{goal}'));
                } else {
                  setChannelNameTemplate(preset);
                }
              }}
              style={{ fontSize: '12px' }}
            >
              {COUNTER_TYPES.map(ct => (
                <option key={ct.value} value={ct.value}>{ct.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', margin: 0 }}>
                Channel Name Template
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <span
                  onClick={() => insertTag('{count}')}
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--accent)', cursor: 'pointer', fontSize: '10px', padding: '1px 5px', fontFamily: 'var(--font-mono)' }}
                >
                  +{`{count}`}
                </span>
                <span
                  onClick={() => insertTag('{goal}')}
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--amber)', cursor: 'pointer', fontSize: '10px', padding: '1px 5px', fontFamily: 'var(--font-mono)' }}
                >
                  +{`{goal}`}
                </span>
              </div>
            </div>
            <input
              className="form-input"
              value={channelNameTemplate}
              onChange={e => setChannelNameTemplate(e.target.value)}
              placeholder="👥 Members: {count}"
              style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', marginTop: '4px' }}
            />
          </div>
        </div>

        {['membersWithRole', 'membersWithoutRole'].includes(type) && (
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>Target Role</label>
            <select
              className="form-input"
              value={roleId}
              onChange={e => setRoleId(e.target.value)}
              style={{ fontSize: '12px' }}
            >
              <option value="">-- Chọn Role --</option>
              {roles.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
            <input
              type="checkbox"
              checked={isGoal}
              onChange={e => {
                const checked = e.target.checked;
                setIsGoal(checked);
                if (checked && !channelNameTemplate.includes('{goal}')) {
                  setChannelNameTemplate(prev => prev.includes('{count}') ? prev.replace('{count}', '{count}/{goal}') : `${prev} {count}/{goal}`);
                }
              }}
            />
            <span>Is Goal Counter? (Theo dõi cột mốc)</span>
          </label>

          {isGoal && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
              <span style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>Milestones:</span>
              <input
                className="form-input"
                value={goalsStr}
                onChange={e => setGoalsStr(e.target.value)}
                placeholder="100, 250, 500, 1000"
                style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', flex: 1 }}
              />
            </div>
          )}
        </div>

        <button type="submit" className="btn btn--primary" disabled={loading} style={{ alignSelf: 'flex-end', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
          + Add Counter Channel
        </button>
      </form>

      {/* Active Counters List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
          ACTIVE COUNTERS ({counters.length}):
        </div>

        {counters.length === 0 ? (
          <div style={{ padding: 'var(--space-4)', background: 'var(--surface-1)', border: '1px dashed var(--border)', textAlign: 'center', color: 'var(--text-3)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
            Chưa có kênh Counter nào. Hãy tạo ở form trên hoặc bấm "Auto-Setup Default".
          </div>
        ) : (
          counters.map((c, i) => (
            <div key={c.id || i} style={{
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-3)'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '13px', color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: c.enabled !== false ? 'var(--accent)' : 'var(--text-3)' }}>
                    🔊 {c.evaluatedName || c.channelNameTemplate}
                  </span>
                  {c.isGoal && (
                    <span style={{ background: 'rgba(255, 170, 0, 0.15)', color: 'var(--amber)', fontSize: '10px', padding: '1px 6px', borderRadius: '3px' }}>
                      GOAL MILESTONE
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '11px', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span>Type: <code>{c.type}</code></span>
                  <span>Template: <code>{c.channelNameTemplate}</code></span>
                  {c.formattedCount !== undefined && (
                    <span style={{ color: 'var(--accent)' }}>
                      Current: <strong>{c.formattedCount}</strong>
                    </span>
                  )}
                  {c.isGoal && c.formattedGoal && (
                    <span style={{ color: 'var(--amber)' }}>
                      Target Goal: <strong>{c.formattedGoal}</strong>
                    </span>
                  )}
                  <span>
                    Status: {c.channelExists ? '🟢 Connected' : '🟡 Pending Sync'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    className="toggle-switch__input"
                    checked={c.enabled !== false}
                    onChange={() => handleToggleCounter(c)}
                  />
                  <div className="toggle-switch__track">
                    <div className="toggle-switch__thumb" />
                  </div>
                </label>

                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => handleDeleteCounter(c.id)}
                  style={{ padding: 'var(--space-1) var(--space-2)' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

import { useLocation } from 'react-router-dom';

export default function UtilityServicesPage() {
  const { config, loading, updateConfig } = useCommands();
  const { guildData, selectedGuild } = useGuild();
  const location = useLocation();
  const highlight = location.state?.highlight;
  const { t } = useLanguage();

  if (loading || !config) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        {t("LAUNCHING UTILITY SERVICES CONSOLE...")}
      </div>
    );
  }

  const roles = guildData?.roles ?? [];
  const utilityCmds = (config.core?.commands ?? []).filter(c => UTILITY_TYPES.includes(c.type));
  const customsCount = (config.core?.commands ?? []).filter(c => c.type === 'custom').length;
  const autoRepliesCount = (config.autoReplies ?? []).length;
  const serverName = selectedGuild?.name ? selectedGuild.name.toUpperCase() : '';

  return (
    <Workspace>
      <HeaderZone
        title={serverName ? `${serverName} // UTILITY SERVICES` : 'UTILITY SERVICES'}
        subtitle={t("Manage language translation, Duolingo learning, bot mention reactions, custom responders, and keyword listeners.")}
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

      {/* Feature Panels Masonry Grid */}
      <MasonryGrid cols={2} gap={20}>
        {/* Mention React Panel */}
        <Panel title={t("BOT MENTION REACT ENGINE")} accent className={highlight === 'mentionreact' ? 'flash-target' : ''}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '13px', color: 'var(--text-1)' }}>
                  {t("Auto React When Mentioned")}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
                  {t("Automatically react with an emoji when the bot or its role is mentioned in chat")}
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  className="toggle-switch__input"
                  checked={Boolean(config.mentionReactEnabled)}
                  onChange={(e) => updateConfig({ mentionReactEnabled: e.target.checked })}
                />
                <div className="toggle-switch__track">
                  <div className="toggle-switch__thumb" />
                </div>
              </label>
            </div>

            {config.mentionReactEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <label className="form-label" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                  {t("Reaction Emoji")}
                </label>
                <input
                  className="form-input"
                  style={{ fontSize: '14px', width: '120px', fontFamily: 'var(--font-mono)' }}
                  value={config.mentionReactEmoji || '👋'}
                  onChange={(e) => updateConfig({ mentionReactEmoji: e.target.value })}
                  placeholder="👋"
                />
              </div>
            )}
          </div>
        </Panel>

        {/* Auto Reply Panels */}
        <Panel key="autoreplies" id="autoreplies" title={t("KEYWORD AUTO-RESPONDERS")} accent className={highlight === 'autoreplies' ? 'flash-target' : ''}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--border)' }}>
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 'bold', color: 'var(--text-1)' }}>
                {t("ENABLE AUTO-RESPONDERS")}
              </span>
              <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
                {t("Master switch for keyword triggered auto replies")}
              </div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                className="toggle-switch__input"
                checked={config.autoReplyEnabled ?? true}
                onChange={e => updateConfig({ autoReplyEnabled: e.target.checked })}
              />
              <div className="toggle-switch__track">
                <div className="toggle-switch__thumb" />
              </div>
            </label>
          </div>
          <AutoReplyEditor
            replies={config.autoReplies ?? []}
            onChange={v => updateConfig({ autoReplies: v })}
          />
        </Panel>

        {/* Custom Commands Panels */}
        <Panel key="customcmds" id="customcmds" title={t("CUSTOM RESPONSE OPERATORS")} accent className={highlight === 'customcmds' ? 'flash-target' : ''}>
          <CustomCommandEditor
            commands={config.core?.commands ?? []}
            onChange={v => updateConfig({ core: { commands: v } })}
          />
        </Panel>
      </MasonryGrid>

      {/* Arcane Counters & Goals Panel (Full Width) */}
      <div className="grid-12" style={{ marginTop: 'var(--space-6)' }}>
        <div className="col-span-12">
          <Panel title={t("SERVER COUNTERS & GOALS (ARCANE STATS ENGINE)")} accent id="counters" className={highlight === 'counters' ? 'flash-target' : ''}>
            <CountersManager guildId={selectedGuild?.id} roles={roles} />
          </Panel>
        </div>
      </div>

      {/* Utility Commands Routing Panel (Full Width) */}
      <div className="grid-12" style={{ marginTop: 'var(--space-6)' }}>
        <div className="col-span-12">
          <Panel title={t("UTILITY COMMANDS ROUTING")} accent className={highlight === 'utilitycmds' ? 'flash-target' : ''}>
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
