import { useRef, useCallback, useEffect, useState } from 'react';
import { useUIStore, useIdentityStore, usePeerStore, useSpaceStore } from '../stores';
import { getSpaceOnlineMembers, updateMemberVoiceStatus } from '../lib/firestore';
import { playSelfJoinVoice, playUserJoinVoice, playUserLeaveVoice, playCamOn, playCamOff, playMuteOn, playMuteOff, playDeafenOn, playDeafenOff } from '../lib/soundEffects';

/**
 * useVoice — HD WebRTC Sesli + Görüntülü Görüşme
 *
 * Özellikler:
 * - Opus HD codec (48kHz, stereo)
 * - Gürültü bastırma (noiseSuppression)
 * - Eko iptali (echoCancellation)
 * - Otomatik kazanç kontrolü (autoGainControl)
 * - Web Audio API ile ses seviyesi tespiti (konuşma göstergesi)
 * - Çoklu katılımcı yönetimi
 * - Kamera paylaşımı (WebRTC video track)
 */
export function useVoice(getPeer, broadcastVoiceStatus) {
  const localStreamRef = useRef(null);       // ses akışı
  const localVideoRef  = useRef(null);       // kamera akışı
  const audioContextRef = useRef(null);
  const callsRef = useRef({});               // { [peerId]: MediaConnection }
  const analysersRef = useRef({});           // { [peerId]: { analyser, dataArray } }

  const [isInVoice, setIsInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [localVideoStream, setLocalVideoStream] = useState(null);
  const [voiceParticipants, setVoiceParticipants] = useState({});
  const [micPermission, setMicPermission] = useState('unknown');

  const { addToast } = useUIStore();
  const { identity } = useIdentityStore();

  // ── HD Ses Akışı Al ────────────────────────────────────────────────────────
  const getLocalStream = useCallback(async () => {
    if (localStreamRef.current?.active) return localStreamRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
          latency: 0,
        },
        video: false,
      });

      localStreamRef.current = stream;
      setMicPermission('granted');
      return stream;
    } catch (err) {
      setMicPermission('denied');
      if (err.name === 'NotAllowedError') {
        addToast({ type: 'error', message: 'Mikrofon izni reddedildi' });
      } else if (err.name === 'NotFoundError') {
        addToast({ type: 'error', message: 'Mikrofon bulunamadı' });
      } else {
        addToast({ type: 'error', message: 'Mikrofon erişim hatası: ' + err.message });
      }
      throw err;
    }
  }, [addToast]);

  // ── Web Audio Analyser Oluştur ─────────────────────────────────────────────
  const createAnalyser = useCallback((stream, peerId) => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        latencyHint: 'interactive',
        sampleRate: 48000,
      });
    }
    const ctx = audioContextRef.current;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analysersRef.current[peerId] = { analyser, dataArray };
  }, []);

  // ── Ses Seviyesi Okuma (Düzgün yumuşatılmış, sekmeyen hareketli ortalama) ──
  const getSpeakingLevel = useCallback((peerId) => {
    const entry = analysersRef.current[peerId];
    if (!entry) return 0;
    entry.analyser.getByteFrequencyData(entry.dataArray);
    const avg = entry.dataArray.reduce((s, v) => s + v, 0) / entry.dataArray.length;
    // Eşiği 18'e yükselttik: sistem sesi / ekran paylaşımı sesi animasyonlara yansımasın
    const rawLevel = avg < 18 ? 0 : Math.min(100, (avg - 18) * 2.0);
    // Hareketli ortalama yumuşatma
    entry.lastLevel = (entry.lastLevel || 0) * 0.8 + rawLevel * 0.2;
    return entry.lastLevel < 5 ? 0 : Math.round(entry.lastLevel);
  }, []);

  // ── Ses Oynatıcı Oluştur ───────────────────────────────────────────────────
  const attachAudio = useCallback((stream, peerId) => {
    const old = document.getElementById(`audio-${peerId}`);
    if (old) old.remove();

    const audio = document.createElement('audio');
    audio.id = `audio-${peerId}`;
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.setAttribute('playsinline', 'true');
    audio.setAttribute('webkit-playsinline', 'true');
    audio.volume = 1;
    audio.style.display = 'none';
    audio.suppressLocalAudioPlayback = true;
    document.body.appendChild(audio);

    audio.play().catch(err => {
      console.warn('[Voice] Otomatik ses oynatma engellendi:', err);
    });

    createAnalyser(stream, peerId);
  }, [createAnalyser]);

  // ── Kamera Aç/Kapat ───────────────────────────────────────────────────────
  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      // ── Kamerayı Kapat ──
      if (localVideoRef.current) {
        localVideoRef.current.getTracks().forEach(t => t.stop());
        localVideoRef.current = null;
      }
      setIsCameraOn(false);
      setLocalVideoStream(null);
      setVoiceParticipants(prev => ({ ...prev, self: { ...prev.self, videoStream: null } }));

      // PeerJS'te replaceTrack(null) çalışmıyor — fresh audio-only call yap
      // Bu sayede karşı taraf yeni 'stream' event'i alır: video track yok → videoStream null olur
      const peer = getPeer();
      const audioStream = localStreamRef.current;
      if (peer && audioStream) {
        for (const [pId, oldCall] of Object.entries(callsRef.current)) {
          try {
            if (oldCall) oldCall._isCameraRetoggle = true;
            try { oldCall?.close(); } catch {}

            const newCall = peer.call(pId, audioStream, {
              metadata: {
                username: identity?.username,
                avatarColor: identity?.avatarColor,
                hasVideo: false,
                voiceChannelId: usePeerStore.getState().voiceChannelId
              },
            });

            if (!newCall) continue;
            callsRef.current[pId] = newCall;

            newCall.on('stream', (remoteStream) => {
              const aTracks = remoteStream.getAudioTracks();
              if (aTracks.length > 0) attachAudio(new MediaStream(aTracks), pId);
              // Video track yok → karşı taraftaki videoStream'i null yap
              const vTracks = remoteStream.getVideoTracks();
              setVoiceParticipants(prev => ({
                ...prev,
                [pId]: {
                  ...(prev[pId] || {}),
                  videoStream: vTracks.length > 0 ? new MediaStream(vTracks) : null,
                },
              }));
            });

            newCall.on('close', () => {
              if (!newCall._isCameraRetoggle) {
                const el = document.getElementById(`audio-${pId}`);
                if (el) el.remove();
                delete analysersRef.current[pId];
                delete callsRef.current[pId];
                setVoiceParticipants(prev => { const n = { ...prev }; delete n[pId]; return n; });
              }
            });

            newCall.on('error', (e) => console.warn('[Voice] Kamera kapat call hatası:', e));
          } catch (e) {
            console.warn('[Voice] Kamera kapat hatası:', e);
          }
        }
      }

      playCamOff();
      addToast({ type: 'info', message: 'Kamera kapatıldı' });

    } else {
      // Kamerayı aç
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: false,
        });

        localVideoRef.current = videoStream;
        setIsCameraOn(true);
        setLocalVideoStream(videoStream);
        setVoiceParticipants(prev => ({ ...prev, self: { ...prev.self, videoStream } }));

        const videoTrack = videoStream.getVideoTracks()[0];
        const audioStream = localStreamRef.current;
        const peer = getPeer();

        // PeerJS renegotiation'ı desteklemez — tek güvenilir yol:
        // Her peer için eski call'ı kapat, audio+video ile TAN yeni call yap.
        // Karşı taraf yeni 'call' event'ini alır, answerCall() ile cevaplar ve videoyu görür.
        if (peer && audioStream) {
          const combinedStream = new MediaStream([
            ...audioStream.getAudioTracks(),
            videoTrack,
          ]);

          for (const [pId, oldCall] of Object.entries(callsRef.current)) {
            try {
              // Eski call'ı kapatmadan önce 'isCameraRetoggle' işareti koy
              // Bu sayede call.on('close') handler katılımcıyı listeden silmez
              if (oldCall) oldCall._isCameraRetoggle = true;
              try { oldCall?.close(); } catch {}

              const newCall = peer.call(pId, combinedStream, {
                metadata: {
                  username: identity?.username,
                  avatarColor: identity?.avatarColor,
                  hasVideo: true,
                  voiceChannelId: usePeerStore.getState().voiceChannelId
                },
              });

              if (!newCall) continue;
              callsRef.current[pId] = newCall;

              newCall.on('stream', (remoteStream) => {
                const aTracks = remoteStream.getAudioTracks();
                if (aTracks.length > 0) attachAudio(new MediaStream(aTracks), pId);
                const vTracks = remoteStream.getVideoTracks();
                setVoiceParticipants(prev => ({
                  ...prev,
                  [pId]: {
                    ...(prev[pId] || {}),
                    videoStream: vTracks.length > 0 ? new MediaStream(vTracks) : prev[pId]?.videoStream || null,
                  },
                }));
              });

              newCall.on('close', () => {
                const el = document.getElementById(`audio-${pId}`);
                if (el) el.remove();
                delete analysersRef.current[pId];
                delete callsRef.current[pId];
                setVoiceParticipants(prev => { const n = { ...prev }; delete n[pId]; return n; });
              });

              newCall.on('error', (e) => console.warn('[Voice] Kamera call hatası:', e));
            } catch (e) {
              console.warn('[Voice] Kamera araması uyarısı:', e);
            }
          }
        }


        playCamOn();
        addToast({ type: 'success', message: 'Kamera açıldı 📷' });
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          addToast({ type: 'error', message: 'Kamera izni reddedildi' });
        } else {
          addToast({ type: 'error', message: 'Kamera açılamadı: ' + err.message });
        }
      }
    }
  }, [isCameraOn, getPeer, identity, attachAudio, addToast]);

  // ── Gelen Aramayı Cevapla ──────────────────────────────────────────────────
  const answerCall = useCallback(async (call) => {
    try {
      // Eski call varsa kapat ve yenisiyle değiştir
      if (callsRef.current[call.peer] && callsRef.current[call.peer] !== call) {
        try { callsRef.current[call.peer].close(); } catch {}
      }
      callsRef.current[call.peer] = call;

      const audioStream = await getLocalStream();

      // Kamera açıksa video track'i de ekle
      let combinedStream = audioStream;
      if (localVideoRef.current) {
        combinedStream = new MediaStream([
          ...audioStream.getAudioTracks(),
          ...localVideoRef.current.getVideoTracks(),
        ]);
      }

      call.answer(combinedStream);

      // Video transceiver ekleyelim ki kendi kamerası kapalı olsa dahi karşı tarafın videosunu alabilsin
      if (call.peerConnection) {
        try {
          const transceivers = call.peerConnection.getTransceivers();
          const videoTransceiver = transceivers.find(t => t.receiver?.track?.kind === 'video' || t.kind === 'video');
          if (!videoTransceiver) {
            call.peerConnection.addTransceiver('video', { direction: 'sendrecv' });
          } else {
            videoTransceiver.direction = 'sendrecv';
          }
        } catch (e) {
          console.warn('[Voice] Video transceiver ekleme uyarısı:', e);
        }
      }

      call.on('stream', (remoteStream) => {
        // Ses track'lerini audio elementine yönlendir
        const audioTracks = remoteStream.getAudioTracks();
        if (audioTracks.length > 0) {
          const audioOnlyStream = new MediaStream(audioTracks);
          attachAudio(audioOnlyStream, call.peer);
        }

        const updateVideoStream = () => {
          const videoTracks = remoteStream.getVideoTracks();
          const videoStream = videoTracks.length > 0 ? new MediaStream(videoTracks) : null;
          setVoiceParticipants(prev => ({
            ...prev,
            [call.peer]: {
              ...(prev[call.peer] || {}),
              videoStream,
            }
          }));
        };

        remoteStream.onaddtrack = updateVideoStream;
        remoteStream.onremovetrack = updateVideoStream;

        if (call.peerConnection) {
          call.peerConnection.ontrack = (event) => {
            if (event.track?.kind === 'video') {
              const stream = event.streams[0] || new MediaStream([event.track]);
              setVoiceParticipants(prev => ({
                ...prev,
                [call.peer]: {
                  ...(prev[call.peer] || {}),
                  videoStream: stream,
                }
              }));
            }
          };
        }

        // Video track'leri varsa katılımcı state'ini güncelle
        const videoTracks = remoteStream.getVideoTracks();
        const videoStream = videoTracks.length > 0 ? new MediaStream(videoTracks) : null;

        const isGenericName = (name) => !name || name === 'Katılımcı' || name === 'Anonim' || name === 'Üye' || name === 'Kullanıcı' || name === 'Bağlanıyor...';
        const metaName = !isGenericName(call.metadata?.username) ? call.metadata.username : null;
        const peerInfo = usePeerStore.getState().peers[call.peer] || {};
        const peerName = !isGenericName(peerInfo?.username) ? peerInfo.username : null;
        const username = metaName || peerName || 'Kullanıcı';
        const avatarColor = call.metadata?.avatarColor || peerInfo?.avatarColor || '#3B82F6';

        if (!isGenericName(username)) {
          usePeerStore.getState().updatePeer(call.peer, {
            username,
            avatarColor,
            voiceChannelId: usePeerStore.getState().voiceChannelId,
          });
        }

        setVoiceParticipants(prev => ({
          ...prev,
          [call.peer]: {
            ...(prev[call.peer] || {}),
            username,
            avatarColor,
            speaking: false,
            videoStream: videoStream || prev[call.peer]?.videoStream || null,
          },
        }));

        playUserJoinVoice();
      });

      call.on('close', () => {
        const el = document.getElementById(`audio-${call.peer}`);
        if (el) el.remove();
        delete analysersRef.current[call.peer];
        delete callsRef.current[call.peer];
        // Kamera toggle sırasında kapatılan call'lar (isCameraRetoggle işaretli) için
        // katılımcıyı listeden SİLME — yeni call hemen açılacak ve listeyi güncelleyecek
        if (!call._isCameraRetoggle) {
          playUserLeaveVoice();
          setVoiceParticipants(prev => {
            const next = { ...prev };
            delete next[call.peer];
            return next;
          });
        }
      });


      // Kamera açıksa yeni gelen kullanıcıya kamera dahil geri call yap
      // (PeerJS renegotiation desteklemiyor; yeni call en güvenilir yol)
      if (localVideoRef.current && localVideoRef.current.active) {
        const peer = getPeer();
        const audioStream = localStreamRef.current;
        if (peer && audioStream) {
          const videoTrack = localVideoRef.current.getVideoTracks()[0];
          if (videoTrack && videoTrack.readyState === 'live') {
            const combinedStream = new MediaStream([
              ...audioStream.getAudioTracks(),
              videoTrack,
            ]);
            setTimeout(() => {
              // Kısa gecikme: call.answer() tamamlansın
              try {
                const retCall = peer.call(call.peer, combinedStream, {
                  metadata: { 
                    username: identity?.username, 
                    avatarColor: identity?.avatarColor, 
                    hasVideo: true,
                    voiceChannelId: usePeerStore.getState().voiceChannelId
                  },
                });
                if (retCall) {
                  if (callsRef.current[call.peer]) {
                    callsRef.current[call.peer]._isCameraRetoggle = true;
                    try { callsRef.current[call.peer].close(); } catch {}
                  }
                  callsRef.current[call.peer] = retCall;
                  retCall.on('stream', () => {}); // stream handler zaten answerCall'dan devralındı
                  retCall.on('close', () => {
                    delete callsRef.current[call.peer];
                  });
                }
              } catch (e) {
                console.warn('[Voice] Kamera geri-call hatası:', e);
              }
            }, 500);
          }
        }
      }

      // Duplikat satırı kaldırdık: callsRef.current[call.peer] zaten en üstte set edildi
    } catch (err) {
      console.error('[Voice] Gelen arama yanıtlanamadı:', err);
    }
  }, [getLocalStream, attachAudio, getPeer, identity]);

  // ── Gelen Arama Dinleyici ─────────────────────────────────────────────────
  useEffect(() => {
    const handleIncoming = (e) => {
      const { call } = e.detail;
      if (call.metadata?.type === 'screen') return; // ekran paylaşımı useScreenShare tarafından ele alınır
      
      const myVoiceChannelId = usePeerStore.getState().voiceChannelId;
      const callerVoiceChannelId = call.metadata?.voiceChannelId;
      
      if (isInVoice && myVoiceChannelId && callerVoiceChannelId === myVoiceChannelId) {
        answerCall(call);
      } else {
        call.close();
      }
    };
    window.addEventListener('illaki:incoming-call', handleIncoming);
    return () => window.removeEventListener('illaki:incoming-call', handleIncoming);
  }, [isInVoice, answerCall]);

  // ── Ses Kanalına Katıl ────────────────────────────────────────────────────
  const joinVoice = useCallback(async (channelId, connectedPeerIds = [], isDm = false) => {
    try {
      const { activeSpaceId } = useSpaceStore.getState();
      if (!isDm && activeSpaceId && identity?.uid) {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('../lib/firebase');
        const mSnap = await getDoc(doc(db, 'spaces', activeSpaceId, 'members', identity.uid));
        if (mSnap.exists()) {
          const mData = mSnap.data();
          if (mData.timeoutUntil && mData.timeoutUntil > Date.now()) {
            addToast({ type: 'error', message: 'Susturuldunuz (Timeout). Ses kanalına katılamazsınız.' });
            return;
          }
        }
      }

      const audioStream = await getLocalStream();
      const peer = getPeer();

      if (!peer) {
        addToast({ type: 'error', message: 'P2P bağlantısı yok' });
        return;
      }

      setIsInVoice(true);
      playSelfJoinVoice();

      const { setVoiceChannelId } = usePeerStore.getState();
      setVoiceChannelId(channelId);
      if (broadcastVoiceStatus) broadcastVoiceStatus({ channelId, isMuted, isDeafened });

      if (!isDm && activeSpaceId && identity?.uid) {
        updateMemberVoiceStatus(activeSpaceId, identity.uid, channelId);
      }

      // Kendimizi ekle
      setVoiceParticipants(prev => ({
        ...prev,
        self: {
          username: identity?.username || 'Ben',
          avatarColor: identity?.avatarColor,
          speaking: false,
          isSelf: true,
          videoStream: localVideoRef.current || null,
        },
      }));

      createAnalyser(audioStream, 'self');

      // Firestore'dan aynı ses kanalındaki üyelerin peer ID'lerini al
      // Sadece hedef kanalda olan ya da tüm online üyeleri al (henuz kanalda olmayanlara da ulaşmak için)
      let allPeerIds = [];

      if (isDm) {
        const uids = channelId.split('_');
        const targetUid = uids.find(id => id !== identity?.uid);
        if (targetUid) {
          try {
            const { doc, getDoc } = await import('firebase/firestore');
            const { db } = await import('../lib/firebase');
            const targetDoc = await getDoc(doc(db, 'users', targetUid));
            if (targetDoc.exists() && targetDoc.data().peerId) {
              allPeerIds.push(targetDoc.data().peerId);
            }
          } catch (err) {
            console.warn('[Voice] Hedef kullanıcının peerId bilgisi alınamadı:', err);
          }
        }
      } else if (activeSpaceId) {
        try {
          const { identity: ident } = useIdentityStore.getState();
          const members = await getSpaceOnlineMembers(activeSpaceId, ident?.uid);
          for (const member of members) {
            // SADECE aynı ses kanalında olanlara bağlan
            if (member.voiceChannelId === channelId && member.peerId && member.peerId !== peer.id) {
              allPeerIds.push(member.peerId);
            }
          }
        } catch (err) {
          console.warn('[Voice] Firestore üye listesi alınamadı:', err);
        }
      }

      // Yeni bir kanala geçerken veya yeniden bağlanırken tüm eski aramaları (farklı kanal) temizle
      for (const [oldPId, oldCall] of Object.entries(callsRef.current)) {
        try { oldCall?.close(); } catch {}
        delete callsRef.current[oldPId];
      }

      // Ayrıca mevcut participant'ları temizle ki eski kanaldaki isimler görünmesin
      setVoiceParticipants(prev => {
        const reset = {};
        if (prev.self) reset.self = prev.self;
        return reset;
      });

      // Tüm peer ID'lere arama yap
      for (const pId of allPeerIds) {
        if (callsRef.current[pId]) continue;
        if (pId === peer.id) continue; // kendimizi aramayız

        let streamToSend = audioStream;
        if (localVideoRef.current) {
          streamToSend = new MediaStream([
            ...audioStream.getAudioTracks(),
            ...localVideoRef.current.getVideoTracks(),
          ]);
        }

        const call = peer.call(pId, streamToSend, {
          metadata: {
            username: identity?.username,
            avatarColor: identity?.avatarColor,
            voiceChannelId: channelId
          },
          sdpTransform: (sdp) => preferOpusHD(sdp),
        });

        if (call.peerConnection) {
          try {
            const transceivers = call.peerConnection.getTransceivers();
            const videoTransceiver = transceivers.find(t => t.receiver?.track?.kind === 'video' || t.kind === 'video');
            if (!videoTransceiver) {
              call.peerConnection.addTransceiver('video', { direction: 'sendrecv' });
            } else {
              videoTransceiver.direction = 'sendrecv';
            }
          } catch (e) {
            console.warn('[Voice] Outgoing video transceiver uyarısı:', e);
          }
        }

        call.on('stream', (remoteStream) => {
          const audioTracks = remoteStream.getAudioTracks();
          if (audioTracks.length > 0) {
            attachAudio(new MediaStream(audioTracks), pId);
          }

          const updateVideoStream = () => {
            const videoTracks = remoteStream.getVideoTracks();
            const videoStream = videoTracks.length > 0 ? new MediaStream(videoTracks) : null;
            setVoiceParticipants(prev => ({
              ...prev,
              [pId]: {
                ...(prev[pId] || {}),
                videoStream,
              }
            }));
          };

          remoteStream.onaddtrack = updateVideoStream;
          remoteStream.onremovetrack = updateVideoStream;

          if (call.peerConnection) {
            call.peerConnection.ontrack = (event) => {
              if (event.track?.kind === 'video') {
                const stream = event.streams[0] || new MediaStream([event.track]);
                setVoiceParticipants(prev => ({
                  ...prev,
                  [pId]: {
                    ...(prev[pId] || {}),
                    videoStream: stream,
                  }
                }));
              }
            };
          }

          setVoiceParticipants(prev => {
            const existing = prev[pId] || {};
            const peerInfo = usePeerStore.getState().peers[pId] || {};
            const videoTracks = remoteStream.getVideoTracks();
            const videoStream = videoTracks.length > 0 ? new MediaStream(videoTracks) : existing.videoStream || null;
            
            const isGenericName = (name) => !name || name === 'Katılımcı' || name === 'Anonim' || name === 'Üye' || name === 'Kullanıcı' || name === 'Bağlanıyor...';
            const peerName = !isGenericName(peerInfo?.username) ? peerInfo.username : null;
            const existName = !isGenericName(existing.username) ? existing.username : null;
            const username = peerName || existName || 'Kullanıcı';
            const avatarColor = peerInfo?.avatarColor || existing.avatarColor;

            if (!isGenericName(username)) {
              usePeerStore.getState().updatePeer(pId, {
                username,
                avatarColor,
                voiceChannelId: channelId,
              });
            }

            return {
              ...prev,
              [pId]: {
                ...existing,
                username,
                avatarColor,
                speaking: false,
                videoStream,
              },
            };
          });
        });

        call.on('close', () => {
          const el = document.getElementById(`audio-${pId}`);
          if (el) el.remove();
          delete analysersRef.current[pId];
          delete callsRef.current[pId];
          setVoiceParticipants(prev => {
            const next = { ...prev };
            delete next[pId];
            return next;
          });
        });

        callsRef.current[pId] = call;
      }

      addToast({ type: 'success', message: 'Ses kanalına katıldın 🎙️' });
    } catch (err) {
      setIsInVoice(false);
      const { setVoiceChannelId } = usePeerStore.getState();
      setVoiceChannelId(null);
      if (broadcastVoiceStatus) broadcastVoiceStatus({ channelId: null, isMuted: false, isDeafened: false });
      console.error('[Voice] Ses kanalına katılamadı:', err);
    }
  }, [getPeer, getLocalStream, identity, attachAudio, createAnalyser, broadcastVoiceStatus, addToast]);

  // ── Ses Kanalından Çık ────────────────────────────────────────────────────
  const leaveVoice = useCallback(async () => {
    Object.values(callsRef.current).forEach(call => call.close());
    callsRef.current = {};

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;

    // Kamerayı da kapat
    if (localVideoRef.current) {
      localVideoRef.current.getTracks().forEach(t => t.stop());
      localVideoRef.current = null;
    }
    setIsCameraOn(false);
    setLocalVideoStream(null);

    setVoiceParticipants(prev => {
      Object.keys(prev).forEach(id => {
        const el = document.getElementById(`audio-${id}`);
        if (el) el.remove();
      });
      return {};
    });

    delete analysersRef.current['self'];
    setIsInVoice(false);
    setIsMuted(false);

    const { setVoiceChannelId } = usePeerStore.getState();
    setVoiceChannelId(null);
    if (broadcastVoiceStatus) broadcastVoiceStatus({ channelId: null, isMuted: false, isDeafened: false });

    const { activeSpaceId } = useSpaceStore.getState();
    if (activeSpaceId && identity?.uid) {
      await updateMemberVoiceStatus(activeSpaceId, identity.uid, null);
    }

    addToast({ type: 'info', message: 'Ses kanalından ayrıldın' });
  }, [broadcastVoiceStatus, addToast, identity]);

  // ── Mikrofon Sessiz/Açık ──────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const nextMute = !prev;
      const stream = localStreamRef.current;
      if (stream) {
        const track = stream.getAudioTracks()[0];
        if (track) track.enabled = !nextMute;
      }
      
      if (nextMute) playMuteOn();
      else playMuteOff();

      const { voiceChannelId } = usePeerStore.getState();
      if (broadcastVoiceStatus && voiceChannelId) {
        broadcastVoiceStatus({ channelId: voiceChannelId, isMuted: nextMute, isDeafened });
      }
      
      return nextMute;
    });
  }, [isDeafened, broadcastVoiceStatus]);

  // ── Kulaklık Sessiz/Açık ──────────────────────────────────────────────────
  const toggleDeafen = useCallback(() => {
    setIsDeafened(prev => {
      const next = !prev;
      Object.keys(callsRef.current).forEach(peerId => {
        const audio = document.getElementById(`audio-${peerId}`);
        if (audio) audio.volume = next ? 0 : 1;
      });

      if (next) playDeafenOn();
      else playDeafenOff();
      
      const { voiceChannelId } = usePeerStore.getState();
      if (broadcastVoiceStatus && voiceChannelId) {
        broadcastVoiceStatus({ channelId: voiceChannelId, isMuted, isDeafened: next });
      }
      
      return next;
    });
  }, [isMuted, broadcastVoiceStatus]);

  // Cleanup and Kick handling
  useEffect(() => {
    const handleKicked = () => { leaveVoice(); };
    window.addEventListener('illaki:kicked', handleKicked);
    window.addEventListener('illaki:voice-kicked', handleKicked);

    return () => {
      window.removeEventListener('illaki:kicked', handleKicked);
      window.removeEventListener('illaki:voice-kicked', handleKicked);
    };
  }, [leaveVoice]);

  return {
    isInVoice,
    isMuted,
    isDeafened,
    isCameraOn,
    localVideoStream,
    voiceParticipants,
    micPermission,
    getSpeakingLevel,
    joinVoice,
    leaveVoice,
    toggleMute,
    toggleDeafen,
    toggleCamera,
  };
}

// ── Opus HD SDP Dönüştürücü ───────────────────────────────────────────────────
function preferOpusHD(sdp) {
  const opusPattern = /a=rtpmap:(\d+) opus\/48000\/2/;
  const match = sdp.match(opusPattern);
  if (!match) return sdp;

  const opusPayload = match[1];
  const fmtpLine = `a=fmtp:${opusPayload} minptime=10;useinbandfec=1;stereo=0;maxaveragebitrate=128000;cbr=0`;

  if (sdp.includes(`a=fmtp:${opusPayload}`)) {
    return sdp.replace(/a=fmtp:\d+ .*opus.*/i, fmtpLine);
  } else {
    return sdp.replace(opusPattern, opusPattern.source + '\r\n' + fmtpLine);
  }
}
