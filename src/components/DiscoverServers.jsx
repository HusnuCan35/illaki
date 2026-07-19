import { useState, useEffect } from 'react';
import { getPublicSpaces, joinSpace } from '../lib/firestore';
import { useIdentityStore, useSpaceStore, useUIStore } from '../stores';
import { Search, Hash, Users, ArrowRight } from 'lucide-react';
import styles from './DiscoverServers.module.css';

export function DiscoverServers({ onJoin, onClose }) {
  const { identity } = useIdentityStore();
  const { spaces } = useSpaceStore();
  const { addToast } = useUIStore();
  const [servers, setServers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState(null);

  useEffect(() => {
    getPublicSpaces().then(data => {
      setServers(data);
    }).catch(err => {
      console.error(err);
      addToast({ type: 'error', message: 'Sunucular yüklenirken hata oluştu veya indeks yükleniyor.' });
    }).finally(() => {
      setLoading(false);
    });
  }, [addToast]);

  const handleJoin = async (server) => {
    if (joiningId) return;
    setJoiningId(server.id);
    try {
      await joinSpace(server.code, identity);
      if (onJoin) onJoin(server.code, server.id);
      if (onClose) onClose();
      addToast({ type: 'success', message: 'Sunucuya başarıyla katıldın!' });
    } catch (err) {
      addToast({ type: 'error', message: err.message });
    } finally {
      setJoiningId(null);
    }
  };

  const filteredServers = servers.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (s.description && s.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className={styles.discoverContainer}>
      <div className={styles.header}>
        <h2>Keşfet</h2>
        <p>Açık sunucuları bul ve topluluklara katıl</p>
      </div>
      
      <div className={styles.searchBox}>
        <Search className={styles.searchIcon} size={20} />
        <input 
          type="text" 
          placeholder="Sunucu ara..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.serverList}>
        {loading ? (
          <div className={styles.loading}>Sunucular yükleniyor...</div>
        ) : filteredServers.length > 0 ? (
          filteredServers.map(server => {
            const isJoined = spaces.some(s => s.id === server.id);
            return (
              <div key={server.id} className={styles.serverCard}>
                <div className={styles.serverIconWrapper}>
                  <div className={styles.serverIcon}>{server.icon || <Hash size={24} />}</div>
                </div>
                <div className={styles.serverInfo}>
                  <h3>{server.name}</h3>
                  <p>{server.description || 'Açıklama yok'}</p>
                  <div className={styles.serverMeta}>
                    <span className={styles.memberCount}>
                      <Users size={14} /> {server.memberCount || 1} Üye
                    </span>
                    <span className={styles.hostBadge}>Kurucu: {server.hostUsername}</span>
                  </div>
                </div>
                <div className={styles.serverAction}>
                  {isJoined ? (
                    <button className={styles.joinedBtn} disabled>Katıldın</button>
                  ) : (
                    <button 
                      className={styles.joinBtn} 
                      onClick={() => handleJoin(server)}
                      disabled={joiningId === server.id}
                    >
                      {joiningId === server.id ? 'Katılınıyor...' : 'Katıl'} <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className={styles.empty}>Aradığınız kriterde sunucu bulunamadı.</div>
        )}
      </div>
    </div>
  );
}
