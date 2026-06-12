import { Terminal, Trophy, Desktop, ShieldCheck, Coins, Ticket, Sword, MagnifyingGlass, FilePlus, ChatText, Smiley } from '@phosphor-icons/react';
import React, { useState, useMemo } from 'react';
import { useGuild } from '../contexts/GuildContext.jsx';
import { Spinner, Toggle, SectionCard, TextInput, ThemeToggle} from '../components/ui.jsx';
import { useAppTheme } from '../App.jsx';

const COMMAND_GROUPS = {
  general:      { title: 'Lệnh chung',         Icon: Terminal   },
  user:         { title: 'Người dùng & XP',    Icon: Award      },
  server:       { title: 'Máy chủ',            Icon: Server     },
  moderation:   { title: 'Kiểm duyệt',         Icon: ShieldCheck },
  economy:      { title: 'Kinh tế',            Icon: Coins      },
  interactions: { title: 'Ticket & Roles',     Icon: Ticket     },
  lol:          { title: 'LoL & TFT',          Icon: Sword      },
};

const ALL_COMMANDS = [
  { type: 'ping',               group: 'general',      label: 'Ping' },
  { type: 'help',               group: 'general',      label: 'Help' },
  { type: 'user',               group: 'user',         label: 'User info' },
  { type: 'avatar',             group: 'user',         label: 'Avatar' },
  { type: 'rank',               group: 'user',         label: 'Rank (XP)' },
  { type: 'leaderboard',        group: 'user',         label: 'XP Leaderboard' },
  { type: 'server',             group: 'server',       label: 'Server info' },
  { type: 'say',                group: 'server',       label: 'Say (bot nói)' },
  { type: 'purge',              group: 'server',       label: 'Purge messages' },
  { type: 'announce',           group: 'server',       label: 'Announce' },
  { type: 'config',             group: 'server',       label: 'Config status' },
  { type: 'warn',               group: 'moderation',   label: 'Warn' },
  { type: 'warnings',           group: 'moderation',   label: 'Xem cảnh cáo' },
  { type: 'clearwarns',         group: 'moderation',   label: 'Xóa cảnh cáo' },
  { type: 'kick',               group: 'moderation',   label: 'Kick' },
  { type: 'ban',                group: 'moderation',   label: 'Ban' },
  { type: 'timeout',            group: 'moderation',   label: 'Timeout' },
  { type: 'balance',            group: 'economy',      label: 'Balance' },
  { type: 'daily',              group: 'economy',      label: 'Daily claim' },
  { type: 'economyleaderboard', group: 'economy',      label: 'Economy Leaderboard' },
  { type: 'blackjack',          group: 'economy',      label: 'Blackjack' },
  { type: 'poker',              group: 'economy',      label: 'Poker' },
  { type: 'coinflip',           group: 'economy',      label: 'Coinflip' },
  { type: 'dice',               group: 'economy',      label: 'Dice' },
  { type: 'slots',              group: 'economy',      label: 'Slots' },
  { type: 'ecoadd',             group: 'economy',      label: 'Eco Add (admin)' },
  { type: 'ecoset',             group: 'economy',      label: 'Eco Set (admin)' },
  { type: 'ecoremove',          group: 'economy',      label: 'Eco Remove (admin)' },
  { type: 'ticketpanel',        group: 'interactions', label: 'Ticket panel' },
  { type: 'rolepanel',          group: 'interactions', label: 'Self-role panel' },
  { type: 'lsd',                group: 'lol',          label: 'Lịch sử đấu LoL' },
  { type: 'lolprofile',         group: 'lol',          label: 'Hồ sơ LoL' },
  { type: 'lolmatch',           group: 'lol',          label: 'Chi tiết trận LoL' },
  { type: 'lolchamp',           group: 'lol',          label: 'Tướng LoL' },
  { type: 'lolitem',            group: 'lol',          label: 'Trang bị LoL' },
  { type: 'lolrunes',           group: 'lol',          label: 'Bảng ngọc LoL' },
  { type: 'lolpatch',           group: 'lol',          label: 'Phiên bản LoL' },
  { type: 'lollink',            group: 'lol',          label: 'Liên kết tài khoản LoL' },
  { type: 'lolunlink',          group: 'lol',          label: 'Bỏ liên kết LoL' },
  { type: 'tftlsd',             group: 'lol',          label: 'Lịch sử TFT' },
  { type: 'tftprofile',         group: 'lol',          label: 'Hồ sơ TFT' },
  { type: 'tftmatch',           group: 'lol',          label: 'Chi tiết trận TFT' },
  { type: 'tftlink',            group: 'lol',          label: 'Liên kết tài khoản TFT' },
  { type: 'tftunlink',          group: 'lol',          label: 'Bỏ liên kết TFT' },
];

// ── Custom command editor ────────────────────────────────────────────────────
// FIX: dùng c.id (stable UUID) thay vì c.name làm key
// Trước đây: remove(name) và update(oldName, ...) — khi name === '' (mới tạo)
// sẽ xóa/update TẤT CẢ commands chưa đặt tên.
function CustomCommandEditor({ commands, onChange }) {
  const customs = commands.filter(c => c.type === 'custom');

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

  // FIX: filter/map bằng c.id — không phụ thuộc vào c.name
  const remove = (id) => onChange(commands.filter(c => !(c.type === 'custom' && c.id === id)));

  const update = (id, field, val) =>
    onChange(commands.map(c =>
      c.type === 'custom' && c.id === id ? { ...c, [field]: val } : c
    ));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
      {customs.length === 0 && (
        <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Chưa có lệnh custom nào.</p>
      )}
      {customs.map((c) => (
        <div key={c.id} style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r3)', padding: 'var(--s3)',
          display: 'flex', flexDirection: 'column', gap: 'var(--s2)',
        }}>
          <div style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center' }}>
            <input
              className="form-input"
              style={{ width: 140 }}
              placeholder="tên-lệnh"
              value={c.name}
              onChange={e => update(c.id, 'name', e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, ''))}
            />
            <input
              className="form-input"
              style={{ flex: 1 }}
              placeholder="Mô tả lệnh"
              value={c.description}
              onChange={e => update(c.id, 'description', e.target.value)}
            />
            <Toggle checked={c.enabled ?? true} onChange={v => update(c.id, 'enabled', v)} label="" />
            <button className="btn btn-xs btn-danger" onClick={() => remove(c.id)}>×</button>
          </div>
          <textarea
            className="form-input"
            rows={2}
            placeholder="Nội dung phản hồi. Hỗ trợ: {user} {args} {server} {prefix}"
            value={c.response}
            onChange={e => update(c.id, 'response', e.target.value)}
          />
        </div>
      ))}
      <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={add}>
        + Thêm lệnh custom
      </button>
    </div>
  );
}

// ── Auto-reply editor ────────────────────────────────────────────────────────
function AutoReplyEditor({ replies, onChange }) {
  const add = () => onChange([...replies, { keyword: '', response: '' }]);
  const remove = (i) => onChange(replies.filter((_, idx) => idx !== i));
  const update = (i, field, val) => {
    const next = [...replies];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };

  return (
    <div className="auto-reply-editor">
      {replies.map((r, i) => (
        <div key={i} className="reply-row">
          <input
            className="form-input"
            placeholder="Từ khóa (bao gồm trong tin nhắn)"
            value={r.keyword}
            onChange={e => update(i, 'keyword', e.target.value)}
          />
          <input
            className="form-input"
            placeholder="Phản hồi"
            value={r.response}
            onChange={e => update(i, 'response', e.target.value)}
          />
          <button className="btn btn-xs btn-danger" onClick={() => remove(i)}>×</button>
        </div>
      ))}
      <button className="btn btn-secondary btn-sm" onClick={add}>+ Thêm từ khóa</button>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function CommandsPage() {
  const { theme, toggleTheme } = useAppTheme();
  const { config, configLoading, updateConfig } = useGuild();
  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState('general');

  if (configLoading || !config) return <div className="page-loading"><Spinner /></div>;

  const commands = config.commands ?? [];
  const getCmd = (type) => commands.find(c => c.type === type) ?? { type, enabled: true };
  const setCmd = (type, patch) => {
    const next = commands.filter(c => c.type !== type);
    next.push({ ...getCmd(type), ...patch });
    updateConfig({ commands: next });
  };

  const filteredCommands = useMemo(() => {
    if (!search) return ALL_COMMANDS.filter(c => c.group === activeGroup);
    const q = search.toLowerCase();
    return ALL_COMMANDS.filter(c =>
      c.label.toLowerCase().includes(q) || c.type.includes(q)
    );
  }, [search, activeGroup]);

  const enabledCount = ALL_COMMANDS.filter(c => (getCmd(c.type).enabled ?? true)).length;

  return (
    <div className="page">
      <div className="page-header-row">
        <h1 className="page-title">Lệnh & Custom</h1>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>
      <p className="page-subtitle">
        {enabledCount}/{ALL_COMMANDS.length} lệnh đang bật
      </p>

      <div className="commands-layout">
        <div className="group-tabs">
          {Object.entries(COMMAND_GROUPS).map(([key, { title, Icon }]) => {
            const groupCmds = ALL_COMMANDS.filter(c => c.group === key);
            const groupEnabled = groupCmds.filter(c => (getCmd(c.type).enabled ?? true)).length;
            return (
              <button
                key={key}
                className={`group-tab${activeGroup === key && !search ? ' group-tab--active' : ''}`}
                onClick={() => { setActiveGroup(key); setSearch(''); }}
              >
                <Icon size={14} />
                <span>{title}</span>
                <span style={{
                  marginLeft: 'auto', fontSize: 11, fontVariantNumeric: 'tabular-nums',
                  color: 'var(--text-3)', background: 'var(--surface-3)',
                  padding: '1px 6px', borderRadius: 99,
                }}>
                  {groupEnabled}/{groupCmds.length}
                </span>
              </button>
            );
          })}
        </div>

        <div className="commands-content">
          <div className="commands-search">
            <MagnifyingGlass size={14} />
            <input
              className="form-input"
              placeholder="Tìm lệnh…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="command-list">
            {filteredCommands.map(cmd => {
              const c = getCmd(cmd.type);
              return (
                <div key={cmd.type} className="command-row">
                  <code className="command-name">/{cmd.type === 'custom' ? 'custom' : cmd.type}</code>
                  <span className="command-label">{cmd.label}</span>
                  <Toggle
                    checked={c.enabled ?? true}
                    onChange={v => setCmd(cmd.type, { enabled: v })}
                    label=""
                  />
                </div>
              );
            })}
          </div>

          {(activeGroup === 'general' && !search) && (
            <SectionCard title="Lệnh custom" icon={<FilePlus size={16} />}>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 'var(--s3)' }}>
                Lệnh tự tạo với prefix. Hỗ trợ template: <code>{'{user}'}</code> <code>{'{args}'}</code> <code>{'{server}'}</code>
              </p>
              <CustomCommandEditor
                commands={commands}
                onChange={v => updateConfig({ commands: v })}
              />
            </SectionCard>
          )}

          {(activeGroup === 'general' && !search) && (
            <SectionCard
              title="Tự động trả lời"
              icon={<ChatText size={16} />}
              enabled={config.autoReplyEnabled}
              onToggle={v => updateConfig({ autoReplyEnabled: v })}
            >
              <AutoReplyEditor
                replies={config.autoReplies ?? []}
                onChange={v => updateConfig({ autoReplies: v })}
              />
            </SectionCard>
          )}

          {(activeGroup === 'general' && !search) && (
            <SectionCard
              title="Reaction khi nhắc bot"
              icon={<Smiley size={16} />}
              enabled={config.mentionReactEnabled}
              onToggle={v => updateConfig({ mentionReactEnabled: v })}
            >
              <div className="form-group">
                <label className="form-label">Emoji react (unicode hoặc :tên:)</label>
                <input
                  className="form-input form-input--sm"
                  style={{ width: 120 }}
                  value={config.mentionReactEmoji ?? '👋'}
                  onChange={e => updateConfig({ mentionReactEmoji: e.target.value })}
                  placeholder="👋 hoặc :wave:"
                />
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
