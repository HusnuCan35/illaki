import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, MicOff, Headphones,
  PhoneOff, Volume2, VolumeX, Radio, MonitorUp, MonitorOff,
  Camera, CameraOff
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

// Video tile bileşeni — kamera açıksa video, değilse avatar
function VideoTile({ participant, peerId, getSpeakingLevel, isMuted, isDeafened, isSelf }) {
  const videoRef = useRef(null);
  const [level, setLevel] = useState(0);
  const frameRef = useRef(null);
  
  const { peers } = usePeerStore();
  const peerInfo = peers[peerId] || {};
  
  const validPeerName = peerInfo.username && peerInfo.username !== 'Katılımcı' && peerInfo.username !== 'Anonim' ? peerInfo.username : null;
  const validPartName = participant.username && participant.username !== 'Katılımcı' && participant.username !== 'Anonim' ? participant.username : null;
  const displayName = isSelf ? participant.username : (validPartName || validPeerName || 'Katılımcı');
  const displayColor = isSelf ? participant.avatarColor : (peerInfo.avatarColor || participant.avatarColor);
  
  const effectiveMute = isSelf ? isMuted : !!peerInfo.isMuted;
  const effectiveDeafen = isSelf ? isDeafened : !!peerInfo.isDeafened;
  const isSpeaking = level > 5 && !effectiveMute && !effectiveDeafen;

  useEffect(() => {
    const tick = () => {
      const l = getSpeakingLevel(peerId);
      setLevel(l);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [peerId, getSpeakingLevel]);

  // Video stream'i video elementine bağla
  useEffect(() => {
    if (videoRef.current && participant.videoStream) {
      videoRef.current.srcObject = participant.videoStream;
    }
  }, [participant.videoStream]);


  return (
    <div
      className={`${styles.videoTile} ${isSpeaking ? styles.videoTileSpeaking : ''}`}
      aria-label={`${displayName}${isSpeaking ? ' - konuşuyor' : ''}`}
    >
      {participant.videoStream ? (
        <video
          ref={videoRef}
          autoPlay
          muted={isSelf}
          playsInline
          className={styles.videoEl}
        />
      ) : (
        <div
          className={styles.videoAvatar}
          style={{ background: displayColor || 'var(--accent)' }}
        >
          {(displayName || '?').slice(0, 2).toUpperCase()}
          {isSpeaking && <div className={styles.speakingRing} aria-hidden="true" />}
        </div>
      )}

      <div className={styles.videoTileFooter}>
        <span className={styles.videoTileName}>
          {isSelf ? `${displayName} (Sen)` : displayName}
        </span>
        <div className={styles.videoTileIcons}>
          {effectiveMute && <MicOff size={12} className={styles.mutedIcon} />}
          {effectiveDeafen && <VolumeX size={12} className={styles.mutedIcon} />}
          <SpeakingBars level={level} active={isSpeaking} />
        </div>
      </div>
    </div>
  );
}

/**
 * VoiceChannel — Ses + Video kanalı UI bileşeni
 */
export function VoiceChannel({
  isInVoice,
  isMuted,
  isDeafened,
  isCameraOn,
  localVideoStream,
  voiceParticipants,
  getSpeakingLevel,
  micPermission,
  onJoin,
  onLeave,
  onToggleMute,
  onToggleDeafen,
  onToggleCamera,
  screenShare,
  connectedPeerIds = [],
}) {
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [res, setRes] = useState('1080');
  const [fps, setFps] = useState('30');
  const [musicState, setMusicState] = useState(null);

  const { channels, activeSpaceId } = useSpaceStore();
  const { voiceChannelId } = usePeerStore();

  if (!isInVoice) {
    return null;
  }

  const activeVoiceChannel = channels[activeSpaceId]?.find(c => c.id === voiceChannelId);
  const participantEntries = Object.entries(voiceParticipants);

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

      {/* Video Grid */}
      {participantEntries.length > 0 && (
        <div className={`${styles.videoGrid} ${participantEntries.length === 1 ? styles.videoGridSingle : ''}`}>
          {/* Müzik Botu */}
          {musicState?.currentSong && (
            <div className={`${styles.videoTile} ${musicState.status === 'playing' ? styles.videoTileSpeaking : ''}`}>
              <div className={styles.videoAvatar} style={{ background: '#FF0000' }}>
                🎵
                {musicState.status === 'playing' && <div className={styles.speakingRing} />}
              </div>
              <div className={styles.videoTileFooter}>
                <span className={styles.videoTileName}>Müzik Botu</span>
                <SpeakingBars level={musicState.status === 'playing' ? 12 : 0} active={musicState.status === 'playing'} />
              </div>
            </div>
          )}

          {/* Gerçek Katılımcılar */}
          {participantEntries.map(([peerId, participant]) => (
            <VideoTile
              key={peerId}
              peerId={peerId}
              participant={participant}
              getSpeakingLevel={getSpeakingLevel}
              isMuted={isMuted}
              isDeafened={isDeafened}
              isSelf={participant.isSelf}
            />
          ))}
        </div>
      )}

      {/* Kontroller */}
      <div className={styles.controls}>
        {/* Mikrofon */}
        <button
          className={`${styles.controlBtn} ${isMuted ? styles.controlActive : ''}`}
          onClick={onToggleMute}
          aria-label={isMuted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
          aria-pressed={isMuted}
          title={isMuted ? 'Mikrofonu Aç' : 'Sessiz'}
        >
          {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>

        {/* Kulaklık */}
        <button
          className={`${styles.controlBtn} ${isDeafened ? styles.controlActive : ''}`}
          onClick={onToggleDeafen}
          aria-label={isDeafened ? 'Sesi aç' : 'Sesi kapat'}
          aria-pressed={isDeafened}
          title={isDeafened ? 'Sesi Aç' : 'Sağır Modu'}
        >
          {isDeafened ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>

        {/* Kamera */}
        <button
          className={`${styles.controlBtn} ${isCameraOn ? styles.controlCameraOn : ''}`}
          onClick={onToggleCamera}
          aria-label={isCameraOn ? 'Kamerayı kapat' : 'Kamerayı aç'}
          aria-pressed={isCameraOn}
          title={isCameraOn ? 'Kamerayı Kapat' : 'Kamera Aç'}
        >
          {isCameraOn ? <Camera size={16} /> : <CameraOff size={16} />}
        </button>

        {/* Ekran Paylaşımı */}
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

        {/* Ayrıl */}
        <button
          className={`${styles.controlBtn} ${styles.leaveBtn}`}
          onClick={onLeave}
          title="Ayrıl"
        >
          <PhoneOff size={16} />
        </button>
      </div>

      {/* Ekran Paylaşımı Kalite Modalı */}
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

      {/* Arka plan müzik motoru */}
      <MusicPlayerCore
        activeSpaceId={activeSpaceId}
        onMusicStateChange={setMusicState}
      />
    </div>
  );
}
