import { Users, WifiOff, Crown, X, AlertTriangle, UserPlus, Clock, ShieldAlert } from 'lucide-react';
import { useState, useEffect } from 'react';
import { usePeerStore, useSpaceStore, useIdentityStore, useUIStore } from '../stores';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { TimeoutModal } from './TimeoutModal';
import { BanModal } from './BanModal';
import { 
  subscribeToMembers, updateMemberRole, sendFriendRequest, 
  kickMember, applyMemberTimeout, banMember 
} from '../lib/firestore';
import styles from './MembersPanel.module.css';

function MemberItem({ 
  peerId, 
  peer, 
  isSelf, 
  iAmHost, 
  isPrivileged, 
  onKick, 
  onTimeout, 
  onBan, 
  onAddFriend 
}) {
  const initial = (peer.username || '?').slice(0, 2).toUpperCase();
  const isTimedOut = peer.timeoutUntil && peer.timeoutUntil > Date.now();

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
          {!isSelf && peer.status === 'offline' && (
            <span className={styles.selfTag} style={{ background: 'var(--bg-modifier-hover)' }}>çevrimdışı</span>
          )}
          {isTimedOut && (
            <span className={styles.selfTag} style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#F59E0B' }}>
              <Clock size={10} style={{ display: 'inline', marginRight: 2 }} /> susturuldu
            </span>
          )}
        </span>
        <span className={styles.sub}>
          {peer.role === 'host' ? (
            <span style={{ color: '#faa61a' }}><Crown size={10} /> Kurucu</span>
          ) : peer.role === 'mod' ? (
            <span style={{ color: '#43b581' }}>Moderatör</span>
          ) : peer.role === 'admin' ? (
            <span style={{ color: '#3B82F6' }}>Yönetici</span>
          ) : (
            'Üye'
          )}
          {peer.points !== undefined && peer.points >= 0 && (
            <span className={styles.pointsBadge} title={`${peer.points} Puan`}>
              ⭐ {peer.points}
            </span>
          )}
        </span>
      </div>
      <div className={styles.actions}>
        {!isSelf && (
          <button
            className={styles.addFriendBtn}
            onClick={() => onAddFriend(peer.uid)}
            title="Arkadaş Ekle"
            style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
          >
            <UserPlus size={14} />
          </button>
        )}
        {!isSelf && isPrivileged && peer.role !== 'host' && (
          <>
            <button
              className={styles.actionIconBtn}
              onClick={() => onTimeout(peer)}
              title="Sustur (Timeout)"
              style={{ background: 'transparent', border: 'none', color: '#F59E0B', cursor: 'pointer', padding: '4px' }}
            >
              <Clock size={14} />
            </button>

            <button
              className={styles.actionIconBtn}
              onClick={() => onBan(peer)}
              title="Sunucudan Banla"
              style={{ background: 'transparent', border: 'none', color: '#FF4D4D', cursor: 'pointer', padding: '4px' }}
            >
              <ShieldAlert size={14} />
            </button>

            <button
              className={styles.kickBtn}
              onClick={() => onKick(peerId, peer.uid, peer.username)}
              title="Sunucudan Çıkar (Tekmele)"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function MembersPanel({ kickPeer }) {
  const { peers } = usePeerStore();
  const { activeSpaceId, getActiveSpace } = useSpaceStore();
  const { identity } = useIdentityStore();
  const { addToast } = useUIStore();
  
  const [kickTarget, setKickTarget] = useState(null);
  const [timeoutTarget, setTimeoutTarget] = useState(null);
  const [banTarget, setBanTarget] = useState(null);
  const [dbMembers, setDbMembers] = useState([]);

  const space = getActiveSpace();
  const myMember = dbMembers.find(m => m.uid === identity?.uid);
  const iAmHost = space?.hostUid === identity?.uid;
  const isPrivileged = iAmHost || myMember?.role === 'admin' || myMember?.role === 'mod';

  useEffect(() => {
    if (!activeSpaceId) return;
    const unsubscribe = subscribeToMembers(activeSpaceId, (members) => {
      setDbMembers(members);
    });
    return () => unsubscribe();
  }, [activeSpaceId]);

  const handleAddFriend = async (targetUid) => {
    if (!targetUid || targetUid === identity.uid) return;
    try {
      await sendFriendRequest(identity.uid, targetUid);
      addToast({ type: 'success', message: 'Arkadaşlık isteği gönderildi!' });
    } catch (err) {
      addToast({ type: 'error', message: err.message });
    }
  };

  const handleApplyTimeout = async (targetUid, durationMinutes, reason) => {
    try {
      await applyMemberTimeout(activeSpaceId, identity.uid, targetUid, durationMinutes, reason);
      addToast({ type: 'success', message: `Kullanıcıya ${durationMinutes} dakika zaman aşımı verildi.` });
    } catch (err) {
      addToast({ type: 'error', message: 'Timeout verilemedi: ' + err.message });
    }
  };

  const handleApplyBan = async (targetUid, { banType, durationDays, reason }) => {
    try {
      await banMember(activeSpaceId, identity.uid, targetUid, { banType, durationDays, reason });
      // P2P kick da yapalım
      if (kickPeer) kickPeer(targetUid, activeSpaceId);
      addToast({ type: 'success', message: 'Kullanıcı sunucudan yasaklandı.' });
    } catch (err) {
      addToast({ type: 'error', message: 'Ban uygulanamadı: ' + err.message });
    }
  };

  const handleConfirmKick = async () => {
    if (!kickTarget) return;
    try {
      await kickMember(activeSpaceId, identity.uid, kickTarget.uid);
      if (kickPeer) kickPeer(kickTarget.peerId || kickTarget.uid, activeSpaceId);
      addToast({ type: 'info', message: `${kickTarget.name} sunucudan atıldı.` });
    } catch (err) {
      addToast({ type: 'error', message: 'Tekmeleme hatası: ' + err.message });
    } finally {
      setKickTarget(null);
    }
  };

  // Firebase üyeleri ile PeerJS çevrimiçi üyeleri birleştir
  const peerEntries = Object.entries(peers).filter(([_, p]) => p.spaceCode === space?.code);
  
  const mergedMembers = dbMembers.filter(m => m.uid !== identity?.uid).map(m => {
    return {
      uid: m.uid,
      peerId: m.uid,
      username: m.username,
      avatarColor: m.avatarColor,
      status: m.online ? 'online' : 'offline',
      isHost: m.role === 'host',
      role: m.role || 'member',
      points: m.points || 0,
      timeoutUntil: m.timeoutUntil || null
    };
  });

  peerEntries.forEach(([peerId, peer]) => {
    const existing = mergedMembers.find(m => m.username === peer.username || m.uid === peerId);
    if (existing) {
      existing.peerId = peerId;
      existing.status = 'online';
    } else {
      mergedMembers.push({
        uid: peerId,
        peerId,
        username: peer.username,
        avatarColor: peer.avatarColor,
        status: 'online',
        isHost: space?.hostPeerId === peerId,
        role: 'member',
        points: 0
      });
    }
  });

  const onlineMembers = mergedMembers.filter(m => m.status === 'online');
  const offlineMembers = mergedMembers.filter(m => m.status === 'offline');
  const myPoints = myMember?.points || 0;
  const totalCount = mergedMembers.length + 1; // +1 for self

  return (
    <aside className={styles.panel} aria-label="Üyeler">
      <div className={styles.header}>
        <Users size={14} />
        <span>ÜYELER — {totalCount}</span>
      </div>

      <div className={styles.list} role="list" aria-label="Bağlı üyeler">
        {/* Çevrim İçi Başlığı */}
        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', padding: '8px 8px 4px', letterSpacing: '0.05em' }}>
          ÇEVRİMİÇİ — {onlineMembers.length + 1}
        </div>

        {/* Kendimiz */}
        <MemberItem
          peerId="self"
          peer={{
            uid: identity?.uid,
            username: identity?.username || 'Ben',
            avatarColor: identity?.avatarColor,
            status: 'online',
            role: space?.isHost ? 'host' : (myMember?.role || 'member'),
            points: myPoints
          }}
          isSelf
          iAmHost={iAmHost}
          isPrivileged={isPrivileged}
        />

        {/* Online Diğer Katılımcılar */}
        {onlineMembers.map((m) => (
          <MemberItem
            key={m.uid}
            peerId={m.peerId}
            peer={m}
            isSelf={false}
            iAmHost={iAmHost}
            isPrivileged={isPrivileged}
            onKick={(id, uid, name) => setKickTarget({ peerId: id, uid, name })}
            onTimeout={(member) => setTimeoutTarget(member)}
            onBan={(member) => setBanTarget(member)}
            onAddFriend={handleAddFriend}
          />
        ))}

        {/* Çevrim Dışı Başlığı */}
        {offlineMembers.length > 0 && (
          <>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748B', padding: '16px 8px 4px', letterSpacing: '0.05em' }}>
              ÇEVRİMDIŞI — {offlineMembers.length}
            </div>

            {offlineMembers.map((m) => (
              <MemberItem
                key={m.uid}
                peerId={m.peerId}
                peer={m}
                isSelf={false}
                iAmHost={iAmHost}
                isPrivileged={isPrivileged}
                onKick={(id, uid, name) => setKickTarget({ peerId: id, uid, name })}
                onTimeout={(member) => setTimeoutTarget(member)}
                onBan={(member) => setBanTarget(member)}
                onAddFriend={handleAddFriend}
              />
            ))}
          </>
        )}

        {mergedMembers.length === 0 && (
          <div className={styles.empty}>
            <WifiOff size={20} />
            <p>Henüz başka üye yok.</p>
            <p>Oda kodunu paylaş!</p>
          </div>
        )}
      </div>

      {/* Kick Onay Modalı */}
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
              style={{ background: 'var(--dnd)', color: '#FFF' }} 
              onClick={handleConfirmKick}
            >
              Tekmele
            </Button>
          </div>
        </div>
      </Modal>

      {/* Timeout Modalı */}
      <TimeoutModal
        isOpen={!!timeoutTarget}
        onClose={() => setTimeoutTarget(null)}
        targetUser={timeoutTarget}
        onApplyTimeout={handleApplyTimeout}
      />

      {/* Ban Modalı */}
      <BanModal
        isOpen={!!banTarget}
        onClose={() => setBanTarget(null)}
        targetUser={banTarget}
        onApplyBan={handleApplyBan}
      />
    </aside>
  );
}
