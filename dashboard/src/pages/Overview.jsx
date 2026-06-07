import React, { useEffect, useState } from 'react';
import { useGuild } from '../contexts/GuildContext.jsx';
import { Spinner, Toggle, SectionCard, ChannelSelect } from '../components/ui.jsx';

export default function OverviewPage() {
  const { config, guildData, configLoading, updateConfig, selectedGuild } = useGuild();

  if (configLoading || !config) {
    return <div className="page-loading"><Spinner /></div>;
  }

  if (!selectedGuild?.botPresent) {
    return null; // App.jsx handle invite banner
  }

  const ch = guildData?.channels ?? [];
  const textChannels = ch.filter(c => c.type === 0 || c.type === 5);

  return (
    <div className="page">
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Cài đặt chung cho {selectedGuild.name}</p>

      <div className="cards-grid">
        {/* Tổng quan */}
        <SectionCard title="Cài đặt chung" icon="ti-settings">
          <Toggle
            label="Bật bot"
            hint="Bật/tắt toàn bộ tính năng bot"
            checked={config.enabled ?? true}
            onChange={v => updateConfig({ enabled: v })}
          />
          <div className="form-group">
            <label className="form-label">Prefix lệnh</label>
            <input
              className="form-input form-input--sm"
              value={config.prefix ?? '!'}
              onChange={e => updateConfig({ prefix: e.target.value })}
              maxLength={5}
              style={{ width: 80 }}
            />
          </div>
          <ChannelSelect
            label="Kênh log"
            value={config.logChannelId}
            onChange={v => updateConfig({ logChannelId: v })}
            channels={textChannels}
            placeholder="-- Không log --"
          />
        </SectionCard>

        {/* Welcome */}
        <SectionCard
          title="Chào mừng thành viên"
          icon="ti-door-enter"
          enabled={config.welcomeEnabled}
          onToggle={v => updateConfig({ welcomeEnabled: v })}
        >
          <ChannelSelect
            label="Kênh chào mừng"
            value={config.welcomeChannelId}
            onChange={v => updateConfig({ welcomeChannelId: v })}
            channels={textChannels}
          />
          <div className="form-group">
            <label className="form-label">Tin nhắn chào mừng</label>
            <textarea
              className="form-input"
              rows={3}
              value={config.welcomeMessage ?? ''}
              onChange={e => updateConfig({ welcomeMessage: e.target.value })}
              placeholder="Chào {user} đến với {server}!"
            />
          </div>
        </SectionCard>

        {/* Thông báo */}
        <SectionCard
          title="Thông báo"
          icon="ti-speakerphone"
          enabled={config.announcementsEnabled}
          onToggle={v => updateConfig({ announcementsEnabled: v })}
        >
          <ChannelSelect
            label="Kênh thông báo"
            value={config.announcementChannelId}
            onChange={v => updateConfig({ announcementChannelId: v })}
            channels={textChannels}
          />
          <div className="form-group">
            <label className="form-label">Mention khi thông báo</label>
            <input
              className="form-input"
              value={config.announcementMention ?? ''}
              onChange={e => updateConfig({ announcementMention: e.target.value })}
              placeholder="@everyone hoặc để trống"
            />
          </div>
        </SectionCard>

        {/* Music */}
        <SectionCard
          title="Music"
          icon="ti-music"
          enabled={config.musicEnabled}
          onToggle={v => updateConfig({ musicEnabled: v })}
        >
          <div className="form-group">
            <label className="form-label">Music prefix</label>
            <input
              className="form-input form-input--sm"
              value={config.musicPrefix ?? '!'}
              onChange={e => updateConfig({ musicPrefix: e.target.value })}
              maxLength={5}
              style={{ width: 80 }}
            />
          </div>
          <p className="form-hint">
            Bot dùng Lavalink — không xử lý audio trực tiếp, CPU thấp.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
