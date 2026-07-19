import { useState, useEffect, useRef } from 'react';
import YouTube from 'react-youtube';
import { subscribeToMusic, playNextSong } from '../lib/music';
import { useUIStore } from '../stores';

export function MusicPlayerCore({ activeSpaceId, onMusicStateChange }) {
  const { musicVolume } = useUIStore();
  const [musicState, setMusicState] = useState(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const playerRef = useRef(null);

  useEffect(() => {
    if (!activeSpaceId) return;
    const unsubscribe = subscribeToMusic(activeSpaceId, (state) => {
      setMusicState(state);
      if (onMusicStateChange) {
        onMusicStateChange(state);
      }
    });
    return () => unsubscribe();
  }, [activeSpaceId, onMusicStateChange]);

  // Senkronizasyon (Sync with remote)
  useEffect(() => {
    if (!isPlayerReady || !playerRef.current || !musicState) return;

    const player = playerRef.current;
    
    const syncWithRemote = async () => {
      try {
        const state = await player.getPlayerState(); // 1 = playing, 2 = paused
        const currentTime = await player.getCurrentTime();

        // Eğer yerel çalıyorsa ama uzak duraklatılmışsa
        if (musicState.status === 'paused' && state === 1) {
          player.pauseVideo();
        } 
        // Eğer yerel duraklatılmışsa ama uzak çalıyorsa (ve buffering değilse)
        else if (musicState.status === 'playing' && state !== 1 && state !== 3) {
          player.playVideo();
        }

        // Zaman senkronizasyonu
        if (musicState.currentTime !== undefined && musicState.updatedAt) {
          let targetTime = musicState.currentTime;
          
          // Eğer çalıyorsa, bilginin güncellendiği andan itibaren geçen süreyi ekle
          if (musicState.status === 'playing') {
            const elapsedSeconds = (Date.now() - musicState.updatedAt) / 1000;
            targetTime += elapsedSeconds;
          }

          // Eğer 3 saniyeden fazla bir fark varsa videoyu sar (başa sarma bug'ını önlemek için tolerans)
          if (Math.abs(currentTime - targetTime) > 3) {
            player.seekTo(targetTime, true);
          }
        }
      } catch (err) {
        console.error("Sync error:", err);
      }
    };

    syncWithRemote();
  }, [musicState, isPlayerReady]);

  // Ses seviyesini ayarla
  useEffect(() => {
    if (isPlayerReady && playerRef.current) {
      try {
        playerRef.current.setVolume(musicVolume);
      } catch (e) {
        console.error("Volume set error:", e);
      }
    }
  }, [musicVolume, isPlayerReady]);

  const onPlayerReady = (event) => {
    playerRef.current = event.target;
    window.__illakiMusicPlayer = event.target; // Expose for external controls
    setIsPlayerReady(true);
  };

  const onPlayerEnd = () => {
    console.log("[MusicBot] Video ended, playing next...");
    playNextSong(activeSpaceId, musicState?.currentSong?.id);
  };

  const onPlayerError = (event) => {
    console.error("[MusicBot] YouTube Player Error:", event.data);
    setTimeout(() => {
      playNextSong(activeSpaceId, musicState?.currentSong?.id);
    }, 2000);
  };

  const opts = {
    height: '1',
    width: '1',
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      rel: 0
    },
  };

  if (!musicState?.currentSong) return null;

  return (
    <div style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: '1px', height: '1px', overflow: 'hidden' }}>
      <YouTube 
        videoId={musicState.currentSong.videoId} 
        opts={opts} 
        onReady={onPlayerReady}
        onEnd={onPlayerEnd}
        onError={onPlayerError}
      />
    </div>
  );
}
