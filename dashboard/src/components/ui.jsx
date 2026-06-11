import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sun, Moon, Bot } from 'lucide-react';

// ── useTheme ──────────────────────────────────────────────────────────────────

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

// ── ThemeToggle ───────────────────────────────────────────────────────────────

export function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      title={theme === 'dark' ? 'Chuyển sang Light mode' : 'Chuyển sang Dark mode'}
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

// ── PageHeader ────────────────────────────────────────────────────────────────

export function PageHeader({ title, subtitle, theme, onThemeToggle, children }) {
  return (
    <div className="page-header">
      <div className="page-header-row">
        <h1 className="page-title">{title}</h1>
        {onThemeToggle && <ThemeToggle theme={theme} onToggle={onThemeToggle} />}
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
      <Bot size={48} className="empty-state__icon" />
      <h2>Chọn một server</h2>
      <p>Chọn server từ thanh bên trái để bắt đầu cấu hình bot.</p>
    </div>
  );
}

// ── InviteBanner ──────────────────────────────────────────────────────────────

export function InviteBanner({ inviteUrl }) {
  return (
    <div className="invite-banner">
      <Bot size={20} />
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
  const filtered = type != null
    ? channels.filter(c => c.type === type)
    : channels;

  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <select
        className="form-select"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {filtered.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
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
      <select
        className="form-select"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {visible.map(r => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
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
        type="number"
        className="form-input"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
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
        type={type}
        className="form-input"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

// ── SectionCard ───────────────────────────────────────────────────────────────
// icon prop now accepts a Lucide component (Icon) OR a legacy "ti-xxx" string
// Pass Icon={SomeIcon} for new usage; icon="ti-xxx" still works via <i> fallback

export function SectionCard({ title, icon, Icon: IconComponent, children, enabled, onToggle }) {
  return (
    <div className={`section-card ${enabled === false ? 'section-card--disabled' : ''}`}>
      <div className="section-card__header">
        {IconComponent && <IconComponent size={16} />}
        {!IconComponent && icon && <i className={`ti ${icon}`} />}
        <h3 className="section-card__title">{title}</h3>
        {onToggle != null && (
          <Toggle
            checked={enabled ?? false}
            onChange={onToggle}
            label=""
          />
        )}
      </div>
      {(enabled !== false) && (
        <div className="section-card__body">{children}</div>
      )}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

export function Spinner() {
  return <div className="spinner" />;
}
