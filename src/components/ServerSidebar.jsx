import { useState } from 'react';
import { Plus, Compass, Hash, LogIn } from 'lucide-react';
import { useSpaceStore } from '../stores';
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

export function ServerSidebar({ onCreateSpace, onJoinSpace }) {
  const { spaces, activeSpaceId, setActiveSpace, clearUnread } = useSpaceStore();

  const handleSpaceClick = (spaceId) => {
    setActiveSpace(spaceId);
    clearUnread(spaceId);
  };

  return (
    <nav className={styles.sidebar}>
      <div className={styles.homeButtonWrapper}>
        <div className={`${styles.pill} ${!activeSpaceId ? styles.pillActive : ''}`} />
        <button 
          className={`${styles.homeButton} ${!activeSpaceId ? styles.serverActive : ''}`}
          onClick={() => setActiveSpace(null)}
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
          <button className={styles.actionButton} onClick={onCreateSpace} title="Sunucu Oluştur">
            <Plus size={24} />
          </button>
        </div>
        <div className={styles.serverItemWrapper}>
          <button className={styles.actionButton} onClick={onJoinSpace} title="Sunucuya Katıl">
            <LogIn size={24} />
          </button>
        </div>
      </div>
    </nav>
  );
}
