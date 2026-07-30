import { useEffect, useRef } from 'react';

export function useRingtone(isRinging) {
  const audioCtxRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (isRinging) {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      const playRing = () => {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') return;
        
        const playTone = (startTime, duration) => {
          try {
            const osc1 = audioCtxRef.current.createOscillator();
            const osc2 = audioCtxRef.current.createOscillator();
            const gain = audioCtxRef.current.createGain();
            
            osc1.type = 'sine';
            osc2.type = 'sine';
            // Classic ringtone frequencies
            osc1.frequency.setValueAtTime(440, startTime);
            osc2.frequency.setValueAtTime(480, startTime);
            
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.1, startTime + 0.05);
            gain.gain.setValueAtTime(0.1, startTime + duration - 0.05);
            gain.gain.linearRampToValueAtTime(0, startTime + duration);
            
            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(audioCtxRef.current.destination);
            
            osc1.start(startTime);
            osc2.start(startTime);
            osc1.stop(startTime + duration);
            osc2.stop(startTime + duration);
          } catch (e) {
            console.error('Audio play error', e);
          }
        };

        const now = audioCtxRef.current.currentTime;
        // Two short rings
        playTone(now, 0.4);
        playTone(now + 0.6, 0.4);
      };

      // Ensure audio context is resumed (browsers require user interaction, but since they clicked "Call" or are interacting with the app, it might work, or we try to resume)
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().then(() => {
          playRing();
          intervalRef.current = setInterval(playRing, 3000);
        }).catch(console.error);
      } else {
        playRing();
        intervalRef.current = setInterval(playRing, 3000);
      }
      
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    }
    
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, [isRinging]);
}
