import { navItems, pages, pageTitles, pageOrder, mobilePageSelect } from './state.js';

// ── Navigation ───────────────────────────────────────────────────────────────
export function showPage(name) {
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
