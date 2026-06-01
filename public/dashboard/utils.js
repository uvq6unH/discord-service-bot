import {
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
