import React, { useState, useEffect } from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import MasonryGrid from '../../../shared/primitives/MasonryGrid.jsx';
import { useGuild } from '../../../shared/hooks/useGuild.js';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';

import { useLocation } from 'react-router-dom';

export default function AuditLogsPage() {
  const { config, updateConfig, guildData, selectedGuild } = useGuild();
  const location = useLocation();
  const highlight = location.state?.highlight;
  const { t } = useLanguage();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const textChannels = (guildData?.channels || []).filter(c => c.type === 0);
  const serverName = selectedGuild?.name ? selectedGuild.name.toUpperCase() : '';

  useEffect(() => {
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
  }, [selectedGuild?.id]);

  const formatDate = (isoStr) => {
    if (!isoStr) return '—';
    try {
      const date = new Date(isoStr);
      return date.toLocaleString('vi-VN');
    } catch {
      return isoStr;
    }
  };

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
      <MasonryGrid minWidth={350} gap={20}>
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
          {loading ? (
            <div style={{ padding: 'var(--space-6)', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
              {t("LOADING AUDIT LOGS BUFFER...")}
            </div>
          ) : logs.length === 0 ? (
            <div style={{ padding: 'var(--space-6)', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
              {t("[ NO AUDIT RECORDS FOUND ]")}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {logs.map((log) => (
                <DataSlab
                  key={log.id || log.timestamp}
                  label={`${log.user} — ${log.action}`}
                  value={formatDate(log.timestamp)}
                  sub={log.details ? JSON.stringify(log.details) : 'NO_DETAILS'}
                  highlight={log.action.includes('ENABLE') || log.action.includes('UPDATE')}
                />
              ))}
            </div>
          )}
        </Panel>
      </MasonryGrid>
    </Workspace>
  );
}
