import { useEffect, useRef, useCallback } from 'react';
import { usePeerStore, useMessageStore, useSpaceStore, useUIStore, useIdentityStore } from '../stores';
import { updateMemberPeerId, getSpaceOnlineMembers, kickMemberFromVoice } from '../lib/firestore';

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
  const spaces = useSpaceStore(s => s.spaces);

  // Peer ID'yi sunucularla (spaces) senkronize tut
  useEffect(() => {
    if (peerId && identity?.uid && spaces && spaces.length > 0) {
      spaces.forEach(space => {
        updateMemberPeerId(space.id, identity.uid, peerId).catch(() => {});
      });
    }
  }, [peerId, identity?.uid, spaces]);

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
        updatePeer(fromPeerId, { 
          username: data.username, 
          avatarColor: data.avatarColor,
          voiceChannelId: data.voiceChannelId
        });
        break;
      case 'voice-status':
        updatePeer(fromPeerId, { 
          voiceChannelId: data.channelId,
          isMuted: data.isMuted,
          isDeafened: data.isDeafened
        });
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
      case 'voice-kick': {
        addToast({ type: 'warning', message: 'Ses kanalından çıkarıldın.' });
        window.dispatchEvent(new CustomEvent('illaki:voice-kicked'));
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
      case 'peer-list': {
        // MESH NETWORK: Host'tan diğer üyelerin listesi geldi, onlara da bağlan
        data.peers.forEach(peerIdToConnect => {
          if (peerIdToConnect !== usePeerStore.getState().peerId && !connectionsRef.current[peerIdToConnect]) {
            const code = peerIdToConnect.replace(/^illaki-/, '');
            if (code) {
               if (peerRef.current && !peerRef.current.destroyed) {
                  const conn = peerRef.current.connect(peerIdToConnect, {
                    reliable: true,
                    metadata: {
                      username: identityRef.current?.username,
                      avatarColor: identityRef.current?.avatarColor,
                      spaceCode: data.spaceCode,
                    },
                  });
                  connectionsRef.current[peerIdToConnect] = conn;
                  const handleOpen = () => {
                    usePeerStore.getState().addPeer(conn.peer, {
                      username: 'Bağlanıyor...',
                      status: 'online',
                      spaceCode: data.spaceCode,
                    });
                    conn.send({ 
                      type: 'identity', 
                      username: identityRef.current?.username, 
                      avatarColor: identityRef.current?.avatarColor,
                      voiceChannelId: usePeerStore.getState().voiceChannelId
                    });
                  };
                  if (conn.open) handleOpen();
                  else conn.on('open', handleOpen);
                  conn.on('data', (d) => handleIncomingData(conn.peer, d));
                  conn.on('close', () => {
                    delete connectionsRef.current[conn.peer];
                    usePeerStore.getState().removePeer(conn.peer);
                  });
               }
            }
          }
        });
        break;
      }
      
      // Kanal bazlı P2P Mesajları
      case 'chat':
      case 'image':
      case 'video':
      case 'file': {
        addMessage(data.spaceId, data.channelId, {
          id: `p2p_${Date.now()}_${Math.random()}`,
          content: data.content,
          sender: data.senderUsername,
          senderId: data.senderId,
          own: false,
          timestamp: data.timestamp,
          type: data.type,
          mediaUrl: data.mediaUrl,
          mediaName: data.mediaName,
          mediaSize: data.mediaSize,
          thumbnailUrl: data.thumbnailUrl,
          mediaDuration: data.mediaDuration,
        });
        break;
      }
      default: break;
    }
  }, []);

  // ── Gelen bağlantı ────────────────────────────────────────────────────────
  const handleIncomingConnection = useCallback((conn) => {
    const handleOpen = () => {
      connectionsRef.current[conn.peer] = conn;
      addPeer(conn.peer, {
        username: conn.metadata?.username || 'Anonim',
        avatarColor: conn.metadata?.avatarColor,
        status: 'online',
        spaceCode: conn.metadata?.spaceCode,
      });
      addToast({ type: 'success', message: `${conn.metadata?.username || 'Biri'} bağlandı` });
      // Kimliğimizi gönder
      conn.send({ 
        type: 'identity', 
        username: identityRef.current?.username, 
        avatarColor: identityRef.current?.avatarColor,
        voiceChannelId: usePeerStore.getState().voiceChannelId
      });
      // Eğer hostuz, space bilgisini gönder ki joiner space adını güncellesin
      const { spaces } = useSpaceStore.getState();
      const hostSpace = spaces.find(s => s.isHost && s.code === conn.metadata?.spaceCode);
      if (hostSpace) {
        conn.send({ type: 'space-info', code: hostSpace.code, name: hostSpace.name });
        
        // MESH NETWORK: Yeni gelene, odadaki diğer kişileri söyle ki onlara da bağlansın
        const existingPeers = Object.keys(connectionsRef.current).filter(p => p !== conn.peer);
        if (existingPeers.length > 0) {
          conn.send({ type: 'peer-list', peers: existingPeers, spaceCode: hostSpace.code });
        }
      }
    };
    
    if (conn.open) handleOpen();
    else conn.on('open', handleOpen);
    
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
        console.warn('[Illaki] Peer bulunamadı (çevrimdışı olabilir):', err);
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

  // ── Tek bir peer'e bağlan ──────────────────────────────────────────────────
  const connectToSinglePeer = useCallback((targetPeerId, spaceCode) => {
    if (!peerRef.current || peerRef.current.destroyed) return;
    if (targetPeerId === peerRef.current.id) return;
    if (connectionsRef.current[targetPeerId]) return; // Zaten bağlı

    const conn = peerRef.current.connect(targetPeerId, {
      reliable: true,
      metadata: {
        username: identityRef.current?.username,
        avatarColor: identityRef.current?.avatarColor,
        spaceCode,
      },
    });

    const handleOpen = () => {
      connectionsRef.current[targetPeerId] = conn;
      addPeer(targetPeerId, {
        username: conn.metadata?.username || 'Üye',
        avatarColor: conn.metadata?.avatarColor,
        status: 'online',
        spaceCode,
      });
      addToast({ type: 'success', message: `${conn.metadata?.username || 'Biri'} bağlandı` });
      // Kimliğimizi ve ses durumumuzu gönder
      conn.send({ 
        type: 'identity', 
        username: identityRef.current?.username, 
        avatarColor: identityRef.current?.avatarColor,
        voiceChannelId: usePeerStore.getState().voiceChannelId
      });
    };

    if (conn.open) handleOpen();
    else conn.on('open', handleOpen);

    conn.on('data', (data) => handleIncomingData(conn.peer, data));
    conn.on('close', () => {
      delete connectionsRef.current[conn.peer];
      removePeer(conn.peer);
    });
    conn.on('error', (err) => {
      console.warn('[Illaki] P2P bağlantı hatası:', targetPeerId, err);
    });
  }, [handleIncomingData, addPeer, removePeer, addToast]);

  // ── Bir peer'e veya sunucudaki üyelere bağlan ─────────────────────────────
  const connectToPeer = useCallback(async (remoteCode, spaceId) => {
    if (!peerRef.current || peerRef.current.destroyed) return;

    const targetSpaceId = spaceId || (remoteCode ? `space_${remoteCode.toUpperCase()}` : null);

    // 1. Odadaki tüm online üyelerin peer ID'lerini Firestore'dan çek ve P2P bağlan
    if (targetSpaceId) {
      try {
        const members = await getSpaceOnlineMembers(targetSpaceId, identityRef.current?.uid);
        for (const member of members) {
          if (member.peerId && member.peerId !== peerRef.current.id) {
            connectToSinglePeer(member.peerId, remoteCode);
          }
        }
      } catch (err) {
        console.warn('[Illaki] Online üyelere bağlanılamadı:', err);
      }
    }

    // 2. İkincil yöntem: Kod doğrudan "illaki-" ile başlayan tam peer ID ise bağlan
    if (remoteCode && remoteCode.startsWith('illaki-')) {
      const directPeerId = remoteCode;
      if (directPeerId !== peerRef.current.id) {
        connectToSinglePeer(directPeerId, remoteCode);
      }
    }
  }, [connectToSinglePeer]);

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
  }, [addToast, removePeer]);

  const kickFromVoice = useCallback((targetPeerId, spaceId, targetUid) => {
    const conn = connectionsRef.current[targetPeerId];
    if (conn) {
      conn.send({ type: 'voice-kick' });
    }
    if (spaceId && (targetUid || targetPeerId)) {
      kickMemberFromVoice(spaceId, identityRef.current?.uid, targetUid || targetPeerId);
    }
    addToast({ type: 'info', message: 'Kullanıcı ses kanalından çıkarıldı.' });
  }, [addToast]);

  // ── Mesaj gönder ──────────────────────────────────────────────────────────
  const sendMessage = useCallback((spaceId, channelId, content, type = 'chat', mediaData = null) => {
    const { identity } = useIdentityStore.getState();
    const message = {
      type,
      channelId: channelId || 'general',
      content,
      senderId: identity.uid,
      senderUsername: identity.username,
      timestamp: Date.now(),
      ...mediaData
    };

    // Herkese gönder
    Object.values(connectionsRef.current).forEach((conn) => {
      if (conn.open) {
        conn.send(message);
      }
    });

    // Kendi ekranımızda göster
    addMessage(spaceId, channelId, {
      ...message,
      id: `local_${Date.now()}`,
      own: true,
      sender: identity.username,
    });
  }, [addMessage]);

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

  const broadcastVoiceStatus = useCallback((status) => {
    Object.values(connectionsRef.current).forEach((conn) => {
      if (conn.open) conn.send({ type: 'voice-status', ...status });
    });
  }, []);

  const getPeer = useCallback(() => peerRef.current, []);

  useEffect(() => () => { peerRef.current?.destroy(); }, []);

  return { initPeer,    connectToPeer,
    sendMessage,
    getPeer: () => peerRef.current,
    kickPeer,
    kickFromVoice,
    broadcastSpaceUpdate,
    broadcastSpaceDelete,
    broadcastVoiceStatus,
  };
}
