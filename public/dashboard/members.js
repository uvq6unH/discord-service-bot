import { esc } from './utils.js';

// ── DOM References ──────────────────────────────────────────────────────────
const memberTotalCount = document.querySelector('#memberTotalCount');
const memberSearchInput = document.querySelector('#memberSearchInput');
const memberRoleFilter = document.querySelector('#memberRoleFilter');
const memberGrid = document.querySelector('#memberGrid');

let isInitialized = false;

// ── Initialize Event Listeners ───────────────────────────────────────────────
export function initMembersPage() {
  if (isInitialized) return;
  
  memberSearchInput?.addEventListener('input', renderMembersPage);
  memberRoleFilter?.addEventListener('change', renderMembersPage);
  
  isInitialized = true;
}

// ── Render Members Page ──────────────────────────────────────────────────────
export function renderMembersPage() {
  if (!window.currentGuildData) return;
  
  const members = window.currentGuildData.members ?? [];
  const roles = window.currentGuildData.roles ?? [];
  
  // 1. Populate role dropdown filter (only do this if dropdown is empty or needs update)
  const currentSelectedRole = memberRoleFilter?.value || 'all';
  if (memberRoleFilter && memberRoleFilter.options.length <= 1) {
    memberRoleFilter.replaceChildren();
    
    const defOpt = document.createElement('option');
    defOpt.value = 'all';
    defOpt.textContent = 'Tất cả vai trò';
    memberRoleFilter.append(defOpt);
    
    // Sort roles by position (highest position first)
    const sortedRoles = [...roles].sort((a, b) => b.rawPosition - a.rawPosition);
    for (const r of sortedRoles) {
      if (r.name === '@everyone') continue;
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      if (r.id === currentSelectedRole) opt.selected = true;
      memberRoleFilter.append(opt);
    }
  }

  // 2. Filter list of members
  const query = memberSearchInput?.value.trim().toLowerCase() || '';
  const selectedRoleId = memberRoleFilter?.value || 'all';
  
  const filtered = members.filter(m => {
    // Search query match (displayName, username/tag, ID)
    const matchesSearch = !query || 
      m.displayName.toLowerCase().includes(query) || 
      m.name.toLowerCase().includes(query) || 
      m.id.includes(query);
      
    // Role match
    const matchesRole = selectedRoleId === 'all' || (m.roles && m.roles.includes(selectedRoleId));
    
    return matchesSearch && matchesRole;
  });
  
  // 3. Update count
  if (memberTotalCount) {
    memberTotalCount.textContent = filtered.length;
  }
  
  // 4. Render cards list
  if (!memberGrid) return;
  memberGrid.replaceChildren();
  
  if (filtered.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'no-roles-hint';
    emptyMsg.style.gridColumn = '1 / -1';
    emptyMsg.style.textAlign = 'center';
    emptyMsg.style.padding = '30px';
    emptyMsg.style.fontSize = '14px';
    emptyMsg.textContent = 'Không tìm thấy thành viên nào khớp với bộ lọc.';
    memberGrid.append(emptyMsg);
    return;
  }
  
  // Render cards
  for (const m of filtered) {
    const card = document.createElement('div');
    card.className = 'member-card';
    
    // Build avatar element
    let avatarHtml;
    if (m.avatar) {
      avatarHtml = `<img class="member-card-avatar" src="${esc(m.avatar)}" alt="${esc(m.displayName)}" onerror="this.onerror=null; this.replaceWith(document.createTextNode('${esc(m.displayName.charAt(0).toUpperCase())}'))" />`;
    } else {
      avatarHtml = `<span class="member-card-avatar member-chip-avatar" style="width: 48px; height: 48px; font-size: 18px;">${esc(m.displayName.charAt(0).toUpperCase())}</span>`;
    }
    
    // Build role badges
    let roleBadgesHtml = '';
    if (m.roles && m.roles.length) {
      // Find role info for each member's role and sort by position
      const memberRoles = roles
        .filter(r => m.roles.includes(r.id) && r.name !== '@everyone')
        .sort((a, b) => b.rawPosition - a.rawPosition);
        
      roleBadgesHtml = memberRoles.map(r => {
        const style = r.color ? `color: ${r.color}; border-color: ${r.color}33; background: ${r.color}15;` : '';
        return `<span class="member-role-badge" style="${style}" title="${esc(r.name)}">${esc(r.name)}</span>`;
      }).join('');
    }
    
    // Format joined date
    let joinedDateStr = 'Không rõ';
    if (m.joinedAt) {
      try {
        const d = new Date(m.joinedAt);
        joinedDateStr = d.toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' });
      } catch {}
    }
    
    card.innerHTML = `
      <div class="member-card-top">
        ${avatarHtml}
        <div class="member-card-info">
          <p class="member-card-display-name" title="${esc(m.displayName)}">${esc(m.displayName)}</p>
          <p class="member-card-username" title="${esc(m.name)}">${esc(m.name)}</p>
          <div class="member-card-id">${esc(m.id)}</div>
        </div>
      </div>
      <div class="member-card-roles">
        ${roleBadgesHtml || '<span class="no-roles-hint" style="font-size: 10px;">Không có vai trò</span>'}
      </div>
      <div class="member-card-joined">
        <i class="ti ti-calendar-event"></i>
        <span>Đã tham gia: ${esc(joinedDateStr)}</span>
      </div>
    `;
    
    memberGrid.append(card);
  }
}
