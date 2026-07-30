import { useState, useEffect } from 'react';
import { Users, MessageSquare } from 'lucide-react';
import { useDmStore, useIdentityStore } from '../stores';
import { subscribeToDms, getUserProfile } from '../lib/firestore';
import styles from './DmSidebar.module.css';

export function DmSidebar({ onSelectFriends, voiceSlot }) {
  const { identity } = useIdentityStore();
  const { dms, setDms, activeDmId, setActiveDm, clearUnread } = useDmStore();
  const [dmProfiles, setDmProfiles] = useState({});

  useEffect(() => {
    if (!identity?.uid) return;
    const unsub = subscribeToDms(identity.uid, setDms);
    return () => unsub();
  }, [identity?.uid, setDms]);

  useEffect(() => {
    const fetchProfiles = async () => {
      const newProfiles = { ...dmProfiles };
      let changed = false;
      for (const dm of dms) {
        const otherUid = dm.participants.find(uid => uid !== identity?.uid);
        if (otherUid && !newProfiles[otherUid]) {
          const profile = await getUserProfile(otherUid);
          if (profile) {
            newProfiles[otherUid] = profile;
            changed = true;
          }
        }
      }
      if (changed) setDmProfiles(newProfiles);
    };
    fetchProfiles();
  }, [dms, identity?.uid]);

  const handleDmClick = (dmId) => {
    setActiveDm(dmId);
    clearUnread(dmId);
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.searchBar}>
          <input type="text" placeholder="Bir sohbet bul veya başlat" className={styles.searchInput} />
        </div>
      </div>
      
      <div className={styles.content}>
        <button 
          className={`${styles.navItem} ${!activeDmId ? styles.active : ''}`}
          onClick={() => {
            setActiveDm(null);
            if (onSelectFriends) onSelectFriends();
          }}
        >
          <Users size={20} className={styles.navIcon} />
          <span>Arkadaşlar</span>
        </button>

        <div className={styles.dmSection}>
          <div className={styles.dmSectionHeader}>
            <span>DİREKT MESAJLAR</span>
          </div>
          
          <div className={styles.dmList}>
            {dms.map(dm => {
              const otherUid = dm.participants.find(uid => uid !== identity?.uid);
              const profile = dmProfiles[otherUid];
              if (!profile) return null;
              
              const isActive = activeDmId === dm.id;
              
              return (
                <button 
                  key={dm.id}
                  className={`${styles.dmItem} ${isActive ? styles.active : ''}`}
                  onClick={() => handleDmClick(dm.id)}
                >
                  <div className={styles.avatarWrapper}>
                    <div 
                      className={styles.avatar} 
                      style={{ backgroundColor: profile.avatarColor || '#333' }}
                    >
                      {profile.username?.charAt(0).toUpperCase()}
                    </div>
                    {/* Durum noktası eklenebilir */}
                    <div className={`${styles.statusDot} ${profile.status === 'online' ? styles.online : profile.status === 'idle' ? styles.idle : profile.status === 'dnd' ? styles.dnd : styles.offline}`} />
                  </div>
                  <div className={styles.dmInfo}>
                    <span className={styles.dmName}>{profile.username}</span>
                    {profile.customStatus && (
                      <span className={styles.dmStatusText}>{profile.customStatus}</span>
                    )}
                  </div>
                  {dm.unread > 0 && (
                    <div className={styles.unreadBadge}>{dm.unread}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {voiceSlot}
    </div>
  );
}
