import { useState } from 'react';
import { Plus, Compass, Hash, LogIn, LogOut } from 'lucide-react';
import { useSpaceStore, useIdentityStore, useUIStore } from '../stores';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { LogoutModal } from './LogoutModal';
import styles from './ServerSidebar.module.css';

function ServerItem({ space, isActive, onClick }) {
  const initial = space.name?.charAt(0).toUpperCase() || '#';
  const hasIcon = !!space.icon && space.icon !== '💬';

  return (
    <div className={styles.serverItemWrapper}>
      <div className={`${styles.pill} ${isActive ? styles.pillActive : ''}`} />
      <button
        className={`${styles.serverItem} ${isActive ? styles.serverActive : ''}`}
        onClick={onClick}
        title={space.name}
      >
        {hasIcon ? (
          <span className={styles.serverIconEmoji}>{space.icon}</span>
        ) : (
          <span className={styles.serverIconText}>{initial}</span>
        )}
        {space.unread > 0 && (
          <div className={styles.badge}>{space.unread > 9 ? '9+' : space.unread}</div>
        )}
      </button>
    </div>
  );
}

export function ServerSidebar({ onCreateSpace, onJoinSpace, onDiscover }) {
  const { spaces, activeSpaceId, setActiveSpace, clearUnread } = useSpaceStore();
  const { identity, setIdentity } = useIdentityStore();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const handleSpaceClick = (spaceId) => {
    setActiveSpace(spaceId);
    clearUnread(spaceId);
  };

  const handleConfirmLogout = async () => {
    try {
      await signOut(auth);
      setIdentity(null);
      useSpaceStore.getState().setSpaces([]);
      useSpaceStore.getState().setActiveSpace(null);
    } catch (err) {
      console.error('Çıkış hatası:', err);
    }
  };

  return (
    <nav className={styles.sidebar}>
      <div className={styles.homeButtonWrapper}>
        <div className={`${styles.pill} ${!activeSpaceId ? styles.pillActive : ''}`} />
        <button 
          className={`${styles.homeButton} ${!activeSpaceId ? styles.serverActive : ''}`}
          onClick={() => {
            setActiveSpace(null);
            if (window.innerWidth <= 768) useUIStore.getState().setSidebarOpen(false);
          }}
          title="Ana Sayfa"
        >
          <Hash size={24} />
        </button>
      </div>

      <div className={styles.separator} />

      <div className={styles.serverList}>
        {spaces.map(space => (
          <ServerItem
            key={space.id}
            space={space}
            isActive={space.id === activeSpaceId}
            onClick={() => handleSpaceClick(space.id)}
          />
        ))}

        <div className={styles.serverItemWrapper}>
          <button 
            className={styles.actionButton} 
            onClick={() => {
              onCreateSpace();
              if (window.innerWidth <= 768) useUIStore.getState().setSidebarOpen(false);
            }} 
            title="Sunucu Oluştur"
          >
            <Plus size={24} />
          </button>
        </div>
        <div className={styles.serverItemWrapper}>
          <button 
            className={styles.actionButton} 
            onClick={() => {
              onJoinSpace();
              if (window.innerWidth <= 768) useUIStore.getState().setSidebarOpen(false);
            }} 
            title="Sunucuya Katıl"
          >
            <LogIn size={24} />
          </button>
        </div>
        
        <div className={styles.separator} style={{ width: '32px', marginTop: '4px', marginBottom: '4px' }} />
        
        <div className={styles.serverItemWrapper}>
          <button 
            className={`${styles.actionButton} ${styles.discoverBtn}`} 
            onClick={() => {
              onDiscover();
              if (window.innerWidth <= 768) useUIStore.getState().setSidebarOpen(false);
            }} 
            title="Açık Sunucuları Keşfet"
          >
            <Compass size={24} />
          </button>
        </div>
      </div>

      {/* Profil & Çıkış Yap Butonu (Sunucu olmasa dahi görünür) */}
      <div style={{ marginTop: 'auto', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <div className={styles.separator} style={{ width: '32px' }} />
        <div className={styles.serverItemWrapper}>
          <button
            className={styles.actionButton}
            style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}
            onClick={() => setLogoutOpen(true)}
            title={`Çıkış Yap (${identity?.username || 'Kullanıcı'})`}
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <LogoutModal
        isOpen={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={handleConfirmLogout}
      />
    </nav>
  );
}
