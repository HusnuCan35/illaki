import { useState, useCallback, useRef, useEffect } from 'react';
import { useUIStore, useIdentityStore } from '../stores';

export function useScreenShare(getPeer) {
  const [isSharing, setIsSharing] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState(null);
  const [remoteSharer, setRemoteSharer] = useState(null);

  const localStreamRef = useRef(null);
  const screenCallsRef = useRef({}); // { [peerId]: MediaConnection }

  const { addToast } = useUIStore();
  const { identity } = useIdentityStore();

  const stopScreenShare = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    Object.values(screenCallsRef.current).forEach(call => call.close());
    screenCallsRef.current = {};
    setIsSharing(false);
    setLocalScreenStream(null);
  }, []);

  const startScreenShare = useCallback(async (connectedPeerIds = [], resolution = { w: 1920, h: 1080, fps: 30 }) => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: resolution.w, max: resolution.w },
          height: { ideal: resolution.h, max: resolution.h },
          frameRate: { ideal: resolution.fps, max: resolution.fps }
        },
        audio: false
      });

      // Stop sharing if user clicks "Stop sharing" on the browser bar
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      localStreamRef.current = stream;
      setLocalScreenStream(stream);
      setIsSharing(true);

      const peer = getPeer();
      if (!peer) return;

      // Call all connected peers with the screen stream
      for (const peerId of connectedPeerIds) {
        const call = peer.call(peerId, stream, {
          metadata: { 
            type: 'screen',
            username: identity?.username 
          }
        });

        call.on('close', () => {
          delete screenCallsRef.current[peerId];
        });
        
        call.on('error', (err) => console.error('Screen share call error:', err));

        screenCallsRef.current[peerId] = call;
      }
      
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
    call.answer(); // Answer without sending a stream back
    call.on('stream', (remoteStream) => {
      setRemoteScreenStream(remoteStream);
      setRemoteSharer(call.metadata?.username || 'Kullanıcı');
      addToast({ type: 'info', message: `${call.metadata?.username || 'Biri'} ekran paylaşıyor.` });
    });
    call.on('close', () => {
      setRemoteScreenStream(null);
      setRemoteSharer(null);
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
