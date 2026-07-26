import { useState } from 'react';
import { X, Dices, HandMetal, Gem, Users, Bot } from 'lucide-react';
import styles from './GameZone.module.css';

export function GameZone({ onClose, onGameCommand, onOpenBotDuel, onOpenFriendDuel }) {
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
          <span className={styles.gameName}>Zar At</span>
        </button>

        {/* Jackpot */}
        <button
          className={styles.gameBtn}
          onClick={() => {
            onGameCommand('/jackpot');
            onClose();
          }}
        >
          <Gem size={20} className={styles.gameIcon} />
          <span className={styles.gameName}>Jackpot</span>
        </button>
      </div>

      {/* Taş / Kağıt / Makas Bölümü */}
      <div className={styles.rpsSection}>
        <div className={styles.rpsHeader}>
          <HandMetal size={16} className={styles.gameIcon} />
          <span>Taş - Kağıt - Makas</span>
        </div>
        <div className={styles.rpsButtons}>
          <button
            className={styles.rpsBtnFriend}
            onClick={() => {
              if (onOpenFriendDuel) onOpenFriendDuel();
              onClose();
            }}
          >
            <Users size={16} />
            <span>Arkadaşınla</span>
          </button>

          <button
            className={styles.rpsBtnBot}
            onClick={() => {
              if (onOpenBotDuel) onOpenBotDuel();
              onClose();
            }}
          >
            <Bot size={16} />
            <span>Bot ile</span>
          </button>
        </div>
      </div>
    </div>
  );
}
