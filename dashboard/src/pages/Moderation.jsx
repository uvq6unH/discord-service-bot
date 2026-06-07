import React from 'react';
import { useGuild } from '../contexts/GuildContext.jsx';
import { Spinner, Toggle, SectionCard, ChannelSelect, RoleSelect } from '../components/ui.jsx';

export default function ModerationPage() {
  const { config, guildData, configLoading, updateConfig } = useGuild();

  if (configLoading || !config) return <div className="page-loading"><Spinner /></div>;

  const textChannels = (guildData?.channels ?? []).filter(c => c.type === 0 || c.type === 5);
  const roles        = guildData?.roles ?? [];

  return (
    <div className="page">
      <h1 className="page-title">Kiểm duyệt</h1>

      <div className="cards-grid">
        <SectionCard
          title="Moderation"  icon="ti-shield-check"
          enabled={config.moderationEnabled}
          onToggle={v => updateConfig({ moderationEnabled: v })}
        >
          <p className="form-hint">Bật lệnh warn, kick, ban, timeout cho moderator.</p>
        </SectionCard>

        <SectionCard
          title="AutoMod"  icon="ti-robot"
          enabled={config.autoModEnabled}
          onToggle={v => updateConfig({ autoModEnabled: v })}
        >
          <Toggle
            label="Xoá tin nhắn vi phạm"
            checked={config.deleteBlockedMessages ?? false}
            onChange={v => updateConfig({ deleteBlockedMessages: v })}
          />
          <Toggle
            label="Chặn link ngoài"
            checked={config.antiLinkEnabled ?? false}
            onChange={v => updateConfig({ antiLinkEnabled: v })}
          />
          <div className="form-group">
            <label className="form-label">Tin nhắn cảnh báo</label>
            <input
              className="form-input"
              value={config.blockedMessage ?? ''}
              onChange={e => updateConfig({ blockedMessage: e.target.value })}
              placeholder="Tin nhắn này vi phạm quy tắc server."
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Ticket System" icon="ti-ticket"
          enabled={config.ticketsEnabled}
          onToggle={v => updateConfig({ ticketsEnabled: v })}
        >
          <ChannelSelect
            label="Kênh log ticket"
            value={config.ticketLogChannelId}
            onChange={v => updateConfig({ ticketLogChannelId: v })}
            channels={textChannels}
          />
          <div className="form-group">
            <label className="form-label">Tiêu đề panel</label>
            <input
              className="form-input"
              value={config.ticketPanelTitle ?? ''}
              onChange={e => updateConfig({ ticketPanelTitle: e.target.value })}
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Self-Role Panel" icon="ti-tag"
          enabled={config.rolesEnabled}
          onToggle={v => updateConfig({ rolesEnabled: v })}
        >
          <RoleSelect
            label="Auto-role khi vào server"
            value={config.autoRoleId}
            onChange={v => updateConfig({ autoRoleId: v })}
            roles={roles}
            placeholder="-- Không gán --"
          />
          <div className="form-group">
            <label className="form-label">Tiêu đề role panel</label>
            <input
              className="form-input"
              value={config.selfRolePanelTitle ?? ''}
              onChange={e => updateConfig({ selfRolePanelTitle: e.target.value })}
            />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
