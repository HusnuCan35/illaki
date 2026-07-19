import styles from './LoadingScreen.module.css';

export function LoadingScreen() {
  return (
    <div className={styles.container}>
      <div className={styles.loaderWrapper}>
        <div className={styles.spinner}></div>
        <div className={styles.innerLogo}>İLLAKİ</div>
      </div>
      <div className={styles.text}>Yükleniyor...</div>
    </div>
  );
}
