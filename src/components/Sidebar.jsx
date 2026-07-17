import { useState, useRef, useCallback } from 'react';
import {
  Plus, LogIn, Settings, Hash, Users, Copy, Check,
  Wifi, WifiOff, ChevronDown, X, Search, MoreHorizontal,
  Mic, MicOff, Headphones, HeadphonesIcon, LogOut,
} from 'lucide-react';
import { useIdentityStore, useSpaceStore, useUIStore, usePeerStore } from '../stores';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import styles from './Sidebar.module.css';


// Avatar Component
function Avatar({ username, color, size = 36, status }) {
  const initials = username
    ? username.slice(0, 2).toUpperCase()
    : '??';
  return (
    <div
      className={styles.avatar}
      style={{ width: size, height: size, background: color || 'var(--accent)', fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials}
      {status && (
        <span
          className={`${styles.statusDot} ${styles[status]}`}
          aria-label={status}
        />
      )}
    </div>
  );
}

// Space item in sidebar
function SpaceItem({ space, isActive, onClick, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const initial = space.name?.charAt(0).toUpperCase() || '#';
  
  return (
    <div style={{ position: 'relative' }}>
      <button
        className={`${styles.spaceItem} ${isActive ? styles.spaceActive : ''}`}
        onClick={onClick}
        title={space.name}
        aria-current={isActive ? 'page' : undefined}
        id={`space-${space.id}`}
      >
        <div className={styles.spaceIcon}>
          {initial}
          {space.unread > 0 && (
            <span className={styles.unreadBadge} aria-label={`${space.unread} okunmamış`}>
              {space.unread > 9 ? '9+' : space.unread}
            </span>
          )}
        </div>
        <div className={styles.spaceInfo}>
          <span className={styles.spaceName}>{space.name}</span>
          <span className={styles.spaceCode}>{space.code}</span>
        </div>
        
        {space.isHost && (
          <button 
            className={styles.spaceOptionsBtn} 
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            title="Ayarlar"
          >
            <MoreHorizontal size={16} />
          </button>
        )}

        {isActive && <div className={styles.activeIndicator} aria-hidden="true" />}
      </button>
      
      {menuOpen && (
        <>
          <div style={{position:'fixed', inset:0, zIndex:90}} onClick={() => setMenuOpen(false)} />
          <div className={styles.spaceOptionsMenu}>
            <button className={styles.spaceOption} onClick={() => { setMenuOpen(false); onEdit(); }}>Düzenle</button>
            <button className={`${styles.spaceOption} ${styles.danger}`} onClick={() => { setMenuOpen(false); onDelete(); }}>Sil</button>
          </div>
        </>
      )}
    </div>
  );
}

export function Sidebar({ onCreateSpace, onJoinSpace, onBroadcastUpdate, onBroadcastDelete, voiceSlot }) {
  const { identity, clearIdentity } = useIdentityStore();
  const { spaces, activeSpaceId, setActiveSpace, clearUnread, updateSpace, removeSpace } = useSpaceStore();
  const { setSettingsOpen } = useUIStore();
  const { connectionStatus, peerId } = usePeerStore();
  const [micMuted, setMicMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const activeSpace = spaces.find(sp => sp.id === activeSpaceId);

  const handleLogout = async () => {
    if (window.confirm('Çıkış yapmak istediğine emin misin? Odalardaki bağlantın kopacak.')) {
      try {
        await signOut(auth);
        sessionStorage.clear();
      } catch (err) {
        console.error('Çıkış hatası:', err);
        clearIdentity();
        window.location.reload();
      }
    }
  };

  const copyPeerId = async () => {
    if (!peerId) return;
    // Sadece oda kodunu kopyala ("illaki-" prefix'i olmadan)
    const code = peerId.replace('illaki-', '');
    await navigator.clipboard.writeText(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleSpaceClick = (spaceId) => {
    setActiveSpace(spaceId);
    clearUnread(spaceId);
  };

  return (
    <nav className={styles.sidebar} aria-label="Spaces listesi">
      {/* Top brand bar */}
      <div className={styles.brand}>
        <div className={styles.brandLogo} aria-hidden="true">
          <Hash size={18} strokeWidth={2.5} />
        </div>
        <span className={styles.brandName}>illaki</span>
        <div className={`${styles.connBadge} ${styles[connectionStatus]}`} title={connectionStatus}>
          {connectionStatus === 'connected' ? <Wifi size={12} /> : <WifiOff size={12} />}
        </div>
      </div>

      {/* Spaces header */}
      <div className={styles.sectionHeader}>
        <span>SPACES</span>
        <div className={styles.sectionActions}>
          <button
            className={styles.iconBtn}
            onClick={onJoinSpace}
            title="Space'e Katıl"
            aria-label="Space'e katıl"
            id="join-space-btn"
          >
            <LogIn size={14} />
          </button>
          <button
            className={styles.iconBtn}
            onClick={onCreateSpace}
            title="Space Oluştur"
            aria-label="Yeni space oluştur"
            id="create-space-btn"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Spaces list */}
      <div className={styles.spacesList} role="list">
        {spaces.length === 0 ? (
          <div className={styles.emptyState}>
            <Hash size={28} />
            <p>Henüz bir space yok</p>
            <p>Oluştur veya katıl</p>
          </div>
        ) : (
          spaces.map((space) => (
            <SpaceItem
              key={space.id}
              space={space}
              isActive={space.id === activeSpaceId}
              onClick={() => handleSpaceClick(space.id)}
              onEdit={() => {
                const newName = window.prompt('Oda adını düzenle:', space.name);
                if (newName && newName.trim()) {
                  updateSpace(space.id, { name: newName.trim() });
                  if (onBroadcastUpdate) onBroadcastUpdate(space.id, newName.trim());
                }
              }}
              onDelete={() => {
                if (window.confirm(`"${space.name}" odasını silmek istediğine emin misin?`)) {
                  removeSpace(space.id);
                  if (activeSpaceId === space.id) {
                    setActiveSpace(null);
                  }
                  if (onBroadcastDelete) onBroadcastDelete(space.id);
                }
              }}
            />
          ))
        )}
      </div>

      {/* Ses Kanalı Slot */}
      {voiceSlot && <div className={styles.voiceSlot}>{voiceSlot}</div>}

      {/* Oda Kodu -- arkadaşların bu kodla bağlanabilir */}
      {peerId && (
        <div className={styles.peerIdSection}>
          <span className={styles.peerIdLabel}>Bağlantı Kodun</span>
          <button
            className={styles.peerIdBox}
            onClick={copyPeerId}
            title="Oda kodunu kopyala"
            aria-label="Oda kodunu kopyala"
          >
            <span className={styles.peerIdText}>{peerId.replace('illaki-', '')}</span>
            {codeCopied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          <span className={styles.peerIdHint}>Space oluşturmadan da paylaşabilirsin</span>
        </div>
      )}

      {/* User panel at bottom */}
      <div className={styles.userPanel}>
        <Avatar
          username={identity?.username}
          color={identity?.avatarColor}
          size={34}
          status="online"
        />
        <div className={styles.userInfo}>
          <span className={styles.userName}>{identity?.username}</span>
          <span className={styles.userStatus}>online</span>
        </div>
        <div className={styles.userActions}>
          <button
            className={`${styles.userActionBtn} ${micMuted ? styles.muted : ''}`}
            onClick={() => setMicMuted(m => !m)}
            title={micMuted ? 'Mikrofonu Aç' : 'Mikrofonu Kapat'}
            aria-label={micMuted ? 'Mikrofonu aç' : 'Mikrofonu kapat'}
            aria-pressed={micMuted}
          >
            {micMuted ? <MicOff size={15} /> : <Mic size={15} />}
          </button>
          <button
            className={`${styles.userActionBtn} ${deafened ? styles.muted : ''}`}
            onClick={() => setDeafened(d => !d)}
            title={deafened ? 'Sesi Aç' : 'Sesi Kapat'}
            aria-label={deafened ? 'Sesi aç' : 'Sesi kapat'}
            aria-pressed={deafened}
          >
            {deafened ? <HeadphonesIcon size={15} /> : <Headphones size={15} />}
          </button>
          <button
            className={styles.userActionBtn}
            onClick={() => setSettingsOpen(true)}
            title="Ayarlar"
            aria-label="Ayarlar"
            id="settings-btn"
          >
            <Settings size={15} />
          </button>
          <button
            className={styles.userActionBtn}
            onClick={handleLogout}
            title="Çıkış Yap"
            aria-label="Çıkış yap"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </nav>
  );
}
