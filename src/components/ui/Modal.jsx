import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

/**
 * Modal — Glassmorphism overlay modal
 */
export function Modal({ isOpen, onClose, title, children, width = 440 }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      dialog.showModal?.();
    } else {
      dialog.close?.();
    }
  }, [isOpen]);

  // Close on backdrop click
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick} role="presentation">
      <div
        className={styles.modal}
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header */}
        <div className={styles.header}>
          <h2 id="modal-title" className={styles.title}>{title}</h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
