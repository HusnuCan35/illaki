import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import styles from './JackpotMachine.module.css';

const SYMBOLS = ['🍒', '🍋', '🍇', '🍉', '⭐', '💎', '7️⃣'];

export function JackpotMachine({ isOpen, onComplete, isWin = false }) {
  const [phase, setPhase] = useState('enter'); // 'enter' | 'spinning' | 'stopping' | 'landed'
  const [results, setResults] = useState(['7️⃣', '7️⃣', '7️⃣']); // final symbols

  useEffect(() => {
    if (!isOpen) return;

    // Determine results
    if (isWin) {
      setResults(['7️⃣', '7️⃣', '7️⃣']); // Jackpot
    } else {
      // Pick random symbols, ensure they don't all match
      let r = [
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      ];
      if (r[0] === r[1] && r[1] === r[2]) {
        r[2] = SYMBOLS[(SYMBOLS.indexOf(r[2]) + 1) % SYMBOLS.length]; // guarantee a miss
      }
      setResults(r);
    }

    setPhase('enter');

    const t1 = setTimeout(() => setPhase('spinning'), 300);
    const t2 = setTimeout(() => setPhase('stopping'), 2000); // 2s spin
    const t3 = setTimeout(() => setPhase('landed'), 3800); // 1.8s to stop all reels
    const t4 = setTimeout(() => {
      if (onComplete) onComplete();
    }, 6000); // stay visible longer

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [isOpen, isWin]);

  if (!isOpen) return null;

  const isSpinning = phase === 'spinning' || phase === 'stopping';
  const isLanded = phase === 'landed';

  return (
    <div className={styles.overlay}>
      {isLanded && isWin && (
        <div className={styles.particles} aria-hidden="true">
          {Array.from({ length: 24 }).map((_, i) => (
            <span key={i} className={styles.particle} style={{ '--i': i }} />
          ))}
        </div>
      )}

      <div className={`${styles.container} ${isLanded && isWin ? styles.containerWin : ''}`}>
        <div className={styles.machineBody}>
          <div className={styles.glassPanel}>
            <div className={styles.slotWindow}>
              
              {/* Reel 1 */}
              <div className={styles.reelContainer}>
                <div className={`${styles.reel} ${isSpinning ? styles.spinning1 : ''} ${phase === 'stopping' || isLanded ? styles.stopped1 : ''}`}>
                  {/* Fake items for the spinning blur */}
                  <div className={styles.symbolItem}>🍒</div>
                  <div className={styles.symbolItem}>⭐</div>
                  <div className={styles.symbolItem}>🍉</div>
                  <div className={styles.symbolItem}>💎</div>
                  <div className={styles.symbolItem}>🍋</div>
                  {/* The final result is the last item so it lands on it */}
                  <div className={styles.symbolItem}>{results[0]}</div>
                </div>
              </div>

              <div className={styles.divider} />

              {/* Reel 2 */}
              <div className={styles.reelContainer}>
                <div className={`${styles.reel} ${isSpinning ? styles.spinning2 : ''} ${phase === 'stopping' || isLanded ? styles.stopped2 : ''}`}>
                  <div className={styles.symbolItem}>💎</div>
                  <div className={styles.symbolItem}>🍋</div>
                  <div className={styles.symbolItem}>7️⃣</div>
                  <div className={styles.symbolItem}>🍒</div>
                  <div className={styles.symbolItem}>⭐</div>
                  <div className={styles.symbolItem}>{results[1]}</div>
                </div>
              </div>

              <div className={styles.divider} />

              {/* Reel 3 */}
              <div className={styles.reelContainer}>
                <div className={`${styles.reel} ${isSpinning ? styles.spinning3 : ''} ${phase === 'stopping' || isLanded ? styles.stopped3 : ''}`}>
                  <div className={styles.symbolItem}>⭐</div>
                  <div className={styles.symbolItem}>🍉</div>
                  <div className={styles.symbolItem}>🍒</div>
                  <div className={styles.symbolItem}>7️⃣</div>
                  <div className={styles.symbolItem}>💎</div>
                  <div className={styles.symbolItem}>{results[2]}</div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {(phase === 'stopping' || isLanded) && (
          <div className={`${styles.resultArea} ${isLanded ? styles.resultAreaVisible : ''}`}>
            {isWin ? (
              <>
                <div className={styles.jackpotTitle}>🎰 JACKPOT!</div>
                <div className={styles.jackpotSubtitle}>İnanılmaz Şans!</div>
                <div className={styles.pointsBadge}>
                  <Sparkles size={16} />
                  <span>+1000 Puan</span>
                </div>
              </>
            ) : (
              <>
                <div className={styles.loseTitle}>ŞANSINI DENEDİN</div>
                <div className={styles.loseSubtitle}>Tekrar dene...</div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
