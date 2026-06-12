import React from 'react';
import { Key, Sword, Crown, Database } from 'lucide-react';
import { useGuild } from '../contexts/GuildContext.jsx';
import { Spinner, SectionCard, ThemeToggle} from '../components/ui.jsx';


// ── API key row với status badge ─────────────────────────────────────────────
function ApiKeyInput({ label, valueKey, configuredKey, config, updateConfig, placeholder }) {
  const isConfigured = config[configuredKey];
  const currentVal   = config[valueKey] ?? '';

  return (
    <div className="form-group">
      <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}
        {isConfigured && !currentVal && (
          <span style={{
            fontSize: 11, padding: '1px 7px', borderRadius: 99, fontWeight: 600,
            background: 'rgba(34,197,94,.15)', color: 'var(--green)',
            border: '1px solid rgba(34,197,94,.3)',
          }}>✓ Đã cấu hình</span>
        )}
        {!isConfigured && !currentVal && (
          <span style={{
            fontSize: 11, padding: '1px 7px', borderRadius: 99, fontWeight: 600,
            background: 'var(--red-dim)', color: 'var(--red)',
            border: '1px solid rgba(239,68,68,.25)',
          }}>Chưa cài</span>
        )}
      </label>
      <input
        type="password"
        className="form-input"
        value={currentVal}
        onChange={e => updateConfig({ [valueKey]: e.target.value })}
        placeholder={isConfigured && !currentVal ? '••••••••••• (để trống = giữ nguyên)' : placeholder}
        autoComplete="new-password"
      />
    </div>
  );
}

// ── Command reference card ───────────────────────────────────────────────────
function CmdRef({ cmds }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s1)' }}>
      {cmds.map(c => (
        <code key={c} style={{
          background: 'var(--surface-3)', border: '1px solid var(--border)',
          borderRadius: 'var(--r2)', padding: '2px 8px', fontSize: 12,
          color: 'var(--accent)',
        }}>/{c}</code>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LolPage() {
  
  const { config, configLoading, updateConfig } = useGuild();

  if (configLoading || !config) return <div className="page-loading"><Spinner /></div>;

  return (
    <div className="page">
      <div className="page-header-row">
        <h1 className="page-title">LoL & TFT</h1>
        <ThemeToggle />
      </div>
      <p className="page-subtitle">
        Tich hop Riot API - ho tro TTL cache, token bucket, account linking qua Discord ID.
      </p>

      <div className="cards-grid">

        {/* ── API Keys ── */}
        <SectionCard title="Riot API Keys" icon={<Key size={16} />}>
          <form autoComplete="off" onSubmit={e => e.preventDefault()}>
            {/* Hidden username trick để tắt browser autofill */}
            <input type="text" name="username" autoComplete="username" style={{ display: 'none' }} readOnly />
            <ApiKeyInput
              label="Riot API Key (LoL)"
              valueKey="riotApiKey"
              configuredKey="riotApiKeyConfigured"
              config={config}
              updateConfig={updateConfig}
              placeholder="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
            <ApiKeyInput
              label="TFT API Key"
              valueKey="tftApiKey"
              configuredKey="tftApiKeyConfigured"
              config={config}
              updateConfig={updateConfig}
              placeholder="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </form>
          <p className="form-hint">
            Lấy tại{' '}
            <a href="https://developer.riotgames.com" target="_blank" rel="noreferrer">
              developer.riotgames.com
            </a>.{' '}
            Key <strong>Development</strong> bi rate limit thap. Production key cần approval của Riot.
          </p>
          <p className="form-hint" style={{ marginTop: 4 }}>
            Key được lưu vào Redis và persist qua restart. Nhập key rồi bấm <strong>Lưu thay đổi</strong> ở cuối trang.
          </p>
        </SectionCard>

        {/* ── LoL commands ── */}
        <SectionCard title="Lệnh League of Legends" icon={<Sword size={16} />}>
          <CmdRef cmds={['lsd', 'lol', 'lolmatch', 'lolchamp', 'lolitem', 'lolrunes', 'lolpatch', 'lollink', 'lolunlink']} />
          <div style={{ marginTop: 'var(--s3)', display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
            {[
              ['/lsd',      'Lịch sử 5 trận LoL gần nhất'],
              ['/lol',      'Hồ sơ người chơi (rank, mastery)'],
              ['/lolmatch', 'Chi tiết một trận đấu cụ thể'],
              ['/lolchamp', 'Thông tin tướng'],
              ['/lolitem',  'Thông tin trang bị'],
              ['/lolrunes', 'Bảng ngọc gợi ý'],
              ['/lolpatch', 'Phiên bản LoL mới nhất'],
              ['/lollink',  'Liên kết tài khoản Riot với Discord'],
              ['/lolunlink','Bỏ liên kết'],
            ].map(([cmd, desc]) => (
              <div key={cmd} style={{ display: 'flex', gap: 'var(--s3)', alignItems: 'baseline' }}>
                <code style={{ minWidth: 100, color: 'var(--accent)', fontSize: 12 }}>{cmd}</code>
                <span style={{ color: 'var(--text-2)', fontSize: 13 }}>{desc}</span>
              </div>
            ))}
          </div>
          <p className="form-hint" style={{ marginTop: 'var(--s3)' }}>
            Cooldown 15s giữa các lệnh Riot để tránh rate limit 429.
          </p>
        </SectionCard>

        {/* ── TFT commands ── */}
        <SectionCard title="Lệnh Teamfight Tactics" icon={<Crown size={16} />}>
          <CmdRef cmds={['tftlsd', 'tft', 'tftmatch', 'tftlink', 'tftunlink']} />
          <div style={{ marginTop: 'var(--s3)', display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
            {[
              ['/tftlsd',   'Lịch sử 5 trận TFT (hạng, bài, con, đồ, augment)'],
              ['/tft',      'Hồ sơ TFT (rank, avg placement, trait stats)'],
              ['/tftmatch', 'Chi tiết trận TFT (bài, con, đồ đầy đủ)'],
              ['/tftlink',  'Liên kết tài khoản TFT với Discord'],
              ['/tftunlink','Bỏ liên kết TFT'],
            ].map(([cmd, desc]) => (
              <div key={cmd} style={{ display: 'flex', gap: 'var(--s3)', alignItems: 'baseline' }}>
                <code style={{ minWidth: 100, color: 'var(--accent)', fontSize: 12 }}>{cmd}</code>
                <span style={{ color: 'var(--text-2)', fontSize: 13 }}>{desc}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* ── Rate limit info ── */}
        <SectionCard title="Rate limits & Cache" icon={<Database size={16} />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
            {[
              ['Development key',   '20 req/s, 100 req/2min'],
              ['Cache TTL',         '60 giây cho profile/rank'],
              ['Match cache TTL',   '300 giây'],
              ['Cooldown per user', '15 giây giữa các lệnh'],
              ['Token bucket',      'Queue tự động nếu sắp vượt limit'],
            ].map(([k, v]) => (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '6px 0', borderBottom: '1px solid var(--border)',
                fontSize: 13,
              }}>
                <span style={{ color: 'var(--text-2)' }}>{k}</span>
                <code style={{ color: 'var(--text-1)', fontSize: 12 }}>{v}</code>
              </div>
            ))}
          </div>
        </SectionCard>

      </div>
    </div>
  );
}
