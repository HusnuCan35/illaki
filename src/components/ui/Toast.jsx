import { useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useUIStore } from '../../stores';
import styles from './Toast.module.css';

const ICONS = {
  success: <CheckCircle2 size={16} />,
  error:   <XCircle size={16} />,
  warning: <AlertTriangle size={16} />,
  info:    <Info size={16} />,
};

function ToastItem({ toast }) {
  const { removeToast } = useUIStore();

  useEffect(() => {
    const timer = setTimeout(() => removeToast(toast.id), toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [toast.id]);

  return (
    <div className={`${styles.toast} ${styles[toast.type || 'info']}`} role="alert">
      <span className={styles.icon}>{ICONS[toast.type] || ICONS.info}</span>
      <span className={styles.message}>{toast.message}</span>
      <button
        className={styles.dismiss}
        onClick={() => removeToast(toast.id)}
        aria-label="Kapat"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useUIStore();
  if (!toasts.length) return null;

  return (
    <div className={styles.container} aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
