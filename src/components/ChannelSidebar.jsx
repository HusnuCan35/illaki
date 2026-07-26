import { useState, useEffect } from 'react';
import { Settings, Plus, Hash, Users, LogOut, Copy, Check, MoreHorizontal, Edit2, Volume2, UserMinus, Link2 } from 'lucide-react';
import { useSpaceStore, useIdentityStore, usePeerStore, useUIStore } from '../stores';
import { subscribeToChannels, subscribeToMembers, createChannel, deleteChannel, updateChannel, updateSpaceSettings, deleteSpace, subscribeToFriends, inviteFriendToServer, getFriends } from '../lib/firestore';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { CreateChannelModal, ChannelSettingsModal } from './ChannelModals';
import { LogoutModal } from './LogoutModal';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
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

export function ChannelSidebar({ 
  activeSpaceId, 
  onOpenSettings, 
  voiceSlot, 
  onBroadcastUpdate, 
  onBroadcastDelete, 
  kickFromVoice,
  screenShare,
  onOpenStreamStage
}) {
  const { spaces, channels, activeChannelId, setActiveChannel, setChannels, removeSpace, setActiveSpace } = useSpaceStore();
  const { identity, clearIdentity } = useIdentityStore();
  const { setSettingsOpen, addToast } = useUIStore();
  const { peers, voiceChannelId } = usePeerStore();
  const [codeCopied, setCodeCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState('member');
  const [dbMembers, setDbMembers] = useState([]);
  
  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState(null);

  const handleChannelClick = (channelId) => {
    setActiveChannel(channelId);
    if (window.innerWidth <= 768) {
      useUIStore.getState().setSidebarOpen(false);
    }
  };

  const activeSpace = spaces.find(sp => sp.id === activeSpaceId);
  const spaceChannels = channels[activeSpaceId] || [];
  const myDbMember = dbMembers.find(m => m.uid === identity?.uid);
  const myPoints = myDbMember?.points || 0;

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
      setDbMembers(members);
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

  const hasActiveStream = screenShare?.remoteScreenStream || screenShare?.localScreenStream;
  const sharerName = screenShare?.remoteScreenStream ? (screenShare.remoteSharer || 'Biri') : (screenShare?.localScreenStream ? 'Sen' : null);

  const handleCreateChannelOpen = (type) => {
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
      useUIStore.getState().addToast({ type: 'error', message: err.message });
    }
  };

  const handleUpdateChannelSubmit = async ({ name, allowedRoles }) => {
    if (!editingChannel) return;
    try {
      await updateChannel(activeSpaceId, identity.uid, editingChannel.id, { name, allowedRoles });
    } catch (err) {
      useUIStore.getState().addToast({ type: 'error', message: err.message });
    }
  };

  const handleDeleteChannelSubmit = async () => {
    if (!editingChannel) return;
    try {
      await deleteChannel(activeSpaceId, identity.uid, editingChannel.id);
      if (activeChannelId === editingChannel.id) setActiveChannel('general');
      setSettingsModalOpen(false);
    } catch (err) {
      useUIStore.getState().addToast({ type: 'error', message: err.message });
    }
  };

  const copyPeerId = async () => {
    if (!usePeerStore.getState().peerId) return;
    const code = usePeerStore.getState().peerId.replace('illaki-', '');
    await navigator.clipboard.writeText(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  const handleLogout = () => {
    setLogoutModalOpen(true);
  };

  const handleConfirmLogout = async () => {
    setLogoutModalOpen(false);
    try {
      await signOut(auth);
      sessionStorage.clear();
    } catch (err) {
      clearIdentity();
      window.location.reload();
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
              <button onClick={async () => { 
                setMenuOpen(false);
                const addToast = useUIStore.getState().addToast;
                try {
                  const userFriends = await getFriends(identity.uid);
                  if (userFriends.length === 0) {
                    addToast({ type: 'error', message: 'Davet edebileceğin hiç arkadaşın yok.' });
                  } else {
                    setInviteModalOpen(true);
                  }
                } catch (err) {
                  addToast({ type: 'error', message: 'Arkadaş listesi alınamadı.' });
                }
              }}>Arkadaşlarını Davet Et</button>
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

      {/* Aktif Canlı Yayın Bannerı */}
      {hasActiveStream && (
        <div 
          onClick={onOpenStreamStage}
          style={{
            margin: '8px 12px 0',
            padding: '10px 12px',
            background: 'linear-gradient(135deg, rgba(255, 77, 77, 0.25), rgba(250, 166, 26, 0.2))',
            border: '1px solid rgba(255, 77, 77, 0.5)',
            borderRadius: '10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justify: 'space-between',
            boxShadow: '0 4px 12px rgba(255, 77, 77, 0.15)',
            transition: 'transform 0.2s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF4D4D', boxShadow: '0 0 8px #FF4D4D' }} />
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#FFF' }}>
              🔴 CANLI YAYIN: {sharerName}
            </span>
          </div>
          <span style={{ fontSize: '11px', fontWeight: '700', color: '#66FCF1', background: 'rgba(102, 252, 241, 0.15)', padding: '2px 8px', borderRadius: '6px' }}>
            İzle ➔
          </span>
        </div>
      )}

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
              const meInChannel = voiceChannelId === channel.id;

              // Kanaldaki tüm kullanıcıları topla (dbMembers + peers + kendimiz)
              const participantsMap = new Map();

              // 1. Kendimiz bu kanaldaysak ekle
              if (meInChannel && identity) {
                participantsMap.set(identity.uid, {
                  id: identity.uid,
                  uid: identity.uid,
                  username: `${identity.username} (Sen)`,
                  avatarColor: identity.avatarColor,
                  isSelf: true,
                  status: 'online',
                });
              }

              // Real-time Firestore üyelerini ekle (ses kanalında olan her üyeyi göster)
              (dbMembers || []).forEach(m => {
                const isMe = m.uid === identity?.uid;
                if (isMe) {
                  if (voiceChannelId !== channel.id) return;
                } else {
                  if (m.voiceChannelId !== channel.id || m.online === false) return;
                }

                const peerMatch = Object.values(peers).find(p => p.uid === m.uid || p.username === m.username);
                const rawName = m.username || peerMatch?.username || m.displayName;
                const isGeneric = !rawName || rawName === 'Katılımcı' || rawName === 'Anonim' || rawName === 'Kullanıcı' || rawName === 'Bağlanıyor...' || rawName === 'Üye';
                const finalName = isGeneric ? 'Kullanıcı' : rawName;
                
                if (!participantsMap.has(m.uid)) {
                  participantsMap.set(m.uid, {
                    id: m.peerId || m.uid,
                    uid: m.uid,
                    username: isMe ? `${identity?.username || finalName} (Sen)` : finalName,
                    avatarColor: m.avatarColor || peerMatch?.avatarColor || 'var(--accent)',
                    isSelf: isMe,
                    status: 'online',
                  });
                }
              });

              const participantsList = Array.from(participantsMap.values());

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
                  
                  {/* Katılımcılar (Discord gibi ses kanalının altında anlık liste) */}
                  {participantsList.length > 0 && (
                    <div className={styles.voiceParticipantsList}>
                      {participantsList.map((p) => (
                        <div key={p.id} className={styles.voiceParticipantRow}>
                          <Avatar username={p.username.replace(' (Sen)', '')} color={p.avatarColor} size={24} status={p.status || 'online'} />
                          <span className={styles.voiceParticipantName} style={{ flex: 1 }}>{p.username}</span>
                          {isPrivileged && kickFromVoice && !p.isSelf && (
                            <button 
                              className={styles.kickVoiceBtn}
                              onClick={() => kickFromVoice(p.id, activeSpaceId, p.uid || p.id)}
                              title="Kullanıcıyı sesten at"
                            >
                              <UserMinus size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Voice Connection Panel (Bottom) */}
      {voiceSlot}

      <div className={styles.userPanel}>
        <div className={styles.userInfo}>
          <Avatar username={identity?.username} color={identity?.avatarColor} size={32} status="online" />
          <div className={styles.userDetails}>
            <span className={styles.userName}>{identity?.username}</span>
            <span className={styles.userStatus} style={{ color: '#FAA61A', fontWeight: '600' }}>
              ⭐ {myPoints} Puan
            </span>
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

      <LogoutModal
        isOpen={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={handleConfirmLogout}
      />
    </div>
  );
}

function InviteFriendsModal({ isOpen, onClose, activeSpace, identity }) {
  const [friends, setFriends] = useState([]);
  const [invitedIds, setInvitedIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const { addToast } = useUIStore();

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
      addToast({ type: 'success', message: 'Davet başarıyla gönderildi.' });
    } catch (err) {
      addToast({ type: 'error', message: err.message });
    }
  };

  const copyCode = async () => {
    if (!activeSpace?.code) return;
    await navigator.clipboard.writeText(activeSpace.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    addToast({ type: 'success', message: 'Sunucu davet kodu kopyalandı!' });
  };

  const copyLink = async () => {
    if (!activeSpace?.code) return;
    const link = `${window.location.origin}/?join=${activeSpace.code}`;
    await navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    addToast({ type: 'success', message: 'Sunucu davet bağlantısı kopyalandı!' });
  };

  const filteredFriends = friends.filter(f => 
    f.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Arkadaşlarını Sunucuya Davet Et">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Sunucu Başlık Bannerı */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(255, 126, 32, 0.3)',
          borderRadius: '12px',
        }}>
          <div style={{
            fontSize: '24px',
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'rgba(255,126,32,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {activeSpace?.icon || '💬'}
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '15px', color: '#FFF', fontWeight: 700 }}>{activeSpace?.name || 'Sunucu'}</h4>
            <span style={{ fontSize: '12px', color: '#94A3B8' }}>{activeSpace?.description || 'Topluluğuna arkadaşlarını dahil et!'}</span>
          </div>
        </div>

        {/* Davet Kodu & Bağlantı Kutusu */}
        <div>
          <label style={{ fontSize: '11px', fontWeight: 700, color: '#CBD5E1', display: 'block', marginBottom: '6px', letterSpacing: '0.05em' }}>
            SUNUCU DAVET BAĞLANTISI & KODU
          </label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              background: '#090A0F',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              padding: '0 12px',
              color: '#FF7E20',
              fontFamily: 'monospace',
              fontSize: '14px',
              fontWeight: 700,
              letterSpacing: '1px'
            }}>
              {activeSpace?.code || 'KOD-YOK'}
            </div>
            <Button type="button" onClick={copyCode} style={{ padding: '8px 12px', fontSize: '12px' }}>
              {copiedCode ? <Check size={16} /> : <Copy size={16} />}
              {copiedCode ? 'Kopyalandı' : 'Kodu Kopyala'}
            </Button>
            <Button type="button" variant="secondary" onClick={copyLink} style={{ padding: '8px 12px', fontSize: '12px' }}>
              {copiedLink ? <Check size={16} /> : <Link2 size={16} />}
              {copiedLink ? 'Kopyalandı' : 'Bağlantı'}
            </Button>
          </div>
        </div>

        {/* Arkadaşlarım Arama & Listeleme */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#CBD5E1', letterSpacing: '0.05em' }}>
              DOĞRUDAN ARKADAŞLARINA GÖNDER ({friends.length})
            </label>
          </div>

          {friends.length > 5 && (
            <input
              type="text"
              placeholder="Arkadaş ara..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                background: '#090A0F',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#FFF',
                fontSize: '12px',
                marginBottom: '10px'
              }}
            />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
            {filteredFriends.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#94A3B8', fontSize: '12px' }}>
                {friends.length === 0 ? 'Henüz arkadaş listen boş. Davet kodunu kopyalayıp arkadaşına gönderebilirsin!' : 'Eşleşen arkadaş bulunamadı.'}
              </div>
            ) : (
              filteredFriends.map(friend => {
                const isInvited = invitedIds.includes(friend.uid);
                return (
                  <div
                    key={friend.uid}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '50%',
                        background: friend.avatarColor || '#3B82F6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FFF',
                        fontSize: '14px',
                        fontWeight: 700
                      }}>
                        {friend.username?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span style={{ fontWeight: 600, color: '#FFF', fontSize: '13px', display: 'block' }}>{friend.username}</span>
                        <span style={{ fontSize: '11px', color: '#10B981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
                          Çevrimiçi
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => !isInvited && handleInvite(friend.uid)}
                      disabled={isInvited}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: isInvited ? 'default' : 'pointer',
                        background: isInvited ? 'rgba(255, 255, 255, 0.08)' : 'var(--accent, #FF7E20)',
                        color: isInvited ? '#94A3B8' : '#FFF',
                        transition: 'all 0.2s'
                      }}
                    >
                      {isInvited ? '✓ Davet Edildi' : 'Davet Et'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
