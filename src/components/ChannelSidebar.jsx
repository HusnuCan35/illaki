import { useState, useEffect } from 'react';
import { Settings, Plus, Hash, Users, LogOut, Copy, Check, MoreHorizontal } from 'lucide-react';
import { useSpaceStore, useIdentityStore, usePeerStore, useUIStore } from '../stores';
import { subscribeToChannels, createChannel, deleteChannel, updateSpaceSettings, deleteSpace } from '../lib/firestore';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
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

export function ChannelSidebar({ activeSpaceId, onOpenSettings, voiceSlot, onBroadcastUpdate, onBroadcastDelete }) {
  const { spaces, channels, activeChannelId, setActiveChannel, setChannels, removeSpace, setActiveSpace } = useSpaceStore();
  const { identity, clearIdentity } = useIdentityStore();
  const { setSettingsOpen } = useUIStore();
  const { peerId } = usePeerStore();
  const [codeCopied, setCodeCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const activeSpace = spaces.find(sp => sp.id === activeSpaceId);
  const spaceChannels = channels[activeSpaceId] || [];

  // Geçmişe yönelik uyumluluk: Eğer odada hiç kanal yoksa sanal bir kanal göster
  const displayChannels = spaceChannels.length > 0 
    ? spaceChannels 
    : [{ id: 'general', name: 'genel', type: 'text' }];

  useEffect(() => {
    if (!activeSpaceId) return;
    const unsub = subscribeToChannels(activeSpaceId, (data) => {
      setChannels(activeSpaceId, data);
    });
    return () => unsub();
  }, [activeSpaceId]);

  if (!activeSpace) return null;

  const handleCreateChannel = async () => {
    const name = window.prompt('Yeni kanal adı:');
    if (!name || !name.trim()) return;
    try {
      await createChannel(activeSpaceId, identity.uid, { name: name.trim() });
    } catch (err) {
      alert(err.message);
    }
  };

  const copyPeerId = async () => {
    if (!peerId) return;
    const code = peerId.replace('illaki-', '');
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

  const isHost = activeSpace.hostUid === identity?.uid;

  return (
    <div className={styles.container}>
      <header className={styles.header} onClick={() => isHost && setMenuOpen(!menuOpen)}>
        <h2 className={styles.serverName}>{activeSpace.name}</h2>
        {isHost && <MoreHorizontal size={18} />}
        {menuOpen && (
          <>
            <div style={{position:'fixed', inset:0, zIndex:90}} onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
            <div className={styles.dropdownMenu}>
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
            </div>
          </>
        )}
      </header>

      <div className={styles.content}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>METİN KANALLARI</span>
            {isHost && (
              <button className={styles.addBtn} onClick={handleCreateChannel}>
                <Plus size={16} />
              </button>
            )}
          </div>
          <div className={styles.channelList}>
            {displayChannels.filter(c => c.type === 'text').map(channel => (
              <button
                key={channel.id}
                className={`${styles.channelItem} ${activeChannelId === channel.id ? styles.active : ''}`}
                onClick={() => setActiveChannel(channel.id)}
              >
                <Hash size={18} className={styles.channelIcon} />
                <span className={styles.channelName}>{channel.name}</span>
                {isHost && channel.id !== 'general' && (
                  <button
                    className={styles.deleteChannelBtn}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (window.confirm(`"${channel.name}" kanalını silmek istediğinize emin misiniz?`)) {
                        try {
                          await deleteChannel(activeSpaceId, identity.uid, channel.id);
                          if (activeChannelId === channel.id) setActiveChannel('general');
                        } catch (err) {
                          alert(err.message);
                        }
                      }
                    }}
                  >
                    ×
                  </button>
                )}
              </button>
            ))}
          </div>
        </div>

        {voiceSlot && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>SES KANALLARI</span>
            </div>
            {voiceSlot}
          </div>
        )}
      </div>

      {/* Peer ID section */}
      {peerId && (
        <div className={styles.peerIdSection}>
          <div className={styles.peerLabel}>Oda Kodu</div>
          <button className={styles.peerBox} onClick={copyPeerId}>
            <span>{peerId.replace('illaki-', '')}</span>
            {codeCopied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      )}

      {/* User panel */}
      <div className={styles.userPanel}>
        <div className={styles.userInfo}>
          <Avatar username={identity?.username} color={identity?.avatarColor} size={32} status="online" />
          <div className={styles.userDetails}>
            <span className={styles.userName}>{identity?.username}</span>
            <span className={styles.userStatus}>Çevrimiçi</span>
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
    </div>
  );
}
