import { useState, useEffect } from 'react';
import { Users, UserPlus, UserX, Check, X, LogIn, MessageSquare, Clock, Globe, Copy, Sparkles, UserSearch } from 'lucide-react';
import { useIdentityStore, useSpaceStore, useUIStore, usePeerStore } from '../stores';
import { subscribeToFriends, subscribeToFriendRequests, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, removeFriend, subscribeToServerInvites, acceptServerInvite, rejectServerInvite } from '../lib/firestore';
import styles from './FriendsPanel.module.css';

export function FriendsPanel({ onJoinSpace, onStartDm }) {
  const { identity } = useIdentityStore();
  const { spaces } = useSpaceStore();
  const { addToast } = useUIStore();
  const { peers } = usePeerStore();
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [invites, setInvites] = useState([]);
  const [addInput, setAddInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('online'); // 'online', 'all', 'pending', 'add'

  useEffect(() => {
    if (!identity?.uid) return;
    const unsubFriends = subscribeToFriends(identity.uid, setFriends);
    const unsubRequests = subscribeToFriendRequests(identity.uid, setRequests);
    const unsubInvites = subscribeToServerInvites(identity.uid, setInvites);
    return () => {
      unsubFriends();
      unsubRequests();
      unsubInvites();
    };
  }, [identity?.uid]);

  const handleAddFriend = async (e) => {
    e.preventDefault();
    if (!addInput.trim()) return;
    setLoading(true);
    try {
      await sendFriendRequest(identity.uid, addInput.trim());
      setAddInput('');
      addToast({ type: 'success', message: 'Bağlantı isteği başarıyla gönderildi!' });
      setActiveTab('pending');
    } catch (err) {
      addToast({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = async (invite) => {
    try {
      await acceptServerInvite(identity.uid, invite.spaceId, invite.spaceCode, identity);
      if (onJoinSpace) onJoinSpace(invite.spaceCode, invite.spaceId);
      addToast({ type: 'success', message: 'Ağa katıldın!' });
    } catch (err) {
      addToast({ type: 'error', message: 'Ağa katılırken hata oluştu: ' + err.message });
    }
  };

  // derived states
  const onlineFriends = friends.filter(f => peers[f.peerId]);
  const pendingCount = requests.length + invites.length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <Users size={28} /> Bağlantılar
        </div>
        
        <div className={styles.segmentedControl}>
          <button 
            className={`${styles.pillBtn} ${activeTab === 'online' ? styles.pillBtnActive : ''}`}
            onClick={() => setActiveTab('online')}
          >
            Aktif
          </button>
          <button 
            className={`${styles.pillBtn} ${activeTab === 'all' ? styles.pillBtnActive : ''}`}
            onClick={() => setActiveTab('all')}
          >
            Tümü
          </button>
          <button 
            className={`${styles.pillBtn} ${activeTab === 'pending' ? styles.pillBtnActive : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            İstekler
            {pendingCount > 0 && <span className={styles.badge}>{pendingCount}</span>}
          </button>
          <button 
            className={`${styles.pillBtn} ${styles.addBtnPill} ${activeTab === 'add' ? styles.pillBtnActive : ''}`}
            onClick={() => setActiveTab('add')}
          >
            <UserPlus size={16} /> Yeni Bağlantı
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {activeTab === 'add' && (
          <div className={styles.addSection}>
            <div className={styles.addHero}>
              <h3>Yeni Bir Bağlantı Kur</h3>
              <p>Diğer kullanıcıları eşsiz İllaki ID'leri ile ekleyerek ağına dahil et.</p>
            </div>
            
            <form onSubmit={handleAddFriend} className={styles.addForm}>
              <input 
                type="text" 
                placeholder="İllaki ID buraya yapıştır..." 
                value={addInput}
                onChange={e => setAddInput(e.target.value)}
                disabled={loading}
                className={styles.addInput}
              />
              <button type="submit" disabled={loading || !addInput.trim()} className={styles.submitBtn}>
                Gönder
              </button>
            </form>

            <div className={styles.idBox}>
              <h4 style={{ fontSize: '13px', color: '#45A29E', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Senin İllaki ID'n
              </h4>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center', justifyContent: 'center' }}>
                <code style={{ fontSize: '18px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                  {identity?.customId || identity?.uid}
                </code>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(identity?.customId || identity?.uid);
                    addToast({ type: 'info', message: 'ID Kopyalandı!' });
                  }}
                  style={{ background: '#45A29E', border: 'none', color: '#000', padding: '8px', borderRadius: '10px', cursor: 'pointer' }}
                  title="Kopyala"
                >
                  <Copy size={18} />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'pending' && (
          <div className={styles.listSection}>
            {requests.length === 0 && invites.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIconWrapper}>
                  <Check size={48} />
                </div>
                <h3>Bekleyen İstek Yok</h3>
                <p>Şu an için bekleyen bir bağlantı talebi veya ağ davetin bulunmuyor. Her şey kontrol altında!</p>
              </div>
            ) : (
              <>
                {invites.length > 0 && (
                  <div>
                    <div className={styles.sectionTitle}>Ağ Davetleri ({invites.length})</div>
                    <div className={styles.grid} style={{ marginTop: '20px' }}>
                      {invites.map(invite => (
                        <div key={invite.id} className={styles.card}>
                          <div className={styles.cardHeader}>
                            <div className={styles.avatarWrapper}>
                              <div className={styles.avatar} style={{ background: 'linear-gradient(135deg, #1f2833, #0b0c10)', border: '2px solid #45A29E' }}>
                                {invite.spaceName.charAt(0).toUpperCase()}
                              </div>
                            </div>
                            <div className={styles.cardInfo}>
                              <span className={styles.username}>{invite.spaceName}</span>
                              <span className={styles.statusText}>{invite.senderUsername} davet etti</span>
                            </div>
                          </div>
                          <div className={styles.cardActions}>
                            <button className={`${styles.actionBtn} ${styles.primaryBtn}`} onClick={() => handleAcceptInvite(invite)}>
                              <Check size={16} /> Katıl
                            </button>
                            <button className={`${styles.actionBtn} ${styles.dangerBtn}`} onClick={() => rejectServerInvite(identity.uid, invite.spaceId)}>
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {requests.length > 0 && (
                  <div style={{ marginTop: '30px' }}>
                    <div className={styles.sectionTitle}>Bağlantı İstekleri ({requests.length})</div>
                    <div className={styles.grid} style={{ marginTop: '20px' }}>
                      {requests.map(req => (
                        <div key={req.id} className={styles.card}>
                          <div className={styles.cardHeader}>
                            <div className={styles.avatarWrapper}>
                              <div className={styles.avatar} style={{ backgroundColor: req.senderAvatarColor || '#45A29E' }}>
                                {req.senderUsername.charAt(0).toUpperCase()}
                              </div>
                            </div>
                            <div className={styles.cardInfo}>
                              <span className={styles.username}>{req.senderUsername}</span>
                              <span className={styles.statusText}>Sana bağlanmak istiyor</span>
                            </div>
                          </div>
                          <div className={styles.cardActions}>
                            <button className={`${styles.actionBtn} ${styles.primaryBtn}`} onClick={() => acceptFriendRequest(identity.uid, req.senderUid)}>
                              <Check size={16} /> Kabul Et
                            </button>
                            <button className={`${styles.actionBtn} ${styles.dangerBtn}`} onClick={() => rejectFriendRequest(identity.uid, req.senderUid)}>
                              <X size={16} /> Reddet
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {(activeTab === 'all' || activeTab === 'online') && (
          <div className={styles.listSection}>
            {friends.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIconWrapper}>
                  <UserSearch size={48} />
                </div>
                <h3>Ağın Şimdilik Boş</h3>
                <p>İllaki evreninde henüz kimseyle bağlantı kurmadın. Yeni Bağlantı sekmesinden ilk adımını atabilirsin.</p>
                <button 
                  onClick={() => setActiveTab('add')}
                  className={styles.submitBtn}
                  style={{ marginTop: '20px', padding: '12px 30px' }}
                >
                  Bağlantı Kur
                </button>
              </div>
            ) : (activeTab === 'online' && onlineFriends.length === 0) ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIconWrapper}>
                  <Clock size={48} />
                </div>
                <h3>Sessizlik...</h3>
                <p>Ağındaki hiç kimse şu an aktif değil. Tümü sekmesinden onlara çevrimdışı mesaj bırakabilirsin.</p>
              </div>
            ) : (
              <>
                <div className={styles.sectionTitle}>
                  {activeTab === 'online' ? `Aktif Bağlantılar (${onlineFriends.length})` : `Tüm Bağlantılar (${friends.length})`}
                </div>
                <div className={styles.grid}>
                  {(activeTab === 'online' ? onlineFriends : friends).map(friend => (
                    <div key={friend.uid} className={styles.card}>
                      <div className={styles.cardHeader}>
                        <div className={styles.avatarWrapper}>
                          <div className={styles.avatar} style={{ backgroundColor: friend.avatarColor || '#1f2833' }}>
                            {friend.username?.charAt(0).toUpperCase()}
                          </div>
                          <div className={peers[friend.peerId] ? styles.onlineDot : styles.offlineDot}></div>
                        </div>
                        <div className={styles.cardInfo}>
                          <span className={styles.username}>{friend.username}</span>
                          <span className={styles.statusText}>
                            {peers[friend.peerId] ? 'Çevrimiçi' : 'Çevrimdışı'}
                          </span>
                        </div>
                      </div>
                      <div className={styles.cardActions}>
                        <button className={`${styles.actionBtn} ${styles.primaryBtn}`} onClick={async () => {
                          if (onStartDm) {
                            try {
                              await onStartDm(friend.uid);
                            } catch (err) {
                              addToast({ type: 'error', message: 'Sohbet başlatılamadı: ' + err.message });
                            }
                          }
                        }}>
                          <MessageSquare size={16} /> Mesaj
                        </button>
                        <button className={`${styles.actionBtn} ${styles.dangerBtn}`} onClick={() => {
                          if (window.confirm('Bağlantıyı koparmak istediğine emin misin?')) {
                            removeFriend(identity.uid, friend.uid);
                          }
                        }} title="Bağlantıyı Kopar">
                          <UserX size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
