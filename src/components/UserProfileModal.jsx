import { useState, useEffect } from 'react';
import { Crown, Shield, Star, UserPlus, Check, UserCheck, X, Edit3, Save } from 'lucide-react';
import { Button } from './ui/Button';
import { useIdentityStore, useUIStore } from '../stores';
import { sendFriendRequest, subscribeToFriends, getUserProfile, updateUserProfileDetails } from '../lib/firestore';
import styles from './UserProfileModal.module.css';

export const PRESET_BANNERS = [
  {
    id: 'tr_flag',
    name: '🇹🇷 Türk Bayrağı',
    style: {
      backgroundImage: `url('https://png.pngtree.com/thumb_back/fh260/background/20210204/pngtree-beautiful-turkish-flag-background-image_554991.jpg')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    },
    badge: '🇹🇷 Türk Bayrağı'
  },
  {
    id: 'ataturk',
    name: '🇹🇷 Atatürk',
    style: {
      backgroundImage: `url('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSuvwZ6czQAEFb_ozLewMGScDeEskkkyqR8a-bbiirUomyjG1BFu_9btrk&s=10')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      borderBottom: '2px solid #D4AF37'
    },
    badge: '🇹🇷 Gazi Mustafa Kemal Atatürk'
  },
  {
    id: 'cyber',
    name: '⚡ Cyber Orange',
    style: {
      background: 'linear-gradient(135deg, #FF7E20 0%, #B34400 100%)'
    }
  },
  {
    id: 'midnight',
    name: '🌌 Gece Mavisi',
    style: {
      background: 'linear-gradient(135deg, #3B82F6 0%, #1E3A8A 100%)'
    }
  }
];

export function UserProfileModal({ isOpen, onClose, user }) {
  const { identity, updateIdentity } = useIdentityStore();
  const { addToast } = useUIStore();
  
  const [isFriend, setIsFriend] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editBanner, setEditBanner] = useState('tr_flag');
  const [customBannerUrl, setCustomBannerUrl] = useState('');

  const isSelf = user?.uid === identity?.uid || user?.id === identity?.uid;
  const targetUid = user?.uid || user?.id;

  useEffect(() => {
    if (!isOpen || !targetUid) return;

    getUserProfile(targetUid).then(p => {
      if (p) {
        setProfileData(p);
        if (isSelf) {
          setEditBio(p.bio || identity?.bio || '');
          setEditBanner(p.banner || identity?.banner || 'tr_flag');
          if (p.banner?.startsWith('http')) setCustomBannerUrl(p.banner);
        }
      }
    }).catch(() => {});

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

  const handleSaveProfile = async () => {
    if (!identity?.uid) return;
    setLoading(true);
    try {
      const bannerValue = editBanner === 'custom' ? customBannerUrl.trim() : editBanner;
      await updateUserProfileDetails(identity.uid, {
        bio: editBio.trim(),
        banner: bannerValue,
      });
      updateIdentity({ bio: editBio.trim(), banner: bannerValue });
      setProfileData(prev => ({ ...prev, bio: editBio.trim(), banner: bannerValue }));
      addToast({ type: 'success', message: 'Profil güncellendi ✨' });
      setIsEditing(false);
    } catch (err) {
      addToast({ type: 'error', message: 'Güncellenemedi: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const username = user.username || profileData?.username || identity?.username || 'Kullanıcı';
  const customId = profileData?.customId || user.customId || null;
  const avatarColor = user.avatarColor || profileData?.avatarColor || 'var(--accent)';
  const points = user.points !== undefined ? user.points : (profileData?.points || 0);
  const role = user.role || 'member';
  const status = user.status || (user.online ? 'online' : 'offline');

  const bannerKey = isSelf ? (profileData?.banner || identity?.banner || 'tr_flag') : (profileData?.banner || user.banner || 'tr_flag');
  const selectedPreset = PRESET_BANNERS.find(b => b.id === bannerKey);
  const isUrlBanner = bannerKey && bannerKey.startsWith('http');

  const bannerStyle = isUrlBanner
    ? { backgroundImage: `url(${bannerKey})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : selectedPreset ? selectedPreset.style : { background: avatarColor };

  const bioText = isSelf ? (profileData?.bio || identity?.bio) : (profileData?.bio || user.bio);

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.card}>
        {/* Banner / Header */}
        <div className={styles.banner} style={bannerStyle}>
          {selectedPreset?.id === 'tr_flag' && (
            <div className={styles.trBadge}>🇹🇷 TÜRKİYE</div>
          )}
          {selectedPreset?.id === 'ataturk' && (
            <div className={styles.ataturkBadge}>🇹🇷 K. ATATÜRK</div>
          )}
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Avatar */}
        <div className={styles.avatarWrapper}>
          <div className={styles.avatar} style={{ background: avatarColor }}>
            {(username || '?').slice(0, 2).toUpperCase()}
          </div>
          <span className={`${styles.statusBadge} ${styles[status]}`} />
        </div>

        {/* Profile Info */}
        <div className={styles.body}>
          <div className={styles.nameHeader}>
            <div>
              <h3 className={styles.username}>{username}</h3>
              {customId && <span className={styles.customId}>@{customId}</span>}
            </div>

            {isSelf && !isEditing && (
              <button className={styles.editBtn} onClick={() => setIsEditing(true)}>
                <Edit3 size={14} /> Düzenle
              </button>
            )}
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
              <span className={`${styles.badge} ${styles.badgeMember}`}>Üye</span>
            )}

            <span className={`${styles.badge} ${styles.badgePoints}`}>
              <Star size={12} /> {points} Puan
            </span>
          </div>

          {/* Profile Bio Section */}
          {!isEditing ? (
            <div className={styles.bioSection}>
              <div className={styles.sectionTitle}>HAKKIMDA</div>
              <p className={styles.bioContent}>
                {bioText || 'Henüz bir açıklama eklenmemiş.'}
              </p>
            </div>
          ) : (
            <div className={styles.editForm}>
              <div className={styles.sectionTitle}>PROFİL DÜZENLE</div>
              
              <div className={styles.inputGroup}>
                <label>Hakkımda / Açıklama:</label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Kendinden bahset..."
                  maxLength={250}
                  className={styles.textarea}
                  rows={3}
                />
              </div>

              <div className={styles.inputGroup}>
                <label>Profil Arka Planı (Banner):</label>
                <div className={styles.bannerGrid}>
                  {PRESET_BANNERS.map(b => (
                    <button
                      key={b.id}
                      type="button"
                      className={`${styles.bannerPill} ${editBanner === b.id ? styles.activeBannerPill : ''}`}
                      onClick={() => setEditBanner(b.id)}
                    >
                      {b.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`${styles.bannerPill} ${editBanner === 'custom' ? styles.activeBannerPill : ''}`}
                    onClick={() => setEditBanner('custom')}
                  >
                    🔗 Özel URL
                  </button>
                </div>

                {editBanner === 'custom' && (
                  <input
                    type="url"
                    value={customBannerUrl}
                    onChange={(e) => setCustomBannerUrl(e.target.value)}
                    placeholder="https://gorsel-linki.com/banner.jpg"
                    className={styles.urlInput}
                  />
                )}
              </div>

              <div className={styles.editActions}>
                <button className={styles.cancelBtn} onClick={() => setIsEditing(false)}>İptal</button>
                <Button onClick={handleSaveProfile} loading={loading} icon={<Save size={14} />}>
                  Kaydet
                </Button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {!isEditing && (
            <div className={styles.actions} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!isSelf && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const { createDuel } = await import('../lib/firestore');
                      const { useSpaceStore } = await import('../stores');
                      const activeSpaceId = useSpaceStore.getState().activeSpaceId;
                      const opponentUid = user?.uid || user?.id;
                      const opponentName = user?.username || user?.name || 'Kullanıcı';
                      if (!activeSpaceId || !opponentUid) {
                        addToast({ type: 'error', message: 'Düello için oda veya üye bilgisi bulunamadı.' });
                        return;
                      }
                      await createDuel(activeSpaceId, identity, { uid: opponentUid, username: opponentName });
                      addToast({ type: 'success', message: `${opponentName} kullanıcısına düello teklifi gönderildi!` });
                      onClose();
                    } catch (err) {
                      console.error('Düello oluşturma hatası:', err);
                      addToast({ type: 'error', message: 'Düello daveti gönderilemedi: ' + (err.message || '') });
                    }
                  }}
                  style={{
                    width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid rgba(255, 126, 32, 0.4)',
                    background: 'rgba(255, 126, 32, 0.15)', color: '#FF7E20', fontWeight: '700', fontSize: '13px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                >
                  ⚔️ Taş-Kağıt-Makas Düellosu Daveti Et
                </button>
              )}

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
          )}
        </div>
      </div>
    </div>
  );
}
