import React, { useState } from 'react';
import { useGuild } from '../contexts/GuildContext.jsx';
import { Spinner, Toggle, SectionCard, ChannelSelect } from '../components/ui.jsx';

// ── Reminder editor ─────────────────────────────────────────────────────────
function ReminderEditor({ reminders, onChange, channels }) {
  const textChannels = channels.filter(c => c.type === 0 || c.type === 5);

  // Tính thời gian mặc định = bây giờ + 1 giờ, theo local timezone của user.
  // toISOString() trả về UTC nên khi hiển thị trong datetime-local input sẽ
  // sai lệch múi giờ. Thay bằng chuỗi local ISO để input hiển thị đúng.
  const localISOString = (date) => {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
           `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const add = () => onChange([
    ...reminders,
    {
      id: `rem_${Date.now()}`,
      userIds: [],
      channelId: '',
      message: '',
      time: localISOString(new Date(Date.now() + 3600_000)),
      repeat: 'none',
    },
  ]);

  const remove = (id) => onChange(reminders.filter(r => r.id !== id));
  const update = (id, patch) => onChange(reminders.map(r => r.id === id ? { ...r, ...patch } : r));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
      {reminders.length === 0 && (
        <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Chưa có reminder nào.</p>
      )}
      {reminders.map((r) => (
        <div key={r.id} style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r3)', padding: 'var(--s3)',
          display: 'flex', flexDirection: 'column', gap: 'var(--s2)',
        }}>
          <div style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Nội dung</label>
                <input
                  className="form-input"
                  placeholder="Nội dung reminder…"
                  value={r.message}
                  onChange={e => update(r.id, { message: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', gap: 'var(--s2)' }}>
                <div className="form-group" style={{ margin: 0, flex: 1 }}>
                  <label className="form-label">Thời gian</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={r.time ? r.time.slice(0, 16) : ''}
                    onChange={e => update(r.id, { time: new Date(e.target.value).toISOString() })}
                  />
                </div>
                <div className="form-group" style={{ margin: 0, flex: 1 }}>
                  <label className="form-label">Lặp lại</label>
                  <select
                    className="form-select"
                    value={r.repeat ?? 'none'}
                    onChange={e => update(r.id, { repeat: e.target.value })}
                  >
                    <option value="none">Một lần</option>
                    <option value="hourly">Mỗi giờ</option>
                    <option value="daily">Mỗi ngày</option>
                    <option value="weekly">Mỗi tuần</option>
                  </select>
                </div>
              </div>
              <ChannelSelect
                label="Kênh gửi"
                value={r.channelId}
                onChange={v => update(r.id, { channelId: v })}
                channels={textChannels}
              />
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Mention user IDs (cách nhau bằng dấu phẩy)</label>
                <input
                  className="form-input"
                  placeholder="123456789, 987654321"
                  value={(r.userIds ?? []).join(', ')}
                  onChange={e => update(r.id, {
                    userIds: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                  })}
                />
              </div>
            </div>
            <button
              className="btn btn-xs btn-danger"
              style={{ marginTop: 20 }}
              onClick={() => remove(r.id)}
            >×</button>
          </div>
        </div>
      ))}
      <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={add}>
        + Thêm reminder
      </button>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const { config, guildData, configLoading, updateConfig, selectedGuild } = useGuild();

  if (configLoading || !config) return <div className="page-loading"><Spinner /></div>;

  const ch = guildData?.channels ?? [];
  const textChannels = ch.filter(c => c.type === 0 || c.type === 5);
  const voiceChannels = ch.filter(c => c.type === 2);
  const cacheAge = guildData?.cacheAgeMs;
  const stale = guildData?.stale;
  const cacheLabel = cacheAge != null
    ? stale
      ? '⚠ Dữ liệu có thể cũ (>15 phút)'
      : `Cập nhật ${Math.round(cacheAge / 60000)} phút trước`
    : null;

  return (
    <div className="page">
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">
        Cài đặt chung cho {selectedGuild.name}
        {cacheLabel && (
          <span style={{ marginLeft: 10, fontSize: 12, color: stale ? 'var(--yellow)' : 'var(--text-3)' }}>
            · {cacheLabel}
          </span>
        )}
      </p>

      <div className="cards-grid">

        {/* ── Cài đặt chung ── */}
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

        {/* ── Welcome ── */}
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
            <span className="form-hint">Template: <code>{'{user}'}</code> <code>{'{server}'}</code></span>
          </div>
        </SectionCard>

        {/* ── Thông báo ── */}
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

        {/* ── Music ── */}
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
              value={config.musicPrefix ?? 'hb'}
              onChange={e => updateConfig({ musicPrefix: e.target.value })}
              maxLength={10}
              style={{ width: 100 }}
            />
            <span className="form-hint">Ví dụ: <code>hb play tên bài</code></span>
          </div>
          <p className="form-hint">Bot dùng Lavalink — không xử lý audio trực tiếp, CPU thấp.</p>
        </SectionCard>

        {/* ── Reminders ── */}
        <SectionCard
          title="Reminders"
          icon="ti-bell"
          enabled={config.remindersEnabled}
          onToggle={v => updateConfig({ remindersEnabled: v })}
        >
          <ReminderEditor
            reminders={config.reminders ?? []}
            onChange={v => updateConfig({ reminders: v })}
            channels={ch}
          />
        </SectionCard>

      </div>
    </div>
  );
}
