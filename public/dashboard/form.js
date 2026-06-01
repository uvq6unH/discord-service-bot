import { esc, setDirty } from './utils.js';
import {
  currentGuildId, configForm, autoRepliesEl, selfRolesEl, FIELDS
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
}

export function readForm() {
  const payload = { guildId: currentGuildId, commands: readCommands(), autoReplies: readAutoReplies(), selfRoles: readSelfRoles() };
  const bwEl = document.querySelector('#badWords');
  payload.badWords = bwEl ? bwEl.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
  for (const f of FIELDS) {
    const el = document.querySelector(`#${f}`);
    if (el) payload[f] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return payload;
}
