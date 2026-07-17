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
  where, getDocs, writeBatch,
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
  };

  await setDoc(doc(db, 'spaces', spaceId), spaceData);

  // Host'u member olarak ekle
  await setDoc(doc(db, 'spaces', spaceId, 'members', uid), {
    uid,
    username,
    role: 'host',
    joinedAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
    online: true,
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
 * Kullanıcının katıldığı ve host olduğu tüm space'leri getir
 */
export async function getUserSpaces(uid) {
  // Üye olduğu odalar
  const memberQuery = query(
    collection(db, 'spaces'),
    where(`members.${uid}`, '!=', null)
  );
  
  // Basitleştirilmiş: members alt koleksiyonunda ara
  // Tüm space'leri tara (üretimde index gerekir)
  const results = [];
  
  // Host olduğu odalar
  const hostQuery = query(
    collection(db, 'spaces'),
    where('hostUid', '==', uid)
  );
  const hostSnap = await getDocs(hostQuery);
  hostSnap.docs.forEach(d => results.push({ id: d.id, ...d.data(), isHost: true }));
  
  return results;
}

// ────────────────────────────────────────────────────────────
// Mesajlar
// ────────────────────────────────────────────────────────────

/**
 * E2E şifreli mesaj gönder
 */
export async function sendEncryptedMessage(spaceId, uid, username, content, type = 'text', mediaData = null) {
  let spaceKey = await getSpaceKey(spaceId, uid);
  if (!spaceKey) {
    // Anahtarı yeniden yükle
    throw new Error('Space anahtarı bulunamadı. Lütfen odayı yeniden açın.');
  }

  const { ciphertext, iv } = await encryptMessage(spaceKey, content);

  let encryptedMediaUrl = null;
  let encryptedThumbnailUrl = null;

  // Medya URL'si varsa onu da şifrele
  if (mediaData?.url) {
    const encrypted = await encryptMessage(spaceKey, mediaData.url);
    encryptedMediaUrl = encrypted;
  }
  if (mediaData?.thumbnailUrl) {
    const encrypted = await encryptMessage(spaceKey, mediaData.thumbnailUrl);
    encryptedThumbnailUrl = encrypted;
  }

  const messageData = {
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
  };

  const ref = await addDoc(
    collection(db, 'spaces', spaceId, 'messages'),
    messageData
  );

  return { id: ref.id, ...messageData };
}

/**
 * Şifreli mesajları dinle (real-time)
 * @returns {Function} unsubscribe fonksiyonu
 */
export function subscribeToMessages(spaceId, uid, onMessages) {
  const q = query(
    collection(db, 'spaces', spaceId, 'messages'),
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
    if (!encryptedKey) return null;

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
