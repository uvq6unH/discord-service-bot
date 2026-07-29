import React, { useState, useEffect, useMemo } from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import MasonryGrid from '../../../shared/primitives/MasonryGrid.jsx';
import { useGuild } from '../../../shared/hooks/useGuild.js';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';
import { useLocation } from 'react-router-dom';
import { Search, RefreshCw, SlidersHorizontal } from 'lucide-react';

function AuditLogRow({ log }) {
  const { action, user, timestamp, details } = log;

  const getActionBadge = (act) => {
    switch (act) {
      case 'UPDATE_GUILD_CONFIG':
        return { label: 'CONFIG_UPDATE', color: 'var(--accent)', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)' };
      case 'ENABLE_COMMAND':
        return { label: 'CMD_ENABLED', color: 'var(--green)', bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.3)' };
      case 'DISABLE_COMMAND':
        return { label: 'CMD_DISABLED', color: 'var(--red)', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)' };
      default:
        return { label: act || 'AUDIT_LOG', color: 'var(--text-2)', bg: 'var(--surface-2)', border: 'var(--border)' };
    }
  };

  const badge = getActionBadge(action);

  const renderDetails = () => {
    if (!details) return null;

    if (action === 'UPDATE_GUILD_CONFIG' && Array.isArray(details.fields)) {
      const fieldNameMap = {
        enabled: 'Hệ thống Bot',
        prefix: 'Prefix',
        disabledCommands: 'Danh sách Lệnh Tắt',
        commands: 'Routing Lệnh',
        core: 'Core System',
        moderationEnabled: 'Khiên AutoMod',
        autoModEnabled: 'Bảo vệ AutoMod',
        deleteBlockedMessages: 'Xóa tin vi phạm',
        antiLinkEnabled: 'Anti-Link Protocol',
        antiSpamEnabled: 'Anti-Spam Shield',
        antiRaidEnabled: 'Anti-Raid Protocol',
        badWords: 'Từ điển Từ cấm',
        blockedMessage: 'Thông báo vi phạm',
        moderation: 'Moderation Settings',
        rolesEnabled: 'Self-Roles',
        autoRoleId: 'Auto-Role',
        selfRolePanelTitle: 'Tiêu đề Self-Role',
        selfRolePanelMessage: 'Nội dung Self-Role',
        ticketsEnabled: 'Hệ thống Ticket',
        ticketCategoryId: 'Category Ticket',
        ticketLogChannelId: 'Channel Ticket Log',
        economyEnabled: 'Kinh tế & XP',
        dailyEnabled: 'Thưởng Daily',
        mentionReactEnabled: 'Mention React'
      };

      const items = details.fields.map(f => fieldNameMap[f] || f);
      const displayItems = items.slice(0, 5);
      const remainingCount = items.length - displayItems.length;

      return (
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>Thay đổi:</span>
          {displayItems.map((item, idx) => (
            <span
              key={idx}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                padding: '2px 7px',
                borderRadius: '3px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-1)'
              }}
            >
              {item}
            </span>
          ))}
          {remainingCount > 0 && (
            <span style={{ fontSize: '10px', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
              +{remainingCount} mục khác
            </span>
          )}
        </div>
      );
    }

    if (action === 'ENABLE_COMMAND' || action === 'DISABLE_COMMAND') {
      const cmdName = details.commandName || 'Command';
      const isEnable = action === 'ENABLE_COMMAND';
      return (
        <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', marginTop: '4px', color: isEnable ? 'var(--green)' : 'var(--red)' }}>
          {isEnable ? '🟢 Kích hoạt lệnh:' : '🔴 Vô hiệu hóa lệnh:'} <strong style={{ color: 'var(--text-1)' }}>/{cmdName}</strong>
        </div>
      );
    }

    if (typeof details === 'object') {
      const entries = Object.entries(details);
      if (entries.length === 0) return null;
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
          {entries.map(([k, v], idx) => (
            <span key={idx} style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
              <span style={{ color: 'var(--text-2)' }}>{k}:</span> {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </span>
          ))}
        </div>
      );
    }

    return <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>{String(details)}</div>;
  };

  const formatDateStr = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  const formatRelative = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const diffSec = Math.floor((new Date() - d) / 1000);
      if (diffSec < 30) return 'vừa xong';
      if (diffSec < 60) return `${diffSec}s trước`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m trước`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour}h trước`;
      const diffDay = Math.floor(diffHour / 24);
      return `${diffDay}d trước`;
    } catch {
      return '';
    }
  };

  const relativeTime = formatRelative(timestamp);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justify: 'space-between',
        padding: '12px 16px',
        backgroundColor: 'var(--surface-1)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r2, 4px)',
        gap: '16px',
        minWidth: 0,
        maxWidth: '100%',
        overflow: 'hidden',
        transition: 'border-color var(--motion-fast)'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 'bold',
              letterSpacing: '0.05em',
              padding: '3px 8px',
              borderRadius: '3px',
              color: badge.color,
              backgroundColor: badge.bg,
              border: `1px solid ${badge.border}`
            }}
          >
            {badge.label}
          </span>
          <span style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--text-1)' }}>
            @{user || 'Admin'}
          </span>
        </div>
        {renderDetails()}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-1)', fontWeight: 'bold' }}>
          {formatDateStr(timestamp)}
        </span>
        {relativeTime && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-3)' }}>
            ({relativeTime})
          </span>
        )}
      </div>
    </div>
  );
}

export default function AuditLogsPage() {
  const { config, updateConfig, guildData, selectedGuild } = useGuild();
  const location = useLocation();
  const highlight = location.state?.highlight;
  const { t } = useLanguage();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  const textChannels = (guildData?.channels || []).filter(c => c.type === 0);
  const serverName = selectedGuild?.name ? selectedGuild.name.toUpperCase() : '';

  const fetchLogs = () => {
    if (!selectedGuild?.id) return;
    setLoading(true);
    fetch(`/api/guilds/${selectedGuild.id}/audit-logs`)
      .then(res => res.json())
      .then(data => {
        setLogs(data.logs || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('[audit-logs] Failed to fetch:', err);
        setLogs([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedGuild?.id]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (actionFilter === 'CONFIG' && log.action !== 'UPDATE_GUILD_CONFIG') return false;
      if (actionFilter === 'COMMAND' && !log.action.includes('COMMAND')) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const userMatch = log.user?.toLowerCase().includes(q);
      const actionMatch = log.action?.toLowerCase().includes(q);
      const detailsMatch = JSON.stringify(log.details || {}).toLowerCase().includes(q);
      return userMatch || actionMatch || detailsMatch;
    });
  }, [logs, searchQuery, actionFilter]);

  return (
    <Workspace>
      {/* 1. Header Zone */}
      <HeaderZone
        title={serverName ? `${serverName} // AUDIT LOGS` : 'AUDIT LOGS'}
        subtitle={t("System Audit Trail & Administrator Configuration Activity History.")}
      />

      {/* 2. Status Zone */}
      <StatusZone>
        <KpiTile 
          label={t("Total Audit Records")} 
          value={logs.length.toString()} 
          sub="REDIS_AUDIT_LOG_BUFFER"
        />
        <KpiTile 
          label={t("Logging Target")} 
          value={config?.logChannelId ? `#${(textChannels.find(c => c.id === config.logChannelId)?.name || config.logChannelId)}` : t("UNSET")} 
          sub="SECURITY_LOG_CHANNEL"
        />
        <KpiTile 
          label={t("Audit Status")} 
          value={loading ? t("LOADING...") : t("ACTIVE")} 
          sub="TELEMETRY_LOG_LINK"
        />
      </StatusZone>

      {/* 3. Workspace Zone */}
      <MasonryGrid cols={1} gap={20}>
        {/* Logging Integration Panel */}
        <Panel title={t("SECURITY LOGGING CHANNEL INTEGRATION")} accent className={highlight === 'logchannel' ? 'flash-target' : ''}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <label className="form-label" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
              {t("Security & Audit Events Logging Target Channel")}
            </label>
            <select
              className="form-select"
              value={config?.logChannelId || ''}
              onChange={(e) => updateConfig && updateConfig({ logChannelId: e.target.value })}
            >
              <option value="">-- {t("Select Log Channel")} --</option>
              {textChannels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
            <span style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              {t("Automated audit notifications, moderation actions, and guild security logs target channel.")}
            </span>
          </div>
        </Panel>

        {/* Administrative Activity Logs Panel */}
        <Panel title={t("ADMINISTRATIVE ACTIVITY LOGS")} accent className={highlight === 'activity' ? 'flash-target' : ''}>
            {/* Filter & Search Bar */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                <input
                  className="form-input"
                  style={{ paddingLeft: '32px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
                  placeholder="Tìm kiếm theo admin, hành động hoặc chi tiết..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className={`btn ${actionFilter === 'ALL' ? 'btn--primary' : 'btn--secondary'}`}
                  style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', padding: '6px 12px' }}
                  onClick={() => setActionFilter('ALL')}
                >
                  TẤT CẢ ({logs.length})
                </button>
                <button
                  className={`btn ${actionFilter === 'CONFIG' ? 'btn--primary' : 'btn--secondary'}`}
                  style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', padding: '6px 12px' }}
                  onClick={() => setActionFilter('CONFIG')}
                >
                  CẤU HÌNH
                </button>
                <button
                  className={`btn ${actionFilter === 'COMMAND' ? 'btn--primary' : 'btn--secondary'}`}
                  style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', padding: '6px 12px' }}
                  onClick={() => setActionFilter('COMMAND')}
                >
                  BẬT/TẮT LỆNH
                </button>
                <button
                  className="btn btn--secondary"
                  style={{ fontSize: '11px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={fetchLogs}
                  title="Làm mới log"
                >
                  <RefreshCw size={13} className={loading ? 'spin' : ''} />
                </button>
              </div>
            </div>

            {loading ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
                {t("LOADING AUDIT LOGS BUFFER...")}
              </div>
            ) : filteredLogs.length === 0 ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
                {searchQuery ? '[ KHÔNG THẤY KẾT QUẢ TÌM KIẾM ]' : t("[ NO AUDIT RECORDS FOUND ]")}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {filteredLogs.map((log) => (
                  <AuditLogRow key={log.id || log.timestamp} log={log} />
                ))}
              </div>
            )}
          </Panel>
      </MasonryGrid>
    </Workspace>
  );
}

