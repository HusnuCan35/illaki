import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, MicOff, Headphones, HeadphonesIcon,
  PhoneOff, Volume2, VolumeX, Radio, MonitorUp, MonitorOff
} from 'lucide-react';
import { useSpaceStore, usePeerStore } from '../stores';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { MusicPlayerCore } from './MusicPlayerCore';
import styles from './VoiceChannel.module.css';

// Ses göstergesi (konuşma seviyesi animasyonu)
function SpeakingBars({ level, active }) {
  return (
    <div className={`${styles.bars} ${active ? styles.barsActive : ''}`} aria-hidden="true">
      {[0.4, 1, 0.7, 1, 0.5].map((h, i) => (
        <span
          key={i}
          className={styles.bar}
          style={{
            height: active ? `${Math.max(3, h * level * 0.3)}px` : '3px',
            animationDelay: `${i * 60}ms`,
          }}
        />
      ))}
    </div>
  );
}

// Katılımcı kartı
function Participant({ participant, peerId, getSpeakingLevel, isMuted, isDeafened }) {
  const [level, setLevel] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    const tick = () => {
      const l = getSpeakingLevel(peerId);
      setLevel(l);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [peerId, getSpeakingLevel]);

  const isSpeaking = level > 8;

  return (
    <div
      className={`${styles.participant} ${isSpeaking ? styles.speaking : ''}`}
      aria-label={`${participant.username}${isSpeaking ? ' - konuşuyor' : ''}`}
    >
      <div
        className={styles.participantAvatar}
        style={{ background: participant.avatarColor || 'var(--accent)' }}
        aria-hidden="true"
      >
        {(participant.username || '?').slice(0, 2).toUpperCase()}
        {isSpeaking && <div className={styles.speakingRing} aria-hidden="true" />}
      </div>
      <span className={styles.participantName}>
        {participant.isSelf ? `${participant.username} (Sen)` : participant.username}
      </span>
      <div className={styles.participantIcons} aria-hidden="true">
        {(participant.isSelf ? isMuted : false) && <MicOff size={12} className={styles.mutedIcon} />}
        {(participant.isSelf ? isDeafened : false) && <HeadphonesIcon size={12} className={styles.mutedIcon} />}
        <SpeakingBars level={level} active={isSpeaking && !(participant.isSelf && isMuted)} />
      </div>
    </div>
  );
}

/**
 * VoiceChannel — Ses kanalı UI bileşeni
 */
export function VoiceChannel({
  isInVoice,
  isMuted,
  isDeafened,
  voiceParticipants,
  getSpeakingLevel,
  micPermission,
  onJoin,
  onLeave,
  onToggleMute,
  onToggleDeafen,
  screenShare,
  connectedPeerIds = [],
}) {
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [res, setRes] = useState('1080');
  const [fps, setFps] = useState('30');
  const [musicState, setMusicState] = useState(null);

  // Aktif kanalın ismini bulalım (store'dan)
  const { channels, activeSpaceId } = useSpaceStore();
  const { voiceChannelId } = usePeerStore();

  if (!isInVoice) {
    return null; // Artık katılma butonu kanalların üzerinde, burası sadece bağlıyken görünecek
  }

  const activeVoiceChannel = channels[activeSpaceId]?.find(c => c.id === voiceChannelId);

  return (
    <div className={styles.connectionPanel}>
      <div className={styles.connectionInfo}>
        <div className={styles.connectionStatus}>
          <Radio size={14} className={styles.connectedIcon} />
          <span>Ses Bağlantısı</span>
        </div>
        <div className={styles.connectionChannel}>
          {activeVoiceChannel?.name || 'Ses Kanalı'}
        </div>
      </div>

      <div className={styles.participantsList}>
        {/* Müzik Botu Katılımcısı (Sadece Şarkı Çalıyorsa) */}
        {musicState?.currentSong && (
          <div className={`${styles.participant} ${musicState.status === 'playing' ? styles.speaking : ''}`}>
            <div
              className={styles.participantAvatar}
              style={{ background: '#FF0000' }}
              aria-hidden="true"
            >
              🎵
              {musicState.status === 'playing' && <div className={styles.speakingRing} aria-hidden="true" />}
            </div>
            <span className={styles.participantName}>
              Müzik Botu
            </span>
            <div className={styles.participantIcons} aria-hidden="true">
              <SpeakingBars level={musicState.status === 'playing' ? 12 : 0} active={musicState.status === 'playing'} />
            </div>
          </div>
        )}

        {/* Gerçek Katılımcılar */}
        {Object.entries(voiceParticipants).map(([peerId, participant]) => (
          <Participant
            key={peerId}
            peerId={peerId}
            participant={participant}
            getSpeakingLevel={getSpeakingLevel}
            isMuted={isMuted}
            isDeafened={isDeafened}
          />
        ))}
      </div>

      {/* Kontroller */}
      <div className={styles.controls}>
        <button
          className={`${styles.controlBtn} ${isMuted ? styles.controlActive : ''}`}
          onClick={onToggleMute}
          aria-label={isMuted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
          aria-pressed={isMuted}
          title={isMuted ? 'Mikrofonu Aç' : 'Sessiz'}
        >
          {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>

        <button
          className={`${styles.controlBtn} ${isDeafened ? styles.controlActive : ''}`}
          onClick={onToggleDeafen}
          aria-label={isDeafened ? 'Sesi aç' : 'Sesi kapat'}
          aria-pressed={isDeafened}
          title={isDeafened ? 'Sesi Aç' : 'Sağır Modu'}
        >
          {isDeafened ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>

        <div className={styles.qualityMenuWrapper}>
          <button
            className={`${styles.controlBtn} ${screenShare?.isSharing ? styles.controlActive : ''}`}
            onClick={() => {
              if (screenShare?.isSharing) {
                screenShare.stopScreenShare();
                setShowQualityMenu(false);
              } else {
                setShowQualityMenu(true);
              }
            }}
            aria-label={screenShare?.isSharing ? 'Ekran Paylaşımını Durdur' : 'Ekran Paylaş'}
            title={screenShare?.isSharing ? 'Ekran Paylaşımını Durdur' : 'Ekran Paylaş'}
          >
            {screenShare?.isSharing ? <MonitorOff size={16} /> : <MonitorUp size={16} />}
          </button>
        </div>

        <button
          className={`${styles.controlBtn} ${styles.leaveBtn}`}
          onClick={onLeave}
          title="Ayrıl"
        >
          <PhoneOff size={20} />
        </button>
      </div>

      <Modal isOpen={showQualityMenu} onClose={() => setShowQualityMenu(false)} title="Ekran Paylaşımı">
        <div className={styles.modalContent}>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Çözünürlük</label>
            <select 
              value={res} 
              onChange={e => setRes(e.target.value)}
              className={styles.modalSelect}
            >
              <option value="720">720p (HD)</option>
              <option value="1080">1080p (Full HD)</option>
              <option value="1440">1440p (2K)</option>
              <option value="2160">2160p (4K Ultra HD)</option>
            </select>
          </div>
          
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Kare Hızı (FPS)</label>
            <select 
              value={fps} 
              onChange={e => setFps(e.target.value)}
              className={styles.modalSelect}
            >
              <option value="30">30 FPS</option>
              <option value="60">60 FPS</option>
            </select>
          </div>

          <div className={styles.modalActions}>
            <Button variant="secondary" onClick={() => setShowQualityMenu(false)}>İptal</Button>
            <Button 
              onClick={() => {
                const resMap = {
                  '720': { w: 1280, h: 720 },
                  '1080': { w: 1920, h: 1080 },
                  '1440': { w: 2560, h: 1440 },
                  '2160': { w: 3840, h: 2160 },
                };
                const { w, h } = resMap[res];
                screenShare?.startScreenShare(connectedPeerIds, { w, h, fps: parseInt(fps) });
                setShowQualityMenu(false);
              }}
            >
              Paylaşımı Başlat
            </Button>
          </div>
        </div>
      </Modal>

      {/* Arka plan müzik motoru (Bot) */}
      <MusicPlayerCore 
        activeSpaceId={activeSpaceId} 
        onMusicStateChange={setMusicState}
      />
    </div>
  );
}
