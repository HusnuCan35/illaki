import { Users, WifiOff, Crown, UserPlus, UserCheck, Shield, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { usePeerStore, useSpaceStore, useIdentityStore, useUIStore } from '../stores';
import { UserProfileModal } from './UserProfileModal';
import { 
  subscribeToMembers, sendFriendRequest, subscribeToFriends, subscribeToRoles 
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
        {peer.customStatus && (
          <span className={styles.customStatus}>
            {peer.customStatus}
          </span>
        )}
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

export function MembersPanel({ kickPeer, onClose }) {
  const { peers } = usePeerStore();
  const { activeSpaceId, getActiveSpace } = useSpaceStore();
  const { identity } = useIdentityStore();
  const { addToast } = useUIStore();
  
  const [dbMembers, setDbMembers] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [customRoles, setCustomRoles] = useState([]);

  const space = getActiveSpace();

  useEffect(() => {
    if (!activeSpaceId) return;
    const unsubscribe = subscribeToMembers(activeSpaceId, (members) => {
      setDbMembers(members);
    });
    const unsubRoles = subscribeToRoles(activeSpaceId, (roles) => {
      setCustomRoles(roles);
    });
    return () => {
      unsubscribe();
      unsubRoles();
    };
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
  
  const isGenericName = (name) => !name || name === 'Kullanıcı' || name === 'Anonim' || name === 'Bağlanıyor...' || name === 'Katılımcı';

  const nowMs = Date.now();
  const mergedMembers = dbMembers.filter(m => m.uid !== identity?.uid).map(m => {
    const isPeerConnected = peerEntries.some(([pId, p]) => 
      pId === m.uid || 
      pId === m.peerId || 
      p.uid === m.uid || 
      (p.username && p.username === m.username)
    );

    const lastSeenMs = m.lastSeen?.toMillis ? m.lastSeen.toMillis() : (m.lastSeen?.seconds ? m.lastSeen.seconds * 1000 : Date.now());
    const isTrulyOnline = isPeerConnected || (m.online === true && (Date.now() - lastSeenMs < 180000));

    return {
      uid: m.uid,
      peerId: m.uid,
      username: m.username,
      avatarColor: m.avatarColor,
      status: isTrulyOnline ? (m.status || 'online') : 'offline',
      isHost: m.role === 'host',
      role: m.role || 'member',
      roles: m.roles || [], // Custom roles array
      points: m.points || 0,
      bio: m.bio || '',
      banner: m.banner || '',
      customStatus: m.customStatusText || '',
      timeoutUntil: m.timeoutUntil || null
    };
  });

  peerEntries.forEach(([peerId, peer]) => {
    const existing = mergedMembers.find(m => m.uid === peer.uid || m.username === peer.username || m.uid === peerId);
    if (existing) {
      existing.peerId = peerId;
      existing.status = existing.status !== 'offline' ? existing.status : 'online';
      if (isGenericName(existing.username) && !isGenericName(peer.username)) {
        existing.username = peer.username;
      }
    } else {
      mergedMembers.push({
        uid: peer.uid || peerId,
        peerId,
        username: isGenericName(peer.username) ? 'Üye' : peer.username,
        avatarColor: peer.avatarColor,
        status: peer.status || 'online',
        isHost: space?.hostPeerId === peerId,
        role: 'member',
        customStatus: peer.customStatus || '',
        points: 0
      });
    }
  });

  const selfDbMember = dbMembers.find(m => m.uid === identity?.uid);
  const selfRole = space?.isHost ? 'host' : (selfDbMember?.role || 'member');
  const selfPoints = selfDbMember?.points || 0;
  const selfRoles = selfDbMember?.roles || [];

  const selfMember = {
    uid: identity?.uid,
    username: identity?.username || 'Ben',
    avatarColor: identity?.avatarColor || '#FF7E20',
    status: identity?.status || 'online',
    customStatus: identity?.customStatus || '',
    role: selfRole,
    roles: selfRoles,
    points: selfPoints
  };

  const onlineOthers = mergedMembers.filter(m => m.status !== 'offline');
  const offlineMembers = mergedMembers.filter(m => m.status === 'offline');

  const allOnline = [selfMember, ...onlineOthers];

  // Mark grouped property so a user isn't shown multiple times
  allOnline.forEach(m => m.grouped = false);

  const onlineHosts = allOnline.filter(m => !m.grouped && m.role === 'host');
  onlineHosts.forEach(m => m.grouped = true);

  const onlineAdmins = allOnline.filter(m => !m.grouped && m.role === 'admin');
  onlineAdmins.forEach(m => m.grouped = true);

  const onlineMods = allOnline.filter(m => !m.grouped && m.role === 'mod');
  onlineMods.forEach(m => m.grouped = true);

  // Group by custom roles (in order of customRoles array)
  const customRoleGroups = customRoles.map(cr => {
    const groupMembers = allOnline.filter(m => !m.grouped && m.roles?.includes(cr.id));
    groupMembers.forEach(m => m.grouped = true);
    return { role: cr, members: groupMembers };
  }).filter(g => g.members.length > 0);

  const onlineNormal = allOnline.filter(m => !m.grouped);

  const totalOnlineCount = allOnline.length;
  const totalCount = mergedMembers.length + 1;

  return (
    <aside className={styles.panel} aria-label="Üyeler">
      <div className={styles.header}>
        <Users size={14} />
        <span>ÜYELER — {totalCount}</span>
        {onClose && (
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Üyeler panelini kapat"
            title="Kapat"
          >
            <X size={18} />
          </button>
        )}
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

        {/* ÖZEL ROLLER */}
        {customRoleGroups.map(group => (
          <div key={group.role.id} className={styles.roleGroup}>
            <div className={styles.roleHeader} style={{ color: group.role.color || '#FFF' }}>
              {group.role.name.toUpperCase()} — {group.members.length}
            </div>
            {group.members.map((m) => (
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
        ))}

        {/* 👤 ÇEVRİMİÇİ ÜYELER */}
        {onlineNormal.length > 0 && (
          <div className={styles.roleGroup}>
            { (onlineHosts.length > 0 || onlineAdmins.length > 0 || onlineMods.length > 0 || customRoleGroups.length > 0) && (
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
