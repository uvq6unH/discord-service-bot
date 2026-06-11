import React from 'react';

// ── useTheme ──────────────────────────────────────────────────────────────────

export function useTheme() {
  const [theme, setTheme] = React.useState(() => {
    try { return localStorage.getItem('theme') || 'dark'; } catch { return 'dark'; }
  });

  React.useEffect(() => {
    const html = document.documentElement;
    html.classList.remove('theme-light', 'theme-dark');
    html.classList.add(theme === 'light' ? 'theme-light' : 'theme-dark');
    try { localStorage.setItem('theme', theme); } catch {}
  }, [theme]);

  return { theme, toggle: () => setTheme(t => t === 'dark' ? 'light' : 'dark') };
}

// ── ThemeToggle ───────────────────────────────────────────────────────────────

export function ThemeToggle({ theme, onToggle }) {
  const isLight = theme === 'light';
  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      title={isLight ? 'Chuyển sang dark mode' : 'Chuyển sang light mode'}
    >
      <i className={`ti ${isLight ? 'ti-moon' : 'ti-sun'}`} />
    </button>
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
      <i className="ti ti-robot empty-state__icon" />
      <h2>Chọn một server</h2>
      <p>Chọn server từ thanh bên trái để bắt đầu cấu hình bot.</p>
    </div>
  );
}

// ── InviteBanner ──────────────────────────────────────────────────────────────

export function InviteBanner({ inviteUrl }) {
  return (
    <div className="invite-banner">
      <i className="ti ti-robot-off" />
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

export function SectionCard({ title, icon, children, enabled, onToggle }) {
  return (
    <div className={`section-card ${enabled === false ? 'section-card--disabled' : ''}`}>
      <div className="section-card__header">
        {icon && <i className={`ti ${icon}`} />}
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
