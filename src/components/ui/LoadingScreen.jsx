import styles from './LoadingScreen.module.css';

export function LoadingScreen() {
  return (
    <div className={styles.overlay}>
      <div className={styles.loaderBox}>
        <div className={styles.spinnerWrapper}>
          <div className={styles.spinner} />
          <div className={styles.logoBadge}>#</div>
        </div>
        <div className={styles.brandName}>İLLAKİ</div>
        <div className={styles.loadingBarTrack}>
          <div className={styles.loadingBarProgress} />
        </div>
      </div>
    </div>
  );
}
