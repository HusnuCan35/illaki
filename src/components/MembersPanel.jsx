import { Users, WifiOff, Crown, UserPlus, UserCheck, Shield } from 'lucide-react';
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
      className={`${styles.member} ${peer.status === 'offline' ? styles.offlineMember : ''}`} 
      role="listitem"
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <div
        className={styles.avatar}
        style={{ background: peer.avatarColor || '#FF7E20' }}
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
            <span className={styles.selfTag} style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#64748B' }}>çevrimdışı</span>
          )}
        </span>
        <span className={styles.sub}>
          {peer.role === 'host' ? (
            <span style={{ color: '#FAA61A', display: 'flex', alignItems: 'center', gap: 3 }}><Crown size={10} /> Kurucu</span>
          ) : peer.role === 'admin' ? (
            <span style={{ color: '#3B82F6', display: 'flex', alignItems: 'center', gap: 3 }}><Shield size={10} /> Yönetici</span>
          ) : peer.role === 'mod' ? (
            <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: 3 }}><Shield size={10} /> Moderatör</span>
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
            style={{ background: 'transparent', border: 'none', color: '#FF7E20', cursor: 'pointer', padding: '6px' }}
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
  
  const nowMs = Date.now();
  const mergedMembers = dbMembers.filter(m => m.uid !== identity?.uid).map(m => {
    const isPeerConnected = peerEntries.some(([pId, p]) => 
      pId === m.uid || 
      pId === m.peerId || 
      p.uid === m.uid || 
      (p.username && p.username === m.username)
    );

    let lastSeenTime = 0;
    if (m.lastSeen) {
      if (typeof m.lastSeen.toMillis === 'function') lastSeenTime = m.lastSeen.toMillis();
      else if (typeof m.lastSeen.seconds === 'number') lastSeenTime = m.lastSeen.seconds * 1000;
      else if (typeof m.lastSeen === 'number') lastSeenTime = m.lastSeen;
    }

    const isRecent = lastSeenTime > 0 ? (nowMs - lastSeenTime < 60000) : false;
    const isTrulyOnline = isPeerConnected || (m.online === true && isRecent);

    return {
      uid: m.uid,
      peerId: m.uid,
      username: m.username,
      avatarColor: m.avatarColor,
      status: isTrulyOnline ? 'online' : 'offline',
      isHost: m.role === 'host',
      role: m.role || 'member',
      points: m.points || 0,
      bio: m.bio || '',
      banner: m.banner || '',
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

  const selfRole = space?.isHost ? 'host' : (dbMembers.find(m => m.uid === identity?.uid)?.role || 'member');
  const selfPoints = dbMembers.find(m => m.uid === identity?.uid)?.points || 0;

  const selfMember = {
    uid: identity?.uid,
    username: identity?.username || 'Ben',
    avatarColor: identity?.avatarColor || '#FF7E20',
    status: 'online',
    role: selfRole,
    points: selfPoints
  };

  const onlineOthers = mergedMembers.filter(m => m.status === 'online');
  const offlineMembers = mergedMembers.filter(m => m.status === 'offline');

  // Rol bazlı gruplama
  const onlineHosts = [selfMember, ...onlineOthers].filter(m => m.role === 'host');
  const onlineAdmins = [selfMember, ...onlineOthers].filter(m => m.role === 'admin');
  const onlineMods = [selfMember, ...onlineOthers].filter(m => m.role === 'mod');
  const onlineNormal = [selfMember, ...onlineOthers].filter(m => m.role !== 'host' && m.role !== 'admin' && m.role !== 'mod');

  const totalOnlineCount = 1 + onlineOthers.length;
  const totalCount = mergedMembers.length + 1;

  return (
    <aside className={styles.panel} aria-label="Üyeler">
      <div className={styles.header}>
        <Users size={14} />
        <span>ÜYELER — {totalCount}</span>
      </div>

      <div className={styles.list} role="list" aria-label="Bağlı üyeler">
        <div className={styles.sectionHeaderTitle}>
          ÇEVRİMİÇİ — {totalOnlineCount}
        </div>

        {/* 👑 KURUCULAR */}
        {onlineHosts.length > 0 && (
          <div className={styles.roleGroup}>
            <div className={styles.roleHeader} style={{ color: '#FAA61A' }}>
              👑 KURUCU — {onlineHosts.length}
            </div>
            {onlineHosts.map((m) => (
              <MemberItem
                key={m.uid}
                peer={m}
                isSelf={m.uid === identity?.uid}
                isFriend={m.uid !== identity?.uid && isUserFriend(m.uid)}
                onAddFriend={handleAddFriend}
                onClick={() => setSelectedUser(m)}
              />
            ))}
          </div>
        )}

        {/* 🛡️ YÖNETİCİLER */}
        {onlineAdmins.length > 0 && (
          <div className={styles.roleGroup}>
            <div className={styles.roleHeader} style={{ color: '#3B82F6' }}>
              🛡️ YÖNETİCİLER — {onlineAdmins.length}
            </div>
            {onlineAdmins.map((m) => (
              <MemberItem
                key={m.uid}
                peer={m}
                isSelf={m.uid === identity?.uid}
                isFriend={m.uid !== identity?.uid && isUserFriend(m.uid)}
                onAddFriend={handleAddFriend}
                onClick={() => setSelectedUser(m)}
              />
            ))}
          </div>
        )}

        {/* 🛡️ MODERATÖRLER */}
        {onlineMods.length > 0 && (
          <div className={styles.roleGroup}>
            <div className={styles.roleHeader} style={{ color: '#10B981' }}>
              🛡️ MODERATÖRLER — {onlineMods.length}
            </div>
            {onlineMods.map((m) => (
              <MemberItem
                key={m.uid}
                peer={m}
                isSelf={m.uid === identity?.uid}
                isFriend={m.uid !== identity?.uid && isUserFriend(m.uid)}
                onAddFriend={handleAddFriend}
                onClick={() => setSelectedUser(m)}
              />
            ))}
          </div>
        )}

        {/* 👤 ÇEVRİMİÇİ ÜYELER */}
        {onlineNormal.length > 0 && (
          <div className={styles.roleGroup}>
            { (onlineHosts.length > 0 || onlineAdmins.length > 0 || onlineMods.length > 0) && (
              <div className={styles.roleHeader} style={{ color: '#94A3B8' }}>
                👤 ÜYELER — {onlineNormal.length}
              </div>
            )}
            {onlineNormal.map((m) => (
              <MemberItem
                key={m.uid}
                peer={m}
                isSelf={m.uid === identity?.uid}
                isFriend={m.uid !== identity?.uid && isUserFriend(m.uid)}
                onAddFriend={handleAddFriend}
                onClick={() => setSelectedUser(m)}
              />
            ))}
          </div>
        )}

        {/* ⚪ ÇEVRİMDİŞİ ÜYELER */}
        {offlineMembers.length > 0 && (
          <div className={styles.roleGroup} style={{ marginTop: '16px' }}>
            <div className={styles.sectionHeaderTitle}>
              ÇEVRİMDİŞİ — {offlineMembers.length}
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
          </div>
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
