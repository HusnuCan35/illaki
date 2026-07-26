import { useState, useEffect } from 'react';
import { Sparkles, Dices } from 'lucide-react';
import styles from './DiceRoller.module.css';

export function DiceRoller({ isOpen, onComplete, value = 6 }) {
  const [rolling, setRolling] = useState(true);
  const [displayValue, setDisplayValue] = useState(1);

  // Rotation angles for faces 1-6
  const ROTATIONS = {
    1: { x: 0, y: 0 },
    2: { x: 0, y: -90 },
    3: { x: -90, y: 0 },
    4: { x: 90, y: 0 },
    5: { x: 0, y: 90 },
    6: { x: 0, y: 180 },
  };

  useEffect(() => {
    if (!isOpen) return;
    setRolling(true);

    const timer = setTimeout(() => {
      setDisplayValue(value);
      setRolling(false);

      setTimeout(() => {
        if (onComplete) onComplete();
      }, 3000);
    }, 1500);

    return () => clearTimeout(timer);
  }, [isOpen, value]);

  if (!isOpen) return null;

  const targetRot = ROTATIONS[displayValue] || ROTATIONS[6];
  const cubeStyle = rolling
    ? { transform: 'rotateX(720deg) rotateY(1080deg) rotateZ(360deg)' }
    : { transform: `rotateX(${targetRot.x + 720}deg) rotateY(${targetRot.y + 720}deg)` };

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        <div className={styles.scene}>
          <div className={`${styles.cube} ${rolling ? styles.cubeSpinning : styles.cubeLanded}`} style={cubeStyle}>
            {/* Face 1 */}
            <div className={`${styles.face} ${styles.front}`}>
              <span className={styles.dot} />
            </div>
            {/* Face 2 */}
            <div className={`${styles.face} ${styles.right}`}>
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
            {/* Face 3 */}
            <div className={`${styles.face} ${styles.top}`}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
            {/* Face 4 */}
            <div className={`${styles.face} ${styles.bottom}`}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
            {/* Face 5 */}
            <div className={`${styles.face} ${styles.left}`}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
            {/* Face 6 */}
            <div className={`${styles.face} ${styles.back}`}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </div>
          </div>
        </div>

        {rolling ? (
          <div className={styles.statusText}>
            <Dices size={18} className={styles.spinIcon} />
            <span>3D Zar Dönüyor...</span>
          </div>
        ) : (
          <div className={styles.resultBadge}>
            <Sparkles size={20} color="#FFD700" />
            <span>Zar Sonucu: <strong>{displayValue}</strong></span>
            <span className={styles.points}>+10 Puan</span>
          </div>
        )}
      </div>
    </div>
  );
}
