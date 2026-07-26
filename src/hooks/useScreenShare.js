import { useState, useCallback, useRef, useEffect } from 'react';
import { useUIStore, useIdentityStore } from '../stores';
import { playStreamStart, playStreamStop } from '../lib/soundEffects';

export function useScreenShare(getPeer) {
  const [isSharing, setIsSharing] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState(null);
  const [remoteSharer, setRemoteSharer] = useState(null);

  const localStreamRef = useRef(null);
  const screenCallsRef = useRef({}); // { [peerId]: MediaConnection }
  const screenAudioCtxRef = useRef({}); // { [peer]: AudioContext }

  const { addToast } = useUIStore();
  const { identity } = useIdentityStore();

  const stopScreenShare = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    Object.values(screenCallsRef.current).forEach(call => call.close());
    screenCallsRef.current = {};
    // Ses context'lerini temizle
    Object.values(screenAudioCtxRef.current).forEach(ctx => { try { ctx.close(); } catch {} });
    screenAudioCtxRef.current = {};
    setIsSharing(false);
    setLocalScreenStream(null);
    playStreamStop();
  }, []);

  const startScreenShare = useCallback(async (connectedPeerIds = [], resolution = { w: 1920, h: 1080, fps: 30 }) => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: resolution.w, max: resolution.w },
          height: { ideal: resolution.h, max: resolution.h },
          frameRate: { ideal: resolution.fps, max: resolution.fps }
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          suppressLocalAudioPlayback: true,  // Lokal hoparlörden çalma → eko döngüsü önlenir
        }
      });

      stream.getVideoTracks()[0].onended = () => stopScreenShare();

      localStreamRef.current = stream;
      setLocalScreenStream(stream);
      setIsSharing(true);

      const peer = getPeer();
      if (!peer) return;

      for (const peerId of connectedPeerIds) {
        const call = peer.call(peerId, stream, {
          metadata: { type: 'screen', username: identity?.username }
        });
        call.on('close', () => { delete screenCallsRef.current[peerId]; });
        call.on('error', (err) => console.error('Screen share call error:', err));
        screenCallsRef.current[peerId] = call;
      }

      playStreamStart();
      addToast({ type: 'info', message: 'Ekran paylaşımı başlatıldı.' });
    } catch (err) {
      console.error('[ScreenShare] Error:', err);
      if (err.name !== 'NotAllowedError') {
        addToast({ type: 'error', message: 'Ekran paylaşılamadı: ' + err.message });
      }
    }
  }, [getPeer, identity, stopScreenShare]);

  // Answer incoming screen share calls
  const answerScreenCall = useCallback((call) => {
    call.answer();
    call.on('stream', (remoteStream) => {
      const audioTracks = remoteStream.getAudioTracks();
      if (audioTracks.length > 0) {
        // Eski audio context'i temizle
        if (screenAudioCtxRef.current[call.peer]) {
          try { screenAudioCtxRef.current[call.peer].close(); } catch {}
        }
        // Web Audio API ile çal: HTMLAudioElement'ten farklı olarak
        // AudioContext çıkışı mikrofon capture'ına yakalanmaz.
        const ctx = new AudioContext();
        screenAudioCtxRef.current[call.peer] = ctx;
        const source = ctx.createMediaStreamSource(new MediaStream(audioTracks));
        // Gain node: ses seviyesini kontrol et
        const gainNode = ctx.createGain();
        gainNode.gain.value = 1.0;
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        // Context'i resume et (autoplay policy)
        ctx.resume().catch(() => {});
      }

      setRemoteScreenStream(remoteStream);
      setRemoteSharer(call.metadata?.username || 'Kullanıcı');
      playStreamStart();
      addToast({ type: 'info', message: `${call.metadata?.username || 'Biri'} ekran paylaşıyor.` });
    });
    call.on('close', () => {
      // AudioContext'i kapat
      if (screenAudioCtxRef.current[call.peer]) {
        try { screenAudioCtxRef.current[call.peer].close(); } catch {}
        delete screenAudioCtxRef.current[call.peer];
      }
      setRemoteScreenStream(null);
      setRemoteSharer(null);
      playStreamStop();
    });
  }, [addToast]);



  // Listen for incoming calls and kick events
  useEffect(() => {
    const handleIncoming = (e) => {
      const { call } = e.detail;
      if (call.metadata?.type === 'screen') {
        answerScreenCall(call);
      }
    };
    const handleKicked = () => stopScreenShare();
    
    window.addEventListener('illaki:incoming-call', handleIncoming);
    window.addEventListener('illaki:kicked', handleKicked);
    
    return () => {
      window.removeEventListener('illaki:incoming-call', handleIncoming);
      window.removeEventListener('illaki:kicked', handleKicked);
    };
  }, [answerScreenCall, stopScreenShare]);

  return {
    isSharing,
    localScreenStream,
    remoteScreenStream,
    remoteSharer,
    startScreenShare,
    stopScreenShare
  };
}
