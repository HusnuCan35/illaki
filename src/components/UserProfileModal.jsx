import { useState, useEffect } from 'react';
import { User, Crown, Shield, Star, UserPlus, Check, UserCheck, X } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useIdentityStore, useUIStore } from '../stores';
import { sendFriendRequest, subscribeToFriends, getUserProfile } from '../lib/firestore';
import styles from './UserProfileModal.module.css';

export function UserProfileModal({ isOpen, onClose, user }) {
  const { identity } = useIdentityStore();
  const { addToast } = useUIStore();
  
  const [isFriend, setIsFriend] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(false);

  const isSelf = user?.uid === identity?.uid || user?.id === identity?.uid;
  const targetUid = user?.uid || user?.id;

  useEffect(() => {
    if (!isOpen || !targetUid) return;

    // Fetch full profile from Firestore if needed
    getUserProfile(targetUid).then(p => {
      if (p) setProfileData(p);
    }).catch(() => {});

    // Check friendship status
    if (identity?.uid && !isSelf) {
      const unsub = subscribeToFriends(identity.uid, (friends) => {
        const found = friends.some(f => f.uid === targetUid || f.friendUid === targetUid);
        setIsFriend(found);
      });
      return () => unsub();
    }
  }, [isOpen, targetUid, identity?.uid, isSelf]);

  if (!isOpen || !user) return null;

  const handleAddFriend = async () => {
    if (!targetUid || isSelf) return;
    setLoading(true);
    try {
      await sendFriendRequest(identity.uid, targetUid);
      setRequestSent(true);
      addToast({ type: 'success', message: 'Arkadaşlık isteği gönderildi!' });
    } catch (err) {
      addToast({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const username = user.username || profileData?.username || 'Kullanıcı';
  const customId = profileData?.customId || user.customId || null;
  const avatarColor = user.avatarColor || profileData?.avatarColor || 'var(--accent)';
  const points = user.points !== undefined ? user.points : (profileData?.points || 0);
  const role = user.role || 'member';
  const status = user.status || (user.online ? 'online' : 'offline');

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.card}>
        {/* Banner / Header */}
        <div className={styles.banner} style={{ background: avatarColor }}>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Avatar */}
        <div className={styles.avatarWrapper}>
          <div className={styles.avatar} style={{ background: avatarColor }}>
            {username.slice(0, 2).toUpperCase()}
          </div>
          <span className={`${styles.statusBadge} ${styles[status]}`} />
        </div>

        {/* Profile Info */}
        <div className={styles.body}>
          <div className={styles.nameSection}>
            <h3 className={styles.username}>{username}</h3>
            {customId && <span className={styles.customId}>@{customId}</span>}
          </div>

          <div className={styles.badgesRow}>
            {role === 'host' ? (
              <span className={`${styles.badge} ${styles.badgeHost}`}>
                <Crown size={12} /> Kurucu
              </span>
            ) : role === 'mod' ? (
              <span className={`${styles.badge} ${styles.badgeMod}`}>
                <Shield size={12} /> Moderatör
              </span>
            ) : role === 'admin' ? (
              <span className={`${styles.badge} ${styles.badgeAdmin}`}>
                <Shield size={12} /> Yönetici
              </span>
            ) : (
              <span className={`${styles.badge} ${styles.badgeMember}`}>
                Üye
              </span>
            )}

            <span className={`${styles.badge} ${styles.badgePoints}`}>
              <Star size={12} /> {points} Puan
            </span>
          </div>

          {/* Action buttons */}
          <div className={styles.actions}>
            {isSelf ? (
              <span className={styles.selfLabel}>Bu Senin Profilin</span>
            ) : isFriend ? (
              <div className={styles.friendBadge}>
                <UserCheck size={16} />
                <span>Arkadaşsınız</span>
              </div>
            ) : (
              <Button
                onClick={handleAddFriend}
                loading={loading}
                disabled={requestSent}
                icon={requestSent ? <Check size={16} /> : <UserPlus size={16} />}
                fullWidth
              >
                {requestSent ? 'İstek Gönderildi' : 'Arkadaş Ekle'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
