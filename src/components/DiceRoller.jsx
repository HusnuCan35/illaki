import { useState, useEffect, useRef } from 'react';
import { Sparkles, Dices } from 'lucide-react';
import styles from './DiceRoller.module.css';

// Hangi yüzde kaç nokta var — standart zar düzeni
const FACE_DOTS = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };

// Hedef yüzü öne getiren rotasyon açıları
const ROTATIONS = {
  1: { x: 0,   y: 0   },   // front
  2: { x: 0,   y: -90 },   // right
  3: { x: -90, y: 0   },   // top
  4: { x: 90,  y: 0   },   // bottom
  5: { x: 0,   y: 90  },   // left
  6: { x: 0,   y: 180 },   // back
};

// Her yüzün nokta grid pozisyonları [col, row]
const DOT_POSITIONS = {
  1: [[2,2]],
  2: [[1,1],[3,3]],
  3: [[1,1],[2,2],[3,3]],
  4: [[1,1],[3,1],[1,3],[3,3]],
  5: [[1,1],[3,1],[2,2],[1,3],[3,3]],
  6: [[1,1],[3,1],[1,2],[3,2],[1,3],[3,3]],
};

function DiceFace({ face, value, className }) {
  const dots = DOT_POSITIONS[face] || [];
  return (
    <div className={`${styles.face} ${styles[className]}`}>
      {dots.map(([col, row], i) => (
        <span
          key={i}
          className={styles.dot}
          style={{ gridColumn: col, gridRow: row }}
        />
      ))}
    </div>
  );
}

export function DiceRoller({ isOpen, onComplete, value = 6 }) {
  const [phase, setPhase] = useState('enter'); // 'enter' | 'rolling' | 'landing' | 'landed'
  const [displayValue, setDisplayValue] = useState(1);
  const rollCountRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    setPhase('enter');
    setDisplayValue(1);

    const t1 = setTimeout(() => setPhase('rolling'), 300);
    const t2 = setTimeout(() => {
      setDisplayValue(value);
      setPhase('landing');
    }, 1800);
    const t3 = setTimeout(() => {
      setPhase('landed');
    }, 2600);
    const t4 = setTimeout(() => {
      if (onComplete) onComplete();
    }, 5000);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [isOpen, value]);

  if (!isOpen) return null;

  const isRolling  = phase === 'rolling';
  const isLanding  = phase === 'landing';
  const isLanded   = phase === 'landed';
  const showResult = isLanding || isLanded;

  const targetRot = ROTATIONS[displayValue] || ROTATIONS[1];

  let cubeTransform;
  if (isRolling) {
    cubeTransform = undefined; // handled by animation
  } else if (isLanding || isLanded) {
    cubeTransform = `rotateX(${targetRot.x + 720}deg) rotateY(${targetRot.y + 720}deg)`;
  } else {
    cubeTransform = 'rotateX(0deg) rotateY(0deg)';
  }

  const isJackpot = displayValue === 6;

  return (
    <div className={styles.overlay}>
      {/* Particle burst when landed */}
      {isLanded && (
        <div className={styles.particles} aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className={styles.particle} style={{ '--i': i }} />
          ))}
        </div>
      )}

      <div className={`${styles.container} ${isLanded ? styles.containerLanded : ''}`}>

        {/* Dice Scene */}
        <div className={styles.scene}>
          {/* Ground glow */}
          <div className={`${styles.groundGlow} ${isLanded ? styles.groundGlowActive : ''}`} />

          <div
            className={`${styles.cube} ${isRolling ? styles.cubeRolling : ''} ${isLanding ? styles.cubeLanding : ''}`}
            style={cubeTransform ? { transform: cubeTransform } : undefined}
          >
            <DiceFace face={1} className="front"  />
            <DiceFace face={2} className="right"  />
            <DiceFace face={3} className="top"    />
            <DiceFace face={4} className="bottom" />
            <DiceFace face={5} className="left"   />
            <DiceFace face={6} className="back"   />
          </div>
        </div>

        {/* Status / Result */}
        {isRolling && (
          <div className={styles.statusText}>
            <Dices size={20} className={styles.spinIcon} />
            <span>Zar Dönüyor...</span>
          </div>
        )}

        {showResult && (
          <div className={`${styles.resultArea} ${isLanded ? styles.resultAreaVisible : ''}`}>
            {isJackpot && (
              <div className={styles.jackpotLabel}>
                🎰 JACKPOT!
              </div>
            )}
            <div className={`${styles.resultNumber} ${isJackpot ? styles.resultNumberJackpot : ''}`}>
              {displayValue}
            </div>
            <div className={styles.resultRow}>
              <Sparkles size={18} color="#FFD700" />
              <span className={styles.resultText}>
                Zar Sonucu: <strong>{displayValue}</strong>
              </span>
              <span className={styles.points}>+10 Puan</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
