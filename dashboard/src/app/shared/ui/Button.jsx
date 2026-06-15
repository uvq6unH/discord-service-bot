/**
 * shared/ui/Button.jsx — Community Operations Platform
 */
import React from 'react';

/**
 * Button
 * @param {'primary'|'secondary'|'ghost'|'danger'} variant
 * @param {'sm'|'md'|'lg'} size
 */
export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon: Icon,
  iconRight: IconRight,
  className = '',
  disabled,
  ...props
}) {
  const cls = ['btn', `btn--${variant}`, `btn--${size}`, className].filter(Boolean).join(' ');
  return (
    <button
      className={cls}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="btn__spinner" />}
      {!loading && Icon && <Icon size={14} strokeWidth={1.75} />}
      {children && <span>{children}</span>}
      {!loading && IconRight && <IconRight size={14} strokeWidth={1.75} />}
    </button>
  );
}
