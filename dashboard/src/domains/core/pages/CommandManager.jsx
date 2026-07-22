import React, { useState } from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import { useGuild } from '../hooks/useGuild.js';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';

const DEFAULT_COMMAND_LIST = [
  { name: 'ping', category: 'Core', desc: 'Kiểm tra độ trễ của bot' },
  { name: 'help', category: 'Core', desc: 'Hiển thị danh sách lệnh' },
  { name: 'config', category: 'Core', desc: 'Xem cấu hình hiện tại' },
  { name: 'translate', category: 'Utility', desc: 'Dịch thuật đa ngôn ngữ' },
  { name: 'duolingo', category: 'Utility', desc: 'Học ngoại ngữ Nga/Trung' },
  { name: 'play', category: 'Music', desc: 'Phát bài hát từ YouTube/SoundCloud' },
  { name: 'skip', category: 'Music', desc: 'Bỏ qua bài hát đang phát' },
  { name: 'stop', category: 'Music', desc: 'Dừng trình phát nhạc' },
  { name: 'purge', category: 'Moderation', desc: 'Xóa tin nhắn rác' },
  { name: 'warn', category: 'Moderation', desc: 'Cảnh cáo thành viên' },
  { name: 'kick', category: 'Moderation', desc: 'Kick thành viên khỏi server' },
  { name: 'ban', category: 'Moderation', desc: 'Ban thành viên khỏi server' },
  { name: 'rank', category: 'Leveling', desc: 'Xem thẻ level của bạn' },
  { name: 'leaderboard', category: 'Leveling', desc: 'Bảng xếp hạng cấp độ' },
  { name: 'balance', category: 'Economy', desc: 'Xem số dư xu của bạn' },
  { name: 'daily', category: 'Economy', desc: 'Nhận xu thưởng mỗi ngày' },
  { name: 'lol-profile', category: 'Riot Games', desc: 'Xem thông tin LMHT' },
  { name: 'tft-profile', category: 'Riot Games', desc: 'Xem thông tin ĐTCL' },
];

export default function CommandManagerPage() {
  const { config, updateConfig, selectedGuild } = useGuild();
  const { t } = useLanguage();
  const [toggling, setToggling] = useState({});

  const disabledCommands = new Set(config?.disabledCommands ?? []);

  const handleToggle = async (commandName) => {
    if (!selectedGuild?.id) return;
    const isCurrentlyDisabled = disabledCommands.has(commandName);
    const shouldEnable = isCurrentlyDisabled;

    setToggling(prev => ({ ...prev, [commandName]: true }));

    try {
      const res = await fetch(`/api/guilds/${selectedGuild.id}/command-toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandName, enabled: shouldEnable }),
      });
      const data = await res.json();
      if (data.success) {
        await updateConfig({ disabledCommands: data.disabledCommands });
      }
    } catch (err) {
      console.error('Failed to toggle command:', err);
    } finally {
      setToggling(prev => ({ ...prev, [commandName]: false }));
    }
  };

  const enabledCount = DEFAULT_COMMAND_LIST.length - disabledCommands.size;

  return (
    <Workspace>
      <HeaderZone
        title={selectedGuild?.name ? `${selectedGuild.name.toUpperCase()} // COMMAND MANAGER` : 'COMMAND MANAGER'}
        subtitle={t('Enable or disable specific slash & prefix commands for this server.')}
      />

      <StatusZone>
        <KpiTile 
          label={t('Enabled Commands')} 
          value={`${enabledCount} / ${DEFAULT_COMMAND_LIST.length}`} 
          sub="ACTIVE_DISPATCH_NODES"
        />
        <KpiTile 
          label={t('Disabled Commands')} 
          value={disabledCommands.size.toString()} 
          sub="BLOCKED_COMMAND_NODES"
        />
      </StatusZone>

      <div className="grid-12">
        <div className="col-span-12">
          <Panel title={t('COMMAND PERMISSION MATRIX')}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-3)', padding: 'var(--space-2)' }}>
              {DEFAULT_COMMAND_LIST.map((cmd) => {
                const isDisabled = disabledCommands.has(cmd.name);
                const isLoading = toggling[cmd.name];

                return (
                  <div 
                    key={cmd.name}
                    style={{
                      border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
                      borderRadius: 'var(--radius-md, 6px)',
                      padding: 'var(--space-3)',
                      background: isDisabled ? 'rgba(255, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '1rem', color: isDisabled ? 'var(--text-muted)' : 'var(--text-main)' }}>
                        /{cmd.name} <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>[{cmd.category}]</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {cmd.desc}
                      </div>
                    </div>
                    <button
                      className={`btn ${isDisabled ? 'btn--secondary' : 'btn--primary'}`}
                      onClick={() => handleToggle(cmd.name)}
                      disabled={isLoading}
                      style={{ minWidth: '90px' }}
                    >
                      {isLoading ? '...' : (isDisabled ? '▶️ Bật' : '⏸️ Tắt')}
                    </button>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
