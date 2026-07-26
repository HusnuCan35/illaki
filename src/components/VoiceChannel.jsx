import { useState, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Headphones,
  PhoneOff, Volume2, VolumeX, Radio, MonitorUp, MonitorOff,
  Camera, CameraOff, X
} from 'lucide-react';
import { useSpaceStore, usePeerStore, useIdentityStore } from '../stores';
import { subscribeToMembers } from '../lib/firestore';
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
  
  const displayName = isSelf 
    ? `${participant.username || 'Ben'} (Sen)` 
    : (participant.username || peerInfo.username || 'Kullanıcı');
  const displayColor = participant.avatarColor || peerInfo.avatarColor || 'var(--accent)';
  
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
      videoRef.current.play().catch(() => {});
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
          style={{ background: displayColor }}
        >
          {(participant.username || '?').slice(0, 2).toUpperCase()}
          {isSpeaking && <div className={styles.speakingRing} aria-hidden="true" />}
        </div>
      )}

      <div className={styles.videoTileFooter}>
        <span className={styles.videoTileName}>
          {displayName}
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
  const [spaceMembers, setSpaceMembers] = useState([]);
  // uid -> gerçek kullanıcı adı cache'i (Firestore users koleksiyonundan async çekilen)
  const [resolvedNames, setResolvedNames] = useState({});

  const { channels, activeSpaceId } = useSpaceStore();
  const { voiceChannelId } = usePeerStore();
  const { identity } = useIdentityStore();

  // Firestore sunucu üyelerini takip et
  useEffect(() => {
    if (!activeSpaceId) return;
    const unsub = subscribeToMembers(activeSpaceId, setSpaceMembers);
    return () => unsub();
  }, [activeSpaceId]);

  // Kullanıcı adı eksik olan üyeler için Firestore users koleksiyonundan gerçek adı çek
  useEffect(() => {
    if (!isInVoice) return;
    const isGenericName = (name) => !name || name === 'Katılımcı' || name === 'Anonim' || name === 'Kullanıcı' || name === 'Üye' || name === 'Bağlanıyor...';
    
    const uidsToResolve = new Set();
    spaceMembers.forEach(m => {
      if (m.uid && m.uid !== identity?.uid && isGenericName(m.username)) {
        uidsToResolve.add(m.uid);
      }
    });

    if (uidsToResolve.size === 0) return;

    Promise.all(
      [...uidsToResolve].map(async uid => {
        try {
          const { getDoc, doc } = await import('firebase/firestore');
          const { db } = await import('../lib/firebase');
          const snap = await getDoc(doc(db, 'users', uid));
          if (snap.exists()) {
            const data = snap.data();
            const name = data.username || data.displayName;
            if (name && !isGenericName(name)) {
              return { uid, name };
            }
          }
        } catch {}
        return null;
      })
    ).then(results => {
      const updates = {};
      results.forEach(r => { if (r) updates[r.uid] = r.name; });
      if (Object.keys(updates).length > 0) {
        setResolvedNames(prev => ({ ...prev, ...updates }));
      }
    });
  }, [spaceMembers, isInVoice, identity?.uid]);

  if (!isInVoice) {
    return null;
  }


  const activeVoiceChannel = channels[activeSpaceId]?.find(c => c.id === voiceChannelId);
  const { peers: peerStoreData } = usePeerStore();

  // Bu ses kanalında olan AKTİF üyeleri belirle (online olmayan ve kanaldan ayrılanları filtrele)
  const inChannelMembers = spaceMembers.filter(m => {
    if (m.voiceChannelId !== voiceChannelId) return false;
    if (m.online === false) return false;
    return true;
  });

  // Katılımcı haritası oluştur (Firestore üyeleri + WebRTC yayınları)
  const participantMap = new Map();

  // Yardımcı: isim jenerik mi?
  const isGeneric = (name) => !name || name === 'Katılımcı' || name === 'Anonim' || name === 'Kullanıcı' || name === 'Üye' || name === 'Bağlanıyor...';

  // 1. Önce kendimizi ekle
  participantMap.set('self', {
    isSelf: true,
    username: identity?.username || 'Ben',
    avatarColor: identity?.avatarColor || 'var(--accent)',
    videoStream: localVideoStream,
    peerId: 'self',
  });

  // 2. Firestore'da bu ses kanalında olan diğer aktif üyeleri ekle
  inChannelMembers.forEach(m => {
    if (m.uid !== identity?.uid) {
      const pId = m.peerId || m.uid;
      // voiceParticipants içinde hem peerId hem uid ile ara
      const webRTC = voiceParticipants[pId] || voiceParticipants[m.uid] || {};
      // peerStore içinde de ara
      const peerStoreEntry = Object.values(peerStoreData).find(p => p.uid === m.uid) || peerStoreData[pId] || {};

      // En iyi isim kaynağını bul: WebRTC metadata > peerStore > Firestore member
      const nameCandidate = (!isGeneric(webRTC.username) ? webRTC.username : null)
        || (!isGeneric(peerStoreEntry.username) ? peerStoreEntry.username : null)
        || (!isGeneric(m.username) ? m.username : null)
        || (!isGeneric(m.displayName) ? m.displayName : null)
        || resolvedNames[m.uid]
        || null;

      const finalName = nameCandidate || `Kullanıcı#${m.uid.slice(-4)}`;

      participantMap.set(pId, {
        isSelf: false,
        uid: m.uid,
        username: finalName,
        avatarColor: m.avatarColor || webRTC.avatarColor || peerStoreEntry.avatarColor || '#3B82F6',
        videoStream: webRTC.videoStream || null,
        peerId: pId,
      });
    }
  });

  // 3. WebRTC üzerinden ekstra gelen aktör varsa ekle (Firestore'da eksik olabilir)
  Object.entries(voiceParticipants).forEach(([pId, p]) => {
    if (pId !== 'self' && !participantMap.has(pId)) {
      // Bu peer'ın Firestore member kaydına bak
      const dbMember = spaceMembers.find(m => m.peerId === pId || m.uid === pId);
      const nameCandidate = (!isGeneric(p.username) ? p.username : null)
        || (!isGeneric(dbMember?.username) ? dbMember?.username : null)
        || resolvedNames[p.uid || pId]
        || null;

      const finalName = nameCandidate || `Kullanıcı#${pId.slice(-4)}`;

      participantMap.set(pId, {
        isSelf: false,
        uid: p.uid || pId,
        username: finalName,
        avatarColor: p.avatarColor || dbMember?.avatarColor || '#3B82F6',
        videoStream: p.videoStream || null,
        peerId: pId,
      });
    }
  });

  const participantEntries = Array.from(participantMap.entries());


  return (
    <div className={styles.connectionPanel}>
      <div className={styles.connectionTopBar}>
        <div className={styles.connectionInfo}>
          <div className={styles.connectionStatus}>
            <Radio size={13} className={styles.connectedIcon} />
            <span>Ses Bağlantısı</span>
          </div>
          <div className={styles.connectionChannel}>
            {activeVoiceChannel?.name || 'Ses Kanalı'}
          </div>
        </div>

        <button
          className={`${styles.controlBtn} ${styles.leaveBtn}`}
          onClick={onLeave}
          title="Ses Kanalından Ayrıl"
        >
          <PhoneOff size={15} />
        </button>
      </div>

      {/* Katılımcılar & Kamera Alanı (Ses Bağlantısı Kontrollerinin ÜSTÜNDE sürekli görünür) */}
      {participantEntries.length > 0 && (
        <div className={`${styles.videoGrid} ${participantEntries.length === 1 && !musicState?.currentSong ? styles.videoGridSingle : ''}`}>
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

      {/* Kontrol Butonları Satırı (Alt Tarafta) */}
      <div className={styles.controlsRow}>
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

        <button
          className={`${styles.controlBtn} ${isCameraOn ? styles.controlCameraOn : ''}`}
          onClick={onToggleCamera}
          aria-label={isCameraOn ? 'Kamerayı kapat' : 'Kamerayı aç'}
          aria-pressed={isCameraOn}
          title={isCameraOn ? 'Kamerayı Kapat' : 'Kamera Aç'}
        >
          {isCameraOn ? <Camera size={16} /> : <CameraOff size={16} />}
        </button>

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

      {/* Ekran Paylaşımı Kalite Açılır Penceresi (Yukarı Doğru Şık Popover) */}
      {showQualityMenu && (
        <div className={styles.qualityPopover}>
          <div className={styles.qualityPopoverHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MonitorUp size={16} color="#FF7E20" />
              <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#FFF' }}>Ekran Paylaşım Kalitesi</span>
            </div>
            <button 
              type="button" 
              className={styles.popoverCloseBtn} 
              onClick={() => setShowQualityMenu(false)}
            >
              <X size={14} />
            </button>
          </div>

          <div className={styles.qualityPopoverBody}>
            <div className={styles.popoverField}>
              <label>Çözünürlük</label>
              <div className={styles.qualityPills}>
                {[
                  { id: '720', label: '720p HD' },
                  { id: '1080', label: '1080p FHD' },
                  { id: '1440', label: '2K' },
                  { id: '2160', label: '4K Ultra' },
                ].map(q => (
                  <button
                    key={q.id}
                    type="button"
                    className={`${styles.qualityPill} ${res === q.id ? styles.qualityPillActive : ''}`}
                    onClick={() => setRes(q.id)}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.popoverField}>
              <label>Kare Hızı (FPS)</label>
              <div className={styles.qualityPills}>
                {[
                  { id: '30', label: '30 FPS' },
                  { id: '60', label: '60 FPS' },
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    className={`${styles.qualityPill} ${fps === f.id ? styles.qualityPillActive : ''}`}
                    onClick={() => setFps(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className={styles.startStreamBtn}
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
              🚀 Yayını Başlat
            </button>
          </div>
        </div>
      )}

      {/* Arka plan müzik motoru */}
      <MusicPlayerCore
        activeSpaceId={activeSpaceId}
        onMusicStateChange={setMusicState}
      />
    </div>
  );
}
