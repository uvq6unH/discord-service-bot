import React, { useState, useEffect, useRef } from 'react';

export default function IMEInput({
  value = '',
  onChange,
  onBlur,
  placeholder,
  className = 'form-input',
  style,
  type = 'text',
  ...props
}) {
  const [localValue, setLocalValue] = useState(value ?? '');
  const isComposingRef = useRef(false);

  // Sync external value when not currently composing
  useEffect(() => {
    if (!isComposingRef.current) {
      setLocalValue(value ?? '');
    }
  }, [value]);

  const handleChange = (e) => {
    const newVal = e.target.value;
    setLocalValue(newVal);
    if (!isComposingRef.current && onChange) {
      onChange(e);
    }
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = (e) => {
    isComposingRef.current = false;
    if (onChange) {
      onChange(e);
    }
  };

  const handleBlur = (e) => {
    if (isComposingRef.current) {
      isComposingRef.current = false;
    }
    if (onChange) {
      onChange(e);
    }
    if (onBlur) {
      onBlur(e);
    }
  };

  return (
    <input
      {...props}
      type={type}
      className={className}
      style={style}
      value={localValue}
      placeholder={placeholder}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onBlur={handleBlur}
    />
  );
}
