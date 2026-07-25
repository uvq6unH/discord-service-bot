import React from 'react';
import { useNavigate } from 'react-router-dom';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useGuild } from '../hooks/useGuild.js';
import { useSystem } from '../hooks/useSystem.js';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';

export default function OverviewPage() {
  const navigate = useNavigate();
  const { config, selectedGuild, updateConfig } = useGuild();
  const { status } = useSystem();
  const { t } = useLanguage();

  const bot = status?.bot;
  const stats = status?.stats;
  const online = bot?.online ?? status?.botReady ?? false;

  const fmtUptime = (ms) => {
    if (!ms) return '—';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const isBotEnabled = config?.enabled !== false;
  const serverName = selectedGuild?.name ? selectedGuild.name.toUpperCase() : '';

  return (
    <Workspace>
      {/* 1. Header Zone with Master Switch Action */}
      <HeaderZone
        title={serverName ? `${serverName} // OVERVIEW` : 'OVERVIEW'}
        subtitle={t("Operations center telemetry and community parameters snapshot.")}
        actions={
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-2) var(--space-4)',
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            borderRadius: '4px'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 'bold', color: isBotEnabled ? 'var(--green)' : 'var(--red)' }}>
                {isBotEnabled ? t("● BOT ACTIVATED") : t("○ BOT DEACTIVATED")}
              </span>
              <span style={{ fontSize: '9px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                {t("Guild Master Switch")}
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                className="toggle-switch__input"
                checked={isBotEnabled}
                onChange={(e) => updateConfig && updateConfig({ enabled: e.target.checked })}
              />
              <div className="toggle-switch__track">
                <div className="toggle-switch__thumb" />
              </div>
            </label>
          </div>
        }
      />

      {/* 2. Status Zone (KPIs) */}
      <StatusZone>
        <KpiTile 
          label={t("Server Health")} 
          value={online ? t('ONLINE') : t('OFFLINE')} 
          sub={online ? t('TELEMETRY STATUS NOMINAL') : t('TELEMETRY OFFLINE')}
        />
        <KpiTile 
          label={t("Uptime")} 
          value={bot?.uptime ? fmtUptime(bot.uptime) : '—'} 
          sub={t("SYS_UPTIME_COUNTER")}
        />
        <KpiTile 
          label={t("Commands Run")} 
          value={stats?.commandsToday ?? '—'} 
          sub={t("RUN_TODAY")}
        />
        <KpiTile 
          label={t("Ping Latency")} 
          value={bot?.ping ? `${bot.ping}ms` : '—'} 
          sub={t("GATEWAY_LATENCY")}
        />
      </StatusZone>

      {/* 3. Balanced Grid-12 Layout (6 Mapped Module Panels) */}
      <div className="grid-12">

        {/* Panel 1: AUTOMATED MODERATION CONTROL */}
        <div className="col-span-6">
          <Panel title={t("AUTOMATED MODERATION CONTROL")} accent>
            <DataSlab 
              label={t("Auto Moderation Filters")} 
              value={config?.moderation?.enabled ? t('ACTIVE') : t('STANDBY')} 
              sub={t("AutoMod, Anti-Spam, Anti-Link & Anti-Raid shields")}
              highlight={config?.moderation?.enabled}
              onClick={() => navigate('/moderation', { state: { highlight: 'automod' } })}
            />
            <DataSlab 
              label={t("Support Ticket System")} 
              value={config?.ticketsEnabled ? t('ACTIVE') : t('STANDBY')} 
              sub={t("Ticket category target & logging console")}
              highlight={config?.ticketsEnabled}
              onClick={() => navigate('/moderation', { state: { highlight: 'tickets' } })}
            />
            <DataSlab 
              label={t("Self-Roles & Auto-Role")} 
              value={config?.rolesEnabled ? t('ACTIVE') : t('STANDBY')} 
              sub={t("Auto-gained role & self-role panel options")}
              highlight={config?.rolesEnabled}
              onClick={() => navigate('/moderation', { state: { highlight: 'selfroles' } })}
            />
          </Panel>
        </div>

        {/* Panel 2: UTILITY SERVICES */}
        <div className="col-span-6">
          <Panel title={t("UTILITY SERVICES")} accent>
            <DataSlab 
              label={t("Bot Mention React")} 
              value={config?.mentionReactEnabled ? t('ACTIVE') : t('STANDBY')} 
              sub={t("Auto emoji reaction when bot or role is tagged")}
              highlight={config?.mentionReactEnabled}
              onClick={() => navigate('/utilities', { state: { highlight: 'mentionreact' } })}
            />
            <DataSlab 
              label={t("Translation & Duolingo")} 
              value={t('CONFIGURE')} 
              sub={t("Multi-language text translation & gamified learning")}
              onClick={() => navigate('/utilities', { state: { highlight: 'utilitycmds' } })}
            />
            <DataSlab 
              label={t("Auto-Responders & Custom Cmds")} 
              value={config?.autoReplyEnabled ? t('ACTIVE') : t('STANDBY')} 
              sub={t("Keyword auto replies & custom slash operators")}
              highlight={config?.autoReplyEnabled}
              onClick={() => navigate('/utilities', { state: { highlight: 'autoreplies' } })}
            />
          </Panel>
        </div>

        {/* Panel 3: COMMAND GATEWAY ROUTING */}
        <div className="col-span-6">
          <Panel title={t("COMMAND GATEWAY ROUTING")} accent>
            <DataSlab 
              label={t("Core System Commands")} 
              value={t('8 COMMANDS')} 
              sub={t("System ping, help, config, say, announce controls")}
              onClick={() => navigate('/commands', { state: { highlight: 'commands' } })}
            />
            <DataSlab 
              label={t("Gateway Prefix")} 
              value={config?.prefix ? `"${config.prefix}"` : '"!"'} 
              sub={t("Legacy text command invocation prefix")}
              onClick={() => navigate('/commands', { state: { highlight: 'commands' } })}
            />
            <DataSlab 
              label={t("Command Access Control")} 
              value={t('ROLE_RESTRICTED')} 
              sub={t("Role-based permission gating per command")}
              onClick={() => navigate('/commands', { state: { highlight: 'commands' } })}
            />
          </Panel>
        </div>

        {/* Panel 4: AUDIT LOGS & SECURITY */}
        <div className="col-span-6">
          <Panel title={t("AUDIT LOGS & SECURITY")} accent>
            <DataSlab 
              label={t("Security Logging Channel")} 
              value={config?.logChannelId ? t('ACTIVE') : t('UNSET')} 
              sub={t("Target channel for security and audit events")}
              highlight={!!config?.logChannelId}
              onClick={() => navigate('/audit-logs', { state: { highlight: 'logchannel' } })}
            />
            <DataSlab 
              label={t("Administrative Audit Trail")} 
              value={t('LOG_BUFFER_READY')} 
              sub={t("Historical administrator configuration logs")}
              onClick={() => navigate('/audit-logs', { state: { highlight: 'activity' } })}
            />
            <DataSlab 
              label={t("Security Alerts")} 
              value={t('REALTIME')} 
              sub={t("Automated alert stream for server changes")}
              onClick={() => navigate('/audit-logs', { state: { highlight: 'activity' } })}
            />
          </Panel>
        </div>

        {/* Panel 5: FINANCIAL LEDGER & LEVELING */}
        <div className="col-span-6">
          <Panel title={t("FINANCIAL LEDGER & LEVELING")} accent>
            <DataSlab 
              label={t("Economy Virtual Currency")} 
              value={config?.economyEnabled ? t('ACTIVE') : t('STANDBY')} 
              sub={t("Bạc, Vàng, Kim Cương daily rewards & ledger")}
              highlight={config?.economyEnabled}
              onClick={() => navigate('/economy', { state: { highlight: 'ledger' } })}
            />
            <DataSlab 
              label={t("XP Leveling Pipeline")} 
              value={config?.levelsEnabled ? t('ACTIVE') : t('STANDBY')} 
              sub={t("Chat activity rank XP & level up notifications")}
              highlight={config?.levelsEnabled}
              onClick={() => navigate('/economy', { state: { highlight: 'ledger' } })}
            />
            <DataSlab 
              label={t("Mini-Games Betting Suite")} 
              value={t('5 GAMES')} 
              sub={t("Blackjack, Poker, Coinflip, Dice, Slots bets")}
              onClick={() => navigate('/economy', { state: { highlight: 'games' } })}
            />
          </Panel>
        </div>

        {/* Panel 6: SYSTEM MONITOR & ANALYTICS */}
        <div className="col-span-6">
          <Panel title={t("SYSTEM MONITOR & ANALYTICS")} accent>
            <DataSlab 
              label={t("System Runtime Monitor")} 
              value={online ? t('ONLINE') : t('OFFLINE')} 
              sub={t("Bot health status, memory & node environment")}
              highlight={online}
              onClick={() => navigate('/system', { state: { highlight: 'runtime' } })}
            />
            <DataSlab 
              label={t("Operational Telemetry Logs")} 
              value={t('VIEW_METRICS')} 
              sub={t("Command usage charts & activity graphs")}
              onClick={() => navigate('/analytics', { state: { highlight: 'metrics' } })}
            />
            <DataSlab 
              label={t("Guild Members Registry")} 
              value={t('VIEW_ROSTER')} 
              sub={t("Member list, roles hierarchy & moderation actions")}
              onClick={() => navigate('/members', { state: { highlight: 'members' } })}
            />
          </Panel>
        </div>

      </div>
    </Workspace>
  );
}
