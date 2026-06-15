import React from 'react';
import { Award, CalendarCheck, CreditCard, Dice6, CircleDollarSign, Joystick, Coins, TrendingUp } from 'lucide-react';
import { useGuild } from '../../services/guild/GuildContext.jsx';
import { Spinner, Toggle, SectionCard, NumberInput, TextInput } from '../../../components/ui.jsx';

// ── Currency ledger row ───────────────────────────────────────────────────────
function LedgerRow({ icon, name, prefix, config, updateConfig }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '32px 1fr 1fr',
      gap: 'var(--s3)',
      alignItems: 'center',
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        width: 32, height: 32,
        background: 'var(--surface-3)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--r2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16,
      }}>
        {config[`${prefix}Icon`] || '💰'}
      </div>
      <TextInput
        label="Tên"
        value={config[`${prefix}Name`]}
        onChange={v => updateConfig({ [`${prefix}Name`]: v })}
        placeholder={name}
      />
      <TextInput
        label="Icon"
        value={config[`${prefix}Icon`]}
        onChange={v => updateConfig({ [`${prefix}Icon`]: v })}
        placeholder="💰"
      />
    </div>
  );
}

// ── Game row — compact ledger style ──────────────────────────────────────────
function GameRow({ title, icon: Icon, prefix, config, updateConfig }) {
  const enabled = config[`${prefix}Enabled`] ?? false;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '24px 1fr auto auto auto',
      gap: 'var(--s3)',
      alignItems: 'center',
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
      opacity: enabled ? 1 : 0.5,
    }}>
      <Icon size={14} style={{ color: 'var(--text-3)' }} strokeWidth={1.75} />
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{title}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
        <label style={{ fontSize: 11, color: 'var(--text-3)' }}>Min</label>
        <input
          type="number"
          className="form-input"
          style={{ width: 80, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}
          value={config[`${prefix}MinBet`] ?? 10}
          min={1}
          onChange={e => updateConfig({ [`${prefix}MinBet`]: Number(e.target.value) })}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
        <label style={{ fontSize: 11, color: 'var(--text-3)' }}>Max</label>
        <input
          type="number"
          className="form-input"
          style={{ width: 80, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}
          value={config[`${prefix}MaxBet`] ?? 10000}
          min={1}
          onChange={e => updateConfig({ [`${prefix}MaxBet`]: Number(e.target.value) })}
        />
      </div>
      <Toggle checked={enabled} onChange={v => updateConfig({ [`${prefix}Enabled`]: v })} label="" />
    </div>
  );
}

const UTC_OFFSETS = [
  { label: 'UTC-12', value: -720 }, { label: 'UTC-11', value: -660 },
  { label: 'UTC-10', value: -600 }, { label: 'UTC-9',  value: -540 },
  { label: 'UTC-8 (PST)', value: -480 }, { label: 'UTC-7 (MST)', value: -420 },
  { label: 'UTC-6 (CST)', value: -360 }, { label: 'UTC-5 (EST)', value: -300 },
  { label: 'UTC-4', value: -240 }, { label: 'UTC-3', value: -180 },
  { label: 'UTC-2', value: -120 }, { label: 'UTC-1', value: -60  },
  { label: 'UTC+0', value: 0    }, { label: 'UTC+1', value: 60   },
  { label: 'UTC+2', value: 120  }, { label: 'UTC+3', value: 180  },
  { label: 'UTC+4', value: 240  }, { label: 'UTC+5', value: 300  },
  { label: 'UTC+5:30', value: 330 }, { label: 'UTC+6', value: 360 },
  { label: 'UTC+7 (WIB/ICT)', value: 420 }, { label: 'UTC+8 (SGT/PHT)', value: 480 },
  { label: 'UTC+9 (JST/KST)', value: 540 }, { label: 'UTC+9:30', value: 570 },
  { label: 'UTC+10', value: 600 }, { label: 'UTC+11', value: 660 },
  { label: 'UTC+12', value: 720 }, { label: 'UTC+13', value: 780 },
  { label: 'UTC+14', value: 840 },
];

// ── Ledger section wrapper ────────────────────────────────────────────────────
function Ledger({ title, enabled, onToggle, children }) {
  return (
    <div style={{
      background: 'var(--surface-0)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-outer)',
      padding: 3,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{
        background: 'var(--surface-1)',
        borderRadius: 'var(--r-inner)',
        overflow: 'hidden',
      }}>
        {/* Ledger header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px var(--s4)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase',
            color: 'var(--text-3)', fontFamily: 'var(--font-mono)',
          }}>
            {title}
          </span>
          {onToggle != null && (
            <Toggle checked={enabled ?? false} onChange={onToggle} label="" />
          )}
        </div>
        <div style={{ padding: '0 var(--s4)', opacity: enabled === false ? 0.45 : 1, pointerEvents: enabled === false ? 'none' : 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Daily reward visual ───────────────────────────────────────────────────────
function DailyRewardRow({ icon, label, value, onChange }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number"
          className="form-input"
          style={{ width: 90, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}
          value={value}
          min={0}
          onChange={e => onChange(Number(e.target.value))}
        />
        <span style={{ fontSize: 11, color: 'var(--text-3)', width: 30 }}>/day</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EconomyPage() {
  const { config, configLoading, updateConfig } = useGuild();

  if (configLoading || !config) return <div className="page-loading"><Spinner /></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-row">
          <h1 className="page-title">Kinh tế & XP</h1>
        </div>
        <p className="page-subtitle">
          Hệ thống kinh tế 3 loại tiền + XP levels. Redis lock bảo đảm an toàn concurrency.
        </p>
      </div>

      {/* ── Two-column layout — breaks the cards-grid repetition ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s4)', alignItems: 'start' }}>

        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>

          {/* XP Ledger */}
          <Ledger
            title="XP & Levels"
            enabled={config.levelsEnabled}
            onToggle={v => updateConfig({ levelsEnabled: v })}
          >
            <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={14} style={{ color: 'var(--text-3)' }} strokeWidth={1.75} />
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>XP mỗi tin nhắn</span>
              </div>
              <input
                type="number"
                className="form-input"
                style={{ width: 90, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}
                value={config.xpPerMessage ?? 5}
                min={1} max={100}
                onChange={e => updateConfig({ xpPerMessage: Number(e.target.value) })}
              />
            </div>
            <div style={{ padding: '10px 0' }}>
              <label className="form-label">Tin nhắn level up</label>
              <input
                className="form-input"
                style={{ marginTop: 6 }}
                value={config.levelUpMessage ?? ''}
                onChange={e => updateConfig({ levelUpMessage: e.target.value })}
                placeholder="{user} đã đạt level {level}!"
              />
              <span className="form-hint" style={{ marginTop: 4, display: 'block' }}>
                Template: <code>{'{user}'}</code> <code>{'{level}'}</code> <code>{'{xp}'}</code>
              </span>
            </div>
          </Ledger>

          {/* Currency Ledger */}
          <Ledger
            title="Đơn vị tiền tệ"
            enabled={config.economyEnabled}
            onToggle={v => updateConfig({ economyEnabled: v })}
          >
            <LedgerRow name="Silver"  prefix="currencySilver"  config={config} updateConfig={updateConfig} />
            <LedgerRow name="Gold"    prefix="currencyGold"    config={config} updateConfig={updateConfig} />
            <LedgerRow name="Diamond" prefix="currencyDiamond" config={config} updateConfig={updateConfig} />
          </Ledger>

        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>

          {/* Daily Reward */}
          <Ledger
            title="Điểm danh hàng ngày"
            enabled={config.dailyEnabled}
            onToggle={v => updateConfig({ dailyEnabled: v })}
          >
            <DailyRewardRow
              icon={config.currencySilverIcon || '🥈'}
              label={config.currencySilverName || 'Silver'}
              value={config.dailySilverAmount ?? 100}
              onChange={v => updateConfig({ dailySilverAmount: v })}
            />
            <DailyRewardRow
              icon={config.currencyGoldIcon || '🪙'}
              label={config.currencyGoldName || 'Gold'}
              value={config.dailyGoldAmount ?? 5}
              onChange={v => updateConfig({ dailyGoldAmount: v })}
            />
            <DailyRewardRow
              icon={config.currencyDiamondIcon || '💎'}
              label={config.currencyDiamondName || 'Diamond'}
              value={config.dailyDiamondAmount ?? 0}
              onChange={v => updateConfig({ dailyDiamondAmount: v })}
            />
            <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Cooldown</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  className="form-input"
                  style={{ width: 64, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}
                  value={config.dailyCooldownHours ?? 24}
                  min={1} max={168}
                  onChange={e => updateConfig({ dailyCooldownHours: Number(e.target.value) })}
                />
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>giờ</span>
              </div>
            </div>
            <div style={{ padding: '10px 0' }}>
              <label className="form-label" style={{ marginBottom: 6, display: 'block' }}>Reset timezone</label>
              <select
                className="form-select"
                value={config.dailyResetUtcOffset ?? 420}
                onChange={e => updateConfig({ dailyResetUtcOffset: Number(e.target.value) })}
              >
                {UTC_OFFSETS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </Ledger>

          {/* Games Table */}
          <Ledger title="Games">
            <GameRow title="Blackjack"  icon={CreditCard}        prefix="blackjack"  config={config} updateConfig={updateConfig} />
            <GameRow title="Poker"      icon={CircleDollarSign}  prefix="poker"      config={config} updateConfig={updateConfig} />
            <GameRow title="Coinflip"   icon={Coins}             prefix="coinflip"   config={config} updateConfig={updateConfig} />
            <GameRow title="Dice"       icon={Dice6}             prefix="dice"       config={config} updateConfig={updateConfig} />
            <GameRow title="Slots"      icon={Joystick}          prefix="slots"      config={config} updateConfig={updateConfig} />
          </Ledger>

        </div>
      </div>
    </div>
  );
}
