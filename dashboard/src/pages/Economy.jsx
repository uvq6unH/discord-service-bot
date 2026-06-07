import React from 'react';
import { useGuild } from '../contexts/GuildContext.jsx';
import { Spinner, Toggle, SectionCard, NumberInput, TextInput } from '../components/ui.jsx';

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

function GameSection({ title, icon, prefix, config, updateConfig }) {
  const enabledKey = `${prefix}Enabled`;
  const minKey     = `${prefix}MinBet`;
  const maxKey     = `${prefix}MaxBet`;

  return (
    <SectionCard
      title={title}
      icon={icon}
      enabled={config[enabledKey]}
      onToggle={v => updateConfig({ [enabledKey]: v })}
    >
      <div className="form-row">
        <NumberInput
          label="Cược tối thiểu"
          value={config[minKey]}
          onChange={v => updateConfig({ [minKey]: v })}
          min={0}
        />
        <NumberInput
          label="Cược tối đa"
          value={config[maxKey]}
          onChange={v => updateConfig({ [maxKey]: v })}
          min={0}
        />
      </div>
    </SectionCard>
  );
}

export default function EconomyPage() {
  const { config, configLoading, updateConfig } = useGuild();

  if (configLoading || !config) {
    return <div className="page-loading"><Spinner /></div>;
  }

  return (
    <div className="page">
      <h1 className="page-title">Tiền ảo</h1>
      <p className="page-subtitle">
        Hệ thống kinh tế 3 loại tiền: Silver, Gold, Diamond.
        Dùng distributed Redis lock — an toàn khi nhiều người dùng cùng lúc.
      </p>

      <div className="cards-grid">
        {/* Toggle tổng */}
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

        {/* Daily reward */}
        <SectionCard
          title="Điểm danh hàng ngày"
          icon="ti-calendar-check"
          enabled={config.dailyEnabled}
          onToggle={v => updateConfig({ dailyEnabled: v })}
        >
          <div className="form-row">
            <NumberInput
              label="Silver nhận được"
              value={config.dailySilverAmount}
              onChange={v => updateConfig({ dailySilverAmount: v })}
              min={0}
            />
            <NumberInput
              label="Gold nhận được"
              value={config.dailyGoldAmount}
              onChange={v => updateConfig({ dailyGoldAmount: v })}
              min={0}
            />
            <NumberInput
              label="Diamond nhận được"
              value={config.dailyDiamondAmount}
              onChange={v => updateConfig({ dailyDiamondAmount: v })}
              min={0}
            />
          </div>
        </SectionCard>

        {/* Games */}
        <GameSection
          title="Blackjack"    icon="ti-cards"
          prefix="blackjack"   config={config} updateConfig={updateConfig}
        />
        <GameSection
          title="Poker"        icon="ti-poker-chip"
          prefix="poker"       config={config} updateConfig={updateConfig}
        />
        <GameSection
          title="Coinflip"     icon="ti-coin"
          prefix="coinflip"    config={config} updateConfig={updateConfig}
        />
        <GameSection
          title="Dice"         icon="ti-dice-6"
          prefix="dice"        config={config} updateConfig={updateConfig}
        />
        <GameSection
          title="Slots"        icon="ti-slot"
          prefix="slots"       config={config} updateConfig={updateConfig}
        />
      </div>
    </div>
  );
}
