import React from 'react';
import Panel from '../../../shared/primitives/Panel.jsx';
import { HardDrive, Cpu, DollarSign, Activity } from 'lucide-react';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';

export default function UpstashMetrics({ upstash, redisConnected, commandsToday = 0 }) {
  const { t } = useLanguage();

  if (!redisConnected || !upstash) {
    return (
      <Panel title={t("UPSTASH REDIS CLOUD USAGE")}>
        <div style={{ padding: 'var(--space-4)', color: 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
          ⚠️ UPSTASH REDIS LINK OFFLINE OR UNREACHABLE
        </div>
      </Panel>
    );
  }

  const { commands, storage, bandwidth, cost, region, provider, tier, keys } = upstash;

  return (
    <Panel
      title={t("UPSTASH REDIS CLOUD METRICS")}
      actions={
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', padding: '2px 8px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--r2)', color: 'var(--green)' }}>
            ● {tier}
          </span>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', padding: '2px 8px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--r2)', color: 'var(--text-2)' }}>
            {provider} {region}
          </span>
        </div>
      }
    >
      <div className="grid-12" style={{ gap: 'var(--space-3)' }}>
        {/* COMMANDS */}
        <div className="col-span-3" style={{ background: '#0c0d10', border: '1px solid var(--border)', borderRadius: 'var(--r2)', padding: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-3)', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
            <span>COMMANDS</span>
            <Cpu size={14} style={{ color: 'var(--accent)' }} />
          </div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', marginTop: '8px', color: 'var(--text-1)' }}>
            {commands?.formatted ?? '0 / 500k per month'}
          </div>
          <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '12px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, commands?.percent ?? 0)}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s' }} />
          </div>
          
          {/* Reads and Writes Console Breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', backgroundColor: 'var(--green)' }} />
                <span>Writes</span>
              </div>
              <span style={{ color: 'var(--text-1)', fontWeight: 'bold' }}>{(commands?.writes ?? 0).toLocaleString('en-US')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', backgroundColor: 'var(--accent)' }} />
                <span>Reads</span>
              </div>
              <span style={{ color: 'var(--text-1)', fontWeight: 'bold' }}>{(commands?.reads ?? 0).toLocaleString('en-US')}</span>
            </div>
          </div>
        </div>

        {/* BANDWIDTH */}
        <div className="col-span-3" style={{ background: '#0c0d10', border: '1px solid var(--border)', borderRadius: 'var(--r2)', padding: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-3)', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
            <span>BANDWIDTH</span>
            <Activity size={14} style={{ color: 'var(--green)' }} />
          </div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', marginTop: '8px', color: 'var(--text-1)' }}>
            {bandwidth?.formatted ?? '0 B / 50 GB'}
          </div>
          <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '12px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, bandwidth?.percent ?? 0)}%`, height: '100%', background: 'var(--green)', transition: 'width 0.3s' }} />
          </div>
        </div>

        {/* STORAGE */}
        <div className="col-span-3" style={{ background: '#0c0d10', border: '1px solid var(--border)', borderRadius: 'var(--r2)', padding: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-3)', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
            <span>STORAGE</span>
            <HardDrive size={14} style={{ color: 'var(--yellow)' }} />
          </div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', marginTop: '8px', color: 'var(--text-1)' }}>
            {storage?.formatted ?? '0 KB / 256 MB'}
          </div>
          <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '12px', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, storage?.percent ?? 0)}%`, height: '100%', background: 'var(--yellow)', transition: 'width 0.3s' }} />
          </div>
        </div>

        {/* COST */}
        <div className="col-span-3" style={{ background: '#0c0d10', border: '1px solid var(--border)', borderRadius: 'var(--r2)', padding: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-3)', fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>
            <span>COST</span>
            <DollarSign size={14} style={{ color: 'var(--green)' }} />
          </div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', marginTop: '8px', color: 'var(--green)' }}>
            {cost ?? '$0.00'}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
            Active DB Keys: {keys ?? 0}
          </div>
        </div>

        {/* RESOURCE ALLOCATION & CAPACITY BUDGET BREAKDOWN */}
        <div className="col-span-12" style={{ marginTop: 'var(--space-2)', paddingTop: 'var(--space-3)', borderTop: '1px dashed var(--border)' }}>
          <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-3)', fontWeight: 'bold', marginBottom: 'var(--space-2)' }}>
            📊 RESOURCE ALLOCATION & MONTHLY CAPACITY BUDGET (500K CMDS / 256MB FREE TIER)
          </div>
          <div className="grid-12" style={{ gap: 'var(--space-2)' }}>
            <div className="col-span-3" style={{ background: 'var(--surface-0)', padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--r2)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>DAILY COMMAND BUDGET</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: 'var(--accent)', marginTop: '2px' }}>
                {commandsToday} / 16,666 ({((commandsToday / 16666) * 100).toFixed(1)}%)
              </div>
            </div>
            <div className="col-span-3" style={{ background: 'var(--surface-0)', padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--r2)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>HEARTBEAT CONSUMPTION</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: 'var(--text-1)', marginTop: '2px' }}>~2,880 cmds/day (17.2%)</div>
            </div>
            <div className="col-span-3" style={{ background: 'var(--surface-0)', padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--r2)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>BOT COMMAND & GAMING BUDGET</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: 'var(--green)', marginTop: '2px' }}>~13,786 cmds/day (82.8%)</div>
            </div>
            <div className="col-span-3" style={{ background: 'var(--surface-0)', padding: 'var(--space-2)', border: '1px solid var(--border)', borderRadius: 'var(--r2)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>STORAGE CAPACITY POOL</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: 'var(--yellow)', marginTop: '2px' }}>
                {keys ?? 0} active / 50,000 keys
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
