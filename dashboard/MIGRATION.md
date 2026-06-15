# Dashboard V4 Migration Plan

## Core Principle

Không còn thiết kế theo:

* Module = Feature
* Sidebar = Danh sách chức năng bot

Chuyển sang:

* Product Domains
* Operational Areas
* Plugin Isolation

Mỗi domain là một khu vực độc lập.

Logic hiện tại giữ nguyên 100%.

Chỉ thay Information Architecture, Design System và UI Layer.

---

# Product Vision

Tên sản phẩm không còn là:

Discord Bot Dashboard

Mà là:

Community Operations Platform

Bot chỉ là một phần của hệ thống.

Dashboard là trung tâm điều hành.

---

# New Navigation Architecture

## Core Operations

Đây là khu vực quản trị Discord server.

### Overview

Tổng quan hệ thống.

Bao gồm:

* Server Health
* Member Growth
* Command Activity
* Moderation Events
* Economy Snapshot

### Members

Quản lý thành viên.

### Moderation

Ban
Mute
Warn
Logs
Automod

### Commands

Slash Commands
Permissions
Categories

### Economy

Economy
Leveling
Rewards

---

# Integrations

Mỗi hệ thống bên ngoài Discord là một domain riêng.

Không được nhét vào Core Operations.

## Riot Services

Trang riêng.

Bao gồm:

* TFT
* League
* Match Tracking
* Rank Monitoring
* Player Lookup

Sau này:

Valorant

vẫn nằm trong Riot Services.

---

## Music Services

Trang riêng.

Bao gồm:

* Lavalink
* Nodes
* Queues
* Audio Settings
* Playback Config

---

## Reminder Services

Trang riêng.

Bao gồm:

* Scheduled Jobs
* Reminders
* Recurring Tasks
* Event Notifications

---

# Future Rule

Mọi tính năng mới phải trả lời câu hỏi:

"Đây có thuộc vận hành Discord Server không?"

Nếu CÓ:

=> nằm trong Core Operations.

Nếu KHÔNG:

=> tạo domain mới.

Không sửa các trang cũ.

Không thêm tab con vào các trang cũ.

Không mở rộng vô hạn Members, Moderation, Commands.

---

Ví dụ:

Giveaway System

=> Core Operations

Ticket System

=> Core Operations

Verification

=> Core Operations

---

Riot

=> Riot Services

---

Spotify Integration

=> Music Services

---

AI Chat Module

=> AI Services

Trang mới.

---

Steam Tracking

=> Gaming Services

Trang mới.

---

YouTube Notifications

=> Media Services

Trang mới.

---

# UI Philosophy

Không dùng Admin Dashboard.

Không dùng SaaS Template.

Không dùng Generic Cards.

---

Thiết kế theo Command Center.

Cảm hứng:

* Riot Client
* Tactical Operations Console
* Mission Control
* Esports Analytics

---

# Layout

## Left Rail

Rất mỏng.

Chỉ chứa:

* Guild Switcher
* Domain Navigation

---

## Main Canvas

Toàn bộ chiều rộng.

Không chia card đều nhau.

Không grid 4 card.

Ưu tiên:

* Asymmetry
* Large Metrics
* Data Panels

---

# Typography

Không dùng Inter.

Gợi ý:

Display:

* Space Grotesk
* Sora
* Clash Display

Body:

* IBM Plex Sans
* Manrope

---

# Design Tokens

Không hardcode màu.

Toàn bộ thông qua:

tokens/

* color.ts
* spacing.ts
* typography.ts
* motion.ts

---

# Component Architecture

src/

app/

domains/

* core
* riot
* music
* reminder

shared/

* ui
* layouts
* charts
* forms

services/

* api
* auth
* guild

contexts/

---

# Migration Order

Phase 1

Giữ nguyên logic.

Refactor routes thành domain structure.

---

Phase 2

Tạo Design System mới.

Button
Card
Input
Modal
Panel

---

Phase 3

Xây lại Layout Shell.

Sidebar
Top Navigation
Guild Rail

---

Phase 4

Xây lại Overview.

Đây là trang thể hiện toàn bộ identity.

---

Phase 5

Lần lượt migrate:

Members
Moderation
Commands
Economy

---

Phase 6

Tách Riot thành domain độc lập.

---

Phase 7

Tách Music thành domain độc lập.

---

Phase 8

Tách Reminder thành domain độc lập.

---

Nguyên tắc bất biến:

Tính năng mới khác bản chất với quản lý Discord Server = Domain mới.

Không sửa domain cũ.

Không biến sidebar thành bãi rác tính năng.
