import { useState } from 'react';
import { Swords, Check, X, Shield, Trophy } from 'lucide-react';
import { submitDuelChoice, respondDuel } from '../lib/firestore';
import { useSpaceStore, useIdentityStore, useUIStore } from '../stores';
import styles from './DuelModal.module.css';

export function DuelModal({ isOpen, onClose, duel }) {
  const { activeSpaceId } = useSpaceStore();
  const { identity } = useIdentityStore();
  const { addToast } = useUIStore();
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen || !duel || !identity) return null;

  const isChallenger = identity.uid === duel.challengerUid;
  const myChoice = isChallenger ? duel.challengerChoice : duel.opponentChoice;
  const opponentName = isChallenger ? duel.opponentName : duel.challengerName;

  const choices = [
    { id: 'rock', emoji: '🪨', name: 'Taş' },
    { id: 'paper', emoji: '📄', name: 'Kağıt' },
    { id: 'scissors', emoji: '✂️', name: 'Makas' },
  ];

  const handleSubmitChoice = async () => {
    if (!selectedChoice) return;
    setLoading(true);
    try {
      await submitDuelChoice(activeSpaceId, duel.id, identity.uid, selectedChoice);
      addToast({ type: 'success', message: 'Hamlen kaydedildi! Rakip bekleniyor...' });
      onClose();
    } catch (err) {
      addToast({ type: 'error', message: 'Hamle gönderilemedi.' });
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    try {
      await respondDuel(activeSpaceId, duel.id, true);
      addToast({ type: 'info', message: 'Düello kabul edildi! Hamleni seç.' });
    } catch (err) {
      addToast({ type: 'error', message: 'Düello kabul edilemedi.' });
    }
  };

  const handleDecline = async () => {
    try {
      await respondDuel(activeSpaceId, duel.id, false);
      addToast({ type: 'info', message: 'Düello reddedildi.' });
      onClose();
    } catch (err) {}
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Swords size={24} className={styles.swordsIcon} />
          <h3>Taş - Kağıt - Makas Düellosu</h3>
          <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>

        {duel.status === 'pending' && !isChallenger ? (
          <div className={styles.pendingSection}>
            <p><strong>{duel.challengerName}</strong> seni 1v1 Taş-Kağıt-Makas düellosuna davet etti!</p>
            <div className={styles.actions}>
              <button type="button" className={styles.declineBtn} onClick={handleDecline}>Reddet</button>
              <button type="button" className={styles.acceptBtn} onClick={handleAccept}>Düelloyu Kabul Et</button>
            </div>
          </div>
        ) : (
          <div className={styles.choiceSection}>
            <p className={styles.subtitle}>
              Rakibin: <strong>{opponentName}</strong>
            </p>
            {myChoice ? (
              <div className={styles.alreadySubmitted}>
                <Check size={20} color="#10B981" />
                <span>Hamleni yaptın (<strong>{choices.find(c => c.id === myChoice)?.name}</strong>). Rakip bekleniyor...</span>
              </div>
            ) : (
              <>
                <div className={styles.choicesGrid}>
                  {choices.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className={`${styles.choiceBtn} ${selectedChoice === c.id ? styles.choiceBtnActive : ''}`}
                      onClick={() => setSelectedChoice(c.id)}
                    >
                      <span className={styles.emoji}>{c.emoji}</span>
                      <span className={styles.name}>{c.name}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.submitBtn}
                  disabled={!selectedChoice || loading}
                  onClick={handleSubmitChoice}
                >
                  Hamleyi Onayla
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
