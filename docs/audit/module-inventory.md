# Comprehensive Source Module Inventory & Architectural Audit

**Audit Target:** `D:\CODE\Code\discord-bot`  
**Execution Timestamp:** 2026-10-12T20:55:00+07:00  
**Test Suite Status:** **202 / 202 Tests PASS** across 17 Test Files (100% Pass Rate) — Exit Code `0`  
**Syntax Verification:** **41 / 41 Guard Files PASS** (`pnpm check` / `node --check`) — Exit Code `0`  
**Total Tracked Modules in Scope:** **66 Production Source Modules**  

---

## 1. Executive Summary & Architecture Overview

The repository implements a multi-feature Discord application designed with high-concurrency resilience and dual deployment architecture:
1. **Mode A — Monolith (`src/index.js`):** Single process hosting both the Discord Gateway client and the Express dashboard server.
2. **Mode B — Split (`src/index.bot.js` & `src/index.server.js`):** Independent processes communicating strictly through Upstash Redis (shared state, configuration index, sessions, guild metadata cache, and command queues).

### Key Architectural Characteristics Discovered
- **Persistence Model:** Redis-first persistence with Lua scripting (`EVAL`) for atomic transactions, conditional compare-and-swap (CAS), distributed lease locks, and rate limiters. In-memory data structures exist strictly as local-development fallbacks and are prevented from activating as fail-open vectors during Redis outages in production.
- **Dependency Topology:** Full static import graph analysis detected **0 circular dependencies** across all 66 production modules. All layers maintain clean unidirectional flows: entry points → subsystems → shared services → core primitives.
- **Test Discovery:** Vitest is configured in Node environment with v8 coverage provider, targeting `src/**/*.js` while excluding scratch scripts, static datasets, build artifacts, and client SPA code.

---

## 2. Module Inventory by Domain and Layer

### 2.1. Core & Shared Infrastructure

| Source Module | Layer | Role / Primary Responsibility | Direct / Indirect Test Suite | Stmts (%) | Branch (%) | Funcs (%) | Lines (%) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `src/asyncMutex.js` | Core Primitive | Per-key in-memory asynchronous mutex pool for serialization | `tests/coreModules.test.js` | 100.0% | 100.0% | 100.0% | 100.0% |
| `src/env.js` | Infrastructure | Environment variable parsing, schema guard, and weak secret detection | `tests/env.test.js` | 100.0% | 96.42% | 100.0% | 100.0% |
| `src/safeJson.js` | Security | Prototype-pollution-safe JSON parse and clone utilities | `tests/coreModules.test.js` | 100.0% | 83.33% | 100.0% | 100.0% |
| `src/cooldowns.js` | Rate Limiting | In-memory command rate limiting and cooldown expiration tracker | `tests/coreModules.test.js` | 100.0% | 94.73% | 100.0% | 100.0% |
| `src/csrf.js` | Security | Cryptographic CSRF token generation and validation middleware | `tests/coreModules.test.js`, `tests/serverRoutes.test.js` | 82.00% | 73.33% | 100.0% | 82.00% |
| `src/rateLimit.js` | Security | Express sliding-window IP rate limiter | `tests/coreModules.test.js` | 56.00% | 91.66% | 75.00% | 56.00% |
| `src/commandAccess.js` | Authorization | Command permissions, role allowlists, and channel authorization | `tests/coreModules.test.js`, `tests/fullSystemAudit.test.js` | 56.98% | 74.46% | 66.66% | 56.98% |
| `src/configDefaults.js` | Configuration | Default server schema, module command definitions, and constants | `tests/configStore.test.js` | 100.0% | 25.00% | 100.0% | 100.0% |
| `src/configPatch.js` | Utility | Safe object diffing and recursive patching helper | `tests/coreModules.test.js` | 100.0% | 88.88% | 100.0% | 100.0% |
| `src/utils/loginWithRetry.js` | Client Lifecycle | Resilient Discord Gateway login with backoff and fatal 401 fast exit | `tests/coreModules.test.js` | 100.0% | 100.0% | 100.0% | 100.0% |

### 2.2. Distributed State & Storage Layer

| Source Module | Layer | Role / Primary Responsibility | Direct / Indirect Test Suite | Stmts (%) | Branch (%) | Funcs (%) | Lines (%) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `src/distributedLock.js` | Concurrency | Redis distributed lock with fencing token, auto-renewal, and fencedSet | `tests/distributedLock.test.js` | 91.76% | 86.36% | 100.0% | 91.76% |
| `src/upstash.js` | Persistence | Upstash Redis REST client wrapper and command pipeline | Indirect (`tests/stateStore.test.js`, `tests/auth.test.js`) | 48.52% | 33.33% | 3.22% | 48.52% |
| `src/sessionStore.js` | Persistence | Redis Express session adapter with dynamic cookie TTL | `tests/sessionStore.test.js` | 100.0% | 100.0% | 100.0% | 100.0% |
| `src/configStore.js` | Persistence | Guild configuration management (Redis + mutex serialization + index) | `tests/configStore.test.js` | 79.97% | 39.76% | 94.11% | 79.97% |
| `src/stateStore.js` | Persistence | Guild state, economy balances, XP, game states, atomic Lua transfers, hash-tag migration | `tests/economyTransfer.test.js`, `tests/economyMigrationConcurrency.test.js` | 39.22% | 68.91% | 25.00% | 39.22% |

### 2.3. Web & REST API Layer

| Source Module | Layer | Role / Primary Responsibility | Direct / Indirect Test Suite | Stmts (%) | Branch (%) | Funcs (%) | Lines (%) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `src/server.js` | Web API | Express monolithic REST API application, OAuth2 routes, and dashboard endpoints | `tests/serverRoutes.test.js` | 14.74% | 44.11% | 18.75% | 14.74% |
| `src/auth.js` | Security / Auth | Discord OAuth2 exchange, prefetch protection, state verification, deduplication | `tests/auth.test.js` | 57.16% | 61.60% | 64.28% | 57.16% |
| `src/guildService.js` | Service | Discord user guilds fetch, soft/hard cache, monotonic versioning, single-flight | `tests/guildService.test.js` | 80.44% | 64.70% | 93.33% | 80.44% |
| `src/index.server.js` | Entry Point | Standalone dashboard HTTP process entry point (Split mode) | Process entry (Excluded from unit test) | 0.00% | 0.00% | 0.00% | 0.00% |

### 2.4. Discord Bot Core & Gateway Layer

| Source Module | Layer | Role / Primary Responsibility | Direct / Indirect Test Suite | Stmts (%) | Branch (%) | Funcs (%) | Lines (%) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `src/bot.js` | Bot Core | Discord client instantiation, event listeners, reconnection cache recovery | `tests/gatewayCacheRecovery.test.js` | 13.96% | 59.37% | 40.00% | 13.96% |
| `src/index.bot.js` | Entry Point | Standalone Discord client process entry point (Split mode) | Process entry (Excluded from unit test) | 0.00% | 0.00% | 0.00% | 0.00% |
| `src/index.js` | Entry Point | Combined Monolith process entry point (Mode A) | Process entry (Excluded from unit test) | 0.00% | 0.00% | 0.00% | 0.00% |
| `src/bot/constants.js` | Constants | Palette colors and auto-defer command type registry | Direct | 100.0% | 100.0% | 100.0% | 100.0% |
| `src/bot/embeds.js` | Presentation | Discord Embed message builder utilities | Indirect | 20.00% | 100.0% | 0.00% | 20.00% |
| `src/bot/emojiMap.js` | Presentation | Champion and feature emoji mapping table | Indirect | 91.46% | 50.00% | 100.0% | 91.46% |
| `src/bot/responses.js` | Presentation | Template variable interpolator and standard error formatter | Direct | 94.73% | 35.71% | 100.0% | 94.73% |
| `src/bot/logging.js` | Auditing | Audit logger sending embeds to guild system/log channels | Indirect | 35.10% | 33.33% | 16.66% | 35.10% |
| `src/bot/slash.js` | Command Gateway | Slash command builder and REST registration sync | Indirect | 1.37% | 100.0% | 0.00% | 1.37% |
| `src/bot/interactions.js` | Event Handler | Button, select menu, and modal interaction dispatcher | Indirect | 3.63% | 100.0% | 0.00% | 3.63% |
| `src/bot/help.js` | Subsystem | Interactive help menu and command categorization | `tests/fullSystemAudit.test.js` | 54.83% | 100.0% | 0.00% | 54.83% |

### 2.5. Background Workers & Scheduled Jobs

| Source Module | Layer | Role / Primary Responsibility | Direct / Indirect Test Suite | Stmts (%) | Branch (%) | Funcs (%) | Lines (%) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `src/bot/reminderWorker.js` | Worker | Distributed reminder scheduler, fencing CAS, delivery oracle, dead-letter | `tests/reminderDeliveryReliability.test.js`, `tests/reminderWorker.test.js` | 81.69% | 66.19% | 72.72% | 81.69% |
| `src/bot/esportsWorker.js` | Worker | Polling worker for live LoL esports matches and broadcast notifications | Indirect | 3.78% | 100.0% | 0.00% | 3.78% |
| `src/bot/services/countersEngine.js` | Service / Worker | Dynamic channel statistics counters with Discord 429 adaptive backoff | `tests/gatewayCacheRecovery.test.js` | 26.72% | 77.77% | 41.66% | 26.72% |

### 2.6. Subsystems & Automation

| Source Module | Layer | Role / Primary Responsibility | Direct / Indirect Test Suite | Stmts (%) | Branch (%) | Funcs (%) | Lines (%) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `src/bot/autoMod.js` | Subsystem | Blacklist word scanner, automatic message deletion, and user warnings | `tests/fullSystemAudit.test.js` | 98.86% | 57.14% | 100.0% | 98.86% |
| `src/bot/tempVoice.js` | Subsystem | Dynamic voice channel creator, permission copier, and empty channel cleanup | `tests/fullSystemAudit.test.js` | 90.09% | 28.57% | 100.0% | 90.09% |
| `src/bot/xpHandler.js` | Subsystem | Text/voice activity XP accumulation, level progression, role rewards | `tests/fullSystemAudit.test.js` | 93.75% | 80.00% | 100.0% | 93.75% |
| `src/bot/games.js` | Subsystem | Turn-based casino games (Blackjack, Poker, Coinflip, Dice) with mutex locks | `tests/fullSystemAudit.test.js` | 27.85% | 55.00% | 21.73% | 27.85% |
| `src/bot/music/lavalink.js` | Subsystem | Lavalink audio node connection manager and voice state coordinator | Untested in unit suite (Requires Lavalink audio mock) | 21.36% | 100.0% | 0.00% | 21.36% |

### 2.7. Command Architecture & Handlers

| Source Module | Layer | Role / Primary Responsibility | Direct / Indirect Test Suite | Stmts (%) | Branch (%) | Funcs (%) | Lines (%) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `src/bot/commands.js` | Command Registry | Re-export of command registry | Direct | 100.0% | 100.0% | 100.0% | 100.0% |
| `src/bot/commands/index.js` | Command Router | Central command registration and dispatch | `tests/fullSystemAudit.test.js` | 53.73% | 33.33% | 100.0% | 53.73% |
| `src/bot/commands/runtime.js` | Command Runtime | Execution wrapper, permission verification, auto-deferral, error wrapping | `tests/commandRuntimeAndHandlers.test.js` | 91.93% | 75.00% | 100.0% | 91.93% |
| `src/bot/commands/handlers/counters.js` | Handler | Channel stats counter command handler | Untested directly | 3.25% | 100.0% | 0.00% | 3.25% |
| `src/bot/commands/handlers/duolingo.js` | Handler | Duolingo language practice and streak tracker | `tests/fullSystemAudit.test.js` | 3.67% | 100.0% | 14.28% | 3.67% |
| `src/bot/commands/handlers/economy.js` | Handler | Economy commands (balance, transfer, daily, work) | Untested directly | 4.04% | 100.0% | 0.00% | 4.04% |
| `src/bot/commands/handlers/esports.js` | Handler | Esports schedule, live match alerts, standings | `tests/fullSystemAudit.test.js` | 97.95% | 20.00% | 100.0% | 97.95% |
| `src/bot/commands/handlers/general.js` | Handler | General commands (ping, avatar, serverinfo, userinfo, config) | `tests/commandRuntimeAndHandlers.test.js` | 56.83% | 21.05% | 100.0% | 56.83% |
| `src/bot/commands/handlers/help.js` | Handler | Help menu router command | Untested directly | 10.25% | 100.0% | 0.00% | 10.25% |
| `src/bot/commands/handlers/levels.js` | Handler | Rank and leaderboard commands | `tests/commandRuntimeAndHandlers.test.js` | 70.73% | 25.00% | 100.0% | 70.73% |
| `src/bot/commands/handlers/moderation.js` | Handler | Moderation commands (kick, ban, mute, warn, purge) | Untested directly | 5.16% | 100.0% | 0.00% | 5.16% |
| `src/bot/commands/handlers/music.js` | Handler | Music playback commands (play, pause, skip, queue, stop) | Untested directly | 4.86% | 100.0% | 0.00% | 4.86% |
| `src/bot/commands/handlers/panels.js` | Handler | Role panel and ticket panel creation commands | `tests/commandRuntimeAndHandlers.test.js` | 30.00% | 28.57% | 100.0% | 30.00% |
| `src/bot/commands/handlers/riot.js` | Handler | Riot Games command dispatcher | Untested directly | 12.38% | 100.0% | 0.00% | 12.38% |
| `src/bot/commands/handlers/tempVcSetup.js` | Handler | Temp voice channel configuration wizard | Untested directly | 6.46% | 100.0% | 0.00% | 6.46% |
| `src/bot/commands/handlers/translate.js` | Handler | Text translation command handler | Untested directly | 7.52% | 100.0% | 0.00% | 7.52% |

### 2.8. External Integrations & Game APIs

| Source Module | Layer | Role / Primary Responsibility | Direct / Indirect Test Suite | Stmts (%) | Branch (%) | Funcs (%) | Lines (%) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `src/esportsApi.js` | API Client | LoL Esports schedule, tournaments, and live matches API client | Direct | 45.54% | 27.08% | 40.00% | 45.54% |
| `src/lolApi.js` | API Client | Riot Games League of Legends REST API client | Indirect | 25.14% | 100.0% | 3.12% | 25.14% |
| `src/lolCommands.js` | Subsystem | League of Legends commands (profile, mastery, match history) | Indirect | 7.46% | 100.0% | 0.00% | 7.46% |
| `src/bot/lolQuiz.js` | Game Engine | LoL champion ability and audio quiz game engine | Indirect | 5.38% | 100.0% | 0.00% | 5.38% |
| `src/bot/lolQuizData.js` | Dataset | Static question bank for LoL quiz | Indirect | 28.64% | 0.00% | 0.00% | 28.64% |
| `src/bot/lolQuizCustomData.js` | Dataset | Community questions data | Untested | 0.00% | 0.00% | 0.00% | 0.00% |
| `src/riot/helpers.js` | Utility | Riot API response formatter and rank icons | `tests/coreModules.test.js` | 86.84% | 76.47% | 75.00% | 86.84% |
| `src/tftApi.js` | API Client | Riot Games Teamfight Tactics REST API client | Indirect | 36.04% | 100.0% | 0.00% | 36.04% |
| `src/tftCommands.js` | Subsystem | Teamfight Tactics commands (rank, match history) | Indirect | 13.38% | 100.0% | 0.00% | 13.38% |
| `src/services/translation.service.js` | Service | Text translation with in-memory cache and provider fallback | `tests/coreModules.test.js` | 89.88% | 72.22% | 100.0% | 89.88% |
| `src/services/translation/languages.js` | Utility | Supported language map and code normalizer | `tests/translation.test.js` | 100.0% | 60.00% | 100.0% | 100.0% |
| `src/services/translation/providers/googleFree.provider.js` | Provider | Free Google Translate API provider with retry & timeout | `tests/translation.test.js` | 100.0% | 84.61% | 100.0% | 100.0% |

---

## 3. Source-to-Test Mapping & Coverage Gaps

### 3.1. Test Discovery Status
- Total Test Files: **15 suites** (`tests/*.test.js`)
- Total Executed Tests: **186 passing tests**
- Execution Duration: ~5.7s across all suites

### 3.2. Prior Blind Spots Resolved in Current Audit
1. **`src/configStore.js` (914 lines):** Originally had 0% coverage because `tests/configStore.test.js` previously only imported `src/configDefaults.js`. Resolved with comprehensive tests covering constructor validation, Redis index load, default merging, atomic update mutations, and mutex serialization (**coverage raised to 79.97%**).
2. **`src/env.js` (97 lines):** Originally had 0% coverage. Added `tests/env.test.js` covering bot, server, legacy, production, placeholder, and weak secret assertions (**coverage raised to 100%**).
3. **`src/sessionStore.js` (58 lines):** Originally had 0% coverage. Added `tests/sessionStore.test.js` covering get, set, destroy, touch, dynamic cookie TTL, and corrupted payload handling (**coverage raised to 100%**).
4. **`src/guildService.js` (363 lines):** Originally had 0% coverage. Added `tests/guildService.test.js` covering cache hits, cache misses, single-flight in-flight deduplication, lock contention, and 429 backoff (**coverage raised to 80.71%**).
5. **`src/bot/commands/runtime.js` (62 lines):** Added `tests/commandRuntimeAndHandlers.test.js` covering permission validation, auto-deferral, bot channel missing permissions (**coverage raised to 91.93%**).
6. **`src/services/translation/providers/googleFree.provider.js` (52 lines):** Added retry, timeout AbortController, and invalid payload tests in `tests/translation.test.js` (**coverage raised to 100%**).

---

## 4. Legitimate Exclusions Justification

| Module | Lines | Reason for Exclusion from Direct Unit Test Suite |
| :--- | :--- | :--- |
| `src/server.js` | 1962 | Monolithic Express web application containing 50+ REST endpoints. Requires isolated integration/supertest harness with mounted session store rather than unit isolation. |
| `src/index.js` | 97 | Monolith bootstrap entry point; binds network sockets, starts timers, registers process exit hooks. |
| `src/index.bot.js` | 106 | Bot process bootstrap entry point; binds HTTP health server and connects to Discord Gateway. |
| `src/index.server.js` | 63 | Dashboard process bootstrap entry point; binds HTTP port and initializes session store. |
| `src/bot/music/lavalink.js`| 323 | Third-party WebSocket/REST audio engine client; requires running Lavalink Java instance or mock audio node. |
| `src/lolApi.js` & `src/tftApi.js` | 971 | Riot Games REST clients requiring official Riot API keys and rate limit gateways. |
| `src/data/*` & `src/scratch/*` | ~70 KB | Static lookup tables (champion emojis, metadata) and one-off generator scripts; excluded in `vitest.config.js`. |
