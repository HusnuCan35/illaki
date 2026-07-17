import { Users, Wifi, WifiOff, Crown, UserX, X, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { usePeerStore, useSpaceStore, useIdentityStore } from '../stores';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { subscribeToMembers } from '../lib/firestore';
import styles from './MembersPanel.module.css';

function MemberItem({ peerId, peer, isHost, isSelf, iAmHost, onKick }) {
  const initial = (peer.username || '?').slice(0, 2).toUpperCase();
  return (
    <div className={styles.member} role="listitem">
      <div
        className={styles.avatar}
        style={{ background: peer.avatarColor || 'var(--accent)' }}
        aria-hidden="true"
      >
        {initial}
        <span className={`${styles.statusDot} ${styles[peer.status || 'online']}`} />
      </div>
      <div className={styles.info}>
        <span className={styles.name}>
          {peer.username || 'Anonim'}
          {isSelf && <span className={styles.selfTag}>sen</span>}
          {!isSelf && peer.status === 'offline' && <span className={styles.selfTag} style={{ background: 'var(--bg-modifier-hover)' }}>çevrimdışı</span>}
        </span>
        <span className={styles.sub}>
          {isHost ? (
            <><Crown size={10} /> Host</>
          ) : (
            peer.status || 'online'
          )}
        </span>
      </div>
      {!isSelf && iAmHost && (
        <button 
          className={styles.kickBtn}
          onClick={() => onKick(peerId, peer.username)}
          title="Tekmele"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function MembersPanel({ kickPeer }) {
  const { peers } = usePeerStore();
  const { activeSpaceId, getActiveSpace } = useSpaceStore();
  const { identity } = useIdentityStore();
  const [kickTarget, setKickTarget] = useState(null);
  const [dbMembers, setDbMembers] = useState([]);

  const space = getActiveSpace();

  useEffect(() => {
    if (!activeSpaceId) return;
    const unsubscribe = subscribeToMembers(activeSpaceId, (members) => {
      setDbMembers(members);
    });
    return () => unsubscribe();
  }, [activeSpaceId]);

  // Firebase üyeleri ile PeerJS çevrimiçi üyeleri birleştir
  const peerEntries = Object.entries(peers);
  
  // Önce dbMembers üzerinden birleştirilmiş bir liste yap
  const mergedMembers = dbMembers.filter(m => m.uid !== identity?.uid).map(m => {
    // PeerJS'de var mı? (P2P bağlantısı varsa kesin onlinedır ve PeerJS ID'si ile eşleştirilir)
    // Ancak PeerJS'de uid'yi tutmuyoruz, username üzerinden veya metadata üzerinden eşleştirmeliyiz.
    // Şimdilik dbMembers üzerinden online statüsünü de kullanabiliriz.
    return {
      uid: m.uid,
      peerId: m.uid, // kick işlemlerinde Firebase UID kullanabiliriz, ama kickPeer PeerJS ID bekler!
      username: m.username,
      avatarColor: m.avatarColor,
      status: m.online ? 'online' : 'offline',
      isHost: m.role === 'host'
    };
  });

  // Eğer PeerJS'de olup DB'de henüz gelmeyen (veya Anonim) varsa ekle
  peerEntries.forEach(([peerId, peer]) => {
    const existing = mergedMembers.find(m => m.username === peer.username);
    if (existing) {
      existing.peerId = peerId; // Kick için gerçek PeerJS ID'sini ata
      existing.status = 'online';
    } else {
      mergedMembers.push({
        uid: peerId,
        peerId,
        username: peer.username,
        avatarColor: peer.avatarColor,
        status: 'online',
        isHost: space?.hostPeerId === peerId
      });
    }
  });

  const totalCount = mergedMembers.length + 1; // +1 for self

  return (
    <aside className={styles.panel} aria-label="Üyeler">
      <div className={styles.header}>
        <Users size={14} />
        <span>Üyeler — {totalCount}</span>
      </div>

      <div className={styles.list} role="list" aria-label="Bağlı üyeler">
        {/* Kendimiz */}
        <MemberItem
          peerId="self"
          peer={{
            username: identity?.username || 'Ben',
            avatarColor: identity?.avatarColor,
            status: 'online',
          }}
          isHost={space?.isHost}
          isSelf
        />

        {/* Diğer katılımcılar */}
        {mergedMembers.map((m) => (
          <MemberItem
            key={m.uid}
            peerId={m.peerId}
            peer={m}
            isHost={m.isHost}
            iAmHost={space?.isHost}
            onKick={(id, name) => setKickTarget({ id, name })}
          />
        ))}

        {mergedMembers.length === 0 && (
          <div className={styles.empty}>
            <WifiOff size={20} />
            <p>Henüz kimse yok.</p>
            <p>Oda kodunu paylaş!</p>
          </div>
        )}
      </div>

      <Modal 
        isOpen={!!kickTarget} 
        onClose={() => setKickTarget(null)} 
        title="Kullanıcıyı Tekmele"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)' }}>
            <AlertTriangle size={24} color="var(--dnd)" />
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text-primary)' }}>{kickTarget?.name}</strong> adlı kullanıcıyı odadan tekmelemek istediğinize emin misiniz?
            </p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <Button variant="secondary" onClick={() => setKickTarget(null)}>İptal</Button>
            <Button 
              style={{ background: 'var(--dnd)' }} 
              onClick={() => {
                if (kickTarget) {
                  kickPeer(kickTarget.id, activeSpaceId);
                  setKickTarget(null);
                }
              }}
            >
              Tekmele
            </Button>
          </div>
        </div>
      </Modal>
    </aside>
  );
}
