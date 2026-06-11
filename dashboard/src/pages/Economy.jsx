import React from 'react';
import { useGuild } from '../contexts/GuildContext.jsx';
import { Spinner, Toggle, SectionCard, NumberInput, TextInput, ThemeToggle} from '../components/ui.jsx';
import { useAppTheme } from '../App.jsx';

// ── Currency row ─────────────────────────────────────────────────────────────
function CurrencySection({ name, prefix, config, updateConfig }) {
  return (
    <div className="currency-section">
      <div className="form-row">
        <TextInput
          label={`Tên ${name}`}
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
    </div>
  );
}

// ── Game section ─────────────────────────────────────────────────────────────
function GameSection({ title, icon, prefix, config, updateConfig }) {
  return (
    <SectionCard
      title={title}
      icon={icon}
      enabled={config[`${prefix}Enabled`]}
      onToggle={v => updateConfig({ [`${prefix}Enabled`]: v })}
    >
      <div className="form-row">
        <NumberInput
          label="Cược tối thiểu"
          value={config[`${prefix}MinBet`]}
          onChange={v => updateConfig({ [`${prefix}MinBet`]: v })}
          min={1}
        />
        <NumberInput
          label="Cược tối đa"
          value={config[`${prefix}MaxBet`]}
          onChange={v => updateConfig({ [`${prefix}MaxBet`]: v })}
          min={1}
        />
      </div>
    </SectionCard>
  );
}

// ── Timezone offset helper ────────────────────────────────────────────────────
const UTC_OFFSETS = [
  { label: 'UTC-12',   value: -720 },
  { label: 'UTC-11',   value: -660 },
  { label: 'UTC-10',   value: -600 },
  { label: 'UTC-9',    value: -540 },
  { label: 'UTC-8 (PST)', value: -480 },
  { label: 'UTC-7 (MST)', value: -420 },
  { label: 'UTC-6 (CST)', value: -360 },
  { label: 'UTC-5 (EST)', value: -300 },
  { label: 'UTC-4',    value: -240 },
  { label: 'UTC-3',    value: -180 },
  { label: 'UTC-2',    value: -120 },
  { label: 'UTC-1',    value: -60  },
  { label: 'UTC+0',    value: 0    },
  { label: 'UTC+1',    value: 60   },
  { label: 'UTC+2',    value: 120  },
  { label: 'UTC+3',    value: 180  },
  { label: 'UTC+4',    value: 240  },
  { label: 'UTC+5',    value: 300  },
  { label: 'UTC+5:30', value: 330  },
  { label: 'UTC+6',    value: 360  },
  { label: 'UTC+7 (WIB/ICT)', value: 420 },
  { label: 'UTC+8 (SGT/PHT)', value: 480 },
  { label: 'UTC+9 (JST/KST)', value: 540 },
  { label: 'UTC+9:30', value: 570  },
  { label: 'UTC+10',   value: 600  },
  { label: 'UTC+11',   value: 660  },
  { label: 'UTC+12',   value: 720  },
  { label: 'UTC+13',   value: 780  },
  { label: 'UTC+14',   value: 840  },
];

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EconomyPage() {
  const { theme, toggleTheme } = useAppTheme();
  const { config, configLoading, updateConfig } = useGuild();

  if (configLoading || !config) return <div className="page-loading"><Spinner /></div>;

  return (
    <div className="page">
      <div className="page-header-row">
        <h1 className="page-title">Kinh tế & XP</h1>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>
      <p className="page-subtitle">
        Hệ thống kinh tế 3 loại tiền + XP levels. Distributed Redis lock đảm bảo an toàn concurrency.
      </p>

      <div className="cards-grid">

        {/* ── XP & Levels ── */}
        <SectionCard
          title="XP & Levels"
          icon="ti-award"
          enabled={config.levelsEnabled}
          onToggle={v => updateConfig({ levelsEnabled: v })}
        >
          <div className="form-row">
            <NumberInput
              label="XP mỗi tin nhắn"
              value={config.xpPerMessage ?? 5}
              onChange={v => updateConfig({ xpPerMessage: v })}
              min={1}
              max={100}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Tin nhắn level up</label>
            <input
              className="form-input"
              value={config.levelUpMessage ?? ''}
              onChange={e => updateConfig({ levelUpMessage: e.target.value })}
              placeholder="{user} đã đạt level {level}!"
            />
            <span className="form-hint">
              Template: <code>{'{user}'}</code> <code>{'{level}'}</code> <code>{'{xp}'}</code>
            </span>
          </div>
        </SectionCard>

        {/* ── Economy toggle + currency names ── */}
        <SectionCard
          title="Hệ thống tiền ảo"
          icon="ti-coin"
          enabled={config.economyEnabled}
          onToggle={v => updateConfig({ economyEnabled: v })}
        >
          <div className="currency-grid">
            <CurrencySection name="Silver" prefix="currencySilver" config={config} updateConfig={updateConfig} />
            <CurrencySection name="Gold"   prefix="currencyGold"   config={config} updateConfig={updateConfig} />
            <CurrencySection name="Diamond" prefix="currencyDiamond" config={config} updateConfig={updateConfig} />
          </div>
        </SectionCard>

        {/* ── Daily reward ── */}
        <SectionCard
          title="Điểm danh hàng ngày"
          icon="ti-calendar-check"
          enabled={config.dailyEnabled}
          onToggle={v => updateConfig({ dailyEnabled: v })}
        >
          <div className="form-row">
            <NumberInput
              label={`${config.currencySilverIcon ?? '🥈'} Silver`}
              value={config.dailySilverAmount ?? 100}
              onChange={v => updateConfig({ dailySilverAmount: v })}
              min={0}
            />
            <NumberInput
              label={`${config.currencyGoldIcon ?? '🪙'} Gold`}
              value={config.dailyGoldAmount ?? 5}
              onChange={v => updateConfig({ dailyGoldAmount: v })}
              min={0}
            />
            <NumberInput
              label={`${config.currencyDiamondIcon ?? '💎'} Diamond`}
              value={config.dailyDiamondAmount ?? 0}
              onChange={v => updateConfig({ dailyDiamondAmount: v })}
              min={0}
            />
          </div>
          <div className="form-row">
            <NumberInput
              label="Cooldown (giờ)"
              value={config.dailyCooldownHours ?? 24}
              onChange={v => updateConfig({ dailyCooldownHours: v })}
              min={1}
              max={168}
            />
            <div className="form-group">
              <label className="form-label">Reset theo timezone</label>
              <select
                className="form-select"
                value={config.dailyResetUtcOffset ?? 420}
                onChange={e => updateConfig({ dailyResetUtcOffset: Number(e.target.value) })}
              >
                {UTC_OFFSETS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </SectionCard>

        {/* ── Games ── */}
        <GameSection title="Blackjack"  icon="ti-cards"       prefix="blackjack"  config={config} updateConfig={updateConfig} />
        <GameSection title="Poker"      icon="ti-poker-chip"  prefix="poker"      config={config} updateConfig={updateConfig} />
        <GameSection title="Coinflip"   icon="ti-coin"        prefix="coinflip"   config={config} updateConfig={updateConfig} />
        <GameSection title="Dice"       icon="ti-dice-6"      prefix="dice"       config={config} updateConfig={updateConfig} />
        <GameSection title="Slots"      icon="ti-slot"        prefix="slots"      config={config} updateConfig={updateConfig} />

      </div>
    </div>
  );
}
