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
    <div><label>Từ khóa</label><input class="reply-keyword" value="${esc(reply.keyword)}" placeholder="xin chào" /></div>
    <div><label>Phản hồi</label><input class="reply-response" value="${esc(reply.response)}" placeholder="Chào bạn!" /></div>
    <button class="btn btn-xs btn-danger remove-reply" type="button" style="align-self:flex-end">Xóa</button>`;
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

/** Format a Date as "YYYY-MM-DDTHH:MM" for datetime-local inputs */
function toDatetimeLocal(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Build a <datalist> with every 15-min slot for today + tomorrow */
function buildTimeDatalist(id) {
  const dl = document.createElement('datalist');
  dl.id = id;
  const now = new Date();
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    for (let slot = 0; slot < 96; slot++) { // 96 × 15 min = 24 h
      const d = new Date(startDay.getTime() + dayOffset * 86400000 + slot * 15 * 60000);
      const opt = document.createElement('option');
      opt.value = toDatetimeLocal(d);
      dl.append(opt);
    }
  }
  return dl;
}

export function addReminderRow(reminder = { id: '', userIds: [], channelId: '', message: '', time: '' }) {
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

  // ── Multi-select user ──
  const userSelect = document.createElement('select');
  userSelect.className = 'reminder-user-ids';
  userSelect.multiple = true;
  userSelect.size = Math.min(5, Math.max(3, (window.currentGuildData?.members ?? []).length));
  userSelect.style.minHeight = '80px';

  const members = window.currentGuildData?.members ?? [];
  for (const m of members) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.displayName + (m.name !== m.displayName ? ` (${m.name})` : '');
    if (selectedIds.includes(m.id)) opt.selected = true;
    userSelect.append(opt);
  }
  // Preserve any saved IDs not in member list
  for (const uid of selectedIds) {
    if (!members.some(m => m.id === uid)) {
      const opt = document.createElement('option'); opt.value = uid; opt.textContent = `ID: ${uid}`; opt.selected = true;
      userSelect.append(opt);
    }
  }

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

  // ── Time input: step 15 min + datalist suggestions ──
  const datalistId = `reminder-times-${rowId}`;
  const timeDL = buildTimeDatalist(datalistId);

  // Default time = next 15-min boundary from now
  const defaultTime = reminder.time || toDatetimeLocal(roundUpToStep(new Date(), 15));

  const timeInput = document.createElement('input');
  timeInput.type = 'datetime-local';
  timeInput.className = 'reminder-time';
  timeInput.value = defaultTime;
  timeInput.step = String(15 * 60); // 900 seconds → browser snaps to 15-min steps
  timeInput.setAttribute('list', datalistId);

  // ── Layout ──
  const topRow = document.createElement('div');
  topRow.style.display = 'flex'; topRow.style.gap = '1rem';

  const userWrap = document.createElement('div'); userWrap.style.flex = '1';
  const userLabel = document.createElement('label');
  userLabel.textContent = 'Thành viên (giữ Ctrl/⌘ để chọn nhiều)';
  userLabel.style.display = 'block';
  userWrap.append(userLabel, userSelect);

  const channelWrap = document.createElement('div'); channelWrap.style.flex = '1';
  channelWrap.innerHTML = '<label>Kênh</label>'; channelWrap.append(channelSelect);

  const timeWrap = document.createElement('div'); timeWrap.style.flex = '1';
  timeWrap.innerHTML = '<label>Thời gian</label>';
  timeWrap.append(timeDL, timeInput);

  topRow.append(userWrap, channelWrap, timeWrap);

  const bottomRow = document.createElement('div');
  bottomRow.style.display = 'flex'; bottomRow.style.gap = '1rem';
  const msgWrap = document.createElement('div'); msgWrap.style.flex = '1';
  msgWrap.innerHTML = `<label>Nội dung nhắc nhở</label><input class="reminder-message" value="${esc(reminder.message)}" placeholder="Nhớ tham gia event nhé!" />`;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn btn-xs btn-danger'; removeBtn.type = 'button'; removeBtn.textContent = 'Xóa';
  removeBtn.style.alignSelf = 'flex-end';
  removeBtn.addEventListener('click', () => { row.remove(); setDirty(); });

  bottomRow.append(msgWrap, removeBtn);

  row.dataset.id = rowId;
  row.append(topRow, bottomRow);
  row.addEventListener('input', setDirty);
  row.addEventListener('change', setDirty);
  remindersEl.append(row);
}

export function readReminders() {
  return [...remindersEl.querySelectorAll('.reply-item')].map(row => {
    const userIdsSelected = [...row.querySelector('.reminder-user-ids').selectedOptions].map(o => o.value).filter(Boolean);
    return {
      id: row.dataset.id,
      userIds: userIdsSelected,
      channelId: row.querySelector('.reminder-channel-id').value.trim(),
      message: row.querySelector('.reminder-message').value.trim(),
      time: row.querySelector('.reminder-time').value.trim()
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
