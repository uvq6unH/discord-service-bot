import { esc, setDirty } from './utils.js';
import {
  commandSearchEl, commandFilterEl, autoRepliesEl, selfRolesEl, FIELDS,
  groupMap, commandLabels, commandGroupOrder, commandGroupMeta
} from './state.js';

// ── Command helpers ──────────────────────────────────────────────────────────
const groupMap = {
  ping: 'general', help: 'general', custom: 'general', config: 'general',
  user: 'user', avatar: 'user', rank: 'user', leaderboard: 'user',
  balance: 'user', daily: 'user', economyleaderboard: 'user',
  blackjack: 'games', poker: 'games', coinflip: 'games', dice: 'games', slots: 'games',
  server: 'server', say: 'server', purge: 'server', announce: 'server',
  warn: 'moderation', kick: 'moderation', ban: 'moderation', timeout: 'moderation', warnings: 'moderation', clearwarns: 'moderation',
  ecoadd: 'moderation', ecoset: 'moderation', ecoremove: 'moderation',
  ticketpanel: 'interactions', rolepanel: 'interactions',
  lsd: 'lol', lolprofile: 'lol', lolmatch: 'lol', lolchamp: 'lol',
  lolitem: 'lol', lolrunes: 'lol', lolpatch: 'lol', lollink: 'lol', lolunlink: 'lol',
  tftlsd: 'lol', tftprofile: 'lol', tftmatch: 'lol', tftlink: 'lol', tftunlink: 'lol',
};
const commandLabels = {
  custom: 'Custom', ping: 'Ping', help: 'Help', config: 'Config', server: 'Server info',
  user: 'User info', avatar: 'Avatar', say: 'Say', purge: 'Purge', warn: 'Warn',
  kick: 'Kick', ban: 'Ban', timeout: 'Timeout', warnings: 'Warnings', clearwarns: 'Clear warns',
  rank: 'Rank', leaderboard: 'Leaderboard', balance: 'Balance', daily: 'Daily',
  economyleaderboard: 'Economy leaderboard', blackjack: 'Blackjack', poker: 'Poker', coinflip: 'Coinflip', dice: 'Dice', slots: 'Slots',
  ecoadd: 'Eco add', ecoset: 'Eco set', ecoremove: 'Eco remove',
  announce: 'Announce', ticketpanel: 'Ticket panel', rolepanel: 'Role panel',
  lsd: 'Lịch sử đấu', lolprofile: 'Hồ sơ LoL', lolmatch: 'Chi tiết trận',
  lolchamp: 'Thông tin tướng', lolitem: 'Trang bị', lolrunes: 'Bảng ngọc',
  lolpatch: 'Phiên bản', lollink: 'Liên kết tài khoản', lolunlink: 'Bỏ liên kết',
  tftlsd: 'Lịch sử TFT', tftprofile: 'Hồ sơ TFT', tftmatch: 'Chi tiết TFT',
  tftlink: 'Liên kết TFT', tftunlink: 'Bỏ liên kết TFT',
};

const commandGroupOrder = ['general', 'user', 'server', 'moderation', 'interactions', 'games', 'lol'];
const commandGroupMeta = {
  general: {
    title: 'Lệnh chung',
    hint: 'Ping, help, config và custom command',
    icon: 'ti ti-terminal-2',
    tone: 'blue',
  },
  user: {
    title: 'Người dùng & XP',
    hint: 'Thông tin người dùng, rank, daily và economy',
    icon: 'ti ti-award',
    tone: 'green',
  },
  server: {
    title: 'Máy chủ & Thông báo',
    hint: 'Lệnh server, purge, say và announce',
    icon: 'ti ti-speakerphone',
    tone: 'amber',
  },
  moderation: {
    title: 'Moderation & AutoMod',
    hint: 'Warn, kick, ban, timeout và kiểm duyệt',
    icon: 'ti ti-shield-check',
    tone: 'red',
  },
  interactions: {
    title: 'Ticket & Roles',
    hint: 'Ticket panel và role panel',
    icon: 'ti ti-ticket',
    tone: 'teal',
  },
  games: {
    title: '🎮 Trò Chơi',
    hint: 'Blackjack, Poker, Coinflip, Dice, Slots',
    icon: 'ti ti-cards',
    tone: 'purple',
  },
  lol: {
    title: '⚔️ LoL & TFT',
    hint: 'Lịch sử đấu, hồ sơ, tướng, trang bị, bảng ngọc · TFT match history, profile',
    icon: 'ti ti-sword',
    tone: 'orange',
  },
};

export function getCommandGroup(type) {
  return groupMap[String(type ?? '').toLowerCase()] ?? 'general';
}

export function getCommandGroupFromHash() {
  const match = /^#commands\/([a-z-]+)$/.exec(window.location.hash);
  const group = match?.[1];
  return commandGroupOrder.includes(group) ? group : '';
}

export function ensureCommandSections() {
  const host = document.querySelector('#command-sections');
  if (!host) return null;

  if (host.dataset.ready === '1') {
    return host;
  }

  host.replaceChildren();
  const nav = document.createElement('div');
  nav.className = 'command-section-grid';
  const panel = document.createElement('div');
  panel.className = 'command-panel';
  panel.innerHTML = `
    <div class="command-panel-head">
      <button type="button" id="commandBackBtn" class="btn btn-secondary btn-xs command-back-btn">
        <i class="ti ti-arrow-left"></i> Nhóm lệnh
      </button>
      <div>
        <h3 id="commandPanelTitle">Lệnh chung</h3>
        <p id="commandPanelHint">Ping, help, config và custom command</p>
      </div>
      <span id="commandPanelCount" class="command-panel-count">0 lệnh</span>
    </div>
  `;
  const panelBody = document.createElement('div');
  panelBody.className = 'command-panel-body';
  panel.querySelector('#commandBackBtn')?.addEventListener('click', () => {
    showCommandSections();
  });

  for (const group of commandGroupOrder) {
    const meta = commandGroupMeta[group];
    const section = document.createElement('div');
    section.role = 'button';
    section.tabIndex = 0;
    section.className = 'command-section';
    section.dataset.commandGroup = group;
    section.dataset.open = 'false';
    section.innerHTML = `
      <div class="command-section-icon ${meta.tone}">
        <i class="${meta.icon}"></i>
      </div>
      <div class="command-section-title">
        <strong>${meta.title}</strong>
        <span>${meta.hint}</span>
      </div>
      <div class="command-section-meta">
        <span class="command-section-count">0</span>
        <i class="ti ti-chevron-right"></i>
      </div>
      <div class="command-section-action">
        <button type="button" class="command-group-action" title="Bật/tắt toàn bộ lệnh trong nhóm">
          <i class="ti ti-power"></i>
          <span class="command-action-label">Enable</span>
        </button>
      </div>
    `;

    section.addEventListener('click', (event) => {
      activateCommandSection(group);
    });
    section.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activateCommandSection(group);
    });
    section.querySelector('.command-group-action')?.addEventListener('click', (event) => {
      event.stopPropagation();
      setCommandGroupEnabled(group, !isCommandGroupFullyEnabled(group));
    });

    const list = document.createElement('div');
    list.className = 'command-list';
    list.dataset.commandGroup = group;
    list.hidden = true;

    nav.append(section);
    panelBody.append(list);
  }

  panel.append(panelBody);
  host.append(nav, panel);
  host.dataset.ready = '1';
  return host;
}

export function activateCommandSection(group, { forceOpen = true, updateHash = true } = {}) {
  const host = document.querySelector('#command-sections');
  if (host) {
    host.dataset.view = forceOpen ? 'detail' : 'sections';
  }
  if (forceOpen && updateHash && window.location.hash !== `#commands/${group}`) {
    window.history.replaceState(null, '', `#commands/${group}`);
  }
  for (const section of document.querySelectorAll('.command-section')) {
    const isTarget = section.dataset.commandGroup === group;
    section.dataset.open = isTarget && forceOpen ? 'true' : 'false';
    updateCommandSectionState(section);
  }

  for (const list of document.querySelectorAll('.command-list[data-command-group]')) {
    list.hidden = !(list.dataset.commandGroup === group && forceOpen);
  }

  updateCommandPanelMeta(group);
}

export function showCommandSections({ updateHash = true } = {}) {
  const host = document.querySelector('#command-sections');
  if (host) host.dataset.view = 'sections';
  if (updateHash && window.location.hash.startsWith('#commands/')) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  for (const section of document.querySelectorAll('.command-section')) {
    section.dataset.open = 'false';
    updateCommandSectionState(section);
  }
  for (const list of document.querySelectorAll('.command-list[data-command-group]')) {
    list.hidden = true;
  }
}

export function isCommandGroupFullyEnabled(group) {
  const rows = [...document.querySelectorAll(`.command-list[data-command-group="${group}"] .command-item`)];
  return rows.length > 0 && rows.every((row) => row.querySelector('.command-enabled')?.checked);
}

export function setCommandGroupEnabled(group, enabled) {
  const rows = document.querySelectorAll(`.command-list[data-command-group="${group}"] .command-item`);
  for (const row of rows) {
    const checkbox = row.querySelector('.command-enabled');
    if (!checkbox) continue;
    checkbox.checked = enabled;
    row.dataset.commandEnabled = enabled ? 'enabled' : 'disabled';
  }
  setDirty();
  applyCommandFilter();
}

export function updateCommandPanelMeta(group) {
  const meta = commandGroupMeta[group] ?? commandGroupMeta.general;
  const title = document.querySelector('#commandPanelTitle');
  const hint = document.querySelector('#commandPanelHint');
  const count = document.querySelector('#commandPanelCount');
  const activeRows = document.querySelectorAll(`.command-list[data-command-group="${group}"] .command-item`);
  const visibleRows = [...activeRows].filter((row) => row.style.display !== 'none');
  if (title) title.textContent = meta.title;
  if (hint) hint.textContent = meta.hint;
  if (count) count.textContent = `${visibleRows.length}/${activeRows.length} lệnh`;

  updateCommandGroupAction(group);
}

export function updateCommandGroupAction(group) {
  const section = document.querySelector(`.command-section[data-command-group="${group}"]`);
  const action = section?.querySelector('.command-group-action');
  const activeRows = document.querySelectorAll(`.command-list[data-command-group="${group}"] .command-item`);
  const enabledRows = [...activeRows].filter((row) => row.querySelector('.command-enabled')?.checked);
  if (action) {
    const isAllEnabled = activeRows.length > 0 && enabledRows.length === activeRows.length;
    const hasAnyEnabled = enabledRows.length > 0;
    const label = isAllEnabled ? 'Disable' : 'Enable';
    action.dataset.state = isAllEnabled ? 'enabled' : hasAnyEnabled ? 'mixed' : 'disabled';
    action.title = isAllEnabled ? 'Tắt toàn bộ lệnh trong nhóm' : 'Bật toàn bộ lệnh trong nhóm';
    action.querySelector('.command-action-label').textContent = label;
  }
}

export function getCommandListContainer(type) {
  ensureCommandSections();
  const group = getCommandGroup(type);
  return document.querySelector(`.command-list[data-command-group="${group}"]`);
}

export function updateCommandSectionState(section) {
  const icon = section.querySelector('.command-section-meta i');
  const open = section.dataset.open === 'true';
  if (icon) icon.classList.toggle('is-open', open);
}

export function addCommandRow(cmd = { enabled: true, type: 'custom', name: '', description: '', response: '', allowedRoles: [] }) {
  const container = getCommandListContainer(cmd.type);
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'command-item';
  row.dataset.commandGroup = getCommandGroup(cmd.type);
  row.dataset.commandType = cmd.type;
  row.dataset.commandEnabled = cmd.enabled !== false ? 'enabled' : 'disabled';

  const isCustom = cmd.type === 'custom';
  const badgeClass = isCustom ? 'custom' : 'system';
  const label = commandLabels[cmd.type] || cmd.type;

  row.innerHTML = `
    <div class="command-top">
      <div class="command-title-group">
        <span class="command-badge ${badgeClass}">${label}</span>
        <span class="command-name-pill">${esc(cmd.name || 'chưa đặt tên')}</span>
        <label class="toggle command-enabled-toggle" title="Bật/tắt lệnh">
          <input type="checkbox" class="command-enabled" ${cmd.enabled !== false ? 'checked' : ''}>
          <span class="toggle-track sm"></span>
        </label>
      </div>
      <div class="command-actions">
        ${isCustom ? '<button class="btn btn-xs btn-danger remove-cmd" type="button">Xóa</button>' : ''}
      </div>
    </div>
    <div class="command-fields">
      <div><label>Tên lệnh</label><input class="command-name" value="${esc(cmd.name)}" placeholder="tên-lệnh" /></div>
      <div><label>Mô tả</label><input class="command-description" value="${esc(cmd.description)}" placeholder="Mô tả ngắn..." /></div>
      <div class="command-response-wrap"><label>Phản hồi</label><textarea class="command-response" rows="2">${esc(cmd.response)}</textarea></div>
      <div class="command-roles-wrap">
        <div class="command-roles-head">
          <label>Quyền dùng lệnh</label>
          <span class="command-roles-count">Tất cả role</span>
        </div>
        <div class="roles-checkbox-grid"></div>
      </div>
    </div>`;

  const grid = row.querySelector('.roles-checkbox-grid');
  const rolesCount = row.querySelector('.command-roles-count');
  const roles = (window.currentGuildData?.roles ?? []).filter(r => r.name !== '@everyone');
  const updateRolesCount = () => {
    const checked = row.querySelectorAll('.command-role-chk:checked').length;
    if (rolesCount) rolesCount.textContent = checked ? `${checked} role được phép` : 'Tất cả role';
  };
  if (roles.length === 0) {
    grid.innerHTML = '<span class="no-roles-hint">Tải cấu hình server để hiển thị vai trò.</span>';
  } else {
    for (const r of roles) {
      const lbl = document.createElement('label');
      lbl.className = 'role-checkbox-label';
      lbl.title = r.name;
      const roleColor = r.color || '#8b95a6';
      // Background is a very faint tint of the role color
      lbl.style.color = roleColor;
      lbl.style.background = roleColor + '22'; // 13% opacity hex
      lbl.style.borderColor = roleColor + '55'; // 33% opacity

      const chk = document.createElement('input');
      chk.type = 'checkbox'; chk.className = 'command-role-chk'; chk.value = r.id;
      const isChecked = Array.isArray(cmd.allowedRoles) && cmd.allowedRoles.includes(r.id);
      chk.checked = isChecked;
      if (isChecked) lbl.classList.add('checked');

      // Toggle checked class for border highlight
      chk.addEventListener('change', () => {
        lbl.classList.toggle('checked', chk.checked);
        updateRolesCount();
      });

      lbl.append(chk, document.createTextNode(r.name));
      grid.append(lbl);
    }
  }
  updateRolesCount();

  row.querySelector('.remove-cmd')?.addEventListener('click', () => { row.remove(); setDirty(); });
  row.querySelector('.command-enabled')?.addEventListener('change', (event) => {
    row.dataset.commandEnabled = event.target.checked ? 'enabled' : 'disabled';
    applyCommandFilter();
  });
  const nameInput = row.querySelector('.command-name');
  const namePill = row.querySelector('.command-name-pill');
  const syncNamePill = () => {
    if (namePill && nameInput) {
      namePill.textContent = nameInput.value.trim() || 'chưa đặt tên';
    }
  };
  nameInput?.addEventListener('input', syncNamePill);
  syncNamePill();
  row.addEventListener('input', () => { setDirty(); applyCommandFilter(); });
  row.addEventListener('change', setDirty);
  container.append(row);
  applyCommandFilter();

  if (cmd.type === 'custom' && !cmd.name) {
    const group = getCommandGroup(cmd.type);
    activateCommandSection(group);
  }
}

export function readCommands() {
  return [...document.querySelectorAll('.command-item')].map(row => ({
    enabled: row.querySelector('.command-enabled').checked,
    type: row.dataset.commandType || 'custom',
    name: row.querySelector('.command-name').value.trim(),
    description: row.querySelector('.command-description').value.trim(),
    response: row.querySelector('.command-response').value.trim(),
    allowedRoles: [...row.querySelectorAll('.command-role-chk:checked')].map(c => c.value),
  })).filter(c => c.name && c.response);
}

export function applyCommandFilter() {
  const query = commandSearchEl?.value.trim().toLowerCase() ?? '';
  const filter = commandFilterEl?.value ?? 'all';
  const shouldAutoOpen = Boolean(query || filter !== 'all');
  let firstVisibleGroup = null;

  for (const section of document.querySelectorAll('.command-section')) {
    const group = section.dataset.commandGroup;
    const list = document.querySelector(`.command-list[data-command-group="${group}"]`);
    const rows = [...(list?.querySelectorAll('.command-item') ?? [])];
    let visibleCount = 0;

    for (const row of rows) {
      const name = row.querySelector('.command-name')?.value.toLowerCase() ?? '';
      const description = row.querySelector('.command-description')?.value.toLowerCase() ?? '';
      const type = row.dataset.commandType ?? 'custom';
      const enabled = row.querySelector('.command-enabled')?.checked ?? false;
      const textMatches = !query || [name, description, type].some((value) => value.includes(query));
      const filterMatches =
        filter === 'all' ||
        (filter === 'enabled' && enabled) ||
        (filter === 'disabled' && !enabled) ||
        (filter === 'custom' && type === 'custom') ||
        (filter === 'system' && type !== 'custom');

      const isVisible = textMatches && filterMatches;
      row.style.display = isVisible ? '' : 'none';
      if (isVisible) visibleCount += 1;
    }

    const countEl = section.querySelector('.command-section-count');
    const icon = section.querySelector('.command-section-meta i');
    if (countEl) {
      const total = rows.length;
      countEl.textContent = shouldAutoOpen ? `${visibleCount}/${total}` : String(total);
    }
    updateCommandGroupAction(group);

    section.hidden = visibleCount === 0;
    if (visibleCount === 0) {
      if (icon) icon.classList.remove('is-open');
      section.dataset.open = 'false';
      if (list) list.hidden = true;
      continue;
    }

    if (!firstVisibleGroup) {
      firstVisibleGroup = group;
    }
    if (!shouldAutoOpen) {
      const isDetailView = document.querySelector('#command-sections')?.dataset.view === 'detail';
      const isActive = isDetailView && section.dataset.open === 'true';
      section.dataset.open = isActive ? 'true' : 'false';
      if (list) list.hidden = !isActive;
      updateCommandSectionState(section);
    }
  }

  if (shouldAutoOpen && firstVisibleGroup) {
    activateCommandSection(firstVisibleGroup);
  } else {
    const active = document.querySelector('.command-section[data-open="true"]');
    if (active) updateCommandPanelMeta(active.dataset.commandGroup);
  }
}
