import { useState, useEffect } from 'react';
import { Users, UserPlus, UserX, Check, X, LogIn, MessageSquare, Clock, Globe } from 'lucide-react';
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
      addToast({ type: 'success', message: 'Arkadaşlık isteği gönderildi!' });
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
      addToast({ type: 'success', message: 'Sunucuya katıldın!' });
    } catch (err) {
      addToast({ type: 'error', message: 'Sunucuya katılırken hata oluştu: ' + err.message });
    }
  };

  // derived states
  const onlineFriends = friends.filter(f => peers[f.peerId]);
  const pendingCount = requests.length + invites.length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2><Users size={20} style={{ color: '#8b929a' }} /> Arkadaşlar</h2>
        
        <div className={styles.tabs}>
          <button 
            className={`${styles.tabBtn} ${activeTab === 'online' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('online')}
          >
            Çevrimiçi
          </button>
          <button 
            className={`${styles.tabBtn} ${activeTab === 'all' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('all')}
          >
            Tümü
          </button>
          <button 
            className={`${styles.tabBtn} ${activeTab === 'pending' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            Bekleyenler 
            {pendingCount > 0 && <span className={styles.badge}>{pendingCount}</span>}
          </button>
          <button 
            className={`${styles.tabBtn} ${styles.addTabBtn}`}
            onClick={() => setActiveTab('add')}
          >
            Arkadaş Ekle
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {activeTab === 'add' && (
          <div className={styles.addSection}>
            <h3>Arkadaş Ekle</h3>
            <p>Arkadaşlarını ID'leri ile ekleyebilirsin.</p>
            <form onSubmit={handleAddFriend} className={styles.addForm}>
              <input 
                type="text" 
                placeholder="Arkadaşının ID'sini buraya yapıştır..." 
                value={addInput}
                onChange={e => setAddInput(e.target.value)}
                disabled={loading}
                className={styles.input}
              />
              <button type="submit" disabled={loading || !addInput.trim()} className={styles.addBtn}>
                Arkadaşlık İsteği Gönder
              </button>
            </form>

            <div className={styles.myIdSection} style={{ marginTop: '40px' }}>
              <h3 style={{ fontSize: '13px', color: '#8b929a', marginBottom: '8px', textTransform: 'uppercase' }}>Senin Kullanıcı ID'n</h3>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <code style={{ flex: 1, background: '#1c1f26', padding: '12px', borderRadius: '8px', fontSize: '14px', wordBreak: 'break-all' }}>
                  {identity?.customId || identity?.uid}
                </code>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(identity?.customId || identity?.uid);
                    addToast({ type: 'info', message: 'ID Kopyalandı!' });
                  }}
                  className={styles.addBtn}
                  style={{ background: '#374151' }}
                >
                  Kopyala
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'pending' && (
          <div className={styles.listSection}>
            {requests.length === 0 && invites.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <Check size={48} />
                </div>
                <h3>Bekleyen İstek Yok</h3>
                <p>Şu an için bekleyen bir arkadaşlık veya sunucu davetin bulunmuyor.</p>
              </div>
            ) : (
              <>
                {invites.length > 0 && (
                  <div style={{ marginBottom: '32px' }}>
                    <div className={styles.listTitle}>Sunucu Davetleri — {invites.length}</div>
                    <div className={styles.list}>
                      {invites.map(invite => (
                        <div key={invite.id} className={styles.listItem}>
                          <div className={styles.userInfo}>
                            <div className={styles.avatar} style={{ backgroundColor: '#45A29E' }}>
                              {invite.spaceName.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span className={styles.username}>{invite.spaceName}</span>
                              <span className={styles.status}>{invite.senderUsername} davet etti</span>
                            </div>
                          </div>
                          <div className={styles.actions}>
                            <button className={`${styles.iconBtn} ${styles.acceptBtn}`} onClick={() => handleAcceptInvite(invite)} title="Katıl">
                              <Check size={18} />
                            </button>
                            <button className={`${styles.iconBtn} ${styles.rejectBtn}`} onClick={() => rejectServerInvite(identity.uid, invite.spaceId)} title="Reddet">
                              <X size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {requests.length > 0 && (
                  <div>
                    <div className={styles.listTitle}>Arkadaşlık İstekleri — {requests.length}</div>
                    <div className={styles.list}>
                      {requests.map(req => (
                        <div key={req.id} className={styles.listItem}>
                          <div className={styles.userInfo}>
                            <div className={styles.avatar} style={{ backgroundColor: req.senderAvatarColor || '#45A29E' }}>
                              {req.senderUsername.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span className={styles.username}>{req.senderUsername}</span>
                              <span className={styles.status}>Gelen İstek</span>
                            </div>
                          </div>
                          <div className={styles.actions}>
                            <button className={`${styles.iconBtn} ${styles.acceptBtn}`} onClick={() => acceptFriendRequest(identity.uid, req.senderUid)} title="Kabul Et">
                              <Check size={18} />
                            </button>
                            <button className={`${styles.iconBtn} ${styles.rejectBtn}`} onClick={() => rejectFriendRequest(identity.uid, req.senderUid)} title="Reddet">
                              <X size={18} />
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
                <div className={styles.emptyIcon}>
                  <Globe size={48} />
                </div>
                <h3>Hiç Arkadaşın Yok</h3>
                <p>Wumpus burada çok yalnız. Arkadaş Ekle sekmesinden birilerini ekleyebilirsin.</p>
                <button 
                  onClick={() => setActiveTab('add')}
                  className={styles.addBtn}
                  style={{ marginTop: '20px' }}
                >
                  Arkadaş Ekle
                </button>
              </div>
            ) : (activeTab === 'online' && onlineFriends.length === 0) ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <Clock size={48} />
                </div>
                <h3>Kimse Çevrimiçi Değil</h3>
                <p>Şu an aktif olan bir arkadaşın yok. Tümü sekmesinden arkadaşlarına mesaj atabilirsin.</p>
              </div>
            ) : (
              <>
                <div className={styles.listTitle}>
                  {activeTab === 'online' ? `Çevrimiçi — ${onlineFriends.length}` : `Tüm Arkadaşlar — ${friends.length}`}
                </div>
                <div className={styles.list}>
                  {(activeTab === 'online' ? onlineFriends : friends).map(friend => (
                    <div key={friend.uid} className={styles.listItem}>
                      <div className={styles.userInfo}>
                        <div style={{ position: 'relative' }}>
                          <div className={styles.avatar} style={{ backgroundColor: friend.avatarColor || '#333' }}>
                            {friend.username?.charAt(0).toUpperCase()}
                          </div>
                          <div style={{
                            position: 'absolute',
                            bottom: 0,
                            right: 0,
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: peers[friend.peerId] ? '#10B981' : '#6B7280',
                            border: '2px solid var(--surface)'
                          }}></div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span className={styles.username}>{friend.username}</span>
                          <span className={styles.status}>
                            {peers[friend.peerId] ? 'Çevrimiçi' : 'Çevrimdışı'}
                          </span>
                        </div>
                      </div>
                      <div className={styles.actions}>
                        <button className={`${styles.iconBtn} ${styles.msgBtn}`} onClick={async () => {
                          if (onStartDm) {
                            try {
                              await onStartDm(friend.uid);
                            } catch (err) {
                              addToast({ type: 'error', message: 'Sohbet başlatılamadı: ' + err.message });
                            }
                          }
                        }} title="Mesaj Gönder">
                          <MessageSquare size={18} />
                        </button>
                        <button className={`${styles.iconBtn} ${styles.rejectBtn}`} onClick={() => {
                          if (window.confirm('Arkadaşlıktan çıkarmak istediğine emin misin?')) {
                            removeFriend(identity.uid, friend.uid);
                          }
                        }} title="Çıkar">
                          <UserX size={18} />
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
