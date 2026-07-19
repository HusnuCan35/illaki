import { useState, useEffect } from 'react';
import { Users, UserPlus, UserX, Check, X, LogIn } from 'lucide-react';
import { useIdentityStore, useSpaceStore, useUIStore } from '../stores';
import { subscribeToFriends, subscribeToFriendRequests, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, removeFriend, subscribeToServerInvites, acceptServerInvite, rejectServerInvite } from '../lib/firestore';
import styles from './FriendsPanel.module.css';

export function FriendsPanel({ onJoinSpace }) {
  const { identity } = useIdentityStore();
  const { spaces } = useSpaceStore();
  const { addToast } = useUIStore();
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [invites, setInvites] = useState([]);
  const [addInput, setAddInput] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2><Users size={20} className={styles.icon} /> Arkadaşlar</h2>
      </div>

      <div className={styles.content}>
        <div className={styles.myIdSection} style={{ marginBottom: '16px', background: '#252932', padding: '12px', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '13px', color: '#8b929a', marginBottom: '8px', textTransform: 'uppercase' }}>Senin Kullanıcı ID'n</h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <code style={{ flex: 1, background: '#1c1f26', padding: '8px', borderRadius: '4px', fontSize: '14px', wordBreak: 'break-all' }}>
              {identity?.uid}
            </code>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(identity?.uid);
                addToast({ type: 'info', message: 'ID Kopyalandı!' });
              }}
              style={{ padding: '8px 12px', background: '#45A29E', color: '#1c1f26', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Kopyala
            </button>
          </div>
        </div>

        <div className={styles.addSection}>
          <h3>Arkadaş Ekle</h3>
          <form onSubmit={handleAddFriend} className={styles.addForm}>
            <input 
              type="text" 
              placeholder="Kullanıcı ID (örn: abc123xyz...)" 
              value={addInput}
              onChange={e => setAddInput(e.target.value)}
              disabled={loading}
              className={styles.input}
            />
            <button type="submit" disabled={loading || !addInput.trim()} className={styles.addBtn}>
              <UserPlus size={16} /> Ekle
            </button>
          </form>
        </div>

        {invites.length > 0 && (
          <div className={styles.requestsSection}>
            <h3>Sunucu Davetleri ({invites.length})</h3>
            <div className={styles.list}>
              {invites.map(invite => (
                <div key={invite.id} className={styles.listItem}>
                  <div className={styles.userInfo}>
                    <div className={styles.avatar} style={{ backgroundColor: '#45A29E' }}>
                      {invite.spaceName.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '14px' }}>{invite.spaceName}</span>
                      <span style={{ fontSize: '11px', color: '#8b929a' }}>{invite.senderUsername} davet etti</span>
                    </div>
                  </div>
                  <div className={styles.actions}>
                    <button className={styles.acceptBtn} onClick={() => handleAcceptInvite(invite)} title="Katıl">
                      <Check size={16} />
                    </button>
                    <button className={styles.rejectBtn} onClick={() => rejectServerInvite(identity.uid, invite.spaceId)} title="Reddet">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {requests.length > 0 && (
          <div className={styles.requestsSection}>
            <h3>Gelen İstekler ({requests.length})</h3>
            <div className={styles.list}>
              {requests.map(req => (
                <div key={req.id} className={styles.listItem}>
                  <div className={styles.userInfo}>
                    <div className={styles.avatar} style={{ backgroundColor: req.senderAvatarColor }}>
                      {req.senderUsername.charAt(0).toUpperCase()}
                    </div>
                    <span>{req.senderUsername}</span>
                  </div>
                  <div className={styles.actions}>
                    <button className={styles.acceptBtn} onClick={() => acceptFriendRequest(identity.uid, req.senderUid)} title="Kabul Et">
                      <Check size={16} />
                    </button>
                    <button className={styles.rejectBtn} onClick={() => rejectFriendRequest(identity.uid, req.senderUid)} title="Reddet">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={styles.friendsSection}>
          <h3>Arkadaşların ({friends.length})</h3>
          <div className={styles.list}>
            {friends.length > 0 ? friends.map(friend => (
              <div key={friend.uid} className={styles.listItem}>
                <div className={styles.userInfo}>
                  <div className={styles.avatar} style={{ backgroundColor: friend.avatarColor || '#333' }}>
                    {friend.username?.charAt(0).toUpperCase()}
                  </div>
                  <span>{friend.username}</span>
                </div>
                <div className={styles.actions}>
                  <button className={styles.rejectBtn} onClick={() => {
                    if (window.confirm('Arkadaşlıktan çıkarmak istediğine emin misin?')) {
                      removeFriend(identity.uid, friend.uid);
                    }
                  }} title="Çıkar">
                    <UserX size={16} />
                  </button>
                </div>
              </div>
            )) : (
              <div className={styles.empty}>Henüz arkadaşın yok.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
