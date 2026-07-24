import React, { useState, useEffect, useRef } from 'react';
import Panel from '../../../shared/primitives/Panel.jsx';
import { apiFetch } from '../../../api.js';
import { Play, Pause, Trash2, Terminal } from 'lucide-react';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';

export default function LiveConsole() {
  const { t } = useLanguage();
  const [logs, setLogs] = useState([]);
  const [paused, setPaused] = useState(false);
  const [filterType, setFilterType] = useState('ALL');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (paused) return;

    let isMounted = true;
    const fetchLogs = async () => {
      try {
        const res = await apiFetch('/api/system/logs', {}, { allowNotOk: true });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.logs)) {
            setLogs(data.logs);
          }
        }
      } catch {}
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [paused]);

  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, paused]);

  const filteredLogs = filterType === 'ALL'
    ? logs
    : logs.filter(l => (l.type || '').toUpperCase() === filterType);

  const getTypeColor = (type) => {
    switch ((type || '').toUpperCase()) {
      case 'ERROR': return 'var(--red)';
      case 'WARN': return 'var(--yellow)';
      case 'CMD': return 'var(--accent)';
      case 'INFO': default: return 'var(--green)';
    }
  };

  return (
    <Panel
      title={t("LIVE ENGINE CONSOLE LOGS")}
      accent
      actions={
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              background: 'var(--surface-1)',
              color: 'var(--text-1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r2)'
            }}
          >
            <option value="ALL">ALL LOGS</option>
            <option value="INFO">INFO</option>
            <option value="CMD">CMD</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
          </select>
          <button
            className="btn btn--secondary"
            onClick={() => setPaused(!paused)}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '2px 8px' }}
          >
            {paused ? <Play size={10} /> : <Pause size={10} />}
            {paused ? 'RESUME' : 'PAUSE'}
          </button>
          <button
            className="btn btn--secondary"
            onClick={() => setLogs([])}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '2px 8px' }}
          >
            <Trash2 size={10} /> CLEAR
          </button>
        </div>
      }
    >
      <div
        ref={scrollRef}
        style={{
          background: 'var(--surface-0)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r2)',
          padding: 'var(--space-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          height: '240px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}
      >
        {filteredLogs.length === 0 ? (
          <div style={{ color: 'var(--text-3)', textAlign: 'center', paddingTop: '80px' }}>
            <Terminal size={18} style={{ opacity: 0.5, marginBottom: '6px' }} />
            <div>NO LIVE TELEMETRY LOGS IN BUFFER</div>
          </div>
        ) : (
          filteredLogs.map((log, idx) => (
            <div key={log.id || idx} style={{ display: 'flex', gap: '8px', lineHeight: '1.4', wordBreak: 'break-all' }}>
              <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>
                {log.ts ? new Date(log.ts).toLocaleTimeString('vi-VN') : '—'}
              </span>
              <span style={{ color: getTypeColor(log.type), fontWeight: 'bold', flexShrink: 0, width: '48px' }}>
                [{log.type || 'INFO'}]
              </span>
              <span style={{ color: 'var(--text-1)', flex: 1 }}>
                {log.message}
              </span>
              {log.metadata && (
                <span style={{ color: 'var(--text-3)', fontSize: '10px' }}>
                  ({log.metadata})
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
