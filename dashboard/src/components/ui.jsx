import React, { useState, useEffect, useCallback, useContext, createContext } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sun, Moon, Robot, ShieldSlash } from '@phosphor-icons/react';

// ── ThemeContext ────────────────────────────────────────────────
export const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} });

// ── useTheme ────────────────────────────────────────────────────
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'light') {
      html.classList.add('theme-light');
      html.classList.remove('theme-dark');
    } else {
      html.classList.add('theme-dark');
      html.classList.remove('theme-light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  return { theme, toggleTheme };
}

// ── ThemeToggle ─────────────────────────────────────────────────
export function ThemeToggle() {
  const { theme, toggleTheme } = useContext(ThemeContext);
  return (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Chuyển sang Light mode' : 'Chuyển sang Dark mode'}
      aria-label={theme === 'dark' ? 'Chuyển sang Light mode' : 'Chuyển sang Dark mode'}
    >
      {theme === 'dark'
        ? <Sun size={16} weight="regular" />
        : <Moon size={16} weight="regular" />}
    </button>
  );
}

// ── PageHeader ──────────────────────────────────────────────────
export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div className="page-header-row">
        <h1 className="page-title">{title}</h1>
        <ThemeToggle />
        {children}
      </div>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </div>
  );
}

// ── SaveBar ─────────────────────────────────────────────────────
export function SaveBar({ onSave, status }) {
  return (
    <div className={`save-bar save-bar--${status}`} role="status" aria-live="polite">
      <span className="save-bar__msg">
        {status === 'saving' && 'Đang lưu...'}
        {status === 'saved'  && 'Da luu thanh cong'}
        {status === 'error'  && 'Luu that bai. Thu lai.'}
        {status === 'idle'   && 'Co thay doi chua luu'}
      </span>
      <button
        className="btn btn-primary btn-sm"
        onClick={onSave}
        disabled={status === 'saving'}
      >
        {status === 'saving' ? 'Dang luu...' : 'Luu thay doi'}
      </button>
    </div>
  );
}

// ── EmptyState ──────────────────────────────────────────────────
export function EmptyState() {
  return (
    <div className="empty-state" role="status">
      <Robot size={48} weight="thin" className="empty-state__icon" aria-hidden="true" />
      <h2>Chon mot server</h2>
      <p>Chon server tu thanh ben trai de bat dau cau hinh bot.</p>
    </div>
  );
}

// ── InviteBanner ────────────────────────────────────────────────
export function InviteBanner({ inviteUrl }) {
  return (
    <div className="invite-banner" role="status">
      <Robot size={20} weight="regular" aria-hidden="true" />
      <div>
        <h3>Bot chua o trong server nay</h3>
        <p>Moi bot de su dung dashboard.</p>
      </div>
      {inviteUrl && (
        <a href={inviteUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
          Moi bot
        </a>
      )}
    </div>
  );
}

// ── Toggle ──────────────────────────────────────────────────────
export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="toggle-row">
      <div className="toggle-text">
        <span className="toggle-label">{label}</span>
        {hint && <span className="toggle-hint">{hint}</span>}
      </div>
      <div
        className={`toggle ${checked ? 'toggle--on' : ''}`}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && onChange(!checked)}
      >
        <div className="toggle-thumb" />
      </div>
    </label>
  );
}

// ── ChannelSelect ───────────────────────────────────────────────
export function ChannelSelect({ value, onChange, channels, label, placeholder = '-- Chon kenh --', type }) {
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

// ── RoleSelect ──────────────────────────────────────────────────
export function RoleSelect({ value, onChange, roles, label, placeholder = '-- Chon role --' }) {
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

// ── NumberInput ─────────────────────────────────────────────────
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

// ── TextInput ───────────────────────────────────────────────────
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

// ── SectionCard ─────────────────────────────────────────────────
export function SectionCard({ title, icon, children, enabled, onToggle }) {
  return (
    <div className={`section-card ${enabled === false ? 'section-card--disabled' : ''}`}>
      <div className="section-card__header">
        {icon && (typeof icon === 'string' ? <i className={`ti ${icon}`} aria-hidden="true" /> : icon)}
        <h3 className="section-card__title">{title}</h3>
        {onToggle != null && (
          <Toggle checked={enabled ?? false} onChange={onToggle} label="" />
        )}
      </div>
      {enabled !== false && (
        <div className="section-card__body">{children}</div>
      )}
    </div>
  );
}

// ── Spinner ─────────────────────────────────────────────────────
export function Spinner() {
  return <div className="spinner" role="status" aria-label="Dang tai..." />;
}

// ── RoleBadge ───────────────────────────────────────────────────
const ROLE_COLORS = {
  owner:     { bg: 'rgba(234,179,8,.14)',  border: 'rgba(234,179,8,.28)',  color: '#eab308' },
  admin:     { bg: 'rgba(239,68,68,.12)',  border: 'rgba(239,68,68,.24)',  color: '#ef4444' },
  moderator: { bg: 'rgba(88,101,242,.14)', border: 'rgba(88,101,242,.28)', color: '#5865f2' },
  viewer:    { bg: 'rgba(96,96,120,.14)',  border: 'rgba(96,96,120,.28)',  color: '#9898b4' },
};

export function RoleBadge({ role }) {
  if (!role) return null;
  const s = ROLE_COLORS[role] ?? ROLE_COLORS.viewer;
  const labels = { owner: 'Owner', admin: 'Admin', moderator: 'Moderator', viewer: 'Viewer' };
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      display: 'inline-block',
    }}>
      {labels[role] ?? role}
    </span>
  );
}

// ── PermissionGuard ─────────────────────────────────────────────
const ROLE_RANK = { owner: 4, admin: 3, moderator: 2, viewer: 1 };

export function PermissionGuard({ user, required, children, fallback }) {
  const userRank     = user?.role ? (ROLE_RANK[user.role] ?? 0) : 0;
  const requiredRank = ROLE_RANK[required] ?? 0;

  if (userRank < requiredRank) {
    return fallback ?? (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 'var(--s2)', padding: 'var(--s5)', color: 'var(--text-3)',
        textAlign: 'center',
      }} role="alert">
        <ShieldSlash size={32} weight="regular" aria-hidden="true" />
        <p style={{ fontSize: 14, margin: 0 }}>
          Ban can quyen <strong style={{ color: 'var(--text-2)' }}>{required}</strong> de xem muc nay.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
