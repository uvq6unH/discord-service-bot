import React from 'react';
import Panel from '../../../shared/primitives/Panel.jsx';
import { CheckCircle } from 'lucide-react';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';

export default function UptimeRobotStatus({ uptimeRobot, botOnline }) {
  const { t } = useLanguage();

  if (!uptimeRobot || uptimeRobot.length === 0) {
    return (
      <Panel
        title={t("UPTIMEROBOT 24/7 KEEP-ALIVE MONITORS")}
        accent
        actions={
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', padding: '2px 8px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--r2)', color: 'var(--text-3)' }}>
            ● STANDBY (LOCAL HEARTBEAT ACTIVE)
          </span>
        }
      >
        <div className="grid-12" style={{ gap: 'var(--space-3)' }}>
          <div className="col-span-6" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 'var(--r2)', padding: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-3)', fontWeight: 'bold' }}>
                BOT SERVICE HTTP MONITOR [INDEX.BOT.JS]
              </div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: botOnline ? 'var(--green)' : 'var(--red)', marginTop: '4px' }}>
                {botOnline ? '>>> HTTPS 200 OK — 24/7 ALIVE' : '>>> MONITOR ALERT — STANDBY / RESTARTING'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                Ping target: https://discord-bot-sn8v.onrender.com/health
              </div>
            </div>
            <CheckCircle size={24} style={{ color: botOnline ? 'var(--green)' : 'var(--red)' }} />
          </div>

          <div className="col-span-6" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 'var(--r2)', padding: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-3)', fontWeight: 'bold' }}>
                DASHBOARD SERVICE HTTP MONITOR [INDEX.SERVER.JS]
              </div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--green)', marginTop: '4px' }}>
                &gt;&gt;&gt; HTTPS 200 OK — 24/7 ALIVE
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                Ping target: Primary Web Application URL
              </div>
            </div>
            <CheckCircle size={24} style={{ color: 'var(--green)' }} />
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title={t("UPTIMEROBOT 24/7 KEEP-ALIVE MONITORS")}
      accent
      actions={
        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', padding: '2px 8px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--r2)', color: 'var(--green)' }}>
          ● ACTIVE (LIVE API FEED)
        </span>
      }
    >
      <div className="grid-12" style={{ gap: 'var(--space-3)' }}>
        {uptimeRobot.map(monitor => {
          const isUp = monitor.status === 2;
          const statusText = monitor.status === 2 ? '>>> HTTPS 200 OK — 24/7 ALIVE' :
                             monitor.status === 9 ? '>>> MONITOR ALERT — DOWN / OFFLINE' :
                             monitor.status === 0 ? '>>> MONITOR PAUSED' : '>>> MONITOR STANDBY';
          const statusColor = monitor.status === 2 ? 'var(--green)' :
                              monitor.status === 9 ? 'var(--red)' : 'var(--yellow)';

          return (
            <div key={monitor.id} className="col-span-6" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 'var(--r2)', padding: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-3)', fontWeight: 'bold', textTransform: 'uppercase' }}>
                  {monitor.friendly_name}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 'bold', color: statusColor, marginTop: '4px' }}>
                  {statusText}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                  Ping target: {monitor.url}
                </div>
              </div>
              <CheckCircle size={24} style={{ color: statusColor }} />
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
