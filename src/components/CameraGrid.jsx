import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, VolumeX, Maximize2, Minimize2, Video } from 'lucide-react';
import styles from './CameraGrid.module.css';

export function CameraGrid({ participants = [], isVoiceOpen = true, onToggleFullscreen }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  // Filter participants to those who have active video or camera on
  const videoParticipants = Object.entries(participants)
    .map(([id, p]) => ({ id, ...p }))
    .filter(p => p.videoStream || p.isCameraOn);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  if (videoParticipants.length === 0) return null;

  return (
    <div ref={containerRef} className={`${styles.gridContainer} ${isFullscreen ? styles.fullscreen : ''}`}>
      <div className={styles.header}>
        <div className={styles.title}>
          <Video size={16} className={styles.titleIcon} />
          <span>KAMERA YAYINI ({videoParticipants.length})</span>
        </div>
        <button className={styles.fullscreenBtn} onClick={toggleFullscreen} title="Tam Ekran">
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      <div className={`${styles.videoGrid} ${styles[`grid-${Math.min(videoParticipants.length, 9)}`]}`}>
        {videoParticipants.map((p) => (
          <VideoCard key={p.id} participant={p} />
        ))}
      </div>
    </div>
  );
}

function VideoCard({ participant }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && participant.videoStream) {
      videoRef.current.srcObject = participant.videoStream;
    }
  }, [participant.videoStream]);

  const username = participant.username || 'Kullanıcı';
  const initial = username.slice(0, 2).toUpperCase();

  return (
    <div className={`${styles.videoCard} ${participant.speaking ? styles.speaking : ''}`}>
      {participant.videoStream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.isSelf}
          className={styles.videoElement}
        />
      ) : (
        <div className={styles.avatarFallback} style={{ background: participant.avatarColor || 'var(--accent)' }}>
          <span>{initial}</span>
        </div>
      )}

      <div className={styles.userOverlay}>
        <span className={styles.username}>{username} {participant.isSelf && '(Sen)'}</span>
        <div className={styles.statusIcons}>
          {participant.isMuted && <MicOff size={12} className={styles.iconMuted} />}
          {participant.isDeafened && <VolumeX size={12} className={styles.iconDeafened} />}
        </div>
      </div>
    </div>
  );
}
