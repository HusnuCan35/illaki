/**
 * Firestore Operations — illaki
 * 
 * Koleksiyonlar:
 *   users/{uid}
 *   spaces/{spaceId}
 *   spaces/{spaceId}/messages/{messageId}
 *   spaces/{spaceId}/members/{uid}
 *   userKeys/{uid}  ← ECDH public key'leri (şifre değişimi için)
 */

import {
  doc, collection, getDoc, setDoc, updateDoc, deleteDoc,
  addDoc, query, orderBy, limit, onSnapshot,
  serverTimestamp, arrayUnion, arrayRemove,
  where, getDocs, writeBatch, runTransaction, increment
} from 'firebase/firestore';
import {
  ref, uploadBytes, getDownloadURL, deleteObject,
} from 'firebase/storage';
import { db, storage } from './firebase';
import {
  generateSpaceKey, exportKey, importSpaceKey, encryptMessage, decryptMessage,
  generateKeyPair, exportPublicKey, importPublicKey,
  deriveSharedKey, encryptSpaceKey, decryptSpaceKey,
  saveUserKeyPair, loadUserKeyPair, cacheSpaceKey, getCachedSpaceKey,
} from './crypto';

// ────────────────────────────────────────────────────────────
// Kullanıcı Profili
// ────────────────────────────────────────────────────────────

/**
 * Kullanıcı profili oluştur/güncelle (ilk girişte çağrılır)
 */
export async function upsertUserProfile(uid, { username, avatarColor, photoURL = null }) {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);

  // ECDH anahtar çiftini oluştur ya da mevcut olanı yükle
  let keyPair = await loadUserKeyPair(uid);
  if (!keyPair) {
    const { publicKey, privateKey } = await generateKeyPair();
    keyPair = { publicKey, privateKey };
    await saveUserKeyPair(uid, keyPair);
  }

  const publicKeyStr = await exportPublicKey(keyPair.publicKey);

  // Public key'i Firestore'da sakla (herkes görebilir, sadece public)
  await setDoc(doc(db, 'userKeys', uid), {
    publicKey: publicKeyStr,
    uid,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  if (!snap.exists()) {
    await setDoc(userRef, {
      uid,
      username,
      avatarColor,
      photoURL,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    });
  } else {
    await updateDoc(userRef, {
      username,
      avatarColor,
      photoURL,
      lastSeen: serverTimestamp(),
    });
  }
}

/**
 * Kullanıcı profilini getir
 */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

/**
 * Kullanıcının ECDH public key'ini getir
 */
export async function getUserPublicKey(uid) {
  const snap = await getDoc(doc(db, 'userKeys', uid));
  if (!snap.exists()) return null;
  return importPublicKey(snap.data().publicKey);
}

// ────────────────────────────────────────────────────────────
// Space (Oda) Yönetimi
// ────────────────────────────────────────────────────────────

/**
 * Yeni space oluştur (host tarafından)
 */
export async function createSpace({ uid, username, name, description = '', isPrivate = false, maxMembers = 50, icon = '💬' }) {
  // 8 karakterlik benzersiz kod oluştur
  const code = generateSpaceCode();
  const spaceId = `space_${code}`;

  // AES-256-GCM space anahtarı oluştur
  const spaceKey = await generateSpaceKey();
  const spaceKeyB64 = await exportKey(spaceKey);

  // Host'un kendi ECDH anahtarıyla space key'i şifrele
  const hostKeyPair = await loadUserKeyPair(uid);
  if (!hostKeyPair) throw new Error('Kullanıcı şifreleme anahtarı bulunamadı');

  // Host kendi public key'iyle space key'i şifrele (ECDH self-encryption için shared key türet)
  const hostPublicKey = await getUserPublicKey(uid);
  const sharedKey = await deriveSharedKey(hostKeyPair.privateKey, hostPublicKey || hostKeyPair.publicKey);
  const encryptedKey = await encryptSpaceKey(spaceKey, sharedKey);

  // Space dökümanını yaz
  const spaceData = {
    id: spaceId,
    name,
    code,
    description,
    icon,
    isPrivate,
    maxMembers,
    hostUid: uid,
    hostUsername: username,
    memberCount: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    // Şifreli space key - her üye için ayrı entry
    encryptedKeys: {
      [uid]: encryptedKey,
    },
    // P2P/E2E tamamlanana kadar (host onayı vs) geçici fallback anahtar
    fallbackKey: spaceKeyB64,
  };

  await setDoc(doc(db, 'spaces', spaceId), spaceData);

  // Varsayılan 'genel' kanalını oluştur
  await setDoc(doc(db, 'spaces', spaceId, 'channels', 'general'), {
    id: 'general',
    name: 'genel',
    type: 'text',
    createdAt: serverTimestamp(),
  });

  // Varsayılan ses kanalını oluştur
  await setDoc(doc(db, 'spaces', spaceId, 'channels', 'general-voice'), {
    id: 'general-voice',
    name: 'Ses Kanalı',
    type: 'voice',
    createdAt: serverTimestamp(),
  });

  // Host'u member olarak ekle
  await setDoc(doc(db, 'spaces', spaceId, 'members', uid), {
    uid,
    username,
    role: 'host',
    joinedAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
    online: true,
  });

  // Kullanıcının katıldığı odalara ekle
  await updateDoc(doc(db, 'users', uid), {
    joinedSpaces: arrayUnion(spaceId)
  });

  // Space key'i session cache'e yaz
  await cacheSpaceKey(spaceId, spaceKey);

  return { spaceId, code, spaceKey };
}

/**
 * Space'e katıl (kod ile)
 */
export async function joinSpace(code, { uid, username }) {
  const spaceId = `space_${code.toUpperCase()}`;
  const spaceRef = doc(db, 'spaces', spaceId);
  const snap = await getDoc(spaceRef);

  if (!snap.exists()) throw new Error('Oda bulunamadı. Kod doğru mu?');

  const spaceData = snap.data();
  if (spaceData.memberCount >= spaceData.maxMembers) {
    throw new Error('Oda dolu.');
  }

  // Mevcut üye mi kontrol et
  const memberRef = doc(db, 'spaces', spaceId, 'members', uid);
  const memberSnap = await getDoc(memberRef);
  
  if (memberSnap.exists()) {
    // Zaten üye — sadece online yap ve key'i yükle
    await updateDoc(memberRef, { online: true, lastSeen: serverTimestamp() });
    const spaceKey = await getAndDecryptSpaceKey(spaceId, uid, spaceData);
    if (spaceKey) await cacheSpaceKey(spaceId, spaceKey);
    return { spaceId, spaceData };
  }

  // Yeni üye — Host'tan space key alıp kendi anahtarımızla şifrele
  // Not: Bu işlem için host'un genel anahtarını kullanarak space key'i deşifreleriz
  // Sonra kendi genel anahtarımızla yeniden şifreleriz
  // Tam E2E için: space'e katılma isteği → host onayı akışı eklenebilir
  // Şimdilik: Firestore'daki şifreli key'i host public key ile çözüp yeniden şifrele
  
  const userKeyPair = await loadUserKeyPair(uid);
  if (!userKeyPair) throw new Error('Şifreleme anahtarı bulunamadı');

  // Host'un public key'ini al ve shared key türet
  const hostPublicKey = await getUserPublicKey(spaceData.hostUid);
  if (hostPublicKey) {
    try {
      // Host'un şifreli key'ini çöz (bu yöntem host'un private key'ini gerektirdiği için 
      // gerçek E2E'de PeerJS ile doğrudan aktarım yapılır)
      // Şimdilik: spaceKeyB64'ü PeerJS üzerinden al veya host'a sor
      // Fallback: Host'un key entry'sini sadece host çözebilir
    } catch {}
  }

  // Üyeyi kaydet
  await setDoc(memberRef, {
    uid,
    username,
    role: 'member',
    joinedAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
    online: true,
  });

  await updateDoc(spaceRef, {
    memberCount: (spaceData.memberCount || 1) + 1,
    updatedAt: serverTimestamp(),
  });

  // Kullanıcının katıldığı odalara ekle
  await updateDoc(doc(db, 'users', uid), {
    joinedSpaces: arrayUnion(spaceId)
  });

  return { spaceId, spaceData };
}

/**
 * Space'den ayrıl
 */
export async function leaveSpace(spaceId, uid) {
  const memberRef = doc(db, 'spaces', spaceId, 'members', uid);
  await updateDoc(memberRef, { online: false, lastSeen: serverTimestamp() });
}

/**
 * Space'i sil (sadece host)
 */
export async function deleteSpace(spaceId, hostUid) {
  const spaceRef = doc(db, 'spaces', spaceId);
  const snap = await getDoc(spaceRef);
  if (!snap.exists() || snap.data().hostUid !== hostUid) {
    throw new Error('Bu işlem için yetkin yok.');
  }
  // Messages alt koleksiyonunu sil (batch)
  const messagesRef = collection(db, 'spaces', spaceId, 'messages');
  const msgSnap = await getDocs(query(messagesRef, limit(500)));
  const batch = writeBatch(db);
  msgSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(spaceRef);
  await batch.commit();
}

/**
 * Space ayarlarını güncelle
 */
export async function updateSpaceSettings(spaceId, hostUid, updates) {
  const spaceRef = doc(db, 'spaces', spaceId);
  const snap = await getDoc(spaceRef);
  if (!snap.exists() || snap.data().hostUid !== hostUid) {
    throw new Error('Bu işlem için yetkin yok.');
  }
  await updateDoc(spaceRef, { ...updates, updatedAt: serverTimestamp() });
}

/**
 * Üyeyi at (kick)
 */
export async function kickMember(spaceId, hostUid, targetUid) {
  const spaceRef = doc(db, 'spaces', spaceId);
  const snap = await getDoc(spaceRef);
  if (!snap.exists() || snap.data().hostUid !== hostUid) {
    throw new Error('Bu işlem için yetkin yok.');
  }
  const memberRef = doc(db, 'spaces', spaceId, 'members', targetUid);
  await deleteDoc(memberRef);
  await updateDoc(spaceRef, { memberCount: Math.max(0, (snap.data().memberCount || 1) - 1) });
}

/**
 * Üye yetkisini güncelle
 */
export async function updateMemberRole(spaceId, hostUid, targetUid, newRole) {
  const spaceRef = doc(db, 'spaces', spaceId);
  const snap = await getDoc(spaceRef);
  if (!snap.exists() || snap.data().hostUid !== hostUid) {
    throw new Error('Bu işlem için yetkin yok.');
  }
  const memberRef = doc(db, 'spaces', spaceId, 'members', targetUid);
  await updateDoc(memberRef, { role: newRole });
}

/**
 * Kullanıcının peer ID'sini üye belgesine yaz (ses kanalı keşfi için)
 */
export async function updateMemberPeerId(spaceId, uid, peerId) {
  try {
    const memberRef = doc(db, 'spaces', spaceId, 'members', uid);
    await updateDoc(memberRef, { peerId, online: true, lastSeen: serverTimestamp() });
  } catch {
    // Üye belgesi yoksa sessizce devam et
  }
}

/**
 * Bir space'in online üyelerini peer ID'leriyle birlikte getir (ses kanalı için)
 */
export async function getSpaceOnlineMembers(spaceId, myUid) {
  const membersSnap = await getDocs(collection(db, 'spaces', spaceId, 'members'));
  return membersSnap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(m => m.uid !== myUid && m.peerId);
}

// ────────────────────────────────────────────────────────────
// Kanallar (Channels)
// ────────────────────────────────────────────────────────────

export async function createChannel(spaceId, requesterUid, { name, type = 'text', allowedRoles = ['all'] }) {
  const spaceRef = doc(db, 'spaces', spaceId);
  const snap = await getDoc(spaceRef);
  
  const isHost = snap.exists() && snap.data().hostUid === requesterUid;
  
  let role = 'member';
  if (!isHost) {
    const memberSnap = await getDoc(doc(db, 'spaces', spaceId, 'members', requesterUid));
    if (memberSnap.exists()) role = memberSnap.data().role;
  }
  
  if (!isHost && role !== 'admin' && role !== 'mod') {
    throw new Error('Bu işlem için yetkin yok.');
  }

  const channelsRef = collection(db, 'spaces', spaceId, 'channels');
  const docRef = await addDoc(channelsRef, {
    name: name.trim().toLowerCase().replace(/\s+/g, '-'),
    type,
    allowedRoles,
    createdAt: serverTimestamp(),
  });
  
  return { id: docRef.id, name, type, allowedRoles };
}

export async function updateChannel(spaceId, requesterUid, channelId, updates) {
  const spaceRef = doc(db, 'spaces', spaceId);
  const snap = await getDoc(spaceRef);
  
  const isHost = snap.exists() && snap.data().hostUid === requesterUid;
  let role = 'member';
  if (!isHost) {
    const memberSnap = await getDoc(doc(db, 'spaces', spaceId, 'members', requesterUid));
    if (memberSnap.exists()) role = memberSnap.data().role;
  }
  
  if (!isHost && role !== 'admin' && role !== 'mod') {
    throw new Error('Bu işlem için yetkin yok.');
  }

  const channelRef = doc(db, 'spaces', spaceId, 'channels', channelId);
  await updateDoc(channelRef, updates);
}

export async function deleteChannel(spaceId, requesterUid, channelId) {
  if (channelId === 'general') throw new Error('Varsayılan kanal silinemez.');
  
  const spaceRef = doc(db, 'spaces', spaceId);
  const snap = await getDoc(spaceRef);
  
  const isHost = snap.exists() && snap.data().hostUid === requesterUid;
  let role = 'member';
  if (!isHost) {
    const memberSnap = await getDoc(doc(db, 'spaces', spaceId, 'members', requesterUid));
    if (memberSnap.exists()) role = memberSnap.data().role;
  }
  
  if (!isHost && role !== 'admin' && role !== 'mod') {
    throw new Error('Bu işlem için yetkin yok.');
  }

  const channelRef = doc(db, 'spaces', spaceId, 'channels', channelId);
  await deleteDoc(channelRef);
}

export function subscribeToChannels(spaceId, onChannels) {
  const q = query(
    collection(db, 'spaces', spaceId, 'channels'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(q, (snap) => {
    const channels = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    onChannels(channels);
  });
}

/**
 * Kullanıcının katıldığı ve host olduğu tüm space'leri getir
 */
export async function getUserSpaces(uid) {
  const results = [];
  const spaceIds = new Set();
  
  // Host olduğu odalar
  const hostQuery = query(
    collection(db, 'spaces'),
    where('hostUid', '==', uid)
  );
  const hostSnap = await getDocs(hostQuery);
  hostSnap.docs.forEach(d => {
    results.push({ id: d.id, ...d.data(), isHost: true });
    spaceIds.add(d.id);
  });
  
  // Katıldığı odalar (user document'tan)
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (userDoc.exists()) {
    const joined = userDoc.data().joinedSpaces || [];
    for (const spaceId of joined) {
      if (!spaceIds.has(spaceId)) {
        const spaceSnap = await getDoc(doc(db, 'spaces', spaceId));
        if (spaceSnap.exists()) {
          results.push({ id: spaceSnap.id, ...spaceSnap.data(), isHost: false });
          spaceIds.add(spaceId);
        }
      }
    }
  }
  
  return results;
}

/**
 * Kullanıcının odalarını gerçek zamanlı takip et (Silme/Ekleme/Düzenleme anlık yansır)
 */
export function subscribeToUserSpaces(uid, onSpaces) {
  let unsubUser = () => {};
  
  const qHost = query(collection(db, 'spaces'), where('hostUid', '==', uid));
  const unsubHost = onSnapshot(qHost, async () => {
    const spaces = await getUserSpaces(uid);
    onSpaces(spaces);
  });

  unsubUser = onSnapshot(doc(db, 'users', uid), async () => {
    const spaces = await getUserSpaces(uid);
    onSpaces(spaces);
  });

  return () => {
    unsubHost();
    unsubUser();
  };
}

// ────────────────────────────────────────────────────────────
// Mesajlar
// ────────────────────────────────────────────────────────────

/**
 * E2E şifreli mesaj gönder
 */
export async function sendEncryptedMessage(spaceId, channelId, uid, username, content, type = 'text', mediaData = null, replyTo = null) {
  let spaceKey = await getSpaceKey(spaceId, uid);
  if (!spaceKey) {
    throw new Error('Space anahtarı bulunamadı. Lütfen odayı yeniden açın.');
  }

  const { ciphertext, iv } = await encryptMessage(spaceKey, content);

  let encryptedMediaUrl = null;
  let encryptedThumbnailUrl = null;

  if (mediaData?.url) {
    const encrypted = await encryptMessage(spaceKey, mediaData.url);
    encryptedMediaUrl = encrypted;
  }
  if (mediaData?.thumbnailUrl) {
    const encrypted = await encryptMessage(spaceKey, mediaData.thumbnailUrl);
    encryptedThumbnailUrl = encrypted;
  }

  let encryptedReplyTo = null;
  if (replyTo) {
    const { ciphertext: replyContent, iv: replyIv } = await encryptMessage(spaceKey, replyTo.content);
    encryptedReplyTo = {
      messageId: replyTo.id,
      senderUsername: replyTo.sender || replyTo.senderUsername || 'Bilinmiyor',
      encryptedContent: replyContent,
      iv: replyIv,
    };
  }

  const messageData = {
    channelId: channelId || 'general',
    encryptedContent: ciphertext,
    iv,
    senderId: uid,
    senderUsername: username,
    type,
    timestamp: serverTimestamp(),
    // Medya
    encryptedMediaUrl,
    encryptedThumbnailUrl,
    mediaType: mediaData?.type || null,
    mediaSize: mediaData?.size || null,
    mediaName: mediaData?.name || null,
    mediaDuration: mediaData?.duration || null,
    mediaDimensions: mediaData?.dimensions || null,
    // Reply
    replyTo: encryptedReplyTo,
    // Ek alanlar (başlangıçta)
    isEdited: false,
    reactions: {}, // { "emoji": ["uid1", "uid2"] }
  };

  const ref = await addDoc(
    collection(db, 'spaces', spaceId, 'channels', channelId || 'general', 'messages'),
    messageData
  );

  return { id: ref.id, ...messageData };
}

// ── Mesaj Aksiyonları (Sil, Düzenle, Tepki) ──

export async function editMessage(spaceId, channelId, messageId, uid, newContent) {
  let spaceKey = await getSpaceKey(spaceId, uid);
  if (!spaceKey) throw new Error('Space anahtarı bulunamadı.');
  
  const { ciphertext, iv } = await encryptMessage(spaceKey, newContent);
  
  const msgRef = doc(db, 'spaces', spaceId, 'channels', channelId || 'general', 'messages', messageId);
  await updateDoc(msgRef, {
    encryptedContent: ciphertext,
    iv: iv,
    isEdited: true
  });
}

export async function deleteMessage(spaceId, channelId, messageId) {
  const msgRef = doc(db, 'spaces', spaceId, 'channels', channelId || 'general', 'messages', messageId);
  await deleteDoc(msgRef);
}

export async function toggleMessageReaction(spaceId, channelId, messageId, uid, emoji) {
  const msgRef = doc(db, 'spaces', spaceId, 'channels', channelId || 'general', 'messages', messageId);
  
  // Firestore işleminde transaction kullanarak race condition'ı engelliyoruz
  await runTransaction(db, async (transaction) => {
    const msgDoc = await transaction.get(msgRef);
    if (!msgDoc.exists()) return;
    
    const data = msgDoc.data();
    const reactions = data.reactions || {};
    const usersForEmoji = reactions[emoji] || [];
    
    if (usersForEmoji.includes(uid)) {
      reactions[emoji] = usersForEmoji.filter(id => id !== uid);
      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
    } else {
      reactions[emoji] = [...usersForEmoji, uid];
    }
    
    transaction.update(msgRef, { reactions });
  });
}

// ── Puan Sistemi ──

export async function updateMemberPoints(spaceId, uid, pointsToAdd) {
  const memberRef = doc(db, 'spaces', spaceId, 'members', uid);
  await updateDoc(memberRef, {
    points: increment(pointsToAdd) // Firestore increment kullanarak güvenli artırım
  });
}

/**
 * Şifreli mesajları dinle (real-time)
 * @returns {Function} unsubscribe fonksiyonu
 */
export function subscribeToMessages(spaceId, channelId, uid, onMessages) {
  const q = query(
    collection(db, 'spaces', spaceId, 'channels', channelId || 'general', 'messages'),
    orderBy('timestamp', 'asc'),
    limit(100)
  );

  return onSnapshot(q, async (snap) => {
    let spaceKey = await getSpaceKey(spaceId, uid);
    if (!spaceKey) return;

    const messages = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data();
        try {
          const content = await decryptMessage(spaceKey, data.encryptedContent, data.iv);
          
          let mediaUrl = null;
          let thumbnailUrl = null;
          
          if (data.encryptedMediaUrl) {
            mediaUrl = await decryptMessage(spaceKey, data.encryptedMediaUrl.ciphertext, data.encryptedMediaUrl.iv);
          }
          if (data.encryptedThumbnailUrl) {
            thumbnailUrl = await decryptMessage(spaceKey, data.encryptedThumbnailUrl.ciphertext, data.encryptedThumbnailUrl.iv);
          }

          let decryptedReplyTo = null;
          if (data.replyTo) {
            try {
              const replyContent = await decryptMessage(spaceKey, data.replyTo.encryptedContent, data.replyTo.iv);
              decryptedReplyTo = {
                id: data.replyTo.messageId,
                sender: data.replyTo.senderUsername,
                content: replyContent
              };
            } catch (err) {
              console.error('Yanıt mesajı çözülemedi', err);
            }
          }

          return {
            id: d.id,
            content,
            sender: data.senderUsername,
            senderId: data.senderId,
            own: data.senderId === uid,
            timestamp: data.timestamp?.toMillis() || Date.now(),
            type: data.type || 'text',
            mediaUrl,
            thumbnailUrl,
            mediaType: data.mediaType,
            mediaSize: data.mediaSize,
            mediaName: data.mediaName,
            mediaDuration: data.mediaDuration,
            mediaDimensions: data.mediaDimensions,
            isEdited: data.isEdited || false,
            reactions: data.reactions || {},
            replyTo: decryptedReplyTo,
          };
        } catch {
          return {
            id: d.id,
            content: '[Şifreli mesaj]',
            sender: data.senderUsername,
            senderId: data.senderId,
            own: data.senderId === uid,
            timestamp: data.timestamp?.toMillis() || Date.now(),
            type: 'text',
          };
        }
      })
    );

    onMessages(messages);
  });
}

/**
 * Üyeleri real-time dinle
 */
export function subscribeToMembers(spaceId, onMembers) {
  const q = collection(db, 'spaces', spaceId, 'members');
  return onSnapshot(q, (snap) => {
    const members = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    onMembers(members);
  });
}

// ────────────────────────────────────────────────────────────
// Firebase Storage — Medya yükleme
// ────────────────────────────────────────────────────────────

/**
 * Medya dosyasını Firebase Storage'a yükle
 */
export async function uploadMedia(spaceId, messageId, blob, path, onProgress) {
  const storageRef = ref(storage, `spaces/${spaceId}/media/${messageId}/${path}`);
  
  const uploadTask = uploadBytes(storageRef, blob);
  const snapshot = await uploadTask;
  const url = await getDownloadURL(snapshot.ref);
  return url;
}

/**
 * Kullanıcı avatarını yükle
 */
export async function uploadAvatar(uid, file) {
  const ext = file.name.split('.').pop() || 'png';
  const storageRef = ref(storage, `avatars/${uid}/profile.${ext}`);
  const uploadTask = uploadBytes(storageRef, file);
  const snapshot = await uploadTask;
  const url = await getDownloadURL(snapshot.ref);
  
  // Profil dökümanını güncelle
  await updateDoc(doc(db, 'users', uid), { photoURL: url });
  
  return url;
}

/**
 * Oda (Space) duvar kağıdını yükle
 */
export async function uploadSpaceWallpaper(spaceId, file) {
  const ext = file.name.split('.').pop() || 'png';
  const storageRef = ref(storage, `spaces/${spaceId}/wallpaper/bg.${ext}`);
  const uploadTask = uploadBytes(storageRef, file);
  const snapshot = await uploadTask;
  const url = await getDownloadURL(snapshot.ref);
  return url;
}

/**
 * Medyayı sil
 */
export async function deleteMedia(spaceId, messageId, path) {
  const storageRef = ref(storage, `spaces/${spaceId}/media/${messageId}/${path}`);
  await deleteObject(storageRef).catch(() => {});
}

// ────────────────────────────────────────────────────────────
// Yardımcılar
// ────────────────────────────────────────────────────────────

/**
 * Benzersiz 8 karakterlik oda kodu üretir
 */
function generateSpaceCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Space anahtarını Firestore'dan al ve çöz
 */
async function getAndDecryptSpaceKey(spaceId, uid, spaceData) {
  try {
    const encryptedKey = spaceData.encryptedKeys?.[uid];
    
    if (!encryptedKey) {
      if (spaceData.fallbackKey) {
        return await importSpaceKey(spaceData.fallbackKey);
      }
      return null;
    }

    const userKeyPair = await loadUserKeyPair(uid);
    if (!userKeyPair) return null;

    const myPublicKey = await getUserPublicKey(uid);
    const sharedKey = await deriveSharedKey(userKeyPair.privateKey, myPublicKey || userKeyPair.publicKey);
    return await decryptSpaceKey(encryptedKey, sharedKey);
  } catch {
    return null;
  }
}

/**
 * Space key'i bir kullanıcı için şifreleyip Firestore'a yaz
 * (Yeni üye katıldığında host bu fonksiyonu çağırır)
 */
export async function grantSpaceAccess(spaceId, hostUid, targetUid, spaceKey) {
  const targetPublicKey = await getUserPublicKey(targetUid);
  if (!targetPublicKey) throw new Error('Kullanıcı şifreleme anahtarı bulunamadı');

  const hostKeyPair = await loadUserKeyPair(hostUid);
  if (!hostKeyPair) throw new Error('Host şifreleme anahtarı bulunamadı');

  const sharedKey = await deriveSharedKey(hostKeyPair.privateKey, targetPublicKey);
  const encryptedKey = await encryptSpaceKey(spaceKey, sharedKey);

  await updateDoc(doc(db, 'spaces', spaceId), {
    [`encryptedKeys.${targetUid}`]: encryptedKey,
  });
}

/**
 * Space anahtarına erişim al (üye olarak)
 */
export async function getSpaceKey(spaceId, uid) {
  // Önce cache'e bak
  const cached = await getCachedSpaceKey(spaceId);
  if (cached) return cached;

  const spaceSnap = await getDoc(doc(db, 'spaces', spaceId));
  if (!spaceSnap.exists()) return null;

  const key = await getAndDecryptSpaceKey(spaceId, uid, spaceSnap.data());
  if (key) await cacheSpaceKey(spaceId, key);
  return key;
}
