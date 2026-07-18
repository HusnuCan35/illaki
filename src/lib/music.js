import { doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

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
 * YouTube Linkinden Video ID'sini çıkarır
 */
function extractVideoId(url) {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : false;
}

/**
 * YouTube Noembed API'den şarkı bilgisini alır
 */
async function fetchVideoInfo(videoId) {
  try {
    const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
    const data = await res.json();
    return {
      title: data.title || 'Bilinmeyen Şarkı',
      thumbnail: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch (error) {
    return {
      title: 'Bilinmeyen Şarkı',
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
}

/**
 * Şarkıyı sıraya ekler
 */
export async function addSongToQueue(spaceId, url, requestedBy) {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("Geçersiz YouTube linki.");

  const info = await fetchVideoInfo(videoId);
  
  const song = {
    id: videoId + '-' + Date.now(), // Kuyrukta aynı şarkı olabilir diye uniq id
    videoId,
    title: info.title,
    thumbnail: info.thumbnail,
    requestedBy
  };

  const ref = getMusicStateRef(spaceId);
  const snap = await getDoc(ref);
  
  if (!snap.exists()) {
    // İlk defa oluşturuluyor
    await setDoc(ref, {
      currentSong: song,
      queue: [],
      status: 'playing',
      currentTime: 0,
      updatedAt: Date.now()
    });
  } else {
    const data = snap.data();
    if (!data.currentSong) {
      await updateDoc(ref, {
        currentSong: song,
        status: 'playing',
        currentTime: 0,
        updatedAt: Date.now()
      });
    } else {
      await updateDoc(ref, {
        queue: [...(data.queue || []), song]
      });
    }
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
    updatedAt: Date.now()
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
    updatedAt: Date.now()
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
