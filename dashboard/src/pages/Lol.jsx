import React from 'react';
import { useGuild } from '../contexts/GuildContext.jsx';
import { Spinner, SectionCard, TextInput, Toggle } from '../components/ui.jsx';

export default function LolPage() {
  const { config, configLoading, updateConfig } = useGuild();

  if (configLoading || !config) return <div className="page-loading"><Spinner /></div>;

  return (
    <div className="page">
      <h1 className="page-title">LoL & TFT</h1>
      <p className="page-subtitle">
        Tích hợp Riot API — hỗ trợ TTL cache, token bucket, account linking.
      </p>

      <div className="cards-grid">
        <SectionCard title="Riot API" icon="ti-key">
          <div className="form-group">
            <label className="form-label">Riot API Key</label>
            <input
              type="password"
              className="form-input"
              value={config.riotApiKey ?? ''}
              onChange={e => updateConfig({ riotApiKey: e.target.value })}
              placeholder={config.riotApiKeyConfigured ? '••••••••••• (đã cấu hình)' : 'RGAPI-…'}
            />
            <span className="form-hint">
              Lấy tại <a href="https://developer.riotgames.com" target="_blank" rel="noreferrer">developer.riotgames.com</a>
            </span>
          </div>
          <div className="form-group">
            <label className="form-label">TFT API Key</label>
            <input
              type="password"
              className="form-input"
              value={config.tftApiKey ?? ''}
              onChange={e => updateConfig({ tftApiKey: e.target.value })}
              placeholder={config.tftApiKeyConfigured ? '••••••••••• (đã cấu hình)' : 'RGAPI-…'}
            />
          </div>
        </SectionCard>

        <SectionCard title="Lệnh LoL" icon="ti-sword">
          <p className="form-hint">
            Bao gồm: <code>/lsd</code> <code>/lolprofile</code> <code>/lolmatch</code>{' '}
            <code>/lolchamp</code> <code>/lolitem</code> <code>/lolrunes</code>{' '}
            <code>/lolpatch</code> <code>/lollink</code> <code>/lolunlink</code>
          </p>
          <p className="form-hint">
            Cooldown mặc định 15 giây giữa các lệnh Riot để tránh rate limit 429.
          </p>
        </SectionCard>

        <SectionCard title="Lệnh TFT" icon="ti-chess-knight">
          <p className="form-hint">
            Bao gồm: <code>/tftlsd</code> <code>/tftprofile</code> <code>/tftmatch</code>{' '}
            <code>/tftlink</code> <code>/tftunlink</code>
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
