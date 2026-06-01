import { setDirty, showMsg } from './utils.js';
import {
  currentGuildId, setCurrentGuildId, emptyState, configForm, saveBar, accessBanner, accessBannerMsg,
  guildNameEl, guildMetaEl, guildIconEl, mobileGuildNameEl, mobileGuildMetaEl,
  serverList, statusDot, statusText
} from './state.js';
import { fillForm, readForm } from './form.js';

// ── Load guild data ──────────────────────────────────────────────────────────
export async function fetchGuildData(guildId) {
  try {
    const res = await fetch(`/api/guild-data?guildId=${encodeURIComponent(guildId)}`);
    window.currentGuildData = res.ok ? await res.json() : { channels: [], roles: [] };
  } catch { window.currentGuildData = { channels: [], roles: [] }; }
}

export function populateDropdowns() {
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
export async function selectGuild(guild) {
  setCurrentGuildId(guild.id);
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
export async function loadServers() {
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
export async function refreshStatus() {
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
export async function saveConfig() {
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

export async function syncSlash() {
  if (!currentGuildId) return;
  const res = await fetch('/api/slash-sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId: currentGuildId }),
  });
  const r = await res.json();
  showMsg(r.synced ? `Đồng bộ thành công ${r.count} lệnh.` : `Lỗi: ${r.reason ?? r.error}`, !r.synced);
}