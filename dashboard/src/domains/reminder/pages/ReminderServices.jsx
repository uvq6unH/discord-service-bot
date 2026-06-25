import React from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import { useReminders } from '../hooks/useReminders.js';
import { Trash2, Plus } from 'lucide-react';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';

function ReminderItemRow({ reminder, channels, members, roles, onUpdate, onRemove }) {
  const { t } = useLanguage();
  const textChannels = channels.filter(c => c.type === 0 || c.type === 5);

  const uIds = Array.isArray(reminder.userIds) ? reminder.userIds : [];
  const rIds = Array.isArray(reminder.roleIds) ? reminder.roleIds : [];

  const selectedUsers = uIds.map(id => members.find(m => m.id === id) || { id, username: `User ${id}`, displayName: `User ${id}` });
  const availableUsers = members.filter(m => !uIds.includes(m.id));

  const selectedRoles = rIds.map(id => roles.find(r => r.id === id) || { id, name: `Role ${id}` });
  const availableRoles = roles.filter(r => !rIds.includes(r.id) && r.name !== '@everyone');

  const handleAddUser = (userId) => {
    onUpdate(reminder.id, { userIds: [...uIds, userId] });
  };

  const handleRemoveUser = (userId) => {
    onUpdate(reminder.id, { userIds: uIds.filter(id => id !== userId) });
  };

  const handleAddRole = (roleId) => {
    onUpdate(reminder.id, { roleIds: [...rIds, roleId] });
  };

  const handleRemoveRole = (roleId) => {
    onUpdate(reminder.id, { roleIds: rIds.filter(id => id !== roleId) });
  };

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
            <label className="form-label" style={{ fontSize: '10px' }}>{t("Alert Message Payload")}</label>
            <input
              className="form-input"
              style={{ fontSize: '12px' }}
              value={reminder.message}
              placeholder={t("System notification content...")}
              onChange={e => onUpdate(reminder.id, { message: e.target.value })}
            />
          </div>

          {/* Targets */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
            {/* Users */}
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '10px' }}>{t("Mention Users")}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1-5)', marginBottom: 'var(--space-2)' }}>
                {selectedUsers.map(u => (
                  <span key={u.id} style={{
                    backgroundColor: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    padding: 'var(--space-1) var(--space-2)',
                    fontSize: '11px',
                    color: 'var(--text-1)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--space-1-5)'
                  }}>
                    {u.displayName || u.username}
                    <span
                      onClick={() => handleRemoveUser(u.id)}
                      style={{ color: 'var(--red)', cursor: 'pointer', fontWeight: 'bold' }}
                      title="Remove user"
                    >
                      ×
                    </span>
                  </span>
                ))}
                {selectedUsers.length === 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{t("No users selected")}</span>
                )}
              </div>
              <select
                className="form-select"
                style={{ fontSize: '11px', padding: 'var(--space-1) var(--space-2)', height: 'auto', display: 'inline-block', width: 'auto' }}
                value=""
                onChange={e => {
                  if (e.target.value) {
                    handleAddUser(e.target.value);
                    e.target.value = '';
                  }
                }}
              >
                <option value="">{t("+ Add User...")}</option>
                {availableUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.displayName || u.username}</option>
                ))}
              </select>
            </div>

            {/* Roles */}
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '10px' }}>{t("Mention Roles")}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1-5)', marginBottom: 'var(--space-2)' }}>
                {selectedRoles.map(r => (
                  <span key={r.id} style={{
                    backgroundColor: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    padding: 'var(--space-1) var(--space-2)',
                    fontSize: '11px',
                    color: 'var(--text-1)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--space-1-5)'
                  }}>
                    {r.name}
                    <span
                      onClick={() => handleRemoveRole(r.id)}
                      style={{ color: 'var(--red)', cursor: 'pointer', fontWeight: 'bold' }}
                      title="Remove role"
                    >
                      ×
                    </span>
                  </span>
                ))}
                {selectedRoles.length === 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{t("No roles selected")}</span>
                )}
              </div>
              <select
                className="form-select"
                style={{ fontSize: '11px', padding: 'var(--space-1) var(--space-2)', height: 'auto', display: 'inline-block', width: 'auto' }}
                value=""
                onChange={e => {
                  if (e.target.value) {
                    handleAddRole(e.target.value);
                    e.target.value = '';
                  }
                }}
              >
                <option value="">{t("+ Add Role...")}</option>
                {availableRoles.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
            {/* Target Timestamp */}
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '10px' }}>{t("Target Timestamp")}</label>
              <input
                type="datetime-local"
                className="form-input"
                style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}
                value={(() => {
                  if (!reminder.time) return '';
                  const date = new Date(reminder.time);
                  if (isNaN(date.getTime())) return '';
                  const pad = n => String(n).padStart(2, '0');
                  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
                })()}
                onChange={e => {
                  if (e.target.value) {
                    onUpdate(reminder.id, { time: new Date(e.target.value).toISOString() });
                  }
                }}
              />
            </div>

            {/* Repeat Frequency */}
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '10px' }}>{t("Recurrence Interval")}</label>
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
          <div className="form-group" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
            <label className="form-label" style={{ fontSize: '10px' }}>{t("Target Channel Broadcast")}</label>
            <select
              className="form-select"
              style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}
              value={reminder.channelId ?? ''}
              onChange={e => onUpdate(reminder.id, { channelId: e.target.value })}
            >
              <option value="">{t("-- Select Channel --")}</option>
              {textChannels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
          </div>

        </div>

        {/* Trash button */}
        <button
          className="btn btn--danger"
          style={{ marginTop: 'var(--space-5)', padding: 'var(--space-2-5)' }}
          onClick={() => onRemove(reminder.id)}
          title={t("Delete Reminder Job")}
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
    roles,
    members,
    updateConfig,
    addReminder,
    removeReminder,
    updateReminder
  } = useReminders();
  const { t } = useLanguage();

  if (loading || !config) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        {t("LAUNCHING CRON CONTROLLERS...")}
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
        title={t("REMINDER JOBS PIPELINE")}
        subtitle={t("Manage scheduled alert notifications, recurring cron tasks, and target channels broadcasts.")}
      />

      {/* 2. Status Zone */}
      <StatusZone>
        <KpiTile 
          label={t("Reminder System Status")} 
          value={isEnabled ? t('NOMINAL') : t('OFFLINE')} 
          sub="REMINDER_CRON_STATE"
        />
        <KpiTile 
          label={t("Active Jobs Count")} 
          value={reminders.length} 
          sub="SCHEDULED_EVENTS"
        />
        <KpiTile 
          label={t("Target Broadcast Rooms")} 
          value={activeChannelsCount} 
          sub="UNIQUE_CHANNELS"
        />
      </StatusZone>

      {/* 3. Workspace Zone */}
      <div className="grid-12">
        <div className="col-span-12">
          <Panel title={t("CRON SCHEDULER SYSTEM")} accent>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-half)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 'bold', color: 'var(--text-1)' }}>
                  {t("SCHEDULER ENGINE POWER")}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                  {t("Enables alert threads and job execution.")}
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
                  roles={roles}
                  members={members}
                  onUpdate={updateReminder}
                  onRemove={removeReminder}
                />
              ))}

              {reminders.length === 0 && (
                <p style={{ color: 'var(--text-3)', fontSize: '13px', fontFamily: 'var(--font-mono)', padding: 'var(--space-4) 0' }}>
                  {t("[ NO REGISTERED RUNTIME CRON JOBS ]")}
                </p>
              )}

              <button
                className="btn btn--secondary"
                style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                onClick={addReminder}
              >
                <Plus size={14} /> {t("ADD NEW RUNTIME JOB")}
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
