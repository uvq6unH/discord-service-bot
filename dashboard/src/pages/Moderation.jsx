import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, Shield, Bot, Ticket, Tag, AlertTriangle, Link2Off } from 'lucide-react';
import { useGuild } from '../contexts/GuildContext.jsx';
import { Spinner, Toggle, ChannelSelect, RoleSelect, PermissionGuard } from '../components/ui.jsx';

// ── SecBlock — security panel with threat-level left border ──────────────────
function SecBlock({ title, icon: Icon, enabled, onToggle, level = 'neutral', children }) {
  const levelColors = {
    ok:      'var(--green)',
    warn:    'var(--yellow)',
    threat:  'var(--red)',
    neutral: 'var(--border-strong)',
    accent:  'var(--accent)',
  };
  const borderColor = levelColors[level] ?? levelColors.neutral;
  const isDisabled = enabled === false;

  return (
    <div style={{
      background: 'var(--surface-1)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: 'var(--r3)',
      overflow: 'hidden',
      opacity: isDisabled ? 0.5 : 1,
      transition: 'opacity 150ms',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--s2)',
        padding: '10px 14px',
        background: 'var(--surface-2)',
        borderBottom: '1px solid var(--border)',
      }}>
        <Icon size={14} style={{ color: borderColor, flexShrink: 0 }} strokeWidth={2} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.01em', flex: 1 }}>
          {title}
        </span>
        {onToggle != null && (
          <div className={`toggle ${enabled ? 'toggle--on' : ''}`}
            onClick={() => onToggle(!enabled)}
            style={{ cursor: 'pointer' }}>
            <div className="toggle-thumb" />
          </div>
        )}
      </div>
      {/* Body */}
      <div style={{
        padding: 'var(--s4)',
        display: 'flex', flexDirection: 'column', gap: 'var(--s3)',
        pointerEvents: isDisabled ? 'none' : 'auto',
      }}>
        {children}
      </div>
    </div>
  );
}

// ── StatusRow — inline toggle with descriptive label ─────────────────────────
function StatusRow({ label, hint, checked, onChange, danger }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s4)',
      padding: '8px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, color: danger && checked ? 'var(--yellow)' : 'var(--text-1)', fontWeight: 500 }}>
          {label}
        </span>
        {hint && <span style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>{hint}</span>}
      </div>
      <div
        className={`toggle ${checked ? 'toggle--on' : ''}`}
        onClick={() => onChange(!checked)}
        style={{ cursor: 'pointer', flexShrink: 0 }}
      >
        <div className="toggle-thumb" />
      </div>
    </div>
  );
}

// ── BadWords editor ───────────────────────────────────────────────────────────
function BadWordsEditor({ words, onChange }) {
  const [input, setInput] = useState('');
  const add = () => {
    const w = input.trim().toLowerCase();
    if (!w || words.includes(w)) { setInput(''); return; }
    onChange([...words, w]);
    setInput('');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minHeight: 28 }}>
        {words.map(w => (
          <span key={w} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,.22)',
            color: 'var(--red)', borderRadius: 3, padding: '2px 8px',
            fontSize: 11, fontFamily: 'var(--font-mono)',
          }}>
            {w}
            <button onClick={() => onChange(words.filter(x => x !== w))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}>×</button>
          </span>
        ))}
        {words.length === 0 && <span style={{ color: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>— trống —</span>}
      </div>
      <div style={{ display: 'flex', gap: 'var(--s2)' }}>
        <input className="form-input" style={{ flex: 1, fontSize: 12 }}
          placeholder="Thêm từ cấm…" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="btn btn-secondary btn-sm" onClick={add}>Thêm</button>
      </div>
    </div>
  );
}

// ── SelfRole editor ───────────────────────────────────────────────────────────
function SelfRoleEditor({ roles, allRoles, onChange }) {
  const visible = allRoles.filter(r => r.name !== '@everyone');
  const add = () => onChange([...roles, { label: '', roleId: '' }]);
  const remove = (i) => onChange(roles.filter((_, idx) => idx !== i));
  const update = (i, field, val) => {
    const next = [...roles]; next[i] = { ...next[i], [field]: val }; onChange(next);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
      {roles.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 28px', gap: 'var(--s2)', alignItems: 'center' }}>
          <input className="form-input" style={{ fontSize: 12 }} placeholder="Nhãn nút"
            value={r.label} onChange={e => update(i, 'label', e.target.value)} />
          <select className="form-select" style={{ fontSize: 12 }} value={r.roleId} onChange={e => update(i, 'roleId', e.target.value)}>
            <option value="">-- Role --</option>
            {visible.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
          <button className="btn btn-xs btn-danger" onClick={() => remove(i)} style={{ padding: '4px 6px' }}>×</button>
        </div>
      ))}
      {roles.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: 12 }}>Chưa có self-role.</p>}
      <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={add}>+ Thêm role</button>
    </div>
  );
}

// ── Threat summary bar ────────────────────────────────────────────────────────
function ThreatBar({ config }) {
  const threats = [
    { label: 'AutoMod',  active: config.autoModEnabled },
    { label: 'Anti-link', active: config.antiLinkEnabled },
    { label: 'Word filter', active: (config.badWords?.length ?? 0) > 0 },
    { label: 'Mod log',  active: !!config.logChannelId },
  ];
  const activeCount = threats.filter(t => t.active).length;
  const level = activeCount >= 3 ? 'ok' : activeCount >= 1 ? 'warn' : 'threat';
  const levelColor = level === 'ok' ? 'var(--green)' : level === 'warn' ? 'var(--yellow)' : 'var(--red)';
  const levelLabel = level === 'ok' ? 'PROTECTED' : level === 'warn' ? 'PARTIAL' : 'EXPOSED';

  return (
    <div style={{
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      borderTop: `2px solid ${levelColor}`,
      borderRadius: 'var(--r3)',
      padding: 'var(--s4)',
      display: 'flex', flexDirection: 'column', gap: 'var(--s3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={16} style={{ color: levelColor }} strokeWidth={2} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '.02em' }}>
            Threat Status
          </span>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '.1em',
          color: levelColor, fontFamily: 'var(--font-mono)',
          padding: '2px 8px', borderRadius: 3,
          background: level === 'ok' ? 'var(--green-dim)' : level === 'warn' ? 'var(--yellow-dim)' : 'var(--red-dim)',
          border: `1px solid ${levelColor}22`,
        }}>
          {levelLabel}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 'var(--s2)' }}>
        {threats.map(t => (
          <div key={t.label} style={{
            flex: 1, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
          }}>
            <div style={{
              width: '100%', height: 3, borderRadius: 2,
              background: t.active ? levelColor : 'var(--surface-4)',
            }} />
            <span style={{ fontSize: 9, color: t.active ? 'var(--text-2)' : 'var(--text-3)', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
              {t.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ModerationPage() {
  const { config, guildData, configLoading, updateConfig, userRole } = useGuild();
  const user = { role: userRole };

  if (configLoading || !config) return <div className="page-loading"><Spinner /></div>;

  const textChannels = (guildData?.channels ?? []).filter(c => c.type === 0 || c.type === 5);
  const roles = guildData?.roles ?? [];
  const categoryChannels = (guildData?.channels ?? []).filter(c => c.type === 4);

  const autoModOn = config.autoModEnabled ?? false;
  const antiLinkOn = config.antiLinkEnabled ?? false;
  const badWordCount = config.badWords?.length ?? 0;

  return (
    <PermissionGuard user={user} required="moderator">
    <div className="page">
      <div className="page-header">
        <div className="page-header-row">
          <h1 className="page-title">Security</h1>
        </div>
        <p className="page-subtitle">Kiểm duyệt, AutoMod, Ticket, Self-role</p>
      </div>

      {/* ── Threat status bar — full width ── */}
      <ThreatBar config={config} />

      {/* ── Asymmetric 2-col: left wider (automod) right narrower (tools) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 'var(--s4)', alignItems: 'start' }}>

        {/* LEFT — core security */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>

          {/* Mod commands */}
          <SecBlock
            title="Lệnh kiểm duyệt"
            icon={ShieldCheck}
            level={config.moderationEnabled ? 'ok' : 'neutral'}
            enabled={config.moderationEnabled}
            onToggle={v => updateConfig({ moderationEnabled: v })}
          >
            <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6, margin: 0 }}>
              Cho phép lệnh{' '}
              {['/warn', '/kick', '/ban', '/timeout', '/warnings', '/clearwarns'].map(cmd => (
                <code key={cmd} style={{
                  fontSize: 11, background: 'var(--surface-3)', padding: '0 4px',
                  borderRadius: 3, color: 'var(--text-2)', marginRight: 3,
                }}>
                  {cmd}
                </code>
              ))}
            </p>
            <ChannelSelect
              label="Log channel"
              value={config.logChannelId}
              onChange={v => updateConfig({ logChannelId: v })}
              channels={textChannels}
              placeholder="-- Không log --"
            />
          </SecBlock>

          {/* AutoMod */}
          <SecBlock
            title="AutoMod"
            icon={Bot}
            level={autoModOn ? (antiLinkOn || badWordCount > 0 ? 'ok' : 'warn') : 'neutral'}
            enabled={config.autoModEnabled}
            onToggle={v => updateConfig({ autoModEnabled: v })}
          >
            <StatusRow
              label="Xóa tin nhắn vi phạm"
              hint="Xóa ngay khi phát hiện từ cấm hoặc link"
              checked={config.deleteBlockedMessages ?? true}
              onChange={v => updateConfig({ deleteBlockedMessages: v })}
            />
            <StatusRow
              label="Chặn link ngoài"
              hint="Chặn tất cả URL http/https và discord.gg"
              checked={antiLinkOn}
              onChange={v => updateConfig({ antiLinkEnabled: v })}
              danger
            />
            <div>
              <label className="form-label" style={{ marginBottom: 6, display: 'block' }}>
                Cảnh báo khi vi phạm
              </label>
              <input
                className="form-input"
                style={{ fontSize: 12 }}
                value={config.blockedMessage ?? ''}
                onChange={e => updateConfig({ blockedMessage: e.target.value })}
                placeholder="{user}, tin nhắn vi phạm nội quy."
              />
              <span className="form-hint" style={{ marginTop: 4, display: 'block' }}>
                Template: <code>{'{user}'}</code>
              </span>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label className="form-label" style={{ margin: 0 }}>Từ cấm</label>
                {badWordCount > 0 && (
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--red)', fontWeight: 700 }}>
                    {badWordCount} từ
                  </span>
                )}
              </div>
              <BadWordsEditor words={config.badWords ?? []} onChange={v => updateConfig({ badWords: v })} />
            </div>
          </SecBlock>

        </div>

        {/* RIGHT — support tools */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>

          {/* Ticket system */}
          <SecBlock
            title="Ticket System"
            icon={Ticket}
            level={config.ticketsEnabled ? 'accent' : 'neutral'}
            enabled={config.ticketsEnabled}
            onToggle={v => updateConfig({ ticketsEnabled: v })}
          >
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Category</label>
              <select className="form-select" style={{ fontSize: 12 }}
                value={config.ticketCategoryId ?? ''}
                onChange={e => updateConfig({ ticketCategoryId: e.target.value })}>
                <option value="">-- Không chọn --</option>
                {categoryChannels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <ChannelSelect label="Log channel" value={config.ticketLogChannelId}
              onChange={v => updateConfig({ ticketLogChannelId: v })} channels={textChannels} />
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Tiêu đề panel</label>
              <input className="form-input" style={{ fontSize: 12 }}
                value={config.ticketPanelTitle ?? ''}
                onChange={e => updateConfig({ ticketPanelTitle: e.target.value })}
                placeholder="Support tickets" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nội dung panel</label>
              <textarea className="form-input" rows={2} style={{ fontSize: 12 }}
                value={config.ticketPanelMessage ?? ''}
                onChange={e => updateConfig({ ticketPanelMessage: e.target.value })}
                placeholder="Cần hỗ trợ? Mở ticket để được giúp." />
            </div>
          </SecBlock>

          {/* Self-role */}
          <SecBlock
            title="Self-Role"
            icon={Tag}
            level={config.rolesEnabled ? 'accent' : 'neutral'}
            enabled={config.rolesEnabled}
            onToggle={v => updateConfig({ rolesEnabled: v })}
          >
            <RoleSelect
              label="Auto-role khi join"
              value={config.autoRoleId}
              onChange={v => updateConfig({ autoRoleId: v })}
              roles={roles}
              placeholder="-- Không gán --"
            />
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Tiêu đề panel</label>
              <input className="form-input" style={{ fontSize: 12 }}
                value={config.selfRolePanelTitle ?? ''}
                onChange={e => updateConfig({ selfRolePanelTitle: e.target.value })}
                placeholder="Chọn vai trò của bạn" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Self-roles (tối đa 25)</label>
              <SelfRoleEditor
                roles={config.selfRoles ?? []}
                allRoles={roles}
                onChange={v => updateConfig({ selfRoles: v })}
              />
            </div>
          </SecBlock>

        </div>
      </div>
    </div>
    </PermissionGuard>
  );
}
