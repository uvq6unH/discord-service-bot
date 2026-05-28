const statusEl = document.querySelector('#status');
const guildIdEl = document.querySelector('#guildId');
const guildPickerEl = document.querySelector('#guildPicker');
const form = document.querySelector('#configForm');
const messageEl = document.querySelector('#message');
const autoRepliesEl = document.querySelector('#autoReplies');
const selfRolesEl = document.querySelector('#selfRoles');
const navItems = [...document.querySelectorAll('.nav-item')];
const pages = [...document.querySelectorAll('.page')];
let isDirty = false;
window.currentGuildData = { channels: [], roles: [] };

const fields = [
  'enabled',
  'prefix',
  'logChannelId',
  'moderationEnabled',
  'autoModEnabled',
  'deleteBlockedMessages',
  'antiLinkEnabled',
  'blockedMessage',
  'rolesEnabled',
  'autoRoleId',
  'selfRolePanelTitle',
  'selfRolePanelMessage',
  'ticketsEnabled',
  'ticketCategoryId',
  'ticketLogChannelId',
  'ticketPanelTitle',
  'ticketPanelMessage',
  'levelsEnabled',
  'xpPerMessage',
  'levelUpMessage',
  'announcementsEnabled',
  'announcementChannelId',
  'announcementMention',
  'welcomeEnabled',
  'welcomeChannelId',
  'welcomeMessage',
  'autoReplyEnabled'
];

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.style.color = isError ? '#ef4444' : '#10b981';
}

function setDirty(value) {
  isDirty = value;
  if (isDirty) {
    setMessage('Có thay đổi chưa lưu. Vui lòng bấm Lưu cấu hình.');
  }
}

function getGuildId() {
  return guildIdEl.value.trim();
}

function addTextInput(parent, className, value, placeholder = '') {
  const input = document.createElement('input');
  input.className = className;
  input.value = value ?? '';
  input.placeholder = placeholder;
  parent.append(input);
  return input;
}

function addTextarea(parent, className, value, rows = 3, placeholder = '') {
  const textarea = document.createElement('textarea');
  textarea.className = className;
  textarea.value = value ?? '';
  textarea.rows = rows;
  textarea.placeholder = placeholder;
  parent.append(textarea);
  return textarea;
}

function addLabeledControl(parent, text, control) {
  const label = document.createElement('label');
  label.textContent = text;
  label.append(control);
  parent.append(label);
}

// Map command types to their Vietnamese labels
const commandLabels = {
  custom: 'Tùy chọn (Custom)',
  ping: 'Độ trễ (Ping)',
  help: 'Trợ giúp (Help)',
  config: 'Xem Cấu hình (Config)',
  server: 'Thông tin Server',
  user: 'Thông tin User',
  avatar: 'Xem Avatar',
  say: 'Nhại tin nhắn (Say)',
  purge: 'Dọn tin nhắn (Purge)',
  warn: 'Cảnh cáo (Warn)',
  kick: 'Trục xuất (Kick)',
  ban: 'Cấm (Ban)',
  timeout: 'Cho tạm dừng (Timeout)',
  warnings: 'Xem Cảnh cáo',
  clearwarns: 'Xóa Cảnh cáo',
  rank: 'Thứ hạng XP (Rank)',
  leaderboard: 'Bảng xếp hạng XP',
  announce: 'Phát thông báo',
  ticketpanel: 'Đăng bảng Ticket',
  rolepanel: 'Đăng bảng Role'
};

function getCommandContainer(type) {
  if (['ping', 'help', 'custom'].includes(type)) {
    return document.querySelector('#commands-general-list');
  }
  if (['user', 'avatar', 'rank', 'leaderboard'].includes(type)) {
    return document.querySelector('#commands-user-levels-list');
  }
  if (['server', 'say', 'purge', 'announce'].includes(type)) {
    return document.querySelector('#commands-server-broadcast-list');
  }
  if (['warn', 'kick', 'ban', 'timeout', 'warnings', 'clearwarns'].includes(type)) {
    return document.querySelector('#commands-moderation-automod-list');
  }
  if (['ticketpanel', 'rolepanel'].includes(type)) {
    return document.querySelector('#commands-interactions-list');
  }
  return document.querySelector('#commands-general-list');
}

function addCommandRow(command = { enabled: true, type: 'custom', name: '', description: '', response: '', allowedRoles: [] }) {
  const container = getCommandContainer(command.type);
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'command-item';
  row.dataset.commandType = command.type;

  const top = document.createElement('div');
  top.className = 'command-top';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'command-title-group';

  // State toggle switch
  const enabledLabel = document.createElement('label');
  enabledLabel.className = 'switch-line compact';
  const enabledInput = document.createElement('input');
  enabledInput.className = 'command-enabled';
  enabledInput.type = 'checkbox';
  enabledInput.checked = command.enabled !== false;
  const enabledText = document.createElement('span');
  enabledText.textContent = 'Hoạt động';
  enabledLabel.append(enabledInput, enabledText);

  // Command type badge
  const badge = document.createElement('span');
  badge.className = `command-badge ${command.type === 'custom' ? 'custom' : 'system'}`;
  badge.textContent = commandLabels[command.type] || command.type;

  titleGroup.append(badge, enabledLabel);

  const actions = document.createElement('div');
  actions.className = 'command-actions';

  if (command.type === 'custom') {
    const removeButton = document.createElement('button');
    removeButton.className = 'secondary danger-hover';
    removeButton.type = 'button';
    removeButton.textContent = 'Xóa lệnh';
    removeButton.addEventListener('click', () => {
      row.remove();
      setDirty(true);
      updateNavMeta();
    });
    actions.append(removeButton);
  }

  top.append(titleGroup, actions);

  const fields = document.createElement('div');
  fields.className = 'command-fields';

  const nameWrapper = document.createElement('div');
  const descriptionWrapper = document.createElement('div');
  const responseWrapper = document.createElement('div');
  responseWrapper.className = 'command-response-wrap';

  const nameInput = addTextInput(nameWrapper, 'command-name', command.name, 'Tên lệnh (ví dụ: ping)');
  const descriptionInput = addTextInput(descriptionWrapper, 'command-description', command.description, 'Mô tả ngắn gọn về lệnh này...');
  const responseInput = addTextarea(responseWrapper, 'command-response', command.response, 3, 'Nội dung phản hồi hoặc hành động...');

  addLabeledControl(nameWrapper, 'Tên Lệnh (không chứa dấu cách/kí tự đặc biệt)', nameInput);
  addLabeledControl(descriptionWrapper, 'Mô tả hiển thị trên Discord', descriptionInput);
  addLabeledControl(responseWrapper, 'Mẫu phản hồi (Hỗ trợ các biến mẫu)', responseInput);

  // Allowed roles section
  const rolesWrapper = document.createElement('div');
  rolesWrapper.className = 'command-roles-wrap';
  const rolesLabel = document.createElement('label');
  rolesLabel.textContent = 'Vai trò được phép sử dụng (Mặc định: Tất cả)';
  rolesWrapper.append(rolesLabel);

  const rolesGrid = document.createElement('div');
  rolesGrid.className = 'roles-checkbox-grid';

  const roles = (window.currentGuildData?.roles ?? []).filter((r) => r.name !== '@everyone');
  if (roles.length === 0) {
    const noRoles = document.createElement('span');
    noRoles.className = 'no-roles-hint';
    noRoles.textContent = 'Vui lòng chọn máy chủ để hiển thị vai trò.';
    rolesGrid.append(noRoles);
  } else {
    for (const r of roles) {
      const chkLabel = document.createElement('label');
      chkLabel.className = 'role-checkbox-label';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = 'command-role-chk';
      chk.value = r.id;
      chk.checked = Array.isArray(command.allowedRoles) && command.allowedRoles.includes(r.id);
      const span = document.createElement('span');
      span.textContent = r.name;
      chkLabel.append(chk, span);
      rolesGrid.append(chkLabel);
    }
  }
  rolesWrapper.append(rolesGrid);

  fields.append(nameWrapper, descriptionWrapper, responseWrapper, rolesWrapper);
  row.append(top, fields);

  row.addEventListener('input', () => setDirty(true));
  row.addEventListener('change', () => setDirty(true));

  container.append(row);
  updateNavMeta();
}

function readCommands() {
  return [...document.querySelectorAll('.command-item')]
    .map((row) => {
      const allowedRoles = [...row.querySelectorAll('.command-role-chk:checked')].map((chk) => chk.value);
      return {
        enabled: row.querySelector('.command-enabled').checked,
        type: row.dataset.commandType || 'custom',
        name: row.querySelector('.command-name').value.trim(),
        description: row.querySelector('.command-description').value.trim(),
        response: row.querySelector('.command-response').value.trim(),
        allowedRoles
      };
    })
    .filter((command) => command.name && command.response);
}

function addReplyRow(reply = { keyword: '', response: '' }) {
  const row = document.createElement('div');
  row.className = 'reply-item';
  row.innerHTML = `
    <label>
      Từ khóa kích hoạt
      <input class="reply-keyword" value="${reply.keyword.replaceAll('"', '&quot;')}" placeholder="hello bot" />
    </label>
    <label>
      Nội dung phản hồi tự động
      <input class="reply-response" value="${reply.response.replaceAll('"', '&quot;')}" placeholder="Chào bạn! Bot đang hoạt động." />
    </label>
    <button class="secondary danger-hover" type="button">Xóa</button>
  `;

  row.querySelector('button').addEventListener('click', () => {
    row.remove();
    setDirty(true);
    updateNavMeta();
  });
  row.addEventListener('input', () => setDirty(true));
  row.addEventListener('change', () => setDirty(true));
  autoRepliesEl.append(row);
  updateNavMeta();
}

function readAutoReplies() {
  return [...autoRepliesEl.querySelectorAll('.reply-item')]
    .map((row) => ({
      keyword: row.querySelector('.reply-keyword').value.trim(),
      response: row.querySelector('.reply-response').value.trim()
    }))
    .filter((reply) => reply.keyword && reply.response);
}

function addSelfRoleRow(role = { label: '', roleId: '' }) {
  const row = document.createElement('div');
  row.className = 'reply-item';
  row.innerHTML = `
    <label>
      Nhãn nút bấm (Label)
      <input class="self-role-label" value="${role.label.replaceAll('"', '&quot;')}" placeholder="Ví dụ: Coder" />
    </label>
    <label>
      Vai Trò (Role)
      <select class="self-role-id"></select>
    </label>
    <button class="secondary danger-hover" type="button">Xóa</button>
  `;

  const select = row.querySelector('.self-role-id');
  const roles = (window.currentGuildData?.roles ?? []).filter((r) => r.name !== '@everyone');
  
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '-- Chọn vai trò --';
  select.append(defaultOption);

  for (const r of roles) {
    const option = document.createElement('option');
    option.value = r.id;
    option.textContent = r.name;
    if (r.id === role.roleId) {
      option.selected = true;
    }
    select.append(option);
  }

  // Fallback if not found in cache
  if (role.roleId && !roles.some((r) => r.id === role.roleId)) {
    const opt = document.createElement('option');
    opt.value = role.roleId;
    opt.textContent = `ID vai trò: ${role.roleId}`;
    opt.selected = true;
    select.append(opt);
  }

  row.querySelector('button').addEventListener('click', () => {
    row.remove();
    setDirty(true);
  });
  row.addEventListener('input', () => setDirty(true));
  row.addEventListener('change', () => setDirty(true));
  selfRolesEl.append(row);
}

function readSelfRoles() {
  return [...selfRolesEl.querySelectorAll('.reply-item')]
    .map((row) => ({
      label: row.querySelector('.self-role-label').value.trim(),
      roleId: row.querySelector('.self-role-id').value.trim()
    }))
    .filter((role) => role.label && role.roleId);
}

function fillForm(config) {
  guildIdEl.value = config.guildId;
  for (const field of fields) {
    const input = document.querySelector(`#${field}`);
    if (input) {
      if (input.type === 'checkbox') {
        input.checked = Boolean(config[field]);
      } else {
        input.value = config[field] ?? '';
      }
    }
  }

  const badWordsInput = document.querySelector('#badWords');
  if (badWordsInput) {
    badWordsInput.value = (config.badWords ?? []).join('\n');
  }

  selfRolesEl.replaceChildren();
  for (const role of config.selfRoles ?? []) {
    addSelfRoleRow(role);
  }

  // Clear all command lists
  document.querySelector('#commands-general-list').replaceChildren();
  document.querySelector('#commands-user-levels-list').replaceChildren();
  document.querySelector('#commands-server-broadcast-list').replaceChildren();
  document.querySelector('#commands-moderation-automod-list').replaceChildren();
  document.querySelector('#commands-interactions-list').replaceChildren();

  for (const command of config.commands ?? []) {
    addCommandRow(command);
  }

  autoRepliesEl.replaceChildren();
  for (const reply of config.autoReplies ?? []) {
    addReplyRow(reply);
  }

  setDirty(false);
  updateNavMeta(config);
}

function readForm() {
  const badWordsEl = document.querySelector('#badWords');
  const payload = {
    guildId: getGuildId(),
    commands: readCommands(),
    autoReplies: readAutoReplies(),
    selfRoles: readSelfRoles(),
    badWords: badWordsEl
      ? badWordsEl.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
      : []
  };

  for (const field of fields) {
    const input = document.querySelector(`#${field}`);
    if (input) {
      payload[field] = input.type === 'checkbox' ? input.checked : input.value;
    }
  }
  return payload;
}

function updateNavMeta(config = null) {
  const commands = config?.commands ?? readCommands();
  const replies = config?.autoReplies ?? readAutoReplies();

  // Filter commands by groups to count
  const generalCount = commands.filter(c => ['ping', 'help', 'custom'].includes(c.type)).length;
  const userCount = commands.filter(c => ['user', 'avatar', 'rank', 'leaderboard'].includes(c.type)).length;
  const serverCount = commands.filter(c => ['server', 'say', 'purge', 'announce'].includes(c.type)).length;
  const modCount = commands.filter(c => ['warn', 'kick', 'ban', 'timeout', 'warnings', 'clearwarns'].includes(c.type)).length;
  const interCount = commands.filter(c => ['ticketpanel', 'rolepanel'].includes(c.type)).length;

  const getChecked = (id) => {
    const el = document.querySelector(`#${id}`);
    return el ? el.checked : false;
  };

  // Nav subtexts
  const overviewMeta = document.querySelector('[data-page="overview"] small');
  const generalMeta = document.querySelector('[data-page="commands-general"] small');
  const userMeta = document.querySelector('[data-page="user-levels"] small');
  const serverMeta = document.querySelector('[data-page="server-broadcast"] small');
  const modMeta = document.querySelector('[data-page="moderation-automod"] small');
  const interMeta = document.querySelector('[data-page="interactions"] small');
  const replyMeta = document.querySelector('[data-page="auto-replies"] small');

  if (overviewMeta) {
    const enabled = config ? config.enabled : getChecked('enabled');
    const prefix = config ? config.prefix : (document.querySelector('#prefix')?.value || '!');
    overviewMeta.textContent = `${enabled ? 'Đang bật' : 'Đang tắt'} | Prefix: ${prefix}`;
  }
  if (generalMeta) {
    generalMeta.textContent = `${generalCount} câu lệnh được bật`;
  }
  if (userMeta) {
    const welcome = config ? config.welcomeEnabled : getChecked('welcomeEnabled');
    const levels = config ? config.levelsEnabled : getChecked('levelsEnabled');
    userMeta.textContent = `Welcome: ${welcome ? 'Bật' : 'Tắt'} | XP: ${levels ? 'Bật' : 'Tắt'}`;
  }
  if (serverMeta) {
    const announce = config ? config.announcementsEnabled : getChecked('announcementsEnabled');
    serverMeta.textContent = `Thông báo: ${announce ? 'Bật' : 'Tắt'} | ${serverCount} lệnh`;
  }
  if (modMeta) {
    const mod = config ? config.moderationEnabled : getChecked('moderationEnabled');
    const automod = config ? config.autoModEnabled : getChecked('autoModEnabled');
    modMeta.textContent = `Mod: ${mod ? 'Bật' : 'Tắt'} | AutoMod: ${automod ? 'Bật' : 'Tắt'}`;
  }
  if (interMeta) {
    const roles = config ? config.rolesEnabled : getChecked('rolesEnabled');
    const tickets = config ? config.ticketsEnabled : getChecked('ticketsEnabled');
    interMeta.textContent = `Roles: ${roles ? 'Bật' : 'Tắt'} | Tickets: ${tickets ? 'Bật' : 'Tắt'}`;
  }
  if (replyMeta) {
    replyMeta.textContent = `${replies.length} phản hồi từ khóa`;
  }
}

function showPage(pageName) {
  for (const item of navItems) {
    item.classList.toggle('active', item.dataset.page === pageName);
  }

  for (const page of pages) {
    page.classList.toggle('active', page.dataset.pagePanel === pageName);
  }
}

async function refreshStatus() {
  const res = await fetch('/api/status');
  const status = await res.json();
  statusEl.textContent = status.botReady
    ? `${status.botUser} | Hoạt động trên ${status.guildCount} server`
    : 'Bot đang khởi động...';
}

async function refreshGuilds(autoLoad = false) {
  const res = await fetch('/api/guilds');
  const data = await res.json();
  const guilds = data.guilds ?? [];

  guildPickerEl.replaceChildren();

  if (guilds.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Không tìm thấy server nào';
    guildPickerEl.append(option);
    return;
  }

  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = '-- Chọn máy chủ Discord --';
  guildPickerEl.append(emptyOption);

  for (const guild of guilds) {
    const option = document.createElement('option');
    option.value = guild.id;
    option.textContent = `${guild.configured ? '[Đã cấu hình] ' : ''}${guild.name} (${guild.id})`;
    guildPickerEl.append(option);
  }

  const firstConfigured = guilds.find((guild) => guild.configured) ?? guilds[0];
  if (autoLoad && firstConfigured) {
    guildPickerEl.value = firstConfigured.id;
    guildIdEl.value = firstConfigured.id;
    await loadConfig();
  }
}

async function fetchGuildData(guildId) {
  try {
    const res = await fetch(`/api/guild-data?guildId=${encodeURIComponent(guildId)}`);
    if (res.ok) {
      window.currentGuildData = await res.json();
    } else {
      window.currentGuildData = { channels: [], roles: [] };
    }
  } catch (error) {
    console.error('Failed to fetch guild data', error);
    window.currentGuildData = { channels: [], roles: [] };
  }
}

function populateGuildDropdowns() {
  const textChannels = (window.currentGuildData?.channels ?? []).filter((c) => c.type === 0 || c.type === 5);
  const categories = (window.currentGuildData?.channels ?? []).filter((c) => c.type === 4);
  const roles = (window.currentGuildData?.roles ?? []).filter((r) => r.name !== '@everyone');

  const fillSelect = (selectId, items, placeholderText) => {
    const select = document.querySelector(`#${selectId}`);
    if (!select) return;
    select.replaceChildren();

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = placeholderText;
    select.append(defaultOption);

    for (const item of items) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      select.append(option);
    }
  };

  fillSelect('welcomeChannelId', textChannels, '-- Chọn kênh chào mừng --');
  fillSelect('announcementChannelId', textChannels, '-- Chọn kênh thông báo --');
  fillSelect('ticketLogChannelId', textChannels, '-- Chọn kênh lưu log ticket --');
  fillSelect('logChannelId', textChannels, '-- Chọn kênh log sự kiện --');
  fillSelect('ticketCategoryId', categories, '-- Chọn danh mục ticket --');
  fillSelect('autoRoleId', roles, '-- Chọn vai trò mặc định --');
}

async function loadConfig() {
  const guildId = getGuildId();
  if (!guildId) {
    setMessage('Vui lòng nhập Guild ID trước.', true);
    return;
  }

  await fetchGuildData(guildId);
  populateGuildDropdowns();

  const res = await fetch(`/api/config?guildId=${encodeURIComponent(guildId)}`);
  const config = await res.json();
  if (!res.ok) {
    setMessage(config.error ?? 'Tải cấu hình thất bại.', true);
    return;
  }

  fillForm(config);
  setMessage('Cấu hình đã tải thành công.');
}

async function saveConfig(event) {
  event.preventDefault();
  const payload = readForm();
  if (!payload.guildId) {
    setMessage('Vui lòng nhập Guild ID trước.', true);
    return;
  }

  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const config = await res.json();
  if (!res.ok) {
    setMessage(config.error ?? 'Lưu cấu hình thất bại.', true);
    return;
  }

  fillForm(config);
  const slashText = config.slashSync?.synced
    ? ` Đã đồng bộ Slash Commands (${config.slashSync.count}).`
    : ` Bỏ qua đồng bộ Slash: ${config.slashSync?.reason ?? 'không xác định'}.`;
  setMessage(`Đã lưu cấu hình thành công.${slashText}`, !config.slashSync?.synced);
  setDirty(false);
  await refreshGuilds();
  guildPickerEl.value = config.guildId;
}

async function syncSlashCommands() {
  const guildId = getGuildId();
  if (!guildId) {
    setMessage('Vui lòng nhập Guild ID trước.', true);
    return;
  }

  const res = await fetch('/api/slash-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId })
  });
  const result = await res.json();
  if (!res.ok || !result.synced) {
    setMessage(`Đồng bộ Slash Command thất bại: ${result.reason ?? result.error ?? 'không rõ nguyên nhân'}`, true);
    return;
  }

  setMessage(`Đã đồng bộ thành công ${result.count} lệnh Slash Command. Discord cần vài giây để cập nhật.`);
}

document.querySelector('#loadBtn').addEventListener('click', loadConfig);
document.querySelector('#refreshGuildsBtn').addEventListener('click', () => refreshGuilds());
document.querySelector('#syncSlashBtn').addEventListener('click', syncSlashCommands);
for (const item of navItems) {
  item.addEventListener('click', () => showPage(item.dataset.page));
}
guildPickerEl.addEventListener('change', () => {
  guildIdEl.value = guildPickerEl.value;
  if (guildPickerEl.value) {
    loadConfig();
  }
});
document.querySelector('#addCommandBtn').addEventListener('click', () => {
  addCommandRow({ enabled: true, type: 'custom', name: '', description: '', response: '' });
  setDirty(true);
});
document.querySelector('#addReplyBtn').addEventListener('click', () => {
  addReplyRow();
  setDirty(true);
});
document.querySelector('#addSelfRoleBtn').addEventListener('click', () => {
  addSelfRoleRow();
  setDirty(true);
});
form.addEventListener('submit', saveConfig);
form.addEventListener('input', () => {
  setDirty(true);
  updateNavMeta();
});
form.addEventListener('change', () => {
  setDirty(true);
  updateNavMeta();
});
window.addEventListener('beforeunload', (event) => {
  if (!isDirty) {
    return;
  }
  event.preventDefault();
  event.returnValue = '';
});

refreshStatus().catch(() => {
  statusEl.textContent = 'Lỗi kết nối trạng thái';
});
refreshGuilds(true).catch(() => {
  guildPickerEl.replaceChildren();
  const option = document.createElement('option');
  option.value = '';
  option.textContent = 'Không tải được danh sách máy chủ';
  guildPickerEl.append(option);
});
setInterval(refreshStatus, 10000);
