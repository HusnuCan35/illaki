import { useEffect, useRef, useCallback } from 'react';
import { usePeerStore, useMessageStore, useSpaceStore, useUIStore, useIdentityStore } from '../stores';

/**
 * Peer ID formatı: "illaki-XXXXXXXX" (8 büyük harf/rakam)
 * Oda kodu = Peer ID'nin "illaki-" sonrasındaki kısmı.
 *
 * Akış:
 *  1. Uygulama açılır → initPeer() → random peer ID: "illaki-AB3K9PQM"
 *  2. Host oda oluşturur → kod = "AB3K9PQM" (mevcut peer ID'den)
 *  3. Katılan girer "AB3K9PQM" → peerIdFromCode("AB3K9PQM") = "illaki-AB3K9PQM" → direkt bağlanır
 *
 * Peer yeniden başlatılmaz — oda kodu ZATEN peer ID.
 */
export const generateReadablePeerId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ambiguous chars excluded
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return 'illaki-' + code;
};

/** Peer ID → oda kodu */
export const codeFromPeerId = (peerId) =>
  peerId ? peerId.replace(/^illaki-/, '') : '';

/** Oda kodu → peer ID */
export const peerIdFromCode = (code) =>
  code ? 'illaki-' + code.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';

// Legacy compat export
export const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 8; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
};

export function usePeer() {
  const peerRef       = useRef(null);
  const connectionsRef = useRef({});
  const identityRef   = useRef(null);

  const { peerId, setPeerId, setConnectionStatus, addPeer, removePeer, updatePeer } = usePeerStore();
  const { addMessage } = useMessageStore();
  const { addToast } = useUIStore();
  const { identity } = useIdentityStore();

  useEffect(() => { identityRef.current = identity; }, [identity]);

  // ── Gelen veri paketini işle ──────────────────────────────────────────────
  const handleIncomingData = useCallback((fromPeerId, data) => {
    if (!data?.type) return;
    switch (data.type) {
      case 'message': {
        // spaceId her iki tarafta da "space-CODE" formatında eşleşir
        addMessage(data.spaceId, { ...data.message, fromPeer: fromPeerId, received: true });
        const { activeSpaceId: curActive, incrementUnread } = useSpaceStore.getState();
        if (curActive !== data.spaceId) incrementUnread(data.spaceId);
        break;
      }
      case 'identity':
        updatePeer(fromPeerId, { username: data.username, avatarColor: data.avatarColor });
        break;
      case 'kick': {
        addToast({ type: 'error', message: 'Odadan atıldın.' });
        window.dispatchEvent(new CustomEvent('illaki:kicked')); // notify voice/screen hooks
        const { activeSpaceId, setActiveSpace, removeSpace } = useSpaceStore.getState();
        if (activeSpaceId === data.spaceId) {
          setActiveSpace(null);
        }
        removeSpace(data.spaceId);
        // Bağlantıyı kopar
        if (connectionsRef.current[fromPeerId]) {
          connectionsRef.current[fromPeerId].close();
          delete connectionsRef.current[fromPeerId];
        }
        usePeerStore.getState().removePeer(fromPeerId);
        break;
      }
      case 'space-update': {
        const { spaces, updateSpace } = useSpaceStore.getState();
        const sp = spaces.find(s => s.id === data.spaceId);
        if (sp) updateSpace(sp.id, { name: data.name });
        break;
      }
      case 'space-delete': {
        addToast({ type: 'error', message: 'Kanal host tarafından silindi.' });
        window.dispatchEvent(new CustomEvent('illaki:kicked')); // Stop voice/screen
        const { activeSpaceId, setActiveSpace, removeSpace } = useSpaceStore.getState();
        if (activeSpaceId === data.spaceId) {
          setActiveSpace(null);
        }
        removeSpace(data.spaceId);
        if (connectionsRef.current[fromPeerId]) {
          connectionsRef.current[fromPeerId].close();
          delete connectionsRef.current[fromPeerId];
        }
        usePeerStore.getState().removePeer(fromPeerId);
        break;
      }
      case 'space-info': {
        // Host uzak taraftaki space adını günceller
        const { spaces, updateSpace } = useSpaceStore.getState();
        const sp = spaces.find(s => s.code === data.code);
        if (sp) updateSpace(sp.id, { name: data.name });
        break;
      }
      case 'file-chunk':
        // dosya chunk'ları ChatArea tarafından ele alınır (event dispatch)
        window.dispatchEvent(new CustomEvent('illaki:file-chunk', { detail: data }));
        break;
      default: break;
    }
  }, []);

  // ── Gelen bağlantı ────────────────────────────────────────────────────────
  const handleIncomingConnection = useCallback((conn) => {
    conn.on('open', () => {
      connectionsRef.current[conn.peer] = conn;
      addPeer(conn.peer, {
        username: conn.metadata?.username || 'Anonim',
        avatarColor: conn.metadata?.avatarColor,
        status: 'online',
        spaceCode: conn.metadata?.spaceCode,
      });
      addToast({ type: 'success', message: `${conn.metadata?.username || 'Biri'} bağllandı` });
      // Kimliğimizi gönder
      conn.send({ type: 'identity', username: identityRef.current?.username, avatarColor: identityRef.current?.avatarColor });
      // Eğer hostuz, space bilgisini gönder ki joiner space adını güncellesin
      const { spaces } = useSpaceStore.getState();
      const hostSpace = spaces.find(s => s.isHost && s.code === conn.metadata?.spaceCode);
      if (hostSpace) {
        conn.send({ type: 'space-info', code: hostSpace.code, name: hostSpace.name });
      }
    });
    conn.on('data', (data) => handleIncomingData(conn.peer, data));
    conn.on('close', () => {
      delete connectionsRef.current[conn.peer];
      removePeer(conn.peer);
      addToast({ type: 'warning', message: 'Bir kullanıcı ayrıldı' });
    });
    conn.on('error', (err) => console.error('[Illaki] Bağlantı hatası:', err));
  }, [handleIncomingData]);

  // ── PeerJS başlat (sadece bir kez, peer ID sabittir) ─────────────────────
  const initPeer = useCallback(async () => {
    // Zaten başlatılmış ve çalışıyorsa tekrar başlatma
    if (peerRef.current && !peerRef.current.destroyed) {
      return peerRef.current;
    }

    const { Peer } = await import('peerjs');
    setConnectionStatus('connecting');

    const existingPeerId = usePeerStore.getState().peerId;
    const myPeerId = existingPeerId || generateReadablePeerId();

    const peer = new Peer(myPeerId, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
          { urls: 'stun:stun.relay.metered.ca:80' },
        ],
      },
      debug: 0,
    });

    peerRef.current = peer;

    peer.on('open', (id) => {
      setPeerId(id);
      setConnectionStatus('connected');
      console.log('[Illaki] Peer hazır, ID:', id);
    });

    peer.on('connection', handleIncomingConnection);

    peer.on('call', (call) => {
      window.dispatchEvent(new CustomEvent('illaki:incoming-call', { detail: { call } }));
    });

    peer.on('error', (err) => {
      console.error('[Illaki] Peer hatası:', err.type, err);
      if (err.type === 'unavailable-id') {
        // ID çakışması — yeniden dene
        peerRef.current = null;
        usePeerStore.getState().setPeerId(null);
        initPeer();
      } else if (err.type === 'peer-unavailable') {
        addToast({ type: 'error', message: 'Karşı taraf bulunamadı. Oda kodu doğru mu? Host çevrimiçi mi?' });
      } else if (err.type === 'network') {
        addToast({ type: 'error', message: 'Ağ hatası. İnternet bağlantını kontrol et.' });
      }
      setConnectionStatus('disconnected');
    });

    peer.on('disconnected', () => {
      setConnectionStatus('disconnected');
      setTimeout(() => { if (peer && !peer.destroyed) peer.reconnect(); }, 2000);
    });

    return peer;
  }, [handleIncomingConnection]);

  // ── Bir peer'e bağlan ─────────────────────────────────────────────────────
  const connectToPeer = useCallback((remoteCode, spaceId) => {
    return new Promise((resolve, reject) => {
      if (!peerRef.current || peerRef.current.destroyed) {
        return reject(new Error('Peer hazır değil'));
      }

      const remotePeerId = peerIdFromCode(remoteCode);
      if (remotePeerId === peerId) {
        return reject(new Error('Kendine bağlanamazsın'));
      }

      const conn = peerRef.current.connect(remotePeerId, {
        reliable: true,
        metadata: {
          username: identityRef.current?.username,
          avatarColor: identityRef.current?.avatarColor,
          spaceCode: remoteCode,
        },
      });

      // 12 saniye timeout
      const timeout = setTimeout(() => {
        reject(new Error('Bağlantı zaman aşımı — host çevrimiçi değil veya kod yanlış.'));
      }, 12000);

      conn.on('open', () => {
        clearTimeout(timeout);
        connectionsRef.current[conn.peer] = conn;
        addPeer(conn.peer, {
          username: 'Bağlanıyor...',
          status: 'online',
          spaceCode: remoteCode,
        });
        addToast({ type: 'success', message: 'Odaya bağlanıldı' });
        resolve(conn);
      });

      conn.on('data', (data) => handleIncomingData(conn.peer, data));
      conn.on('close', () => {
        clearTimeout(timeout);
        delete connectionsRef.current[conn.peer];
        removePeer(conn.peer);
      });
      conn.on('error', (err) => {
        clearTimeout(timeout);
        console.error('[Illaki] Bağlantı koptu:', err);
        reject(err);
      });
    });
  }, [peerId, handleIncomingData]);

  // ── Üyeyi tekmeleme (Kick) ────────────────────────────────────────────────
  const kickPeer = useCallback((targetPeerId, spaceId) => {
    const conn = connectionsRef.current[targetPeerId];
    if (conn) {
      conn.send({ type: 'kick', spaceId });
      setTimeout(() => {
        conn.close();
        delete connectionsRef.current[targetPeerId];
        removePeer(targetPeerId);
        addToast({ type: 'info', message: 'Kullanıcı odadan atıldı.' });
      }, 500); // 500ms bekle ki mesaj gitsin
    }
  }, []);

  // ── Mesaj gönder ──────────────────────────────────────────────────────────
  const sendMessage = useCallback((spaceId, content, type = 'text', fileData = null) => {
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      content,
      sender: identityRef.current?.username || 'Ben',
      senderId: identityRef.current?.id,
      timestamp: Date.now(),
      type,
      fileData,
    };
    Object.values(connectionsRef.current).forEach((conn) => {
      if (conn.open) conn.send({ type: 'message', spaceId, message });
    });
    addMessage(spaceId, { ...message, own: true });
    return message;
  }, []);

  const broadcastSpaceUpdate = useCallback((spaceId, newName) => {
    Object.values(connectionsRef.current).forEach((conn) => {
      if (conn.open) conn.send({ type: 'space-update', spaceId, name: newName });
    });
  }, []);

  const broadcastSpaceDelete = useCallback((spaceId) => {
    Object.values(connectionsRef.current).forEach((conn) => {
      if (conn.open) conn.send({ type: 'space-delete', spaceId });
    });
  }, []);

  const getPeer = useCallback(() => peerRef.current, []);

  useEffect(() => () => { peerRef.current?.destroy(); }, []);

  return { initPeer,    connectToPeer,
    sendMessage,
    getPeer: () => peerRef.current,
    kickPeer,
    broadcastSpaceUpdate,
    broadcastSpaceDelete,
  };
}
