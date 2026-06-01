import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const lines = readFileSync('public/app.js', 'utf8').split('\n');

function slice(a, b) {
  return lines.slice(a - 1, b).join('\n');
}

mkdirSync('public/dashboard', { recursive: true });

const stateBlock = slice(43, 117)
  .replace(/^let isDirty = false;\r?\n/gm, '')
  .replace(/^let currentGuildId = null;\r?\n/gm, 'export let currentGuildId = null;\n')
  .replace(/^let /gm, 'export let ')
  .replace(/^const (navItems|pages|pageTitles|pageOrder|FIELDS|groupMap|commandLabels|commandGroupOrder|commandGroupMeta)/gm, 'export const $1');

writeFileSync('public/dashboard/state.js', `${stateBlock}\n`);

writeFileSync('public/dashboard/auth.js', `${slice(1, 41)}
`);

writeFileSync('public/dashboard/utils.js', `import {
  saveBar, saveMsg, configForm
} from './state.js';

export let isDirty = false;

export function esc(str) {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function setDirty(value = true) {
  isDirty = value;
  saveBar.style.display = isDirty ? 'flex' : 'none';
  if (isDirty) { saveMsg.textContent = 'Có thay đổi chưa lưu'; saveMsg.className = ''; }
}

export function showMsg(text, isError = false) {
  saveMsg.textContent = text;
  saveMsg.className = isError ? 'error' : 'success';
  saveBar.style.display = 'flex';
}
`);

const commandsBlock = slice(119, 564).replace(/^function /gm, 'export function ');

writeFileSync('public/dashboard/commands.js', `import { esc, setDirty } from './utils.js';
import {
  commandSearchEl, commandFilterEl, autoRepliesEl, selfRolesEl, FIELDS,
  groupMap, commandLabels, commandGroupOrder, commandGroupMeta
} from './state.js';

${commandsBlock}
`);

writeFileSync('public/dashboard/form.js', `import { esc, setDirty, showMsg } from './utils.js';
import {
  currentGuildId, configForm, autoRepliesEl, selfRolesEl, FIELDS
} from './state.js';
import {
  ensureCommandSections, activateCommandSection, showCommandSections, addCommandRow,
  readCommands, applyCommandFilter, getCommandGroupFromHash
} from './commands.js';

${slice(566, 624).replace(/^function /gm, 'export function ')}

${slice(626, 673).replace(/^function /gm, 'export function ')}

export function readForm() {
  const payload = { guildId: currentGuildId, commands: readCommands(), autoReplies: readAutoReplies(), selfRoles: readSelfRoles() };
  const bwEl = document.querySelector('#badWords');
  payload.badWords = bwEl ? bwEl.value.split(/\\r?\\n/).map(s => s.trim()).filter(Boolean) : [];
  for (const f of FIELDS) {
    const el = document.querySelector(\`#\${f}\`);
    if (el) payload[f] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return payload;
}
`);

writeFileSync('public/dashboard/nav.js', `import { navItems, pages, pageTitles, pageOrder, mobilePageSelect } from './state.js';

${slice(699, 723).replace(/^function /gm, 'export function ')}

export function bindNavigation() {
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
}
`);

writeFileSync('public/dashboard/guild.js', `import { setDirty, showMsg } from './utils.js';
import {
  currentGuildId, emptyState, configForm, saveBar, accessBanner, accessBannerMsg,
  guildNameEl, guildMetaEl, guildIconEl, mobileGuildNameEl, mobileGuildMetaEl,
  serverList, statusDot, statusText
} from './state.js';
import { fillForm, readForm } from './form.js';

${slice(725, 864).replace(/^async function /gm, 'export async function ').replace(/^function /gm, 'export function ')}
`);

writeFileSync('public/app.js', `import './dashboard/auth.js';
import { saveBtnBar, configForm, commandSearchEl, commandFilterEl } from './dashboard/state.js';
import { isDirty, setDirty } from './dashboard/utils.js';
import { showPage } from './dashboard/nav.js';
import { addCommandRow, applyCommandFilter, ensureCommandSections, activateCommandSection, showCommandSections, getCommandGroupFromHash } from './dashboard/commands.js';
import { addReplyRow, addSelfRoleRow } from './dashboard/form.js';
import { bindNavigation } from './dashboard/nav.js';
import { loadServers, refreshStatus, saveConfig, syncSlash } from './dashboard/guild.js';

bindNavigation();

saveBtnBar.addEventListener('click', saveConfig);
document.querySelector('#addCommandBtn')?.addEventListener('click', () => { addCommandRow(); setDirty(); });
document.querySelector('#addReplyBtn')?.addEventListener('click', () => { addReplyRow(); setDirty(); });
document.querySelector('#addSelfRoleBtn')?.addEventListener('click', () => { addSelfRoleRow(); setDirty(); });
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
setInterval(refreshStatus, 15000);
loadServers();
`);

writeFileSync('public/index.html', readFileSync('public/index.html', 'utf8').replace('app.js?v=14', 'app.js?v=15'));

console.log('Dashboard modules written');
