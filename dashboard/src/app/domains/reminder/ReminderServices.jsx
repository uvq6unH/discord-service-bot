/**
 * domains/reminder/ReminderServices.jsx — Community Operations Platform
 * Phase 8: Reminder Services domain độc lập
 * Scheduled Jobs · Reminders · Recurring Tasks · Event Notifications
 * Logic giữ nguyên 100% từ phần ReminderEditor trong Overview.jsx cũ
 */
import React from 'react';
import { motion } from 'motion/react';
import { Bell, Plus, Trash2 } from 'lucide-react';
import { useGuild } from '../../services/guild/GuildContext.jsx';
import { Spinner, SectionCard, ChannelSelect } from '../../../components/ui.jsx';

function localISOString(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
         `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ReminderEditor({ reminders, onChange, channels }) {
  const textChannels = channels.filter(c => c.type === 0 || c.type === 5);

  const add = () => onChange([
    ...reminders,
    {
      id: `rem_${Date.now()}`,
      userIds: [], channelId: '', message: '',
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
                <input className="form-input" placeholder="Nội dung reminder…"
                  value={r.message} onChange={e => update(r.id, { message: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 'var(--s2)' }}>
                <div className="form-group" style={{ margin: 0, flex: 1 }}>
                  <label className="form-label">Thời gian</label>
                  <input type="datetime-local" className="form-input"
                    value={r.time ? r.time.slice(0, 16) : ''}
                    onChange={e => update(r.id, { time: new Date(e.target.value).toISOString() })} />
                </div>
                <div className="form-group" style={{ margin: 0, flex: 1 }}>
                  <label className="form-label">Lặp lại</label>
                  <select className="form-select" value={r.repeat ?? 'none'}
                    onChange={e => update(r.id, { repeat: e.target.value })}>
                    <option value="none">Một lần</option>
                    <option value="hourly">Mỗi giờ</option>
                    <option value="daily">Mỗi ngày</option>
                    <option value="weekly">Mỗi tuần</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Kênh gửi</label>
                <ChannelSelect channels={textChannels} value={r.channelId}
                  onChange={v => update(r.id, { channelId: v })} />
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 20, color: 'var(--red)', flexShrink: 0 }}
              onClick={() => remove(r.id)} title="Xóa reminder">
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={add}
        style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 'var(--s1)' }}>
        <Plus size={13} strokeWidth={2} /> Thêm Reminder
      </button>
    </div>
  );
}

export default function ReminderServicesPage() {
  const { config, updateConfig, configLoading, guildData } = useGuild();
  if (configLoading || !config) return <Spinner />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
      style={{ padding: 'var(--s8)', maxWidth: 'var(--content-max)', margin: '0 auto' }}>
      <div style={{ marginBottom: 'var(--s8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', marginBottom: 'var(--s2)' }}>
          <Bell size={20} strokeWidth={1.75} style={{ color: 'var(--accent)' }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em' }}>Reminder Services</h1>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', background: 'var(--surface-3)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>Domain</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Scheduled Jobs · Reminders · Recurring Tasks · Event Notifications</p>
      </div>

      <SectionCard title="Reminder System" icon={<Bell size={14} strokeWidth={1.75} />}
        toggle={{ enabled: config.remindersEnabled ?? false, onChange: v => updateConfig({ remindersEnabled: v }) }}>
        <ReminderEditor
          reminders={config.reminders ?? []}
          onChange={v => updateConfig({ reminders: v })}
          channels={guildData?.channels ?? []}
        />
      </SectionCard>
    </motion.div>
  );
}
