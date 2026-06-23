# Domain Mapping Report — Frontend V4 Rebuild

This report maps the data flow, endpoints, mutations, states, and dependencies of all domain components to guarantee architecture integrity during the separation of business logic from JSX rendering.

---

## 1. Core Domain (`src/domains/core`)

### Overview Page
- **Inputs**: None (uses global guild session).
- **Outputs**: System status telemetry dashboards, server operational summaries.
- **API Endpoints**: `/api/status` (api.status)
- **State Management**:
  - Global: `config` (GuildConfig), `selectedGuild` (Guild) via `GuildContext`.
  - Local: `status` (System status object) updated via heartbeat polling.
- **Mutations**: None (read-only telemetry dashboard).
- **Dependencies**: `lucide-react`, `motion/react`.

### Members Page
- **Inputs**: search filter string, active page index.
- **Outputs**: Table of guild members matching search parameters with pagination bars.
- **API Endpoints**: `/api/members` (api.members)
- **State Management**:
  - Global: `selectedGuild` via `GuildContext`.
  - Local: `page` (number), `search` (string), `debouncedSearch` (string) with 300ms debounce buffer.
- **Mutations**: None.
- **Dependencies**: `lucide-react`, `@tanstack/react-query`.

### Moderation Page
- **Inputs**: AutoMod toggle parameters, anti-spam thresholds, bad word array additions, self-role configuration items.
- **Outputs**: Mod panel config sheets, badge indicators, bad words lists, self-roles configurations.
- **API Endpoints**: None (mutations persist via global saveConfig).
- **State Management**:
  - Global: `config` (GuildConfig), `updateConfig`, `guildData` (roles list) via `GuildContext`.
  - Local: `input` (string, local text box state for bad words), self-role local fields.
- **Mutations**:
  - `updateConfig({ moderation: { ... } })`
  - `updateConfig({ welcomeEnabled: ... })`
  - `updateConfig({ selfRoles: ... })`
- **Dependencies**: `lucide-react`, `useGuild`.

### Commands Page
- **Inputs**: command toggle status, custom command parameters, keywords for auto-reply.
- **Outputs**: Telemetry command tables, list of custom commands, lists of keyword triggers.
- **API Endpoints**: None (mutations persist via global saveConfig).
- **State Management**:
  - Global: `config` (GuildConfig), `updateConfig` via `GuildContext`.
  - Local: Command editor item objects.
- **Mutations**:
  - `updateConfig({ commands: ... })`
  - `updateConfig({ autoReplies: ... })`
- **Dependencies**: `lucide-react`, `useGuild`.

### Economy Page
- **Inputs**: currency names/icons, blackjack/poker game boundaries, daily claim rewards.
- **Outputs**: Config ledgers, betting limits input sheets.
- **API Endpoints**: None (mutations persist via global saveConfig).
- **State Management**:
  - Global: `config` (GuildConfig), `updateConfig` via `GuildContext`.
- **Mutations**:
  - `updateConfig({ economyEnabled: ... })`
  - `updateConfig({ blackjackMinBet: ..., blackjackMaxBet: ... })`
  - `updateConfig({ dailySilverAmount: ... })`
- **Dependencies**: `lucide-react`, `useGuild`.

### Analytics Page
- **Inputs**: Time range tabs (`7d`, `30d`, `90d`).
- **Outputs**: Activity count telemetry charts, SVG charts, top commands list.
- **API Endpoints**: `/api/analytics` (apiFetch `/api/analytics?guildId={}&range={}`)
- **State Management**:
  - Global: `selectedGuild` via `GuildContext`.
  - Local: `range` (string) to trigger refetch.
- **Mutations**: None.
- **Dependencies**: `lucide-react`, `@tanstack/react-query`, `apiFetch`.

### System Page
- **Inputs**: Manual refresh trigger.
- **Outputs**: PM2 telemetry block details, system resources heartbeats (CPU/RAM).
- **API Endpoints**: `/api/status` (api.status)
- **State Management**:
  - Local: `status` (system state), `loading` (boolean), `refreshing` (boolean) updated via 15s refresh intervals.
- **Mutations**: None.
- **Dependencies**: `lucide-react`, `api`.

---

## 2. Riot Domain (`src/domains/riot`)

### Riot Services Page
- **Inputs**: Riot API key, TFT API key, LoL module toggles.
- **Outputs**: API authentication states, League & TFT command tables.
- **API Endpoints**: None (mutations persist via global saveConfig).
- **State Management**:
  - Global: `config` (GuildConfig), `updateConfig`, `configLoading` via `GuildContext`.
- **Mutations**:
  - `updateConfig({ riotApiKey: ... })`
  - `updateConfig({ tftApiKey: ... })`
  - `updateConfig({ lolEnabled: ... })`
  - `updateConfig({ tftEnabled: ... })`
- **Dependencies**: `lucide-react`, `motion/react`, `useGuild`.

---

## 3. Music Domain (`src/domains/music`)

### Music Services Page
- **Inputs**: Music module toggles, audio playback volume sliders.
- **Outputs**: Active nodes indicators, audio sliders.
- **API Endpoints**: None (mutations persist via global saveConfig).
- **State Management**:
  - Global: `config` (GuildConfig), `updateConfig`, `configLoading` via `GuildContext`.
- **Mutations**:
  - `updateConfig({ musicEnabled: ... })`
  - `updateConfig({ musicPrefix: ... })`
  - `updateConfig({ music: { ...music, defaultVolume: ... } })`
- **Dependencies**: `lucide-react`, `motion/react`, `useGuild`.

---

## 4. Reminder Domain (`src/domains/reminder`)

### Reminder Services Page
- **Inputs**: Reminders list additions, messages, times, intervals, channel selections.
- **Outputs**: Table of cron-jobs parameters.
- **API Endpoints**: None (mutations persist via global saveConfig).
- **State Management**:
  - Global: `config` (GuildConfig), `updateConfig`, `guildData` via `GuildContext`.
- **Mutations**:
  - `updateConfig({ remindersEnabled: ... })`
  - `updateConfig({ reminders: ... })`
- **Dependencies**: `lucide-react`, `motion/react`, `useGuild`.
