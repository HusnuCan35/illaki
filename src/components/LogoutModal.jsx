import { LogOut, X } from 'lucide-react';
import styles from './LogoutModal.module.css';

export function LogoutModal({ isOpen, onClose, onConfirm, title = "Hesaptan Çıkış Yap", message = "Hesabınızdan çıkış yapmak istediğinize emin misiniz? Oturumunuz kapatılacak." }) {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modalCard}>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={16} />
        </button>

        <div className={styles.iconBadge}>
          <LogOut size={28} className={styles.logoutIcon} />
        </div>

        <h3 className={styles.title}>{title}</h3>
        <p className={styles.message}>{message}</p>

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>
            İptal
          </button>
          <button className={styles.confirmBtn} onClick={onConfirm}>
            <LogOut size={16} /> Çıkış Yap
          </button>
        </div>
      </div>
    </div>
  );
}
