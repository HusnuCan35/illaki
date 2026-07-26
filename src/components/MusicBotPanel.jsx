import { useState, useEffect } from 'react';
import { Play, Pause, Square, SkipForward, Music, Plus, Trash2, Volume2, Disc3, X, Search, ListMusic, Save, Sparkles } from 'lucide-react';
import { useSpaceStore, useIdentityStore, useUIStore } from '../stores';
import { subscribeToMusic, addSongToQueue, playNextSong, updatePlaybackStatus, removeSongFromQueue, searchSongByName, createPlaylist, subscribeToPlaylists, loadPlaylistToQueue } from '../lib/music';
import styles from './MusicBotPanel.module.css';

export function MusicBotPanel({ onClose }) {
  const { activeSpaceId } = useSpaceStore();
  const { identity } = useIdentityStore();
  const { musicVolume, setMusicVolume } = useUIStore();
  const [musicState, setMusicState] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Search & Playlist states
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'playlists'
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [playlistName, setPlaylistName] = useState('');
  const [savingPlaylist, setSavingPlaylist] = useState(false);

  useEffect(() => {
    if (!activeSpaceId) return;
    const unsubMusic = subscribeToMusic(activeSpaceId, (state) => {
      setMusicState(state);
    });
    const unsubPlaylists = subscribeToPlaylists(activeSpaceId, (pl) => {
      setPlaylists(pl);
    });
    return () => {
      unsubMusic();
      unsubPlaylists();
    };
  }, [activeSpaceId]);

  // Debounced Song Search by Name
  useEffect(() => {
    if (!urlInput.trim() || urlInput.startsWith('http')) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchSongByName(urlInput);
      setSearchResults(results);
      setIsSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [urlInput]);

  const handleAddSong = async (e, customSong = null) => {
    if (e) e.preventDefault();
    const query = customSong ? customSong.videoId : urlInput.trim();
    if (!query) return;

    setLoading(true);
    setSearchResults([]);
    try {
      await addSongToQueue(activeSpaceId, query, identity.username);
      setUrlInput('');
      useUIStore.getState().addToast({ type: 'success', message: 'Müzik sıraya eklendi!' });
    } catch (err) {
      useUIStore.getState().addToast({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Instant responsive optimistic toggle
  const togglePlay = () => {
    if (!musicState?.currentSong) return;
    const newStatus = musicState.status === 'playing' ? 'paused' : 'playing';
    setMusicState(prev => prev ? { ...prev, status: newStatus } : prev);
    let currentTime = 0;
    try {
      if (window.__illakiMusicPlayer && typeof window.__illakiMusicPlayer.getCurrentTime === 'function') {
        currentTime = window.__illakiMusicPlayer.getCurrentTime() || 0;
      }
    } catch (e) {}
    updatePlaybackStatus(activeSpaceId, newStatus, currentTime);
  };

  const handleStop = () => {
    if (!musicState?.currentSong) return;
    setMusicState(prev => prev ? { ...prev, status: 'stopped', currentSong: null } : prev);
    updatePlaybackStatus(activeSpaceId, 'stopped', 0);
  };

  const handleSkip = () => {
    playNextSong(activeSpaceId, musicState?.currentSong?.id);
  };

  const handleSaveCurrentQueueAsPlaylist = async (e) => {
    e.preventDefault();
    if (!playlistName.trim()) return;
    const allSongs = [];
    if (musicState?.currentSong) allSongs.push(musicState.currentSong);
    if (musicState?.queue) allSongs.push(...musicState.queue);

    if (allSongs.length === 0) {
      useUIStore.getState().addToast({ type: 'error', message: 'Çalma listesi kaydetmek için sırada şarkı olmalı.' });
      return;
    }

    setSavingPlaylist(true);
    try {
      await createPlaylist(activeSpaceId, {
        name: playlistName.trim(),
        songs: allSongs.map(s => ({ videoId: s.videoId, title: s.title, thumbnail: s.thumbnail })),
        createdBy: identity.username
      });
      setPlaylistName('');
      useUIStore.getState().addToast({ type: 'success', message: 'Çalma listesi kaydedildi!' });
    } catch (err) {
      useUIStore.getState().addToast({ type: 'error', message: err.message });
    } finally {
      setSavingPlaylist(false);
    }
  };

  const handleLoadPlaylist = async (pl) => {
    try {
      await loadPlaylistToQueue(activeSpaceId, pl.songs, identity.username);
      useUIStore.getState().addToast({ type: 'success', message: `"${pl.name}" listesi sıraya eklendi!` });
    } catch (err) {
      useUIStore.getState().addToast({ type: 'error', message: 'Liste yüklenemedi.' });
    }
  };

  if (!musicState) {
    return <div className={styles.loading}>Müzik Kutusu Yükleniyor...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Music size={18} className={styles.headerIcon} />
        <h2>Müzik Botu</h2>
        {onClose && (
          <button
            onClick={onClose}
            title="Kapat"
            aria-label="Kapat"
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '6px',
            }}
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div className={styles.playerSection}>
        {musicState.currentSong ? (
          <div className={styles.nowPlaying}>
            <div className={styles.coverArt}>
              <img src={musicState.currentSong.thumbnail} alt="cover" className={styles.coverImage} />
              <div className={`${styles.playingIndicator} ${musicState.status === 'playing' ? styles.animating : ''}`}>
                <Disc3 size={40} />
              </div>
            </div>
            <div className={styles.songInfo}>
              <div className={styles.songTitle} title={musicState.currentSong.title}>
                {musicState.currentSong.title}
              </div>
              <div className={styles.requestedBy}>
                Ekleyen: {musicState.currentSong.requestedBy}
              </div>
            </div>
            
            <div className={styles.controlsRow}>
              <div className={styles.controls}>
                <button className={styles.controlBtn} onClick={togglePlay} title={musicState.status === 'playing' ? 'Duraklat' : 'Oynat'}>
                  {musicState.status === 'playing' ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button className={styles.controlBtn} onClick={handleStop} title="Durdur">
                  <Square size={20} />
                </button>
                <button className={styles.controlBtn} onClick={handleSkip} title="Sıradakine Geç">
                  <SkipForward size={20} />
                </button>
              </div>
              
              <div className={styles.volumeControl}>
                <Volume2 size={16} className={styles.volumeIcon} />
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={musicVolume} 
                  onChange={(e) => setMusicVolume(parseInt(e.target.value))}
                  className={styles.volumeSlider}
                  title="Ses Seviyesi"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <Volume2 size={48} className={styles.emptyIcon} />
            <p>Şu an çalan bir parça yok.</p>
            <span>Şarkı adı veya YouTube linki girin!</span>
          </div>
        )}
      </div>

      {/* Add Song & Search Input */}
      <div style={{ position: 'relative' }}>
        <form className={styles.addForm} onSubmit={(e) => handleAddSong(e)}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              placeholder="Şarkı ismi (örn: Dönence) veya link..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className={styles.input}
              disabled={loading}
            />
            {isSearching && (
              <span style={{ position: 'absolute', right: 10, top: 10, fontSize: 11, color: 'var(--accent)' }}>Aranıyor...</span>
            )}
          </div>
          <button type="submit" className={styles.addBtn} disabled={loading || !urlInput.trim()}>
            <Plus size={18} />
          </button>
        </form>

        {/* Live Search Suggestions Dropdown */}
        {searchResults.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
            background: '#0E1017', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 12, marginTop: 4, maxHeight: 220, overflowY: 'auto',
            boxShadow: '0 12px 32px rgba(0,0,0,0.8)'
          }}>
            {searchResults.map((song) => (
              <div
                key={song.videoId}
                onClick={() => handleAddSong(null, song)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,126,32,0.15)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <img src={song.thumbnail} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</div>
                  <div style={{ fontSize: 10, color: '#94A3B8' }}>{song.uploaderName}</div>
                </div>
                <Plus size={14} color="#FF7E20" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs: Queue vs Playlists */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        <button
          type="button"
          onClick={() => setActiveTab('queue')}
          style={{
            padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: activeTab === 'queue' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'queue' ? '#fff' : 'var(--text-secondary)'
          }}
        >
          Sıradakiler ({musicState.queue?.length || 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('playlists')}
          style={{
            padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: activeTab === 'playlists' ? 'var(--accent)' : 'transparent',
            color: activeTab === 'playlists' ? '#fff' : 'var(--text-secondary)'
          }}
        >
          <ListMusic size={13} style={{ display: 'inline', marginRight: 4 }} />
          Çalma Listeleri ({playlists.length})
        </button>
      </div>

      {activeTab === 'queue' ? (
        <div className={styles.queueSection}>
          <div className={styles.queueList}>
            {musicState.queue?.length > 0 ? (
              musicState.queue.map((song, idx) => (
                <div key={song.id} className={styles.queueItem}>
                  <span className={styles.queueIndex}>{idx + 1}</span>
                  <img src={song.thumbnail} alt="thumb" className={styles.queueThumb} />
                  <div className={styles.queueInfo}>
                    <span className={styles.queueTitle} title={song.title}>{song.title}</span>
                    <span className={styles.queueUser}>{song.requestedBy}</span>
                  </div>
                  <button 
                    className={styles.removeBtn} 
                    onClick={() => removeSongFromQueue(activeSpaceId, song.id)}
                    title="Sıradan Çıkar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            ) : (
              <div className={styles.emptyQueue}>Kuyruk boş.</div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10, maxHeight: 220, overflowY: 'auto' }}>
          {/* Save current queue as playlist form */}
          <form onSubmit={handleSaveCurrentQueueAsPlaylist} style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder="Yeni Çalma Listesi Adı..."
              value={playlistName}
              onChange={(e) => setPlaylistName(e.target.value)}
              className={styles.input}
              style={{ fontSize: 12, padding: '6px 10px' }}
            />
            <button
              type="submit"
              disabled={savingPlaylist || !playlistName.trim()}
              style={{
                padding: '6px 12px', borderRadius: 8, border: 'none', background: '#10B981', color: '#fff',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
              }}
            >
              <Save size={14} /> Kaydet
            </button>
          </form>

          {/* Playlist items */}
          {playlists.length === 0 ? (
            <div className={styles.emptyQueue}>Henüz kayıtlı çalma listesi yok.</div>
          ) : (
            playlists.map((pl) => (
              <div
                key={pl.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.08)'
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: '#FFF', fontSize: 13 }}>{pl.name}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>{pl.songs?.length || 0} Şarkı • Ekleyen: {pl.createdBy}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleLoadPlaylist(pl)}
                  style={{
                    padding: '5px 10px', borderRadius: 6, border: 'none', background: '#FF7E20', color: '#fff',
                    fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                  }}
                >
                  <Play size={12} /> Çal
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
