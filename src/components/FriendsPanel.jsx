import { useState, useEffect } from 'react';
import { Users, UserPlus, UserX, Check, X, LogIn } from 'lucide-react';
import { useIdentityStore, useSpaceStore } from '../stores';
import { subscribeToFriends, subscribeToFriendRequests, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, removeFriend, subscribeToServerInvites, acceptServerInvite, rejectServerInvite } from '../lib/firestore';
import styles from './FriendsPanel.module.css';

export function FriendsPanel({ onJoinSpace }) {
  const { identity } = useIdentityStore();
  const { spaces } = useSpaceStore();
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
      alert('Arkadaşlık isteği gönderildi!');
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = async (invite) => {
    try {
      await acceptServerInvite(identity.uid, invite.spaceId, invite.spaceCode, identity);
      if (onJoinSpace) onJoinSpace(invite.spaceCode, invite.spaceId);
    } catch (err) {
      alert('Sunucuya katılırken hata oluştu: ' + err.message);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2><Users size={20} className={styles.icon} /> Arkadaşlar</h2>
      </div>

      <div className={styles.content}>
        <div className={styles.addSection}>
          <h3>Arkadaş Ekle</h3>
          <form onSubmit={handleAddFriend} className={styles.addForm}>
            <input 
              type="text" 
              placeholder="Kullanıcı Adı" 
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
