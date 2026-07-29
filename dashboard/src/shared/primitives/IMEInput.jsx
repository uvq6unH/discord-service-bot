import React, { useState, useEffect, useRef, useCallback } from 'react';

export default function IMEInput({
  value = '',
  onChange,
  onBlur,
  onFocus,
  placeholder,
  className = 'form-input',
  style,
  type = 'text',
  multiline = false,
  rows = 3,
  ...props
}) {
  const [localValue, setLocalValue] = useState(value ?? '');
  const isFocusedRef = useRef(false);
  const debounceTimerRef = useRef(null);

  // Sync external value ONLY when user is not actively focused/editing
  useEffect(() => {
    if (!isFocusedRef.current) {
      setLocalValue(value ?? '');
    }
  }, [value]);

  const flushParentChange = useCallback((val, originalTarget) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (onChange) {
      const syntheticEvt = {
        target: {
          name: originalTarget?.name,
          value: val,
        }
      };
      onChange(syntheticEvt);
    }
  }, [onChange]);

  const handleChange = (e) => {
    const newVal = e.target.value;
    setLocalValue(newVal);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const targetInfo = { name: e.target.name };
    debounceTimerRef.current = setTimeout(() => {
      flushParentChange(newVal, targetInfo);
    }, 250);
  };

  const handleFocus = (e) => {
    isFocusedRef.current = true;
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e) => {
    isFocusedRef.current = false;
    // Flush any pending change immediately on blur
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (onChange) {
      onChange(e);
    }
    if (onBlur) {
      onBlur(e);
    }
  };

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  if (multiline) {
    return (
      <textarea
        {...props}
        rows={rows}
        className={className}
        style={style}
        value={localValue}
        placeholder={placeholder}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    );
  }

  return (
    <input
      {...props}
      type={type}
      className={className}
      style={style}
      value={localValue}
      placeholder={placeholder}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}
