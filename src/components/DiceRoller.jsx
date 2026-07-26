import { useState, useEffect } from 'react';
import { Dices, Sparkles } from 'lucide-react';
import styles from './DiceRoller.module.css';

export function DiceRoller({ isOpen, onComplete, value = 6 }) {
  const [rolling, setRolling] = useState(true);
  const [displayValue, setDisplayValue] = useState(1);

  useEffect(() => {
    if (!isOpen) return;
    setRolling(true);

    // Hızlı rastgele rakam dönme efekti
    const interval = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * 6) + 1);
    }, 80);

    // 1.2 saniye sonra dur ve gerçek değeri göster
    const timer = setTimeout(() => {
      clearInterval(interval);
      setDisplayValue(value);
      setRolling(false);

      // 2.5 saniye sonra kapat
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 2500);
    }, 1200);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [isOpen, value]);

  if (!isOpen) return null;

  const DICE_FACES = {
    1: '⚀',
    2: '⚁',
    3: '⚂',
    4: '⚃',
    5: '⚄',
    6: '⚅',
  };

  return (
    <div className={styles.overlay}>
      <div className={`${styles.card} ${rolling ? styles.rollingCard : ''}`}>
        <div className={`${styles.diceCube} ${rolling ? styles.spinAnimation : styles.landAnimation}`}>
          <span className={styles.diceEmoji}>{DICE_FACES[displayValue] || '🎲'}</span>
        </div>

        {rolling ? (
          <div className={styles.statusText}>
            <Dices size={18} className={styles.spinningIcon} />
            <span>Zar Atılıyor...</span>
          </div>
        ) : (
          <div className={styles.resultText}>
            <div className={styles.valueTitle}>
              <Sparkles size={18} color="#FFD700" />
              Zar Sonucu: <strong>{displayValue}</strong>
            </div>
            <div className={styles.rewardBadge}>+10 Puan Kazandın!</div>
          </div>
        )}
      </div>
    </div>
  );
}
