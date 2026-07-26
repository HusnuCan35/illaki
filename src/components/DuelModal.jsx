import { useState } from 'react';
import { Swords, Check, X } from 'lucide-react';
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
  const opponentChoice = isChallenger ? duel.opponentChoice : duel.challengerChoice;
  const opponentName = isChallenger ? duel.opponentName : duel.challengerName;

  const choices = [
    { id: 'rock', emoji: '🪨', name: 'Taş' },
    { id: 'paper', emoji: '📄', name: 'Kağıt' },
    { id: 'scissors', emoji: '✂️', name: 'Makas' },
  ];

  const getChoiceObj = (id) => choices.find(c => c.id === id);

  const handleSubmitChoice = async () => {
    if (!selectedChoice) return;
    setLoading(true);
    try {
      await submitDuelChoice(activeSpaceId, duel.id, identity.uid, selectedChoice);
      addToast({ type: 'success', message: 'Hamlen kaydedildi! Rakip bekleniyor...' });
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

  const isWinner = duel.winnerUid === identity.uid;
  const isTie = duel.winnerUid === 'tie';

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Swords size={24} className={styles.swordsIcon} />
          <h3>1v1 Taş - Kağıt - Makas Düellosu</h3>
          <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>

        {/* 1. Bekleme / Teklif Ekranı */}
        {duel.status === 'pending' && !isChallenger && (
          <div className={styles.pendingSection}>
            <p><strong>{duel.challengerName}</strong> seni 1v1 Taş-Kağıt-Makas düellosuna davet etti!</p>
            <div className={styles.actions}>
              <button type="button" className={styles.declineBtn} onClick={handleDecline}>Reddet</button>
              <button type="button" className={styles.acceptBtn} onClick={handleAccept}>Düelloyu Kabul Et ⚔️</button>
            </div>
          </div>
        )}

        {duel.status === 'pending' && isChallenger && (
          <div className={styles.pendingSection}>
            <p><strong>{duel.opponentName}</strong> kullanıcısına düello daveti gönderildi.</p>
            <p style={{ fontSize: '13px', color: '#FF7E20', fontWeight: 'bold' }}>Rakibin kabul etmesi bekleniyor...</p>
          </div>
        )}

        {/* 2. Seçim Ekranı */}
        {duel.status === 'accepted' && (
          <div className={styles.choiceSection}>
            <p className={styles.subtitle}>
              Rakibin: <strong>{opponentName}</strong>
            </p>
            {myChoice ? (
              <div className={styles.alreadySubmitted}>
                <Check size={20} color="#10B981" />
                <span>Hamleni yaptın (<strong>{getChoiceObj(myChoice)?.name}</strong>). Rakip bekleniyor...</span>
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
                  Hamleyi Onayla ⚔️
                </button>
              </>
            )}
          </div>
        )}

        {/* 3. Tamamlanan Sonuç Ekranı (Animasyonlu) */}
        {duel.status === 'completed' && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '30px', margin: '20px 0' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '48px', filter: 'drop-shadow(0 0 12px rgba(255,126,32,0.6))' }}>
                  {getChoiceObj(myChoice)?.emoji}
                </div>
                <div style={{ fontSize: '12px', color: '#A1A1AA', marginTop: '6px', fontWeight: '700' }}>SEN</div>
                <div style={{ fontSize: '14px', color: '#FFF', fontWeight: 'bold' }}>{getChoiceObj(myChoice)?.name}</div>
              </div>

              <div style={{ fontSize: '28px', fontWeight: '900', color: '#FF7E20' }}>
                VS
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '48px', filter: 'drop-shadow(0 0 12px rgba(59,130,246,0.6))' }}>
                  {getChoiceObj(opponentChoice)?.emoji}
                </div>
                <div style={{ fontSize: '12px', color: '#A1A1AA', marginTop: '6px', fontWeight: '700' }}>{opponentName}</div>
                <div style={{ fontSize: '14px', color: '#FFF', fontWeight: 'bold' }}>{getChoiceObj(opponentChoice)?.name}</div>
              </div>
            </div>

            {isWinner && (
              <div style={{ padding: '16px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.3) 100%)', borderRadius: '16px', border: '1px solid #10B981', color: '#10B981', fontWeight: 'bold', fontSize: '20px', boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)' }}>
                🏆 TEBRİKLER! DÜELLOYU KAZANDIN!
              </div>
            )}
            {!isWinner && !isTie && (
              <div style={{ padding: '16px', background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(185, 28, 28, 0.3) 100%)', borderRadius: '16px', border: '1px solid #EF4444', color: '#EF4444', fontWeight: 'bold', fontSize: '20px', boxShadow: '0 0 20px rgba(239, 68, 68, 0.4)' }}>
                💀 RAKİP KAZANDI! ({duel.winnerUid === duel.challengerUid ? duel.challengerName : duel.opponentName})
              </div>
            )}
            {isTie && (
              <div style={{ padding: '16px', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(217, 119, 6, 0.3) 100%)', borderRadius: '16px', border: '1px solid #F59E0B', color: '#F59E0B', fontWeight: 'bold', fontSize: '20px', boxShadow: '0 0 20px rgba(245, 158, 11, 0.4)' }}>
                🤝 BERABERE BİTTİ!
              </div>
            )}

            <button
              onClick={onClose}
              style={{
                marginTop: '20px', width: '100%', padding: '12px', borderRadius: '10px',
                background: '#FF7E20', color: '#FFF', border: 'none', fontWeight: 'bold',
                cursor: 'pointer', fontSize: '14px'
              }}
            >
              Kapat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
