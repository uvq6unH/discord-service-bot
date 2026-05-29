// ── Auth check ──────────────────────────────────────────────────────────────
const me = await fetch('/auth/me').then(r => r.json()).catch(() => ({ loggedIn: false }));
if (!me.loggedIn) { location.href = '/login.html'; }

const userAvatar = document.querySelector('#userAvatar');
const userName = document.querySelector('#userName');
if (userAvatar && me.avatar) userAvatar.src = `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64`;
if (userName) userName.textContent = me.username;

// Intercept 401s
const _fetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const res = await _fetch(...args);
  if (res.status === 401) location.href = '/login.html';
  return res;
};

// ── State ───────────────────────────────────────────────────────────────────
let isDirty = false;
let currentGuildId = null;
window.currentGuildData = { channels: [], roles: [] };

// ── DOM refs ────────────────────────────────────────────────────────────────
const configForm = document.querySelector('#configForm');
const emptyState = document.querySelector('#emptyState');
const saveBar = document.querySelector('#saveBar');
const saveMsg = document.querySelector('#saveMsg');
const saveBtnBar = document.querySelector('#saveBtnBar');
const statusDot = document.querySelector('.status-dot');
const statusText = document.querySelector('#statusText');
const guildNameEl = document.querySelector('#guildName');
const guildMetaEl = document.querySelector('#guildMeta');
const guildIconEl = document.querySelector('#guildIcon');
const mobileGuildNameEl = document.querySelector('#mobileGuildName');
const mobileGuildMetaEl = document.querySelector('#mobileGuildMeta');
const mobilePageSelect = document.querySelector('#mobilePageSelect');
const pageTitle = document.querySelector('#pageTitle');
const accessBanner = document.querySelector('#accessBanner');
const accessBannerMsg = document.querySelector('#accessBannerMsg');
const serverList = document.querySelector('#serverList');
const autoRepliesEl = document.querySelector('#autoReplies');
const selfRolesEl = document.querySelector('#selfRoles');
const commandSearchEl = document.querySelector('#commandSearch');
const commandFilterEl = document.querySelector('#commandFilter');

const navItems = [...document.querySelectorAll('.nav-item')];
const pages = [...document.querySelectorAll('.page')];

const pageTitles = {
  overview: 'Dashboard',
  'commands-general': 'Lệnh & Custom',
  'user-levels': 'Cấp độ & XP',
  economy: 'Tiền ảo',
  'auto-replies': 'Tự động trả lời',
  'moderation-automod': 'Kiểm duyệt',
  'server-broadcast': 'Thông báo',
  interactions: 'Ticket & Roles',
  advanced: 'Nâng cao',
};

const pageOrder = [
  'overview',
  'commands-general',
  'user-levels',
  'economy',
  'auto-replies',
  'moderation-automod',
  'server-broadcast',
  'interactions',
  'advanced',
];

// ── Fields list ─────────────────────────────────────────────────────────────
const FIELDS = [
  'enabled', 'prefix', 'logChannelId',
  'moderationEnabled', 'autoModEnabled', 'deleteBlockedMessages', 'antiLinkEnabled', 'blockedMessage',
  'rolesEnabled', 'autoRoleId', 'selfRolePanelTitle', 'selfRolePanelMessage',
  'ticketsEnabled', 'ticketCategoryId', 'ticketLogChannelId', 'ticketPanelTitle', 'ticketPanelMessage',
  'levelsEnabled', 'xpPerMessage', 'levelUpMessage',
  'economyEnabled', 'currencySilverName', 'currencySilverIcon', 'currencyGoldName', 'currencyGoldIcon',
  'currencyDiamondName', 'currencyDiamondIcon', 'dailyEnabled', 'dailyCooldownHours', 'dailySilverAmount',
  'dailyGoldAmount', 'dailyDiamondAmount', 'blackjackEnabled', 'blackjackMinBet', 'blackjackMaxBet',
  'announcementsEnabled', 'announcementChannelId', 'announcementMention',
  'welcomeEnabled', 'welcomeChannelId', 'welcomeMessage',
  'autoReplyEnabled',
];

// ── Command helpers ──────────────────────────────────────────────────────────
const groupMap = {
  ping: 'general', help: 'general', custom: 'general', config: 'general',
  user: 'user', avatar: 'user', rank: 'user', leaderboard: 'user',
  balance: 'user', daily: 'user', economyleaderboard: 'user', blackjack: 'user',
  server: 'server', say: 'server', purge: 'server', announce: 'server',
  warn: 'moderation', kick: 'moderation', ban: 'moderation', timeout: 'moderation', warnings: 'moderation', clearwarns: 'moderation',
  ecoadd: 'moderation', ecoset: 'moderation', ecoremove: 'moderation',
  ticketpanel: 'interactions', rolepanel: 'interactions',
};
const commandLabels = {
  custom: 'Custom', ping: 'Ping', help: 'Help', config: 'Config', server: 'Server info',
  user: 'User info', avatar: 'Avatar', say: 'Say', purge: 'Purge', warn: 'Warn',
  kick: 'Kick', ban: 'Ban', timeout: 'Timeout', warnings: 'Warnings', clearwarns: 'Clear warns',
  rank: 'Rank', leaderboard: 'Leaderboard', balance: 'Balance', daily: 'Daily',
  economyleaderboard: 'Economy leaderboard', blackjack: 'Blackjack',
  ecoadd: 'Eco add', ecoset: 'Eco set', ecoremove: 'Eco remove',
  announce: 'Announce', ticketpanel: 'Ticket panel', rolepanel: 'Role panel',
};

const commandGroupOrder = ['general', 'user', 'server', 'moderation', 'interactions'];
const commandGroupMeta = {
  general: {
    title: 'Lệnh chung',
    hint: 'Ping, help, config và custom command',
  },
  user: {
    title: 'Người dùng & XP',
    hint: 'Thông tin người dùng, rank, daily và economy',
  },
  server: {
    title: 'Máy chủ & Thông báo',
    hint: 'Lệnh server, purge, say và announce',
  },
  moderation: {
    title: 'Moderation & AutoMod',
    hint: 'Warn, kick, ban, timeout và kiểm duyệt',
  },
  interactions: {
    title: 'Ticket & Roles',
    hint: 'Ticket panel và role panel',
  },
};

function getCommandGroup(type) {
  return groupMap[String(type ?? '').toLowerCase()] ?? 'general';
}

function ensureCommandSections() {
  const host = document.querySelector('#command-sections');
  if (!host) return null;

  if (host.dataset.ready === '1') {
    return host;
  }

  host.replaceChildren();

  for (const group of commandGroupOrder) {
    const meta = commandGroupMeta[group];
    const section = document.createElement('section');
    section.className = 'command-section';
    section.dataset.commandGroup = group;
    section.dataset.open = 'false';
    section.innerHTML = `
      <button type="button" class="command-section-head">
        <div class="command-section-title">
          <strong>${meta.title}</strong>
          <span>${meta.hint}</span>
        </div>
        <div class="command-section-meta">
          <span class="command-section-count">0</span>
          <i class="ti ti-chevron-down"></i>
        </div>
      </button>
      <div class="command-section-body" hidden>
        <div class="command-list" data-command-group="${group}"></div>
      </div>
    `;

    section.querySelector('.command-section-head')?.addEventListener('click', () => {
      const open = section.dataset.open === 'true';
      section.dataset.open = open ? 'false' : 'true';
      updateCommandSectionState(section);
    });

    host.append(section);
  }

  host.dataset.ready = '1';
  return host;
}

function getCommandListContainer(type) {
  ensureCommandSections();
  const group = getCommandGroup(type);
  return document.querySelector(`.command-list[data-command-group="${group}"]`);
}

function updateCommandSectionState(section) {
  const body = section.querySelector('.command-section-body');
  const icon = section.querySelector('.command-section-meta i');
  const open = section.dataset.open === 'true';
  if (body) body.hidden = !open;
  if (icon) icon.classList.toggle('is-open', open);
}

function addCommandRow(cmd = { enabled: true, type: 'custom', name: '', description: '', response: '', allowedRoles: [] }) {
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
        <label>Vai trò được dùng lệnh (trống = tất cả)</label>
        <div class="roles-checkbox-grid"></div>
      </div>
    </div>`;

  const grid = row.querySelector('.roles-checkbox-grid');
  const roles = (window.currentGuildData?.roles ?? []).filter(r => r.name !== '@everyone');
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
      chk.addEventListener('change', () => lbl.classList.toggle('checked', chk.checked));

      lbl.append(chk, document.createTextNode(r.name));
      grid.append(lbl);
    }
  }

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
    const section = container.closest('.command-section');
    if (section) {
      section.dataset.open = 'true';
      updateCommandSectionState(section);
    }
  }
}

function readCommands() {
  return [...document.querySelectorAll('.command-item')].map(row => ({
    enabled: row.querySelector('.command-enabled').checked,
    type: row.dataset.commandType || 'custom',
    name: row.querySelector('.command-name').value.trim(),
    description: row.querySelector('.command-description').value.trim(),
    response: row.querySelector('.command-response').value.trim(),
    allowedRoles: [...row.querySelectorAll('.command-role-chk:checked')].map(c => c.value),
  })).filter(c => c.name && c.response);
}

function applyCommandFilter() {
  const query = commandSearchEl?.value.trim().toLowerCase() ?? '';
  const filter = commandFilterEl?.value ?? 'all';
  const shouldAutoOpen = Boolean(query || filter !== 'all');

  for (const section of document.querySelectorAll('.command-section')) {
    const rows = [...section.querySelectorAll('.command-item')];
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

    section.hidden = visibleCount === 0;
    if (visibleCount === 0) {
      const body = section.querySelector('.command-section-body');
      if (body) body.hidden = true;
      if (icon) icon.classList.remove('is-open');
      continue;
    }

    if (shouldAutoOpen) {
      const body = section.querySelector('.command-section-body');
      if (body) body.hidden = false;
      if (icon) icon.classList.add('is-open');
    } else {
      updateCommandSectionState(section);
    }
  }
}

// ── Reply helpers ────────────────────────────────────────────────────────────
function addReplyRow(reply = { keyword: '', response: '' }) {
  const row = document.createElement('div');
  row.className = 'reply-item';
  row.innerHTML = `
    <div><label>Từ khóa</label><input class="reply-keyword" value="${esc(reply.keyword)}" placeholder="xin chào" /></div>
    <div><label>Phản hồi</label><input class="reply-response" value="${esc(reply.response)}" placeholder="Chào bạn!" /></div>
    <button class="btn btn-xs btn-danger remove-reply" type="button" style="align-self:flex-end">Xóa</button>`;
  row.querySelector('.remove-reply').addEventListener('click', () => { row.remove(); setDirty(); });
  row.addEventListener('input', setDirty);
  autoRepliesEl.append(row);
}

function readAutoReplies() {
  return [...autoRepliesEl.querySelectorAll('.reply-item')].map(row => ({
    keyword: row.querySelector('.reply-keyword').value.trim(),
    response: row.querySelector('.reply-response').value.trim(),
  })).filter(r => r.keyword && r.response);
}

// ── SelfRole helpers ─────────────────────────────────────────────────────────
function addSelfRoleRow(role = { label: '', roleId: '' }) {
  const row = document.createElement('div');
  row.className = 'reply-item';
  const select = document.createElement('select');
  select.className = 'self-role-id';
  const blank = document.createElement('option'); blank.value = ''; blank.textContent = '-- Chọn role --';
  select.append(blank);
  for (const r of (window.currentGuildData?.roles ?? []).filter(r => r.name !== '@everyone')) {
    const opt = document.createElement('option');
    opt.value = r.id; opt.textContent = r.name;
    if (r.id === role.roleId) opt.selected = true;
    select.append(opt);
  }
  if (role.roleId && !(window.currentGuildData?.roles ?? []).some(r => r.id === role.roleId)) {
    const opt = document.createElement('option'); opt.value = role.roleId; opt.textContent = `ID: ${role.roleId}`; opt.selected = true;
    select.append(opt);
  }
  const labelWrap = document.createElement('div');
  labelWrap.innerHTML = `<label>Label nút</label><input class="self-role-label" value="${esc(role.label)}" placeholder="Coder" />`;
  const roleWrap = document.createElement('div');
  roleWrap.innerHTML = '<label>Vai trò</label>';
  roleWrap.append(select);
  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn btn-xs btn-danger'; removeBtn.type = 'button'; removeBtn.textContent = 'Xóa';
  removeBtn.style.alignSelf = 'flex-end';
  removeBtn.addEventListener('click', () => { row.remove(); setDirty(); });
  row.append(labelWrap, roleWrap, removeBtn);
  row.addEventListener('input', setDirty);
  row.addEventListener('change', setDirty);
  selfRolesEl.append(row);
}

function readSelfRoles() {
  return [...selfRolesEl.querySelectorAll('.reply-item')].map(row => ({
    label: row.querySelector('.self-role-label').value.trim(),
    roleId: row.querySelector('.self-role-id').value.trim(),
  })).filter(r => r.label && r.roleId);
}

// ── Fill / read form ─────────────────────────────────────────────────────────
function fillForm(config) {
  for (const f of FIELDS) {
    const el = document.querySelector(`#${f}`);
    if (!el) continue;
    el.type === 'checkbox' ? (el.checked = Boolean(config[f])) : (el.value = config[f] ?? '');
  }
  const bwEl = document.querySelector('#badWords');
  if (bwEl) bwEl.value = (config.badWords ?? []).join('\n');

  ensureCommandSections();
  for (const section of document.querySelectorAll('.command-section')) {
    section.dataset.open = 'false';
    updateCommandSectionState(section);
  }
  for (const list of document.querySelectorAll('.command-list')) list.replaceChildren();
  for (const cmd of config.commands ?? []) addCommandRow(cmd);

  autoRepliesEl.replaceChildren();
  for (const r of config.autoReplies ?? []) addReplyRow(r);

  selfRolesEl.replaceChildren();
  for (const r of config.selfRoles ?? []) addSelfRoleRow(r);

  // Stats
  const enabledCmds = (config.commands ?? []).filter(c => c.enabled).length;
  document.querySelector('#statCmds').textContent = enabledCmds;
  updateModuleSummary(config, enabledCmds);
  applyCommandFilter();
  setDirty(false);
}

function setModuleStatus(id, active, detail = '') {
  const el = document.querySelector(`#${id}`);
  if (!el) return;
  el.textContent = active ? (detail || 'On') : 'Off';
  el.classList.toggle('on', Boolean(active));
}

function updateModuleSummary(config, enabledCmds) {
  setModuleStatus('moduleCommands', enabledCmds > 0, String(enabledCmds));
  setModuleStatus('moduleModeration', config.moderationEnabled || config.autoModEnabled, config.autoModEnabled ? 'AutoMod' : 'On');
  setModuleStatus('moduleTickets', config.ticketsEnabled);
  setModuleStatus('moduleRoles', config.rolesEnabled || Boolean(config.autoRoleId), config.selfRoles?.length ? `${config.selfRoles.length}` : 'On');
  setModuleStatus('moduleLevels', config.levelsEnabled);
  setModuleStatus('moduleEconomy', config.economyEnabled, config.blackjackEnabled ? 'Cards' : 'On');
  setModuleStatus('moduleAutoReplies', config.autoReplyEnabled, config.autoReplies?.length ? `${config.autoReplies.length}` : 'On');
}

function readForm() {
  const payload = { guildId: currentGuildId, commands: readCommands(), autoReplies: readAutoReplies(), selfRoles: readSelfRoles() };
  const bwEl = document.querySelector('#badWords');
  payload.badWords = bwEl ? bwEl.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
  for (const f of FIELDS) {
    const el = document.querySelector(`#${f}`);
    if (el) payload[f] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return payload;
}

// ── Dirty state ──────────────────────────────────────────────────────────────
function setDirty(value = true) {
  isDirty = value;
  saveBar.style.display = isDirty ? 'flex' : 'none';
  if (isDirty) { saveMsg.textContent = 'Có thay đổi chưa lưu'; saveMsg.className = ''; }
}

function showMsg(text, isError = false) {
  saveMsg.textContent = text;
  saveMsg.className = isError ? 'error' : 'success';
  saveBar.style.display = 'flex';
}

// ── Navigation ───────────────────────────────────────────────────────────────
function showPage(name) {
  for (const item of navItems) item.classList.toggle('active', item.dataset.page === name);
  for (const page of pages) page.classList.toggle('active', page.dataset.pagePanel === name);
  if (pageTitle) pageTitle.textContent = pageTitles[name] || name;
  if (mobilePageSelect && mobilePageSelect.value !== name) mobilePageSelect.value = name;
}

for (const item of navItems) {
  item.addEventListener('click', () => showPage(item.dataset.page));
}

if (mobilePageSelect) {
  for (const pageName of pageOrder) {
    const option = document.createElement('option');
    option.value = pageName;
    option.textContent = pageTitles[pageName] || pageName;
    mobilePageSelect.append(option);
  }
  mobilePageSelect.addEventListener('change', () => showPage(mobilePageSelect.value));
}

for (const button of document.querySelectorAll('[data-page-jump]')) {
  button.addEventListener('click', () => showPage(button.dataset.pageJump));
}

// ── Load guild data ──────────────────────────────────────────────────────────
async function fetchGuildData(guildId) {
  try {
    const res = await fetch(`/api/guild-data?guildId=${encodeURIComponent(guildId)}`);
    window.currentGuildData = res.ok ? await res.json() : { channels: [], roles: [] };
  } catch { window.currentGuildData = { channels: [], roles: [] }; }
}

function populateDropdowns() {
  const text = (window.currentGuildData?.channels ?? []).filter(c => c.type === 0 || c.type === 5);
  const cats = (window.currentGuildData?.channels ?? []).filter(c => c.type === 4);
  const roles = (window.currentGuildData?.roles ?? []).filter(r => r.name !== '@everyone');

  const fill = (id, items, ph) => {
    const el = document.querySelector(`#${id}`); if (!el) return;
    const cur = el.value;
    el.replaceChildren();
    const def = document.createElement('option'); def.value = ''; def.textContent = ph; el.append(def);
    for (const item of items) {
      const opt = document.createElement('option'); opt.value = item.id; opt.textContent = item.name;
      if (item.id === cur) opt.selected = true;
      el.append(opt);
    }
  };
  fill('welcomeChannelId', text, '-- Chọn kênh --');
  fill('announcementChannelId', text, '-- Chọn kênh --');
  fill('ticketLogChannelId', text, '-- Chọn kênh --');
  fill('logChannelId', text, '-- Không log --');
  fill('ticketCategoryId', cats, '-- Chọn danh mục --');
  fill('autoRoleId', roles, '-- Không gán tự động --');
}

// ── Select guild ─────────────────────────────────────────────────────────────
async function selectGuild(guild) {
  currentGuildId = guild.id;
  guildNameEl.textContent = guild.name;
  guildMetaEl.textContent = guild.id;
  if (mobileGuildNameEl) mobileGuildNameEl.textContent = guild.name;
  if (mobileGuildMetaEl) mobileGuildMetaEl.textContent = guild.id;
  if (guildIconEl) {
    guildIconEl.src = guild.icon || '';
    guildIconEl.style.display = guild.icon ? 'block' : 'none';
  }

  emptyState.style.display = 'none';
  accessBanner.style.display = 'none';
  configForm.style.display = 'block';
  saveBar.style.display = 'none';

  await fetchGuildData(guild.id);
  populateDropdowns();

  const res = await fetch(`/api/config?guildId=${encodeURIComponent(guild.id)}`);
  if (res.status === 403) {
    const data = await res.json();
    configForm.style.display = 'none';
    accessBanner.style.display = 'flex';
    accessBannerMsg.textContent = data.error || 'Bạn không có quyền cấu hình server này.';
    return;
  }
  const config = await res.json();
  fillForm(config);

  // Stats
  const state = await fetch(`/api/state?guildId=${encodeURIComponent(guild.id)}`).then(r => r.json()).catch(() => ({}));
  document.querySelector('#statWarns').textContent = state.warnings ?? 0;
  document.querySelector('#statRanked').textContent = state.rankedUsers ?? 0;
}

// ── Load server list ─────────────────────────────────────────────────────────
async function loadServers() {
  const res = await fetch('/api/guilds');
  const { guilds = [] } = await res.json();

  serverList.replaceChildren();
  document.querySelector('#statGuilds').textContent = guilds.length;

  for (const g of guilds) {
    const btn = document.createElement('button');
    btn.className = 'server-btn';
    btn.title = g.name;
    if (g.icon) {
      const img = document.createElement('img'); img.src = g.icon; img.alt = g.name;
      btn.append(img);
    } else {
      btn.textContent = g.name.slice(0, 2).toUpperCase();
    }
    btn.addEventListener('click', () => {
      document.querySelectorAll('.server-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectGuild(g);
    });
    serverList.append(btn);
  }

  // Auto-select first configured guild
  const first = guilds.find(g => g.configured) ?? guilds[0];
  if (first) {
    serverList.querySelector('.server-btn')?.click();
  }
}

// ── Bot status ───────────────────────────────────────────────────────────────
async function refreshStatus() {
  const data = await fetch('/api/status').then(r => r.json()).catch(() => ({}));
  if (data.botReady) {
    statusDot.classList.add('online');
    statusText.textContent = data.botUser ?? 'Online';
  } else {
    statusDot.classList.remove('online');
    statusText.textContent = 'Đang khởi động...';
  }
}

// ── Save ─────────────────────────────────────────────────────────────────────
async function saveConfig() {
  if (!currentGuildId) return;
  const payload = readForm();
  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const config = await res.json();
  if (!res.ok) { showMsg(config.error ?? 'Lỗi khi lưu.', true); return; }
  fillForm(config);
  const slash = config.slashSync?.synced ? ` Đồng bộ ${config.slashSync.count} slash commands.` : '';
  showMsg('Đã lưu thành công.' + slash, false);
  setDirty(false);
}

async function syncSlash() {
  if (!currentGuildId) return;
  const res = await fetch('/api/slash-sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId: currentGuildId }),
  });
  const r = await res.json();
  showMsg(r.synced ? `Đồng bộ thành công ${r.count} lệnh.` : `Lỗi: ${r.reason ?? r.error}`, !r.synced);
}

// ── Listeners ────────────────────────────────────────────────────────────────
saveBtnBar.addEventListener('click', saveConfig);
document.querySelector('#addCommandBtn')?.addEventListener('click', () => { addCommandRow(); setDirty(); });
document.querySelector('#addReplyBtn')?.addEventListener('click', () => { addReplyRow(); setDirty(); });
document.querySelector('#addSelfRoleBtn')?.addEventListener('click', () => { addSelfRoleRow(); setDirty(); });
document.querySelector('#syncSlashBtn')?.addEventListener('click', syncSlash);
commandSearchEl?.addEventListener('input', applyCommandFilter);
commandFilterEl?.addEventListener('change', applyCommandFilter);
configForm.addEventListener('input', () => setDirty());
configForm.addEventListener('change', () => setDirty());
window.addEventListener('beforeunload', e => { if (isDirty) { e.preventDefault(); e.returnValue = ''; } });

// ── Init ─────────────────────────────────────────────────────────────────────
function esc(str) { return (str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

refreshStatus();
setInterval(refreshStatus, 15000);
loadServers();
