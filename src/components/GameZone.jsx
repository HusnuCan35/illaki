import { X, Dices, HandMetal, Coins, Gem } from 'lucide-react';
import styles from './GameZone.module.css';

export function GameZone({ onClose, onGameCommand }) {
  const games = [
    { id: 'zar', icon: Dices, name: 'Zar At', command: '/zar' },
    { id: 'tas', icon: HandMetal, name: 'Taş', command: '/tas' },
    { id: 'kagit', icon: HandMetal, name: 'Kağıt', command: '/kagit' },
    { id: 'makas', icon: HandMetal, name: 'Makas', command: '/makas' },
    { id: 'jackpot', icon: Gem, name: 'Jackpot', command: '/jackpot' },
  ];

  return (
    <div className={styles.gameZoneWrapper}>
      <div className={styles.gameZoneHeader}>
        <h3>
          <Dices size={16} className={styles.gameIcon} />
          Eğlence Paneli
        </h3>
        <button onClick={onClose} className={styles.closeBtn} title="Kapat">
          <X size={16} />
        </button>
      </div>

      <div className={styles.gamesList}>
        {games.map(game => {
          const Icon = game.icon;
          return (
            <button
              key={game.id}
              className={styles.gameBtn}
              onClick={() => {
                onGameCommand(game.command);
                onClose();
              }}
            >
              <Icon size={20} className={styles.gameIcon} />
              <span className={styles.gameName}>{game.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
