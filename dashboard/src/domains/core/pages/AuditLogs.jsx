import React, { useState, useEffect } from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useGuild } from '../../../shared/hooks/useGuild.js';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';

export default function AuditLogsPage() {
  const { selectedGuild } = useGuild();
  const { t } = useLanguage();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

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
        title={selectedGuild?.name ? `${selectedGuild.name.toUpperCase()} // AUDIT LOGS` : 'AUDIT LOGS'}
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
          label={t("Audit Status")} 
          value={loading ? t("LOADING...") : t("ACTIVE")} 
          sub="TELEMETRY_LOG_LINK"
        />
      </StatusZone>

      {/* 3. Workspace Zone */}
      <div className="grid-12">
        <div className="col-span-12">
          <Panel title={t("ADMINISTRATIVE ACTIVITY LOGS")} accent>
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
        </div>
      </div>
    </Workspace>
  );
}
