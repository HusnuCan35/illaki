/**
 * E2E Encryption Library — Web Crypto API
 * 
 * Strateji: AES-256-GCM mesaj şifreleme + ECDH anahtar paylaşımı
 * 
 * Her space'in bir master AES anahtarı vardır.
 * Anahtar Firestore'da şifreli saklanır; sunucu plaintext asla görmez.
 */

// ────────────────────────────────────────────────────────────
// AES-GCM: Mesaj şifreleme/çözme
// ────────────────────────────────────────────────────────────

/**
 * Yeni bir AES-256-GCM anahtarı üretir (space başına bir kez)
 */
export async function generateSpaceKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * AES anahtarını Base64 string'e dışa aktarır
 */
export async function exportKey(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bufToBase64(raw);
}

/**
 * Base64 string'den AES anahtarını içe aktarır
 */
export async function importSpaceKey(keyB64) {
  const raw = base64ToBuf(keyB64);
  return crypto.subtle.importKey(
    'raw', raw,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Mesaj veya medya URL'sini şifreler
 * @returns {{ ciphertext: string, iv: string }}
 */
export async function encryptMessage(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  return {
    ciphertext: bufToBase64(cipherBuf),
    iv: bufToBase64(iv),
  };
}

/**
 * Şifreli mesajı çözer
 */
export async function decryptMessage(key, ciphertext, iv) {
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBuf(iv) },
      key,
      base64ToBuf(ciphertext)
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return '[Şifreli mesaj çözülemedi]';
  }
}

// ────────────────────────────────────────────────────────────
// ECDH: Anahtar paylaşımı (host → üyeye güvenli anahtar iletimi)
// ────────────────────────────────────────────────────────────

/**
 * ECDH anahtar çifti üretir (her kullanıcı için)
 * GÜVENLİK: extractable=false yapılarak private key'in dışarı sızması engellenir
 */
export async function generateKeyPair() {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false, // Private key NON-EXTRACTABLE (güvenlik için)
    ['deriveKey']
  );
}

/**
 * Public key'i JWK string'e dönüştür (Firestore'da saklamak için)
 */
export async function exportPublicKey(publicKey) {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  return JSON.stringify(jwk);
}

/**
 * JWK string'den public key'i içe aktar
 */
export async function importPublicKey(jwkStr) {
  const jwk = JSON.parse(jwkStr);
  return crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

/**
 * ECDH ile iki taraf arasında ortak AES anahtarı türetir
 */
export async function deriveSharedKey(myPrivateKey, theirPublicKey) {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Space anahtarını ECDH ortak anahtarıyla şifrele (Firestore'a yazmak için)
 */
export async function encryptSpaceKey(spaceKey, sharedKey) {
  const exportedSpaceKey = await exportKey(spaceKey);
  return encryptMessage(sharedKey, exportedSpaceKey);
}

/**
 * Firestore'dan alınan şifreli space anahtarını çöz
 */
export async function decryptSpaceKey(encryptedKeyData, sharedKey) {
  const { ciphertext, iv } = encryptedKeyData;
  const spaceKeyB64 = await decryptMessage(sharedKey, ciphertext, iv);
  return importSpaceKey(spaceKeyB64);
}

// ────────────────────────────────────────────────────────────
// IndexedDB: Kullanıcı anahtarlarını GÜVENLİ sakla (extractable: false)
// ────────────────────────────────────────────────────────────

const DB_NAME = 'illaki_keystore';
const STORE_NAME = 'keys';

function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function setIDB(key, val) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getIDB(key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
  });
}

const KEY_STORE_PREFIX = 'illaki_key_';

/**
 * Kullanıcının ECDH anahtar çiftini IndexedDB'ye güvenle kaydet
 * CryptoKey objeleri tarayıcı tarafından güvenli şekilde saklanır
 */
export async function saveUserKeyPair(uid, keyPair) {
  const pub = await exportPublicKey(keyPair.publicKey);
  
  // Public key'i localStorage'a koyabiliriz (Firestore senkronizasyonu vb. için kolaylık sağlar)
  localStorage.setItem(`${KEY_STORE_PREFIX}pub_${uid}`, pub);
  
  // Private key'i ASLA localStorage'a string olarak koyma! IndexedDB'ye native obje olarak atıyoruz
  await setIDB(`${KEY_STORE_PREFIX}priv_${uid}`, keyPair.privateKey);
  
  // Eskiden kalma güvensiz string private key varsa temizle
  localStorage.removeItem(`${KEY_STORE_PREFIX}priv_${uid}`);

  return { publicKey: pub, privateKey: keyPair.privateKey };
}

/**
 * Kullanıcının ECDH anahtar çiftini yükle
 */
export async function loadUserKeyPair(uid) {
  const pubString = localStorage.getItem(`${KEY_STORE_PREFIX}pub_${uid}`);
  const privateKey = await getIDB(`${KEY_STORE_PREFIX}priv_${uid}`);
  
  // Güvensiz localStorage'da unutulmuş anahtar varsa ondan okuyup güvenliye taşıyalım
  const legacyPrivString = localStorage.getItem(`${KEY_STORE_PREFIX}priv_${uid}`);
  
  if (!pubString && !privateKey && !legacyPrivString) return null;

  let finalPrivateKey = privateKey;

  // Migration (eski güvensiz string formatını IndexedDB native formatına dönüştür)
  if (!finalPrivateKey && legacyPrivString) {
    try {
      const jwk = JSON.parse(legacyPrivString);
      finalPrivateKey = await crypto.subtle.importKey(
        'jwk', jwk,
        { name: 'ECDH', namedCurve: 'P-256' },
        false, // Artık extract edilemesin!
        ['deriveKey']
      );
      // IndexedDB'ye güvenli kaydet
      await setIDB(`${KEY_STORE_PREFIX}priv_${uid}`, finalPrivateKey);
      // LocalStorage'dan sil (Güvenlik)
      localStorage.removeItem(`${KEY_STORE_PREFIX}priv_${uid}`);
    } catch (e) {
      console.error('Eski anahtar taşınamadı', e);
      return null;
    }
  }

  if (!finalPrivateKey || !pubString) return null;

  return {
    publicKey: await importPublicKey(pubString),
    privateKey: finalPrivateKey,
  };
}

/**
 * Space AES anahtarını localStorage'a kaydet (çözülmüş halde cache)
 */
export async function cacheSpaceKey(spaceId, key) {
  const exported = await exportKey(key);
  sessionStorage.setItem(`${KEY_STORE_PREFIX}space_${spaceId}`, exported);
}

/**
 * Space AES anahtarını sessionStorage'dan yükle
 */
export async function getCachedSpaceKey(spaceId) {
  const keyB64 = sessionStorage.getItem(`${KEY_STORE_PREFIX}space_${spaceId}`);
  if (!keyB64) return null;
  return importSpaceKey(keyB64);
}

// ────────────────────────────────────────────────────────────
// Yardımcı fonksiyonlar
// ────────────────────────────────────────────────────────────

function bufToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBuf(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
