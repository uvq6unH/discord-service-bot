import React from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import { useReminders } from '../hooks/useReminders.js';
import { Trash2, Plus } from 'lucide-react';

function ReminderItemRow({ reminder, channels, onUpdate, onRemove }) {
  const textChannels = channels.filter(c => c.type === 0 || c.type === 5);

  return (
    <div style={{
      background: 'var(--surface-1)',
      border: '1px solid var(--border)',
      padding: 'var(--space-4)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)'
    }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          
          {/* Message Input */}
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '10px' }}>Alert Message Payload</label>
            <input
              className="form-input"
              style={{ fontSize: '12px' }}
              value={reminder.message}
              placeholder="System notification content..."
              onChange={e => onUpdate(reminder.id, { message: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            {/* Timestamp Target */}
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '10px' }}>Target Timestamp</label>
              <input
                type="datetime-local"
                className="form-input"
                style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}
                value={reminder.time ? reminder.time.slice(0, 16) : ''}
                onChange={e => onUpdate(reminder.id, { time: new Date(e.target.value).toISOString() })}
              />
            </div>

            {/* Repeat Frequency */}
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '10px' }}>Recurrence Interval</label>
              <select
                className="form-select"
                style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}
                value={reminder.repeat ?? 'none'}
                onChange={e => onUpdate(reminder.id, { repeat: e.target.value })}
              >
                <option value="none">RUN_ONCE</option>
                <option value="hourly">HOURLY_CRON</option>
                <option value="daily">DAILY_CRON</option>
                <option value="weekly">WEEKLY_CRON</option>
              </select>
            </div>
          </div>

          {/* Target Channel */}
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '10px' }}>Target Channel Broadcast</label>
            <select
              className="form-select"
              style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}
              value={reminder.channelId ?? ''}
              onChange={e => onUpdate(reminder.id, { channelId: e.target.value })}
            >
              <option value="">-- Select Channel --</option>
              {textChannels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
          </div>

        </div>

        {/* Trash button */}
        <button
          className="btn btn--danger"
          style={{ marginTop: 'var(--space-5)', padding: 'var(--space-2-5)' }}
          onClick={() => onRemove(reminder.id)}
          title="Delete Reminder Job"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default function ReminderServicesPage() {
  const {
    config,
    loading,
    channels,
    updateConfig,
    addReminder,
    removeReminder,
    updateReminder
  } = useReminders();

  if (loading || !config) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        LAUNCHING CRON CONTROLLERS...
      </div>
    );
  }

  const isEnabled = config.remindersEnabled ?? false;
  const reminders = config.reminders ?? [];

  // Count unique channels used
  const activeChannelsCount = new Set(
    reminders.map(r => r.channelId).filter(Boolean)
  ).size;

  return (
    <Workspace>
      {/* 1. Header Zone */}
      <HeaderZone
        title="REMINDER JOBS PIPELINE"
        subtitle="Manage scheduled alert notifications, recurring cron tasks, and target channels broadcasts."
      />

      {/* 2. Status Zone */}
      <StatusZone>
        <KpiTile 
          label="Reminder System Status" 
          value={isEnabled ? 'NOMINAL' : 'OFFLINE'} 
          sub="REMINDER_CRON_STATE"
        />
        <KpiTile 
          label="Active Jobs Count" 
          value={reminders.length} 
          sub="SCHEDULED_EVENTS"
        />
        <KpiTile 
          label="Target Broadcast Rooms" 
          value={activeChannelsCount} 
          sub="UNIQUE_CHANNELS"
        />
      </StatusZone>

      {/* 3. Workspace Zone */}
      <div className="grid-12">
        <div className="col-span-12">
          <Panel title="CRON SCHEDULER SYSTEM" accent>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-half)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 'bold', color: 'var(--text-1)' }}>
                  SCHEDULER ENGINE POWER
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                  Enables alert threads and job execution.
                </span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  className="toggle-switch__input"
                  checked={isEnabled}
                  onChange={e => updateConfig({ remindersEnabled: e.target.checked })}
                />
                <div className="toggle-switch__track">
                  <div className="toggle-switch__thumb" />
                </div>
              </label>
            </div>

            {/* List reminders */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)', opacity: isEnabled ? 1 : 0.4, pointerEvents: isEnabled ? 'auto' : 'none' }}>
              {reminders.map(r => (
                <ReminderItemRow
                  key={r.id}
                  reminder={r}
                  channels={channels}
                  onUpdate={updateReminder}
                  onRemove={removeReminder}
                />
              ))}

              {reminders.length === 0 && (
                <p style={{ color: 'var(--text-3)', fontSize: '13px', fontFamily: 'var(--font-mono)', padding: 'var(--space-4) 0' }}>
                  [ NO REGISTERED RUNTIME CRON JOBS ]
                </p>
              )}

              <button
                className="btn btn--secondary"
                style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                onClick={addReminder}
              >
                <Plus size={14} /> ADD NEW RUNTIME JOB
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
