import { Users, WifiOff, Crown, UserPlus, UserCheck } from 'lucide-react';
import { useState, useEffect } from 'react';
import { usePeerStore, useSpaceStore, useIdentityStore, useUIStore } from '../stores';
import { UserProfileModal } from './UserProfileModal';
import { 
  subscribeToMembers, sendFriendRequest, subscribeToFriends 
} from '../lib/firestore';
import styles from './MembersPanel.module.css';

function MemberItem({ 
  peer, 
  isSelf, 
  isFriend, 
  onAddFriend,
  onClick
}) {
  const initial = (peer.username || '?').slice(0, 2).toUpperCase();

  return (
    <div 
      className={styles.member} 
      role="listitem"
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
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

      <div className={styles.actions} onClick={e => e.stopPropagation()}>
        {!isSelf && !isFriend && (
          <button
            className={styles.addFriendBtn}
            onClick={() => onAddFriend(peer.uid)}
            title="Arkadaş Ekle"
            style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '6px' }}
          >
            <UserPlus size={15} />
          </button>
        )}
        {!isSelf && isFriend && (
          <span title="Arkadaşsınız" style={{ color: '#10B981', display: 'flex', alignItems: 'center', padding: '4px' }}>
            <UserCheck size={15} />
          </span>
        )}
      </div>
    </div>
  );
}

export function MembersPanel() {
  const { peers } = usePeerStore();
  const { activeSpaceId, getActiveSpace } = useSpaceStore();
  const { identity } = useIdentityStore();
  const { addToast } = useUIStore();
  
  const [dbMembers, setDbMembers] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);

  const space = getActiveSpace();

  useEffect(() => {
    if (!activeSpaceId) return;
    const unsubscribe = subscribeToMembers(activeSpaceId, (members) => {
      setDbMembers(members);
    });
    return () => unsubscribe();
  }, [activeSpaceId]);

  useEffect(() => {
    if (!identity?.uid) return;
    const unsub = subscribeToFriends(identity.uid, (friends) => {
      setFriendsList(friends);
    });
    return () => unsub();
  }, [identity?.uid]);

  const handleAddFriend = async (targetUid) => {
    if (!targetUid || targetUid === identity.uid) return;
    try {
      await sendFriendRequest(identity.uid, targetUid);
      addToast({ type: 'success', message: 'Arkadaşlık isteği gönderildi!' });
    } catch (err) {
      addToast({ type: 'error', message: err.message });
    }
  };

  const isUserFriend = (targetUid) => {
    return friendsList.some(f => f.uid === targetUid || f.friendUid === targetUid);
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
  const myMember = dbMembers.find(m => m.uid === identity?.uid);
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
          peer={{
            uid: identity?.uid,
            username: identity?.username || 'Ben',
            avatarColor: identity?.avatarColor,
            status: 'online',
            role: space?.isHost ? 'host' : (myMember?.role || 'member'),
            points: myPoints
          }}
          isSelf
          isFriend={false}
          onClick={() => setSelectedUser({
            uid: identity?.uid,
            username: identity?.username || 'Ben',
            avatarColor: identity?.avatarColor,
            status: 'online',
            role: space?.isHost ? 'host' : (myMember?.role || 'member'),
            points: myPoints
          })}
        />

        {/* Online Diğer Katılımcılar */}
        {onlineMembers.map((m) => (
          <MemberItem
            key={m.uid}
            peer={m}
            isSelf={false}
            isFriend={isUserFriend(m.uid)}
            onAddFriend={handleAddFriend}
            onClick={() => setSelectedUser(m)}
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
                peer={m}
                isSelf={false}
                isFriend={isUserFriend(m.uid)}
                onAddFriend={handleAddFriend}
                onClick={() => setSelectedUser(m)}
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

      {/* Profil Modalı */}
      <UserProfileModal
        isOpen={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        user={selectedUser}
      />
    </aside>
  );
}
