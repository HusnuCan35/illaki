import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection } from 'firebase/firestore';
import { db } from './firebase';
import { getSyncedTime } from './time';

const getMusicStateRef = (spaceId) => doc(db, 'spaces', spaceId, 'music', 'state');

/**
 * Müzik durumunu dinler
 */
export function subscribeToMusic(spaceId, callback) {
  const ref = getMusicStateRef(spaceId);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      callback(snap.data());
    } else {
      callback({
        currentSong: null,
        queue: [],
        status: 'stopped',
        currentTime: 0,
        updatedAt: Date.now()
      });
    }
  }, (error) => {
    console.error("subscribeToMusic error:", error);
    // Even on error, provide a default state so it doesn't get stuck loading
    callback({
      currentSong: null,
      queue: [],
      status: 'stopped',
      currentTime: 0,
      updatedAt: Date.now()
    });
  });
}

/**
 * Şarkı ismi ile arama yapar (YouTube / Invidious API)
 */
export async function searchSongByName(query) {
  if (!query || !query.trim()) return [];
  try {
    const res = await fetch(`https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(query)}&filter=music_videos`);
    const data = await res.json();
    if (data && data.items && data.items.length > 0) {
      return data.items.slice(0, 6).map(item => ({
        videoId: item.url ? item.url.replace('/watch?v=', '') : '',
        title: item.title,
        thumbnail: item.thumbnail || `https://img.youtube.com/vi/${item.url.replace('/watch?v=', '')}/hqdefault.jpg`,
        uploaderName: item.uploaderName || 'Müzik'
      })).filter(i => i.videoId);
    }
  } catch (e) {}

  try {
    const res = await fetch(`https://vid.puffyan.us/api/v1/search?q=${encodeURIComponent(query)}&type=video`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return data.slice(0, 6).map(item => ({
        videoId: item.videoId,
        title: item.title,
        thumbnail: item.videoThumbnails?.[0]?.url || `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`,
        uploaderName: item.author || 'Müzik'
      }));
    }
  } catch (e) {}

  return [];
}

/**
 * Şarkıyı sıraya ekler (Link veya Şarkı İsmi)
 */
export async function addSongToQueue(spaceId, input, requestedBy) {
  let videoId = extractVideoId(input);
  let title = 'Bilinmeyen Şarkı';
  let thumbnail = '';

  if (videoId) {
    const info = await fetchVideoInfo(videoId);
    title = info.title;
    thumbnail = info.thumbnail;
  } else {
    // Şarkı ismiyle arama yap
    const results = await searchSongByName(input);
    if (!results || results.length === 0) {
      throw new Error("Şarkı bulunamadı. Lütfen tam şarkı ismini veya YouTube linkini girin.");
    }
    videoId = results[0].videoId;
    title = results[0].title;
    thumbnail = results[0].thumbnail;
  }

  const song = {
    id: videoId + '-' + Date.now(),
    videoId,
    title,
    thumbnail,
    requestedBy
  };

  const ref = getMusicStateRef(spaceId);
  const snap = await getDoc(ref);
  
  if (!snap.exists()) {
    await setDoc(ref, {
      currentSong: song,
      queue: [],
      status: 'playing',
      currentTime: 0,
      updatedAt: getSyncedTime()
    });
  } else {
    const data = snap.data();
    if (!data.currentSong) {
      await updateDoc(ref, {
        currentSong: song,
        status: 'playing',
        currentTime: 0,
        updatedAt: getSyncedTime()
      });
    } else {
      await updateDoc(ref, {
        queue: [...(data.queue || []), song]
      });
    }
  }
}

// ────────────────────────────────────────────────────────────
// Çalma Listeleri (Playlists)
// ────────────────────────────────────────────────────────────

export async function createPlaylist(spaceId, { name, songs = [], createdBy }) {
  const plRef = doc(collection(db, 'spaces', spaceId, 'playlists'));
  await setDoc(plRef, {
    id: plRef.id,
    name: name.trim(),
    songs,
    createdBy,
    createdAt: Date.now(),
  });
  return plRef.id;
}

export function subscribeToPlaylists(spaceId, onPlaylists) {
  if (!spaceId) return () => {};
  const q = collection(db, 'spaces', spaceId, 'playlists');
  return onSnapshot(q, (snap) => {
    onPlaylists(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function loadPlaylistToQueue(spaceId, songs, requestedBy) {
  if (!songs || songs.length === 0) return;
  const ref = getMusicStateRef(spaceId);
  const snap = await getDoc(ref);
  
  const formattedSongs = songs.map(s => ({
    id: s.videoId + '-' + Math.random().toString(36).substr(2, 9),
    videoId: s.videoId,
    title: s.title,
    thumbnail: s.thumbnail || `https://img.youtube.com/vi/${s.videoId}/hqdefault.jpg`,
    requestedBy
  }));

  if (!snap.exists() || !snap.data().currentSong) {
    await setDoc(ref, {
      currentSong: formattedSongs[0],
      queue: formattedSongs.slice(1),
      status: 'playing',
      currentTime: 0,
      updatedAt: getSyncedTime()
    }, { merge: true });
  } else {
    const data = snap.data();
    await updateDoc(ref, {
      queue: [...(data.queue || []), ...formattedSongs]
    });
  }
}

/**
 * Sonraki şarkıya geçer
 * @param {string} spaceId
 * @param {string} expectedSongId - Eğer bu şarkı zaten geçilmişse işlemi iptal et (race condition önleme)
 */
export async function playNextSong(spaceId, expectedSongId) {
  const ref = getMusicStateRef(spaceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  
  // Eğer başka biri zaten bu şarkıyı atladıysa işlemi iptal et
  if (expectedSongId && data.currentSong && data.currentSong.id !== expectedSongId) {
    console.log("Şarkı zaten geçilmiş, işlem iptal ediliyor.");
    return;
  }

  if (!data.queue || data.queue.length === 0) {
    await updateDoc(ref, {
      currentSong: null,
      status: 'stopped',
      currentTime: 0,
      updatedAt: Date.now()
    });
    return;
  }

  const nextSong = data.queue[0];
  const newQueue = data.queue.slice(1);

  await updateDoc(ref, {
    currentSong: nextSong,
    queue: newQueue,
    status: 'playing',
    currentTime: 0,
    updatedAt: getSyncedTime()
  });
}

/**
 * Şarkı oynatma durumunu (Play/Pause/Seek) günceller
 */
export async function updatePlaybackStatus(spaceId, status, currentTime) {
  const ref = getMusicStateRef(spaceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  
  const updates = {
    status,
    updatedAt: getSyncedTime()
  };
  if (currentTime !== undefined) {
    updates.currentTime = currentTime;
  }
  
  await updateDoc(ref, updates);
}

/**
 * Şarkıyı sıradan kaldırır
 */
export async function removeSongFromQueue(spaceId, songId) {
  const ref = getMusicStateRef(spaceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  
  const data = snap.data();
  await updateDoc(ref, {
    queue: (data.queue || []).filter(s => s.id !== songId)
  });
}
