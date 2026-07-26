import styles from './LoadingScreen.module.css';
import { Hash } from 'lucide-react';

export function LoadingScreen() {
  return (
    <div className={styles.container}>
      {/* Background Glowing Ambient Orbs */}
      <div className={`${styles.orb} ${styles.orb1}`} />
      <div className={`${styles.orb} ${styles.orb2}`} />
      <div className={`${styles.orb} ${styles.orb3}`} />

      {/* Glassmorphism Card */}
      <div className={styles.glassCard}>
        <div className={styles.iconContainer}>
          <div className={styles.pulseRing} />
          <div className={styles.logoBadge}>
            <Hash size={36} className={styles.logoIcon} />
          </div>
        </div>

        <h1 className={styles.brandTitle}>İLLAKİ</h1>
        <p className={styles.tagline}>Güvenli, Şifreli & Anlık İletişim</p>

        {/* Animated Progress Bar */}
        <div className={styles.progressBarWrapper}>
          <div className={styles.progressBarFill} />
        </div>

        <div className={styles.statusText}>Uygulama Hazırlanıyor...</div>
      </div>
    </div>
  );
}
