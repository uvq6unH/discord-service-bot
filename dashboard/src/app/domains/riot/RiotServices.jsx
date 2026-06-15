/**
 * domains/riot/RiotServices.jsx — Community Operations Platform
 * Phase 6: Riot Services domain độc lập
 * TFT · League · Match Tracking · Rank Monitoring · Player Lookup
 * Logic giữ nguyên 100% từ Lol.jsx
 */
import React from 'react';
import { motion } from 'motion/react';
import { Sword, Key, Crown, Database } from 'lucide-react';
import { useGuild } from '../../services/guild/GuildContext.jsx';
import { Spinner, SectionCard } from '../../../components/ui.jsx';

function ApiKeyInput({ label, valueKey, configuredKey, config, updateConfig, placeholder }) {
  const isConfigured = config[configuredKey];
  const currentVal   = config[valueKey] ?? '';
  return (
    <div className="form-group">
      <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}
        {isConfigured && !currentVal && (
          <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 99, fontWeight: 600, background: 'rgba(34,197,94,.15)', color: 'var(--green)', border: '1px solid rgba(34,197,94,.3)' }}>✓ Đã cấu hình</span>
        )}
        {!isConfigured && !currentVal && (
          <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 99, fontWeight: 600, background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(239,68,68,.25)' }}>Chưa cài</span>
        )}
      </label>
      <input type="password" className="form-input" value={currentVal}
        onChange={e => updateConfig({ [valueKey]: e.target.value })}
        placeholder={isConfigured && !currentVal ? '••••••••••• (để trống = giữ nguyên)' : placeholder}
        autoComplete="new-password" />
    </div>
  );
}

function CmdRef({ cmds }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s1)' }}>
      {cmds.map(c => (
        <code key={c} style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 'var(--r2)', padding: '2px 8px', fontSize: 12, color: 'var(--accent)' }}>/{c}</code>
      ))}
    </div>
  );
}

export default function RiotServicesPage() {
  const { config, updateConfig, configLoading } = useGuild();
  if (configLoading || !config) return <Spinner />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
      style={{ padding: 'var(--s8)', maxWidth: 'var(--content-max)', margin: '0 auto' }}>
      <div style={{ marginBottom: 'var(--s8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', marginBottom: 'var(--s2)' }}>
          <Sword size={20} strokeWidth={1.75} style={{ color: 'var(--accent)' }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em' }}>Riot Services</h1>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', background: 'var(--surface-3)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>Domain</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>TFT · League · Match Tracking · Rank Monitoring · Player Lookup · (Valorant — sắp ra mắt)</p>
      </div>

      <SectionCard title="API Keys" icon={<Key size={14} strokeWidth={1.75} />}>
        <ApiKeyInput label="Riot API Key" valueKey="riotApiKey" configuredKey="riotApiKeyConfigured" config={config} updateConfig={updateConfig} placeholder="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
        <ApiKeyInput label="TFT API Key (nếu khác Riot key)" valueKey="tftApiKey" configuredKey="tftApiKeyConfigured" config={config} updateConfig={updateConfig} placeholder="Để trống nếu dùng chung Riot API Key" />
      </SectionCard>

      <SectionCard title="League of Legends" icon={<Crown size={14} strokeWidth={1.75} />}
        toggle={{ enabled: config.lolEnabled ?? false, onChange: v => updateConfig({ lolEnabled: v }) }}>
        <CmdRef cmds={['rank', 'profile', 'mastery', 'live', 'history']} />
      </SectionCard>

      <SectionCard title="Teamfight Tactics" icon={<Database size={14} strokeWidth={1.75} />}
        toggle={{ enabled: config.tftEnabled ?? false, onChange: v => updateConfig({ tftEnabled: v }) }}>
        <CmdRef cmds={['tftrank', 'tftprofile', 'tftcomp', 'tftlive']} />
      </SectionCard>
    </motion.div>
  );
}
