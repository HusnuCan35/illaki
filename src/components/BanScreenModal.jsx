import { ShieldAlert, Calendar, Clock, UserX, ArrowLeft } from 'lucide-react';
import styles from './BanScreenModal.module.css';

export function BanScreenModal({ banInfo, spaceName, onLeave }) {
  if (!banInfo) return null;

  const isTemporary = banInfo.banType === 'temporary';
  const expiresDate = banInfo.expiresAt ? new Date(banInfo.expiresAt).toLocaleString('tr-TR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : null;

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.iconCircle}>
          <ShieldAlert size={48} color="#FF4D4D" />
        </div>

        <h2 className={styles.title}>Bu Sunucudan Yasaklandınız</h2>
        <p className={styles.subtitle}>
          <strong style={{ color: '#FFFFFF' }}>{spaceName || 'Sunucu'}</strong> sunucusuna erişiminiz kısıtlandı.
        </p>

        <div className={styles.detailsBox}>
          <div className={styles.detailRow}>
            <span className={styles.label}>Yasaklama Tipi:</span>
            <span className={`${styles.badge} ${isTemporary ? styles.badgeWarning : styles.badgeDanger}`}>
              {isTemporary ? 'Süreli Yasaklama' : 'Süresiz (Kalıcı) Yasaklama'}
            </span>
          </div>

          {isTemporary && expiresDate && (
            <div className={styles.detailRow}>
              <span className={styles.label}>Erişim Açılış Tarihi:</span>
              <span className={styles.value}>
                <Clock size={14} style={{ display: 'inline', marginRight: 4 }} />
                {expiresDate}
              </span>
            </div>
          )}

          <div className={styles.detailRow}>
            <span className={styles.label}>Yasaklayan Yönetici:</span>
            <span className={styles.value}>{banInfo.bannedBy || 'Sunucu Yöneticisi'}</span>
          </div>

          <div className={styles.reasonSection}>
            <span className={styles.reasonLabel}>Yasaklama Sebebi:</span>
            <div className={styles.reasonContent}>
              "{banInfo.reason || 'Açıklama belirtilmedi.'}"
            </div>
          </div>
        </div>

        <button className={styles.actionBtn} onClick={onLeave}>
          <ArrowLeft size={16} />
          Sunuculardan Ayrıl
        </button>
      </div>
    </div>
  );
}
