import { useState, useEffect } from 'react';
import { Settings, Plus, Hash, Users, LogOut, Copy, Check, MoreHorizontal, Edit2, Volume2, UserMinus } from 'lucide-react';
import { useSpaceStore, useIdentityStore, usePeerStore, useUIStore } from '../stores';
import { subscribeToChannels, subscribeToMembers, createChannel, deleteChannel, updateChannel, updateSpaceSettings, deleteSpace, subscribeToFriends, inviteFriendToServer } from '../lib/firestore';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { CreateChannelModal, ChannelSettingsModal } from './ChannelModals';
import styles from './ChannelSidebar.module.css';

// Avatar Component
function Avatar({ username, color, size = 36, status }) {
  const initials = username ? username.slice(0, 2).toUpperCase() : '??';
  return (
    <div
      className={styles.avatar}
      style={{ width: size, height: size, background: color || 'var(--accent)', fontSize: size * 0.38 }}
    >
      {initials}
      {status && <span className={`${styles.statusDot} ${styles[status]}`} />}
    </div>
  );
}

export function ChannelSidebar({ activeSpaceId, onOpenSettings, voiceSlot, onBroadcastUpdate, onBroadcastDelete, kickFromVoice }) {
  const { spaces, channels, activeChannelId, setActiveChannel, setChannels, removeSpace, setActiveSpace } = useSpaceStore();
  const { identity, clearIdentity } = useIdentityStore();
  const { setSettingsOpen } = useUIStore();
  const { peers, voiceChannelId } = usePeerStore();
  const [codeCopied, setCodeCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState('member');
  
  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);

  const handleChannelClick = (channelId) => {
    setActiveChannel(channelId);
    if (window.innerWidth <= 768) {
      useUIStore.getState().toggleSidebar();
    }
  };

  const activeSpace = spaces.find(sp => sp.id === activeSpaceId);
  const spaceChannels = channels[activeSpaceId] || [];

  // Geçmişe yönelik uyumluluk
  const hasText = spaceChannels.some(c => c.type === 'text');
  const hasVoice = spaceChannels.some(c => c.type === 'voice');
  const displayChannels = [...spaceChannels];
  if (!hasText) displayChannels.push({ id: 'general', name: 'genel', type: 'text' });
  if (!hasVoice) displayChannels.push({ id: 'general-voice', name: 'Ses Kanalı', type: 'voice' });

  useEffect(() => {
    if (!activeSpaceId) return;
    const unsubChannels = subscribeToChannels(activeSpaceId, (data) => {
      setChannels(activeSpaceId, data);
    });
    const unsubMembers = subscribeToMembers(activeSpaceId, (members) => {
      const me = members.find(m => m.uid === identity?.uid);
      if (me) setCurrentUserRole(me.role || 'member');
    });
    return () => {
      unsubChannels();
      unsubMembers();
    };
  }, [activeSpaceId, identity?.uid]);

  useEffect(() => {
    if (activeSpaceId && spaces.length > 0 && !spaces.some(s => s.id === activeSpaceId)) {
      setActiveSpace(spaces[0]?.id || null);
    }
  }, [activeSpaceId, spaces, setActiveSpace]);

  if (!activeSpace) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <h2 className={styles.serverName}>Yükleniyor...</h2>
        </header>
      </div>
    );
  }

  const isHost = activeSpace.hostUid === identity?.uid;
  const isPrivileged = isHost || currentUserRole === 'admin' || currentUserRole === 'mod';

  // Filter channels based on roles
  const canViewChannel = (c) => {
    if (!c.allowedRoles || c.allowedRoles.includes('all')) return true;
    return isPrivileged;
  };

  const visibleChannels = displayChannels.filter(canViewChannel);

  const handleCreateChannelOpen = (type) => {
    // Sadece host/yetkililer açabilir, role kontrolü eklenecek
    setCreateModalOpen(true);
  };

  const handleEditChannelOpen = (e, channel) => {
    e.stopPropagation();
    setEditingChannel(channel);
    setSettingsModalOpen(true);
  };

  const handleCreateChannelSubmit = async ({ name, type, allowedRoles }) => {
    try {
      await createChannel(activeSpaceId, identity.uid, { name, type, allowedRoles });
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpdateChannelSubmit = async ({ name, allowedRoles }) => {
    if (!editingChannel) return;
    try {
      await updateChannel(activeSpaceId, identity.uid, editingChannel.id, { name, allowedRoles });
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteChannelSubmit = async () => {
    if (!editingChannel) return;
    try {
      await deleteChannel(activeSpaceId, identity.uid, editingChannel.id);
      if (activeChannelId === editingChannel.id) setActiveChannel('general');
      setSettingsModalOpen(false);
    } catch (err) {
      alert(err.message);
    }
  };

  const copyPeerId = async () => {
    if (!usePeerStore.getState().peerId) return;
    const code = usePeerStore.getState().peerId.replace('illaki-', '');
    await navigator.clipboard.writeText(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleLogout = async () => {
    if (window.confirm('Çıkış yapmak istediğine emin misin?')) {
      try {
        await signOut(auth);
        sessionStorage.clear();
      } catch (err) {
        clearIdentity();
        window.location.reload();
      }
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header} onClick={() => setMenuOpen(!menuOpen)}>
        <h2 className={styles.serverName}>{activeSpace.name}</h2>
        <MoreHorizontal size={18} />
        {menuOpen && (
          <>
            <div style={{position:'fixed', inset:0, zIndex:90}} onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
            <div className={styles.dropdownMenu}>
              <button onClick={() => { setMenuOpen(false); setInviteModalOpen(true); }}>Arkadaşlarını Davet Et</button>
              {isHost && (
                <>
                  <div className={styles.divider} />
                  <button onClick={() => { setMenuOpen(false); onOpenSettings(); }}>Sunucu Ayarları</button>
                  <button onClick={async () => {
                    setMenuOpen(false);
                    const newName = window.prompt('Oda adını düzenle:', activeSpace.name);
                    if (newName && newName.trim()) {
                      await updateSpaceSettings(activeSpaceId, identity.uid, { name: newName.trim() });
                      if (onBroadcastUpdate) onBroadcastUpdate(activeSpaceId, newName.trim());
                    }
                  }}>İsmi Değiştir</button>
                  <div className={styles.divider} />
                  <button className={styles.danger} onClick={async () => {
                    setMenuOpen(false);
                    if (window.confirm(`"${activeSpace.name}" sunucusunu silmek istediğine emin misin?`)) {
                      await deleteSpace(activeSpaceId, identity.uid);
                      removeSpace(activeSpaceId);
                      setActiveSpace(null);
                      if (onBroadcastDelete) onBroadcastDelete(activeSpaceId);
                    }
                  }}>Sunucuyu Sil</button>
                </>
              )}
            </div>
          </>
        )}
      </header>

      <div className={styles.content}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>METİN KANALLARI</span>
            {isPrivileged && (
              <button className={styles.addBtn} onClick={() => handleCreateChannelOpen('text')}>
                <Plus size={16} />
              </button>
            )}
          </div>
          <div className={styles.channelList}>
            {visibleChannels.filter(c => c.type === 'text').map(channel => (
              <div key={channel.id} className={`${styles.channelItemWrapper} ${activeChannelId === channel.id ? styles.active : ''}`}>
                <button
                  className={styles.channelItem}
                  onClick={() => handleChannelClick(channel.id)}
                >
                  <Hash size={18} className={styles.channelIcon} />
                  <span className={styles.channelName}>{channel.name}</span>
                </button>
                {isPrivileged && (
                  <div className={styles.channelActions}>
                    <button className={styles.actionIconBtn} onClick={(e) => handleEditChannelOpen(e, channel)} title="Düzenle">
                      <Settings size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>SES KANALLARI</span>
            {isPrivileged && (
              <button className={styles.addBtn} onClick={() => handleCreateChannelOpen('voice')}>
                <Plus size={16} />
              </button>
            )}
          </div>
          <div className={styles.channelList}>
            {visibleChannels.filter(c => c.type === 'voice').map(channel => {
              // Bu odadaki kullanıcılar (kendimiz + peers + dbMembers)
              const meInChannel = voiceChannelId === channel.id;
              const othersInChannel = Object.entries(peers)
                .filter(([_, p]) => p.voiceChannelId === channel.id)
                .map(([id, p]) => ({ id, ...p }));

              // Firestore'daki üyeleri de dahil et (anlık senkronizasyon için)
              (dbMembers || []).forEach(m => {
                if (m.uid !== identity?.uid && m.voiceChannelId === channel.id) {
                  if (!othersInChannel.some(p => p.id === m.peerId || p.username === m.username || p.uid === m.uid)) {
                    othersInChannel.push({
                      id: m.peerId || m.uid,
                      uid: m.uid,
                      username: m.username,
                      avatarColor: m.avatarColor,
                      status: m.online ? 'online' : 'offline',
                    });
                  }
                }
              });
              
              return (
                <div key={channel.id}>
                  <div className={`${styles.channelItemWrapper} ${meInChannel ? styles.activeVoice : ''}`}>
                    <button
                      className={styles.channelItem}
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('illaki:join-voice', { detail: { channelId: channel.id } }));
                      }}
                    >
                      <Volume2 size={18} className={styles.channelIcon} />
                      <span className={styles.channelName}>{channel.name}</span>
                    </button>
                    {isPrivileged && (
                      <div className={styles.channelActions}>
                        <button className={styles.actionIconBtn} onClick={(e) => handleEditChannelOpen(e, channel)} title="Ayarlar">
                          <Settings size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* Katılımcılar (Discord gibi kanalın altında liste) */}
                  {(meInChannel || othersInChannel.length > 0) && (
                    <div className={styles.voiceParticipantsList}>
                      {meInChannel && (
                        <div className={styles.voiceParticipantRow}>
                          <Avatar username={identity.username} color={identity.avatarColor} size={24} status="online" />
                          <span className={styles.voiceParticipantName}>{identity.username} (Sen)</span>
                        </div>
                      )}
                      {othersInChannel.map((p) => {
                        const nameToShow = (p.username && p.username !== 'Katılımcı' && p.username !== 'Anonim') ? p.username : 'Üye';
                        return (
                          <div key={p.id} className={styles.voiceParticipantRow}>
                            <Avatar username={nameToShow} color={p.avatarColor} size={24} status={p.status || 'online'} />
                            <span className={styles.voiceParticipantName} style={{ flex: 1 }}>{nameToShow}</span>
                            {isPrivileged && kickFromVoice && (
                              <button 
                                className={styles.kickVoiceBtn}
                                onClick={() => kickFromVoice(p.id, activeSpaceId, p.uid || p.id)}
                                title="Kullanıcıyı sesten at"
                              >
                                <UserMinus size={14} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Oda kodu (peer ID) kaldırıldı */}
      {/* Voice Connection Panel (Bottom) */}
      {voiceSlot}

      <div className={styles.userPanel}>
        <div className={styles.userInfo}>
          <Avatar username={identity?.username} color={identity?.avatarColor} size={32} status="online" />
          <div className={styles.userDetails}>
            <span className={styles.userName}>{identity?.username}</span>
            <span className={styles.userStatus}>Çevrimiçi • v1.0.9</span>
          </div>
        </div>
        <div className={styles.userActions}>
          <button className={styles.actionBtn} onClick={() => setSettingsOpen(true)}>
            <Settings size={16} />
          </button>
          <button className={styles.actionBtn} onClick={handleLogout}>
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <CreateChannelModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreateChannelSubmit}
      />

      <ChannelSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        channel={editingChannel}
        onUpdate={handleUpdateChannelSubmit}
        onDelete={handleDeleteChannelSubmit}
      />

      <InviteFriendsModal 
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        activeSpace={activeSpace}
        identity={identity}
      />
    </div>
  );
}

function InviteFriendsModal({ isOpen, onClose, activeSpace, identity }) {
  const [friends, setFriends] = useState([]);
  const [invitedIds, setInvitedIds] = useState([]);
  
  useEffect(() => {
    if (!isOpen || !identity?.uid) return;
    const unsub = subscribeToFriends(identity.uid, setFriends);
    return () => unsub();
  }, [isOpen, identity?.uid]);

  const handleInvite = async (friendUid) => {
    try {
      await inviteFriendToServer(
        friendUid, 
        activeSpace.id, 
        activeSpace.name, 
        identity.username, 
        activeSpace.code
      );
      setInvitedIds(prev => [...prev, friendUid]);
    } catch (err) {
      alert(err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modalContent} style={{ width: '400px' }}>
        <h3>Arkadaşlarını Davet Et</h3>
        <p style={{ color: '#8b929a', fontSize: '14px', marginBottom: '16px' }}>
          <b>{activeSpace.name}</b> sunucusuna katılmaları için arkadaşlarına davet gönder.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
          {friends.length > 0 ? friends.map(friend => {
            const isInvited = invitedIds.includes(friend.uid);
            return (
              <div key={friend.uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0B0C10', padding: '12px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: friend.avatarColor || '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px', fontWeight: 'bold' }}>
                    {friend.username?.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ color: '#fff' }}>{friend.username}</span>
                </div>
                <button 
                  style={{ background: isInvited ? '#2a2a2d' : '#66FCF1', color: isInvited ? '#8b929a' : '#0B0C10', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 'bold', cursor: isInvited ? 'default' : 'pointer' }}
                  onClick={() => !isInvited && handleInvite(friend.uid)}
                  disabled={isInvited}
                >
                  {isInvited ? 'Davet Edildi' : 'Davet Et'}
                </button>
              </div>
            );
          }) : (
            <div style={{ color: '#8b929a', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
              Davet edebileceğin hiç arkadaşın yok.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
