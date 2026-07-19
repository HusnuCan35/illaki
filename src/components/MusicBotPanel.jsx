import { useState, useEffect } from 'react';
import { Play, Pause, Square, SkipForward, Music, Plus, Trash2, Volume2, Disc3 } from 'lucide-react';
import { useSpaceStore, useIdentityStore, useUIStore } from '../stores';
import { subscribeToMusic, addSongToQueue, playNextSong, updatePlaybackStatus, removeSongFromQueue } from '../lib/music';
import styles from './MusicBotPanel.module.css';

export function MusicBotPanel() {
  const { activeSpaceId } = useSpaceStore();
  const { identity } = useIdentityStore();
  const { musicVolume, setMusicVolume } = useUIStore();
  const [musicState, setMusicState] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeSpaceId) return;
    const unsubscribe = subscribeToMusic(activeSpaceId, (state) => {
      setMusicState(state);
    });
    return () => unsubscribe();
  }, [activeSpaceId]);

  const handleAddSong = async (e) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setLoading(true);
    try {
      await addSongToQueue(activeSpaceId, urlInput.trim(), identity.username);
      setUrlInput('');
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const togglePlay = async () => {
    if (!musicState?.currentSong) return;
    const newStatus = musicState.status === 'playing' ? 'paused' : 'playing';
    let currentTime = 0;
    try {
      if (window.__illakiMusicPlayer) {
        currentTime = await window.__illakiMusicPlayer.getCurrentTime();
      }
    } catch (e) {}
    updatePlaybackStatus(activeSpaceId, newStatus, currentTime);
  };

  const handleStop = () => {
    if (!musicState?.currentSong) return;
    // Tamamen durdurup süreyi 0 yapıyoruz
    updatePlaybackStatus(activeSpaceId, 'stopped', 0);
  };

  const handleSkip = () => {
    playNextSong(activeSpaceId, musicState?.currentSong?.id);
  };

  if (!musicState) {
    return <div className={styles.loading}>Müzik Kutusu Yükleniyor...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Music size={18} className={styles.headerIcon} />
        <h2>Müzik Botu</h2>
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
            <span>Hemen bir YouTube linki ekle!</span>
          </div>
        )}
      </div>

      <form className={styles.addForm} onSubmit={handleAddSong}>
        <input
          type="text"
          placeholder="YouTube linki yapıştır..."
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          className={styles.input}
          disabled={loading}
        />
        <button type="submit" className={styles.addBtn} disabled={loading || !urlInput.trim()}>
          <Plus size={18} />
        </button>
      </form>

      <div className={styles.queueSection}>
        <h3>Sıradakiler ({musicState.queue?.length || 0})</h3>
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
    </div>
  );
}
