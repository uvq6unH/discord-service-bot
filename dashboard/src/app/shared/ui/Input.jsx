/**
 * shared/ui/Input.jsx — Community Operations Platform
 */
import React from 'react';

export function Input({ label, error, hint, className = '', ...props }) {
  return (
    <div className={`field ${className}`}>
      {label && <label className="field__label">{label}</label>}
      <input className={`field__input ${error ? 'field__input--error' : ''}`} {...props} />
      {hint  && !error && <span className="field__hint">{hint}</span>}
      {error && <span className="field__error">{error}</span>}
    </div>
  );
}

export function Select({ label, error, hint, children, className = '', ...props }) {
  return (
    <div className={`field ${className}`}>
      {label && <label className="field__label">{label}</label>}
      <select className={`field__select ${error ? 'field__input--error' : ''}`} {...props}>
        {children}
      </select>
      {hint  && !error && <span className="field__hint">{hint}</span>}
      {error && <span className="field__error">{error}</span>}
    </div>
  );
}

export function Toggle({ label, hint, checked, onChange, disabled }) {
  return (
    <label className={`toggle ${disabled ? 'toggle--disabled' : ''}`}>
      <input
        type="checkbox"
        className="toggle__input"
        checked={checked}
        onChange={e => onChange?.(e.target.checked)}
        disabled={disabled}
      />
      <span className="toggle__track">
        <span className="toggle__thumb" />
      </span>
      {label && (
        <span className="toggle__content">
          <span className="toggle__label">{label}</span>
          {hint && <span className="toggle__hint">{hint}</span>}
        </span>
      )}
    </label>
  );
}

export function Badge({ children, variant = 'default' }) {
  return <span className={`badge badge--${variant}`}>{children}</span>;
}
