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
  const badWordsCount = (config?.badWords || []).length;
  const customsCount = (config?.core?.commands || []).filter(c => c.type === 'custom').length;

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

      {/* 3. Dynamic Flexible Grid-12 Layout */}
      <div className="grid-12">

        {/* Row 1: Core Feature-Rich Modules (4 Items Each) */}
        <div className="col-span-6">
          <Panel title={t("AUTOMATED MODERATION CONTROL")} accent>
            <DataSlab 
              label={t("Auto Moderation Shields")} 
              value={config?.moderation?.enabled ? t('ACTIVE') : t('STANDBY')} 
              sub={t("AutoMod, Anti-Spam, Anti-Link & Anti-Raid shields")}
              highlight={config?.moderation?.enabled}
              onClick={() => navigate('/moderation', { state: { highlight: 'automod' } })}
            />
            <DataSlab 
              label={t("Forbidden Words Dictionary")} 
              value={`${badWordsCount} ${t('WORDS')}`} 
              sub={t("Banned word filter & message deletion rules")}
              onClick={() => navigate('/moderation', { state: { highlight: 'wordfilter' } })}
            />
            <DataSlab 
              label={t("Support Ticket System")} 
              value={config?.ticketsEnabled ? t('ACTIVE') : t('STANDBY')} 
              sub={t("Interactive support category & transcript logging")}
              highlight={config?.ticketsEnabled}
              onClick={() => navigate('/moderation', { state: { highlight: 'tickets' } })}
            />
            <DataSlab 
              label={t("Self-Roles & Auto-Role")} 
              value={config?.rolesEnabled ? t('ACTIVE') : t('STANDBY')} 
              sub={t("Member join role & reaction assignment panels")}
              highlight={config?.rolesEnabled}
              onClick={() => navigate('/moderation', { state: { highlight: 'selfroles' } })}
            />
          </Panel>
        </div>

        <div className="col-span-6">
          <Panel title={t("UTILITY SERVICES")} accent>
            <DataSlab 
              label={t("Bot Mention React Engine")} 
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
              label={t("Custom Response Operators")} 
              value={`${customsCount} ${t('COMMANDS')}`} 
              sub={t("Custom slash command creation & responses")}
              onClick={() => navigate('/utilities', { state: { highlight: 'customcmds' } })}
            />
            <DataSlab 
              label={t("Keyword Auto-Responders")} 
              value={config?.autoReplyEnabled ? t('ACTIVE') : t('STANDBY')} 
              sub={t("Keyword trigger listeners & automated replies")}
              highlight={config?.autoReplyEnabled}
              onClick={() => navigate('/utilities', { state: { highlight: 'autoreplies' } })}
            />
          </Panel>
        </div>

        {/* Row 2: Medium Modules (3 and 2 Items) */}
        <div className="col-span-4" style={{ marginTop: 'var(--space-6)' }}>
          <Panel title={t("FINANCIAL LEDGER OPERATIONS")} accent>
            <DataSlab 
              label={t("Virtual Currency Ledger")} 
              value={config?.economyEnabled ? t('ACTIVE') : t('STANDBY')} 
              sub={t("Bạc, Vàng, Kim Cương daily rewards")}
              highlight={config?.economyEnabled}
              onClick={() => navigate('/economy', { state: { highlight: 'ledger' } })}
            />
            <DataSlab 
              label={t("XP Leveling Pipeline")} 
              value={config?.levelsEnabled ? t('ACTIVE') : t('STANDBY')} 
              sub={t("Chat activity rank XP & level up alerts")}
              highlight={config?.levelsEnabled}
              onClick={() => navigate('/economy', { state: { highlight: 'ledger' } })}
            />
            <DataSlab 
              label={t("Mini-Games Betting Suite")} 
              value={t('5 GAMES')} 
              sub={t("Blackjack, Poker, Coinflip, Dice, Slots")}
              onClick={() => navigate('/economy', { state: { highlight: 'games' } })}
            />
          </Panel>
        </div>

        <div className="col-span-4" style={{ marginTop: 'var(--space-6)' }}>
          <Panel title={t("SYSTEM MONITOR & TELEMETRY")} accent>
            <DataSlab 
              label={t("System Runtime Health")} 
              value={online ? t('ONLINE') : t('OFFLINE')} 
              sub={t("Process load, memory & node environment")}
              highlight={online}
              onClick={() => navigate('/system', { state: { highlight: 'runtime' } })}
            />
            <DataSlab 
              label={t("Operational Telemetry Logs")} 
              value={t('VIEW_METRICS')} 
              sub={t("Command usage charts & activity load")}
              onClick={() => navigate('/analytics', { state: { highlight: 'metrics' } })}
            />
            <DataSlab 
              label={t("Guild Member Directory")} 
              value={t('VIEW_ROSTER')} 
              sub={t("Member list, roles & moderation actions")}
              onClick={() => navigate('/members', { state: { highlight: 'members' } })}
            />
          </Panel>
        </div>

        <div className="col-span-4" style={{ marginTop: 'var(--space-6)' }}>
          <Panel title={t("AUDIO & VOICE SERVICES")} accent>
            <DataSlab 
              label={t("Lavalink Audio Stream Console")} 
              value={config?.musicEnabled !== false ? t('ACTIVE') : t('STANDBY')} 
              sub={t("Lavalink music player & queue management")}
              highlight={config?.musicEnabled !== false}
              onClick={() => navigate('/music')}
            />
            <DataSlab 
              label={t("VoiceMaster Temp VC Engine")} 
              value={config?.tempVcEnabled ? t('ACTIVE') : t('STANDBY')} 
              sub={t("Join-to-create temporary voice channels")}
              highlight={config?.tempVcEnabled}
              onClick={() => navigate('/voice')}
            />
          </Panel>
        </div>

        {/* Row 3: Compact Modules (2 Items Each) */}
        <div className="col-span-3" style={{ marginTop: 'var(--space-6)' }}>
          <Panel title={t("COMMAND GATEWAY")} accent>
            <DataSlab 
              label={t("Core System Commands")} 
              value={t('8 COMMANDS')} 
              sub={t("Console system command permissions")}
              onClick={() => navigate('/commands', { state: { highlight: 'commands' } })}
            />
            <DataSlab 
              label={t("Text Invocation Prefix")} 
              value={config?.prefix ? `"${config.prefix}"` : '"!"'} 
              sub={t("Legacy command prefix")}
              onClick={() => navigate('/commands', { state: { highlight: 'commands' } })}
            />
          </Panel>
        </div>

        <div className="col-span-3" style={{ marginTop: 'var(--space-6)' }}>
          <Panel title={t("AUDIT LOGS & SECURITY")} accent>
            <DataSlab 
              label={t("Security Logging Channel")} 
              value={config?.logChannelId ? t('INTEGRATED') : t('UNSET')} 
              sub={t("Target security event channel")}
              highlight={!!config?.logChannelId}
              onClick={() => navigate('/audit-logs', { state: { highlight: 'logchannel' } })}
            />
            <DataSlab 
              label={t("Administrative Audit Trail")} 
              value={t('READY')} 
              sub={t("Historical configuration logs")}
              onClick={() => navigate('/audit-logs', { state: { highlight: 'activity' } })}
            />
          </Panel>
        </div>

        <div className="col-span-3" style={{ marginTop: 'var(--space-6)' }}>
          <Panel title={t("RIOT & ESPORTS")} accent>
            <DataSlab 
              label={t("Riot Games Telemetry")} 
              value={config?.lolEnabled ? t('ACTIVE') : t('STANDBY')} 
              sub={t("League of Legends & TFT tracking")}
              highlight={config?.lolEnabled}
              onClick={() => navigate('/riot')}
            />
            <DataSlab 
              label={t("Esports Live Matches")} 
              value={config?.esportsNotifyEnabled ? t('ACTIVE') : t('STANDBY')} 
              sub={t("Match alerts & schedule broadcasts")}
              highlight={config?.esportsNotifyEnabled}
              onClick={() => navigate('/esports')}
            />
          </Panel>
        </div>

        <div className="col-span-3" style={{ marginTop: 'var(--space-6)' }}>
          <Panel title={t("AUTOMATION & AI")} accent>
            <DataSlab 
              label={t("Scheduled Reminders")} 
              value={config?.remindersEnabled ? t('ACTIVE') : t('STANDBY')} 
              sub={t("Cron tasks & alert notifications")}
              highlight={config?.remindersEnabled}
              onClick={() => navigate('/reminders')}
            />
            <DataSlab 
              label={t("Neural AI Agent")} 
              value={t('GPT-4O-MINI')} 
              sub={t("LLM chat & response parsing")}
              onClick={() => navigate('/ai')}
            />
          </Panel>
        </div>

      </div>
    </Workspace>
  );
}
