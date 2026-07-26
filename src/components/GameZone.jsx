import { useState } from 'react';
import { X, Dices, HandMetal, Gem, ChevronRight, Users, Bot } from 'lucide-react';
import styles from './GameZone.module.css';

export function GameZone({ onClose, onGameCommand, onOpenBotDuel, onOpenFriendDuel }) {
  const [showRpsOptions, setShowRpsOptions] = useState(false);

  return (
    <div className={styles.gameZoneWrapper}>
      <div className={styles.gameZoneHeader}>
        <h3>
          <Dices size={16} className={styles.gameIcon} />
          Eğlence Merkezi
        </h3>
        <button onClick={onClose} className={styles.closeBtn} title="Kapat">
          <X size={16} />
        </button>
      </div>

      <div className={styles.gamesList}>
        {/* Zar At */}
        <button
          className={styles.gameBtn}
          onClick={() => {
            onGameCommand('/zar');
            onClose();
          }}
        >
          <Dices size={20} className={styles.gameIcon} />
          <span className={styles.gameName}>Zar At (3D Animasyonlu)</span>
        </button>

        {/* Taş / Kağıt / Makas - Tek Sütun Alanı */}
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '4px' }}>
          <button
            className={styles.gameBtn}
            onClick={() => setShowRpsOptions(!showRpsOptions)}
            style={{ justifyContent: 'space-between' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HandMetal size={20} className={styles.gameIcon} />
              <span className={styles.gameName}>Taş / Kağıt / Makas</span>
            </div>
            <ChevronRight size={16} style={{ transform: showRpsOptions ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          {showRpsOptions && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '12px', marginTop: '4px' }}>
              <button
                className={styles.gameBtn}
                style={{ background: 'rgba(255, 126, 32, 0.15)', border: '1px solid rgba(255, 126, 32, 0.3)', color: '#FF7E20' }}
                onClick={() => {
                  if (onOpenFriendDuel) onOpenFriendDuel();
                  onClose();
                }}
              >
                <Users size={18} />
                <span className={styles.gameName} style={{ fontWeight: 'bold' }}>👥 Arkadaşınla Oyna (1v1)</span>
              </button>

              <button
                className={styles.gameBtn}
                style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60A5FA' }}
                onClick={() => {
                  if (onOpenBotDuel) onOpenBotDuel();
                  onClose();
                }}
              >
                <Bot size={18} />
                <span className={styles.gameName} style={{ fontWeight: 'bold' }}>🤖 Bot ile Oyna</span>
              </button>
            </div>
          )}
        </div>

        {/* Jackpot */}
        <button
          className={styles.gameBtn}
          onClick={() => {
            onGameCommand('/jackpot');
            onClose();
          }}
        >
          <Gem size={20} className={styles.gameIcon} />
          <span className={styles.gameName}>Jackpot Şans Çarkı</span>
        </button>
      </div>
    </div>
  );
}
