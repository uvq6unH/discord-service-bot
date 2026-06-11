import React, { useState } from 'react';
import { ShieldCheck, Bot, Ticket, Tag } from 'lucide-react';
import { useGuild } from '../contexts/GuildContext.jsx';
import { Spinner, Toggle, SectionCard, ChannelSelect, RoleSelect, ThemeToggle} from '../components/ui.jsx';
import { useAppTheme } from '../App.jsx';

// ── BadWords editor ──────────────────────────────────────────────────────────
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s1)' }}>
        {words.map(w => (
          <span key={w} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,.25)',
            color: 'var(--red)', borderRadius: 99, padding: '2px 10px',
            fontSize: 12, fontFamily: 'var(--font-mono)',
          }}>
            {w}
            <button
              onClick={() => onChange(words.filter(x => x !== w))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}
            >×</button>
          </span>
        ))}
        {words.length === 0 && (
          <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Chưa có từ bị chặn</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 'var(--s2)' }}>
        <input
          className="form-input"
          style={{ flex: 1 }}
          placeholder="Thêm từ cấm…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
        />
        <button className="btn btn-secondary btn-sm" onClick={add}>Thêm</button>
      </div>
    </div>
  );
}

// ── SelfRole editor ─────────────────────────────────────────────────────────
function SelfRoleEditor({ roles, allRoles, onChange }) {
  const visible = allRoles.filter(r => r.name !== '@everyone');

  const add = () => onChange([...roles, { label: '', roleId: '' }]);
  const remove = (i) => onChange(roles.filter((_, idx) => idx !== i));
  const update = (i, field, val) => {
    const next = [...roles];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
      {roles.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center' }}>
          <input
            className="form-input"
            style={{ width: 140 }}
            placeholder="Nhãn nút (vd: Member)"
            value={r.label}
            onChange={e => update(i, 'label', e.target.value)}
          />
          <select
            className="form-select"
            style={{ flex: 1 }}
            value={r.roleId}
            onChange={e => update(i, 'roleId', e.target.value)}
          >
            <option value="">-- Chọn role --</option>
            {visible.map(role => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
          <button className="btn btn-xs btn-danger" onClick={() => remove(i)}>×</button>
        </div>
      ))}
      {roles.length === 0 && (
        <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Chưa có self-role nào.</p>
      )}
      <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={add}>
        + Thêm role
      </button>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function ModerationPage() {
  const { theme, toggleTheme } = useAppTheme();
  const { config, guildData, configLoading, updateConfig } = useGuild();

  if (configLoading || !config) return <div className="page-loading"><Spinner /></div>;

  const textChannels = (guildData?.channels ?? []).filter(c => c.type === 0 || c.type === 5);
  const roles = guildData?.roles ?? [];
  const categoryChannels = (guildData?.channels ?? []).filter(c => c.type === 4);

  return (
    <div className="page">
      <div className="page-header-row">
        <h1 className="page-title">Kiểm duyệt</h1>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>

      <div className="cards-grid">

        {/* ── Moderation commands ── */}
        <SectionCard
          title="Lệnh kiểm duyệt"
          icon={<ShieldCheck size={16} />}
          enabled={config.moderationEnabled}
          onToggle={v => updateConfig({ moderationEnabled: v })}
        >
          <p className="form-hint">
            Bật lệnh <code>/warn</code> <code>/kick</code> <code>/ban</code>{' '}
            <code>/timeout</code> <code>/warnings</code> <code>/clearwarns</code> cho moderator.
          </p>
          <ChannelSelect
            label="Kênh log moderation"
            value={config.logChannelId}
            onChange={v => updateConfig({ logChannelId: v })}
            channels={textChannels}
            placeholder="-- Không log --"
          />
        </SectionCard>

        {/* ── AutoMod ── */}
        <SectionCard
          title="AutoMod"
          icon={<Bot size={16} />}
          enabled={config.autoModEnabled}
          onToggle={v => updateConfig({ autoModEnabled: v })}
        >
          <Toggle
            label="Xóa tin nhắn vi phạm"
            hint="Xóa ngay tin nhắn có từ cấm hoặc link ngoài"
            checked={config.deleteBlockedMessages ?? true}
            onChange={v => updateConfig({ deleteBlockedMessages: v })}
          />
          <Toggle
            label="Chặn link ngoài"
            hint="Chặn mọi URL http/https và discord.gg"
            checked={config.antiLinkEnabled ?? false}
            onChange={v => updateConfig({ antiLinkEnabled: v })}
          />
          <div className="form-group">
            <label className="form-label">Tin nhắn cảnh báo khi vi phạm</label>
            <input
              className="form-input"
              value={config.blockedMessage ?? ''}
              onChange={e => updateConfig({ blockedMessage: e.target.value })}
              placeholder="{user}, tin nhắn của bạn vi phạm nội quy."
            />
            <span className="form-hint">Template: <code>{'{user}'}</code></span>
          </div>
          <div className="form-group">
            <label className="form-label">Danh sách từ cấm</label>
            <BadWordsEditor
              words={config.badWords ?? []}
              onChange={v => updateConfig({ badWords: v })}
            />
          </div>
        </SectionCard>

        {/* ── Ticket System ── */}
        <SectionCard
          title="Ticket System"
          icon={<Ticket size={16} />}
          enabled={config.ticketsEnabled}
          onToggle={v => updateConfig({ ticketsEnabled: v })}
        >
          <div className="form-group">
            <label className="form-label">Category chứa ticket</label>
            <select
              className="form-select"
              value={config.ticketCategoryId ?? ''}
              onChange={e => updateConfig({ ticketCategoryId: e.target.value })}
            >
              <option value="">-- Không chọn --</option>
              {categoryChannels.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <ChannelSelect
            label="Kênh log ticket"
            value={config.ticketLogChannelId}
            onChange={v => updateConfig({ ticketLogChannelId: v })}
            channels={textChannels}
          />
          <div className="form-group">
            <label className="form-label">Tiêu đề panel ticket</label>
            <input
              className="form-input"
              value={config.ticketPanelTitle ?? ''}
              onChange={e => updateConfig({ ticketPanelTitle: e.target.value })}
              placeholder="Support tickets"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Nội dung panel ticket</label>
            <textarea
              className="form-input"
              rows={3}
              value={config.ticketPanelMessage ?? ''}
              onChange={e => updateConfig({ ticketPanelMessage: e.target.value })}
              placeholder="Cần hỗ trợ? Mở ticket và team sẽ phản hồi."
            />
          </div>
        </SectionCard>

        {/* ── Self-Role Panel ── */}
        <SectionCard
          title="Self-Role Panel"
          icon={<Tag size={16} />}
          enabled={config.rolesEnabled}
          onToggle={v => updateConfig({ rolesEnabled: v })}
        >
          <RoleSelect
            label="Auto-role khi vào server"
            value={config.autoRoleId}
            onChange={v => updateConfig({ autoRoleId: v })}
            roles={roles}
            placeholder="-- Không gán tự động --"
          />
          <div className="form-group">
            <label className="form-label">Tiêu đề panel</label>
            <input
              className="form-input"
              value={config.selfRolePanelTitle ?? ''}
              onChange={e => updateConfig({ selfRolePanelTitle: e.target.value })}
              placeholder="Chọn vai trò của bạn"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Nội dung panel</label>
            <textarea
              className="form-input"
              rows={2}
              value={config.selfRolePanelMessage ?? ''}
              onChange={e => updateConfig({ selfRolePanelMessage: e.target.value })}
              placeholder="Nhấn nút để toggle role."
            />
          </div>
          <div className="form-group">
            <label className="form-label">Danh sách self-role (tối đa 25)</label>
            <SelfRoleEditor
              roles={config.selfRoles ?? []}
              allRoles={roles}
              onChange={v => updateConfig({ selfRoles: v })}
            />
          </div>
        </SectionCard>

      </div>
    </div>
  );
}
