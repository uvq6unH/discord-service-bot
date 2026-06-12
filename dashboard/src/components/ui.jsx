import React, { useState, useEffect, useCallback, useContext, createContext } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, ShieldOff } from 'lucide-react';

// ── ThemeContext ───────────────────────────────────────────────────────────────

export const ThemeContext = createContext({ theme: 'dark', setTheme: () => {} });

// ── useTheme — 4 themes: dark | light | midnight | discord ───────────────────

export function useTheme() {
  const THEMES = ['dark', 'light', 'midnight', 'discord'];

  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved && THEMES.includes(saved)) return saved;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    const html = document.documentElement;
    // Remove all theme classes first
    THEMES.forEach(t => html.classList.remove(`theme-${t}`));
    html.classList.add(`theme-${theme}`);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const setTheme = useCallback((t) => {
    if (THEMES.includes(t)) setThemeState(t);
  }, []);

  // Legacy toggle (dark <-> light)
  const toggleTheme = useCallback(() => {
    setThemeState(t => t === 'light' ? 'dark' : 'light');
  }, []);

  return { theme, setTheme, toggleTheme };
}

// ── ThemePicker — 4 color dots ────────────────────────────────────────────────

export function ThemePicker() {
  const { theme, setTheme } = useContext(ThemeContext);
  const themes = [
    { id: 'dark',     label: 'Dark' },
    { id: 'light',    label: 'Light' },
    { id: 'midnight', label: 'Midnight' },
    { id: 'discord',  label: 'Discord' },
  ];
  return (
    <div className="theme-picker" role="group" aria-label="Chọn theme">
      {themes.map(t => (
        <button
          key={t.id}
          className={`theme-dot theme-dot--${t.id} ${theme === t.id ? 'theme-dot--active' : ''}`}
          onClick={() => setTheme(t.id)}
          title={t.label}
          aria-label={t.label}
          aria-pressed={theme === t.id}
        />
      ))}
    </div>
  );
}

// ── ThemeToggle (legacy compat — được dùng ở page headers) ───────────────────
// Giờ thay thế bằng ThemePicker ở sidebar, nhưng giữ lại để backward compat

export function ThemeToggle() {
  return null; // Picker đã ở sidebar, không cần icon toggle nữa
}

// ── PageHeader ────────────────────────────────────────────────────────────────

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div className="page-header-row">
        <h1 className="page-title">{title}</h1>
        {children}
      </div>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </div>
  );
}

// ── SaveBar ───────────────────────────────────────────────────────────────────

export function SaveBar({ onSave, status }) {
  return (
    <div className={`save-bar save-bar--${status}`}>
      <span className="save-bar__msg">
        {status === 'saving' && 'Đang lưu…'}
        {status === 'saved'  && '✓ Đã lưu thành công'}
        {status === 'error'  && '✗ Lỗi khi lưu — thử lại'}
        {status === 'idle'   && 'Có thay đổi chưa lưu'}
      </span>
      <button
        className="btn btn-primary"
        onClick={onSave}
        disabled={status === 'saving'}
      >
        {status === 'saving' ? 'Đang lưu…' : 'Lưu thay đổi'}
      </button>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

export function EmptyState() {
  return (
    <div className="empty-state">
      <Bot size={44} strokeWidth={1.5} className="empty-state__icon" />
      <h2>Chọn một server</h2>
      <p>Chọn server từ thanh bên trái để bắt đầu cấu hình bot.</p>
    </div>
  );
}

// ── InviteBanner ──────────────────────────────────────────────────────────────

export function InviteBanner({ inviteUrl }) {
  return (
    <div className="invite-banner">
      <Bot size={20} strokeWidth={1.75} />
      <div>
        <h3>Bot chưa ở trong server này</h3>
        <p>Mời bot để sử dụng dashboard.</p>
      </div>
      {inviteUrl && (
        <a href={inviteUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
          Mời Bot
        </a>
      )}
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="toggle-row">
      <div className="toggle-text">
        <span className="toggle-label">{label}</span>
        {hint && <span className="toggle-hint">{hint}</span>}
      </div>
      <div className={`toggle ${checked ? 'toggle--on' : ''}`} onClick={() => onChange(!checked)}>
        <div className="toggle-thumb" />
      </div>
    </label>
  );
}

// ── ChannelSelect ─────────────────────────────────────────────────────────────

export function ChannelSelect({ value, onChange, channels, label, placeholder = '-- Chọn kênh --', type }) {
  const filtered = type != null ? channels.filter(c => c.type === type) : channels;
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <select className="form-select" value={value ?? ''} onChange={e => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {filtered.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}

// ── RoleSelect ────────────────────────────────────────────────────────────────

export function RoleSelect({ value, onChange, roles, label, placeholder = '-- Chọn role --' }) {
  const visible = roles.filter(r => r.name !== '@everyone');
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <select className="form-select" value={value ?? ''} onChange={e => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {visible.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    </div>
  );
}

// ── NumberInput ───────────────────────────────────────────────────────────────

export function NumberInput({ value, onChange, label, min, max, step = 1 }) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <input
        type="number" className="form-input"
        value={value ?? ''} min={min} max={max} step={step}
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  );
}

// ── TextInput ─────────────────────────────────────────────────────────────────

export function TextInput({ value, onChange, label, placeholder, type = 'text' }) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <input
        type={type} className="form-input"
        value={value ?? ''} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

// ── SectionCard — Double-Bezel ────────────────────────────────────────────────

export function SectionCard({ title, icon, children, enabled, onToggle }) {
  return (
    <div className={`section-card ${enabled === false ? 'section-card--disabled' : ''}`}>
      <div className="section-card__inner">
        <div className="section-card__header">
          {icon && (
            <div className="section-card__header-icon">
              {typeof icon === 'string' ? <i className={`ti ${icon}`} /> : icon}
            </div>
          )}
          <h3 className="section-card__title">{title}</h3>
          {onToggle != null && (
            <Toggle checked={enabled ?? false} onChange={onToggle} label="" />
          )}
        </div>
        {(enabled !== false) && (
          <div className="section-card__body">{children}</div>
        )}
      </div>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

export function Spinner() {
  return <div className="spinner" />;
}

// ── RoleBadge ─────────────────────────────────────────────────────────────────

const ROLE_COLORS = {
  owner:     { bg: 'rgba(234,179,8,.15)',   border: 'rgba(234,179,8,.3)',   color: '#eab308' },
  admin:     { bg: 'rgba(239,68,68,.12)',   border: 'rgba(239,68,68,.25)',  color: '#ef4444' },
  moderator: { bg: 'rgba(88,101,242,.15)', border: 'rgba(88,101,242,.3)',  color: '#5865f2' },
  viewer:    { bg: 'rgba(96,96,120,.15)',   border: 'rgba(96,96,120,.3)',   color: '#a0a0b8' },
};

export function RoleBadge({ role }) {
  if (!role) return null;
  const s = ROLE_COLORS[role] ?? ROLE_COLORS.viewer;
  const labels = { owner: 'Owner', admin: 'Admin', moderator: 'Moderator', viewer: 'Viewer' };
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
    }}>
      {labels[role] ?? role}
    </span>
  );
}

// ── PermissionGuard ───────────────────────────────────────────────────────────

const ROLE_RANK = { owner: 4, admin: 3, moderator: 2, viewer: 1 };

export function PermissionGuard({ user, required, children, fallback }) {
  const userRank     = user?.role ? (ROLE_RANK[user.role] ?? 0) : 0;
  const requiredRank = ROLE_RANK[required] ?? 0;

  if (userRank < requiredRank) {
    return fallback ?? (
      <div className="permission-denied">
        <ShieldOff size={28} strokeWidth={1.75} />
        <p>
          Bạn cần quyền <strong>{required}</strong> để xem mục này.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
