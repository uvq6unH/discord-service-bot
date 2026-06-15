/**
 * domains/core/Overview.jsx — Community Operations Platform
 * Phase 4: Identity page — Command Center aesthetic
 *
 * Sections (per MIGRATION.md):
 * - Server Health
 * - Member Growth
 * - Command Activity
 * - Moderation Events
 * - Economy Snapshot
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Activity, Users, Terminal, ShieldCheck, Coins } from 'lucide-react';
import { useGuild } from '../../services/guild/GuildContext.jsx';
import { api } from '../../services/api/index.js';

function StatusDot({ online }) {
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: online ? 'var(--green)' : 'var(--red)',
      boxShadow: online ? '0 0 6px rgba(34,197,94,0.6)' : '0 0 6px rgba(239,68,68,0.5)',
    }} />
  );
}

function MetricBlock({ label, value, sub, accent, large }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
        {label}
      </span>
      <span style={{
        fontSize: large ? 36 : 22, fontWeight: 700, fontFamily: 'var(--font-mono)',
        color: accent ? 'var(--accent)' : 'var(--text-1)', lineHeight: 1,
      }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{sub}</span>}
    </div>
  );
}

function Panel({ children, style, accent }) {
  return (
    <div style={{
      background: 'var(--surface-1)',
      border: `1px solid ${accent ? 'var(--border-accent)' : 'var(--border)'}`,
      borderRadius: 'var(--r5)', padding: 'var(--s6)', ...style,
    }}>
      {children}
    </div>
  );
}

function PanelTitle({ children, icon: Icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', marginBottom: 'var(--s4)' }}>
      {Icon && <Icon size={13} strokeWidth={1.75} style={{ color: 'var(--text-3)' }} />}
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
        {children}
      </span>
    </div>
  );
}

function FeatureRow({ label, enabled, hint }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div>
        <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{label}</span>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{hint}</div>}
      </div>
      <span style={{
        fontSize: 11, fontWeight: 600,
        color: enabled ? 'var(--green)' : 'var(--text-3)',
        background: enabled ? 'var(--green-dim)' : 'var(--surface-3)',
        padding: '2px 8px', borderRadius: 4,
      }}>
        {enabled ? 'ON' : 'OFF'}
      </span>
    </div>
  );
}

function BotHealthPanel({ status }) {
  const bot = status?.bot;
  const stats = status?.stats;
  const online = bot?.online ?? status?.botReady ?? false;
  const uptime = bot?.uptime ? (() => {
    const s = Math.floor(bot.uptime / 1000);
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  })() : '—';

  return (
    <Panel accent={online} style={{ gridArea: 'health' }}>
      <PanelTitle icon={Activity}>Server Health</PanelTitle>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', marginBottom: 'var(--s6)' }}>
        <StatusDot online={online} />
        <span style={{ fontSize: 13, fontWeight: 600, color: online ? 'var(--green)' : 'var(--red)' }}>
          {online ? 'Bot Online' : 'Bot Offline'}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s5)' }}>
        <MetricBlock label="Uptime"   value={uptime}                                     sub="lần khởi động cuối" />
        <MetricBlock label="Ping"     value={bot?.ping ? `${bot.ping}ms` : '—'}          sub="latency" />
        <MetricBlock label="Guilds"   value={bot?.guilds ?? stats?.guildCount ?? '—'} />
        <MetricBlock label="Commands" value={stats?.commandsToday ?? '—'}                sub="hôm nay" />
      </div>
    </Panel>
  );
}

function MemberGrowthPanel({ config }) {
  return (
    <Panel style={{ gridArea: 'members' }}>
      <PanelTitle icon={Users}>Member Growth</PanelTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s5)' }}>
        <FeatureRow label="Welcome System"  enabled={config?.welcomeEnabled ?? false}       hint={config?.welcomeChannelId ? `#${config.welcomeChannelId}` : 'Chưa cấu hình'} />
        <FeatureRow label="Logging"         enabled={!!config?.logChannelId}                hint="Member join/leave log" />
        <FeatureRow label="Announcements"   enabled={config?.announcementsEnabled ?? false} />
      </div>
    </Panel>
  );
}

function CommandActivityPanel({ config }) {
  return (
    <Panel style={{ gridArea: 'commands' }}>
      <PanelTitle icon={Terminal}>Command Activity</PanelTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s5)' }}>
        <MetricBlock label="Prefix" value={config?.prefix ?? '!'} sub="legacy prefix" />
        <MetricBlock label="Status" value={(config?.enabled ?? true) ? 'Enabled' : 'Disabled'} accent={config?.enabled ?? true} />
      </div>
    </Panel>
  );
}

function ModerationPanel({ config }) {
  const mod = config?.moderation ?? {};
  return (
    <Panel style={{ gridArea: 'mod' }}>
      <PanelTitle icon={ShieldCheck}>Moderation Events</PanelTitle>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <FeatureRow label="Auto Mod"   enabled={mod.enabled ?? false}  />
        <FeatureRow label="Anti Spam"  enabled={mod.antiSpam ?? false} />
        <FeatureRow label="Anti Link"  enabled={mod.antiLink ?? false} />
        <FeatureRow label="Anti Raid"  enabled={mod.antiRaid ?? false} />
      </div>
    </Panel>
  );
}

function EconomyPanel({ config }) {
  const eco = config?.economy ?? {};
  return (
    <Panel style={{ gridArea: 'economy' }}>
      <PanelTitle icon={Coins}>Economy Snapshot</PanelTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s5)' }}>
        <FeatureRow label="Economy System" enabled={eco.enabled ?? false} />
        <FeatureRow label="Leveling"       enabled={eco.levelingEnabled ?? config?.leveling?.enabled ?? false} />
        <MetricBlock label="Currency" value={eco.currencySymbol ?? eco.currencyName ?? '—'} sub="đơn vị tiền tệ" />
      </div>
    </Panel>
  );
}

export default function OverviewPage() {
  const { config, selectedGuild } = useGuild();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api.status().then(setStatus).catch(() => {});
  }, []);

  if (!config) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
      style={{ padding: 'var(--s8)', maxWidth: 'var(--content-max)', margin: '0 auto' }}
    >
      {/* Page header — asymmetric */}
      <div style={{ marginBottom: 'var(--s8)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s3)', marginBottom: 'var(--s2)' }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font)', color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em' }}>
            {selectedGuild?.name}
          </h1>
          <span style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--text-3)', background: 'var(--surface-3)', padding: '2px 8px',
            borderRadius: 4, border: '1px solid var(--border)',
          }}>
            Operations Overview
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
          Tổng quan hệ thống · Community Operations Platform
        </p>
      </div>

      {/* Asymmetric grid — MIGRATION.md: không chia card đều nhau */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateAreas: `
          "health  health  members"
          "commands mod    economy"
        `,
        gap: 'var(--s4)',
      }}>
        <BotHealthPanel status={status} />
        <MemberGrowthPanel config={config} />
        <CommandActivityPanel config={config} />
        <ModerationPanel config={config} />
        <EconomyPanel config={config} />
      </div>
    </motion.div>
  );
}
