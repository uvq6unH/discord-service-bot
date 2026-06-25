import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useEconomy } from '../hooks/useEconomy.js';
import { useGuild } from '../../../shared/hooks/useGuild.js';
import { Coins, Award, CalendarCheck, Joystick } from 'lucide-react';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';

function CommandConfigRow({ cmd, roles, onUpdate, displayPrefix = '/' }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useLanguage();
  
  const isEnabled = cmd.enabled !== false;
  const name = cmd.name;
  const description = cmd.description;
  const allowedRoles = cmd.allowedRoles ?? [];
  
  const handleToggle = (checked) => {
    onUpdate({ ...cmd, enabled: checked });
  };
  
  const handleFieldChange = (field, val) => {
    onUpdate({
      ...cmd,
      [field]: val
    });
  };

  const handleRoleToggle = (roleId) => {
    const nextRoles = allowedRoles.includes(roleId)
      ? allowedRoles.filter(r => r !== roleId)
      : [...allowedRoles, roleId];
    handleFieldChange('allowedRoles', nextRoles);
  };
  
  return (
    <div style={{
      border: '1px solid var(--border)',
      background: isEnabled ? 'var(--surface-0)' : 'var(--surface-1)',
      marginBottom: 'var(--space-2)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-3) var(--space-4)',
        cursor: 'pointer'
      }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 'bold',
            fontSize: '13px',
            color: isEnabled ? 'var(--text-1)' : 'var(--text-3)'
          }}>
            {displayPrefix}{name}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
            ({cmd.type})
          </span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }} onClick={e => e.stopPropagation()}>
          <label className="toggle-switch">
            <input
              type="checkbox"
              className="toggle-switch__input"
              checked={isEnabled}
              onChange={e => handleToggle(e.target.checked)}
            />
            <div className="toggle-switch__track">
              <div className="toggle-switch__thumb" />
            </div>
          </label>
          <button 
            className="btn btn--secondary" 
            style={{ padding: 'var(--space-1) var(--space-2)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'HIDE' : 'EDIT'}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--surface-1)',
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)'
        }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '10px' }}>{t("Custom Name")}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-3)' }}>{displayPrefix}</span>
              <input
                className="form-input"
                style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', flex: 1 }}
                value={name}
                onChange={e => handleFieldChange('name', e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, ''))}
              />
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '10px' }}>{t("Custom Description")}</label>
            <input
              className="form-input"
              style={{ fontSize: '12px' }}
              value={description}
              onChange={e => handleFieldChange('description', e.target.value)}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '10px' }}>{t("Restricted Roles (Empty for Everyone)")}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1.5)', marginTop: 'var(--space-1)' }}>
              {roles.filter(r => r.name !== '@everyone').map(role => {
                const active = allowedRoles.includes(role.id) || allowedRoles.includes(role.name);
                return (
                  <button
                    key={role.id}
                    className="btn"
                    onClick={() => handleRoleToggle(role.id)}
                    style={{
                      fontSize: '10px',
                      padding: 'var(--space-1) var(--space-2)',
                      fontFamily: 'var(--font-mono)',
                      backgroundColor: active ? 'var(--accent-dim)' : 'var(--surface-2)',
                      borderColor: active ? 'var(--accent)' : 'var(--border)',
                      color: active ? 'var(--text-1)' : 'var(--text-3)'
                    }}
                  >
                    {role.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
  const { t } = useLanguage();

  return (
    <div className="currency-row" style={{
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
        <label className="form-label" style={{ fontSize: '10px' }}>{t("Name Token")}</label>
        <input
          className="form-input"
          style={{ fontSize: '12px' }}
          value={config[nameKey] ?? ''}
          placeholder={defaultName}
          onChange={e => updateConfig({ [nameKey]: e.target.value })}
        />
      </div>

      <div className="form-group">
        <label className="form-label" style={{ fontSize: '10px' }}>{t("Emoji Code")}</label>
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

function CasinoGameRow({ title, prefix, config, handleBetChange, updateConfig, economyEnabled }) {
  const enabledKey = `${prefix}Enabled`;
  const minKey = `${prefix}MinBet`;
  const maxKey = `${prefix}MaxBet`;
  const enabled = (config[enabledKey] ?? false) && economyEnabled;
  const isToggled = config[enabledKey] ?? false;
  const { t } = useLanguage();

  return (
    <div className="casino-row" style={{
      alignItems: 'center',
      padding: 'var(--space-3) 0',
      borderBottom: '1px solid var(--border)',
      opacity: enabled ? 1 : 0.4
    }}>
      <span style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
        {t(title).toUpperCase()}
      </span>

      <div className="form-group">
        <label className="form-label" style={{ fontSize: '10px' }}>{t("Min Bet")}</label>
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
        <label className="form-label" style={{ fontSize: '10px' }}>{t("Max Bet")}</label>
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
          disabled={!economyEnabled}
          checked={isToggled}
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
  const location = useLocation();
  const highlight = location.state?.highlight;
  const { config, loading, updateConfig, handleBetChange } = useEconomy();
  const { guildData } = useGuild();
  const { t } = useLanguage();

  if (loading || !config) {
    return (
      <div style={{ padding: 'var(--space-10)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        {t("LOADING FINANCIAL MODULES...")}
      </div>
    );
  }

  const isEnabled = config.economyEnabled ?? false;
  const isLeveling = config.levelsEnabled ?? false;

  return (
    <Workspace>
      {/* 1. Header Zone */}
      <HeaderZone
        title={t("FINANCIAL LEDGER OPERATIONS")}
        subtitle={t("Manage virtual currency balances, reward distributions pipelines, and casino module configurations.")}
      />

      {/* 2. Status Zone */}
      <StatusZone>
        <KpiTile 
          label={t("Ledger Module Status")} 
          value={isEnabled ? t('NOMINAL') : t('OFFLINE')} 
          sub="ECONOMY_SYSTEM_STATE"
        />
        <KpiTile 
          label={t("Silver Reserves Unit")} 
          value={config.currencySilverIcon || '🥈'} 
          sub={config.currencySilverName ? config.currencySilverName.toUpperCase() : 'SILVER'}
        />
        <KpiTile 
          label={t("Gold Reserves Unit")} 
          value={config.currencyGoldIcon || '🥇'} 
          sub={config.currencyGoldName ? config.currencyGoldName.toUpperCase() : 'GOLD'}
        />
        <KpiTile 
          label={t("XP Leveling pipeline")} 
          value={isLeveling ? t('ACTIVE') : t('INACTIVE')} 
          sub="XP_PER_MESSAGE_CALC"
        />
      </StatusZone>

      {/* 3. Workspace Zone */}
      <div className="grid-12">
        {/* Panel 1: Core Toggles & Currencies */}
        <div className="col-span-6">
          <Panel title={t("LEDGER STATE CONTROL")} accent className={highlight === 'ledger' ? 'flash-target' : ''}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-2)' }}>
                {t("GLOBAL FINANCIAL SYSTEM")}
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
                {t("XP PIPELINE ACCRUAL")}
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
              <div style={{ animation: 'fade-in 0.15s ease-out', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)', borderTop: '1px dashed var(--border)', paddingTop: 'var(--space-3)' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{t("Accrual coefficient (XP/msg)")}</label>
                  <input
                    type="number"
                    className="form-input"
                    value={config.xpPerMessage ?? 5}
                    onChange={e => updateConfig({ xpPerMessage: Math.max(1, Number(e.target.value)) })}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-1)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-2)' }}>
                    {t("CONGRATULATE ON LEVEL UP")}
                  </span>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      className="toggle-switch__input"
                      checked={config.levelUpAnnouncementEnabled ?? true}
                      onChange={e => updateConfig({ levelUpAnnouncementEnabled: e.target.checked })}
                    />
                    <div className="toggle-switch__track">
                      <div className="toggle-switch__thumb" />
                    </div>
                  </label>
                </div>

                {(config.levelUpAnnouncementEnabled ?? true) && (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">{t("Level-up announcement channel")}</label>
                    <select
                      className="form-select"
                      value={config.levelUpAnnouncementChannelId ?? ''}
                      onChange={e => updateConfig({ levelUpAnnouncementChannelId: e.target.value })}
                    >
                      <option value="">{t("Default (Current Channel)")}</option>
                      {(guildData?.channels ?? [])
                        .filter(c => c.type === 0 || c.type === 5)
                        .map(c => (
                          <option key={c.id} value={c.id}>
                            #{c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <div className="levels-config-grid">
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">{t("Base XP")}</label>
                    <input
                      type="number"
                      className="form-input"
                      value={config.xpBase ?? 100}
                      onChange={e => updateConfig({ xpBase: Math.max(1, Number(e.target.value)) })}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">{t("XP Exponent")}</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-input"
                      value={config.xpExponent ?? 2.0}
                      onChange={e => updateConfig({ xpExponent: Math.max(0.5, Number(e.target.value)) })}
                    />
                  </div>
                </div>

                <div style={{
                  backgroundColor: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  padding: 'var(--space-3)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-3)'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 'var(--space-1.5)', color: 'var(--text-2)' }}>
                    {t("Level Milestones Preview")}
                  </div>
                  <div className="milestones-grid">
                    {[1, 2, 3, 4, 5].map(lvl => {
                      const base = config.xpBase ?? 100;
                      const exp = config.xpExponent ?? 2.0;
                      const requiredXp = Math.round(base * Math.pow(lvl, exp));
                      return (
                        <div key={lvl} style={{ backgroundColor: 'var(--surface-2)', padding: 'var(--space-1.5) 0', border: '1px solid var(--border-strong)' }}>
                          <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>Lvl {lvl}</span>
                          <div style={{ fontSize: '10px', marginTop: '4px' }}>{requiredXp} XP</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </Panel>

          <Panel title={t("CURRENCY REGISTRY DATABASE")} style={{ marginTop: 'var(--space-5)' }} className={highlight === 'currency' ? 'flash-target' : ''}>
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
          <Panel title={t("DAILY REWARDS DISTRIBUTOR")} accent className={highlight === 'daily' ? 'flash-target' : ''} style={{ opacity: isEnabled ? 1 : 0.4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-2)' }}>
                {t("REWARDS DISPENSATION")}
              </span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  className="toggle-switch__input"
                  disabled={!isEnabled}
                  checked={config.dailyEnabled ?? false}
                  onChange={e => updateConfig({ dailyEnabled: e.target.checked })}
                />
                <div className="toggle-switch__track">
                  <div className="toggle-switch__thumb" />
                </div>
              </label>
            </div>

            <div className="daily-rewards-amounts-grid">
              <div className="form-group">
                <label className="form-label">{t("Silver amt")}</label>
                <input
                  type="number"
                  className="form-input"
                  disabled={!isEnabled}
                  style={{ fontFamily: 'var(--font-mono)' }}
                  value={config.dailySilverAmount ?? 100}
                  onChange={e => updateConfig({ dailySilverAmount: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t("Gold amt")}</label>
                <input
                  type="number"
                  className="form-input"
                  disabled={!isEnabled}
                  style={{ fontFamily: 'var(--font-mono)' }}
                  value={config.dailyGoldAmount ?? 10}
                  onChange={e => updateConfig({ dailyGoldAmount: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t("Diamond amt")}</label>
                <input
                  type="number"
                  className="form-input"
                  disabled={!isEnabled}
                  style={{ fontFamily: 'var(--font-mono)' }}
                  value={config.dailyDiamondAmount ?? 1}
                  onChange={e => updateConfig({ dailyDiamondAmount: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="daily-rewards-meta-grid">
              <div className="form-group">
                <label className="form-label">{t("Cooldown (Hours)")}</label>
                <input
                  type="number"
                  className="form-input"
                  disabled={!isEnabled}
                  style={{ fontFamily: 'var(--font-mono)' }}
                  value={config.dailyCooldownHours ?? 24}
                  onChange={e => updateConfig({ dailyCooldownHours: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t("Reset UTC offset")}</label>
                <select
                  className="form-select"
                  disabled={!isEnabled}
                  value={config.dailyResetUtcOffset ?? 0}
                  onChange={e => updateConfig({ dailyResetUtcOffset: Number(e.target.value) })}
                >
                  {UTC_OFFSETS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </Panel>

          <Panel title={t("BETTING REGULATION SYSTEM")} style={{ marginTop: 'var(--space-5)', opacity: isEnabled ? 1 : 0.4 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <CasinoGameRow 
                title="Blackjack Module" 
                prefix="blackjack" 
                config={config} 
                handleBetChange={handleBetChange} 
                updateConfig={updateConfig} 
                economyEnabled={isEnabled}
              />
              <CasinoGameRow 
                title="Poker Module" 
                prefix="poker" 
                config={config} 
                handleBetChange={handleBetChange} 
                updateConfig={updateConfig} 
                economyEnabled={isEnabled}
              />
              <CasinoGameRow 
                title="Coinflip Module" 
                prefix="coinflip" 
                config={config} 
                handleBetChange={handleBetChange} 
                updateConfig={updateConfig} 
                economyEnabled={isEnabled}
              />
              <CasinoGameRow 
                title="Dice Module" 
                prefix="dice" 
                config={config} 
                handleBetChange={handleBetChange} 
                updateConfig={updateConfig} 
                economyEnabled={isEnabled}
              />
              <CasinoGameRow 
                title="Slots Module" 
                prefix="slots" 
                config={config} 
                handleBetChange={handleBetChange} 
                updateConfig={updateConfig} 
                economyEnabled={isEnabled}
              />
            </div>
          </Panel>
        </div>

        {/* Economy Commands Panel */}
        <div className="col-span-12" style={{ marginTop: 'var(--space-5)' }}>
          <Panel title={t("FINANCIAL & LEVELING COMMANDS ROUTING")} accent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {[
                ...(config.economy?.commands ?? []),
                ...(config.levels?.commands ?? [])
              ].map(c => {
                const isLevelCmd = c.type === 'rank' || c.type === 'leaderboard';
                const moduleKey = isLevelCmd ? 'levels' : 'economy';
                const roles = guildData?.roles ?? [];
                return (
                  <CommandConfigRow
                    key={c.type}
                    cmd={c}
                    roles={roles}
                    onUpdate={updatedCmd => {
                      const currentList = config[moduleKey]?.commands ?? [];
                      const updatedList = currentList.map(x => x.type === c.type ? updatedCmd : x);
                      updateConfig({ [moduleKey]: { ...config[moduleKey], commands: updatedList } });
                    }}
                  />
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
