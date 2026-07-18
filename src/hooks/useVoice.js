import { useRef, useCallback, useEffect, useState } from 'react';
import { useUIStore, useIdentityStore, usePeerStore } from '../stores';
import { getSpaceOnlineMembers } from '../lib/firestore';

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

  // ── Ses Seviyesi Okuma ─────────────────────────────────────────────────────
  const getSpeakingLevel = useCallback((peerId) => {
    const entry = analysersRef.current[peerId];
    if (!entry) return 0;
    entry.analyser.getByteFrequencyData(entry.dataArray);
    const avg = entry.dataArray.reduce((s, v) => s + v, 0) / entry.dataArray.length;
    return Math.min(100, avg * 2);
  }, []);

  // ── Ses Oynatıcı Oluştur ───────────────────────────────────────────────────
  const attachAudio = useCallback((stream, peerId) => {
    const old = document.getElementById(`audio-${peerId}`);
    if (old) old.remove();

    const audio = document.createElement('audio');
    audio.id = `audio-${peerId}`;
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.volume = 1;
    audio.style.display = 'none';
    document.body.appendChild(audio);

    createAnalyser(stream, peerId);
  }, [createAnalyser]);

  // ── Kamera Aç/Kapat ───────────────────────────────────────────────────────
  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      // Kamerayı kapat
      if (localVideoRef.current) {
        localVideoRef.current.getTracks().forEach(t => t.stop());
        localVideoRef.current = null;
      }
      setIsCameraOn(false);
      setLocalVideoStream(null);

      // Mevcut call'lardan video track'i kaldır
      for (const call of Object.values(callsRef.current)) {
        try {
          const sender = call.peerConnection?.getSenders?.().find(s => s.track?.kind === 'video');
          if (sender) {
            call.peerConnection.removeTrack(sender);
          }
        } catch {}
      }

      // Katılımcılarda kendi video'sunu kaldır
      setVoiceParticipants(prev => ({
        ...prev,
        self: { ...prev.self, videoStream: null },
      }));

      addToast({ type: 'info', message: 'Kamera kapatıldı' });
    } else {
      // Kamerayı aç
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });

        localVideoRef.current = videoStream;
        setIsCameraOn(true);
        setLocalVideoStream(videoStream);

        // Kendi self katılımcısını güncelle
        setVoiceParticipants(prev => ({
          ...prev,
          self: { ...prev.self, videoStream },
        }));

        // Mevcut call'lara video track ekle (renegotiation)
        const videoTrack = videoStream.getVideoTracks()[0];
        for (const call of Object.values(callsRef.current)) {
          try {
            call.peerConnection?.addTrack(videoTrack, videoStream);
          } catch {}
        }

        addToast({ type: 'success', message: 'Kamera açıldı 📷' });
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          addToast({ type: 'error', message: 'Kamera izni reddedildi' });
        } else {
          addToast({ type: 'error', message: 'Kamera açılamadı: ' + err.message });
        }
      }
    }
  }, [isCameraOn, addToast]);

  // ── Gelen Aramayı Cevapla ──────────────────────────────────────────────────
  const answerCall = useCallback(async (call) => {
    try {
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

      call.on('stream', (remoteStream) => {
        // Ses track'lerini audio elementine yönlendir
        const audioTracks = remoteStream.getAudioTracks();
        if (audioTracks.length > 0) {
          const audioOnlyStream = new MediaStream(audioTracks);
          attachAudio(audioOnlyStream, call.peer);
        }

        // Video track'leri varsa katılımcı state'ini güncelle
        setVoiceParticipants(prev => {
          const existing = prev[call.peer] || {};
          const videoTracks = remoteStream.getVideoTracks();
          const videoStream = videoTracks.length > 0 ? new MediaStream(videoTracks) : existing.videoStream || null;

          // Username: call.metadata → peers store → mevcut → 'Katılımcı'
          const peersStore = usePeerStore.getState();
          const peerInfo = peersStore.peers[call.peer];
          const username = call.metadata?.username || peerInfo?.username || existing.username || 'Katılımcı';
          const avatarColor = call.metadata?.avatarColor || peerInfo?.avatarColor || existing.avatarColor;

          return {
            ...prev,
            [call.peer]: {
              ...existing,
              username,
              avatarColor,
              speaking: false,
              videoStream,
            },
          };
        });

        addToast({ type: 'info', message: 'Sesli görüşme bağlandı' });
      });

      call.on('close', () => {
        const el = document.getElementById(`audio-${call.peer}`);
        if (el) el.remove();
        delete analysersRef.current[call.peer];
        delete callsRef.current[call.peer];
        setVoiceParticipants(prev => {
          const next = { ...prev };
          delete next[call.peer];
          return next;
        });
      });

      callsRef.current[call.peer] = call;
    } catch (err) {
      console.error('[Voice] Gelen arama yanıtlanamadı:', err);
    }
  }, [getLocalStream, attachAudio, addToast]);

  // ── Gelen Arama Dinleyici ─────────────────────────────────────────────────
  useEffect(() => {
    const handleIncoming = (e) => {
      const { call } = e.detail;
      if (call.metadata?.type === 'screen') return; // ekran paylaşımı useScreenShare tarafından ele alınır
      if (isInVoice) {
        answerCall(call);
      } else {
        call.close();
      }
    };
    window.addEventListener('illaki:incoming-call', handleIncoming);
    return () => window.removeEventListener('illaki:incoming-call', handleIncoming);
  }, [isInVoice, answerCall]);

  // ── Ses Kanalına Katıl ────────────────────────────────────────────────────
  const joinVoice = useCallback(async (channelId, connectedPeerIds = []) => {
    try {
      const audioStream = await getLocalStream();
      const peer = getPeer();

      if (!peer) {
        addToast({ type: 'error', message: 'P2P bağlantısı yok' });
        return;
      }

      setIsInVoice(true);

      const { setVoiceChannelId } = usePeerStore.getState();
      setVoiceChannelId(channelId);
      if (broadcastVoiceStatus) broadcastVoiceStatus(channelId);

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

      // ── Firestore'dan diğer üyelerin peer ID'lerini al ──────────────────────
      // Bu sayede P2P bağlantısı olmayan ama aynı space'de olan kullanıcılar da bulunur
      const { activeSpaceId, spaces } = (await import('../stores')).useSpaceStore.getState();
      let allPeerIds = [...connectedPeerIds]; // P2P üzerinden bilinen peerlar

      if (activeSpaceId) {
        try {
          const { identity: ident } = useIdentityStore.getState();
          const members = await getSpaceOnlineMembers(activeSpaceId, ident?.uid);
          for (const member of members) {
            // Firestore'dan gelen peer ID'leri listeye ekle (tekrarı önle)
            if (member.peerId && !allPeerIds.includes(member.peerId)) {
              allPeerIds.push(member.peerId);
            }
          }
        } catch (err) {
          console.warn('[Voice] Firestore üye listesi alınamadı:', err);
        }
      }

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
          },
          sdpTransform: (sdp) => preferOpusHD(sdp),
        });

        call.on('stream', (remoteStream) => {
          const audioTracks = remoteStream.getAudioTracks();
          if (audioTracks.length > 0) {
            attachAudio(new MediaStream(audioTracks), pId);
          }
          setVoiceParticipants(prev => {
            const existing = prev[pId] || {};
            const videoTracks = remoteStream.getVideoTracks();
            const videoStream = videoTracks.length > 0 ? new MediaStream(videoTracks) : existing.videoStream || null;
            return {
              ...prev,
              [pId]: {
                ...existing,
                username: existing.username || 'Katılımcı',
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
      if (broadcastVoiceStatus) broadcastVoiceStatus(null);
      console.error('[Voice] Ses kanalına katılınamadı:', err);
    }
  }, [getPeer, getLocalStream, identity, attachAudio, createAnalyser, broadcastVoiceStatus, addToast]);

  // ── Ses Kanalından Çık ────────────────────────────────────────────────────
  const leaveVoice = useCallback(() => {
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
    if (broadcastVoiceStatus) broadcastVoiceStatus(null);

    addToast({ type: 'info', message: 'Ses kanalından ayrıldın' });
  }, [broadcastVoiceStatus, addToast]);

  // ── Mikrofon Sessiz/Açık ──────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsMuted(!track.enabled);
  }, []);

  // ── Kulaklık Sessiz/Açık ──────────────────────────────────────────────────
  const toggleDeafen = useCallback(() => {
    setIsDeafened(prev => {
      const next = !prev;
      Object.keys(callsRef.current).forEach(peerId => {
        const audio = document.getElementById(`audio-${peerId}`);
        if (audio) audio.volume = next ? 0 : 1;
      });
      return next;
    });
  }, []);

  // Cleanup and Kick handling
  useEffect(() => {
    const handleKicked = () => leaveVoice();
    window.addEventListener('illaki:kicked', handleKicked);

    return () => {
      leaveVoice();
      audioContextRef.current?.close();
      window.removeEventListener('illaki:kicked', handleKicked);
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
