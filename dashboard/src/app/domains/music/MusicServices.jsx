/**
 * domains/music/MusicServices.jsx — Community Operations Platform
 * Phase 7: Music Services domain độc lập
 * Lavalink · Nodes · Queues · Audio Settings · Playback Config
 *
 * Fix: SectionCard dùng enabled+onToggle (không phải toggle={{ enabled, onChange }})
 */
import React from 'react';
import { motion } from 'motion/react';
import { Music, Radio, Settings } from 'lucide-react';
import { useGuild } from '../../../contexts/GuildContext.jsx';
import { Spinner, SectionCard } from '../../../components/ui.jsx';

export default function MusicServicesPage() {
  const { config, updateConfig, configLoading } = useGuild();
  if (configLoading || !config) return <Spinner />;

  const music = config.music ?? {};

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
      style={{ padding: 'var(--s8)', maxWidth: 'var(--content-max)', margin: '0 auto' }}>

      {/* Domain header */}
      <div style={{ marginBottom: 'var(--s8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', marginBottom: 'var(--s2)' }}>
          <Music size={20} strokeWidth={1.75} style={{ color: 'var(--accent)' }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em' }}>
            Music Services
          </h1>
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--text-3)', background: 'var(--surface-3)', padding: '2px 8px',
            borderRadius: 4, border: '1px solid var(--border)',
          }}>Domain</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
          Lavalink · Nodes · Queues · Audio Settings · Playback Config
        </p>
      </div>

      {/* Music System — FIX: enabled + onToggle (không phải toggle={{ }}) */}
      <SectionCard
        title="Music System"
        icon={<Music size={14} strokeWidth={1.75} />}
        enabled={config.musicEnabled ?? false}
        onToggle={v => updateConfig({ musicEnabled: v })}
      >
        <div className="form-group">
          <label className="form-label">Prefix nhạc</label>
          <input
            className="form-input"
            value={config.musicPrefix ?? 'hb'}
            onChange={e => updateConfig({ musicPrefix: e.target.value })}
            placeholder="hb"
            style={{ maxWidth: 160 }}
          />
        </div>
      </SectionCard>

      {/* Playback Config */}
      <SectionCard title="Playback Config" icon={<Settings size={14} strokeWidth={1.75} />}>
        <div className="form-group">
          <label className="form-label">Default Volume</label>
          <input
            type="range"
            min={0} max={100}
            value={music.defaultVolume ?? 70}
            onChange={e => updateConfig({ music: { ...music, defaultVolume: Number(e.target.value) } })}
            style={{ width: '100%', maxWidth: 300 }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, display: 'block' }}>
            {music.defaultVolume ?? 70}%
          </span>
        </div>
      </SectionCard>

      {/* Lavalink Nodes */}
      <SectionCard title="Lavalink Nodes" icon={<Radio size={14} strokeWidth={1.75} />}>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
          Node configuration được quản lý trong file config server. Đây là phần mở rộng trong tương lai.
        </p>
      </SectionCard>
    </motion.div>
  );
}
