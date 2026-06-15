/**
 * shared/ui/Modal.jsx — Community Operations Platform
 */
import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export function Modal({ open, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => e.target === e.currentTarget && onClose?.()}
        >
          <motion.div
            className={`modal modal--${size}`}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {title && (
              <div className="modal__header">
                <span className="modal__title">{title}</span>
                <button className="modal__close" onClick={onClose} aria-label="Đóng">✕</button>
              </div>
            )}
            <div className="modal__body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
