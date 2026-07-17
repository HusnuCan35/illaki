import { useRef, useCallback, useEffect, useState } from 'react';
import { useUIStore, useIdentityStore } from '../stores';

/**
 * useVoice — HD WebRTC Sesli Görüşme
 *
 * Özellikler:
 * - Opus HD codec (48kHz, stereo)
 * - Gürültü bastırma (noiseSuppression)
 * - Eko iptali (echoCancellation)
 * - Otomatik kazanç kontrolü (autoGainControl)
 * - Web Audio API ile ses seviyesi tespiti (konuşma göstergesi)
 * - Çoklu katılımcı yönetimi
 */
export function useVoice(getPeer) {
  const localStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const callsRef = useRef({}); // { [peerId]: MediaConnection }
  const analysersRef = useRef({}); // { [peerId]: { analyser, dataArray } }

  const [isInVoice, setIsInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [voiceParticipants, setVoiceParticipants] = useState({}); // { [peerId]: { username, speaking, stream } }
  const [micPermission, setMicPermission] = useState('unknown'); // unknown | granted | denied

  const { addToast } = useUIStore();
  const { identity } = useIdentityStore();

  // ── HD Ses Akışı Al ────────────────────────────────────────────────────────
  const getLocalStream = useCallback(async () => {
    if (localStreamRef.current?.active) return localStreamRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // HD ses kısıtlamaları
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,        // mono — daha iyi Opus performansı
          latency: 0,
          // Yüksek kalite hint
          googEchoCancellation: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
          googAudioMirroring: false,
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
  }, []);

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

  // ── Ses Seviyesi Okuma (konuşma tespiti) ──────────────────────────────────
  const getSpeakingLevel = useCallback((peerId) => {
    const entry = analysersRef.current[peerId];
    if (!entry) return 0;
    entry.analyser.getByteFrequencyData(entry.dataArray);
    const avg = entry.dataArray.reduce((s, v) => s + v, 0) / entry.dataArray.length;
    return Math.min(100, avg * 2);
  }, []);

  // ── Ses Oynatıcı Oluştur ──────────────────────────────────────────────────
  const attachAudio = useCallback((stream, peerId) => {
    // Mevcut audio element varsa kaldır
    const old = document.getElementById(`audio-${peerId}`);
    if (old) old.remove();

    const audio = document.createElement('audio');
    audio.id = `audio-${peerId}`;
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.volume = isDeafened ? 0 : 1;
    // Ekrana eklemeden çal
    audio.style.display = 'none';
    document.body.appendChild(audio);

    createAnalyser(stream, peerId);
  }, [isDeafened]);

  // ── Gelen Aramayı Cevapla ──────────────────────────────────────────────────
  const answerCall = useCallback(async (call) => {
    try {
      const stream = await getLocalStream();
      call.answer(stream);

      call.on('stream', (remoteStream) => {
        attachAudio(remoteStream, call.peer);
        setVoiceParticipants(prev => ({
          ...prev,
          [call.peer]: { username: 'Bağlanan kullanıcı', speaking: false, stream: remoteStream },
        }));
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
  }, [getLocalStream, attachAudio]);

  // ── Gelen Arama Dinleyici ─────────────────────────────────────────────────
  useEffect(() => {
    const handleIncoming = (e) => {
      const { call } = e.detail;
      if (isInVoice) {
        answerCall(call);
      } else {
        // Sesli kanalda değilsek bildiri göster
        addToast({
          type: 'info',
          message: 'Sesli görüşme isteği var — ses kanalına katıl',
          duration: 8000,
        });
        // Otomatik cevapla (isteğe bağlı: sonradan accept/reject eklenebilir)
        answerCall(call);
      }
    };
    window.addEventListener('illaki:incoming-call', handleIncoming);
    return () => window.removeEventListener('illaki:incoming-call', handleIncoming);
  }, [isInVoice, answerCall]);

  // ── Ses Kanalına Katıl ────────────────────────────────────────────────────
  const joinVoice = useCallback(async (connectedPeerIds = []) => {
    try {
      const stream = await getLocalStream();
      const peer = getPeer();

      if (!peer) {
        addToast({ type: 'error', message: 'P2P bağlantısı yok' });
        return;
      }

      setIsInVoice(true);
      setVoiceParticipants(prev => ({
        ...prev,
        self: {
          username: identity?.username || 'Ben',
          speaking: false,
          stream,
          isSelf: true,
        },
      }));

      // Mevcut bağlı kullanıcılara arama yap
      for (const peerId of connectedPeerIds) {
        if (callsRef.current[peerId]) continue; // zaten aranıyor

        const call = peer.call(peerId, stream, {
          metadata: { username: identity?.username, avatarColor: identity?.avatarColor },
          // Opus codec tercih et
          sdpTransform: (sdp) => preferOpusHD(sdp),
        });

        call.on('stream', (remoteStream) => {
          attachAudio(remoteStream, peerId);
          setVoiceParticipants(prev => ({
            ...prev,
            [peerId]: {
              username: prev[peerId]?.username || 'Katılımcı',
              speaking: false,
              stream: remoteStream,
            },
          }));
        });

        call.on('close', () => {
          const el = document.getElementById(`audio-${peerId}`);
          if (el) el.remove();
          delete analysersRef.current[peerId];
          delete callsRef.current[peerId];
          setVoiceParticipants(prev => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
        });

        callsRef.current[peerId] = call;
      }

      addToast({ type: 'success', message: 'Ses kanalına katıldın 🎙️' });
      createAnalyser(stream, 'self');
    } catch (err) {
      setIsInVoice(false);
      console.error('[Voice] Ses kanalına katılınamadı:', err);
    }
  }, [getPeer, getLocalStream, identity, attachAudio, createAnalyser]);

  // ── Ses Kanalından Çık ────────────────────────────────────────────────────
  const leaveVoice = useCallback(() => {
    // Tüm aramaları kapat
    Object.values(callsRef.current).forEach(call => call.close());
    callsRef.current = {};

    // Yerel akışı durdur
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;

    // Tüm audio element'leri temizle
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
    addToast({ type: 'info', message: 'Ses kanalından ayrıldın' });
  }, []);

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
    voiceParticipants,
    micPermission,
    getSpeakingLevel,
    joinVoice,
    leaveVoice,
    toggleMute,
    toggleDeafen,
  };
}

// ── Opus HD SDP Dönüştürücü ───────────────────────────────────────────────────
// WebRTC SDP'de Opus codec'i ön plana çıkar ve HD parametreleri ekle
function preferOpusHD(sdp) {
  // Opus codec'i bul ve önce koy
  const opusPattern = /a=rtpmap:(\d+) opus\/48000\/2/;
  const match = sdp.match(opusPattern);
  if (!match) return sdp;

  const opusPayload = match[1];

  // Opus parametrelerini ekle: stereo, yüksek bitrate, DTX
  const fmtpLine = `a=fmtp:${opusPayload} minptime=10;useinbandfec=1;stereo=0;maxaveragebitrate=128000;cbr=0`;

  // Mevcut fmtp satırını değiştir ya da yeni ekle
  if (sdp.includes(`a=fmtp:${opusPayload}`)) {
    return sdp.replace(/a=fmtp:\d+ .*opus.*/i, fmtpLine);
  } else {
    return sdp.replace(opusPattern, opusPattern.source + '\r\n' + fmtpLine);
  }
}
