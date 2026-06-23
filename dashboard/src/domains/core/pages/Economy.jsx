import React from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import { useEconomy } from '../hooks/useEconomy.js';
import { Coins, Award, CalendarCheck, Joystick } from 'lucide-react';

const UTC_OFFSETS = [
  { label: 'UTC-12', value: -720 },
  { label: 'UTC-11', value: -660 },
  { label: 'UTC-10', value: -600 },
  { label: 'UTC-9',  value: -540 },
  { label: 'UTC-8 (PST)', value: -480 },
  { label: 'UTC-7 (MST)', value: -420 },
  { label: 'UTC-6 (CST)', value: -360 },
  { label: 'UTC-5 (EST)', value: -300 },
  { label: 'UTC-4', value: -240 },
  { label: 'UTC-3', value: -180 },
  { label: 'UTC-2', value: -120 },
  { label: 'UTC-1', value: -60  },
  { label: 'UTC+0', value: 0    },
  { label: 'UTC+1', value: 60   },
  { label: 'UTC+2', value: 120  },
  { label: 'UTC+3', value: 180  },
  { label: 'UTC+4', value: 240  },
  { label: 'UTC+5', value: 300  },
  { label: 'UTC+5:30', value: 330 },
  { label: 'UTC+6', value: 360 },
  { label: 'UTC+7 (WIB/ICT)', value: 420 },
  { label: 'UTC+8 (SGT/PHT)', value: 480 },
  { label: 'UTC+9 (JST/KST)', value: 540 },
  { label: 'UTC+9:30', value: 570 },
  { label: 'UTC+10', value: 600 },
  { label: 'UTC+11', value: 660 },
  { label: 'UTC+12', value: 720 },
  { label: 'UTC+13', value: 780 },
  { label: 'UTC+14', value: 840 },
];

function CurrencyRow({ prefix, defaultName, defaultIcon, config, updateConfig }) {
  const nameKey = `${prefix}Name`;
  const iconKey = `${prefix}Icon`;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '40px 1.5fr 1fr',
      gap: 'var(--space-4)',
      alignItems: 'center',
      padding: 'var(--space-3) 0',
      borderBottom: '1px solid var(--border)'
    }}>
      <div style={{
        width: '32px',
        height: '32px',
        border: '1px solid var(--border-strong)',
        backgroundColor: 'var(--surface-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '14px'
      }}>
        {config[iconKey] || defaultIcon}
      </div>
      
      <div className="form-group">
        <label className="form-label" style={{ fontSize: '10px' }}>Name Token</label>
        <input
          className="form-input"
          style={{ fontSize: '12px' }}
          value={config[nameKey] ?? ''}
          placeholder={defaultName}
          onChange={e => updateConfig({ [nameKey]: e.target.value })}
        />
      </div>

      <div className="form-group">
        <label className="form-label" style={{ fontSize: '10px' }}>Emoji Code</label>
        <input
          className="form-input"
          style={{ fontSize: '12px' }}
          value={config[iconKey] ?? ''}
          placeholder={defaultIcon}
          onChange={e => updateConfig({ [iconKey]: e.target.value })}
        />
      </div>
    </div>
  );
}

function CasinoGameRow({ title, prefix, config, handleBetChange, updateConfig }) {
  const enabledKey = `${prefix}Enabled`;
  const minKey = `${prefix}MinBet`;
  const maxKey = `${prefix}MaxBet`;
  const enabled = config[enabledKey] ?? false;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1.5fr 1fr 1fr auto',
      gap: 'var(--space-4)',
      alignItems: 'center',
      padding: 'var(--space-3) 0',
      borderBottom: '1px solid var(--border)',
      opacity: enabled ? 1 : 0.4
    }}>
      <span style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
        {title.toUpperCase()}
      </span>

      <div className="form-group">
        <label className="form-label" style={{ fontSize: '10px' }}>Min Bet</label>
        <input
          type="number"
          className="form-input"
          style={{ fontSize: '12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}
          disabled={!enabled}
          value={config[minKey] ?? 10}
          onChange={e => handleBetChange(prefix, 'MinBet', e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="form-label" style={{ fontSize: '10px' }}>Max Bet</label>
        <input
          type="number"
          className="form-input"
          style={{ fontSize: '12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}
          disabled={!enabled}
          value={config[maxKey] ?? 10000}
          onChange={e => handleBetChange(prefix, 'MaxBet', e.target.value)}
        />
      </div>

      <label className="toggle-switch" style={{ marginTop: 'var(--space-4)' }}>
        <input
          type="checkbox"
          className="toggle-switch__input"
          checked={enabled}
          onChange={e => updateConfig({ [enabledKey]: e.target.checked })}
        />
        <div className="toggle-switch__track">
          <div className="toggle-switch__thumb" />
        </div>
      </label>
    </div>
  );
}

export default function EconomyPage() {
  const { config, loading, updateConfig, handleBetChange } = useEconomy();

  if (loading || !config) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        LOADING FINANCIAL MODULES...
      </div>
    );
  }

  const isEnabled = config.economyEnabled ?? false;
  const isLeveling = config.levelsEnabled ?? false;

  return (
    <Workspace>
      {/* 1. Header Zone */}
      <HeaderZone
        title="FINANCIAL LEDGER OPERATIONS"
        subtitle="Manage virtual currency balances, reward distributions pipelines, and casino module configurations."
      />

      {/* 2. Status Zone */}
      <StatusZone>
        <KpiTile 
          label="Ledger Module Status" 
          value={isEnabled ? 'NOMINAL' : 'OFFLINE'} 
          sub="ECONOMY_SYSTEM_STATE"
        />
        <KpiTile 
          label="Silver Reserves Unit" 
          value={config.currencySilverIcon || '🥈'} 
          sub={config.currencySilverName ? config.currencySilverName.toUpperCase() : 'SILVER'}
        />
        <KpiTile 
          label="Gold Reserves Unit" 
          value={config.currencyGoldIcon || '🥇'} 
          sub={config.currencyGoldName ? config.currencyGoldName.toUpperCase() : 'GOLD'}
        />
        <KpiTile 
          label="XP Leveling pipeline" 
          value={isLeveling ? 'ACTIVE' : 'INACTIVE'} 
          sub="XP_PER_MESSAGE_CALC"
        />
      </StatusZone>

      {/* 3. Workspace Zone */}
      <div className="grid-12">
        {/* Panel 1: Core Toggles & Currencies */}
        <div className="col-span-6">
          <Panel title="LEDGER STATE CONTROL" accent>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-2)' }}>
                GLOBAL FINANCIAL SYSTEM
              </span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  className="toggle-switch__input"
                  checked={isEnabled}
                  onChange={e => updateConfig({ economyEnabled: e.target.checked })}
                />
                <div className="toggle-switch__track">
                  <div className="toggle-switch__thumb" />
                </div>
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: isEnabled ? 1 : 0.4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-2)' }}>
                XP PIPELINE ACCRUAL
              </span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  className="toggle-switch__input"
                  disabled={!isEnabled}
                  checked={isLeveling}
                  onChange={e => updateConfig({ levelsEnabled: e.target.checked })}
                />
                <div className="toggle-switch__track">
                  <div className="toggle-switch__thumb" />
                </div>
              </label>
            </div>

            {isLeveling && (
              <div className="form-group" style={{ animation: 'fade-in 0.15s ease-out' }}>
                <label className="form-label">Accrual coefficient (XP/msg)</label>
                <input
                  type="number"
                  className="form-input"
                  value={config.xpPerMessage ?? 15}
                  onChange={e => updateConfig({ xpPerMessage: Number(e.target.value) })}
                />
              </div>
            )}
          </Panel>

          <Panel title="CURRENCY REGISTRY DATABASE" style={{ marginTop: 'var(--space-5)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <CurrencyRow 
                prefix="currencySilver" 
                defaultName="Silver" 
                defaultIcon="🥈" 
                config={config} 
                updateConfig={updateConfig} 
              />
              <CurrencyRow 
                prefix="currencyGold" 
                defaultName="Gold" 
                defaultIcon="🥇" 
                config={config} 
                updateConfig={updateConfig} 
              />
              <CurrencyRow 
                prefix="currencyDiamond" 
                defaultName="Diamond" 
                defaultIcon="💎" 
                config={config} 
                updateConfig={updateConfig} 
              />
            </div>
          </Panel>
        </div>

        {/* Panel 2: Rewards Claims & Betting Limits */}
        <div className="col-span-6">
          <Panel title="DAILY REWARDS DISTRIBUTOR" accent>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-2)' }}>
                REWARDS DISPENSATION
              </span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  className="toggle-switch__input"
                  checked={config.dailyEnabled ?? false}
                  onChange={e => updateConfig({ dailyEnabled: e.target.checked })}
                />
                <div className="toggle-switch__track">
                  <div className="toggle-switch__thumb" />
                </div>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              <div className="form-group">
                <label className="form-label">Silver amt</label>
                <input
                  type="number"
                  className="form-input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  value={config.dailySilverAmount ?? 100}
                  onChange={e => updateConfig({ dailySilverAmount: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Gold amt</label>
                <input
                  type="number"
                  className="form-input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  value={config.dailyGoldAmount ?? 10}
                  onChange={e => updateConfig({ dailyGoldAmount: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Diamond amt</label>
                <input
                  type="number"
                  className="form-input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  value={config.dailyDiamondAmount ?? 1}
                  onChange={e => updateConfig({ dailyDiamondAmount: Number(e.target.value) })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              <div className="form-group">
                <label className="form-label">Cooldown (Hours)</label>
                <input
                  type="number"
                  className="form-input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  value={config.dailyCooldownHours ?? 24}
                  onChange={e => updateConfig({ dailyCooldownHours: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Reset UTC offset</label>
                <select
                  className="form-select"
                  value={config.dailyResetUtcOffset ?? 0}
                  onChange={e => updateConfig({ dailyResetUtcOffset: Number(e.target.value) })}
                >
                  {UTC_OFFSETS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </Panel>

          <Panel title="BETTING REGULATION SYSTEM" style={{ marginTop: 'var(--space-5)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <CasinoGameRow 
                title="Blackjack Module" 
                prefix="blackjack" 
                config={config} 
                handleBetChange={handleBetChange} 
                updateConfig={updateConfig} 
              />
              <CasinoGameRow 
                title="Poker Module" 
                prefix="poker" 
                config={config} 
                handleBetChange={handleBetChange} 
                updateConfig={updateConfig} 
              />
              <CasinoGameRow 
                title="Coinflip Module" 
                prefix="coinflip" 
                config={config} 
                handleBetChange={handleBetChange} 
                updateConfig={updateConfig} 
              />
              <CasinoGameRow 
                title="Dice Module" 
                prefix="dice" 
                config={config} 
                handleBetChange={handleBetChange} 
                updateConfig={updateConfig} 
              />
              <CasinoGameRow 
                title="Slots Module" 
                prefix="slots" 
                config={config} 
                handleBetChange={handleBetChange} 
                updateConfig={updateConfig} 
              />
            </div>
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
