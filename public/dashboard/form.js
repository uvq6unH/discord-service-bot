import { esc, setDirty } from './utils.js';
import {
  currentGuildId, configForm, autoRepliesEl, selfRolesEl, remindersEl, FIELDS
} from './state.js';
import {
  ensureCommandSections, activateCommandSection, showCommandSections, addCommandRow,
  readCommands, applyCommandFilter, getCommandGroupFromHash
} from './commands.js';

// ── Reply helpers ────────────────────────────────────────────────────────────
export function addReplyRow(reply = { keyword: '', response: '' }) {
  const row = document.createElement('div');
  row.className = 'reply-item';
  row.innerHTML = `
    <div><label>Từ khóa</label><input class="reply-keyword" placeholder="xin chào" /></div>
    <div><label>Phản hồi</label><input class="reply-response" placeholder="Chào bạn!" /></div>
    <button class="btn btn-xs btn-danger remove-reply" type="button" style="align-self:flex-end">Xóa</button>`;
  row.querySelector('.reply-keyword').value = reply.keyword ?? '';
  row.querySelector('.reply-response').value = reply.response ?? '';
    row.querySelector('.remove-reply').addEventListener('click', () => { row.remove(); setDirty(); });
  row.addEventListener('input', setDirty);
  autoRepliesEl.append(row);
}

export function readAutoReplies() {
  return [...autoRepliesEl.querySelectorAll('.reply-item')].map(row => ({
    keyword: row.querySelector('.reply-keyword').value.trim(),
    response: row.querySelector('.reply-response').value.trim(),
  })).filter(r => r.keyword && r.response);
}

// ── SelfRole helpers ─────────────────────────────────────────────────────────
export function addSelfRoleRow(role = { label: '', roleId: '' }) {
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
  labelWrap.innerHTML = `<label>Label nút</label><input class="self-role-label" placeholder="Coder" />`;
  labelWrap.querySelector('.self-role-label').value = role.label ?? '';
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

export function readSelfRoles() {
  return [...selfRolesEl.querySelectorAll('.reply-item')].map(row => ({
    label: row.querySelector('.self-role-label').value.trim(),
    roleId: row.querySelector('.self-role-id').value.trim(),
  })).filter(r => r.label && r.roleId);
}

// ── Reminder helpers ─────────────────────────────────────────────────────────

/** Round a Date up to the nearest N-minute boundary */
function roundUpToStep(date, stepMin) {
  const ms = stepMin * 60 * 1000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

/** Format a Date as "HH:MM" for time inputs */
function toTimeLocal(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Convert a "HH:MM" time string to an ISO UTC string for today (or tomorrow if past) */
function timeLocalToISO(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date();
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  // If already past today, schedule for tomorrow
  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.toISOString();
}

/** Convert an ISO/datetime-local string → "HH:MM" for display in time input */
function isoToTimeLocal(isoOrDatetimeLocal) {
  if (!isoOrDatetimeLocal) return '';
  const d = new Date(isoOrDatetimeLocal);
  if (isNaN(d)) return isoOrDatetimeLocal.slice(11, 16) || ''; // fallback for "2026-06-03T14:30" format
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Build a member chip element with avatar initial + checkmark */
function buildMemberChip(displayText, id, isChecked, avatarUrlOrCallback, onChangeCallback) {
  let avatarUrl = null;
  let callback = onChangeCallback;
  if (typeof avatarUrlOrCallback === 'function') {
    callback = avatarUrlOrCallback;
  } else {
    avatarUrl = avatarUrlOrCallback;
  }

  const lbl = document.createElement('label');
  lbl.className = 'reminder-member-chip' + (isChecked ? ' checked' : '');
  lbl.title = displayText;

  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.className = 'reminder-member-chk';
  chk.value = id;
  chk.checked = isChecked;

  // Avatar (image or initial fallback)
  let avatar;
  if (avatarUrl) {
    avatar = document.createElement('img');
    avatar.className = 'member-chip-avatar';
    avatar.src = avatarUrl;
    avatar.alt = displayText.charAt(0).toUpperCase();
    avatar.style.objectFit = 'cover';
    avatar.onerror = () => {
      const spanFallback = document.createElement('span');
      spanFallback.className = 'member-chip-avatar';
      spanFallback.textContent = displayText.charAt(0).toUpperCase();
      avatar.replaceWith(spanFallback);
    };
  } else {
    avatar = document.createElement('span');
    avatar.className = 'member-chip-avatar';
    avatar.textContent = displayText.charAt(0).toUpperCase();
  }

  // Checkmark icon (only visible when checked)
  const checkIcon = document.createElement('span');
  checkIcon.className = 'member-chip-check';
  checkIcon.innerHTML = '✓';

  // Name
  const nameSpan = document.createElement('span');
  nameSpan.className = 'member-chip-name';
  nameSpan.textContent = displayText;

  chk.addEventListener('change', () => {
    lbl.classList.toggle('checked', chk.checked);
    callback();
  });

  lbl.append(chk, avatar, nameSpan, checkIcon);
  return lbl;
}

export function addReminderRow(reminder = { id: '', userIds: [], channelId: '', message: '', time: '', repeat: 'none' }) {
  const row = document.createElement('div');
  row.className = 'reply-item';
  row.style.flexDirection = 'column';
  row.style.alignItems = 'stretch';
  row.style.gap = '0.5rem';

  const rowId = reminder.id || Date.now().toString();

  // ── Backward-compat: support legacy single userId field ──
  const selectedIds = Array.isArray(reminder.userIds) && reminder.userIds.length
    ? reminder.userIds
    : (reminder.userId ? [reminder.userId] : []);

  // ── Member checkbox grid ──
  const members = window.currentGuildData?.members ?? [];

  const userWrap = document.createElement('div');
  userWrap.className = 'command-roles-wrap reminder-user-wrap';

  const userHead = document.createElement('div');
  userHead.className = 'command-roles-head';

  const userLabel = document.createElement('label');
  userLabel.textContent = 'Thành viên';

  const userCount = document.createElement('span');
  userCount.className = 'reminder-member-count';

  // Search input
  const memberSearch = document.createElement('input');
  memberSearch.type = 'text';
  memberSearch.placeholder = 'Tìm thành viên...';
  memberSearch.className = 'reminder-member-search';

  userHead.append(userLabel, userCount);
  userWrap.append(userHead, memberSearch);

  const grid = document.createElement('div');
  grid.className = 'reminder-member-grid';

  const updateMemberCount = () => {
    const checked = grid.querySelectorAll('.reminder-member-chk:checked').length;
    if (checked === 0) {
      userCount.textContent = 'Chưa chọn ai';
      userCount.className = 'reminder-member-count';
    } else {
      userCount.textContent = `${checked} thành viên đã chọn`;
      userCount.className = 'reminder-member-count has-selected';
    }
  };

  const applyMemberSearch = () => {
    const q = memberSearch.value.trim().toLowerCase();
    for (const chip of grid.querySelectorAll('.reminder-member-chip')) {
      chip.style.display = !q || chip.title.toLowerCase().includes(q) ? '' : 'none';
    }
  };

  memberSearch.addEventListener('input', applyMemberSearch);

  if (members.length === 0) {
    grid.innerHTML = '<span class="no-roles-hint">Tải cấu hình server để hiển thị thành viên.</span>';
  } else {
    for (const m of members) {
      const displayText = m.displayName + (m.name && m.name !== m.displayName ? ` (${m.name})` : '');
      const isChecked = selectedIds.includes(m.id);
      const chip = buildMemberChip(displayText, m.id, isChecked, m.avatar, () => {
        updateMemberCount();
        setDirty();
      });
      grid.append(chip);
    }
  }

  // Preserve any saved IDs not in member list
  for (const uid of selectedIds) {
    if (!members.some(m => m.id === uid)) {
      const chip = buildMemberChip(`ID: ${uid}`, uid, true, () => {
        updateMemberCount();
        setDirty();
      });
      grid.append(chip);
    }
  }

  userWrap.append(grid);
  updateMemberCount();

  // ── Channel select ──
  const channelSelect = document.createElement('select');
  channelSelect.className = 'reminder-channel-id';
  const blankChannel = document.createElement('option'); blankChannel.value = ''; blankChannel.textContent = '-- Chọn kênh --';
  channelSelect.append(blankChannel);
  for (const c of (window.currentGuildData?.channels ?? []).filter(c => c.type === 0 || c.type === 5)) {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.name;
    if (c.id === reminder.channelId) opt.selected = true;
    channelSelect.append(opt);
  }

  // ── Time input: 24h time-only (HH:MM), no date picker ──
  // Default = next 15-min boundary from now
  const defaultTime = isoToTimeLocal(reminder.time) || toTimeLocal(roundUpToStep(new Date(), 15));

  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.className = 'reminder-time';
  timeInput.value = defaultTime;
  timeInput.step = String(15 * 60);

  // ── Repeat select ──
  const repeatSelect = document.createElement('select');
  repeatSelect.className = 'reminder-repeat';
  const repeatOptions = [
    { value: 'none',   label: '🔕 Không lặp' },
    { value: 'hourly', label: '🕐 Mỗi giờ' },
    { value: 'daily',  label: '📅 Mỗi ngày' },
    { value: 'weekly', label: '📆 Mỗi tuần' },
  ];
  for (const ro of repeatOptions) {
    const opt = document.createElement('option');
    opt.value = ro.value; opt.textContent = ro.label;
    if ((reminder.repeat || 'none') === ro.value) opt.selected = true;
    repeatSelect.append(opt);
  }

  // ── Layout ──
  const topRow = document.createElement('div');
  topRow.style.display = 'flex'; topRow.style.gap = '1rem'; topRow.style.flexWrap = 'wrap';

  const channelWrap = document.createElement('div'); channelWrap.style.flex = '1'; channelWrap.style.minWidth = '160px';
  channelWrap.innerHTML = '<label>Kênh</label>'; channelWrap.append(channelSelect);

  const timeWrap = document.createElement('div'); timeWrap.style.flex = '1'; timeWrap.style.minWidth = '180px';
  timeWrap.innerHTML = '<label>Thời gian</label>';
  timeWrap.append(timeInput);

  const repeatWrap = document.createElement('div'); repeatWrap.style.flex = '1'; repeatWrap.style.minWidth = '140px';
  repeatWrap.innerHTML = '<label>Lặp lại</label>'; repeatWrap.append(repeatSelect);

  topRow.append(channelWrap, timeWrap, repeatWrap);

  const bottomRow = document.createElement('div');
  bottomRow.style.display = 'flex'; bottomRow.style.gap = '1rem';
  const msgWrap = document.createElement('div'); msgWrap.style.flex = '1';
  const msgLabel = document.createElement('label');
  msgLabel.textContent = 'Nội dung nhắc nhở';
  const msgInput = document.createElement('input');
  msgInput.className = 'reminder-message';
  msgInput.placeholder = 'Nhớ tham gia event nhé!';
  msgInput.value = reminder.message ?? '';
  msgWrap.append(msgLabel, msgInput);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn btn-xs btn-danger'; removeBtn.type = 'button'; removeBtn.textContent = 'Xóa';
  removeBtn.style.alignSelf = 'flex-end';
  removeBtn.addEventListener('click', () => { row.remove(); setDirty(); });

  bottomRow.append(msgWrap, removeBtn);

  row.dataset.id = rowId;
  row.append(userWrap, topRow, bottomRow);
  row.addEventListener('input', setDirty);
  row.addEventListener('change', setDirty);
  remindersEl.append(row);
}

export function readReminders() {
  return [...remindersEl.querySelectorAll('.reply-item')].map(row => {
    const userIdsSelected = [...row.querySelectorAll('.reminder-member-chk:checked')].map(c => c.value).filter(Boolean);
    return {
      id: row.dataset.id,
      userIds: userIdsSelected,
      channelId: row.querySelector('.reminder-channel-id').value.trim(),
      message: row.querySelector('.reminder-message').value.trim(),
      time: timeLocalToISO(row.querySelector('.reminder-time').value.trim()),
      repeat: row.querySelector('.reminder-repeat')?.value || 'none',
    };
  }).filter(r => r.userIds.length && r.channelId && r.message && r.time);
}

// ── Fill / read form ─────────────────────────────────────────────────────────
export function fillForm(config) {
  for (const f of FIELDS) {
    const el = document.querySelector(`#${f}`);
    if (!el) continue;
    el.type === 'checkbox' ? (el.checked = Boolean(config[f])) : (el.value = config[f] ?? '');
  }
  const bwEl = document.querySelector('#badWords');
  if (bwEl) bwEl.value = (config.badWords ?? []).join('\n');

  ensureCommandSections();
  activateCommandSection(getCommandGroupFromHash() || 'general', { updateHash: false });
  for (const list of document.querySelectorAll('.command-list')) list.replaceChildren();
  for (const cmd of config.commands ?? []) addCommandRow(cmd);
  const hashGroup = getCommandGroupFromHash();
  hashGroup ? activateCommandSection(hashGroup, { updateHash: false }) : showCommandSections({ updateHash: false });

  autoRepliesEl.replaceChildren();
  for (const r of config.autoReplies ?? []) addReplyRow(r);

  selfRolesEl.replaceChildren();
  for (const r of config.selfRoles ?? []) addSelfRoleRow(r);

  remindersEl.replaceChildren();
  for (const r of config.reminders ?? []) addReminderRow(r);

  // Stats
  const enabledCmds = (config.commands ?? []).filter(c => c.enabled).length;
  document.querySelector('#statCmds').textContent = enabledCmds;
  updateModuleSummary(config, enabledCmds);
  applyCommandFilter();
  setDirty(false);
}

export function setModuleStatus(id, active, detail = '') {
  const el = document.querySelector(`#${id}`);
  if (!el) return;
  el.textContent = active ? (detail || 'On') : 'Off';
  el.classList.toggle('on', Boolean(active));
}

export function updateModuleSummary(config, enabledCmds) {
  setModuleStatus('moduleCommands', enabledCmds > 0, String(enabledCmds));
  setModuleStatus('moduleModeration', config.moderationEnabled || config.autoModEnabled, config.autoModEnabled ? 'AutoMod' : 'On');
  setModuleStatus('moduleTickets', config.ticketsEnabled);
  setModuleStatus('moduleRoles', config.rolesEnabled || Boolean(config.autoRoleId), config.selfRoles?.length ? `${config.selfRoles.length}` : 'On');
  setModuleStatus('moduleLevels', config.levelsEnabled);
  const activeGames = ['blackjackEnabled', 'pokerEnabled', 'coinflipEnabled', 'diceEnabled', 'slotsEnabled'].filter((field) => config[field] !== false).length;
  setModuleStatus('moduleEconomy', config.economyEnabled, activeGames ? `${activeGames} games` : 'On');
  setModuleStatus('moduleAutoReplies', config.autoReplyEnabled, config.autoReplies?.length ? `${config.autoReplies.length}` : 'On');
  setModuleStatus('moduleReminders', config.remindersEnabled, config.reminders?.length ? `${config.reminders.length}` : 'On');
  setModuleStatus('moduleMusic', config.musicEnabled, config.musicPrefix ? config.musicPrefix : 'On');
}

export function readForm() {
  const payload = { guildId: currentGuildId, commands: readCommands(), autoReplies: readAutoReplies(), selfRoles: readSelfRoles(), reminders: readReminders() };
  const bwEl = document.querySelector('#badWords');
  payload.badWords = bwEl ? bwEl.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
  for (const f of FIELDS) {
    const el = document.querySelector(`#${f}`);
    if (el) payload[f] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return payload;
}
