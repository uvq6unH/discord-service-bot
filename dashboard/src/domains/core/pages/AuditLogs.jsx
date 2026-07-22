import React, { useState, useEffect } from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useGuild } from '../hooks/useGuild.js';
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
        console.error('Failed to fetch audit logs:', err);
        setLoading(false);
      });
  }, [selectedGuild?.id]);

  const formatDate = (isoStr) => {
    if (!isoStr) return '—';
    const date = new Date(isoStr);
    return date.toLocaleString('vi-VN');
  };

  return (
    <Workspace>
      <HeaderZone
        title={selectedGuild?.name ? `${selectedGuild.name.toUpperCase()} // AUDIT LOGS` : 'AUDIT LOGS'}
        subtitle={t('System audit Trail & Administrator Configuration Activity History.')}
      />

      <StatusZone>
        <KpiTile 
          label={t('Total Audit Records')} 
          value={logs.length.toString()} 
          sub="REDIS_AUDIT_LOG_BUFFER"
        />
        <KpiTile 
          label={t('Audit Status')} 
          value={loading ? t('LOADING...') : t('ACTIVE')} 
          sub="TELEMETRY_LOG_LINK"
        />
      </StatusZone>

      <div className="grid-12">
        <div className="col-span-12">
          <Panel title={t('ADMINISTRATIVE ACTIVITY LOGS')}>
            {loading ? (
              <div style={{ padding: 'var(--space-4)', textAlign: 'center' }}>Đang tải nhật ký...</div>
            ) : logs.length === 0 ? (
              <div style={{ padding: 'var(--space-4)', textAlign: 'center' }}>Chưa có lịch sử thay đổi cấu hình nào.</div>
            ) : (
              logs.map((log) => (
                <DataSlab
                  key={log.id || log.timestamp}
                  label={`${log.user} — ${log.action}`}
                  value={formatDate(log.timestamp)}
                  sub={log.details ? JSON.stringify(log.details) : 'NO_DETAILS'}
                  highlight={log.action.includes('ENABLE') || log.action.includes('UPDATE')}
                />
              ))
            )}
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
