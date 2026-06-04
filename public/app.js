import './dashboard/auth.js';
import { saveBtnBar, configForm, commandSearchEl, commandFilterEl } from './dashboard/state.js';
import { isDirty, setDirty } from './dashboard/utils.js';
import { showPage } from './dashboard/nav.js';
import { addCommandRow, applyCommandFilter, ensureCommandSections, activateCommandSection, showCommandSections, getCommandGroupFromHash } from './dashboard/commands.js';
import { addReplyRow, addSelfRoleRow, addReminderRow } from './dashboard/form.js';
import { bindNavigation } from './dashboard/nav.js';
import { loadServers, refreshStatus, saveConfig, syncSlash } from './dashboard/guild.js';
import { initMembersPage } from './dashboard/members.js';

bindNavigation();
initMembersPage();

saveBtnBar.addEventListener('click', saveConfig);
document.querySelector('#addCommandBtn')?.addEventListener('click', () => { addCommandRow(); setDirty(); });
document.querySelector('#addReplyBtn')?.addEventListener('click', () => { addReplyRow(); setDirty(); });
document.querySelector('#addSelfRoleBtn')?.addEventListener('click', () => { addSelfRoleRow(); setDirty(); });
document.querySelector('#addReminderBtn')?.addEventListener('click', () => { addReminderRow(); setDirty(); });
document.querySelector('#syncSlashBtn')?.addEventListener('click', syncSlash);
commandSearchEl?.addEventListener('input', applyCommandFilter);
commandFilterEl?.addEventListener('change', applyCommandFilter);
configForm.addEventListener('input', () => setDirty());
configForm.addEventListener('change', () => setDirty());
window.addEventListener('hashchange', () => {
  const group = getCommandGroupFromHash();
  if (!group) {
    showCommandSections({ updateHash: false });
    return;
  }
  showPage('commands-general');
  ensureCommandSections();
  activateCommandSection(group, { updateHash: false });
});
window.addEventListener('beforeunload', (e) => { if (isDirty) { e.preventDefault(); e.returnValue = ''; } });

refreshStatus();

// Poll bot status mỗi 60 giây, pause khi tab không active để tiết kiệm requests
let _statusInterval = null;
function _startStatusPoll() {
  if (_statusInterval) return;
  _statusInterval = setInterval(refreshStatus, 60_000);
}
function _stopStatusPoll() {
  clearInterval(_statusInterval);
  _statusInterval = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) _stopStatusPoll();
  else { refreshStatus(); _startStatusPoll(); }
});
_startStatusPoll();

loadServers();

// ── Music prefix live preview ─────────────────────────────────────────────────
// Updates the command table in the Music section whenever the prefix input changes.
function updateMusicCmdTable() {
  const el = document.querySelector('#musicPrefix');
  const p = el?.value?.trim() || 'hb';
  const rows = [
    ['mc-play',  `${p} play &lt;link/tên&gt;`],
    ['mc-skip',  `${p} skip`],
    ['mc-stop',  `${p} stop`],
    ['mc-pause', `${p} pause / ${p} resume`],
    ['mc-queue', `${p} queue`],
    ['mc-np',    `${p} np`],
    ['mc-loop',  `${p} loop`],
    ['mc-vol',   `${p} volume &lt;0–200&gt;`],
  ];
  for (const [id, html] of rows) {
    const cell = document.querySelector(`#${id}`);
    if (cell) cell.innerHTML = html;
  }
}
document.querySelector('#musicPrefix')?.addEventListener('input', updateMusicCmdTable);