import React, { useState } from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useCommands } from '../hooks/useCommands.js';
import { 
  Terminal, 
  Award, 
  Server, 
  ShieldAlert, 
  Coins, 
  Ticket, 
  Sword 
} from 'lucide-react';

const Icons = {
  Terminal,
  Award,
  Server,
  ShieldAlert,
  Coins,
  Ticket,
  Sword
};

const COMMAND_GROUPS = {
  general:      { title: 'General Commands',  icon: 'Terminal'   },
  user:         { title: 'User Profile & XP', icon: 'Award'      },
  server:       { title: 'Server Config',     icon: 'Server'     },
  moderation:   { title: 'Admin Controls',    icon: 'ShieldAlert' },
  economy:      { title: 'Economy System',    icon: 'Coins'      },
  interactions: { title: 'Ticket panels',     icon: 'Ticket'     },
  lol:          { title: 'Riot Telemetry',    icon: 'Sword'      },
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

  const remove = (id) => onChange(commands.filter(c => !(c.type === 'custom' && c.id === id)));

  const update = (id, field, val) =>
    onChange(commands.map(c =>
      c.type === 'custom' && c.id === id ? { ...c, [field]: val } : c
    ));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {customs.length === 0 && (
        <p style={{ color: 'var(--text-3)', fontSize: '13px', fontFamily: 'var(--font-mono)' }}>
          [ NO CUSTOM ROUTED COMMANDS ]
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
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-3)' }}>/</span>
            <input
              className="form-input"
              style={{ width: '150px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
              placeholder="command-handle"
              value={c.name}
              onChange={e => update(c.id, 'name', e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, ''))}
            />
            <input
              className="form-input"
              style={{ flex: 1, fontSize: '12px' }}
              placeholder="Description metadata..."
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
            placeholder="Command Response template. Variables: {user} {args} {server} {prefix}"
            value={c.response}
            onChange={e => update(c.id, 'response', e.target.value)}
          />
        </div>
      ))}
      <button className="btn btn--secondary" style={{ alignSelf: 'flex-start' }} onClick={add}>
        + ADD CUSTOM COMMAND
      </button>
    </div>
  );
}

function AutoReplyEditor({ replies, onChange }) {
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
          [ NO KEYWORD AUTO-REPLIES CONFIGURED ]
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
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-3)' }}>KEYWORD</span>
            <input
              className="form-input"
              style={{ width: '180px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
              placeholder="Query trigger word..."
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
            placeholder="Reply content body payload..."
            value={r.response}
            onChange={e => update(i, 'response', e.target.value)}
          />
        </div>
      ))}
      <button className="btn btn--secondary" style={{ alignSelf: 'flex-start' }} onClick={add}>
        + ADD AUTO-REPLY TRIGGER
      </button>
    </div>
  );
}

export default function CommandsPage() {
  const { config, loading, updateConfig, handleCommandNameChange } = useCommands();
  const [activeGroup, setActiveGroup] = useState('general');

  if (loading || !config) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        LOADING COMMANDS INTERFACE...
      </div>
    );
  }

  const customsCount = (config.commands ?? []).filter(c => c.type === 'custom').length;
  const autoRepliesCount = (config.autoReplies ?? []).length;

  const renderIcon = (iconName) => {
    const IconComponent = Icons[iconName];
    return IconComponent ? <IconComponent size={14} /> : <Icons.Terminal size={14} />;
  };

  return (
    <Workspace>
      {/* 1. Header Zone */}
      <HeaderZone
        title="COMMAND GATEWAY ROUTING"
        subtitle="Manage available console applications, custom command responders, and automatic keyword listeners."
      />

      {/* 2. Status Zone */}
      <StatusZone>
        <KpiTile 
          label="Active Core Modules" 
          value={Object.keys(COMMAND_GROUPS).length} 
          sub="SYS_MODULE_COUNT"
        />
        <KpiTile 
          label="Custom Operations" 
          value={customsCount} 
          sub="CUSTOM_COMMAND_REGISTRY"
        />
        <KpiTile 
          label="Keyword Transponders" 
          value={autoRepliesCount} 
          sub="AUTO_REPLIES_DB"
        />
      </StatusZone>

      {/* 3. Workspace Zone */}
      <div className="grid-12">
        {/* Core System Commands Panel */}
        <div className="col-span-12">
          <Panel title="CORE OPERATIONS MODULES" accent>
            {/* Group selector tabs */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-3)' }}>
              {Object.entries(COMMAND_GROUPS).map(([key, group]) => {
                const isActive = activeGroup === key;
                return (
                  <button
                    key={key}
                    className="btn"
                    onClick={() => setActiveGroup(key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      backgroundColor: isActive ? 'var(--surface-2)' : 'var(--surface-1)',
                      borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                      color: isActive ? 'var(--text-1)' : 'var(--text-2)',
                      padding: 'var(--space-2) var(--space-3)'
                    }}
                  >
                    {renderIcon(group.icon)}
                    <span>{group.title.toUpperCase()}</span>
                  </button>
                );
              })}
            </div>

            {/* List commands of selected group */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              {ALL_COMMANDS.filter(c => c.group === activeGroup).map(c => {
                // Find if cmd is configured
                const cmdCfg = (config.commands ?? []).find(x => x.type === c.type);
                const isEnabled = cmdCfg ? cmdCfg.enabled : true;

                return (
                  <DataSlab
                    key={c.type}
                    label={`/${c.type}`}
                    sub={c.label}
                    value={
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          className="toggle-switch__input"
                          checked={isEnabled}
                          onChange={e => {
                            const currentList = config.commands ?? [];
                            const exist = currentList.find(x => x.type === c.type);
                            let updatedList;
                            if (exist) {
                              updatedList = currentList.map(x => x.type === c.type ? { ...x, enabled: e.target.checked } : x);
                            } else {
                              updatedList = [...currentList, { type: c.type, enabled: e.target.checked }];
                            }
                            updateConfig({ commands: updatedList });
                          }}
                        />
                        <div className="toggle-switch__track">
                          <div className="toggle-switch__thumb" />
                        </div>
                      </label>
                    }
                    highlight={isEnabled}
                  />
                );
              })}
            </div>
          </Panel>
        </div>

        {/* Custom Commands Panels */}
        <div className="col-span-6">
          <Panel title="CUSTOM RESPONSE OPERATORS" accent>
            <CustomCommandEditor
              commands={config.commands ?? []}
              onChange={v => updateConfig({ commands: v })}
            />
          </Panel>
        </div>

        {/* Auto Reply Panels */}
        <div className="col-span-6">
          <Panel title="KEYWORD AUTO-RESPONDERS" accent>
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
