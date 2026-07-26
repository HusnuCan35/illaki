import { useState, useRef, useEffect } from 'react';
import { Maximize, Minimize, Volume2, VolumeX, X, Tv, Shield, Radio } from 'lucide-react';
import styles from './StreamStageModal.module.css';

export function StreamStageModal({ isOpen, onClose, stream, sharerName, isSelf, onStopShare }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isTheater, setIsTheater] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, isOpen]);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  if (!isOpen || !stream) return null;

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if (containerRef.current.webkitRequestFullscreen) {
          await containerRef.current.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.error('Tam ekran hatası:', err);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div 
        ref={containerRef} 
        className={`${styles.stageContainer} ${isTheater ? styles.theater : ''} ${isFullscreen ? styles.fullscreen : ''}`}
      >
        {/* Header Bar */}
        <div className={styles.stageHeader}>
          <div className={styles.streamerBadge}>
            <span className={styles.liveDot} />
            <Radio size={16} color="#FF4D4D" />
            <span className={styles.streamerName}>{sharerName || 'Yayıncı'} Yayın Yapıyor</span>
            {isSelf && <span className={styles.selfTag}>Senin Yayının</span>}
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Yayından Çık">
            <X size={20} />
          </button>
        </div>

        {/* Video Area */}
        <div className={styles.videoWrapper}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isSelf || isMuted}
            className={styles.videoElement}
          />
        </div>

        {/* Bottom Control Bar */}
        <div className={styles.controlBar}>
          <div className={styles.leftControls}>
            <button 
              className={styles.controlBtn} 
              onClick={toggleMute} 
              title={isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <span className={styles.streamInfo}>1080p • 60 FPS • HD</span>
          </div>

          <div className={styles.rightControls}>
            {isSelf && onStopShare && (
              <button 
                className={`${styles.controlBtn} ${styles.stopBtn}`} 
                onClick={() => { onStopShare(); onClose(); }}
              >
                Yayını Durdur
              </button>
            )}

            <button 
              className={`${styles.controlBtn} ${isTheater ? styles.activeBtn : ''}`} 
              onClick={() => setIsTheater(!isTheater)} 
              title="Tiyatro Modu"
            >
              <Tv size={18} />
            </button>

            <button 
              className={styles.controlBtn} 
              onClick={toggleFullscreen} 
              title={isFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekran'}
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
