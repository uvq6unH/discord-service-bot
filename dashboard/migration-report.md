# Migration Report — Frontend V4 Rebuild

This report maps 100% of the frontend codebase inside the `dashboard/` directory, categorizing each file into its structural type and defining its migration action (`KEEP`, `DELETE`, or `REFACTOR`).

---

## 1. Main Application & Shell Files

| File Path | Type | Action | Description |
|---|---|---|---|
| [dashboard/src/App.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/App.jsx) | UI + LOGIC | **REFACTOR** | Replace routing structure with the new router config and use layout primitives. |
| [dashboard/src/main.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/main.jsx) | UI + LOGIC | **REFACTOR** | Rebind styling to `src/design/index.css` and imports to point to new layout rails. |
| [dashboard/src/api.js](file:///d:/CODE/Code/discord-bot/dashboard/src/api.js) | LOGIC ONLY | **KEEP** | Standard re-export bridge for centralized api requests. |
| [dashboard/src/types.ts](file:///d:/CODE/Code/discord-bot/dashboard/src/types.ts) | LOGIC ONLY | **KEEP** | Single source of truth for global type definitions. |

---

## 2. Legacy Components (`src/components/`)
*To be replaced by shared layout primitives in `src/shared/` or private components inside individual domains.*

| File Path | Type | Action | Description |
|---|---|---|---|
| [dashboard/src/components/ErrorBoundary.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/components/ErrorBoundary.jsx) | UI ONLY | **DELETE** | Move to a shared primitives layout. |
| [dashboard/src/components/PluginNav.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/components/PluginNav.jsx) | UI ONLY | **DELETE** | Unused legacy sidebar navigation. |
| [dashboard/src/components/ServerRail.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/components/ServerRail.jsx) | UI + LOGIC | **DELETE** | Replaced by dynamic `GuildRail` under `src/shared/navigation/`. |
| [dashboard/src/components/ui.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/components/ui.jsx) | UI ONLY | **DELETE** | Legacy elements (PageHeader, SaveBar, empty states, etc.) to be deleted in favor of clean primitives. |

---

## 3. Legacy Contexts & Styles
*Contexts to be moved under app providers; styles to be fully rebuilt inside the new tokens/themes system.*

| File Path | Type | Action | Description |
|---|---|---|---|
| [dashboard/src/contexts/AuthContext.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/contexts/AuthContext.jsx) | UI + LOGIC | **DELETE** | Already duplicated/superseded. Logic lives in `app/services/auth`. |
| [dashboard/src/contexts/GuildContext.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/contexts/GuildContext.jsx) | UI + LOGIC | **DELETE** | Already duplicated/superseded. Logic lives in `app/services/guild`. |
| [dashboard/src/styles/globals.css](file:///d:/CODE/Code/discord-bot/dashboard/src/styles/globals.css) | UI ONLY | **DELETE** | Replaced by global `src/design/index.css`. |

---

## 4. Legacy Pages (`src/pages/`)
*All pages will be deleted. Their upgraded, domain-isolated counterparts under `src/app/domains/` will be used as the logic extraction source.*

| File Path | Type | Action | Description |
|---|---|---|---|
| [dashboard/src/pages/Analytics.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/pages/Analytics.jsx) | UI + LOGIC | **DELETE** | Legacy analytics representation. |
| [dashboard/src/pages/Commands.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/pages/Commands.jsx) | UI + LOGIC | **DELETE** | Legacy commands representation. |
| [dashboard/src/pages/Economy.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/pages/Economy.jsx) | UI + LOGIC | **DELETE** | Legacy economy representation. |
| [dashboard/src/pages/Login.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/pages/Login.jsx) | UI + LOGIC | **DELETE** | Legacy login page. Rebuilt under core pages. |
| [dashboard/src/pages/Lol.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/pages/Lol.jsx) | UI + LOGIC | **DELETE** | Legacy Riot page. Replaced by Riot Services. |
| [dashboard/src/pages/Members.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/pages/Members.jsx) | UI + LOGIC | **DELETE** | Legacy members representation. |
| [dashboard/src/pages/Moderation.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/pages/Moderation.jsx) | UI + LOGIC | **DELETE** | Legacy moderation page. |
| [dashboard/src/pages/Overview.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/pages/Overview.jsx) | UI + LOGIC | **DELETE** | Legacy overview page. |
| [dashboard/src/pages/System.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/pages/System.jsx) | UI + LOGIC | **DELETE** | Legacy system stats page. |

---

## 5. Domain Logic Source Files (`src/app/domains/`)
*These files represent the active functional logic and layouts. We will refactor them to separate logic/services from JSX views.*

| File Path | Type | Action | Description |
|---|---|---|---|
| [dashboard/src/app/domains/core/Analytics.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/app/domains/core/Analytics.jsx) | UI + LOGIC | **REFACTOR** | Extract state logic to `analytics.service.js` and rebuild view under `domains/core/pages/Analytics.jsx`. |
| [dashboard/src/app/domains/core/Commands.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/app/domains/core/Commands.jsx) | UI + LOGIC | **REFACTOR** | Extract state logic to `command.service.js` and rebuild view under `domains/core/pages/Commands.jsx`. |
| [dashboard/src/app/domains/core/Economy.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/app/domains/core/Economy.jsx) | UI + LOGIC | **REFACTOR** | Extract config updates to `economy.service.js` and rebuild view under `domains/core/pages/Economy.jsx`. |
| [dashboard/src/app/domains/core/Members.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/app/domains/core/Members.jsx) | UI + LOGIC | **REFACTOR** | Extract search/query adapter to `member.service.js` and rebuild view under `domains/core/pages/Members.jsx`. |
| [dashboard/src/app/domains/core/Moderation.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/app/domains/core/Moderation.jsx) | UI + LOGIC | **REFACTOR** | Extract auto-mod mutators to `moderation.service.js` and rebuild view under `domains/core/pages/Moderation.jsx`. |
| [dashboard/src/app/domains/core/Overview.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/app/domains/core/Overview.jsx) | UI + LOGIC | **REFACTOR** | Extract health metrics and operations telemetry to `system.service.js` and `guild.service.js`, and rebuild view under `domains/core/pages/Overview.jsx`. |
| [dashboard/src/app/domains/core/System.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/app/domains/core/System.jsx) | UI + LOGIC | **REFACTOR** | Extract PM2 stats to `system.service.js` and rebuild view under `domains/core/pages/System.jsx`. |
| [dashboard/src/app/domains/riot/RiotServices.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/app/domains/riot/RiotServices.jsx) | UI + LOGIC | **REFACTOR** | Extract Riot key updates and TFT sync to `riot.service.js` and rebuild view under `domains/riot/pages/RiotServices.jsx`. |
| [dashboard/src/app/domains/music/MusicServices.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/app/domains/music/MusicServices.jsx) | UI + LOGIC | **REFACTOR** | Extract playback volume updates to `music.service.js` and rebuild view under `domains/music/pages/MusicServices.jsx`. |
| [dashboard/src/app/domains/reminder/ReminderServices.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/app/domains/reminder/ReminderServices.jsx) | UI + LOGIC | **REFACTOR** | Extract scheduler handlers to `reminder.service.js` and rebuild view under `domains/reminder/pages/ReminderServices.jsx`. |

---

## 6. Services Layer (`src/app/services/`)
*Core logic and repository hooks to be preserved and refactored into clean repositories and providers.*

| File Path | Type | Action | Description |
|---|---|---|---|
| [dashboard/src/app/services/api/index.js](file:///d:/CODE/Code/discord-bot/dashboard/src/app/services/api/index.js) | LOGIC ONLY | **KEEP** | Centralized API client. Remains the single source of truth for fetches. |
| [dashboard/src/app/services/auth/AuthContext.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/app/services/auth/AuthContext.jsx) | UI + LOGIC | **REFACTOR** | Move hook adapter to `useAuth` and provider layer to `app/providers/AuthProvider.jsx`. |
| [dashboard/src/app/services/guild/GuildContext.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/app/services/guild/GuildContext.jsx) | UI + LOGIC | **REFACTOR** | Move hook adapter to `useGuild` and provider layer to `app/providers/GuildProvider.jsx`. |

---

## 7. App Shared Layouts & UI Components (`src/app/shared/`)
*To be deleted. Upgraded, tokenized shared primitives and layout specs will be built under root `src/shared/`.*

| File Path | Type | Action | Description |
|---|---|---|---|
| [dashboard/src/app/shared/layouts/DomainNav.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/app/shared/layouts/DomainNav.jsx) | UI + LOGIC | **DELETE** | To be replaced by dynamic `DomainRail` layout component. |
| [dashboard/src/app/shared/layouts/domains.js](file:///d:/CODE/Code/discord-bot/dashboard/src/app/shared/layouts/domains.js) | LOGIC ONLY | **DELETE** | Replaced by `app/router/navigation.config.ts`. |
| [dashboard/src/app/shared/ui/Button.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/app/shared/ui/Button.jsx) | UI ONLY | **DELETE** | Replaced by tokenized primitive `src/shared/primitives/Button.jsx`. |
| [dashboard/src/app/shared/ui/Input.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/app/shared/ui/Input.jsx) | UI ONLY | **DELETE** | Replaced by tokenized primitive `src/shared/primitives/Input.jsx`. |
| [dashboard/src/app/shared/ui/Modal.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/app/shared/ui/Modal.jsx) | UI ONLY | **DELETE** | Replaced by tokenized primitive `src/shared/primitives/Modal.jsx`. |
| [dashboard/src/app/shared/ui/Panel.jsx](file:///d:/CODE/Code/discord-bot/dashboard/src/app/shared/ui/Panel.jsx) | UI ONLY | **DELETE** | Replaced by tokenized primitive `src/shared/primitives/Panel.jsx`. |
| [dashboard/src/app/shared/ui/index.js](file:///d:/CODE/Code/discord-bot/dashboard/src/app/shared/ui/index.js) | UI ONLY | **DELETE** | Shared UI exports bridge. |

---

## 8. Design Tokens (`tokens/`)
*Moving to `src/design/tokens/` under Phase 5 to support uppercase display typographies and domain indicators.*

| File Path | Type | Action | Description |
|---|---|---|---|
| [dashboard/tokens/color.ts](file:///d:/CODE/Code/discord-bot/dashboard/tokens/color.ts) | LOGIC ONLY | **REFACTOR** | Shift variables and map to domain accents. |
| [dashboard/tokens/motion.ts](file:///d:/CODE/Code/discord-bot/dashboard/tokens/motion.ts) | LOGIC ONLY | **REFACTOR** | Map easing parameters to new transitions. |
| [dashboard/tokens/spacing.ts](file:///d:/CODE/Code/discord-bot/dashboard/tokens/spacing.ts) | LOGIC ONLY | **REFACTOR** | Define standard sizing units. |
| [dashboard/tokens/typography.ts](file:///d:/CODE/Code/discord-bot/dashboard/tokens/typography.ts) | LOGIC ONLY | **REFACTOR** | Rebind font families to Space Grotesk, IBM Plex Sans, and JetBrains Mono. |
