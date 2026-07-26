import { useState } from 'react';
import { Bot, Trophy, RotateCcw, X, Swords } from 'lucide-react';
import styles from './DuelModal.module.css';

export function BotDuelModal({ isOpen, onClose }) {
  const [userChoice, setUserChoice] = useState(null);
  const [botChoice, setBotChoice] = useState(null);
  const [result, setResult] = useState(null); // 'win' | 'lose' | 'tie'
  const [isPlaying, setIsPlaying] = useState(false);

  if (!isOpen) return null;

  const choices = [
    { id: 'rock', emoji: '🪨', name: 'Taş' },
    { id: 'paper', emoji: '📄', name: 'Kağıt' },
    { id: 'scissors', emoji: '✂️', name: 'Makas' },
  ];

  const handlePlay = (choiceId) => {
    setUserChoice(choiceId);
    setIsPlaying(true);
    setBotChoice(null);
    setResult(null);

    // Bot animated choice
    setTimeout(() => {
      const botPick = choices[Math.floor(Math.random() * choices.length)].id;
      setBotChoice(botPick);
      setIsPlaying(false);

      if (choiceId === botPick) {
        setResult('tie');
      } else if (
        (choiceId === 'rock' && botPick === 'scissors') ||
        (choiceId === 'paper' && botPick === 'rock') ||
        (choiceId === 'scissors' && botPick === 'paper')
      ) {
        setResult('win');
      } else {
        setResult('lose');
      }
    }, 1200);
  };

  const handleReset = () => {
    setUserChoice(null);
    setBotChoice(null);
    setResult(null);
    setIsPlaying(false);
  };

  const getChoiceObj = (id) => choices.find(c => c.id === id);

  return (
    <div className={styles.overlay}>
      <div className={styles.card} style={{ maxWidth: '440px' }}>
        <div className={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bot size={24} color="#FF7E20" />
            <h3 style={{ margin: 0 }}>Bot'a Karşı Düello</h3>
          </div>
          <button className={styles.closeBtn} onClick={() => { handleReset(); onClose(); }}>
            <X size={18} />
          </button>
        </div>

        {!userChoice && (
          <div className={styles.choiceSection}>
            <p className={styles.subtitle}>Hamleni seç ve Bot'a karşı mücadele et!</p>
            <div className={styles.choicesGrid}>
              {choices.map(c => (
                <button
                  key={c.id}
                  type="button"
                  className={styles.choiceBtn}
                  onClick={() => handlePlay(c.id)}
                >
                  <span className={styles.emoji}>{c.emoji}</span>
                  <span className={styles.name}>{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {userChoice && isPlaying && (
          <div style={{ textAlign: 'center', padding: '30px 10px' }}>
            <div style={{ fontSize: '48px', animation: 'bounce 0.6s infinite alternate' }}>
              ⚔️
            </div>
            <p style={{ marginTop: '12px', color: '#FF7E20', fontWeight: 'bold' }}>
              Bot hamlesini düşünüyor...
            </p>
          </div>
        )}

        {userChoice && botChoice && !isPlaying && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '24px', margin: '20px 0' }}>
              <div style={{ textTransform: 'uppercase', textAlign: 'center' }}>
                <div style={{ fontSize: '44px', transform: 'scale(1.2)' }}>{getChoiceObj(userChoice)?.emoji}</div>
                <div style={{ fontSize: '12px', color: '#A1A1AA', marginTop: '6px', fontWeight: '600' }}>SEN ({getChoiceObj(userChoice)?.name})</div>
              </div>
              <div style={{ fontSize: '24px', fontWeight: '900', color: '#FF7E20' }}>VS</div>
              <div style={{ textTransform: 'uppercase', textAlign: 'center' }}>
                <div style={{ fontSize: '44px', transform: 'scale(1.2)' }}>{getChoiceObj(botChoice)?.emoji}</div>
                <div style={{ fontSize: '12px', color: '#A1A1AA', marginTop: '6px', fontWeight: '600' }}>BOT ({getChoiceObj(botChoice)?.name})</div>
              </div>
            </div>

            {result === 'win' && (
              <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.15)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#10B981', fontWeight: 'bold', fontSize: '18px' }}>
                🎉 TEBRİKLER! KAZANDIN!
              </div>
            )}
            {result === 'lose' && (
              <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#EF4444', fontWeight: 'bold', fontSize: '18px' }}>
                😢 BOT KAZANDI!
              </div>
            )}
            {result === 'tie' && (
              <div style={{ padding: '12px', background: 'rgba(245, 158, 11, 0.15)', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.4)', color: '#F59E0B', fontWeight: 'bold', fontSize: '18px' }}>
                🤝 BERABERE!
              </div>
            )}

            <button
              onClick={handleReset}
              style={{
                marginTop: '20px', width: '100%', padding: '12px', borderRadius: '10px',
                background: 'linear-gradient(135deg, #FF7E20 0%, #B34400 100%)', color: '#FFF',
                border: 'none', fontWeight: 'bold', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}
            >
              <RotateCcw size={16} /> Tekrar Oyna
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
