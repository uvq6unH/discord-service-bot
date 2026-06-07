import React, { useState, useMemo } from 'react';
import { useGuild } from '../contexts/GuildContext.jsx';
import { Spinner, Toggle, SectionCard, TextInput } from '../components/ui.jsx';

const COMMAND_GROUPS = {
  general:     { title: 'Lệnh chung',         icon: 'ti-terminal-2',   tone: 'blue'   },
  user:        { title: 'Người dùng & XP',    icon: 'ti-award',        tone: 'green'  },
  server:      { title: 'Máy chủ',            icon: 'ti-speakerphone', tone: 'amber'  },
  moderation:  { title: 'Moderation',         icon: 'ti-shield-check', tone: 'red'    },
  interactions:{ title: 'Ticket & Roles',     icon: 'ti-ticket',       tone: 'teal'   },
  games:       { title: '🎮 Trò chơi',         icon: 'ti-cards',        tone: 'purple' },
  lol:         { title: '⚔️ LoL & TFT',         icon: 'ti-sword',        tone: 'orange' },
};

const ALL_COMMANDS = [
  { type: 'ping',    group: 'general',      label: 'Ping' },
  { type: 'help',    group: 'general',      label: 'Help' },
  { type: 'custom',  group: 'general',      label: 'Custom commands' },
  { type: 'user',    group: 'user',         label: 'User info' },
  { type: 'rank',    group: 'user',         label: 'Rank' },
  { type: 'leaderboard', group: 'user',     label: 'Leaderboard' },
  { type: 'balance', group: 'user',         label: 'Balance' },
  { type: 'daily',   group: 'user',         label: 'Daily' },
  { type: 'warn',    group: 'moderation',   label: 'Warn' },
  { type: 'kick',    group: 'moderation',   label: 'Kick' },
  { type: 'ban',     group: 'moderation',   label: 'Ban' },
  { type: 'timeout', group: 'moderation',   label: 'Timeout' },
  { type: 'blackjack', group: 'games',      label: 'Blackjack' },
  { type: 'poker',   group: 'games',        label: 'Poker' },
  { type: 'coinflip',group: 'games',        label: 'Coinflip' },
  { type: 'dice',    group: 'games',        label: 'Dice' },
  { type: 'slots',   group: 'games',        label: 'Slots' },
  { type: 'ticketpanel', group: 'interactions', label: 'Ticket panel' },
  { type: 'rolepanel',   group: 'interactions', label: 'Role panel' },
  { type: 'lsd',     group: 'lol',          label: 'Lịch sử đấu' },
  { type: 'lolprofile', group: 'lol',       label: 'Hồ sơ LoL' },
  { type: 'lollink', group: 'lol',          label: 'Liên kết tài khoản' },
  { type: 'tftlsd',  group: 'lol',          label: 'Lịch sử TFT' },
  { type: 'tftlink', group: 'lol',          label: 'Liên kết TFT' },
];

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
            placeholder="Từ khóa"
            value={r.keyword}
            onChange={e => update(i, 'keyword', e.target.value)}
          />
          <input
            className="form-input"
            placeholder="Phản hồi"
            value={r.response}
            onChange={e => update(i, 'response', e.target.value)}
          />
          <button className="btn btn-xs btn-danger" onClick={() => remove(i)}>Xóa</button>
        </div>
      ))}
      <button className="btn btn-secondary btn-sm" onClick={add}>+ Thêm từ khóa</button>
    </div>
  );
}

export default function CommandsPage() {
  const { config, configLoading, updateConfig } = useGuild();
  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState('general');

  if (configLoading || !config) {
    return <div className="page-loading"><Spinner /></div>;
  }

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

  const groupCommands = (cmds) => {
    const grouped = {};
    for (const cmd of cmds) {
      grouped[cmd.group] ??= [];
      grouped[cmd.group].push(cmd);
    }
    return grouped;
  };

  return (
    <div className="page">
      <h1 className="page-title">Lệnh & Custom</h1>

      <div className="commands-layout">
        {/* Group tabs */}
        <div className="group-tabs">
          {Object.entries(COMMAND_GROUPS).map(([key, { title, icon }]) => (
            <button
              key={key}
              className={`group-tab${activeGroup === key && !search ? ' group-tab--active' : ''}`}
              onClick={() => { setActiveGroup(key); setSearch(''); }}
            >
              <i className={`ti ${icon}`} />
              <span>{title}</span>
            </button>
          ))}
        </div>

        <div className="commands-content">
          {/* Search */}
          <div className="commands-search">
            <i className="ti ti-search" />
            <input
              className="form-input"
              placeholder="Tìm lệnh…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Command list */}
          <div className="command-list">
            {filteredCommands.map(cmd => {
              const c = getCmd(cmd.type);
              return (
                <div key={cmd.type} className="command-row">
                  <span className="command-name">/{cmd.type}</span>
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

          {/* Auto replies section */}
          {(activeGroup === 'general' || search.includes('reply')) && (
            <SectionCard
              title="Tự động trả lời"
              icon="ti-message-reply"
              enabled={config.autoReplyEnabled}
              onToggle={v => updateConfig({ autoReplyEnabled: v })}
            >
              <AutoReplyEditor
                replies={config.autoReplies ?? []}
                onChange={v => updateConfig({ autoReplies: v })}
              />
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
